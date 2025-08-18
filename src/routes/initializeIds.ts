/**
 * @file src/routes/initializeIds.ts
 *
 * POST route to validate client-generated payment or button IDs in the database.
 * Validates and stores the client-provided ID (paymentId or buttonId) in the ids table, ensuring uniqueness.
 * Updates the payment_buttons table's description to reflect the new payment_id using getBase58Regex for replace all.
 *
 * Used by the Gateway UI to pre-register a single unique ID for payment buttons or payments in the ids table,
 * satisfying the foreign key constraint for payment_buttons and payments.
 *
 * - IDs are client-generated 12-character Base58-encoded strings, validated for uniqueness by the database.
 *
 * Version: v1.48 (Updated 17Aug2025_1705 BST to remove id from response and fix naming)
 * Change Log:
 * - 14Aug2025_2000 BST (v1.40): Updated to validate only the requested ID, returning success/failure status without querying other IDs.
 * - 17Aug2025_1605 BST (v1.41): Added description update for payment_id in payment_buttons table using replace all.
 * - 17Aug2025_1615 BST (v1.42): Changed duplicate ID handling to return error (409) and used general replace all for 12-character Base58 payment_id.
 * - 17Aug2025_1625 BST (v1.44): Renamed isIdMatch to getBase58Regex for clarity.
 * - 17Aug2025_1630 BST (v1.45): Added isBase58 for validation in middlewares.
 * - 17Aug2025_1640 BST (v1.46): Used isMerchantId from general.ts for merchantId validation.
 * - 17Aug2025_1700 BST (v1.47): Corrected merchantId validation to 64 characters using isMerchantId.
 * - 17Aug2025_1705 BST (v1.48): Removed id from response, used paymentId/buttonId post-validation, fixed log typo.
 */
const F = 'routes/initializeIds';
import knex, { Knex } from 'knex';
import knexConfig from '../../knexfile';
import type { Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { logWithTimestamp } from '../utils/logging';
import { generateBase58, getBase58Regex, isBase58, isMerchantId } from '../utils/general';
import { WalletClient } from '@bsv/sdk';
const db: Knex = knex(knexConfig);

interface Ids {
  buttonId?: string;
  paymentId?: string;
  merchantId: string;
  description?: string; // Optional description to update
}

export default {
  type: 'post',
  path: '/initializeIds',
  middlewares: [
    body('buttonId')
      .optional()
      .trim()
      .escape()
      .isString()
      .notEmpty()
      .withMessage('buttonId must be a non-empty string')
      .isLength({ min: 12, max: 12 })
      .withMessage('buttonId must be exactly 12 characters')
      .custom((value) => isBase58(value))
      .withMessage('buttonId must be a 12-character Base58 string'),
    body('paymentId')
      .optional()
      .trim()
      .escape()
      .isString()
      .notEmpty()
      .withMessage('paymentId must be a non-empty string')
      .isLength({ min: 12, max: 12 })
      .withMessage('paymentId must be exactly 12 characters')
      .custom((value) => isBase58(value))
      .withMessage('paymentId must be a 12-character Base58 string'),
    body('merchantId')
      .trim()
      .escape()
      .isString()
      .notEmpty()
      .withMessage('merchantId must be a non-empty string')
      .custom((value) => isMerchantId(value))
      .withMessage('merchantId must be a 64-character hex string'),
    body('description')
      .optional()
      .trim()
      .isString()
      .withMessage('description must be a string'),
  ],
  func: async (req: Request, res: Response): Promise<void> => {
    logWithTimestamp(F, '[initializeIds] Route hit for /api/initializeIds', {
      method: req.method,
      url: req.url,
      body: req.body,
      headers: req.headers,
    });

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const errorDetails = errors.array().map((err) => `${err.msg} (type: ${err.type})`).join('; ');
      logWithTimestamp(F, '❌ [initializeIds] Validation failed:', {
        errors: errorDetails,
        body: req.body,
        headers: req.headers,
      });
      res.status(400).json({
        status: 'error',
        message: `❌ Validation failed: ${errorDetails}`,
        errors: errors.array(),
        request: { body: req.body, headers: req.headers },
      });
      return;
    }

    const { buttonId, paymentId, merchantId, description } = req.body as Ids;
    if (!merchantId) {
      logWithTimestamp(F, '[initializeIds] merchantId not provided in request body', {
        body: req.body,
        headers: req.headers,
      });
      res.status(400).json({
        status: 'error',
        message: '❌ merchantId is required',
        request: { body: req.body, headers: req.headers },
      });
      return;
    }

    if (!isMerchantId(merchantId)) {
      logWithTimestamp(F, '❌ [initializeIds] Invalid merchant identity format:', {
        merchantId,
        body: req.body,
        headers: req.headers,
      });
      res.status(400).json({
        status: 'error',
        message: '❌ Invalid merchantId format',
        request: { body: req.body, headers: req.headers },
      });
      return;
    }

    logWithTimestamp(F, '✅ [initializeIds] MerchantId validated:', { merchantId });

    const targetId = buttonId || paymentId || generateBase58(12);
    const targetType = buttonId ? 'button' : 'payment';

    try {
      await db.transaction(async (trx) => {
        // Check if ID exists in the ids table
        const existingId = await trx('ids')
          .where({ id: targetId, type: targetType, merchant_id: merchantId })
          .first();

        if (existingId) {
          logWithTimestamp(F, `❌ [initializeIds] Duplicate ${targetType} ID detected:`, { id: targetId, merchantId, type: targetType });
          throw new Error(`Duplicate ${targetType} ID: ${targetId}`);
        }

        const query = trx('ids').insert({
          id: targetId,
          merchant_id: merchantId,
          type: targetType,
          timestamp: trx.fn.now(),
        });
        logWithTimestamp(F, '[initializeIds] Generated SQL for ID insert:', {
          sql: query.toSQL().toNative(),
        });
        await query;
        logWithTimestamp(F, '✅ [initializeIds] ID inserted:', { id: targetId, merchantId, type: targetType });

        // Update payment_buttons description if type is payment and description is provided
        if (targetType === 'payment' && description) {
          const newDescription = description.replace(getBase58Regex(), targetId);
          await trx('payment_buttons')
            .where({ payment_id: targetId, merchant_id: merchantId })
            .update({ description: newDescription, updated_at: trx.fn.now() });
          logWithTimestamp(F, '✅ [initializeIds] Updated payment_buttons description:', {
            payment_id: targetId,
            newDescription,
          });
        }
      });

      logWithTimestamp(F, '✅ [initializeIds] ID pre-populated in ids table:', { id: targetId, merchantId, type: targetType });
      res.status(200).json({ status: 'success' });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '❌ Unknown error';
      const isDbError = err instanceof Error && 'code' in err;
      if (isDbError && err.code === 'ER_DUP_ENTRY') {
        logWithTimestamp(F, '❌ [initializeIds] Duplicate ID detected:', { id: targetId, merchantId, type: targetType });
        res.status(409).json({
          status: 'error',
          message: `❌ Duplicate ${targetType} ID: ${targetId}`,
          request: { body: req.body, headers: req.headers },
          merchantId,
        });
      } else {
        logWithTimestamp(F, '❌ [initializeIds] Error pre-populating ID:', {
          message: errorMessage,
          error: err,
          stack: err instanceof Error ? err.stack : undefined,
          body: req.body,
          headers: req.headers,
          merchantId,
        });
        res.status(500).json({
          status: 'error',
          message: `❌ ${errorMessage}`,
          request: { body: req.body, headers: req.headers },
          merchantId,
        });
      }
    }
  },
};