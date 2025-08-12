const F = 'routes/acknowledgePayment'
import knex, { Knex } from 'knex'
import knexConfig from '../../knexfile'
import type { Request, Response } from 'express'
import { logWithTimestamp } from '../utils/logging'

const db: Knex = knex(knexConfig)

export default {
  type: 'post',
  path: '/acknowledgePayment',
  func: async (req: Request, res: Response): Promise<void> => {
    try {
      const { paymentId } = req.body
      logWithTimestamp(F, 'Received request body:', req.body) // Log the incoming request

      if (!paymentId) {
        res.status(400).json({ status: 'error', message: '❌ Missing paymentId' })
        return
      }

      // Log the current column info to verify type
      const columns = await db('information_schema.columns')
        .where({ table_name: 'payments', column_name: 'is_new' })
        .first()
      logWithTimestamp(F, 'is_new column info:', columns)

      // Update using payment_button_id with is_new as 0 (for TINYINT)
      const result = await db('payments').where({ payment_button_id: paymentId }).update({ is_new: 0 })
      logWithTimestamp(F, 'Update result:', result) // Log the result of the update

      if (result === 0) {
        res.status(404).json({ status: 'error', message: '❌ Payment not found' })
        return
      }

      res.status(200).json({ status: 'success', message: 'Payment acknowledged successfully' })
    } catch (err) {
      console.error('❌ Error in acknowledgePayment:', err) // Log the error details
      res.status(500).json({ status: 'error', message: '❌ Internal server error' })
    }
  }
}
