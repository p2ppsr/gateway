/**
 * @file src/utils/general.ts
 *
 * Contains general utility functions reusable across the Gateway application.
 *
 * - Provides formatting and other common operations for consistent data handling.
 * - Intended to centralize shared logic for maintainability.
 */

/**
 * Formats a numeric value (number or string) as a Bitcoin SV amount with 8 decimal places.
 *
 * Removes non-numeric characters (except '.') and parses the value to a float, defaulting to 0 if invalid.
 *
 * @param value - The number or string to format (e.g., "5", "5.123", "5 sats").
 * @returns A string representing the formatted value with 8 decimal places (e.g., "5.00000000").
 */
export const formatBSV = (value: number | string): string => {
  return parseFloat(value.toString().replace(/[^0-9.]/g, '')).toFixed(8)
}