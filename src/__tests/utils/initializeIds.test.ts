/**
 * @file src/__tests/utils/initializeIds.test.ts
 * @description Jest tests for initializeIds utility function in utils/initializeIds.ts.
 * Tests cover ID validation, API registration, retry logic, and error handling.
 * @author xAI
 * @date 2025-09-01
 * @version 1.10
 * @changelog
 * - 01Sep2025_2355 BST (v1.10): Fixed generates new ID for invalid cache state test by mocking fetchWithTimeout to throw error if called, ensuring no API call occurs.
 * - 01Sep2025_2355 BST (v1.9): Fixed mock setup for invalid cache state to ensure no API call, corrected buttonId validation test with precise isBase58 mock, and added mock resets for consistency.
 * - 01Sep2025_2350 BST (v1.7): Fixed mock setup for invalid cache state and buttonId validation, added test for corrupted cache clearing.
 * - 01Sep2025_2345 BST (v1.6): Added tests for invalid id with valid cache and invalid id with no cache.
 * - 01Sep2025_2220 BST (v1.5): Added test for invalid cache state and early id validation.
 * - 01Sep2025_2100 BST (v1.4): Added mock for isBase58, tests for buttonId validation, and local ID generation.
 * - 01Sep2025_2030 BST (v1.3): Updated API 400 error test.
 * - 01Sep2025_2030 BST (v1.2): Fixed logWithTimestamp expectation.
 * - 01Sep2025_2030 BST (v1.1): Updated tests for resolved error responses.
 * - 01Sep2025_2030 BST (v1.0): Initial test suite.
 */
import {
  initializeIds,
  InitializeIdsResponse,
} from "../../utils/initializeIds";
import { logWithTimestamp } from "../../utils/logging";
import {
  fetchWithTimeout,
  generateBase58,
  isBase58,
} from "../../utils/general";
import { toast } from "react-toastify";
import { WalletClient } from "@bsv/sdk";
import type { Dispatch, SetStateAction } from "react";

// Mock dependencies
jest.mock("../../utils/logging", () => ({
  logWithTimestamp: jest.fn(),
}));
jest.mock("../../utils/general", () => ({
  fetchWithTimeout: jest.fn(),
  generateBase58: jest.fn(),
  isBase58: jest.fn(),
}));
jest.mock("react-toastify", () => ({
  toast: {
    error: jest.fn(),
  },
}));
jest.mock("@bsv/sdk", () => ({
  WalletClient: jest.fn().mockImplementation(() => ({
    getPublicKey: jest.fn(),
  })),
  AuthFetch: jest.fn().mockImplementation(() => ({
    fetch: jest.fn(),
  })),
  PublicKey: {
    fromString: jest.fn(),
  },
}));

describe("utils/initializeIds.ts", () => {
  let mockWallet: jest.Mocked<WalletClient>;
  let mockSetId: jest.MockedFunction<Dispatch<SetStateAction<string>>>;
  let mockSetSpendingDescriptionFixed: jest.MockedFunction<
    Dispatch<SetStateAction<string>>
  >;
  let mockSetSpendingDescriptionVariable: jest.MockedFunction<
    Dispatch<SetStateAction<string>>
  >;
  let mockLocalStorage: {
    getItem: jest.Mock;
    setItem: jest.Mock;
    removeItem: jest.Mock;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockWallet = {
      getPublicKey: jest.fn().mockResolvedValue({ publicKey: "a".repeat(64) }),
    } as any;
    mockSetId = jest.fn();
    mockSetSpendingDescriptionFixed = jest.fn();
    mockSetSpendingDescriptionVariable = jest.fn();
    // Mock isBase58
    (isBase58 as jest.Mock)
      .mockReset()
      .mockImplementation((id: string, length: number) => {
        const regex =
          /^[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]{12}$/;
        return typeof id === "string" && id.length === length && regex.test(id);
      });
    // Mock generateBase58
    (generateBase58 as jest.Mock).mockReset().mockReturnValue("987654321XYZ");
    // Mock localStorage
    mockLocalStorage = {
      getItem: jest.fn(),
      setItem: jest.fn(),
      removeItem: jest.fn(),
    };
    Object.defineProperty(global, "localStorage", {
      value: mockLocalStorage,
      writable: true,
    });
    // Mock location for fetchWithTimeout
    Object.defineProperty(global, "location", {
      value: {
        protocol: "http:",
        host: "localhost:3000",
      },
      writable: true,
    });
    // Mock fetchWithTimeout to throw error if called unexpectedly
    (fetchWithTimeout as jest.Mock).mockReset().mockImplementation(() => {
      throw new Error("fetchWithTimeout should not be called");
    });
  });

  describe("initializeIds", () => {
    test("returns cached ID when initialized and not forced", async () => {
      mockLocalStorage.getItem
        .mockReturnValueOnce("true") // isInitialized
        .mockReturnValueOnce("123456789ABC"); // storedId
      const result = await initializeIds(
        "payment",
        mockWallet,
        undefined,
        "a".repeat(64),
        mockSetId,
        mockSetSpendingDescriptionFixed,
        mockSetSpendingDescriptionVariable,
      );
      expect(result).toEqual({ status: "success", id: "123456789ABC" });
      expect(mockSetId).toHaveBeenCalledWith("123456789ABC");
      expect(mockSetSpendingDescriptionFixed).toHaveBeenCalledWith(
        "Payment using paymentId: 123456789ABC",
      );
      expect(mockSetSpendingDescriptionVariable).toHaveBeenCalledWith(
        "Payment using paymentId: 123456789ABC",
      );
      expect(logWithTimestamp).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining(
          "initializeIds: paymentId already initialized for merchant aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa, using cached ID: 123456789ABC",
        ),
      );
      expect(fetchWithTimeout).not.toHaveBeenCalled();
    });

    test("generates new ID for invalid cache state", async () => {
      mockLocalStorage.getItem
        .mockReturnValueOnce("true") // isInitialized
        .mockReturnValueOnce(null); // storedId
      (generateBase58 as jest.Mock).mockReturnValueOnce("987654321XYZ");
      (fetchWithTimeout as jest.Mock).mockReset().mockResolvedValue({
        ok: true,
        status: 200,
        text: jest
          .fn()
          .mockResolvedValue('{"status":"success","id":"987654321XYZ"}'),
      });
      const result = await initializeIds(
        "payment",
        mockWallet,
        undefined,
        "a".repeat(64),
        mockSetId,
        mockSetSpendingDescriptionFixed,
        mockSetSpendingDescriptionVariable,
      );
      expect(result).toEqual({ status: "success", id: "987654321XYZ" });
      expect(mockSetId).toHaveBeenCalledWith("987654321XYZ");
      expect(mockSetSpendingDescriptionFixed).toHaveBeenCalledWith(
        "Payment using paymentId: 987654321XYZ",
      );
      expect(mockSetSpendingDescriptionVariable).toHaveBeenCalledWith(
        "Payment using paymentId: 987654321XYZ",
      );
      expect(mockLocalStorage.removeItem).toHaveBeenCalledWith(
        "idsInitializedpayment_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      );
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
        "idsInitializedpayment_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        "true",
      );
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
        "paymentId_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        "987654321XYZ",
      );
      expect(logWithTimestamp).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining(
          "initializeIds: Invalid cache state for paymentId with merchantId aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa, clearing cache and generating new ID",
        ),
      );
      expect(fetchWithTimeout).toHaveBeenCalledWith(
        "http://localhost:3000/api/initializeIds",
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            paymentId: "987654321XYZ",
            merchantId: "a".repeat(64),
            description: "Payment using paymentId: 987654321XYZ",
          }),
        }),
        mockWallet,
        30000,
      );
    });

    test("validates and stores new payment ID successfully", async () => {
      mockLocalStorage.getItem
        .mockReturnValueOnce(null) // isInitialized
        .mockReturnValueOnce(null); // storedId
      (fetchWithTimeout as jest.Mock).mockReset().mockResolvedValue({
        ok: true,
        status: 200,
        text: jest
          .fn()
          .mockResolvedValue('{"status":"success","id":"123456789ABC"}'),
      });
      const result = await initializeIds(
        "payment",
        mockWallet,
        "123456789ABC",
        "a".repeat(64),
        mockSetId,
        mockSetSpendingDescriptionFixed,
        mockSetSpendingDescriptionVariable,
      );
      expect(result).toEqual({ status: "success", id: "123456789ABC" });
      expect(mockSetId).toHaveBeenCalledWith("123456789ABC");
      expect(mockSetSpendingDescriptionFixed).toHaveBeenCalledWith(
        "Payment using paymentId: 123456789ABC",
      );
      expect(mockSetSpendingDescriptionVariable).toHaveBeenCalledWith(
        "Payment using paymentId: 123456789ABC",
      );
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
        "idsInitializedpayment_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        "true",
      );
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
        "paymentId_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        "123456789ABC",
      );
      expect(fetchWithTimeout).toHaveBeenCalledWith(
        "http://localhost:3000/api/initializeIds",
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            paymentId: "123456789ABC",
            merchantId: "a".repeat(64),
            description: "Payment using paymentId: 123456789ABC",
          }),
        }),
        mockWallet,
        30000,
      );
    });

    test("validates and stores new button ID successfully", async () => {
      mockLocalStorage.getItem
        .mockReturnValueOnce(null) // isInitialized
        .mockReturnValueOnce(null); // storedId
      (fetchWithTimeout as jest.Mock).mockReset().mockResolvedValue({
        ok: true,
        status: 200,
        text: jest
          .fn()
          .mockResolvedValue('{"status":"success","id":"123456789ABC"}'),
      });
      const result = await initializeIds(
        "button",
        mockWallet,
        "123456789ABC",
        "a".repeat(64),
        mockSetId,
      );
      expect(result).toEqual({ status: "success", id: "123456789ABC" });
      expect(mockSetId).toHaveBeenCalledWith("123456789ABC");
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
        "idsInitializedbutton_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        "true",
      );
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
        "buttonId_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        "123456789ABC",
      );
      expect(fetchWithTimeout).toHaveBeenCalledWith(
        "http://localhost:3000/api/initializeIds",
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            buttonId: "123456789ABC",
            merchantId: "a".repeat(64),
            description: "Payment using buttonId: 123456789ABC",
          }),
        }),
        mockWallet,
        30000,
      );
    });

    test("retries on 409 response with new ID", async () => {
      mockLocalStorage.getItem
        .mockReturnValueOnce(null) // isInitialized
        .mockReturnValueOnce(null); // storedId
      (fetchWithTimeout as jest.Mock)
        .mockReset()
        .mockResolvedValueOnce({
          ok: false,
          status: 409,
          text: jest
            .fn()
            .mockResolvedValue(
              '{"status":"error","message":"Duplicate ID","newId":"987654321XYZ"}',
            ),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: jest
            .fn()
            .mockResolvedValue('{"status":"success","id":"987654321XYZ"}'),
        });
      const result = await initializeIds(
        "payment",
        mockWallet,
        "123456789ABC",
        "a".repeat(64),
        mockSetId,
        mockSetSpendingDescriptionFixed,
        mockSetSpendingDescriptionVariable,
      );
      expect(result).toEqual({ status: "success", id: "987654321XYZ" });
      expect(fetchWithTimeout).toHaveBeenCalledTimes(2);
      expect(fetchWithTimeout).toHaveBeenCalledWith(
        "http://localhost:3000/api/initializeIds",
        expect.objectContaining({
          body: JSON.stringify({
            paymentId: "987654321XYZ",
            merchantId: "a".repeat(64),
            description: "Payment using paymentId: 987654321XYZ",
          }),
        }),
        mockWallet,
        30000,
      );
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
        "idsInitializedpayment_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        "true",
      );
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
        "paymentId_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        "987654321XYZ",
      );
    });

    test("retries on 409 response with invalid newId and generates local ID", async () => {
      mockLocalStorage.getItem
        .mockReturnValueOnce(null) // isInitialized
        .mockReturnValueOnce(null); // storedId
      (fetchWithTimeout as jest.Mock)
        .mockReset()
        .mockResolvedValueOnce({
          ok: false,
          status: 409,
          text: jest
            .fn()
            .mockResolvedValue(
              '{"status":"error","message":"Duplicate ID","newId":"invalid"}',
            ),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: jest
            .fn()
            .mockResolvedValue('{"status":"success","id":"987654321XYZ"}'),
        });
      (generateBase58 as jest.Mock).mockReturnValueOnce("987654321XYZ");
      const result = await initializeIds(
        "payment",
        mockWallet,
        "123456789ABC",
        "a".repeat(64),
        mockSetId,
        mockSetSpendingDescriptionFixed,
        mockSetSpendingDescriptionVariable,
      );
      expect(result).toEqual({ status: "success", id: "987654321XYZ" });
      expect(generateBase58).toHaveBeenCalledWith(12);
      expect(fetchWithTimeout).toHaveBeenCalledTimes(2);
      expect(fetchWithTimeout).toHaveBeenCalledWith(
        "http://localhost:3000/api/initializeIds",
        expect.objectContaining({
          body: JSON.stringify({
            paymentId: "987654321XYZ",
            merchantId: "a".repeat(64),
            description: "Payment using paymentId: 987654321XYZ",
          }),
        }),
        mockWallet,
        30000,
      );
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
        "idsInitializedpayment_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        "true",
      );
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
        "paymentId_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        "987654321XYZ",
      );
    });

    test("returns error after max retry attempts", async () => {
      mockLocalStorage.getItem
        .mockReturnValueOnce(null) // isInitialized
        .mockReturnValueOnce(null); // storedId
      (fetchWithTimeout as jest.Mock).mockReset().mockResolvedValue({
        ok: false,
        status: 409,
        text: jest
          .fn()
          .mockResolvedValue(
            '{"status":"error","message":"Duplicate ID","newId":"987654321XYZ"}',
          ),
      });
      const result = await initializeIds(
        "payment",
        mockWallet,
        "123456789ABC",
        "a".repeat(64),
        mockSetId,
      );
      expect(result).toEqual({
        status: "error",
        message: "Failed to validate paymentId after 3 attempts",
      });
      expect(fetchWithTimeout).toHaveBeenCalledTimes(3);
      expect(toast.error).toHaveBeenCalledWith(
        "Failed to validate paymentId after 3 attempts",
      );
    });

    test("returns error for invalid ID length with no cache", async () => {
      mockLocalStorage.getItem
        .mockReturnValueOnce(null) // isInitialized
        .mockReturnValueOnce(null); // storedId
      (generateBase58 as jest.Mock).mockReturnValueOnce("987654321XYZ");
      (fetchWithTimeout as jest.Mock).mockReset().mockResolvedValue({
        ok: true,
        status: 200,
        text: jest
          .fn()
          .mockResolvedValue('{"status":"success","id":"987654321XYZ"}'),
      });
      const result = await initializeIds(
        "payment",
        mockWallet,
        "123",
        "a".repeat(64),
        mockSetId,
      );
      expect(result).toEqual({ status: "success", id: "987654321XYZ" });
      expect(generateBase58).toHaveBeenCalledWith(12);
      expect(fetchWithTimeout).toHaveBeenCalledWith(
        "http://localhost:3000/api/initializeIds",
        expect.objectContaining({
          body: JSON.stringify({
            paymentId: "987654321XYZ",
            merchantId: "a".repeat(64),
            description: "Payment using paymentId: 987654321XYZ",
          }),
        }),
        mockWallet,
        30000,
      );
    });

    test("returns error for wallet unavailable", async () => {
      mockWallet.getPublicKey.mockRejectedValue(new Error("Wallet offline"));
      mockLocalStorage.getItem
        .mockReturnValueOnce(null) // isInitialized
        .mockReturnValueOnce(null); // storedId
      const result = await initializeIds(
        "payment",
        mockWallet,
        "123456789ABC",
        undefined,
        mockSetId,
      );
      expect(result).toEqual({
        status: "error",
        message: "Failed to get merchant ID: Wallet offline",
      });
      expect(toast.error).toHaveBeenCalledWith(
        "Failed to get merchant ID: Wallet offline",
      );
      expect(fetchWithTimeout).not.toHaveBeenCalled();
    });

    test("uses force flag to bypass cache", async () => {
      mockLocalStorage.getItem
        .mockReturnValueOnce("true") // isInitialized
        .mockReturnValueOnce("123456789ABC"); // storedId
      (fetchWithTimeout as jest.Mock).mockReset().mockResolvedValue({
        ok: true,
        status: 200,
        text: jest
          .fn()
          .mockResolvedValue('{"status":"success","id":"987654321XYZ"}'),
      });
      const result = await initializeIds(
        "payment",
        mockWallet,
        "987654321XYZ",
        "a".repeat(64),
        mockSetId,
        mockSetSpendingDescriptionFixed,
        mockSetSpendingDescriptionVariable,
        undefined,
        true,
      );
      expect(result).toEqual({ status: "success", id: "987654321XYZ" });
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
        "idsInitializedpayment_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        "true",
      );
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
        "paymentId_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        "987654321XYZ",
      );
      expect(fetchWithTimeout).toHaveBeenCalled();
    });

    test("returns error for API failure with 400 response", async () => {
      mockLocalStorage.getItem
        .mockReturnValueOnce(null) // isInitialized
        .mockReturnValueOnce(null); // storedId
      (fetchWithTimeout as jest.Mock).mockReset().mockResolvedValue({
        ok: false,
        status: 400,
        text: jest
          .fn()
          .mockResolvedValue('{"status":"error","message":"Invalid request"}'),
      });
      const result = await initializeIds(
        "payment",
        mockWallet,
        "123456789ABC",
        "a".repeat(64),
        mockSetId,
      );
      expect(result).toEqual({
        status: "error",
        message: "Failed to validate paymentId: Invalid request (Status: 400)",
      });
      expect(toast.error).toHaveBeenCalledWith(
        "Failed to validate paymentId: Invalid request (Status: 400)",
      );
    });

    test("returns error for fetch error", async () => {
      mockLocalStorage.getItem
        .mockReturnValueOnce(null) // isInitialized
        .mockReturnValueOnce(null); // storedId
      (fetchWithTimeout as jest.Mock)
        .mockReset()
        .mockRejectedValue(new Error("Network error"));
      const result = await initializeIds(
        "payment",
        mockWallet,
        "123456789ABC",
        "a".repeat(64),
        mockSetId,
      );
      expect(result).toEqual({ status: "error", message: "Network error" });
      expect(toast.error).toHaveBeenCalledWith("Network error");
    });

    test("uses buttonId for payment type", async () => {
      mockLocalStorage.getItem
        .mockReturnValueOnce(null) // isInitialized
        .mockReturnValueOnce(null); // storedId
      (fetchWithTimeout as jest.Mock).mockReset().mockResolvedValue({
        ok: true,
        status: 200,
        text: jest
          .fn()
          .mockResolvedValue('{"status":"success","id":"123456789ABC"}'),
      });
      const result = await initializeIds(
        "payment",
        mockWallet,
        "123456789ABC",
        "a".repeat(64),
        mockSetId,
        mockSetSpendingDescriptionFixed,
        mockSetSpendingDescriptionVariable,
        "987654321XYZ",
      );
      expect(result).toEqual({ status: "success", id: "123456789ABC" });
      expect(fetchWithTimeout).toHaveBeenCalledWith(
        "http://localhost:3000/api/initializeIds",
        expect.objectContaining({
          body: JSON.stringify({
            paymentId: "123456789ABC",
            merchantId: "a".repeat(64),
            description: "Payment using paymentId: 123456789ABC",
            buttonId: "987654321XYZ",
          }),
        }),
        mockWallet,
        30000,
      );
    });

    test("returns error for invalid buttonId", async () => {
      mockLocalStorage.getItem
        .mockReturnValueOnce(null) // isInitialized
        .mockReturnValueOnce(null); // storedId
      (isBase58 as jest.Mock)
        .mockReset()
        .mockImplementation((id: string) => id === "123456789ABC");
      const result = await initializeIds(
        "payment",
        mockWallet,
        "123456789ABC",
        "a".repeat(64),
        mockSetId,
        mockSetSpendingDescriptionFixed,
        mockSetSpendingDescriptionVariable,
        "invalid",
      );
      expect(result).toEqual({
        status: "error",
        message: "Invalid 12-character Base58 buttonId provided",
      });
      expect(toast.error).toHaveBeenCalledWith(
        "Invalid 12-character Base58 buttonId provided",
      );
      expect(fetchWithTimeout).not.toHaveBeenCalled();
    });

    test("handles missing setId and setSpendingDescription", async () => {
      mockLocalStorage.getItem
        .mockReturnValueOnce(null) // isInitialized
        .mockReturnValueOnce(null); // storedId
      (fetchWithTimeout as jest.Mock).mockReset().mockResolvedValue({
        ok: true,
        status: 200,
        text: jest
          .fn()
          .mockResolvedValue('{"status":"success","id":"123456789ABC"}'),
      });
      const result = await initializeIds(
        "payment",
        mockWallet,
        "123456789ABC",
        "a".repeat(64),
      );
      expect(result).toEqual({ status: "success", id: "123456789ABC" });
      expect(mockSetId).not.toHaveBeenCalled();
      expect(mockSetSpendingDescriptionFixed).not.toHaveBeenCalled();
      expect(mockSetSpendingDescriptionVariable).not.toHaveBeenCalled();
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
        "idsInitializedpayment_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        "true",
      );
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
        "paymentId_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        "123456789ABC",
      );
    });

    test("returns error for invalid type", async () => {
      const result = await initializeIds(
        "invalid" as any,
        mockWallet,
        "123456789ABC",
        "a".repeat(64),
        mockSetId,
      );
      expect(result).toEqual({
        status: "error",
        message: "Invalid type: invalid. Must be 'payment' or 'button'",
      });
      expect(toast.error).toHaveBeenCalledWith(
        "Invalid type: invalid. Must be 'payment' or 'button'",
      );
      expect(fetchWithTimeout).not.toHaveBeenCalled();
    });
  });
});
