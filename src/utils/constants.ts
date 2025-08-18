/**
 * @file src/utils/constants.ts
 * @description Centralized constants for the Gateway application, replacing process.env for frontend use.
 * These values should be updated based on the .env file or deployment environment.
 */
export const MAX_PAYMENT_SATS: number = 10000
export const CONFIG = {
  WALLET_ORIGIN: 'http://localhost:3321', // Default for Metanet client connection
  API_BASE: 'http://localhost:3001', // Default API base URL
  ALLOWED_ORIGIN: 'http://localhost:3000' // Default CORS origin
} as const
