/**
 * @file src/__tests/utils/checkForMetanetclient.test.ts
 * @description Jest tests for checkForMetanetclient function in utils/checkForMetanetclient.ts.
 * Tests cover checking Metanet Client status and network (mainnet, testnet, or error).
 * @version 1.0.0 (Created 02Sep2025_1921 BST)
 * @author xAI (Grok 3)
 * @dependencies
 * - @bsv/sdk: For WalletClient
 * @changelog
 * - 02Sep2025_1921 BST (v1.0.0): Created tests for checkForMetanetclient function.
 */
import checkForMetanetclient from "../../utils/checkForMetanetclient";
import { WalletClient } from "@bsv/sdk";

// Mock dependencies
jest.mock("@bsv/sdk", () => ({
  WalletClient: jest.fn(),
}));

describe("utils/checkForMetanetclient.ts", () => {
  let mockGetNetwork: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetNetwork = jest.fn();
    (WalletClient as jest.Mock).mockImplementation(() => ({
      getNetwork: mockGetNetwork,
    }));
  });

  test("returns 1 when client is running on mainnet", async () => {
    mockGetNetwork.mockResolvedValue({ network: "mainnet" });
    const result = await checkForMetanetclient("http://localhost:4000");

    expect(WalletClient).toHaveBeenCalledWith("auto", "http://localhost:4000");
    expect(mockGetNetwork).toHaveBeenCalled();
    expect(result).toBe(1);
  });

  test("returns -1 when client is running on testnet", async () => {
    mockGetNetwork.mockResolvedValue({ network: "testnet" });
    const result = await checkForMetanetclient("http://localhost:4000");

    expect(WalletClient).toHaveBeenCalledWith("auto", "http://localhost:4000");
    expect(mockGetNetwork).toHaveBeenCalled();
    expect(result).toBe(-1);
  });

  test("returns 0 when client is not running or errors occur", async () => {
    mockGetNetwork.mockRejectedValue(new Error("Connection failed"));
    const result = await checkForMetanetclient("http://localhost:4000");

    expect(WalletClient).toHaveBeenCalledWith("auto", "http://localhost:4000");
    expect(mockGetNetwork).toHaveBeenCalled();
    expect(result).toBe(0);
  });
});
