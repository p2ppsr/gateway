/**
 * @file src/routes/createButton.ts
 *
 * POST route to create a new payment button in the database.
 * Validates the request, uses client-provided paymentId and buttonId pre-initialized by initializeIds,
 * and stores them in the payment_buttons table.
 * Initially integrates client-side ID generation during button creation, to be moved to page launch
 * in the next iteration.
 *
 * Used by the Gateway UI to create new payment buttons for merchants.
 * - All amounts are handled as BSV decimals internally.
 * - IDs are client-generated 12-character Base58-encoded strings, pre-validated by initializeIds.
 *
 * Version: v2.30 (Updated 12Aug2025_0015 BST to align with initializeIds and clarify response fields)
 * Change Log:
 * - 09Aug2025_2350 BST (v2.23): Return generated ID in response.
 * - 10Aug2025_1155 BST (v2.24): Aligned path to /api/createButton and added middleware logging for diagnostics.
 * - 10Aug2025_1200 BST (v2.25): Fixed routing path to /createButton and enhanced diagnostic logging.
 * - 10Aug2025_1205 BST (v2.26): Reverted path to /createButton for prefix handling and added path registration logging.
 * - 10Aug2025_1210 BST (v2.27): Added default values for incomplete payloads and improved validation.
 * - 10Aug2025_1215 BST (v2.28): Returned generated id for client use and improved integration.
 * - 10Aug2025_1735 BST (v2.29): Integrated client-provided IDs and initializeIds logic during button creation.
 * - 12Aug2025_0015 BST (v2.30): Aligned with initializeIds, removed redundant merchant logic, and clarified response fields.
 */
const F = 'routes/createButton';
import knex, { Knex } from 'knex';
import knexConfig from '../../knexfile';
import type { Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { MAX_PAYMENT_SATS } from '../utils/constants';
import { logWithTimestamp } from '../utils/logging';

const db: Knex = knex(knexConfig);

interface RequestBody {
  amount?: number;
  currency: string;
  variableAmount?: boolean;
  multiUse?: boolean;
  accepts?: string;
  description: string;
  customCSS?: string;
  paymentId: string; // Client-provided payment ID, pre-initialized
  buttonId: string;  // Client-provided button ID, pre-initialized
}

export default {
  type: 'post',
  path: '/createButton', // Handled by ROUTING_PREFIX in server.ts
  middlewares: [
    body('description')
      .trim()
      .escape()
      .isLength({ min: 1, max: 80 })
      .withMessage('Description must be a string between 1 and 80 characters'),
    body('currency').trim().isIn(['BSV', 'fiat', 'both']).withMessage('Currency must be BSV, fiat, or both'),
    body('variableAmount').optional().isBoolean().withMessage('variableAmount must be a boolean'),
    body('multiUse').optional().isBoolean().withMessage('multiUse must be a boolean'),
    body('accepts').optional().trim().isIn(['BSV']).withMessage('Accepts must be SATS'),
    body('amount')
      .optional()
      .custom((value, { req }) => {
        const { variableAmount = false } = req.body; // Default to false if undefined
        if (!variableAmount && (!Number.isInteger(value) || value < 1 || value > MAX_PAYMENT_SATS)) {
          throw new Error(`❌ Amount must be an integer between 1 and ${MAX_PAYMENT_SATS} Sats for fixed buttons`);
        }
        return true;
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
  ],
  func: async (req: Request, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      logWithTimestamp(F, '❌ [createButton] Validation errors:', errors.array());
      res.status(400).json({ status: 'error', message: '❌ Invalid parameters', errors: errors.array() });
      return;
    }

    const merchantId = (req as any).auth?.identityKey || 'unknown'; // Default to 'unknown' if not authenticated
    const {
      amount = 0,
      currency,
      variableAmount = false,
      multiUse = false,
      accepts = 'BSV',
      description,
      customCSS = '<style>.gateway-paybutton { background: #8484FA; color: white; }</style>',
      paymentId,
      buttonId,
    }: RequestBody = req.body;

    logWithTimestamp(F, '🔍 [createButton] [Step 1] Create button request (sats):', {
      merchantId,
      amount,
      currency,
      variableAmount,
      multiUse,
      accepts,
      description,
      customCSS,
      paymentId,
      buttonId,
    });

    try {
      // Verify IDs exist in ids table
      const idExists = await db('ids').where({ id: paymentId, type: 'payment' }).first();
      const buttonExists = await db('ids').where({ id: buttonId, type: 'button' }).first();
      if (!idExists || !buttonExists) {
        logWithTimestamp(F, '❌ [createButton] ID not pre-initialized in ids table:', { paymentId, buttonId });
        res.status(400).json({ status: 'error', message: '❌ Payment or button ID not pre-initialized' });
        return;
      }

      const amountInBSV = variableAmount ? 0 : amount;
      logWithTimestamp(F, '🔍 [createButton] [Step 5] Converted amount to BSV:', amountInBSV);

      // Insert into payment_buttons
      await db('payment_buttons').insert({
        id: paymentId,
        button_id: buttonId,
        merchant_id: merchantId,
        amount: amountInBSV,
        currency,
        variable_amount: variableAmount,
        multi_use: multiUse,
        used: false,
        total_paid: 0,
        accepts,
        description,
        customCSS,
        created_at: db.fn.now(),
        updated_at: db.fn.now(),
      });
      logWithTimestamp(F, '✅ [createButton] Inserted payment button:', { paymentId, buttonId });
      res.status(201).json({
        status: 'success',
        message: 'Payment button created successfully',
        paymentId, // Return client-provided paymentId
        buttonId,  // Return client-provided buttonId
      });
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : '❌ Unknown error';
      logWithTimestamp(F, '❌ [createButton] Error creating payment button:', {
        message: errorMessage,
        stack: err instanceof Error ? err.stack : '❌ No stack trace',
        requestBody: req.body,
      });
      res.status(500).json({ status: 'error', message: `❌ ${errorMessage}` });
    }
  },
};