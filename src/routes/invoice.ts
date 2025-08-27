/**
 * @file src/routes/invoice.ts
 * @description POST route to create a payment invoice for a given paymentId and buttonId.
 * Validates the payment button, checks multi-use status, and generates a transaction output for payment processing.
 * For multi-use buttons, generates a new paymentId and updates the description accordingly.
 * Uses payment_buttons.description for the output description and generates a derived locking script.
 *
 * Version: v2.43 (Updated 25Aug2025_2130 BST to update transaction_id for first multi-use payment)
 * - 19Aug2025_1135 BST (v2.19): Replaced fetch call to /api/initializeIds with direct call to initializeIds handler.
 * - 19Aug202
 * _1145 BST (v2.20): Fixed TypeScript error with InitRequest interface, updated 'mock' to 'simulate frontend request'.
 * - 19Aug2025_1155 BST (v2.21): Fixed initRes to exit early on 409 response to prevent overwriting with 200.
 * - 19Aug2025_1205 BST (v2.22): Replaced initializeIds.func call with direct duplicate check in ids table.
 * - 19Aug2025_1220 BST (v2.23): Reverted to calling initializeIds.func with proper response handling, added paymentId to response.
 * - 19Aug2025_1230 BST (v2.24): Updated outputDescription to use new paymentId, ensured consistency with initializeIds.
 * - 19Aug2025_1240 BST (v2.25): Used payment_buttons.description for outputDescription.
 * - 20Aug2025_1422 BST (v2.26): Reverted to fetch call for /api/initializeIds to restore authentication middleware propagation, fixing 401 Unauthorized error.
 * - 20Aug2025_1427 BST (v2.27): Skipped /api/initializeIds call for valid multi-use buttons to avoid redundant authentication, fixing 403 Sender identity mismatch error.
 * - 20Aug2025_1445 BST (v2.29): Enhanced logging for ids table check and authentication context to debug second-click 403 error.
 * - 20Aug2025_1515 BST (v2.30): Modified to call /api/initializeIds for multi-use buttons to generate new paymentId, fixing duplicate payment_id error.
 * - 20Aug2025_1810 BST (v2.31): Generate new paymentId for multi-use buttons via direct database checks, bypassing /api/initializeIds to avoid 403 authentication errors.
 * - 20Aug2025_1850 BST (v2.32): Fixed timestamp format for ids table insertion to use MySQL-compatible DATETIME format (YYYY-MM-DD HH:MM:SS).
 * - 21Aug2025_2231 BST (v2.33): Enabled single-use buttons for first payment and disabled after use by updating 'used' flag.
 * - 23Aug2025_1515 BST (v2.34): Used generateAndValidateUniqueId utility for ID generation.
 * - 23Aug2025_1525 BST (v2.35): Updated generateAndValidateUniqueId to use generateBase58.
 * - 23Aug2025_1530 BST (v2.36): Used 'id' instead of 'newId' for clarity.
 * - 23Aug2025_1715 BST (v2.37): Required description and fixed argument error in generateAndValidateUniqueId call.
 * - 25Aug2025_1058 BST (v2.38): Added check for existing payment records for single-use buttons to prevent duplicate entries.
 * - 25Aug2025_1120 BST (v2.39): Explicitly handle ER_DUP_ENTRY errors during payment insertion to ensure correct response for single-use buttons.
 * - 25Aug2025_1520 BST (v2.40): Aligned lockingScript generation with pay.ts using payer_id from payments table or hardcoded fallback.
 * - 25Aug2025_2030 BST (v2.41): Removed payments insertion, relying on createButton.ts for auditability.
 * - 25Aug2025_2115 BST (v2.42): Removed redundant commented code at Step 3a and 6a, used existing paymentId for first multi-use payment, added payments insertion for subsequent multi-use payments.
 * - 25Aug2025_2130 BST (v2.43): Updated payments record with transaction_id for first multi-use payment to fix locking script mismatch.
 */
const F = 'routes/invoice'
import knex, { Knex } from 'knex'
import knexConfig from '../../knexfile'
import { randomBytes } from 'crypto'
import { Hash, P2PKH, PrivateKey, PublicKey, Utils } from '@bsv/sdk'
import { Request, Response } from 'express'
import { body, validationResult } from 'express-validator'
import { logWithTimestamp } from '../utils/logging'
import { CONFIG } from '../utils/constants'
import { generateAndValidateUniqueId } from '../utils/idGenerator'
const db: Knex = knex(knexConfig)

interface PaymentButton {
  button_id: string
  merchant_id: string
  payment_id: string | null
  multi_use: boolean
  used: boolean
  variable_amount: boolean
  amount: number
  description: string
  html_code: string
  total_paid: number | null
  created_at: string | null
  updated_at: string | null
}
interface RequestBody {
  paymentId: string
  buttonId: string
  merchantId: string
  amount: number
  description: string
}
export default {
  type: 'post',
  path: '/invoice',
  middlewares: [
    body('paymentId')
      .trim()
      .escape()
      .isString()
      .notEmpty()
      .withMessage('paymentId must be a non-empty string')
      .isLength({ min: 12, max: 24 })
      .withMessage('paymentId must be between 12 and 24 characters'),
    body('buttonId')
      .trim()
      .escape()
      .isString()
      .notEmpty()
      .withMessage('buttonId must be a non-empty string')
      .isLength({ min: 12, max: 24 })
      .withMessage('buttonId must be between 12 and 24 characters'),
    body('merchantId').trim().escape().isString().notEmpty().withMessage('merchantId must be a non-empty string'),
    body('amount').isInt({ min: 0 }).withMessage('Amount must be a non-negative integer').toInt(),
    body('description')
      .trim()
      .escape()
      .isString()
      .notEmpty()
      .withMessage('description is required')
      .isLength({ max: 80 })
      .withMessage('description exceeds maximum length of 80 characters')
  ],
  func: async (req: Request, res: Response): Promise<void> => {
    let transactionIdNew: string = randomBytes(12).toString('hex').slice(0, 12)
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      logWithTimestamp(F, '❌ [invoice] Validation errors:', errors.array())
      res.status(400).json({ status: 'error', message: '❌ Invalid parameters', errors: errors.array() })
      return
    }
    const senderIdentityKey = (req as any).auth?.identityKey
    logWithTimestamp(F, '🔍 [invoice] [Step 0] Sender identity key from auth context:', {
      senderIdentityKey,
      expectedMerchantId: req.body.merchantId,
      headers: req.headers
    })
    if (!senderIdentityKey) {
      logWithTimestamp(F, '❌ [invoice] Missing sender identity key from auth context')
      res.status(401).json({ status: 'error', message: '❌ Unauthorized: Missing sender identity' })
      return
    }
    let { paymentId, buttonId, merchantId, amount, description }: RequestBody = req.body
    let paymentDescription = description
    logWithTimestamp(F, '🔍 [invoice] [Step 1] Received request body:', {
      paymentId,
      buttonId,
      merchantId,
      amount,
      description
    })
    try {
      // Verify the payment button exists and belongs to the specified merchant
      logWithTimestamp(F, '🔍 [invoice] [Step 2] Executing query:', { paymentId, merchantId })
      const button: PaymentButton | undefined = await db('payment_buttons')
        .where({
          payment_id: paymentId,
          merchant_id: merchantId
        })
        .first()
      logWithTimestamp(F, '🔍 [invoice] [Step 2] Payment button data:', {
        ...button,
        description: button?.description || 'Not set'
      })
      if (button === undefined) {
        logWithTimestamp(F, '❌ [invoice] Payment button not found for merchant:', { paymentId, merchantId })
        res.status(404).json({
          status: 'error',
          message: 'Payment button not found for the specified merchant'
        })
        return
      }
      if (button.button_id !== buttonId) {
        logWithTimestamp(F, '❌ [invoice] Button ID mismatch:', { buttonId, expected: button.button_id })
        res.status(400).json({
          status: 'error',
          message: 'Button ID does not match the payment button'
        })
        return
      }
      logWithTimestamp(F, '🔍 [invoice] [Step 3] Checking multi-use status:', {
        multi_use: button.multi_use,
        used: button.used
      })
      if (!button.multi_use && button.used) {
        logWithTimestamp(F, '❌ [invoice] Single-use button already used:', paymentId)
        res.status(400).json({
          status: 'error',
          message: 'This single-use button has been used'
        })
        return
      }
      // Check for existing payment record
      const checkExistingPayment = await db('payments').where({ payment_id: paymentId, button_id: buttonId }).first()
      if (!checkExistingPayment) {
        logWithTimestamp(F, '❌ [invoice] No existing payment found for paymentId:', { paymentId, buttonId })
        res.status(404).json({
          status: 'error',
          message: 'No valid payment record found for this button'
        })
        return
      }
      if (checkExistingPayment.completed) {
        logWithTimestamp(F, '❌ [invoice] Payment already completed:', { paymentId, buttonId })
        res.status(400).json({
          status: 'error',
          message: 'This payment has already been completed'
        })
        return
      }
      if (!button.multi_use) {
        logWithTimestamp(F, '🔍 [invoice] Single-use button, using existing payment:', { paymentId, buttonId })
        await db('payments').where({ payment_id: paymentId, button_id: buttonId }).update({
          transaction_id: transactionIdNew,
          payer_id: senderIdentityKey,
          updated_at: db.fn.now()
        })
        logWithTimestamp(F, '✅ [invoice] [Step 4] Updated transaction_id and payer_id for existing payment:', {
          paymentId,
          transactionId: transactionIdNew,
          payer_id: senderIdentityKey
        })
      } else {
        logWithTimestamp(F, '🔍 [invoice] [Step 4] Generating new paymentId for multi-use button:', {
          originalPaymentId: paymentId
        })
        const { id, description: generatedDescription } = await generateAndValidateUniqueId(
          merchantId,
          'payment',
          description,
          paymentId
        )
        paymentId = id
        paymentDescription = generatedDescription
        logWithTimestamp(F, '🔍 [invoice] [Step 4] Generated new paymentId and description:', {
          paymentId,
          description: paymentDescription
        })
        await db('payments').insert({
          transaction_id: transactionIdNew,
          payment_id: paymentId,
          button_id: buttonId,
          payer_id: senderIdentityKey,
          merchant_id: merchantId,
          completed: false,
          blockchain_transaction: '',
          amount,
          description: paymentDescription,
          created_at: db.fn.now(),
          updated_at: db.fn.now(),
          is_new: 1
        })
        logWithTimestamp(F, '✅ [invoice] [Step 4] Inserted payment for paymentId:', { paymentId, buttonId })
      }
      // // Check for existing payment record
      // const checkExistingPayment = await db('payments').where({ payment_id: paymentId, button_id: buttonId }).first();
      // if (!checkExistingPayment || checkExistingPayment.completed) {
      //   if (button.multi_use) {
      //     logWithTimestamp(F, '🔍 [invoice] [Step 4] Generating new paymentId for multi-use button:', { originalPaymentId: paymentId });
      //     const { id, description: generatedDescription } = await generateAndValidateUniqueId(merchantId, 'payment', description, paymentId);
      //     paymentId = id;
      //     paymentDescription = generatedDescription;
      //     logWithTimestamp(F, '🔍 [invoice] [Step 4] Generated new paymentId and description:', { paymentId, description: paymentDescription });
      //   } else {
      //     logWithTimestamp(F, '❌ [invoice] Single-use button has no valid payment or is already completed:', { paymentId });
      //     res.status(400).json({
      //       status: 'error',
      //       message: 'This single-use button has already been used or has no valid payment'
      //     });
      //     return;
      //   }
      //   await db('payments').insert({
      //     transaction_id: transactionIdNew,
      //     payment_id: paymentId,
      //     button_id: buttonId,
      //     payer_id: senderIdentityKey,
      //     merchant_id: merchantId,
      //     completed: false,
      //     blockchain_transaction: '',
      //     amount,
      //     description: paymentDescription,
      //     created_at: db.fn.now(),
      //     updated_at: db.fn.now(),
      //     is_new: 1
      //   });
      //   logWithTimestamp(F, '✅ [invoice] [Step 4] Inserted payment for paymentId:', { paymentId, buttonId });
      // } else {
      //   logWithTimestamp(F, '🔍 [invoice] [Step 4] Using existing paymentId for first payment:', { paymentId });
      //   await db('payments').where({ payment_id: paymentId, button_id: buttonId }).update({
      //     transaction_id: transactionIdNew,
      //     payer_id: senderIdentityKey,
      //     updated_at: db.fn.now()
      //   });
      //   logWithTimestamp(F, '✅ [invoice] [Step 4] Updated transaction_id and payer_id for existing payment:', { paymentId, transactionId: transactionIdNew, payer_id: senderIdentityKey });
      // }
      logWithTimestamp(F, '🔍 [invoice] [Step 5] Validating amount:', {
        requested: amount,
        buttonAmount: button.amount,
        variable: button.variable_amount
      })
      if (!button.variable_amount && Math.abs(amount - button.amount) > 1) {
        logWithTimestamp(F, '❌ [invoice] Amount mismatch for fixed-amount button:', {
          requested: amount,
          expected: button.amount
        })
        res.status(400).json({
          status: 'error',
          message: 'Amount mismatch for fixed-amount button (expected satoshis)'
        })
        return
      }
      logWithTimestamp(F, '🔍 [invoice] [Step 6] Generating transaction ID:', transactionIdNew)
      const paymentsSchema = await db('information_schema.columns')
        .where({ table_name: 'payments' })
        .select('column_name')
      logWithTimestamp(
        F,
        '🔍 [invoice] [Step 6] Payments table schema:',
        paymentsSchema.map(col => col.column_name)
      )
      // Log existing payments for buttonId
      const existingPayments = await db('payments')
        .where({ button_id: buttonId })
        .select('transaction_id', 'payment_id')
      logWithTimestamp(F, '🔍 [invoice] [Step 6] Existing payments for buttonId:', {
        buttonId,
        existingPayments
      })
      try {
        if (!button.multi_use) {
          const existingPayment = await db('payments').where({ payment_id: paymentId }).first()
          if (existingPayment && existingPayment.completed) {
            logWithTimestamp(F, '❌ [invoice] [Step 7] Single-use payment already completed:', { paymentId })
            await db('payment_buttons')
              .where({ payment_id: paymentId, merchant_id: merchantId })
              .update({ used: true, updated_at: db.fn.now() })
            res.status(400).json({ status: 'error', message: 'This single-use button has already been used' })
            return
          }
        }
        logWithTimestamp(F, '✅ [invoice] [Step 7] Invoice prepared:', {
          paymentId,
          buttonId,
          transactionId: transactionIdNew
        })
      } catch (insertError) {
        const errorMessage = insertError instanceof Error ? insertError.message : 'Unknown error'
        logWithTimestamp(F, '❌ [invoice] Failed to insert payment:', {
          error: errorMessage,
          stack: insertError instanceof Error ? insertError.stack : 'No stack trace',
          paymentId,
          transactionId: transactionIdNew
        })
        if (errorMessage.includes('Duplicate entry') && !button.multi_use) {
          await db('payment_buttons')
            .where({ payment_id: paymentId, merchant_id: merchantId })
            .update({ used: true, updated_at: db.fn.now() })
          logWithTimestamp(F, '✅ [invoice] [Step 7] Marked single-use button as used due to duplicate entry:', {
            paymentId
          })
          res.status(400).json({
            status: 'error',
            message: 'This single-use button has already been used'
          })
          return
        }
        res.status(500).json({
          status: 'error',
          message: `Failed to create payment record: ${errorMessage}`
        })
        return
      }
      // let senderPrivateKey: PrivateKey;
      // try {
      //   const hasCreatedAt =
      //     (await db('information_schema.columns')
      //       .where({ table_name: 'payment_buttons', column_name: 'created_at' })
      //       .first()) !== undefined;
      //   if (!hasCreatedAt || !button.created_at || new Date(button.created_at) < new Date('2025-07-25T12:00:00Z')) {
      //     senderPrivateKey = new PrivateKey('0000000000000000000000000000000000000000000000000000000000000001', 'hex');
      //     logWithTimestamp(F, '🔍 [invoice] Using hardcoded key for pre-v1.2 or missing created_at button:', paymentId);
      //   } else {
      //     senderPrivateKey = new PrivateKey(senderIdentityKey, 'hex');
      //     logWithTimestamp(F, '🔍 [invoice] Using authenticated identity key for new button');
      //   }
      // } catch (err) {
      //   logWithTimestamp(F, '⚠️ [invoice] created_at column check failed, using hardcoded key as fallback:', err);
      //   senderPrivateKey = new PrivateKey('0000000000000000000000000000000000000000000000000000000000000001', 'hex');
      // }
      let senderPrivateKey: PrivateKey
      const existingPayment = await db('payments').where({ payment_id: paymentId }).first()
      if (existingPayment && existingPayment.payer_id) {
        senderPrivateKey = new PrivateKey(existingPayment.payer_id, 'hex')
        logWithTimestamp(F, '🔍 [invoice] Using payer_id from payments:', existingPayment.payer_id)
      } else {
        senderPrivateKey = new PrivateKey('0000000000000000000000000000000000000000000000000000000000000001', 'hex')
        logWithTimestamp(F, '🔍 [invoice] Using hardcoded key as fallback')
      }
      const recipientPublicKey = PublicKey.fromString(button.merchant_id)
      const invoiceNumber = `2-3241645161d8-${transactionIdNew} 1`
      const combined = Utils.toArray(
        `${senderPrivateKey.toString()}${recipientPublicKey.toString()}${invoiceNumber}`,
        'utf8'
      )
      const derivedHash = Hash.sha256(Hash.sha256(combined))
      const derivedPriv = new PrivateKey(Utils.toHex(derivedHash), 'hex')
      const derivedPublicKey = derivedPriv.toPublicKey().toString()
      const pkh = new P2PKH()
      const derivedScript = pkh.lock(PublicKey.fromString(derivedPublicKey).toHash()).toHex()
      logWithTimestamp(F, '🔍 [invoice] [Step 8] Generated derived script:', derivedScript)
      const satoshis = button.variable_amount ? amount : button.amount
      logWithTimestamp(F, '🔍 [invoice] [Step 9] Calculated satoshis for output:', satoshis)
      const outputDescription = paymentDescription
      logWithTimestamp(F, '🔍 [invoice] [Step 10] Using output description:', outputDescription)
      const outputs = [
        {
          lockingScript: derivedScript,
          customInstructions: JSON.stringify({ transactionid: transactionIdNew, payee: senderIdentityKey }),
          satoshis,
          outputDescription,
          merchantId
        }
      ]
      logWithTimestamp(F, '🔍 [invoice] [Step 11] Response outputs:', outputs)
      res.status(200).json({
        status: 'success',
        message: 'Invoice created successfully',
        paymentId,
        outputs
      })
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : '❌ Unknown error'
      logWithTimestamp(F, '❌ [invoice] Error creating invoice:', {
        message,
        stack: error instanceof Error ? error.stack : '❌ No stack trace',
        requestBody: req.body,
        errorDetails: error,
        transaction_id: transactionIdNew ? transactionIdNew : 'N/A'
      })
      if (message.includes('Duplicate entry') && !req.body.multi_use) {
        await db('payment_buttons')
          .where({ payment_id: req.body.paymentId, merchant_id: req.body.merchantId })
          .update({ used: true, updated_at: db.fn.now() })
        logWithTimestamp(F, '✅ [invoice] Marked single-use button as used due to duplicate entry:', {
          paymentId: req.body.paymentId
        })
        res.status(400).json({
          status: 'error',
          message: 'This single-use button has already been used'
        })
        return
      }
      res.status(500).json({
        status: 'error',
        message: `❌ Internal server error: ${message} (transaction_id: ${transactionIdNew ?? 'N/A'})`
      })
    }
  }
}
