/**
 * @file src/routes/createButton.ts
 *
 * POST route to create a new payment button. This endpoint receives configuration
 * options such as amount, currency, multi-use status, accepted payment types,
 * validates the input, ensures the merchant exists, and inserts a new record
 * into the `payment_buttons` table.
 *
 * - Requires authentication middleware to populate `req.auth.identityKey`.
 * - Ensures the merchant exists or inserts a new one if needed.
 * - Generates a unique `button_id` and initializes all button fields.
 * - Accepts `amount` in sats and converts to BSV decimal for storage.
 * - For variableAmount: true, allows amount: 0 or omitted, storing 0.0 in DB.
 * - Added input validation and sanitization with express-validator for description (max 80 chars).
 *
 * Used by the "Create" page in the Gateway frontend to configure tipping buttons.
 *
 * Version: v1.8 (Updated 30Jul2025_1116 BST with Description Validation and Sanitization)
 */

import knex, { Knex } from 'knex'
import knexConfig from '../../knexfile'
import { randomBytes } from 'crypto'
import type { Request, Response } from 'express'
import { body, validationResult } from 'express-validator'

const db: Knex = knex(knexConfig)

interface Merchant {
  merchant_id: string
  custom_fee_rate: number
  welcomed: boolean
  custom_fee: boolean
}

interface RequestBody {
  amount?: number // Amount in sats (integer, optional for variable)
  currency: string
  variableAmount: boolean
  multiUse: boolean
  accepts: string
  description: string // Custom spending description
}

export default {
  type: 'post',
  path: '/createButton',
  middlewares: [
    body('description')
      .trim()
      .escape()
      .isLength({ min: 1, max: 80 })
      .withMessage('Description must be a string between 1 and 80 characters'),
    body('currency').trim().isIn(['BSV', 'fiat', 'both']).withMessage('Currency must be BSV, fiat, or both'),
    body('variableAmount').isBoolean().withMessage('variableAmount must be a boolean'),
    body('multiUse').isBoolean().withMessage('multiUse must be a boolean'),
    body('accepts').trim().isIn(['BSV', 'fiat', 'both']).withMessage('Accepts must be BSV, fiat, or both'),
    body('amount')
      .optional()
      .isInt({ min: 0 })
      .withMessage('Amount must be a non-negative integer')
  ],

  /**
   * Express route handler to create a new payment button.
   *
   * Validates the request body and inserts a new record into `payment_buttons`.
   * Also ensures that the merchant is present in the `merchants` table,
   * inserting a default record if not found. Converts amount from sats to BSV.
   *
   * @param req - Express request containing button config and auth context.
   * @param req.body.amount - The payment amount in sats (integer, optional for variableAmount: true).
   * @param req.body.currency - The currency string (e.g. "BSV").
   * @param req.body.variableAmount - Whether the button allows flexible amounts.
   * @param req.body.multiUse - Whether the button can be reused.
   * @param req.body.accepts - What the button accepts ("BSV", "fiat", or "both").
   * @param req.body.description - Custom description for Metanet spending window.
   * @param res - Express response object to send success or error response.
   * @returns {Promise<void>} Sends a 200 success response with `buttonId` or an error.
   */
  func: async (req: Request, res: Response): Promise<void> => {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      console.log('❌ [createButton] Validation errors:', errors.array())
      res.status(400).json({ status: 'error', message: 'Invalid parameters', errors: errors.array() })
      return
    }

    const merchantId = (req as any).auth?.identityKey
    const { amount = 0, currency, variableAmount, multiUse, accepts, description }: RequestBody = req.body
    console.log('🔍 [Step 1] Create button request (sats):', { merchantId, amount, currency, variableAmount, multiUse, accepts, description })

    if (!merchantId) {
      console.log('❌ [createButton] Missing merchantId from auth context')
      res.status(401).json({ status: 'error', message: 'Unauthorized: Missing merchant identity' })
      return
    }

    if (variableAmount === false && (typeof amount !== 'number' || !Number.isInteger(amount) || amount <= 0)) {
      console.log('❌ [createButton] Validation failed for fixed button: amount must be a positive integer', { amount })
      res.status(400).json({ status: 'error', message: 'Invalid parameters: fixed buttons require a positive integer amount' })
      return
    }

    try {
      console.log('🔍 [Step 2] Checking merchant existence for:', merchantId)
      const merchant: Merchant | undefined = await db('merchants').where({ merchant_id: merchantId }).first()
      console.log('🔍 [Step 3] Merchant data:', merchant)

      if (merchant === undefined) {
        console.log('🔍 [Step 4] Inserting new merchant:', merchantId)
        await db('merchants').insert({
          merchant_id: merchantId,
          custom_fee_rate: 0,
          welcomed: false,
          custom_fee: false
        })
        console.log('✅ [createButton] Inserted new merchant:', merchantId)
      }

      // Convert sats to BSV for storage
      const amountInBSV = variableAmount ? 0 : amount / 100000000
      console.log('🔍 [Step 5] Converted amount to BSV:', amountInBSV)

      // Generate unique button ID
      const buttonId = randomBytes(12).toString('hex')
      console.log('🔍 [Step 6] Generated button ID:', buttonId)

      console.log('🔍 [Step 7] Inserting payment button:', {
        button_id: buttonId,
        amount: amountInBSV,
        currency,
        variable_amount: variableAmount,
        merchant_id: merchantId,
        multi_use: multiUse,
        used: false,
        total_paid: 0,
        accepts,
        description
      })
      await db('payment_buttons').insert({
        button_id: buttonId,
        amount: amountInBSV,
        currency,
        variable_amount: variableAmount,
        merchant_id: merchantId,
        multi_use: multiUse,
        used: false,
        total_paid: 0,
        accepts,
        description
      })

      console.log('✅ [createButton] Inserted payment button:', buttonId)

      res.status(200).json({
        status: 'success',
        message: 'Payment button created successfully',
        buttonId
      })
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error'
      console.error('❌ [createButton] Error creating payment button:', {
        message: errorMessage,
        stack: err instanceof Error ? err.stack : 'No stack trace',
        requestBody: req.body
      })
      res.status(500).json({ status: 'error', message: 'Internal server error' })
    }
  }
}
