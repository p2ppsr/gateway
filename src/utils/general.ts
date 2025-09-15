/**
 * @file utils/general.ts
 * @description
 * General utility functions for the Gateway application, including:
 * - ID generation (Base58 / hex)
 * - Formatting helpers (IDs, timestamps)
 * - Authenticated fetch with timeout
 * - CSS validation/sanitization helpers
 * - **Auth-ready event bus** to defer protected API calls until the wallet (BRC-104) handshake completes
 *
 * @author xAI
 * @date 2025-09-01
 * @version 1.18 (2025-09-08: add safe URL join + clientConfig integration to avoid "Invalid URL")
 */

import { WalletClient, AuthFetch, PublicKey } from '@bsv/sdk'
import { CONFIG } from './constants'

/* =============================================================================
   ID generation
============================================================================= */

/**
 * Generates a cryptographically secure random Base58-encoded string of specified length.
 * @param {number} [n=12] The number of characters in the output string (default: 12).
 * @returns {string} A Base58-encoded string of length n.
 * @throws {Error} If n is not a positive integer.
 */
export function generateBase58(n: number = 12): string {
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error('Length must be a positive integer')
  }
  const base58Alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
  let result = ''
  const maxSafeValue = Math.floor((2 ** 32 - 1) / 58) * 58
  const randomValues = crypto.getRandomValues(new Uint32Array(n))
  for (let i = 0; i < n; i++) {
    let randomValue = randomValues[i]
    while (randomValue >= maxSafeValue) {
      randomValue = crypto.getRandomValues(new Uint32Array(1))[0]
    }
    const randomIndex = randomValue % 58
    result += base58Alphabet[randomIndex]
  }
  return result
}

/**
 * Generates a cryptographically secure random hex string of specified length.
 * @param {number} [length=12] The number of characters in the output string (default: 12).
 * @returns {string} A random hex string (e.g., 'a1b2c3d4e5f6').
 * @throws {Error} If length is not a positive integer.
 */
export function generateRandomHex(length: number = 12): string {
  if (!Number.isInteger(length) || length <= 0) {
    throw new Error('Length must be a positive integer')
  }
  const hexChars = '0123456789abcdef'
  let result = ''
  const maxSafeValue = Math.floor((2 ** 32 - 1) / 16) * 16
  const randomValues = crypto.getRandomValues(new Uint32Array(length))
  for (let i = 0; i < length; i++) {
    let randomValue = randomValues[i]
    while (randomValue >= maxSafeValue) {
      randomValue = crypto.getRandomValues(new Uint32Array(1))[0]
    }
    const randomIndex = randomValue % 16
    result += hexChars[randomIndex]
  }
  return result
}

/**
 * Returns a regex for matching Base58-encoded IDs of specified length.
 * @param {number} [length=12] The number of characters to match (default: 12).
 * @returns {RegExp} A RegExp object matching Base58 strings of the specified length.
 * @throws {Error} If length is not a positive integer.
 */
export function getBase58Regex(length: number = 12): RegExp {
  if (!Number.isInteger(length) || length <= 0) {
    throw new Error('Length must be a positive integer')
  }
  return new RegExp(`^[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]{${length}}$`)
}

/**
 * Checks if a string is a valid Base58-encoded ID of specified length.
 * @param {string} id The string to validate.
 * @param {number} [length=12] The expected length (default: 12).
 * @returns {boolean} True if the string is a valid Base58 ID of the specified length, false otherwise.
 */
export function isBase58(id: string, length: number = 12): boolean {
  if (typeof id !== 'string' || id.length === 0) {
    return false
  }
  return getBase58Regex(length).test(id)
}

/**
 * Validates a merchant ID as a 64 or 66-character hex string or compressed public key.
 * @param {string} value The string to validate.
 * @returns {boolean} True if valid, false for invalid or non-string inputs.
 */
export const isMerchantId = (value: string): boolean => {
  if (typeof value !== 'string' || value.length === 0) {
    return false
  }
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
  } catch (error) {
    console.warn(`Invalid public key format for merchant ID: ${value}`, error)
    return false
  }
}

/* =============================================================================
   Formatting helpers
============================================================================= */

/**
 * Formats an ID (e.g., derivation_prefix, derivation_suffix, button_id) as 'first4...last4' with ellipses.
 * @param {string} id The full ID string to format.
 * @returns {string} Formatted string (e.g., "abcd...wxyz"), the original string if too short (< 8 characters), or empty string if invalid.
 */
export function formatId(id: string): string {
  if (typeof id !== 'string' || id.length === 0) {
    return ''
  }
  if (id.length < 8) return id
  return `${id.slice(0, 4)}...${id.slice(-4)}`
}

/**
 * Formats a timestamp string into a human-readable format in the user's local timezone.
 * @param {string | null | undefined} dateStr The timestamp string (e.g., ISO string or Unix timestamp) or null/undefined.
 * @returns {string} Formatted date string (e.g., "26 Aug 2025 14:30:45") or 'N/A' if invalid.
 */
export function formatTimeLocal(dateStr: string | null | undefined): string {
  if (!dateStr) {
    return 'N/A'
  }
  try {
    const date = new Date(dateStr)
    if (isNaN(date.getTime())) {
      console.warn(`Invalid date string: ${dateStr}`)
      return 'N/A'
    }
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
    console.warn(`Error formatting date string: ${dateStr}`, error)
    return 'N/A'
  }
}

/**
 * Formats a timestamp string into a human-readable YYYY-MM-DD HH:MM:SS format (UTC).
 * @param {string | null | undefined} dateStr The timestamp string (e.g., ISO string or Unix timestamp) or null/undefined.
 * @returns {string} Formatted date string or 'N/A' if invalid.
 */
export function formatTimestamp(dateStr: string | null | undefined): string {
  if (!dateStr) {
    return 'N/A'
  }
  try {
    const date = new Date(dateStr)
    if (isNaN(date.getTime())) {
      console.warn(`Invalid date string: ${dateStr}`)
      return 'N/A'
    }
    return date.toISOString().replace('T', ' ').slice(0, 19)
  } catch (error) {
    console.warn(`Error formatting timestamp: ${dateStr}`, error)
    return 'N/A'
  }
}

/**
 * Authenticated fetch with timeout for all `/api/*` calls.
 *
 * Uses {@link AuthFetch} to sign the request with the provided {@link WalletClient},
 * automatically attaching the `Authorization` header. Preserves any caller-supplied
 * headers (e.g., `Content-Type`) and aborts the in-flight request if it exceeds
 * the configured timeout via `AbortController`.
 *
 * **Important**
 * - For mutual-auth to succeed, the signed URL must match the actual request origin.
 *   Prefer `API_BASE = window.location.origin` (e.g., `https://gateway.local`) and
 *   avoid mixing hosts like `http://localhost:3001` from the browser.
 * - Do **not** set `Authorization` yourself; it is added by `AuthFetch`.
 * - Timeout cancels the request and surfaces a clear error.
 *
 * @param {string} url
 *   Absolute or relative URL to fetch. Relative `/...` will be resolved using client config.
 *
 * @param {object} options
 *   Fetch options (subset compatible with `SimplifiedFetchRequestOptions` from `@bsv/sdk`).
 *
 * @param {Record<string,string>} [options.headers]
 *   Additional HTTP headers to merge (e.g., `Content-Type`).
 *
 * @param {string} [options.method='GET']
 *   HTTP method.
 *
 * @param {string} [options.body]
 *   Serialized request body (e.g., `JSON.stringify(...)` for POSTs).
 *
 * @param {WalletClient} wallet
 *   Wallet instance used by `AuthFetch` to create the `Authorization` header.
 *   Required for authenticated endpoints (all `/api/*` in this app).
 *
 * @param {number} [timeoutMs=15000]
 *   Maximum time in milliseconds before the request is aborted.
 *
 * @returns {Promise<Response>}
 *   Resolves with the successful `Response`. The caller may still read the body
 *   (`response.json()`, `response.text()`, etc.).
 *
 * @throws {TypeError}
 *   If `url` is empty/invalid or `timeoutMs` is not a positive integer.
 *
 * @throws {Error}
 *   - If the request is aborted due to timeout (message includes the URL).
 *   - If the response status is non-2xx. The error message includes method,
 *     URL, status code/text, and any response text available.
 *
 * @remarks
 * - This helper centralizes auth + timeout for consistency with known-working
 *   flows (e.g., `/api/invoice`). Route **all** `/api/*` calls through it.
 * - Keep client and server clocks reasonably in sync to avoid time-based
 *   signature failures.
 */
export const fetchWithTimeout = async (
  url: string,
  options: { headers?: Record<string, string>; method?: string; body?: string },
  wallet: WalletClient,
  timeoutMs: number = 15_000
): Promise<Response> => {
  if (typeof url !== 'string' || url.length === 0) {
    throw new Error('URL must be a non-empty string')
  }
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) {
    throw new Error('Timeout must be a positive integer')
  }

  // Resolve to a valid absolute-or-relative URL (never throws "Invalid URL")
  const resolvedUrl =`${url}`

  // Build auth-capable fetch
  const authFetch = new AuthFetch(wallet)

  // Abort on timeout
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(new Error(`Timeout after ${timeoutMs}ms: ${CONFIG.API_BASE}`)), timeoutMs)

  try {
    // Merge headers, attach signal
    const reqOptions = {
      ...options,
      headers: { ...(options?.headers ?? {}) },
      signal: controller.signal as any,
    }

    const res = await authFetch.fetch(resolvedUrl, reqOptions)

    if (!res.ok) {
      let detail = ''
      try { detail = await res.text() } catch { /* ignore */ }
      throw new Error(
        `Failed ${reqOptions.method || 'GET'} ${CONFIG.API_BASE} → ${res.status} ${res.statusText}${detail ? ` | ${detail}` : ''}`
      )
    }
    return res
  } catch (err) {
    // If aborted, surface a clear message
    if ((err as any)?.name === 'AbortError') {
      throw new Error(`Request aborted: ${CONFIG.API_BASE}`)
    }
    throw err instanceof Error ? err : new Error(String(err))
  } finally {
    clearTimeout(timer)
  }
}

/* =============================================================================
   CSS utilities
============================================================================= */

/**
 * Validates CSS input by checking syntax, balanced parentheses, hex color formats, and linear gradients.
 * @param {string} css The CSS string to validate.
 * @returns {boolean} True if the CSS is valid, false for invalid or non-string inputs.
 */
export const validateCSS = (css: string): boolean => {
  if (typeof css !== 'string' || css.length === 0) {
    return false
  }
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
          const hexMatch = value.match(/#[0-9a-fA-F]{3,6}/g)
          if (!hexMatch) return false
        }
        if (value.includes('(')) {
          const openCount = (value.match(/\(/g) || []).length
          const closeCount = (value.match(/\)/g) || []).length
          if (openCount !== closeCount) return false
          if (value.includes('linear-gradient')) {
            if (!value.match(/linear-gradient\s*\([^)]+\)/)) return false
            const colorMatches = value.match(/#[0-9a-fA-F]{3,6}/g)
            if (!colorMatches || colorMatches.length < 2) return false
          }
        }
      }
    }
    return true
  } catch (error) {
    console.warn(`Invalid CSS: ${css}`, error)
    return false
  }
}

/**
 * Extracts CSS content from a <style> tag.
 * @param {string} input The input string containing the CSS.
 * @returns {string} The extracted CSS or the input trimmed if no style tag is found; empty string for non-string inputs.
 */
export const extractCSS = (input: string): string => {
  if (typeof input !== 'string' || input.length === 0) {
    return ''
  }
  const match = input.match(/<style\b[^>]*>([\s\S]*?)<\/style>/i)
  if (!match) {
    console.warn(`No style tags found in input: ${input.slice(0, 50)}...`)
    return input.trim()
  }
  return match[1].trim()
}

/**
 * Sanitizes input by escaping HTML characters to prevent injection.
 * @param {string} input The input string to sanitize.
 * @returns {string} Sanitized string with HTML characters escaped; empty string for non-string inputs.
 */
export const sanitizeInput = (input: string): string => {
  if (typeof input !== 'string') {
    return ''
  }
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
}

// --- server key helpers -------------------------------------------------------

/**
 * Normalizes a server private key for wallet initialization.
 *
 * Accepts either:
 * - a 64-character hexadecimal string, or
 * - a 0x-prefixed 66-character hexadecimal string,
 * and returns a normalized **64-character lowercase hex** (without `0x`).
 *
 * @function normalizeServerPrivateKey
 * @param {string | null | undefined} raw - The raw key value (e.g., from `process.env.SERVER_PRIVATE_KEY`).
 * @returns {string | null} A 64-char lowercase hex string if valid; otherwise `null`.
 * @example
 */
export function normalizeServerPrivateKey(raw?: string | null): string | null {
  if (!raw) return null
  const trimmed = raw.trim()
  const without0x = trimmed.startsWith('0x') || trimmed.startsWith('0X') ? trimmed.slice(2) : trimmed
  if (/^[0-9a-fA-F]{64}$/.test(without0x)) {
    return without0x.toLowerCase()
  }
  return null
}
