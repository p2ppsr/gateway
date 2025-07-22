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
 */

import knex, { Knex } from 'knex'
import knexConfig from '../../knexfile'
import { Request, Response } from 'express'

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
   *              query parameters: `buttonId`, `limit`, `offset`, `sort`.
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

      // Respond with the list of payments
      res.status(200).json({
        status: 'success',
        data: payments.map(x => ({
          ...x,
          amount: x.amount.slice(0, -2)
        })),
        message: 'Payments fetched successfully'
      })
    } catch (error) {
      console.error('❌ Error listing payments:', error)
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      })
    }
  }
}
