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
 *
 * Version: v1.10 (Updated 29Jul2025_2125 BST with Custom Spending Description)
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
  amount: number // Amount in BSV (decimal)
  currency: string
  created_at?: string // Optional timestamp
  description?: string // Custom spending description
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
  knex: db,

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
    // Extract the necessary information from the request body
    const { paymentButtonId, merchantId, currency, amount }: RequestBody = req.body
    console.log('🔍 [Step 1] Request body (BSV):', { paymentButtonId, merchantId, currency, amount }) // Log incoming amount

    try {
      // Verify the payment button exists and belongs to the specified merchant
      const button: PaymentButton | undefined = await db('payment_buttons')
        .where({
          button_id: paymentButtonId,
          merchant_id: merchantId
        })
        .first()
      console.log('🔍 [Step 2] Payment button data (BSV):', { ...button, description: button?.description || 'Not set' }) // Log database amount and description

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

      // Verify the amount matches or the button is variable (all in BSV)
      console.log('🔍 [Step 3] Validation check: Requested amount=', amount, 'BSV vs Button amount=', button.amount, 'BSV')
      if (!button.variable_amount && Math.abs(amount - button.amount) > 0.0000000001) { // Allow for floating-point precision
        res.status(400).json({
          status: 'error',
          message: 'Amount mismatch for fixed-amount button (expected BSV).'
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
        amount, // Stored as BSV
        currency,
        exchange_rate: 1, // Placeholder, BSV-based
        payment_button_id: paymentButtonId
      })
      console.log(`✅ Payment invoice created: ${paymentID}`)

      // Determine sender private key based on button creation context
      let senderPrivateKey: PrivateKey
      try {
        const hasCreatedAt = (await db('information_schema.columns')
          .where({ table_name: 'payment_buttons', column_name: 'created_at' })
          .first()) !== undefined
        if (!hasCreatedAt || !button.created_at || new Date(button.created_at) < new Date('25Jul2025_1200 BST')) {
          senderPrivateKey = new PrivateKey('0000000000000000000000000000000000000000000000000000000000000001', 'hex')
          console.log('🔍 Using hardcoded key for pre-v1.2 or missing created_at button:', button.button_id)
        } else {
          senderPrivateKey = new PrivateKey((req as any).auth.identityKey, 'hex')
          console.log('🔍 Using authenticated identity key for new button')
        }
      } catch (err) {
        console.warn('🔍 created_at column check failed, using hardcoded key as fallback:', err)
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
      console.log('🔍 [Step 4] Calculated satoshis for output:', satoshis)

      // Use custom description from payment_buttons, fallback to default
      const outputDescription = button.description || 'Tip paid to merchant'
      console.log('🔍 [Step 5] Using output description:', outputDescription)

      // Respond with the payment ID and outputs including merchantId
      const outputs = [
        {
          lockingScript: derivedScript,
          satoshis, // Amount in satoshis based on client or button amount
          outputDescription,
          merchantId // Add merchantId for Metanet spending window
        }
      ]
      console.log('🔍 [Step 6] Response outputs:', outputs)

      res.status(200).json({
        status: 'success',
        message: 'Invoice created successfully',
        paymentId: paymentID,
        outputs
      })
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      console.error(`❌ Error creating invoice: ${message}`, {
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