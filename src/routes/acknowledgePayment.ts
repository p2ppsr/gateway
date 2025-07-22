/**
 * @file src/routes/acknowledgePayment.ts
 *
 * POST route to acknowledge a received payment. This marks the `is_new` flag as false
 * for the given payment, preventing duplicate processing or re-acknowledgment.
 *
 * - Requires authentication middleware to populate `req.auth.identityKey`.
 * - Validates that the payment exists, is still new, and belongs to the calling merchant.
 * - Updates the database and returns success or appropriate error response.
 *
 * Used by the Payments page in the Gateway frontend to acknowledge incoming payments.
 */

import knex, { Knex } from 'knex'
import knexConfig from '../../knexfile'
import { Request, Response } from 'express'

const db: Knex = knex(knexConfig)

interface Payment {
  payment_id: string
  merchant_id: string
  is_new: boolean
}

export default {
  type: 'post',
  path: '/acknowledgePayment',

  /**
   * Express route handler to acknowledge a payment.
   *
   * Validates that the provided `paymentId` exists, belongs to the authenticated merchant,
   * and has not already been acknowledged. If valid, updates the payment to mark it as no longer new.
   *
   * @param req - Express request object, expected to contain `auth.identityKey` and `body.paymentId`.
   * @param res - Express response object used to send JSON success or error responses.
   * @returns {Promise<void>} Sends HTTP 200 on success or appropriate error status.
   */
  func: async (req: Request, res: Response): Promise<void> => {
    // Extract the merchant's ID from the authentication context (assume middleware sets req.auth)
    const merchantId = (req as any).auth.identityKey

    // Extract the payment ID from the request body
    const { paymentId } = req.body as { paymentId: string }

    try {
      if (paymentId === '') {
        res.status(400).json({
          status: 'error',
          message: 'Missing paymentId in request body'
        })
        return
      }

      // Verify the payment exists, is new, and belongs to the merchant
      const payment: Payment | undefined = await db('payments')
        .where({
          payment_id: paymentId,
          merchant_id: merchantId,
          is_new: true
        })
        .first()

      console.log('🔍 Payment data:', payment)

      if (payment === undefined) {
        res.status(404).json({
          status: 'error',
          message: 'Payment not found, already acknowledged, or does not belong to the merchant'
        })
        return
      }

      // Update the payment's is_new status to false
      await db('payments').where({ payment_id: paymentId }).update({ is_new: false })

      console.log(`✅ Payment acknowledged successfully: ${paymentId}`)

      // Respond with success
      res.status(200).json({
        status: 'success',
        message: 'Payment acknowledged successfully'
      })
    } catch (error: unknown) {
      console.error('❌ Error acknowledging payment:', error)
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      })
    }
  }
}
