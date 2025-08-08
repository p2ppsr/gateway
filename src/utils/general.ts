/**
 * @file src/utils/general.ts
 *
 * Contains general utility functions reusable across the Gateway application.
 *
 * - Provides formatting and other common operations for consistent data handling.
 * - Intended to centralize shared logic for maintainability.
 */

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
 * Formats a timestamp string into a human-readable YYYY-MM-DD HH:MM:SS format.
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
