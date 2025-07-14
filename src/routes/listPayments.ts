import knex, { Knex } from 'knex'
import knexConfig from '../../knexfile' // Assumes knexfile.js renamed to knexfile.ts
import { Request, Response } from 'express'

const db: Knex = knex(knexConfig)

export default {
  type: 'get',
  path: '/listPayments',
  knex: db,
  func: async (req: Request, res: Response): Promise<void> => {
    // Extract merchant ID from authentication context
    const merchantId = (req as any).authrite.identityKey

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
      if (buttonId) {
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
      console.error('Error listing payments:', error)
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      })
    }
  }
}
