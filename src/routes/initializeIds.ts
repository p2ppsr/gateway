/**
 * @file src/routes/initializeIds.ts
 *
 * POST route to validate client-generated payment or button IDs in the database.
 * Validates and stores the client-provided ID (paymentId or buttonId) in the ids table, ensuring uniqueness.
 * Updates the payment_buttons and payments table descriptions to reflect the new payment_id or button_id using getBase58Regex for replace all.
 * Leverages the 'description' column in the payments table for payment-specific data and payment_buttons for initial/default values.
 *
 * Used by the Gateway UI to pre-register a single unique ID for payment buttons or payments in the ids table,
 * satisfying the foreign key constraint for payment_buttons and payments.
 *
 * - IDs are client-generated 12-character Base58-encoded strings, validated for uniqueness by the database.
 * - Description is a required field, displayed in the Metanet client, and limited to 80 characters.
 *
 * @version v1.59 (Updated 24Aug2025_2330 BST to fix paymentId validation and add buttonId existence check)
 * @changelog
 * - 14Aug2025_2000 BST (v1.40): Updated to validate only the requested ID, returning success/failure status without querying other IDs.
 * - 17Aug2025_1605 BST (v1.41): Added description update for payment_id in payment_buttons table using replace all.
 * - 17Aug2025_1615 BST (v1.42): Changed duplicate ID handling to return error (409) and used general replace all for 12-character Base58 payment_id.
 * - 17Aug2025_1625 BST (v1.44): Renamed isIdMatch to getBase58Regex for clarity.
 * - 17Aug2025_1630 BST (v1.45): Added isBase58 for validation in middlewares.
 * - 17Aug2025_1640 BST (v1.46): Used isMerchantId from general.ts for merchantId validation.
 * - 17Aug2025_1700 BST (v1.47): Corrected merchantId validation to 64 characters using isMerchantId.
 * - 17Aug2025_1705 BST (v1.48): Removed id from response, used paymentId/buttonId post-validation, fixed log typo.
 * - 19Aug2025_1240 BST (v1.49): Added payment_id update for multi-use buttons in payment_buttons, improved description handling with fallback, fixed maxAttempts scope, corrected versioning.
 * - 21Aug2025_1453 BST (v1.50): Integrated 'description' column from payments table, enhanced description update logic.
 * - 23Aug2025_1520 BST (v1.51): Used generateAndValidateUniqueId utility for ID generation.
 * - 23Aug2025_1530 BST (v1.52): Updated generateAndValidateUniqueId to use generateBase58.
 * - 23Aug2025_1535 BST (v1.53): Used 'id' instead of 'newId' for clarity.
 * - 23Aug2025_1545 BST (v1.54): Set description max length to 80 characters.
 * - 23Aug2025_1705 BST (v1.55): Updated generateAndValidateUniqueId to handle payments.description update.
 * - 23Aug2025_1710 BST (v1.56): Made description a required field and updated schema logic for Metanet client display.
 * - 24Aug2025_2115 BST (v1.57): Fixed duplicate ID insertion by updating id variable in loop, added table locking, and returned newId in 409 response.
 * - 24Aug2025_2330 BST (v1.59): Fixed paymentId validation by prioritizing paymentId, added separate buttonId existence check with read lock, ensured correct targetType.
 */
const F = 'routes/initializeIds';
import knex, { Knex } from 'knex';
import knexConfig from '../../knexfile';
import type { Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { logWithTimestamp } from '../utils/logging';
import { generateBase58, getBase58Regex, isBase58, isMerchantId } from '../utils/general';
import { generateAndValidateUniqueId } from '../utils/idGenerator';
const db: Knex = knex(knexConfig);
interface Ids {
  buttonId?: string;
  paymentId?: string;
  merchantId: string;
  description: string; // Changed to required
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
      .withMessage('paymentId must be a 12-character Base58 string')
      .custom((value) => isBase58(value))
      .withMessage('paymentId must be a 12-character Base58 string'),
    body('merchantId')
      .trim()
      .escape()
      .isString()
      .notEmpty()
      .withMessage('merchantId must be a non-empty string')
      .custom((value) => isMerchantId(value))
      .withMessage('merchantId must be a 64- or 66-character hex string'),
    body('description')
      .trim()
      .escape()
      .isString()
      .notEmpty()
      .withMessage('description is required')
      .isLength({ max: 80 })
      .withMessage('description exceeds maximum length of 80 characters'),
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
    const senderIdentityKey = (req as any).auth?.identityKey;
    if (!senderIdentityKey) {
      logWithTimestamp(F, '❌ [initializeIds] Missing sender identity key from auth context');
      res.status(401).json({ status: 'error', message: '❌ Unauthorized: Missing sender identity' });
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
    if (senderIdentityKey !== merchantId) {
      logWithTimestamp(F, '❌ [initializeIds] Sender identity does not match merchantId:', { senderIdentityKey, merchantId });
      res.status(403).json({ status: 'error', message: 'Sender identity does not match merchantId', request: { body: req.body, headers: req.headers } });
      return;
    }
    logWithTimestamp(F, '✅ [initializeIds] MerchantId validated:', { merchantId });
    let id = paymentId || buttonId || (await generateAndValidateUniqueId(merchantId, paymentId ? 'payment' : 'button', description, paymentId));
    const targetType = paymentId ? 'payment' : 'button';
    try {
      await db.transaction(async (trx) => {
        let attempts = 0;
        let currentId = id; // Track the ID being validated (buttonId or paymentId)
        // For paymentId requests with buttonId, verify buttonId exists
        if (paymentId && buttonId) {
          await trx.raw('LOCK TABLES ids READ'); // Lock for reading buttonId
          try {
            const existingButton = await trx('ids')
              .where({ id: buttonId, type: 'button', merchant_id: merchantId })
              .first();
            if (!existingButton) {
              logWithTimestamp(F, '❌ [initializeIds] Button ID does not exist:', { buttonId, merchantId });
              res.status(400).json({
                status: 'error',
                message: `Button ID ${buttonId} does not exist`,
                request: { body: req.body, headers: req.headers },
                merchantId,
              });
              return;
            }
          } finally {
            await trx.raw('UNLOCK TABLES'); // Release read lock
          }
        }
        while (attempts < 3) {
          await trx.raw('LOCK TABLES ids WRITE, payments READ'); // Lock for insert
          try {
            const existingId = await trx('ids')
              .where({ id: currentId, type: targetType, merchant_id: merchantId })
              .first();
            const existingPayment = targetType === 'payment' ? await trx('payments')
              .where({ payment_id: currentId })
              .first() : null;
            if (!existingId && !existingPayment) {
              await trx('ids').insert({
                id: currentId,
                merchant_id: merchantId,
                type: targetType,
                timestamp: trx.fn.now(),
              });
              logWithTimestamp(F, '✅ [initializeIds] ID inserted:', { id: currentId, merchantId, type: targetType });
              await trx.raw('UNLOCK TABLES'); // Release locks
              res.status(200).json({ status: 'success', id: currentId });
              return;
            }
          } catch (dbErr) {
            await trx.raw('UNLOCK TABLES'); // Release locks on database error
            const errorMessage = dbErr instanceof Error ? dbErr.message : 'Database error';
            if (errorMessage.includes('ER_LOCK_DEADLOCK') || errorMessage.includes('ER_QUERY_TIMEOUT')) {
              logWithTimestamp(F, '⚠️ [initializeIds] Database error (retryable):', {
                error: errorMessage,
                id: currentId,
                attempt: attempts + 1,
              });
              attempts++;
              currentId = await generateAndValidateUniqueId(merchantId, targetType, description, paymentId);
              continue;
            }
            throw dbErr; // Non-retryable error
          }
          await trx.raw('UNLOCK TABLES'); // Release locks on duplicate
          attempts++;
          currentId = await generateAndValidateUniqueId(merchantId, targetType, description, paymentId);
          logWithTimestamp(F, `⚠️ [initializeIds] Duplicate ${targetType} ID detected, trying new ID:`, {
            oldId: id,
            newId: currentId,
            merchantId,
            type: targetType,
            attempt: attempts,
          });
          id = currentId; // Update id for consistency
        }
        await trx.raw('UNLOCK TABLES'); // Ensure locks are released
        logWithTimestamp(F, '❌ [initializeIds] Failed to generate unique ID after 3 attempts:', {
          originalId: id,
          lastAttemptedId: currentId,
          merchantId,
          type: targetType,
        });
        res.status(409).json({
          status: 'error',
          message: 'Failed to generate unique ID after 3 attempts',
          newId: currentId, // Suggest new ID for client retry
          request: { body: req.body, headers: req.headers },
          merchantId,
        });
      });
    } catch (err) {
      await db.raw('UNLOCK TABLES'); // Ensure locks are released on error
      const errorMessage = err instanceof Error ? err.message : '❌ Unknown error';
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
  },
};
