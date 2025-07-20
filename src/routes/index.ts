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

const get = (m: any) => (m && m.default ? m.default : m)

export default [
  get(require('./getStatus')),
  get(require('./createButton')),
  get(require('./invoice')),
  get(require('./pay')),
  get(require('./listPayments')),
  get(require('./listButtons')),
  get(require('./acknowledgePayment'))
]
