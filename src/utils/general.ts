/**
 * @file utils/general.ts
 * @description General utility functions for the Gateway application.
 * This module provides reusable functions for ID generation, formatting, timestamp conversion,
 * and HTTP request handling with timeout support.
 * @author [Your Name or Team] (optional, replace with actual author if known)
 * @date 2025-08-11
 * @version 1.6
 */

import { WalletClient, AuthFetch } from '@bsv/sdk'; // Import WalletClient for typing

/**
 * Generates a random Base58-encoded string of specified length.
 * @param n The number of characters in the output string (default: 12).
 * @returns A Base58-encoded string of length n.
 */
export function generateBase58(n: number = 12): string {
  const base58Alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let result = '';
  for (let i = 0; i < n; i++) {
    const randomIndex = crypto.getRandomValues(new Uint32Array(1))[0] % 58;
    result += base58Alphabet[randomIndex];
  }
  return result;
}

/**
 * Formats an ID (e.g., transaction_id or button_id) as 'first5...last5' with ellipses.
 * @param id The full ID string to format.
 * @returns Formatted string (e.g., "abcde...fghij") or the original string if too short.
 */
export function formatId(id: string): string {
  if (id.length < 10) return id; // Fallback for short IDs
  return `${id.slice(0, 5)}...${id.slice(-5)}`;
}

/**
 * Formats a timestamp string into a human-readable YYYY-MM-DD HH:MM:SS format.
 * @param dateStr The timestamp string (e.g., ISO string or Unix timestamp).
 * @returns Formatted date string or 'N/A' if invalid.
 */
export function formatTimestamp(dateStr: string | undefined): string {
  if (!dateStr) {
    return 'N/A';
  }
  try {
    const date = new Date(dateStr);
    return date.toISOString().replace('T', ' ').slice(0, 19);
  } catch (error) {
    return 'N/A';
  }
}

/**
 * Performs an HTTP fetch with a configurable timeout using the provided wallet for authentication.
 * @param url The URL to fetch.
 * @param options Fetch options including headers, method, and body.
 * @param wallet The WalletClient instance for authentication.
 * @param timeoutMs The timeout duration in milliseconds (default: 15000).
 * @returns A Promise resolving to the Response object.
 * @throws Error if the request times out or fails.
 */
export const fetchWithTimeout = async (
  url: string,
  options: { headers?: Record<string, string>; method?: string; body?: string },
  wallet: WalletClient,
  timeoutMs: number = 15000
): Promise<Response> => {
  const authFetch = new AuthFetch(wallet);
  const timeoutId = setTimeout(() => {
    throw new Error(`❌ Request timed out after ${timeoutMs}ms`);
  }, timeoutMs);
  try {
    const response = await authFetch.fetch(url, options);
    return response;
  } catch (err) {
    throw err; // Let the caller handle the error, including timeout
  } finally {
    clearTimeout(timeoutId);
  }
};