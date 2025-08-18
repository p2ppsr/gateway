/**
 * @file src/routes/listPayments.ts
 *
 * GET route to list all payments for the authenticated merchant.
 * Retrieves payment records from the database, including button details,
 * with pagination support via query parameters (limit and offset).
 *
 * Used by the Gateway frontend to display the Payments page.
 *
 * Version: v2.5 (Updated 14Aug2025_0145 BST to fix db runtime initialization)
 * Change Log:
 * - 05Aug2025_0500 BST (v1.0): Initial creation with basic payment listing.
 * - 12Aug2025_2250 BST (v1.1): Added join with payment_buttons and ids, fixed 500 error, added query debugging.
 * - 12Aug2025_2315 BST (v1.2): Removed invalid payment_button_id reference, adjusted join, enhanced error logging.
 * - 12Aug2025_2330 BST (v1.3): Added AuthRequest interface to fix TypeScript 'auth' property error.
 * - 12Aug2025_2359 BST (v1.4): Added txid extraction from transaction_info, ensured transaction_id for Payment Id.
 * - 13Aug2025_0030 BST (v1.5): Updated for new txid column, added button description for user context.
 * - 13Aug2025_0100 BST (v1.6): Switched to txid as primary key, removed transaction_id.
 * - 13Aug2025_0130 BST (v1.7): Switched to payment_id as primary key, renamed button_id_ref to button_id, payer_identity to payer_id.
 * - 13Aug2025_0135 BST (v1.8): Ensured payment_id and button_id reference ids.id consistently.
 * - 13Aug2025_0315 BST (v1.9): Updated Payment interface for latest schema, improved pagination handling and logging.
 * - 13Aug2025_0315 BST (v2.0): Fixed TypeScript const reassignment errors for limitNum and offsetNum.
 * - 13Aug2025_1240 BST (v2.1): Added completed filter, fixed join logic, and enhanced logging.
 * - 14Aug2025_0120 BST (v2.2): Removed currency and exchange_rate, corrected join to payment_id, aligned interfaces with schema.
 * - 14Aug2025_0125 BST (v2.3): Fixed db scoping issue to resolve TS2304 errors.
 * - 14Aug2025_0130 BST (v2.4): Fixed F scoping issue to resolve TS2304 errors in logWithTimestamp calls.
 * - 14Aug2025_0145 BST (v2.5): Fixed db runtime initialization to resolve "db is not a function" error.
 */
import knex, { Knex } from 'knex'
import knexConfig from '../../knexfile'
import { Request, Response } from 'express'
import { logWithTimestamp } from '../utils/logging'
const db: Knex = knex(knexConfig)

// Extend Request type to include auth property
interface AuthRequest extends Request {
  auth: {
    identityKey: string
  }
}

interface Payment {
  payment_id: string
  txid: string | null
  payer_id: string | null
  amount: number
  completed: boolean
  is_new: boolean
  created_at: string | null
  button_id: string
  description: string
}

interface PaymentButton {
  button_id: string
  payment_id: string | null
  amount: number
  variable_amount: boolean
  multi_use: boolean
  used: boolean
  total_paid: number | null
  description: string
  html_code: string
  created_at: string | null
  updated_at: string | null
}

export default {
  type: 'get' as const,
  path: '/listPayments',
  F: 'routes/listPayments', // File identifier for logging
  func: async (req: AuthRequest, res: Response): Promise<void> => {
    logWithTimestamp('routes/listPayments', '🔍 [listPayments] Received request with query:', req.query)
    const { limit = '10', offset = '0' } = req.query // Default as strings to handle query params
    let limitNum = parseInt(limit as string, 10)
    let offsetNum = parseInt(offset as string, 10)

    // Validate pagination parameters
    if (isNaN(limitNum) || limitNum <= 0 || limitNum > 1000) {
      logWithTimestamp('routes/listPayments', '⚠️ [listPayments] Invalid limit parameter, using default 10:', { limit })
      limitNum = 10
    }
    if (isNaN(offsetNum) || offsetNum < 0) {
      logWithTimestamp('routes/listPayments', '⚠️ [listPayments] Invalid offset parameter, using default 0:', {
        offset
      })
      offsetNum = 0
    }

    try {
      const sqlQuery = db('payments')
        .select(
          'payments.payment_id as payment_id',
          'payments.txid as txid',
          'payments.payer_id as payer_id',
          'payments.amount as amount',
          'payments.completed as completed',
          'payments.is_new as is_new',
          'payments.created_at as created_at',
          'payment_buttons.button_id as button_id',
          'payment_buttons.description as description'
        )
        .innerJoin('payment_buttons', 'payments.payment_id', 'payment_buttons.payment_id') // Corrected join
        .where('payments.merchant_id', req.auth.identityKey)
        .where('payments.completed', 1) // Filter for completed payments
        .limit(limitNum)
        .offset(offsetNum)

      logWithTimestamp('routes/listPayments', '🔍 [listPayments] Executing SQL query:', { sql: sqlQuery.toString() })
      const payments: Payment[] = await sqlQuery
      logWithTimestamp('routes/listPayments', '🔍 [listPayments] Query result:', {
        payments,
        limit: limitNum,
        offset: offsetNum
      })

      if (payments.length === 0) {
        logWithTimestamp('routes/listPayments', '⚠️ [listPayments] No payments found for merchant:', {
          merchantId: req.auth.identityKey
        })
      }

      const total = await db('payments')
        .where('merchant_id', req.auth.identityKey)
        .where('completed', 1)
        .count('* as count')
        .first()
      const totalCount = total ? parseInt(total.count as string, 10) : 0

      logWithTimestamp('routes/listPayments', '✅ [listPayments] Payments fetched successfully:', {
        total: totalCount,
        returned: payments.length,
        limit: limitNum,
        offset: offsetNum
      })
      res.status(200).json({
        status: 'success',
        message: 'Payments fetched successfully',
        data: payments,
        total: totalCount
      })
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : '❌ Unknown error'
      logWithTimestamp('routes/listPayments', '❌ [listPayments] Error fetching payments:', {
        message,
        stack: error instanceof Error ? error.stack : '❌ No stack trace',
        query: req.query,
        sql: (error as any).sql || 'No SQL available'
      })
      res.status(500).json({
        status: 'error',
        message: `❌ ${message}`
      })
    }
  }
}
