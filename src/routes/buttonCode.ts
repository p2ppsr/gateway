/**
 * @file src/routes/buttonCode.ts
 *
 * GET route to retrieve payment button code details for a given paymentId.
 * Fetches the button configuration from the payment_buttons table and returns it for client-side rendering.
 * Adjusted to include detailed debugging and handle potential query issues.
 *
 * Used by the Gateway inject script to initialize PayButtons on a webpage.
 *
 * Version: v1.7 (Updated 05Aug2025_0410 BST to standardize route path with other routes)
 */
import knex, { Knex } from 'knex'
import knexConfig from '../../knexfile'
import type { Request, Response } from 'express'
const db: Knex = knex(knexConfig)

export default {
  type: 'get',
  path: '/buttonCode/:paymentId', // Standardized to match other routes (no /api prefix)
  func: async (req: Request, res: Response): Promise<void> => {
    const { paymentId } = req.params
    console.log('🔍 [buttonCode] Received request for paymentId:', paymentId, 'Type:', typeof paymentId)

    try {
      console.log('🔍 [buttonCode] Executing query for payment_id:', paymentId)
      const button = await db('payment_buttons').where({ payment_id: paymentId }).first()

      console.log('🔍 [buttonCode] Raw query result:', button ? JSON.stringify(button) : 'No record found')

      if (!button) {
        console.log('❌ [buttonCode] No button found for paymentId:', paymentId, 'Checking table contents...')
        const allButtons = await db('payment_buttons').select('payment_id', 'button_id', 'description')
        console.log('🔍 [buttonCode] All payment_buttons records:', allButtons)
        res.status(404).json({ status: 'error', message: `No button found for paymentId: ${paymentId}` })
        return
      }

      console.log('✅ [buttonCode] Found button:', JSON.stringify(button))
      res.status(200).json({
        status: 'success',
        payment_id: button.payment_id,
        code:
          button.customCSS ||
          `<div class="gateway-paybutton gateway-paybutton-fixed" data-amount="${button.amount}" data-text="${button.text || 'Pay Now 5 Sats'}" data-description="${button.description}" data-button="${button.button_id}" data-paymentId="${button.payment_id}" data-server="${req.protocol}://${req.get('host')}">Pay Now ${button.amount} Sats</div>`
      })
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error'
      console.error('❌ [buttonCode] Error fetching button code:', {
        message: errorMessage,
        stack: err instanceof Error ? err.stack : 'No stack trace',
        paymentId
      })
      res.status(500).json({ status: 'error', message: errorMessage })
    }
  }
}
