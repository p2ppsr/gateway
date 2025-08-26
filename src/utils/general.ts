/**
 * @file utils/general.ts
 * @description General utility functions for the Gateway application.
 * This module provides reusable functions for ID generation, formatting, timestamp conversion,
 * HTTP request handling with timeout support, and ID/merchant validation.
 * @author [Your Name]
 * @date 2025-08-17
 * @version 1.10
 * Change Log:
 * - 17Aug2025_1625 BST (v1.8): Renamed isIdMatch to getBase58Regex for clarity.
 * - 17Aug2025_1630 BST (v1.9): Added isBase58 function for boolean validation of 12-character Base58 IDs.
 * - 17Aug2025_1640 BST (v1.10): Added isMerchantId for 64-character hex merchant ID validation.
 */
import { WalletClient, AuthFetch, PublicKey } from '@bsv/sdk' // Import WalletClient for typing

/**
 * Generates a random Base58-encoded string of specified length.
 * @param n The number of characters in the output string (default: 12).
 * @returns A Base58-encoded string of length n.
 */
export function generateBase58(n: number = 12): string {
  const base58Alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
  let result = ''
  for (let i = 0; i < n; i++) {
    const randomIndex = crypto.getRandomValues(new Uint32Array(1))[0] % 58
    result += base58Alphabet[randomIndex]
  }
  return result
}

/**
 * Returns a regex for matching 12-character Base58-encoded IDs.
 * @returns A RegExp object matching 12-character Base58 strings.
 */
export function getBase58Regex(): RegExp {
  return /[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]{12}/g
}

/**
 * Checks if a string is a valid 12-character Base58-encoded ID.
 * @param id The string to validate.
 * @returns True if the string is a 12-character Base58 ID, false otherwise.
 */
export function isBase58(id: string): boolean {
  return /^[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]{12}$/.test(id)
}

export const isMerchantId = (value: string): boolean => {
  // Check for 64 or 66 characters
  if (![64, 66].includes(value.length)) {
    return false;
  }
  // Check for valid hex string
  const hexRegex = /^[0-9a-fA-F]+$/;
  if (!hexRegex.test(value)) {
    return false;
  }
  // If 66 characters, ensure it starts with '02' or '03' (compressed public key)
  if (value.length === 66 && !value.startsWith('02') && !value.startsWith('03')) {
    return false;
  }
  // Validate as secp256k1 public key
  try {
    PublicKey.fromString(value);
    return true;
  } catch {
    return false;
  }
};

/**
 * Formats an ID (e.g., transaction_id or button_id) as 'first5...last5' with ellipses.
 * @param id The full ID string to format.
 * @returns Formatted string (e.g., "abcde...fghij") or the original string if too short.
 */
export function formatId(id: string): string {
  if (id.length < 10) return id // Fallback for short IDs
  return `${id.slice(0, 5)}...${id.slice(-5)}`
}

/**
 * Formats a timestamp string into a human-readable format in the user's local timezone.
 * @param dateStr The timestamp string (e.g., ISO string or Unix timestamp) or null/undefined.
 * @returns Formatted date string (e.g., "26 Aug 2025 14:30:45") or 'N/A' if invalid.
 */
export function formatTimeLocal(dateStr: string | null | undefined): string {
  if (!dateStr) {
    return 'N/A';
  }
  try {
    const date = new Date(dateStr);
    return date.toLocaleString('en-GB', {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).replace(',', '');
  } catch (error) {
    return 'N/A';
  }
}

/**
 * Formats a timestamp string into a human-readable YYYY-MM-DD HH:MM:SS format (UTC).
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
 * @throws Error with detailed context if the request times out or fails.
 */
export const fetchWithTimeout = async (
  url: string,
  options: { headers?: Record<string, string>; method?: string; body?: string },
  wallet: WalletClient,
  timeoutMs: number = 15000
): Promise<Response> => {
  const authFetch = new AuthFetch(wallet);
  const timeoutId = setTimeout(() => {
    throw new Error(`❌ Request timed out after ${timeoutMs}ms for URL: ${url}`);
  }, timeoutMs);
  try {
    const response = await authFetch.fetch(url, options);
    if (!response.ok) {
      let errorDetail = '';
      try {
        errorDetail = await response.text();
      } catch (textError) {
        errorDetail = 'Failed to retrieve error details';
      }
      throw new Error(
        `Failed to fetch ${url} with method ${options.method || 'GET'}: Status ${response.status} ${response.statusText}, Details: ${errorDetail}`
      );
    }
    return response;
  } catch (err: any) {
    throw new Error(
      `Failed to fetch ${url} with method ${options.method || 'GET'}: ${err.message}${
        err.status ? `, Status: ${err.status}` : ''
      }`
    );
  } finally {
    clearTimeout(timeoutId);
  }
};

export const validateCSS = (css: string): boolean => {
  try {
    const rules = css
      .split('}')
      .map(rule => rule.trim())
      .filter(rule => rule.length > 0);
    for (const rule of rules) {
      const [selectorPart, propertiesPart] = rule.split('{').map(part => part.trim());
      if (!selectorPart || !propertiesPart) return false;
      const properties = propertiesPart
        .split(';')
        .map(prop => prop.trim())
        .filter(prop => prop.length > 0);
      for (const prop of properties) {
        const [key, value] = prop.split(':').map(part => part.trim());
        if (!key || !value) return false;
        // Allow hex colors of 3+ characters
        if (value.includes('#')) {
          const hexMatch = value.match(/#[0-9a-fA-F]{3,}/g);
          if (!hexMatch) return false;
        }
        // Check for balanced parentheses and valid linear-gradient syntax
        if (value.includes('(')) {
          const openCount = (value.match(/\(/g) || []).length;
          const closeCount = (value.match(/\)/g) || []).length;
          if (openCount !== closeCount) return false;
          if (value.includes('linear-gradient')) {
            // Ensure linear-gradient ends with ')' and has at least two colors
            if (!value.match(/linear-gradient\s*\([^)]*\)\s*$/)) return false;
            const colorMatches = value.match(/#[0-9a-fA-F]{3,}/g);
            if (!colorMatches || colorMatches.length < 2) return false;
          }
        }
      }
    }
    return true;
  } catch {
    return false;
  }
};

export const extractCSS = (input: string): string => {
  const match = input.match(/<style>([\s\S]*?)<\/style>/);
  return match ? match[1].trim() : input.trim();
};

export const sanitizeInput = (input: string): string => {
  return input.replace(/[<>]/g, '');
};
