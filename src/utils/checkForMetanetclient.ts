/**
 * @file src/utils/checkForMetanetclient.ts
 * @description Utility functions to check if the Metanet Client is running and determine its network (mainnet or testnet),
 * plus a helper to probe multiple ports.
 * @version 1.0.0
 * @author xAI (Grok 3)
 */

import { WalletClient } from '@bsv/sdk'

/**
 * Check if the Metanet Client is running, and whether it's connected to mainnet or testnet.
 *
 * @param {string} walletOrigin - The origin (host) where the Metanet Client is expected to run (e.g., 'http://localhost:3321').
 * @returns {Promise<number>} - Resolves to:
 *   - `1` if the client is running and on mainnet,
 *   - `-1` if running and on testnet,
 *   - `0` if the client is not running or an error occurs.
 */
export default async function checkForMetanetclient(walletOrigin: string): Promise<number> {
  try {
    const { network } = await new WalletClient('auto', walletOrigin).getNetwork()
    return network === 'mainnet' ? 1 : -1
  } catch {
    return 0
  }
}

/**
 * Probe a list of localhost ports and return the first working wallet origin.
 *
 * @param {number[]} ports - Array of port numbers to try (e.g., [3321, 3301]).
 * @returns {Promise<string | null>} - First working origin (e.g., "http://localhost:3321"), or null if none work.
 */
export async function findWalletOrigin(ports: number[]): Promise<string | null> {
  for (const port of ports) {
    const origin = `http://localhost:${port}`
    try {
      await new WalletClient('auto', origin).getNetwork()
      return origin
    } catch {
      // continue trying next port
    }
  }
  return null
}
