import knex, { Knex } from 'knex'
import knexConfig from '../../knexfile' // Assumes knexfile.js renamed to knexfile.ts
import { Request, Response } from 'express'

const db: Knex = knex(knexConfig)

export default {
  type: 'get',
  path: '/listButtons',
  knex: db,
  func: async (req: Request, res: Response): Promise<void> => {
    // Extract the merchant's ID from the authentication context
    const merchantId = (req as any).authrite.identityKey

    // Extract query parameters for pagination, and optional filtering
    const {
      limit = 25,
      offset = 0,
      sort = 'desc',
      excludeSingleUse = 'false',
      usage = 'all'
    } = req.query as {
      limit?: number
      offset?: number
      sort?: 'asc' | 'desc'
      excludeSingleUse?: string
      usage?: 'used' | 'unused' | 'all'
    }

    try {
      // Start building the query
      let query = db('payment_buttons')
        .where({ merchant_id: merchantId })
        .orderBy('created_at', sort)
        .limit(limit)
        .offset(offset)

      // Conditionally filter out single-use buttons if requested
      if (excludeSingleUse === 'true') {
        query = query.andWhere('multi_use', '=', true)
      }

      // Filter based on usage if specified ('used', 'unused', or 'all')
      if (usage === 'used') {
        query = query.andWhere('used', '=', true)
      } else if (usage === 'unused') {
        query = query.andWhere('used', '=', false)
      }
      // Note: 'all' does not require any additional filtering

      // Execute the query to get the list of buttons
      const buttons = await query

      // Respond with the list of buttons
      res.status(200).json({
        status: 'success',
        data: buttons,
        message: 'Payment buttons fetched successfully'
      })
    } catch (error) {
      console.error('Error listing payment buttons:', error)
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      })
    }
  }
}
