/**
 * @file utils/general.ts
 * @description General utility functions for the Gateway application.
 * This module provides reusable functions for ID generation, formatting, timestamp conversion,
 * HTTP request handling with timeout support, and ID/merchant validation.
 * @author [Your Name]
 * @date 2025-09-01
 * @version 1.11
 * Change Log:
 * - 01Sep2025_0130 BST (v1.11): Updated formatId to handle derivation_prefix and derivation_suffix; added generateRandomHex for derivation_suffix.
 * - 17Aug2025_1625 BST (v1.8): Renamed isIdMatch to getBase58Regex for clarity.
 * - 17Aug2025_1630 BST (v1.9): Added isBase58 function for boolean validation of 12-character Base58 IDs.
 * - 17Aug2025_1640 BST (v1.10): Added isMerchantId for 64-character hex merchant ID validation.
 */
import { WalletClient, AuthFetch, PublicKey } from '@bsv/sdk'

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
 * Generates a random hex string of specified length.
 * @param length The number of characters in the output string (default: 12).
 * @returns A random hex string (e.g., 'a1b2c3d4e5f6').
 */
export function generateRandomHex(length: number = 12): string {
  const hexChars = '0123456789abcdef'
  let result = ''
  for (let i = 0; i < length; i++) {
    const randomIndex = crypto.getRandomValues(new Uint32Array(1))[0] % 16
    result += hexChars[randomIndex]
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

/**
 * Validates a merchant ID as a 64 or 66-character hex string or compressed public key.
 * @param value The string to validate.
 * @returns True if valid, false otherwise.
 */
export const isMerchantId = (value: string): boolean => {
  if (![64, 66].includes(value.length)) {
    return false
  }
  const hexRegex = /^[0-9a-fA-F]+$/
  if (!hexRegex.test(value)) {
    return false
  }
  if (value.length === 66 && !value.startsWith('02') && !value.startsWith('03')) {
    return false
  }
  try {
    PublicKey.fromString(value)
    return true
  } catch {
    return false
  }
}

/**
 * Formats an ID (e.g., derivation_prefix, derivation_suffix, button_id) as 'first4...last4' with ellipses.
 * @param id The full ID string to format.
 * @returns Formatted string (e.g., "abcd...wxyz") or the original string if too short.
 */
export function formatId(id: string): string {
  if (id.length < 8) return id // Fallback for short IDs (e.g., derivation_suffix '1')
  return `${id.slice(0, 4)}...${id.slice(-4)}`
}

/**
 * Formats a timestamp string into a human-readable format in the user's local timezone.
 * @param dateStr The timestamp string (e.g., ISO string or Unix timestamp) or null/undefined.
 * @returns Formatted date string (e.g., "26 Aug 2025 14:30:45") or 'N/A' if invalid.
 */
export function formatTimeLocal(dateStr: string | null | undefined): string {
  if (!dateStr) {
    return 'N/A'
  }
  try {
    const date = new Date(dateStr)
    return date
      .toLocaleString('en-GB', {
        year: 'numeric',
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      })
      .replace(',', '')
  } catch (error) {
    return 'N/A'
  }
}

/**
 * Formats a timestamp string into a human-readable YYYY-MM-DD HH:MM:SS format (UTC).
 * @param dateStr The timestamp string (e.g., ISO string or Unix timestamp).
 * @returns Formatted date string or 'N/A' if invalid.
 */
export function formatTimestamp(dateStr: string | undefined): string {
  if (!dateStr) {
    return 'N/A'
  }
  try {
    const date = new Date(dateStr)
    return date.toISOString().replace('T', ' ').slice(0, 19)
  } catch (error) {
    return 'N/A'
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
  const authFetch = new AuthFetch(wallet)
  const timeoutId = setTimeout(() => {
    throw new Error(`❌ Request timed out after ${timeoutMs}ms for URL: ${url}`)
  }, timeoutMs)
  try {
    const response = await authFetch.fetch(url, options)
    if (!response.ok) {
      let errorDetail = ''
      try {
        errorDetail = await response.text()
      } catch (textError) {
        errorDetail = 'Failed to retrieve error details'
      }
      throw new Error(
        `Failed to fetch ${url} with method ${options.method || 'GET'}: Status ${response.status} ${response.statusText}, Details: ${errorDetail}`
      )
    }
    return response
  } catch (err: any) {
    throw new Error(
      `Failed to fetch ${url} with method ${options.method || 'GET'}: ${err.message}${
        err.status ? `, Status: ${err.status}` : ''
      }`
    )
  } finally {
    clearTimeout(timeoutId)
  }
}

/**
 * Validates CSS input by checking syntax, balanced parentheses, and color formats.
 * @param css The CSS string to validate.
 * @returns True if valid, false otherwise.
 */
export const validateCSS = (css: string): boolean => {
  try {
    const rules = css
      .split('}')
      .map(rule => rule.trim())
      .filter(rule => rule.length > 0)
    for (const rule of rules) {
      const [selectorPart, propertiesPart] = rule.split('{').map(part => part.trim())
      if (!selectorPart || !propertiesPart) return false
      const properties = propertiesPart
        .split(';')
        .map(prop => prop.trim())
        .filter(prop => prop.length > 0)
      for (const prop of properties) {
        const [key, value] = prop.split(':').map(part => part.trim())
        if (!key || !value) return false
        if (value.includes('#')) {
          const hexMatch = value.match(/#[0-9a-fA-F]{3,}/g)
          if (!hexMatch) return false
        }
        if (value.includes('(')) {
          const openCount = (value.match(/\(/g) || []).length
          const closeCount = (value.match(/\)/g) || []).length
          if (openCount !== closeCount) return false
          if (value.includes('linear-gradient')) {
            if (!value.match(/linear-gradient\s*\([^)]*\)\s*$/)) return false
            const colorMatches = value.match(/#[0-9a-fA-F]{3,}/g)
            if (!colorMatches || colorMatches.length < 2) return false
          }
        }
      }
    }
    return true
  } catch {
    return false
  }
}

/**
 * Extracts CSS content from a <style> tag.
 * @param input The input string containing the CSS.
 * @returns The extracted CSS or the input trimmed if no style tag is found.
 */
export const extractCSS = (input: string): string => {
  const match = input.match(/<style>([\s\S]*?)<\/style>/)
  return match ? match[1].trim() : input.trim()
}

/**
 * Sanitizes input by removing angle brackets to prevent injection.
 * @param input The input string to sanitize.
 * @returns Sanitized string with angle brackets removed.
 */
export const sanitizeInput = (input: string): string => {
  return input.replace(/[<>]/g, '')
}
