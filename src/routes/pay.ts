/**
 * @file src/routes/pay.ts
 *
 * POST route to complete a payment by submitting a transaction.
 * Validates the submitted transaction against the invoice created earlier, ensuring:
 * - The paymentId and buttonId exist in the ids table with colorimetric types (payment and button, respectively), pre-created at gateway launch.
 * - The transaction is well-formed and matches the expected locking script (amount validated from transaction).
 * - The payment exists in the payments table and is not already completed.
 *
 * Upon successful validation, the database is updated to mark the payment as complete,
 * store the atomic BEEF transaction, and record the txid.
 * The txid is received from the client and validated, then stored directly without extraction.
 *
 * Used by the Gateway frontend when submitting an invoice payment using the Metanet client.
 *
 * Version: v4.25 (Updated 27Aug2025_0155 BST to fix variable button amount validation)
 * Change Log:
 * - 27Aug2025_0155 BST (v4.25): Used req.body.amount for variable buttons to match client-provided amount, ensuring identical first payment behavior.
 * - 05Aug2025_0430 BST (v2.2): Fixed payment_button_id mapping and standardized route path.
 * - 05Aug2025_0600 BST (v2.3): Updated to use transaction_id in where clause (incomplete fix).
 * - 05Aug2025_0615 BST (v2.4): Corrected transaction_id query to match schema, ensuring compatibility with trigger update_transaction_id.
 * - 05Aug2025_0620 BST (v2.5): Adjusted locking script derivation to use original paymentId for consistency, fixing mismatch with wallet-generated transaction.
 * - 05Aug2025_0625 BST (v2.6): Restored original locking script derivation using payment_button_id to match pre-transaction_id change behavior, resolving 400 Bad Request error.
 * - 05Aug2025_0630 BST (v2.7): Added explicit logging of payment_button_id and invoiceNumber used in locking script derivation for debugging.
 * - 05Aug2025_0640 BST (v2.8): Added detailed logging of senderIdentityKey, senderPrivateKeyString, combined array, and derivedPublicKey to diagnose key derivation mismatch.
 * - 05Aug2025_0645 BST (v2.9): Updated to validate using client-provided lockingScript from invoice response, avoiding re-derivation issues.
 * - 12Aug2025_2140 BST (v3.0): Fixed schema references from payment_id/payment_button_id to transaction_id/id, added request logging, and enhanced response debugging.
 * - 12Aug2025_2150 BST (v3.1): Fixed TypeScript return type issues by ensuring Promise<void> compatibility, preserving schema and debugging updates.
 * - 12Aug2025_2215 BST (v3.2): Fixed payment button lookup with a join on payments and payment_buttons, added join debugging.
 * - 13Aug2025_0100 BST (v3.3): Switched to txid as primary key, removed transaction_id.
 * - 13Aug2025_0130 BST (v3.4): Switched to payment_id as primary key, renamed button_id_ref to button_id, payer_identity to payer_id.
 * - 13Aug2025_0135 BST (v3.5): Ensured payment_id and button_id reference ids.id consistently.
 * - 13Aug2025_0153 BST (v3.6): Emphasized txid input from client, no extraction from blockchain_transaction.
 * - 13Aug2025_0200 BST (v3.7): Fixed TypeScript errors for uuid import and PaymentButton.amount property.
 * - 13Aug2025_0205 BST (v3.8): Removed dependency on button.amount, validated amount from transaction, clarified uuid as optional for payment_id generation.
 * - 13Aug2025_0215 BST (v3.9): Replaced uuid with custom 12-character payment_id generation to match schema constraint.
 * - 13Aug2025_0225 BST (v4.0): Updated to use client-passed paymentId instead of generating it server-side.
 * - 13Aug2025_0230 BST (v4.1): Validated pre-created paymentId and buttonId against ids table types.
 * - 13Aug2025_0235 BST (v4.2): Corrected button_id usage to use client-passed buttonId directly.
 * - 13Aug2025_1020 BST (v4.3): Added P2PKH locking script validation for secure transaction matching.
 * - 13Aug2025_1030 BST (v4.4): Updated P2PKH validation to use transaction_id instead of payment_id for security.
 * - 13Aug2025_1040 BST (v4.5): Added validation for transaction_id in request to ensure consistency.
 * - 13Aug2025_1045 BST (v4.6): Fetched transaction_id server-side and removed from request, included in error messages only.
 * - 13Aug2025_1050 BST (v4.7): Fixed payment scope and ensured transaction_id access from DB.
 * - 13Aug2025_1100 BST (v4.8): Fixed P2PKH scope and improved amount validation using matchingOutput.
 * - 13Aug2025_1115 BST (v4.9): Used global erroneousTransactionId for P2PKH validation as a temporary fix.
 * - 13Aug2025_1120 BST (v4.10): Fixed P2PKH scoping with proper nesting to meet open-source standards.
 * - 13Aug2025_1125 BST (v4.11): Reverified and corrected P2PKH scoping to resolve persistent errors.
 * - 13Aug2025_1130 BST (v4.12): Fixed payment scoping per ChatGPT suggestion with let declaration outside try.
 * - 13Aug2025_1155 BST (v4.13): Fixed transaction_id in payments update to resolve 500 error.
 * - 13Aug2025_1200 BST (v4.14): Ensured transaction_id is preserved in payments update.
 * - 13Aug2025_1200 BST (v4.15): Added type guard for payment in catch block to resolve TS18048.
 * - 13Aug2025_1205 BST (v4.16): Improved type guard for payment in catch block to fully resolve TS18048.
 * - 13Aug2025_1205 BST (v4.17): Used local non-undefined alias for payment per ChatGPT suggestion.
 * - 13Aug2025_1215 BST (v4.18): Fixed P2PKH derivation using payer_id to resolve 400 error.
 * - 13Aug2025_1220 BST (v4.19): Refined P2PKH validation and ensured payer_id consistency.
 * - 14Aug2025_0040 BST (v4.20): Updated to use payment_id instead of id in payment button query.
 * - 20Aug2025_1925 BST (v4.21): Updated to validate against payments table only, removing payment_buttons query to fix 404 error for multi-use buttons.
 * - 25Aug2025_2030 BST (v4.22): Updated to modify existing payments records from createButton.ts after validation.
 * - 25Aug2025_2020 BST (v4.23): Used payment.amount for variable-amount buttons, added explicit lockingScript validation.
 * - 25Aug2025_2115 BST (v4.24): Removed redundant commented code for clarity.
 */
const F = 'routes/pay'
import knex, { Knex } from 'knex'
import knexConfig from '../../knexfile'
import { Hash, P2PKH, PrivateKey, PublicKey, Transaction, Utils } from '@bsv/sdk'
import { Request, Response } from 'express'
import { logWithTimestamp } from '../utils/logging'
const db: Knex = knex(knexConfig)
let payment: Payment | undefined // Declare payment outside try block for broader scope
interface Payment {
  payment_id: string
  button_id: string
  payer_id: string | null
  merchant_id: string
  amount: number
  completed: boolean
  transaction_id: string // Added to reflect schema
  txid: string | null
}
interface RequestBody {
  paymentId: string // Client-passed paymentId referencing ids.id with type='payment'
  buttonId: string // Client-passed buttonId referencing ids.id with type='button'
  transaction: {
    txid: string
    atomicBeefTx: string
  }
  lockingScript?: string
  amount?: number // Added to support variable button amount
}
interface AuthRequest extends Request {
  auth: {
    identityKey: string
  }
}
export default {
  type: 'post' as const,
  path: '/pay',
  func: async (req: AuthRequest, res: Response): Promise<void> => {
    logWithTimestamp(F, '🔍 [pay] Received pay request:', req.body)
    const { paymentId, buttonId, transaction, lockingScript, amount }: RequestBody = req.body
    try {
      // Validate that paymentId exists in ids with type='payment'
      const paymentIdRecord = await db('ids').where({ id: paymentId, type: 'payment' }).first()
      if (!paymentIdRecord) {
        logWithTimestamp(F, '❌ [pay] Invalid paymentId: not found in ids with type=payment:', { paymentId })
        res.status(400).json({
          status: 'error',
          message: 'Invalid paymentId: must reference an existing ids record with type=payment'
        })
        return
      }
      // Validate that buttonId exists in ids with type='button'
      const buttonIdRecord = await db('ids').where({ id: buttonId, type: 'button' }).first()
      if (!buttonIdRecord) {
        logWithTimestamp(F, '❌ [pay] Invalid buttonId: not found in ids with type=button:', { buttonId })
        res.status(400).json({
          status: 'error',
          message: 'Invalid buttonId: must reference an existing ids record with type=button'
        })
        return
      }
      // Assign payment from database query
      payment = await db('payments')
        .where({
          payment_id: paymentId,
          button_id: buttonId,
          completed: false
        })
        .first()
      if (!payment) {
        logWithTimestamp(F, '❌ [pay] Payment not found or already completed:', { paymentId, buttonId })
        res.status(404).json({
          status: 'error',
          message: 'Payment not found or already completed'
        })
        return
      }
      const paymentRec: Payment = payment as Payment // Local non-undefined alias
      logWithTimestamp(F, '🔍 [pay] Retrieved payment record:', paymentRec)
      if (paymentRec.merchant_id !== req.auth.identityKey) {
        logWithTimestamp(F, '❌ [pay] Payment not originated by the same user:', {
          merchant_id: paymentRec.merchant_id,
          identityKey: req.auth.identityKey
        })
        res.status(401).json({
          status: 'error',
          message: 'Payment not originated by the same user'
        })
        return
      }
      const { txid, atomicBeefTx } = transaction
      if (!txid || !atomicBeefTx || typeof atomicBeefTx !== 'string' || !/^[0-9a-fA-F]+$/.test(atomicBeefTx)) {
        throw new Error('❌ Invalid transaction: txid or atomicBeefTx missing or invalid')
      }
      let bsvtx: Transaction
      try {
        const txArray: number[] = Utils.toArray(atomicBeefTx, 'hex')
        bsvtx = Transaction.fromAtomicBEEF(txArray)
      } catch (e: unknown) {
        throw new Error('❌ Invalid transaction format: unable to parse atomicBeefTx')
      }
      if (!bsvtx.outputs || bsvtx.outputs.length === 0) {
        throw new Error('❌ Invalid transaction: no outputs available')
      }
      if (bsvtx.id('hex') !== txid) {
        throw new Error('❌ Transaction ID mismatch')
      }
      if (!lockingScript) {
        throw new Error('❌ Missing lockingScript in request')
      }
      logWithTimestamp(F, '🔍 [pay] Using client-provided lockingScript:', lockingScript)
      // Derive expected script and amount using P2PKH with payer_id
      const senderPrivateKey: PrivateKey = paymentRec.payer_id
        ? new PrivateKey(paymentRec.payer_id, 'hex')
        : new PrivateKey('0000000000000000000000000000000000000000000000000000000000000001', 'hex') // Fallback if payer_id is null
      const recipientPublicKey: PublicKey = PublicKey.fromString(paymentRec.merchant_id)
      const invoiceNumber: string = `2-3241645161d8-${paymentRec.transaction_id} 1` // Use transaction_id from payment
      const senderPrivateKeyString: string = senderPrivateKey.toString()
      const recipientPublicKeyString: string = recipientPublicKey.toString()
      const combined: number[] = Utils.toArray(
        `${senderPrivateKeyString}${recipientPublicKeyString}${invoiceNumber}`,
        'utf8'
      )
      const derivedHash: number[] = Array.from(Hash.sha256(Hash.sha256(combined)))
      const derivedPriv: PrivateKey = new PrivateKey(Utils.toHex(derivedHash), 'hex')
      const derivedPublicKey: string = derivedPriv.toPublicKey().toString()
      const pkh: P2PKH = new P2PKH()
      const derivedScript: string = pkh.lock(PublicKey.fromString(derivedPublicKey).toHash()).toHex()
      const button = await db('payment_buttons').where({ button_id: buttonId }).first();
      if (!button) {
        logWithTimestamp(F, '❌ [pay] Button not found:', { buttonId });
        res.status(404).json({
          status: 'error',
          message: 'Button not found in payment_buttons'
        });
        return;
      }
      // Validate lockingScript
      if (lockingScript !== derivedScript) {
        logWithTimestamp(F, '❌ [pay] Locking script mismatch:', { client: lockingScript, server: derivedScript });
        res.status(400).json({ status: 'error', message: 'Invalid lockingScript: does not match server-derived script' });
        return;
      }
      // Validate transaction output
      // Line above: logWithTimestamp(F, '🔍 [pay] Using client-provided lockingScript:', lockingScript)
      const expectedAmount = button.variable_amount ? (Number(req.body.amount) || paymentRec.amount) : button.amount;
      logWithTimestamp(F, '🔍 [pay] Expected amount (sats):', { expectedAmount, providedAmount: req.body.amount, paymentAmount: paymentRec.amount });
      // Line below: if (expectedAmount <= 0)
      if (expectedAmount <= 0) {
        logWithTimestamp(F, '❌ [pay] Invalid amount from transaction:', { expectedAmount });
        res.status(400).json({
          status: 'error',
          message: 'Invalid amount in transaction'
        });
        return;
      }
      logWithTimestamp(F, '🔍 [pay] Derived locking script:', derivedScript);
      logWithTimestamp(F, '🔍 [pay] Expected amount (sats):', expectedAmount);
      const matchingOutput = bsvtx.outputs.find(
        (x: Transaction['outputs'][number]): boolean =>
          x.lockingScript.toHex() === lockingScript && x.satoshis === expectedAmount
      );
      if (!matchingOutput) {
        bsvtx.outputs.forEach((out: Transaction['outputs'][number], i: number): void => {
          logWithTimestamp(F, `🔍 Output ${i} script:`, out.lockingScript.toHex());
          logWithTimestamp(F, `🔍 Output ${i} sats:`, out.satoshis);
        });
        res.status(400).json({
          status: 'error',
          message: 'The transaction does not satisfy the invoice or amount mismatch'
        });
        return;
      }
      logWithTimestamp(F, '✅ [pay] Matching output found:', {
        script: matchingOutput.lockingScript.toHex(),
        satoshis: expectedAmount
      });
      await db.transaction(async (trx: Knex.Transaction) => {
        const existingPayment = await trx('payments').where({ payment_id: paymentId, button_id: buttonId }).first();
        if (!existingPayment) {
          logWithTimestamp(F, '❌ [pay] Payment record not found:', { paymentId, buttonId });
          res.status(404).json({ status: 'error', message: 'Payment record not found' });
          return;
        }
        if (existingPayment.completed) {
          logWithTimestamp(F, '❌ [pay] Payment already completed:', { paymentId, buttonId });
          await trx('payment_buttons').where({ button_id: buttonId }).update({ used: true, updated_at: trx.fn.now() });
          res.status(400).json({ status: 'error', message: 'Payment already completed' });
          return;
        }
        await trx('payments').where({ payment_id: paymentId, button_id: buttonId }).update({
          completed: true,
          blockchain_transaction: JSON.stringify({ txid, atomicBeefTx }),
          txid: txid,
          amount: expectedAmount,
          updated_at: trx.fn.now()
        });
        await trx('payment_buttons').where({ button_id: buttonId }).update({ used: true, updated_at: trx.fn.now() });
        // await trx('payments').where({ payment_id: paymentId, button_id: buttonId }).update({
        //   completed: true,
        //   blockchain_transaction: JSON.stringify({ txid, atomicBeefTx }),
        //   txid: txid,
        //   amount: expectedAmount,
        //   updated_at: new Date()
        // });
        // await trx('payment_buttons').where({ button_id: buttonId }).increment('total_paid', expectedAmount);
        // if (!button.multi_use) {
        //   await trx('payment_buttons').where({ payment_id: paymentId }).update({ used: true, updated_at: trx.fn.now() });
        //   logWithTimestamp(F, '✅ [pay] Marked single-use button as used:', { paymentId });
        // }
        logWithTimestamp(F, '✅ [pay] Updated payment:', { paymentId, buttonId });
      })
      logWithTimestamp(F, `✅ [pay] Payment successful. TXID: ${txid}`)
      const responseData = { status: 'success', message: 'Payment completed successfully', txid }
      logWithTimestamp(F, '🔍 [pay] Response data:', responseData)
      res.status(200).json(responseData)
      return
    } catch (error: unknown) {
      const transactionIdForLog = payment && 'transaction_id' in payment ? payment.transaction_id : 'N/A'
      logWithTimestamp(F, '❌ [pay] Error processing payment:', {
        message: error instanceof Error ? error.message : '❌ Unknown error',
        stack: error instanceof Error ? error.stack : '❌ No stack trace',
        requestBody: req.body,
        transaction_id: transactionIdForLog
      })
      res.status(500).json({
        status: 'error',
        message: `❌ Internal server error: ${error instanceof Error ? error.message : 'Unknown error'} (transaction_id: ${transactionIdForLog})`
      })
      return
    }
  }
}
