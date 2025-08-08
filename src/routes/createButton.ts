/**
 * @file src/routes/createButton.ts
 *
 * POST route to create a new payment button in the database.
 * Validates the request, uses the provided paymentId as the primary identifier, and the provided buttonId as a secondary identifier, storing both with the provided details.
 *
 * Used by the Gateway UI to create new payment buttons for merchants.
 * - All amounts are handled as BSV decimals internally.
 *
 * Version: v2.6 (Updated 05Aug2025_0100 BST to use client-provided buttonId instead of generating a new one, ensuring consistency with HTML data-button)
 */
import knex, { Knex } from 'knex'
import knexConfig from '../../knexfile'
import type { Request, Response } from 'express'
import { body, validationResult } from 'express-validator'
import { MAX_PAYMENT_SATS } from '../utils/constants'
const db: Knex = knex(knexConfig)

interface Merchant {
  merchant_id: string
  custom_fee_rate: number
  welcomed: boolean
  custom_fee: boolean
}

interface RequestBody {
  amount?: number
  currency: string
  variableAmount: boolean
  multiUse: boolean
  accepts: string
  description: string
  customCSS?: string
  paymentId: string // Primary identifier
  buttonId: string // Secondary identifier from client
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
    body('accepts').trim().isIn(['BSV']).withMessage('Accepts must be SATS'),
    body('amount')
      .optional()
      .custom((value, { req }) => {
        const { variableAmount } = req.body
        if (variableAmount === false && (!Number.isInteger(value) || value < 1 || value > MAX_PAYMENT_SATS)) {
          throw new Error(`Amount must be an integer between 1 and ${MAX_PAYMENT_SATS} Sats for fixed buttons`)
        }
        return true
      })
      .withMessage(
        `Amount must be an integer between 1 and ${MAX_PAYMENT_SATS} Sats for fixed buttons, or 0 for variable`
      ),
    body('customCSS').optional().trim().isString().withMessage('customCSS must be a string'),
    body('paymentId')
      .trim()
      .escape()
      .isString()
      .notEmpty()
      .withMessage('paymentId must be a non-empty string')
      .isLength({ min: 24, max: 24 })
      .withMessage('paymentId must be exactly 24 characters'),
    body('buttonId')
      .trim()
      .escape()
      .isString()
      .notEmpty()
      .withMessage('buttonId must be a non-empty string')
      .isLength({ min: 24, max: 24 })
      .withMessage('buttonId must be exactly 24 characters')
  ],
  func: async (req: Request, res: Response): Promise<void> => {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      console.log('❌ [createButton] Validation errors:', errors.array())
      res.status(400).json({ status: 'error', message: 'Invalid parameters', errors: errors.array() })
      return
    }
    const merchantId = (req as any).auth?.identityKey
    const {
      amount = 0,
      currency,
      variableAmount,
      multiUse,
      accepts,
      description,
      customCSS,
      paymentId,
      buttonId
    }: RequestBody = req.body
    console.log('🔍 [createButton] [Step 1] Create button request (sats):', {
      merchantId,
      amount,
      currency,
      variableAmount,
      multiUse,
      accepts,
      description,
      customCSS,
      paymentId,
      buttonId
    })
    if (!merchantId) {
      console.log('❌ [createButton] Missing merchantId from auth context')
      res.status(401).json({ status: 'error', message: 'Unauthorized: Missing merchant identity' })
      return
    }
    try {
      console.log('🔍 [createButton] [Step 2] Checking merchant existence for:', merchantId)
      const merchant: Merchant | undefined = await db('merchants').where({ merchant_id: merchantId }).first()
      console.log('🔍 [createButton] [Step 3] Merchant data:', merchant)
      if (merchant === undefined) {
        console.log('🔍 [createButton] [Step 4] Inserting new merchant:', merchantId)
        await db('merchants').insert({
          merchant_id: merchantId,
          custom_fee_rate: 0,
          welcomed: false,
          custom_fee: false
        })
        console.log('✅ [createButton] Inserted new merchant:', merchantId)
      }
      const amountInBSV = variableAmount ? 0 : amount
      //*const amountInBSV = variableAmount ? 0 : amount / 100000000;
      console.log('🔍 [createButton] [Step 5] Converted amount to BSV:', amountInBSV)

      console.log('🔍 [createButton] [Step 7] Inserting payment button:', {
        payment_id: paymentId,
        button_id: buttonId,
        amount: amountInBSV,
        currency,
        variable_amount: variableAmount,
        merchant_id: merchantId,
        multi_use: multiUse,
        used: false,
        total_paid: 0,
        accepts,
        description,
        customCSS
      })
      await db('payment_buttons').insert({
        payment_id: paymentId, // Primary key
        button_id: buttonId, // Matches data-button from HTML
        amount: amountInBSV,
        currency,
        variable_amount: variableAmount,
        merchant_id: merchantId,
        multi_use: multiUse,
        used: false,
        total_paid: 0,
        accepts,
        description,
        customCSS,
        created_at: db.fn.now()
      })
      console.log('✅ [createButton] Inserted payment button:', { paymentId, buttonId })
      res.status(200).json({
        status: 'success',
        message: 'Payment button created successfully',
        paymentId,
        buttonId // Return the client-provided buttonId
      })
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error'
      console.error('❌ [createButton] Error creating payment button:', {
        message: errorMessage,
        stack: err instanceof Error ? err.stack : 'No stack trace',
        requestBody: req.body
      })
      res.status(500).json({ status: 'error', message: errorMessage })
    }
  }
}
