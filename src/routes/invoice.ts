/**
 * @file src/routes/invoice.ts
 *
 * POST route to create a new payment invoice for a given payment button.
 * Validates the payment button, verifies merchant ownership, enforces multi-use and variable-amount rules,
 * and generates a new payment record in the database.
 *
 * Also generates a derived payment address using a deterministic key derivation scheme
 * from the merchant ID and sender's identity key.
 *
 * Used by the Gateway UI to initiate a payment flow after clicking a tipping button.
 */

import knex, { Knex } from 'knex'
import knexConfig from '../../knexfile'
import { randomBytes } from 'crypto'
import { Hash, P2PKH, PrivateKey, PublicKey, Utils } from '@bsv/sdk'
import { Request, Response } from 'express'

const db: Knex = knex(knexConfig)

interface PaymentButton {
  button_id: string
  merchant_id: string
  multi_use: boolean
  used: boolean
  variable_amount: boolean
  amount: number
  currency: string
}

interface RequestBody {
  paymentButtonId: string
  merchantId: string
  currency: string
  amount: number
}

export default {
  type: 'post',
  path: '/invoice',
  knex: db,

  /**
   * Express route handler to create a new invoice/payment entry.
   *
   * Validates that the payment button exists, belongs to the merchant, and is eligible for use.
   * Creates a new `payments` record with `completed = false`, and responds with the derived
   * P2PKH locking script where the payment should be sent.
   *
   * The locking script is deterministically generated using a hash of the sender's identity,
   * merchant's public key, and an invoice number.
   *
   * @param req - Express request with `paymentButtonId`, `merchantId`, `currency`, and `amount` in body.
   *              Auth middleware must populate `req.auth.identityKey`.
   * @param res - Express response object for sending success or error responses.
   * @returns {Promise<void>} Sends a 200 success response with `paymentId` and derived outputs.
   */
  func: async (req: Request, res: Response): Promise<void> => {
    // Extract the necessary information from the request body
    const { paymentButtonId, merchantId, currency, amount }: RequestBody = req.body
    console.log('🔍 Request body:', req.body)

    try {
      // Verify the payment button exists and belongs to the specified merchant
      const button: PaymentButton | undefined = await db('payment_buttons')
        .where({
          button_id: paymentButtonId,
          merchant_id: merchantId
        })
        .first()
      console.log('🔍 Payment button data:', button)

      if (button === undefined) {
        res.status(404).json({
          status: 'error',
          message: 'Payment button not found for the specified merchant'
        })
        return
      }

      // Verify the button has not already been used if it is a single-use button
      if (!button.multi_use && button.used) {
        res.status(400).json({
          status: 'error',
          message: 'This single-use button has already been used'
        })
        return
      }

      // Verify the amount matches or the button is variable
      if (!button.variable_amount && (amount !== button.amount || currency !== button.currency)) {
        res.status(400).json({
          status: 'error',
          message: 'Amount and/or currency mismatch for fixed-amount button.'
        })
        return
      }

      // Create a new payment with complete=false
      const paymentID = randomBytes(12).toString('hex')
      await db('payments').insert({
        payment_id: paymentID,
        merchant_id: merchantId,
        completed: false,
        from: (req as any).auth.identityKey,
        transaction_info: '',
        amount,
        currency,
        exchange_rate: 1, // Placeholder, calculate the actual exchange rate as needed
        payment_button_id: paymentButtonId
      })
      console.log(`✅ Payment invoice created: ${paymentID}`)

      const senderPrivateKey = new PrivateKey('0000000000000000000000000000000000000000000000000000000000000001', 'hex')
      const recipientPublicKey = PublicKey.fromString(button.merchant_id)
      const invoiceNumber = `2-3241645161d8-${paymentID} 1`
      const combined = Utils.toArray(
        `${senderPrivateKey.toString()}${recipientPublicKey.toString()}${invoiceNumber}`,
        'utf8'
      )
      const derivedHash = Hash.sha256(Hash.sha256(combined))
      const derivedPriv = new PrivateKey(Utils.toHex(derivedHash), 'hex')
      const derivedPublicKey = derivedPriv.toPublicKey().toString()

      const pkh = new P2PKH()
      const derivedScript = pkh.lock(PublicKey.fromString(derivedPublicKey).toHash()).toHex()

      // Respond with the payment ID
      res.status(200).json({
        status: 'success',
        message: 'Invoice created successfully',
        paymentId: paymentID,
        outputs: [
          {
            lockingScript: derivedScript,
            satoshis: 5,
            outputDescription: 'Tip paid to merchant'
          }
        ]
      })
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      console.error(`❌ Error creating invoice: ${message}`)
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      })
    }
  }
}
