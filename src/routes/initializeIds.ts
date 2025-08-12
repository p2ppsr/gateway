/**
 * @file src/routes/initializeIds.ts
 *
 * POST route to initialize client-generated payment and button IDs in the database.
 * Validates and stores client-provided paymentId and buttonId in the ids table, ensuring uniqueness.
 * Initially integrated during button creation, planned to move to page launch in the next iteration.
 *
 * Used by the Gateway UI to pre-register unique IDs for payment buttons and payments in the ids table,
 * satisfying the foreign key constraint for payment_buttons and payments. Actual payment button and payment
 * creation is handled by the createButton and other routes.
 *
 * - IDs are client-generated 12-character Base58-encoded strings, validated for uniqueness by the database.
 *
 * Version: v1.31 (Updated 11Aug2025_2345 BST to fix syntax errors in logging)
 * Change Log:
 * - 10Aug2025_1750 BST (v1.0): Initial implementation to support client-side ID generation and uniqueness validation.
 * - 11Aug2025_1025 BST (v1.1): Updated to insert paymentId into ids table with type 'button' before payment_buttons to satisfy foreign key constraint.
 * - 11Aug2025_1050 BST (v1.2): Removed payment_buttons insertion, focusing solely on ids pre-population, aligning with createButton workflow.
 * - 11Aug2025_1052 BST (v1.3): Added support for both paymentId (type: 'payment') and buttonId (type: 'button') in ids table.
 * - 11Aug2025_2045 BST (v1.4): Added merchant_id from WalletClient, transaction management, and detailed logging.
 * - 11Aug2025_2048 BST (v1.5): Enforced merchant_id validation and improved error logging.
 * - 11Aug2025_2050 BST (v1.6): Ensured merchant_id is consistently included and added fallback for wallet context.
 * - 11Aug2025_2055 BST (v1.7): Added detailed validation logging to diagnose 400 errors.
 * - 11Aug2025_2100 BST (v1.8): Considered session field and enhanced request logging.
 * - 11Aug2025_2105 BST (v1.9): Fixed errorDetails logging and added full request context for 400 diagnostics.
 * - 11Aug2025_2108 BST (v1.10): Corrected errorDetails to use err.type and enhanced logging with err.path.
 * - 11Aug2025_2110 BST (v1.11): Added merchantId logging and validation checks.
 * - 11Aug2025_2115 BST (v1.12): Fixed errorDetails to use only valid properties (msg, type).
 * - 11Aug2025_2118 BST (v1.13): Deferred green ticks until merchantId validation.
 * - 11Aug2025_2120 BST (v1.14): Added logging of generated SQL for insert statements.
 * - 11Aug2025_2130 BST (v1.15): Aligned with historical 3-field schema, removed session.
 * - 11Aug2025_2135 BST (v1.16): Removed merchant_id from inserts to match historical schema.
 * - 11Aug2025_2140 BST (v1.17): Updated to handle single request for both IDs, fixing duplicate call issue.
 * - 11Aug2025_2145 BST (v1.18): Adjusted to support optional single ID requests for resilience.
 * - 11Aug2025_2155 BST (v1.19): Enhanced validation logging to diagnose 400 errors.
 * - 11Aug2025_2200 BST (v1.20): Added detailed validation process logging and checked rule locations.
 * - 11Aug2025_2220 BST (v1.21): Added route hit logging and verified proxy setup.
 * - 11Aug2025_2230 BST (v1.22): Re-added merchantId in inserts to match current run configuration.
 * - 11Aug2025_2235 BST (v1.23): Updated to use client-sent merchantId instead of backend derivation.
 * - 11Aug2025_2300 BST (v1.24): Added transaction debug logging to diagnose insert failures.
 * - 11Aug2025_2305 BST (v1.25): Fixed rollback syntax and enhanced transaction logging.
 * - 11Aug2025_2310 BST (v1.26): Reverted transaction logic to original and added debugging for persistence.
 * - 11Aug2025_2315 BST (v1.27): Removed .onConflict and added error logging to diagnose persistence.
 * - 11Aug2025_2320 BST (v1.28): Added dynamic merchants population to satisfy foreign key constraint.
 * - 11Aug2025_2325 BST (v1.29): Added merchant population from createButton logic.
 * - 11Aug2025_2340 BST (v1.30): Enhanced insert result logging to diagnose [0] discrepancy.
 * - 11Aug2025_2345 BST (v1.31): Fixed syntax errors in logging.
 */
const F = 'routes/initializeIds';
import knex, { Knex } from 'knex';
import knexConfig from '../../knexfile';
import type { Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { logWithTimestamp } from '../utils/logging';
import { WalletClient } from '@bsv/sdk'; // For typing, though not used for derivation

const db: Knex = knex(knexConfig);

interface Ids {
  buttonId?: string; // Optional
  paymentId?: string; // Optional
  merchantId?: string; // Added to match client request
}

export default {
  type: 'post',
  path: '/initializeIds',
  middlewares: [
    body('buttonId').optional().trim().escape().isString().notEmpty().withMessage('buttonId must be a non-empty string'),
    body('paymentId').optional().trim().escape().isString().notEmpty().withMessage('paymentId must be a non-empty string'),
    body('merchantId').optional().trim().escape().isString().notEmpty().withMessage('merchantId must be a non-empty string').matches(/^[0-9a-fA-F]{66}$/).withMessage('merchantId must be a 66-character hex string'),
  ],
  func: async (req: Request, res: Response): Promise<void> => {
    logWithTimestamp(F, '[initializeIds] Route hit for /api/initializeIds', { method: req.method, url: req.url, body: req.body, headers: req.headers });
    logWithTimestamp(F, '[initializeIds] Applying validation middlewares:', { middlewareRules: [
      'buttonId: optional, trim, escape, isString, notEmpty',
      'paymentId: optional, trim, escape, isString, notEmpty',
      'merchantId: optional, trim, escape, isString, notEmpty, matches /^[0-9a-fA-F]{66}$/'
    ] });
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const errorDetails = errors.array().map(err => `${err.msg} (type: ${err.type})`).join('; ');
      logWithTimestamp(F, '❌ [initializeIds] Validation failed:', { errors: errorDetails, body: req.body, headers: req.headers, merchantId: req.body.merchantId });
      res.status(400).json({ status: 'error', message: `❌ Validation failed: ${errorDetails}`, errors: errors.array(), request: { body: req.body, headers: req.headers } });
      return;
    }
    const { buttonId, paymentId, merchantId } = req.body as Ids;

    // Use client-sent merchantId instead of deriving from wallet
    if (!merchantId) {
      logWithTimestamp(F, '[initializeIds] merchantId not provided in request body', { body: req.body, headers: req.headers });
      res.status(400).json({ status: 'error', message: '❌ merchantId is required', request: { body: req.body, headers: req.headers } });
      return;
    }
    logWithTimestamp(F, '[initializeIds] MerchantId received from client:', { merchantId });
    if (!/^[0-9a-fA-F]{66}$/.test(merchantId)) {
      logWithTimestamp(F, '❌ [initializeIds] Invalid merchant identity format:', { merchantId, body: req.body, headers: req.headers });
      res.status(400).json({ status: 'error', message: '❌ Invalid merchantId format', request: { body: req.body, headers: req.headers } });
      return;
    }
    logWithTimestamp(F, '✅ [initializeIds] MerchantId validated:', { merchantId });

    try {
      await db.transaction(async (trx) => {
        let performedInsert = false;

        // Check and insert merchant if not exists, mimicking createButton logic
        const merchantExists = await trx('merchants')
          .where({ merchant_id: merchantId })
          .first();
        if (!merchantExists) {
          logWithTimestamp(F, '🔍 [initializeIds] [Step 4] Inserting new merchant:', merchantId);
          await trx('merchants').insert({
            merchant_id: merchantId,
            custom_fee_rate: 0,
            welcomed: false,
            custom_fee: false,
          });
          logWithTimestamp(F, '✅ [initializeIds] Inserted new merchant:', merchantId);
        } else {
          logWithTimestamp(F, '🔍 [initializeIds] Merchant already exists:', merchantId);
        }

        // Step 1: Insert buttonId into ids with type 'button' if provided
        if (buttonId) {
          try {
            const buttonQuery = trx('ids')
              .insert({
                id: buttonId,
                merchant_id: merchantId,
                type: 'button',
                timestamp: trx.fn.now()
              });
            logWithTimestamp(F, '[initializeIds] Generated SQL for Button ID insert:', { sql: buttonQuery.toSQL().toNative() });
            const buttonResult = await buttonQuery;
            const buttonCount = await trx('ids').where({ id: buttonId }).count('* as count').first();
            logWithTimestamp(F, `[initializeIds] Button ID insert result: ${JSON.stringify(buttonResult)} (Rows in table: ${buttonCount ? buttonCount.count : 0})`, { buttonId, merchantId });
            if (buttonResult.length === 0) {
              logWithTimestamp(F, '⚠️ [initializeIds] Button ID insert returned no new rows', { buttonId, merchantId });
            } else {
              logWithTimestamp(F, '✅ [initializeIds] Button ID inserted:', { buttonId, merchantId });
              performedInsert = true;
            }
          } catch (err) {
            logWithTimestamp(F, '❌ [initializeIds] Error inserting Button ID:', { error: err instanceof Error ? err.message : 'Unknown error', buttonId, merchantId });
            throw err; // Re-throw to trigger rollback
          }
        }

        // Step 2: Insert paymentId into ids with type 'payment' if provided
        if (paymentId) {
          try {
            const paymentQuery = trx('ids')
              .insert({
                id: paymentId,
                merchant_id: merchantId,
                type: 'payment',
                timestamp: trx.fn.now()
              });
            logWithTimestamp(F, '[initializeIds] Generated SQL for Payment ID insert:', { sql: paymentQuery.toSQL().toNative() });
            const paymentResult = await paymentQuery;
            const paymentCount = await trx('ids').where({ id: paymentId }).count('* as count').first();
            logWithTimestamp(F, `[initializeIds] Payment ID insert result: ${JSON.stringify(paymentResult)} (Rows in table: ${paymentCount ? paymentCount.count : 0})`, { paymentId, merchantId });
            if (paymentResult.length === 0) {
              logWithTimestamp(F, '⚠️ [initializeIds] Payment ID insert returned no new rows', { paymentId, merchantId });
            } else {
              logWithTimestamp(F, '✅ [initializeIds] Payment ID inserted:', { paymentId, merchantId });
              performedInsert = true;
            }
          } catch (err) {
            logWithTimestamp(F, '❌ [initializeIds] Error inserting Payment ID:', { error: err instanceof Error ? err.message : 'Unknown error', paymentId, merchantId });
            throw err; // Re-throw to trigger rollback
          }
        }

        // Debug transaction state
        logWithTimestamp(F, '[initializeIds] Transaction completing...', { transaction: trx });

        // If no inserts were performed, consider it a failure
        if (!performedInsert) {
          throw new Error('❌ No valid IDs provided for insertion');
        }
      });

      logWithTimestamp(F, '✅ [initializeIds] IDs pre-populated in ids table:', { buttonId, paymentId, merchantId });
      res.status(201).json({ status: 'success', buttonId, paymentId });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '❌ Unknown error';
      logWithTimestamp(F, '❌ [initializeIds] Error pre-populating IDs:', { message: errorMessage, error: err, stack: err instanceof Error ? err.stack : undefined, body: req.body, headers: req.headers, merchantId });
      res.status(500).json({ status: 'error', message: `❌ ${errorMessage}`, request: { body: req.body, headers: req.headers }, merchantId });
    }
  },
};