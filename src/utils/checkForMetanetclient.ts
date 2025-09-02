/**
 * @file src/utils/checkForMetanetclient.ts
 * @description Utility function to check if the Metanet Client is running and determine its network (mainnet or testnet) using WalletClient.
 * @version 1.0.0 (Updated 02Sep2025_1919 BST to standardize header comment)
 * @author xAI (Grok 3)
 * @dependencies
 * - @bsv/sdk: For WalletClient
 * @changelog
 * - 02Sep2025_1919 BST (v1.0.0): Updated header comment to follow standardized template.
 */
import { WalletClient } from '@bsv/sdk'

/**
 * Check if the Metanet Client is running, and whether it's connected to mainnet or testnet.
 *
 * @param {string} walletOrigin - The origin (host) where the Metanet Client is expected to run (e.g., 'http://localhost:4000').
 * @returns {Promise<number>} - Resolves to:
 *   - `1` if the client is running and on mainnet,
 *   - `-1` if running and on testnet,
 *   - `0` if the client is not running or an error occurs.
 */
export default async (walletOrigin: string): Promise<number> => {
  try {
    const { network } = await new WalletClient('auto', walletOrigin).getNetwork()
    if (network === 'mainnet') {
      return 1
    } else {
      return -1
    }
  } catch (error) {
    return 0
  }
}
