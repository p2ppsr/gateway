/**
 * @file src/routes/invoice.ts
 * @description
 * POST route to create a payment invoice for a given paymentId and buttonId.
 * Validates the payment button, checks multi-use status, and generates a transaction output for payment processing.
 * For multi-use buttons, generates a new paymentId and updates the description accordingly.
 * Uses payment_buttons.description for the output description and generates a derived locking script.
 * @version 1.0.0
 * @author xAI (Grok 3)
 */

import knex, { Knex } from 'knex'
import knexConfig from '../knexfile'
import { randomBytes } from 'crypto'
import { Request, Response } from 'express'
import { body, validationResult } from 'express-validator'
import { logWithTimestamp } from '../utils/logging'
import { generateAndValidateUniqueId } from '../utils/idGenerator'
import { ensureMerchantExists } from '../utils/merchant'
import { walletPromise } from '../server'
import { PrivateKey } from '@bsv/sdk'
import { ScriptTemplateBRC29, ScriptTemplateParamsBRC29 } from '@bsv/wallet-toolbox'

const F = 'routes/invoice'
const db: Knex = knex(knexConfig)
logWithTimestamp(F, '🔍 [invoice] Using DB config:', knexConfig)

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
export type AuthRequest = Request & {
  auth?: {
    identityKey?: string
  }
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
  func: async (req: AuthRequest, res: Response): Promise<void> => {
    let derivationPrefix: string = ''
    let derivationSuffix: string = ''

    // ---- validate input ----
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      logWithTimestamp(F, '❌ [invoice] Validation errors:', errors.array())
      res.status(400).json({
        status: 'error',
        message: '❌ Invalid parameters',
        errors: errors.array()
      })
      return
    }

    // ---- auth + inputs (do NOT require caller === merchant) ----
    const allowFallback = (process.env.ALLOW_UNAUTH_FALLBACK ?? '').toLowerCase() === 'yes'

    let senderIdentityKey = (req as any).auth?.identityKey || null
    if (!senderIdentityKey || senderIdentityKey === 'unknown') senderIdentityKey = null

    // Pull request fields once (avoid redeclares later)
    let { paymentId, amount, description } = req.body as RequestBody
    const buttonId: string = (req.body as RequestBody).buttonId
    const requestedMerchantId: string = (req.body as RequestBody).merchantId

    logWithTimestamp(F, '🔍 [invoice] [Step 0] Auth context check:', {
      senderIdentityKey,
      requestedMerchantId,
      headers: req.headers,
      allowFallback
    })

    // ---- resolve merchant from the button (source of truth) ----
    const ownerRow = await db('payment_buttons').select('merchant_id').where({ button_id: buttonId }).first()

    if (!ownerRow) {
      res.status(404).json({ status: 'error', message: 'Unknown buttonId' })
      return
    }
    const merchantId: string = ownerRow.merchant_id

    // Optional sanity: if client sent a merchantId, ensure it matches the button owner
    if (requestedMerchantId && requestedMerchantId !== merchantId) {
      res.status(400).json({
        status: 'error',
        message: 'merchantId mismatch for buttonId',
        details: {
          requestedMerchantId,
          resolvedMerchantId: merchantId,
          buttonId
        }
      })
      return
    }

    // Allow unauth fallback if configured
    if (!senderIdentityKey && allowFallback) {
      senderIdentityKey = '0282f7effd932d9d2a3774c287eacb9ace3728a753a0339e2f16998153e5d65963'
    }

    logWithTimestamp(F, '✅ [invoice] Caller accepted; resolved merchant', {
      senderIdentityKey,
      requestedMerchantId,
      resolvedMerchantId: merchantId,
      allowFallback
    })
    try {
      // Ensure the resolved merchant exists
      await ensureMerchantExists(db, merchantId)

      // ---- Step 1: log request with resolved merchant ----
      let paymentDescription = description
      logWithTimestamp(F, '🔍 [invoice] [Step 1] Received request body:', {
        paymentId,
        buttonId,
        requestedMerchantId,
        resolvedMerchantId: merchantId,
        amount,
        description
      })

      // ---- Step 2: proceed to load the button row with resolved merchant ----
      logWithTimestamp(F, '🔍 [invoice] [Step 2] Executing query:', {
        paymentId,
        merchantId
      })
      const button: PaymentButton | undefined = await db('payment_buttons')
        .where({
          button_id: buttonId,
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
        logWithTimestamp(F, '❌ [invoice] Button ID mismatch:', {
          buttonId,
          expected: button.button_id
        })
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

      // AFTER you’ve got checkExistingPayment from DB

      if (checkExistingPayment && checkExistingPayment.derivation_prefix && checkExistingPayment.derivation_suffix) {
        // ✅ reuse existing
        derivationPrefix = checkExistingPayment.derivation_prefix
        derivationSuffix = checkExistingPayment.derivation_suffix
        logWithTimestamp(F, '🔍 [invoice] [Step 3A] Reusing existing derivation for paymentId:', {
          paymentId,
          derivationPrefix,
          derivationSuffix
        })
      } else {
        // ❌ generate new
        derivationPrefix = randomBytes(12).toString('hex').slice(0, 12)
        derivationSuffix = randomBytes(12).toString('hex').slice(0, 12)
        logWithTimestamp(F, '🔍 [invoice] [Step 3B] Generated new derivation for paymentId:', {
          paymentId,
          derivationPrefix,
          derivationSuffix
        })
      }

      if (!checkExistingPayment) {
        logWithTimestamp(F, '❌ [invoice] No existing payment found for paymentId:', { paymentId, buttonId })
        res.status(404).json({
          status: 'error',
          message: 'No valid payment record found for this button'
        })
        return
      }
      if (checkExistingPayment.completed) {
        logWithTimestamp(F, '❌ [invoice] Payment already completed:', {
          paymentId,
          buttonId
        })
      }
      if (!button.multi_use) {
        logWithTimestamp(F, '🔍 [invoice] Single-use button, using existing payment:', { paymentId, buttonId })
        await db('payments').where({ payment_id: paymentId, button_id: buttonId }).update({
          derivation_prefix: derivationPrefix,
          derivation_suffix: derivationSuffix,
          payer_id: senderIdentityKey,
          updated_at: db.fn.now()
        })
        logWithTimestamp(F, '✅ [invoice] [Step 4] Updated derivation and payer_id for existing payment:', {
          paymentId,
          derivation_prefix: derivationPrefix,
          derivation_suffix: derivationSuffix,
          payer_id: senderIdentityKey
        })
      } else {
        if (checkExistingPayment && !checkExistingPayment.completed && checkExistingPayment.txid === null) {
          logWithTimestamp(F, '🔍 [invoice] [Step 4] Using existing paymentId for first multi-use payment:', {
            paymentId,
            buttonId
          })
          await db('payments').where({ payment_id: paymentId, button_id: buttonId }).update({
            derivation_prefix: derivationPrefix,
            derivation_suffix: derivationSuffix,
            payer_id: senderIdentityKey,
            updated_at: db.fn.now()
          })
          logWithTimestamp(F, '✅ [invoice] [Step 4] Updated derivation and payer_id for existing payment:', {
            paymentId,
            derivation_prefix: derivationPrefix,
            derivation_suffix: derivationSuffix,
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
            derivation_prefix: derivationPrefix,
            derivation_suffix: derivationSuffix,
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
      }
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
      logWithTimestamp(F, '🔍 [invoice] [Step 6] Generating derivation:', derivationPrefix, derivationSuffix)
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
        .select('derivation_prefix', 'derivation_suffix', 'payment_id')
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
            res.status(400).json({
              status: 'error',
              message: 'This single-use button has already been used'
            })
            return
          }
        }
        logWithTimestamp(F, '✅ [invoice] [Step 7] Invoice prepared:', {
          paymentId,
          buttonId,
          derivationPrefix,
          derivationSuffix
        })
      } catch (insertError) {
        const errorMessage = insertError instanceof Error ? insertError.message : 'Unknown error'
        logWithTimestamp(F, '❌ [invoice] Failed to insert payment:', {
          error: errorMessage,
          stack: insertError instanceof Error ? insertError.stack : 'No stack trace',
          paymentId,
          derivationPrefix,
          derivationSuffix
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

      // --- Step 1: seed components ---
      logWithTimestamp(F, '🔍 [invoice] Seed components', {
        prefix: derivationPrefix,
        suffix: derivationSuffix
      })

      const wallet = await walletPromise
      const brcParams: ScriptTemplateParamsBRC29 = {
        derivationPrefix,
        derivationSuffix,
        keyDeriver: wallet.keyDeriver
      }
      logWithTimestamp(F, '🔍 [invoice] BRC29 params', brcParams)

      // --- Step 2: build the ScriptTemplate and fixed pubkey ---
      const BRC29 = new ScriptTemplateBRC29(brcParams)
      const fixedPriv = PrivateKey.fromHex('1'.padStart(64, '0')) // 0x01 key
      logWithTimestamp(F, '🔍 [invoice] Fixed keypair', fixedPriv)

      // --- Step 3: generate full BRC29 lockingScript (identical to server) ---
      const lockingScript = BRC29.lock(fixedPriv.toString(), button.merchant_id)
      logWithTimestamp(F, '🔍 [invoice] Generated full BRC29 lockingScript=', lockingScript)

      // --- Step 4: prepare outputs array ---
      const satoshis = button.variable_amount ? amount : button.amount
      const outputDescription = paymentDescription
      const outputs = [
        {
          lockingScript,
          satoshis,
          outputDescription,
          merchantId: button.merchant_id,
          customInstructions: JSON.stringify({
            derivationPrefix,
            derivationSuffix
          })
        }
      ]
      logWithTimestamp(F, '🔍 [invoice] Prepared outputs array (fixed-key):', outputs)

      // --- Step 5: convert lockingScript to hex for client ---
      const outputsForClient = outputs.map(o => ({
        ...o,
        lockingScript:
          o.lockingScript && typeof o.lockingScript !== 'string' ? o.lockingScript.toHex() : o.lockingScript
      }))
      logWithTimestamp(F, '🔍 [invoice] outputsForClient', outputsForClient)

      res.status(200).json({
        status: 'success',
        message: 'Invoice created successfully',
        paymentId,
        derivationPrefix,
        derivationSuffix,
        outputs: outputsForClient
      })
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : '❌ Unknown error'
      logWithTimestamp(F, '❌ [invoice] Error creating invoice:', {
        message,
        stack: error instanceof Error ? error.stack : '❌ No stack trace',
        requestBody: req.body,
        errorDetails: error,
        derivation_prefix: derivationPrefix,
        derivation_suffix: derivationSuffix
      })
      if (message.includes('Duplicate entry') && !req.body.multi_use) {
        await db('payment_buttons')
          .where({
            payment_id: req.body.paymentId,
            merchant_id: req.body.merchantId
          })
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
        message: `❌ Internal server error: ${message} (derivation_prefix,derivation_suffix: ${derivationPrefix && derivationSuffix} ?? 'N/A'})`
      })
    }
  }
}
