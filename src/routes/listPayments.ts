/**
 * @file src/routes/listPayments.ts
 *
 * GET route to list payments received by the authenticated merchant.
 * Supports pagination, sort order, and optional filtering by a specific payment button.
 *
 * Query Parameters:
 * - `buttonId` (string, optional): Filter to only payments from a specific button.
 * - `limit` (number): Maximum number of payments to return (default: 25).
 * - `offset` (number): Number of payments to skip for pagination (default: 0).
 * - `sort` ("asc" | "desc"): Sort order based on `created_at` timestamp (default: "desc").
 *
 * Used by the Gateway frontend on the Payments screen to fetch incoming payment activity.
 *
 * Version: v1.4 (Updated 05Aug2025_1815 BST to align field names with frontend and add logging)
 * Change Log:
 * - 04Aug2025_2300 BST (v1.0): Initial version, listing payments with payment_id.
 * - 05Aug2025_0700 BST (v1.1): Updated to display transaction_id as ID (showing txid), added title "Transaction History" to response, and removed outdated payment_id reference.
 * - 05Aug2025_0720 BST (v1.2): Added fallback for undefined amount values to prevent TypeError in formatBSV.
 * - 05Aug2025_0730 BST (v1.3): Strengthened amount fallback with explicit null/undefined checks and logging to debug invalid data.
 * - 05Aug2025_1815 BST (v1.4): Aligned field names (e.g., `CreatedAt` to `created_at`, `New` to `is_new`) with frontend expectations and added detailed logging for debugging.
 */
import knex, { Knex } from 'knex'
import knexConfig from '../../knexfile'
import { Request, Response } from 'express'
import { logWithTimestamp } from '../utils/logging'
const db: Knex = knex(knexConfig)
export default {
  type: 'get',
  path: '/listPayments',
  /**
   * Express route handler to return a list of payments for a given merchant.
   *
   * Applies optional filters and pagination based on query parameters.
   * If a `buttonId` is provided, filters results to that payment button only.
   *
   * @param req - Express request object, must include `auth.identityKey` and may include
   * query parameters: `buttonId`, `limit`, `offset`, `sort`.
   * @param res - Express response object to return the filtered list of payments.
   * @returns {Promise<void>} Responds with JSON containing the filtered payment list or an error.
   */
  func: async (req: Request, res: Response): Promise<void> => {
    // Extract merchant ID from authentication context
    const merchantId = (req as any).auth.identityKey
    // Extract query parameters for optional filtering by button ID, pagination, and sorting
    const {
      buttonId,
      limit = 25,
      offset = 0,
      sort = 'desc'
    } = req.query as {
      buttonId?: string
      limit?: number
      offset?: number
      sort?: 'asc' | 'desc'
    }
    try {
      // Build the query with mandatory conditions
      let query = db('payments')
        .select(
          'transaction_id as ID', // Alias transaction_id to ID, showing txid
          'payment_button_id as payment_button_id',
          'amount as amount',
          'currency as currency',
          'completed as completed',
          'is_new as is_new',
          'created_at as created_at' // Use consistent field name
        )
        .where({ merchant_id: merchantId })
        .orderBy('created_at', sort)
        .limit(limit)
        .offset(offset)
      // Optionally filter by button ID if one is provided
      if (typeof buttonId === 'string' && buttonId !== '') {
        query = query.andWhere({ payment_button_id: buttonId })
      }
      // Execute the query to get the list of payments
      const payments = await query
      logWithTimestamp('routes/listPayments', 'Raw query result:', JSON.stringify(payments))

      // Respond with the list of payments including a title and handling undefined amounts
      const processedPayments = payments.map(x => {
        if (x.amount === undefined || x.amount === null) {
          logWithTimestamp(
            'routes/listPayments',
            'Warning: Found undefined/null amount for payment:',
            x.ID,
            'Setting to 0'
          )
          //*logWithTimestamp('routes/listPayments', 'Warning: Found undefined/null amount for payment:', x.ID, 'Setting to 0.00000000')
          return { ...x, amount: '0' }
          //*return { ...x, amount: '0.00000000' }
        }
        return { ...x, amount: x.amount }
        //*return { ...x, amount: parseFloat(x.amount.toString()).toFixed(8) }
      })
      logWithTimestamp('routes/listPayments', 'Processed payments:', JSON.stringify(processedPayments))

      res.status(200).json({
        status: 'success',
        title: 'Transaction History',
        data: processedPayments,
        message: 'Payments fetched successfully'
      })
    } catch (error) {
      logWithTimestamp('routes/listPayments', 'Error listing payments:', error)
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      })
    }
  }
}
