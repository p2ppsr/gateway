/**
 * @file src/routes/index.ts
 *
 * Aggregates all route modules into a single exportable array.
 * Each module is loaded using a compatibility wrapper to support both
 * CommonJS and ESModule-style default exports from the individual route files.
 *
 * - Includes routes: `/getStatus`, `/createButton`, `/invoice`, `/pay`,
 *   `/listPayments`, `/listButtons`, and `/acknowledgePayment`.
 * - Used by the Express server to register all route handlers at startup.
 */

import { AuthRequest } from '@bsv/auth-express-middleware'
import { Request, Response } from 'express'

/**
 * Compatible request type that supports either a standard Express request
 * or one extended by `@bsv/auth-express-middleware` with `auth` metadata.
 */
export type CompatibleRequest = Request | AuthRequest

/**
 * @interface Route
 * Represents a single HTTP route for the Express server.
 *
 * @property type - HTTP method type (e.g., "get", "post")
 * @property path - URL path (e.g., "/pay")
 * @property func - Async handler function for the route; receives either a standard or authenticated request
 * @property handler - Optional secondary handler for cases like unauthenticated or fallback logic
 */
export interface Route {
  type: string
  path: string
  func: (req: CompatibleRequest, res: Response) => Promise<void>
  handler?: (req: Request, res: Response) => Promise<void>
}

/**
 * Compatibility wrapper for supporting both ESModule (`export default`)
 * and CommonJS (`module.exports`) style route modules.
 *
 * @param m - Imported route module
 * @returns The route object (either from `.default` or the module itself)
 */
const get = (m: any): Route => ('default' in m ? m.default : m)

/**
 * Promise that resolves to an array of route modules for registration.
 */
export default Promise.all([
  import('./getStatus').then(get),
  import('./createButton').then(get),
  import('./invoice').then(get),
  import('./pay').then(get),
  import('./listPayments').then(get),
  import('./listButtons').then(get),
  import('./acknowledgePayment').then(get)
])
