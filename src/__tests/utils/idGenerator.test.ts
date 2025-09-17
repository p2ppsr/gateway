/**
 * @file src/__tests/utils/idGenerator.test.ts
 * @description Jest tests for generateAndValidateUniqueId utility function in utils/idGenerator.ts.
 * Tests cover ID generation, validation, duplicate handling, description updates, and error cases.
 * @version 1.0.7 (Updated 02Sep2025_1210 BST to fix knex mock by removing invalid jest.mocked call)
 * @author xAI (Grok 3)
 * @dependencies
 * - @bsv/sdk: For WalletClient
 * - ../utils/logging: For logWithTimestamp
 * - ../utils/general: For generateBase58
 * - ../utils/merchant: For ensureMerchantExists
 * - knex: For database operations
 * @changelog
 * - 02Sep2025_1210 BST (v1.0.7): Fixed knex mock by removing invalid jest.mocked call, ensuring db.transaction is called correctly.
 */
import { Knex } from "knex";

// Mock dependencies
jest.mock("knex", () => {
  const mockKnex = {
    transaction: jest.fn(),
    fn: { now: jest.fn(() => "now") },
  };
  return {
    __esModule: true,
    default: jest.fn(() => mockKnex),
  };
});

jest.mock("../../utils/logging", () => ({
  logWithTimestamp: jest.fn(),
}));
jest.mock("../../utils/general", () => ({
  generateBase58: jest.fn(),
}));
jest.mock("../../utils/merchant", () => ({
  ensureMerchantExists: jest.fn(),
}));

import { generateAndValidateUniqueId } from "../../utils/idGenerator";
import { logWithTimestamp } from "../../utils/logging";
import { generateBase58 } from "../../utils/general";
import { ensureMerchantExists } from "../../utils/merchant";

describe("utils/idGenerator.ts", () => {
  let mockKnex: jest.Mocked<Knex>;
  let mockTrx: any;
  const merchantId = "a".repeat(64);
  const description = "Payment description";

  beforeEach(() => {
    jest.clearAllMocks();
    // Mock generateBase58
    (generateBase58 as jest.Mock).mockReset().mockReturnValue("123456789ABC");
    // Mock ensureMerchantExists
    (ensureMerchantExists as jest.Mock)
      .mockReset()
      .mockResolvedValue(undefined);
    // Mock Knex transaction
    mockTrx = {
      where: jest.fn().mockReturnThis(),
      first: jest.fn(),
      insert: jest.fn().mockResolvedValue(undefined),
      update: jest.fn().mockResolvedValue(undefined),
    };
    mockKnex = {
      transaction: jest.fn().mockImplementation(async (cb) => cb(mockTrx)),
      fn: { now: jest.fn(() => "now") },
    } as any;
    // Update mockKnex transaction mock
    jest
      .mocked(mockKnex.transaction)
      .mockImplementation(async (cb) => cb(mockTrx));
  });

  describe("generateAndValidateUniqueId", () => {
    test("generates and inserts unique ID successfully", async () => {
      mockTrx.first
        .mockResolvedValueOnce(undefined) // ids table
        .mockResolvedValueOnce(undefined); // payments table
      const result = await generateAndValidateUniqueId(
        merchantId,
        "payment",
        description,
      );
      expect(result).toEqual({ id: "123456789ABC", description });
      expect(ensureMerchantExists).toHaveBeenCalledWith(
        expect.anything(),
        merchantId,
      ); // db instance may differ
      expect(mockTrx.insert).toHaveBeenCalledWith({
        id: "123456789ABC",
        merchant_id: merchantId,
        type: "payment",
        timestamp: "now",
      });
      expect(logWithTimestamp).toHaveBeenCalledWith(
        expect.any(String),
        "✅ Unique ID generated and inserted:",
        expect.objectContaining({
          id: "123456789ABC",
          type: "payment",
          merchantId,
          finalDescription: description,
        }),
      );
      expect(mockTrx.where).toHaveBeenCalledTimes(2);
      expect(mockTrx.where).toHaveBeenCalledWith({
        id: "123456789ABC",
        type: "payment",
        merchant_id: merchantId,
      });
      expect(mockTrx.where).toHaveBeenCalledWith({
        payment_id: "123456789ABC",
      });
    });

    test("handles duplicate ID in ids table with retry", async () => {
      (generateBase58 as jest.Mock)
        .mockReturnValueOnce("123456789ABC")
        .mockReturnValueOnce("987654321XYZ");
      mockTrx.first
        .mockResolvedValueOnce({ id: "123456789ABC" }) // duplicate in ids
        .mockResolvedValueOnce(undefined) // no duplicate in payments
        .mockResolvedValueOnce(undefined) // new ID in ids
        .mockResolvedValueOnce(undefined); // new ID in payments
      const result = await generateAndValidateUniqueId(
        merchantId,
        "payment",
        description,
      );
      expect(result).toEqual({ id: "987654321XYZ", description });
      expect(generateBase58).toHaveBeenCalledTimes(2);
      expect(mockTrx.insert).toHaveBeenCalledWith({
        id: "987654321XYZ",
        merchant_id: merchantId,
        type: "payment",
        timestamp: "now",
      });
      expect(logWithTimestamp).toHaveBeenCalledWith(
        expect.any(String),
        "✅ Unique ID generated and inserted:",
        expect.objectContaining({
          id: "987654321XYZ",
          type: "payment",
          merchantId,
          finalDescription: description,
        }),
      );
      expect(mockTrx.where).toHaveBeenCalledTimes(4);
      expect(mockTrx.where).toHaveBeenCalledWith({
        id: "123456789ABC",
        type: "payment",
        merchant_id: merchantId,
      });
      expect(mockTrx.where).toHaveBeenCalledWith({
        id: "987654321XYZ",
        type: "payment",
        merchant_id: merchantId,
      });
    });

    test("handles duplicate ID in payments table with description update", async () => {
      (generateBase58 as jest.Mock)
        .mockReturnValueOnce("123456789ABC")
        .mockReturnValueOnce("987654321XYZ");
      mockTrx.first
        .mockResolvedValueOnce(undefined) // no duplicate in ids
        .mockResolvedValueOnce({ payment_id: "123456789ABC" }) // duplicate in payments
        .mockResolvedValueOnce(undefined) // new ID in ids
        .mockResolvedValueOnce(undefined); // new ID in payments
      const result = await generateAndValidateUniqueId(
        merchantId,
        "payment",
        "Payment with ID 123456789ABC",
        "123456789ABC",
      );
      expect(result).toEqual({
        id: "987654321XYZ",
        description: "Payment with ID 987654321XYZ",
      });
      expect(mockTrx.update).toHaveBeenCalledWith({
        description: "Payment with ID 987654321XYZ",
      });
      expect(mockTrx.insert).toHaveBeenCalledWith({
        id: "987654321XYZ",
        merchant_id: merchantId,
        type: "payment",
        timestamp: "now",
      });
      expect(logWithTimestamp).toHaveBeenCalledWith(
        expect.any(String),
        "✅ Updated payments description for duplicate:",
        expect.objectContaining({
          payment_id: "123456789ABC",
          finalDescription: "Payment with ID 987654321XYZ",
        }),
      );
      expect(mockTrx.where).toHaveBeenCalledTimes(4);
      expect(mockTrx.where).toHaveBeenCalledWith({
        payment_id: "123456789ABC",
      });
      expect(mockTrx.where).toHaveBeenCalledWith({
        id: "987654321XYZ",
        type: "payment",
        merchant_id: merchantId,
      });
    });

    test("throws error after max attempts for persistent duplicates", async () => {
      (generateBase58 as jest.Mock)
        .mockReturnValueOnce("123456789ABC")
        .mockReturnValueOnce("123456789ABC")
        .mockReturnValueOnce("123456789ABC")
        .mockReturnValueOnce("123456789ABC")
        .mockReturnValueOnce("123456789ABC");
      mockTrx.first
        .mockResolvedValueOnce({ id: "123456789ABC" }) // duplicate in ids
        .mockResolvedValueOnce(undefined) // no duplicate in payments
        .mockResolvedValueOnce({ id: "123456789ABC" }) // duplicate in ids
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce({ id: "123456789ABC" }) // duplicate in ids
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce({ id: "123456789ABC" }) // duplicate in ids
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce({ id: "123456789ABC" }) // duplicate in ids
        .mockResolvedValueOnce(undefined);
      await expect(
        generateAndValidateUniqueId(merchantId, "payment", description),
      ).rejects.toThrow(
        "Failed to generate unique payment ID after 5 attempts",
      );
      expect(generateBase58).toHaveBeenCalledTimes(5);
      expect(mockTrx.insert).not.toHaveBeenCalled();
      expect(logWithTimestamp).toHaveBeenCalledWith(
        expect.any(String),
        "🔍 Checking uniqueness:",
        expect.objectContaining({
          id: "123456789ABC",
          type: "payment",
          merchantId,
          attempt: expect.any(Number),
        }),
      );
    });

    test("throws error for invalid description (empty)", async () => {
      await expect(
        generateAndValidateUniqueId(merchantId, "payment", ""),
      ).rejects.toThrow(
        "Description is required and must not exceed 80 characters",
      );
      expect(ensureMerchantExists).not.toHaveBeenCalled();
      expect(mockTrx.insert).not.toHaveBeenCalled();
    });

    test("throws error for invalid description (too long)", async () => {
      const longDescription = "a".repeat(81);
      await expect(
        generateAndValidateUniqueId(merchantId, "payment", longDescription),
      ).rejects.toThrow(
        "Description is required and must not exceed 80 characters",
      );
      expect(ensureMerchantExists).not.toHaveBeenCalled();
      expect(mockTrx.insert).not.toHaveBeenCalled();
    });

    test("throws error for invalid description (non-string)", async () => {
      await expect(
        generateAndValidateUniqueId(merchantId, "payment", null as any),
      ).rejects.toThrow(
        "Description is required and must not exceed 80 characters",
      );
      expect(ensureMerchantExists).not.toHaveBeenCalled();
      expect(mockTrx.insert).not.toHaveBeenCalled();
    });

    test("replaces previousId in description for payment type", async () => {
      mockTrx.first
        .mockResolvedValueOnce(undefined) // ids table
        .mockResolvedValueOnce(undefined); // payments table
      const result = await generateAndValidateUniqueId(
        merchantId,
        "payment",
        "Payment with ID 123456789ABC",
        "123456789ABC",
      );
      expect(result).toEqual({
        id: "123456789ABC",
        description: "Payment with ID 123456789ABC",
      });
      expect(logWithTimestamp).toHaveBeenCalledWith(
        expect.any(String),
        "🔍 Replaced previous payment_id in description:",
        expect.objectContaining({
          oldId: "123456789ABC",
          newId: "123456789ABC",
          finalDescription: "Payment with ID 123456789ABC",
        }),
      );
      expect(mockTrx.insert).toHaveBeenCalledWith({
        id: "123456789ABC",
        merchant_id: merchantId,
        type: "payment",
        timestamp: "now",
      });
    });

    test("does not replace previousId for button type", async () => {
      mockTrx.first
        .mockResolvedValueOnce(undefined) // ids table
        .mockResolvedValueOnce(undefined); // payments table
      const result = await generateAndValidateUniqueId(
        merchantId,
        "button",
        "Payment with ID 123456789ABC",
        "123456789ABC",
      );
      expect(result).toEqual({
        id: "123456789ABC",
        description: "Payment with ID 123456789ABC",
      });
      expect(logWithTimestamp).not.toHaveBeenCalledWith(
        expect.any(String),
        "🔍 Replaced previous payment_id in description:",
        expect.any(Object),
      );
      expect(mockTrx.insert).toHaveBeenCalledWith({
        id: "123456789ABC",
        merchant_id: merchantId,
        type: "button",
        timestamp: "now",
      });
    });

    test("handles transaction rollback on error", async () => {
      (generateBase58 as jest.Mock).mockReturnValueOnce("123456789ABC");
      mockTrx.first
        .mockResolvedValueOnce(undefined) // ids table
        .mockResolvedValueOnce(undefined); // payments table
      mockTrx.insert.mockRejectedValueOnce(new Error("Database error"));
      await expect(
        generateAndValidateUniqueId(merchantId, "payment", description),
      ).rejects.toThrow("Database error");
      expect(mockTrx.insert).toHaveBeenCalledWith({
        id: "123456789ABC",
        merchant_id: merchantId,
        type: "payment",
        timestamp: "now",
      });
      expect(logWithTimestamp).toHaveBeenCalledWith(
        expect.any(String),
        "🔍 Checking uniqueness:",
        expect.objectContaining({
          id: "123456789ABC",
          type: "payment",
          merchantId,
          attempt: 1,
        }),
      );
    });
  });
});
