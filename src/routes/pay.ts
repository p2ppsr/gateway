// src/routes/pay.ts
import knex, { Knex } from 'knex'
import knexConfig from '../../knexfile' // Assumes knexfile.js renamed to knexfile.ts
import * as SDK from '@bsv/sdk'
import { Request, Response } from 'express'
import { Utils } from '@bsv/sdk'

const db: Knex = knex(knexConfig)

export default {
  type: 'post',
  path: '/pay',

  func: async (req: Request, res: Response): Promise<void> => {
    // Extract the necessary information from the request body
    const { paymentId, transaction } = req.body as {
      paymentId: string
      transaction: string
    }

    try {
      // Verify the payment exists and has not been completed
      const payment = await db('payments')
        .where({
          payment_id: paymentId,
          completed: false
        })
        .first()

      if (!payment) {
        res.status(404).json({
          status: 'error',
          message: 'Payment not found or already completed'
        })
        return
      }

      if (payment.from !== (req as any).auth.identityKey) {
        res.status(401).json({
          status: 'error',
          message: 'Payment not originated by the same user'
        })
        return
      }

      // Verify the associated button has not been marked as used if it is single-use
      const button = await db('payment_buttons')
        .where({
          button_id: payment.payment_button_id
        })
        .first()

      if (!button.multi_use && button.used) {
        res.status(400).json({
          status: 'error',
          message: 'The single-use button has already been used'
        })
        return
      }

      // !!! BIG TODO: Verify transaction SPV data!
      // ChainTracks or similar needs to be used to prevent double spends.

      // Verify transaction output script
      // Replace sendover with @bsv/sdk equivalent
      const senderPrivateKey = new SDK.PrivateKey(
        '0000000000000000000000000000000000000000000000000000000000000001',
        'hex'
      )
      const recipientPublicKey = SDK.PublicKey.fromString(button.merchant_id)
      const invoiceNumber = `2-3241645161d8-${payment.payment_id} 1`
      const combined = Utils.toArray(
        `${senderPrivateKey.toString()}${recipientPublicKey.toString()}${invoiceNumber}`,
        'utf8'
      )
      const derivedHash = SDK.Hash.sha256(SDK.Hash.sha256(combined))
      const derivedPriv = new SDK.PrivateKey(Utils.toHex(derivedHash), 'hex')
      const derivedPublicKey = derivedPriv.toPublicKey().toString()

      const expectedAmount = Math.round(payment.amount * 100000000)

      const pkh = new SDK.P2PKH()
      const derivedScript = pkh.lock(SDK.PublicKey.fromString(derivedPublicKey).toHash()).toHex()
      const parsedTXEnvelope = JSON.parse(transaction)
      const bsvtx = SDK.Transaction.fromHex(parsedTXEnvelope.rawTx)
      if (
        !bsvtx.outputs.some(
          (x: SDK.TransactionOutput) => x.lockingScript.toHex() === derivedScript && x.satoshis === expectedAmount
        )
      ) {
        res.status(400).json({
          status: 'error',
          message: 'The transaction does not satisfy the invoice'
        })
        return
      }

      // If checks pass, update the payment as completed and the button as used
      await db.transaction(async (trx: Knex.Transaction) => {
        // Set the payment as completed
        await trx('payments').where({ payment_id: paymentId }).update({
          completed: true,
          transaction_info: transaction,
          is_new: true
        })

        // Mark the button as used and increment the total amount paid to this button
        await trx('payment_buttons')
          .where({ button_id: payment.payment_button_id })
          .update({
            used: true,
            total_paid: db.raw('?? + ?', ['total_paid', payment.amount])
          })
      })

      // Respond with success
      res.status(200).json({
        status: 'success',
        message: 'Payment completed successfully'
      })
    } catch (error) {
      console.error('Error processing payment:', error)
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      })
    }
  }
}
