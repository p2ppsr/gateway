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
 * - All amounts are handled as BSV decimals internally (to match current DB schema).
 * - Added input validation and sanitization with express-validator.
 *
 * Version: v1.11 (Updated 30Jul2025_1132 BST with Input Validation and Updated Fallback Description)
 */

import knex, { Knex } from 'knex'
import knexConfig from '../../knexfile'
import { randomBytes } from 'crypto'
import { Hash, P2PKH, PrivateKey, PublicKey, Utils } from '@bsv/sdk'
import { Request, Response } from 'express'
import { body, validationResult } from 'express-validator'

const db: Knex = knex(knexConfig)

interface PaymentButton {
  button_id: string
  merchant_id: string
  multi_use: boolean
  used: boolean
  variable_amount: boolean
  amount: number // Amount in BSV (decimal)
  currency: string
  created_at?: string // Optional timestamp
  description: string // Custom spending description
}

interface RequestBody {
  paymentButtonId: string
  merchantId: string
  currency: string
  amount: number // Amount in BSV (decimal)
}

export default {
  type: 'post',
  path: '/invoice',
  middlewares: [
    body('paymentButtonId').trim().escape().isString().notEmpty().withMessage('paymentButtonId must be a non-empty string'),
    body('merchantId').trim().escape().isString().notEmpty().withMessage('merchantId must be a non-empty string'),
    body('currency').trim().isIn(['BSV', 'fiat', 'both']).withMessage('Currency must be BSV, fiat, or both'),
    body('amount').isFloat({ min: 0 }).withMessage('Amount must be a non-negative number')
  ],

  /**
   * Express route handler to create a new invoice/payment entry.
   *
   * Validates that the payment button exists, belongs to the merchant, and is eligible for use.
   * Creates a new `payments` record with `completed = false`, and responds with the derived
   * P2PKH locking script where the payment should be sent.
   *
   * The locking script is deterministically generated using a hash of the sender's authenticated identity
   * (or a hardcoded key for pre-v1.2 buttons if created_at is missing or indicates an old button) and the
   * merchant's public key with an invoice number. Amounts are in BSV, converted to satoshis for output.
   *
   * @param req - Express request with `paymentButtonId`, `merchantId`, `currency`, and `amount` in BSV in body.
   *              Auth middleware must populate `req.auth.identityKey`.
   * @param res - Express response object for sending success or error responses.
   * @returns {Promise<void>} Sends a 200 success response with `paymentId` and derived outputs including merchantId and custom description.
   */
  func: async (req: Request, res: Response): Promise<void> => {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      console.log('❌ [invoice] Validation errors:', errors.array())
      res.status(400).json({ status: 'error', message: 'Invalid parameters', errors: errors.array() })
      return
    }

    const senderIdentityKey = (req as any).auth?.identityKey
    if (!senderIdentityKey) {
      console.log('❌ [invoice] Missing sender identity key from auth context')
      res.status(401).json({ status: 'error', message: 'Unauthorized: Missing sender identity' })
      return
    }

    const { paymentButtonId, merchantId, currency, amount }: RequestBody = req.body
    console.log('🔍 [invoice] [Step 1] Request body (BSV):', { paymentButtonId, merchantId, currency, amount })

    try {
      // Verify the payment button exists and belongs to the specified merchant
      const button: PaymentButton | undefined = await db('payment_buttons')
        .where({
          button_id: paymentButtonId,
          merchant_id: merchantId
        })
        .first()
      console.log('🔍 [invoice] [Step 2] Payment button data (BSV):', { ...button, description: button?.description || 'Not set' })

      if (button === undefined) {
        console.log('❌ [invoice] Payment button not found for merchant:', { paymentButtonId, merchantId })
        res.status(404).json({
          status: 'error',
          message: 'Payment button not found for the specified merchant'
        })
        return
      }

      // Verify the button has not already been used if it is a single-use button
      if (!button.multi_use && button.used) {
        console.log('❌ [invoice] Single-use button already used:', paymentButtonId)
        res.status(400).json({
          status: 'error',
          message: 'This single-use button has already been used'
        })
        return
      }

      // Verify the amount matches or the button is variable (all in BSV)
      console.log('🔍 [invoice] [Step 3] Validation check: Requested amount=', amount, 'BSV vs Button amount=', button.amount, 'BSV')
      if (!button.variable_amount && Math.abs(amount - button.amount) > 0.0000000001) {
        console.log('❌ [invoice] Amount mismatch for fixed-amount button:', { requested: amount, expected: button.amount })
        res.status(400).json({
          status: 'error',
          message: 'Amount mismatch for fixed-amount button (expected BSV)'
        })
        return
      }

      // Create a new payment with complete=false
      const paymentID = randomBytes(12).toString('hex')
      await db('payments').insert({
        payment_id: paymentID,
        merchant_id: merchantId,
        completed: false,
        from: senderIdentityKey,
        transaction_info: '',
        amount, // Stored as BSV
        currency,
        exchange_rate: 1, // Placeholder, BSV-based
        payment_button_id: paymentButtonId
      })
      console.log(`✅ [invoice] Payment invoice created: ${paymentID}`)

      // Determine sender private key based on button creation context
      let senderPrivateKey: PrivateKey
      try {
        const hasCreatedAt = (await db('information_schema.columns')
          .where({ table_name: 'payment_buttons', column_name: 'created_at' })
          .first()) !== undefined
        if (!hasCreatedAt || !button.created_at || new Date(button.created_at) < new Date('2025-07-25T12:00:00Z')) {
          senderPrivateKey = new PrivateKey('0000000000000000000000000000000000000000000000000000000000000001', 'hex')
          console.log('🔍 [invoice] Using hardcoded key for pre-v1.2 or missing created_at button:', button.button_id)
        } else {
          senderPrivateKey = new PrivateKey(senderIdentityKey, 'hex')
          console.log('🔍 [invoice] Using authenticated identity key for new button')
        }
      } catch (err) {
        console.warn('🔍 [invoice] created_at column check failed, using hardcoded key as fallback:', err)
        senderPrivateKey = new PrivateKey('0000000000000000000000000000000000000000000000000000000000000001', 'hex')
      }
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

      // Use client-provided amount for variable buttons, button amount for fixed
      const satoshis = Math.round((button.variable_amount ? amount : button.amount) * 100000000)
      console.log('🔍 [invoice] [Step 4] Calculated satoshis for output:', satoshis)

      // Use custom description from payment_buttons, fallback to dynamic default
      const outputDescription = button.description || `Payment to merchant with buttonId: ${button.button_id}`
      console.log('🔍 [invoice] [Step 5] Using output description:', outputDescription)

      // Respond with the payment ID and outputs including merchantId
      const outputs = [
        {
          lockingScript: derivedScript,
          satoshis, // Amount in satoshis based on client or button amount
          outputDescription,
          merchantId // Add merchantId for Metanet spending window
        }
      ]
      console.log('🔍 [invoice] [Step 6] Response outputs:', outputs)

      res.status(200).json({
        status: 'success',
        message: 'Invoice created successfully',
        paymentId: paymentID,
        outputs
      })
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      console.error('❌ [invoice] Error creating invoice:', {
        message,
        stack: error instanceof Error ? error.stack : 'No stack trace',
        requestBody: req.body
      })
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      })
    }
  }
}