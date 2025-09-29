/**
 * @file src/utils/constants.ts
 * @description Central configuration constants for the Gateway application.
 * Defines schemes, hosts, ports, environment-dependent bases, and shared limits.
 * This is the single source of truth to avoid magic strings in routes or embeds.
 *
 * @version 1.6.0 (Updated 16Sep2025_UTC: Removed gateway.local fallback; prod now requires HOSTING_DOMAIN from .env)
 * @author xAI
 */

// ---- Core hosts/schemes/ports -------------------------------------------------

/**
 * Supported URL schemes for constructing service endpoints.
 */
export const SCHEMES = {
  HTTP: 'http',
  HTTPS: 'https'
} as const

/**
 * Canonical hostnames for Wallet only.
 * Gateway host must come from .env (HOSTING_DOMAIN).
 */
export const HOSTS = {
  WALLET: 'localhost' // Wallet always runs on the user's machine
} as const

/**
 * Fixed port assignments for core services.
 */
export const PORTS = {
  API_HTTP: 3001 as const, // Gateway API/server default port
  WALLET_PRIMARY: 3321 as const, // Local wallet primary port
  WALLET_SECONDARY: 3301 as const // Local wallet secondary/alt port
} as const

// ---- Env/runtime guards -------------------------------------------------------

/** True if running in production mode (NODE_ENV=production). */
const IS_PROD = process.env.NODE_ENV === 'production'

/** True if executing inside a browser (vs server-side). */
const IN_BROWSER = typeof window !== 'undefined'

/**
 * For development:
 * - DEV_BASE resolves to http://localhost:PORT + DEV_ROUTING_PREFIX
 * - DEV_API_BASE resolves to DEV_BASE + /api
 *
 * This ensures PayButton embeds always hit `/api/...` endpoints
 * rather than root-relative paths which would 404 in dev.
 */
const DEV_BASE = `${SCHEMES.HTTP}://localhost:${process.env.HTTP_PORT ?? PORTS.API_HTTP}${process.env.DEV_ROUTING_PREFIX ?? ''}`
const DEV_API_BASE = `${DEV_BASE}${process.env.API_ROUTING_PREFIX ?? '/api'}`

// ---- Canonical configuration (no magic strings) -------------------------------

/**
 * Application-wide configuration object:
 *
 * @property PAY_BASE - Base URL for static/public assets like `pay.js`.
 *   - Prod: must come from HOSTING_DOMAIN
 *   - Dev: http://localhost:PORT (no `/api`)
 *
 * @property API_BASE - Base URL for API requests (JSON endpoints).
 *   - Prod: HOSTING_DOMAIN + /api
 *   - Dev: http://localhost:PORT/api
 *
 * @property WALLET_ORIGIN - Canonical local wallet URL (primary port).
 */
export const CONFIG = {
  WALLET_TIMEOUT: 20000,
  SERVER_IDENTITY_KEY:
    (process as any)?.env?.SERVER_IDENTITY_KEY ??
    '03f7c1fe6aaccabb06b9897a5c1f4bfa45230556a771d5b08aec5f48b94f09b61b',
  PRIVATE_IDENTITY_KEY:
    (process as any)?.env?.PRIVATE_IDENTITY_KEY ??
    '3c164fce7834d831bbc96975f9717ad8af7d94d7df0d36de0b4c13e009540589',

  PAY_BASE: IS_PROD
    ? (() => {
        if (!process.env.HOSTING_DOMAIN) {
          throw new Error(
            '❌ HOSTING_DOMAIN must be set in .env for production builds'
          )
        }
        return process.env.HOSTING_DOMAIN
      })()
    : DEV_BASE,

  API_BASE: IS_PROD
    ? (() => {
        if (!process.env.HOSTING_DOMAIN) {
          throw new Error(
            '❌ HOSTING_DOMAIN must be set in .env for production builds'
          )
        }
        return `${process.env.HOSTING_DOMAIN}/api`
      })()
    : DEV_API_BASE,

  // Wallet origin always localhost in browser; server never touches window
  WALLET_ORIGIN: IN_BROWSER
    ? `${SCHEMES.HTTP}://localhost:${PORTS.WALLET_PRIMARY}`
    : ''
} as const

/**
 * Secondary wallet origin (optional).
 */
export const WALLET_SECONDARY_ORIGIN = IN_BROWSER
  ? `${SCHEMES.HTTP}://localhost:${PORTS.WALLET_SECONDARY}`
  : ''

/**
 * Helpful list of localhost wallet URLs (used for CSP and dev tooling).
 */
export const LOCAL_WALLET_ORIGINS: readonly string[] = [
  `${SCHEMES.HTTP}://${HOSTS.WALLET}:${PORTS.WALLET_PRIMARY}`,
  `${SCHEMES.HTTP}://${HOSTS.WALLET}:${PORTS.WALLET_SECONDARY}`
] as const

// ---- App-wide limits & misc ---------------------------------------------------

/**
 * Maximum allowed payment amount (in satoshis).
 */
export const MAX_PAYMENT_SATS: number = 10_000

/**
 * Placeholder string for duplicate or empty fields in UI tables.
 */
export const DUP_FIELD_PLACEHOLDER = '-' as const
