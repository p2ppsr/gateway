/**
 * @file src/routes/pay.ts
 *
 * POST route to complete a payment by submitting a transaction.
 * Validates the submitted transaction against the invoice created earlier, ensuring:
 * - The invoice exists and belongs to the caller.
 * - The transaction is well-formed and matches the expected locking script and amount.
 * - The payment button (if single-use) has not already been used.
 *
 * Upon successful validation, the database is updated to mark the payment as complete,
 * store the atomic BEEF transaction, and update the button's usage state and total paid.
 *
 * Used by the Gateway frontend when submitting an invoice payment using the Metanet client.
 */

import knex, { Knex } from 'knex'
import knexConfig from '../../knexfile'
import { Hash, P2PKH, PrivateKey, PublicKey, Transaction, Utils } from '@bsv/sdk'
import { Request, Response } from 'express'

const db: Knex = knex(knexConfig)

export default {
  type: 'post',
  path: '/pay',

  /**
   * Express route handler to validate and record a completed payment.
   *
   * This function:
   * - Confirms the payment ID exists, is incomplete, and matches the user.
   * - Validates the atomic BEEF transaction structure and integrity.
   * - Derives the expected locking script from the sender and merchant info.
   * - Confirms the transaction includes an output matching the script and amount.
   * - Marks the payment as complete and updates the payment button in the database.
   *
   * @param req - Express request with `paymentId` and `transaction { txid, atomicBeefTx }` in the body.
   *              Also requires `auth.identityKey` from authentication middleware.
   * @param res - Express response object used to return a success or failure message.
   * @returns {Promise<void>} Sends HTTP 200 on success or appropriate error status.
   */
  func: async (req: Request, res: Response): Promise<void> => {
    const { paymentId, transaction } = req.body as {
      paymentId: string
      transaction: { txid: string; atomicBeefTx: string }
    }
    try {
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

      // Parse and validate the transaction
      const { txid, atomicBeefTx } = transaction
      if (!txid || !atomicBeefTx || typeof atomicBeefTx !== 'string' || !/^[0-9a-fA-F]+$/.test(atomicBeefTx)) {
        throw new Error('Invalid transaction: txid or atomicBeefTx missing or invalid')
      }

      let bsvtx: Transaction
      try {
        const txArray = Utils.toArray(atomicBeefTx, 'hex')
        bsvtx = Transaction.fromAtomicBEEF(txArray)
      } catch (e) {
        console.error('❌ Transaction parsing failed:', e)
        throw new Error('Invalid transaction format: unable to parse atomicBeefTx')
      }

      if (!bsvtx || !bsvtx.outputs || bsvtx.outputs.length === 0) {
        throw new Error('Invalid transaction: no outputs available')
      }

      // Validate txid matches
      if (bsvtx.id('hex') !== txid) {
        throw new Error('Transaction ID mismatch')
      }

      // Derive expected script and amount
      const senderPrivateKey = new PrivateKey('0000000000000000000000000000000000000000000000000000000000000001', 'hex')
      const recipientPublicKey = PublicKey.fromString(button.merchant_id)
      const invoiceNumber = `2-3241645161d8-${payment.payment_id} 1`
      const combined = Utils.toArray(
        `${senderPrivateKey.toString()}${recipientPublicKey.toString()}${invoiceNumber}`,
        'utf8'
      )
      const derivedHash = Hash.sha256(Hash.sha256(combined))
      const derivedPriv = new PrivateKey(Utils.toHex(derivedHash), 'hex')
      const derivedPublicKey = derivedPriv.toPublicKey().toString()
      const pkh = new P2PKH()
      const derivedScript = pkh.lock(PublicKey.fromString(derivedPublicKey).toHash()).toHex()
      const expectedAmount = Math.round(payment.amount * 100000000) // Convert BSV to satoshis

      // Check outputs for a match
      const matchingOutput = bsvtx.outputs.find(
        x => x.lockingScript.toHex() === derivedScript && x.satoshis === expectedAmount
      )
      if (!matchingOutput) {
        bsvtx.outputs.forEach((out, i) => {
          console.log(`🔍 Output ${i} script:`, out.lockingScript.toHex())
          console.log(`🔍 Output ${i} sats:`, out.satoshis)
        })
        res.status(400).json({
          status: 'error',
          message: 'The transaction does not satisfy the invoice'
        })
        return
      }

      // Update database
      await db.transaction(async (trx: Knex.Transaction) => {
        await trx('payments')
          .where({ payment_id: paymentId })
          .update({
            completed: true,
            transaction_info: JSON.stringify({ txid, atomicBeefTx }),
            is_new: true
          })

        await trx('payment_buttons')
          .where({ button_id: payment.payment_button_id })
          .update({
            used: true,
            total_paid: db.raw('?? + ?', ['total_paid', payment.amount])
          })
      })

      console.log(`✅ Payment successful. TXID: ${txid}`)

      res.status(200).json({
        status: 'success',
        message: 'Payment completed successfully',
        txid
      })
    } catch (error) {
      console.error('❌ Pay error:', error)
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      })
    }
  }
}
