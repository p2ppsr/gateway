/**
 * @file src/routes/listPayments.ts
 *
 * GET route to list all payments for the authenticated merchant.
 * Retrieves payment records from the database, including button details,
 * with pagination support via query parameters (limit, offset, status).
 *
 * Used by the Gateway frontend to display the Payments page.
 *
 * Version: v2.8 (Updated 26Aug2025_0952 BST)
 * Change Log:
 * - 26Aug2025_0952 BST (v2.8): Used const F for logWithTimestamp, included testListPaymentsVersion in default export.
 * - 26Aug2025_0934 BST (v2.7): Removed completed=1 filter, added status query parameter for filtering (all, completed, new).
 * - 26Aug2025_0923 BST (v2.6): Changed innerJoin to leftJoin on payments.button_id = payment_buttons.button_id, added version logging.
 * - 14Aug2025_0145 BST (v2.5): Fixed db runtime initialization to resolve "db is not a function" error.
 * ... [Previous changelog entries]
 */
import knex, { Knex } from 'knex'
import knexConfig from '../knexfile'
import { Request, Response } from 'express'
import { logWithTimestamp } from '../utils/logging'

const db: Knex = knex(knexConfig)
const F = 'routes/listPayments'

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
  button_id: string | null
  description: string | null
}

export const testListPaymentsVersion = async (
  req: Request,
  res: Response
): Promise<void> => {
  logWithTimestamp(F, '🔍 [testListPaymentsVersion] Version check')
  res
    .status(200)
    .json({ version: 'v2.8', timestamp: new Date().toISOString() })
}

export default {
  type: 'get' as const,
  path: '/listPayments',
  func: async (req: AuthRequest, res: Response): Promise<void> => {
    logWithTimestamp(
      F,
      '🔍 [listPayments] Starting listPayments execution v2.8',
      req.query
    )
    const { limit = '500', offset = '0', status = 'all' } = req.query
    let limitNum = parseInt(limit as string, 10)
    let offsetNum = parseInt(offset as string, 10)

    if (isNaN(limitNum) || limitNum <= 0 || limitNum > 1000) {
      logWithTimestamp(
        F,
        '⚠️ [listPayments] Invalid limit parameter, using default 500:',
        { limit }
      )
      limitNum = 500
    }
    if (isNaN(offsetNum) || offsetNum < 0) {
      logWithTimestamp(
        F,
        '⚠️ [listPayments] Invalid offset parameter, using default 0:',
        { offset }
      )
      offsetNum = 0
    }

    try {
      let sqlQuery = db('payments')
        .select(
          'payments.payment_id as payment_id',
          'payments.txid as txid',
          'payments.payer_id as payer_id',
          db.raw(
            'CASE WHEN payments.completed = 1 THEN payments.amount ELSE 0 END as amount'
          ),
          'payments.completed as completed',
          'payments.is_new as is_new',
          'payments.created_at as created_at',
          'payment_buttons.button_id as button_id',
          db.raw(
            'COALESCE(payments.description, CONCAT("Payment using paymentId: ", payments.payment_id)) as description'
          )
        )
        .leftJoin(
          'payment_buttons',
          'payments.button_id',
          'payment_buttons.button_id'
        )
        .where('payments.merchant_id', req.auth.identityKey)
        .orderBy('payments.created_at', 'desc')

      if (status === 'completed') {
        sqlQuery = sqlQuery.where('payments.completed', 1)
      } else if (status === 'new') {
        sqlQuery = sqlQuery.where('payments.is_new', 1)
      }

      sqlQuery = sqlQuery.limit(limitNum).offset(offsetNum)

      logWithTimestamp(F, '🔍 [listPayments] Executing SQL query:', {
        sql: sqlQuery.toString()
      })
      const payments: Payment[] = await sqlQuery

      logWithTimestamp(F, '🔍 [listPayments] Query result:', {
        payments,
        limit: limitNum,
        offset: offsetNum,
        status
      })

      if (payments.length === 0) {
        logWithTimestamp(
          F,
          '⚠️ [listPayments] No payments found for merchant:',
          {
            merchantId: req.auth.identityKey,
            status
          }
        )
      }

      const total = await db('payments')
        .where('payments.merchant_id', req.auth.identityKey)
        .modify((queryBuilder) => {
          if (status === 'completed') {
            queryBuilder.where('completed', 1)
          } else if (status === 'new') {
            queryBuilder.where('is_new', 1)
          }
        })
        .count('* as count')
        .first()

      const totalCount = total ? parseInt(total.count as string, 10) : 0

      logWithTimestamp(F, '✅ [listPayments] Payments fetched successfully:', {
        total: totalCount,
        returned: payments.length,
        limit: limitNum,
        offset: offsetNum,
        status
      })

      res.status(200).json({
        status: 'success',
        message: 'Payments fetched successfully',
        data: payments,
        total: totalCount
      })
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : '❌ Unknown error'
      logWithTimestamp(F, '❌ [listPayments] Error fetching payments:', {
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
  },
  testListPaymentsVersion
}
