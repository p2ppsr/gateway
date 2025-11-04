/**
 * @file src/routes/createButton.ts
 * @description
 * POST route to create a new payment button in the database.
 * Validates the request, uses client-provided paymentId and buttonId pre-initialized by initializeIds,
 * and stores them in the payment_buttons table.
 * Initially integrates client-side ID generation during button creation, to be moved to page launch
 * in the next iteration.
 * Used by the Gateway UI to create new payment buttons for merchants.
 * - All amounts are handled as BSV satoshis internally.
 * - IDs are client-generated 12-character Base58-encoded strings, pre-validated by initializeIds.
 * @version 1.0.0
 * @author xAI (Grok 3)
 */

import knex, { Knex } from 'knex'
import knexConfig from '../knexfile'
import type { Request, Response } from 'express'
import { body, validationResult } from 'express-validator'
import { MAX_PAYMENT_SATS } from '../utils/constants'
import { logWithTimestamp } from '../utils/logging'
import { ensureMerchantExists } from '../utils/merchant'
const F = 'routes/createButton'
const db: Knex = knex(knexConfig)
interface RequestBody {
  amount?: number
  variableAmount: boolean // Explicitly typed as boolean after validation
  multiUse: boolean // Explicitly typed as boolean after validation
  description: string
  htmlCode?: string // Renamed from customCSS
  paymentId: string // Client-provided payment ID, pre-initialized
  buttonId: string // Client-provided button ID, pre-initialized
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
    body('variableAmount').optional().isBoolean().withMessage('variableAmount must be a boolean'),
    body('multiUse').optional().isBoolean().withMessage('multiUse must be a boolean'),
    body('amount')
      .optional()
      .custom((value, { req }) => {
        const { variableAmount = false } = req.body as Partial<RequestBody> // Type assertion
        if (!variableAmount && (!Number.isInteger(value) || value < 1 || value > MAX_PAYMENT_SATS)) {
          throw new Error(`❌ Amount must be an integer between 1 and ${MAX_PAYMENT_SATS} Sats for fixed buttons`)
        }
        return true
      })
      .withMessage(
        `Amount must be an integer between 1 and ${MAX_PAYMENT_SATS} Sats for fixed buttons, or 0 for variable`
      ),
    body('htmlCode').optional().trim().isString().withMessage('htmlCode must be a string'),
    body('paymentId')
      .trim()
      .escape()
      .isString()
      .notEmpty()
      .withMessage('paymentId must be a non-empty string')
      .isLength({ min: 12, max: 12 })
      .withMessage('paymentId must be exactly 12 characters'),
    body('buttonId')
      .trim()
      .escape()
      .isString()
      .notEmpty()
      .withMessage('buttonId must be a non-empty string')
      .isLength({ min: 12, max: 12 })
      .withMessage('buttonId must be exactly 12 characters')
  ],
  func: async (req: Request, res: Response): Promise<void> => {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      logWithTimestamp(F, '❌ [createButton] Validation errors:', errors.array())
      res.status(400).json({
        status: 'error',
        message: '❌ Invalid parameters',
        errors: errors.array()
      })
      return
    }
    const merchantId = (req as any).auth?.identityKey
    if (!merchantId) {
      logWithTimestamp(F, '❌ [createButton] Missing authenticated merchant identity, halting execution')
      res.status(401).json({
        status: 'error',
        message: 'Unauthorized: merchant identity required'
      })
      return
    }
    const {
      amount = 0,
      variableAmount = false,
      multiUse = false,
      description,
      htmlCode = '<style>.gateway-paybutton { background: #8484FA; color: white; }</style>',
      paymentId,
      buttonId
    }: RequestBody = req.body as RequestBody
    try {
      await ensureMerchantExists(db, merchantId)
      // Verify or initialize IDs in ids table
      const initializeId = async (id: string, type: 'payment' | 'button') => {
        const exists = await db('ids').where({ id, type }).first()
        if (!exists) {
          await db('ids').insert({
            id,
            merchant_id: merchantId,
            timestamp: db.fn.now(),
            type
          })
          logWithTimestamp(F, `✅ [createButton] Initialized ${type} ID:`, {
            id,
            merchantId
          })
        }
        return true
      }
      await initializeId(paymentId, 'payment')
      await initializeId(buttonId, 'button')
      // Check for existing payment button to avoid duplicates
      logWithTimestamp(F, '🔍 [createButton] [Step 3] Checking for existing payment button:', { paymentId, buttonId })
      const existingButton = await db('payment_buttons')
        .where({ button_id: buttonId })
        .orWhere({ payment_id: paymentId })
        .first()
      if (existingButton) {
        logWithTimestamp(F, '✅ [createButton] Button already exists, skipping insert:', {
          paymentId,
          buttonId,
          existingButton
        })
        res.status(200).json({
          status: 'success',
          message: 'Button already exists',
          paymentId,
          buttonId
        })
        return
      }
      logWithTimestamp(F, '🔍 [createButton] [Step 4] No duplicate found, proceeding with insert:', {
        paymentId,
        buttonId
      })
      const amountInSats = variableAmount ? 0 : amount
      logWithTimestamp(F, '🔍 [createButton] [Step 5] Converted amount to sats:', amountInSats)
      // Validate amount consistency for fixed buttons
      if (!variableAmount && amountInSats !== amount) {
        logWithTimestamp(F, '❌ [createButton] Amount mismatch for fixed button:', { amountInSats, amount })
        res.status(400).json({
          status: 'error',
          message: 'Amount must match request amount for fixed buttons'
        })
        return
      }
      // Insert into payment_buttons and payments
      await db.transaction(async trx => {
        await db('payment_buttons').transacting(trx).insert({
          button_id: buttonId,
          merchant_id: merchantId,
          payment_id: paymentId,
          amount: amountInSats,
          html_code: htmlCode,
          variable_amount: variableAmount,
          multi_use: multiUse,
          used: false,
          created_at: trx.fn.now(),
          updated_at: trx.fn.now()
        })
        // Ensure description is set
        const finalDescription = description || `Payment for paymentId: ${paymentId}`
        await db('payments')
          .transacting(trx)
          .insert({
            button_id: buttonId,
            payment_id: paymentId,
            merchant_id: merchantId,
            derivation_prefix: '',
            derivation_suffix: '',
            amount: amountInSats,
            description: finalDescription.slice(0, 80),
            completed: 0,
            is_new: 1,
            created_at: trx.fn.now(),
            updated_at: trx.fn.now()
          })
          .onConflict(['payment_id', 'button_id'])
          .merge({
            amount: amountInSats,
            description: finalDescription.slice(0, 80),
            updated_at: trx.fn.now()
          })
        logWithTimestamp(F, '✅ [createButton] Payment and button records created/updated:', {
          paymentId,
          buttonId,
          description: finalDescription,
          amount: amountInSats
        })
      })
      res.status(201).json({
        status: 'success',
        message: 'Payment button and payment created successfully',
        paymentId,
        buttonId
      })
    } catch (error) {
      logWithTimestamp(F, '[createButton] Error:', {
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : 'No stack trace'
      })
      res.status(500).json({ status: 'error', message: 'Failed to create button' })
    }
  }
}
