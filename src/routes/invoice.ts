// src/routes/invoice.ts
import knex, { Knex } from 'knex'
import knexConfig from '../../knexfile' // Assumes knexfile.js renamed to knexfile.ts
import * as SDK from '@bsv/sdk'
import { Request, Response } from 'express'
import { Utils } from '@bsv/sdk'

const db: Knex = knex(knexConfig)

export default {
  type: 'post',
  path: '/invoice',
  knex: db,c
  func: async (req: Request, res: Response): Promise<void> => {
    // Extract the necessary information from the request body
    const { paymentButtonId, merchantId, currency, amount } = req.body as {
      paymentButtonId: string
      merchantId: string
      currency: string
      amount: number
    }

    try {
      // Verify the payment button exists and belongs to the specified merchant
      const button = await db('payment_buttons')
        .where({
          button_id: paymentButtonId,
          merchant_id: merchantId
        })
        .first()

      if (!button) {
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
        return res.status(400).json({
          status: 'error',
          message: 'Amount and/or currency mismatch for fixed-amount button.'
        })
        return
      }

      // Create a new payment with complete=false
      const paymentID = require('crypto').randomBytes(12).toString('hex')
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

      // Replace sendover with @bsv/sdk equivalent
      const senderPrivateKey = new SDK.PrivateKey(
        '0000000000000000000000000000000000000000000000000000000000000001',
        'hex'
      )
      const recipientPublicKey = SDK.PublicKey.fromString(button.merchant_id)
      const invoiceNumber = `2-3241645161d8-${paymentID} 1`
      const combined = Utils.toArray(
        `${senderPrivateKey.toString()}${recipientPublicKey.toString()}${invoiceNumber}`,
        'utf8'
      )
      const derivedHash = SDK.Hash.sha256(SDK.Hash.sha256(combined))
      const derivedPriv = new SDK.PrivateKey(Utils.toHex(derivedHash), 'hex')
      const derivedPublicKey = derivedPriv.toPublicKey().toString()

      const pkh = new SDK.P2PKH()
      const derivedScript = pkh.lock(SDK.PublicKey.fromString(derivedPublicKey).toHash()).toHex()

      // Respond with the payment ID
      res.status(200).json({
        status: 'success',
        message: 'Invoice created successfully',
        paymentId: paymentID,
        outputs: [
          {
            script: derivedScript,
            satoshis: Math.round(amount * 100000000)
          }
        ]
      })
    } catch (error) {
      console.error('Error creating invoice:', error)
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      })
    }
  }
}
