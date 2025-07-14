import knex, { Knex } from 'knex'
import knexConfig from '../../knexfile'
import { Request, Response } from 'express'

const db: Knex = knex(knexConfig)

export default {
  type: 'post',
  path: '/acknowledgePayment',
  knex: db,
  func: async (req: Request, res: Response): Promise<void> => {
    // Extract the merchant's ID from the authentication context (assume middleware sets req.authrite)
    const merchantId = (req as any).authrite.identityKey // Type assertion if authrite is custom
    // Extract the payment ID from the request body
    const { paymentId } = req.body as { paymentId: string }

    try {
      if (!paymentId) {
        res.status(400).json({
          status: 'error',
          message: 'Missing paymentId in request body'
        })
        return
      }

      // Verify the payment exists, is new, and belongs to the merchant
      const payment = await db('payments')
        .where({
          payment_id: paymentId,
          merchant_id: merchantId,
          is_new: true
        })
        .first()

      if (!payment) {
        res.status(404).json({
          status: 'error',
          message:
            'Payment not found, already acknowledged, or does not belong to the merchant'
        })
        return
      }

      // Update the payment's is_new status to false
      await db('payments')
        .where({ payment_id: paymentId })
        .update({ is_new: false })

      // Respond with success
      res.status(200).json({
        status: 'success',
        message: 'Payment acknowledged successfully'
      })
    } catch (error) {
      console.error('Error acknowledging payment:', error)
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      })
    }
  }
}
