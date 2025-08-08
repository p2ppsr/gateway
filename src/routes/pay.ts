/**
 * @file src/routes/pay.ts
 *
 * POST route to complete a payment by submitting a transaction.
 * Validates the submitted transaction against the invoice created earlier, ensuring:
 * - The invoice exists and belongs to the caller.
 * - The transaction is well-formed and matches the expected locking script and tip amount (1 sat fee ignored).
 * - The payment button (if single-use) has not already been used.
 *
 * Upon successful validation, the database is updated to mark the payment as complete,
 * store the atomic BEEF transaction, and update the button's usage state and total paid.
 *
 * Used by the Gateway frontend when submitting an invoice payment using the Metanet client.
 *
 * Version: v2.9 (Updated 05Aug2025_0645 BST to validate using client-provided lockingScript)
 * Change Log:
 * - 05Aug2025_0430 BST (v2.2): Fixed payment_button_id mapping and standardized route path.
 * - 05Aug2025_0600 BST (v2.3): Updated to use transaction_id in where clause (incomplete fix).
 * - 05Aug2025_0615 BST (v2.4): Corrected transaction_id query to match schema, ensuring compatibility with trigger update_transaction_id.
 * - 05Aug2025_0620 BST (v2.5): Adjusted locking script derivation to use original paymentId for consistency, fixing mismatch with wallet-generated transaction.
 * - 05Aug2025_0625 BST (v2.6): Restored original locking script derivation using payment_button_id to match pre-transaction_id change behavior, resolving 400 Bad Request error.
 * - 05Aug2025_0630 BST (v2.7): Added explicit logging of payment_button_id and invoiceNumber used in locking script derivation for debugging.
 * - 05Aug2025_0640 BST (v2.8): Added detailed logging of senderIdentityKey, senderPrivateKeyString, combined array, and derivedPublicKey to diagnose key derivation mismatch.
 * - 05Aug2025_0645 BST (v2.9): Updated to validate using client-provided lockingScript from invoice response, avoiding re-derivation issues.
 */
import knex, { Knex } from 'knex'
import knexConfig from '../../knexfile'
import { Hash, P2PKH, PrivateKey, PublicKey, Transaction, Utils } from '@bsv/sdk'
import { Request, Response } from 'express'
const db: Knex = knex(knexConfig)

interface Payment {
  payment_id: string
  completed: boolean
  from: string
  payment_button_id: string
  amount: number
}

interface PaymentButton {
  payment_id: string // Changed from button_id to match the foreign key
  multi_use: boolean
  used: boolean
  merchant_id: string
  total_paid: number
}

interface RequestBody {
  paymentId: string // Changed from paymentId to align with new identifier usage
  transaction: {
    txid: string
    atomicBeefTx: string
  }
  lockingScript?: string // Added to accept the invoice lockingScript
}

interface AuthRequest extends Request {
  auth: {
    identityKey: string
  }
}

export default {
  type: 'post' as const,
  path: '/pay', // Standardized route path
  /**
   * Express route handler to validate and record a completed payment.
   *
   * This function:
   * - Confirms the payment ID exists, is incomplete, and matches the user.
   * - Validates the atomic BEEF transaction structure and integrity.
   * - Uses the client-provided lockingScript from the invoice response for validation.
   * - Confirms the transaction includes an output matching the script and exact tip amount (1 sat fee ignored).
   * - Marks the payment as complete and updates the payment button in the database.
   *
   * @param req - Express request with `paymentId`, `transaction { txid, atomicBeefTx }`, and `lockingScript` in the body.
   * Also requires `auth.identityKey` from authentication middleware.
   * @param res - Express response object to return a success or failure message.
   * @returns {Promise<void>} Sends HTTP 200 on success or appropriate error status.
   */
  func: async (req: AuthRequest, res: Response): Promise<void> => {
    const { paymentId, transaction, lockingScript }: RequestBody = req.body
    try {
      const payment: Payment | undefined = await db('payments')
        .where({
          transaction_id: paymentId,
          completed: false
        })
        .first()
      if (payment == null) {
        res.status(404).json({
          status: 'error',
          message: 'Payment not found or already completed'
        })
        return
      }
      if (payment.from !== req.auth.identityKey) {
        res.status(401).json({
          status: 'error',
          message: 'Payment not originated by the same user'
        })
        return
      }
      const button: PaymentButton | undefined = await db('payment_buttons')
        .where({
          payment_id: payment.payment_button_id
        })
        .first()
      if (button == null) {
        res.status(404).json({
          status: 'error',
          message: 'Payment button not found'
        })
        return
      }
      if (!button.multi_use && button.used) {
        res.status(400).json({
          status: 'error',
          message: 'The single-use button has already been used'
        })
        return
      }
      // Parse and validate the transaction
      const { txid, atomicBeefTx } = transaction
      if (
        txid === undefined ||
        txid === '' ||
        atomicBeefTx === undefined ||
        atomicBeefTx === '' ||
        typeof atomicBeefTx !== 'string' ||
        !/^[0-9a-fA-F]+$/.test(atomicBeefTx)
      ) {
        throw new Error('❌ Invalid transaction: txid or atomicBeefTx missing or invalid')
      }
      let bsvtx: Transaction
      try {
        const txArray: number[] = Utils.toArray(atomicBeefTx, 'hex')
        bsvtx = Transaction.fromAtomicBEEF(txArray)
      } catch (e: unknown) {
        throw new Error('❌ Invalid transaction format: unable to parse atomicBeefTx')
      }
      if (bsvtx.outputs == null || bsvtx.outputs.length === 0) {
        throw new Error('❌ Invalid transaction: no outputs available')
      }
      // Validate txid matches
      if (bsvtx.id('hex') !== txid) {
        throw new Error('❌ Transaction ID mismatch')
      }
      // Use client-provided lockingScript for validation
      if (!lockingScript) {
        throw new Error('❌ Missing lockingScript in request')
      }
      console.log('🔍 [pay] Using client-provided lockingScript:', lockingScript) // Explicit log
      const expectedAmount: number = payment.amount
      //*const expectedAmount: number = Math.round(payment.amount * 100000000) // Convert BSV to satoshis
      // Enhanced debugging of transaction outputs
      console.log('🔍 Expected locking script:', lockingScript)
      console.log('🔍 Expected amount (sats):', expectedAmount)
      let totalTransactionSatoshis = 0
      bsvtx.outputs.forEach((out: Transaction['outputs'][number], i: number): void => {
        console.log(`🔍 Transaction Output ${i} script:`, out.lockingScript.toHex())
        console.log(`🔍 Transaction Output ${i} sats:`, out.satoshis)
        totalTransactionSatoshis += out.satoshis || 0
      })
      console.log('🔍 Total transaction satoshis:', totalTransactionSatoshis)
      // Explicitly check expected vs received tip amount
      const matchingOutput = bsvtx.outputs.find(
        (x: Transaction['outputs'][number]): boolean =>
          x.lockingScript.toHex() === lockingScript && x.satoshis === expectedAmount
      )
      if (matchingOutput) {
        console.log('🔍 Verified: Expected amount', expectedAmount, 'matches received', matchingOutput.satoshis)
      } else {
        console.warn('❌ Mismatch: No output matches expected amount', expectedAmount)
      }
      // Verify total matches sum of outputs
      const calculatedTotal = bsvtx.outputs.reduce((sum, out) => sum + (out.satoshis || 0), 0)
      if (totalTransactionSatoshis !== calculatedTotal) {
        console.warn('❌ Total satoshis mismatch: Logged', totalTransactionSatoshis, 'vs Calculated', calculatedTotal)
      } else {
        console.log('🔍 Verified: Total satoshis', totalTransactionSatoshis, 'matches sum of outputs')
      }
      // Check for exact match on tip amount (1 sat fee ignored as per requirement)
      if (matchingOutput == null) {
        res.status(400).json({
          status: 'error',
          message: 'The transaction does not satisfy the invoice'
        })
        return
      }
      // Update database
      await db.transaction(async (trx: Knex.Transaction): Promise<void> => {
        await trx('payments')
          .where({ transaction_id: paymentId })
          .update({
            completed: true,
            transaction_info: JSON.stringify({ txid, atomicBeefTx }),
            is_new: true
          })
        await trx('payment_buttons')
          .where({ payment_id: payment.payment_button_id })
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
    } catch (error: unknown) {
      console.error('❌ Pay error:', error)
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      })
    }
  }
}
