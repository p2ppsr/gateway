/**
 * @file src/routes/invoice.ts
 * @description POST route to create a payment invoice for a given paymentId and buttonId.
 * Validates the payment button, checks multi-use status, and generates a transaction output for payment processing.
 * For multi-use buttons, validates the paymentId via /api/initializeIds only if not in the ids table to handle HTML reuse cases.
 * Uses payment_buttons.description for the output description and generates a derived locking script.
 *
 * Version: v2.29 (Updated 20Aug2025_1445 BST to add maximum logging for ids table and authentication)
 * Change Log:
 * - 19Aug2025_1135 BST (v2.19): Replaced fetch call to /api/initializeIds with direct call to initializeIds handler.
 * - 19Aug2025_1145 BST (v2.20): Fixed TypeScript error with InitRequest interface, updated 'mock' to 'simulate frontend request'.
 * - 19Aug2025_1155 BST (v2.21): Fixed initRes to exit early on 409 response to prevent overwriting with 200.
 * - 19Aug2025_1205 BST (v2.22): Replaced initializeIds.func call with direct duplicate check in ids table.
 * - 19Aug2025_1220 BST (v2.23): Reverted to calling initializeIds.func with proper response handling, added paymentId to response.
 * - 19Aug2025_1230 BST (v2.24): Updated outputDescription to use new paymentId, ensured consistency with initializeIds.
 * - 19Aug2025_1240 BST (v2.25): Used payment_buttons.description for outputDescription.
 * - 20Aug2025_1422 BST (v2.26): Reverted to fetch call for /api/initializeIds to restore authentication middleware propagation, fixing 401 Unauthorized error.
 * - 20Aug2025_1427 BST (v2.27): Skipped /api/initializeIds call for valid multi-use buttons to avoid redundant authentication, fixing 403 Sender identity mismatch error.
 * - 20Aug2025_1445 BST (v2.29): Enhanced logging for ids table check, authentication context, and initializeIds response to debug second-click 403 error.
 */
const F = 'routes/invoice';
import knex, { Knex } from 'knex';
import knexConfig from '../../knexfile';
import { randomBytes } from 'crypto';
import { Hash, P2PKH, PrivateKey, PublicKey, Utils } from '@bsv/sdk';
import { Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { logWithTimestamp } from '../utils/logging';
import { CONFIG } from '../utils/constants';
const db: Knex = knex(knexConfig);
let transactionIdNew: string;
interface PaymentButton {
  button_id: string;
  merchant_id: string;
  payment_id: string | null;
  multi_use: boolean;
  used: boolean;
  variable_amount: boolean;
  amount: number;
  description: string;
  html_code: string;
  total_paid: number | null;
  created_at: string | null;
  updated_at: string | null;
}
interface RequestBody {
  paymentId: string;
  buttonId: string;
  merchantId: string;
  amount: number;
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
  ],
  func: async (req: Request, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      logWithTimestamp(F, '❌ [invoice] Validation errors:', errors.array());
      res.status(400).json({ status: 'error', message: '❌ Invalid parameters', errors: errors.array() });
      return;
    }
    const senderIdentityKey = (req as any).auth?.identityKey;
    logWithTimestamp(F, '🔍 [invoice] [Step 0] Sender identity key from auth context:', {
      senderIdentityKey,
      expectedMerchantId: req.body.merchantId,
      headers: req.headers,
    });
    if (!senderIdentityKey) {
      logWithTimestamp(F, '❌ [invoice] Missing sender identity key from auth context');
      res.status(401).json({ status: 'error', message: '❌ Unauthorized: Missing sender identity' });
      return;
    }
    let { paymentId, buttonId, merchantId, amount }: RequestBody = req.body;
    logWithTimestamp(F, '🔍 [invoice] [Step 1] Received request body:', { paymentId, buttonId, merchantId, amount });
    try {
      // Verify the payment button exists and belongs to the specified merchant
      logWithTimestamp(F, '🔍 [invoice] [Step 2] Executing query:', { paymentId, merchantId });
      const button: PaymentButton | undefined = await db('payment_buttons')
        .where({
          payment_id: paymentId,
          merchant_id: merchantId,
        })
        .first();
      logWithTimestamp(F, '🔍 [invoice] [Step 2] Payment button data:', {
        ...button,
        description: button?.description || 'Not set',
      });
      if (button === undefined) {
        logWithTimestamp(F, '❌ [invoice] Payment button not found for merchant:', { paymentId, merchantId });
        res.status(404).json({
          status: 'error',
          message: 'Payment button not found for the specified merchant',
        });
        return;
      }
      if (button.button_id !== buttonId) {
        logWithTimestamp(F, '❌ [invoice] Button ID mismatch:', { buttonId, expected: button.button_id });
        res.status(400).json({
          status: 'error',
          message: 'Button ID does not match the payment button',
        });
        return;
      }
      logWithTimestamp(F, '🔍 [invoice] [Step 3] Checking multi-use status:', {
        multi_use: button.multi_use,
        used: button.used,
      });
      if (!button.multi_use && button.used) {
        logWithTimestamp(F, '❌ [invoice] Single-use button already used:', paymentId);
        res.status(400).json({
          status: 'error',
          message: 'This single-use button has been used',
        });
        return;
      }
      // For multi-use buttons, check if paymentId exists in ids table
      if (button.multi_use) {
        logWithTimestamp(F, '🔍 [invoice] [Step 4] Checking ids table for paymentId:', {
          paymentId,
          merchantId,
          query: db('ids').where({ id: paymentId, type: 'payment', merchant_id: merchantId }).toString(),
        });
        const existingId = await db('ids')
          .where({ id: paymentId, type: 'payment', merchant_id: merchantId })
          .first();
        logWithTimestamp(F, '🔍 [invoice] [Step 4] ids table query result:', { existingId });
        if (!existingId) {
          logWithTimestamp(F, '🔍 [invoice] [Step 4] paymentId not found in ids table, validating with initializeIds:', paymentId);
          const initResponse = await fetch(`${CONFIG.API_BASE}/api/initializeIds`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-bsv-auth-identity-key': senderIdentityKey,
            },
            body: JSON.stringify({
              paymentId,
              merchantId,
              description: button.description,
            }),
          });
          const initData = await initResponse.json();
          logWithTimestamp(F, '🔍 [invoice] [Step 4] initializeIds response:', {
            status: initResponse.status,
            data: initData,
            requestHeaders: {
              'x-bsv-auth-identity-key': senderIdentityKey,
            },
            responseHeaders: Object.fromEntries(initResponse.headers.entries()),
          });
          if (initResponse.status === 409 && initData?.status === 'error' && initData?.newId) {
            paymentId = initData.newId;
            logWithTimestamp(F, '🔍 [invoice] [Step 4] Using new paymentId from initializeIds:', paymentId);
            // Refresh button data to get updated payment_id and description
            const updatedButton: PaymentButton | undefined = await db('payment_buttons')
              .where({ button_id: buttonId, merchant_id: merchantId })
              .first();
            if (updatedButton) {
              logWithTimestamp(F, '🔍 [invoice] [Step 4] Refreshed button data:', {
                ...updatedButton,
                description: updatedButton.description || 'Not set',
              });
              button.description = updatedButton.description;
              button.payment_id = updatedButton.payment_id;
            }
          } else if (initResponse.status !== 200 || initData?.status !== 'success') {
            logWithTimestamp(F, '❌ [invoice] initializeIds failed:', {
              status: initResponse.status,
              data: initData,
            });
            res.status(500).json({
              status: 'error',
              message: `Failed to validate paymentId: ${initData?.message || 'Unknown error'}`,
            });
            return;
          }
        } else {
          logWithTimestamp(F, '🔍 [invoice] [Step 4] paymentId already valid in ids table, skipping initializeIds:', paymentId);
        }
      }
      logWithTimestamp(F, '🔍 [invoice] [Step 5] Validating amount:', {
        requested: amount,
        buttonAmount: button.amount,
        variable: button.variable_amount,
      });
      if (!button.variable_amount && Math.abs(amount - button.amount) > 1) {
        logWithTimestamp(F, '❌ [invoice] Amount mismatch for fixed-amount button:', {
          requested: amount,
          expected: button.amount,
        });
        res.status(400).json({
          status: 'error',
          message: 'Amount mismatch for fixed-amount button (expected satoshis)',
        });
        return;
      }
      transactionIdNew = randomBytes(12).toString('hex').slice(0, 12);
      logWithTimestamp(F, '🔍 [invoice] [Step 6] Generating transaction ID:', transactionIdNew);
      const paymentsSchema = await db('information_schema.columns')
        .where({ table_name: 'payments' })
        .select('column_name');
      logWithTimestamp(F, '🔍 [invoice] [Step 6] Payments table schema:', paymentsSchema.map(col => col.column_name));
      await db('payments').insert({
        transaction_id: transactionIdNew,
        payment_id: paymentId,
        button_id: buttonId,
        payer_id: senderIdentityKey,
        merchant_id: merchantId,
        completed: false,
        blockchain_transaction: '',
        amount,
        exchange_rate: 1,
      });
      logWithTimestamp(F, '✅ [invoice] [Step 7] Payment invoice created:', {
        paymentId,
        buttonId,
        transactionId: transactionIdNew,
      });
      let senderPrivateKey: PrivateKey;
      try {
        const hasCreatedAt =
          (await db('information_schema.columns')
            .where({ table_name: 'payment_buttons', column_name: 'created_at' })
            .first()) !== undefined;
        if (!hasCreatedAt || !button.created_at || new Date(button.created_at) < new Date('2025-07-25T12:00:00Z')) {
          senderPrivateKey = new PrivateKey('0000000000000000000000000000000000000000000000000000000000000001', 'hex');
          logWithTimestamp(F, '🔍 [invoice] Using hardcoded key for pre-v1.2 or missing created_at button:', paymentId);
        } else {
          senderPrivateKey = new PrivateKey(senderIdentityKey, 'hex');
          logWithTimestamp(F, '🔍 [invoice] Using authenticated identity key for new button');
        }
      } catch (err) {
        logWithTimestamp(F, '⚠️ [invoice] created_at column check failed, using hardcoded key as fallback:', err);
        senderPrivateKey = new PrivateKey('0000000000000000000000000000000000000000000000000000000000000001', 'hex');
      }
      const recipientPublicKey = PublicKey.fromString(button.merchant_id);
      const invoiceNumber = `2-3241645161d8-${transactionIdNew} 1`;
      const combined = Utils.toArray(
        `${senderPrivateKey.toString()}${recipientPublicKey.toString()}${invoiceNumber}`,
        'utf8'
      );
      const derivedHash = Hash.sha256(Hash.sha256(combined));
      const derivedPriv = new PrivateKey(Utils.toHex(derivedHash), 'hex');
      const derivedPublicKey = derivedPriv.toPublicKey().toString();
      const pkh = new P2PKH();
      const derivedScript = pkh.lock(PublicKey.fromString(derivedPublicKey).toHash()).toHex();
      logWithTimestamp(F, '🔍 [invoice] [Step 8] Generated derived script:', derivedScript);
      const satoshis = button.variable_amount ? amount : button.amount;
      logWithTimestamp(F, '🔍 [invoice] [Step 9] Calculated satoshis for output:', satoshis);
      const outputDescription = button.description;
      logWithTimestamp(F, '🔍 [invoice] [Step 10] Using output description:', outputDescription);
      const outputs = [
        {
          lockingScript: derivedScript,
          satoshis,
          outputDescription,
          merchantId,
        },
      ];
      logWithTimestamp(F, '🔍 [invoice] [Step 11] Response outputs:', outputs);
      res.status(200).json({
        status: 'success',
        message: 'Invoice created successfully',
        paymentId,
        outputs,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : '❌ Unknown error';
      logWithTimestamp(F, '❌ [invoice] Error creating invoice:', {
        message,
        stack: error instanceof Error ? error.stack : '❌ No stack trace',
        requestBody: req.body,
        errorDetails: error,
        transaction_id: transactionIdNew ? transactionIdNew : 'N/A',
      });
      res.status(500).json({
        status: 'error',
        message: `❌ Internal server error: ${message} (transaction_id: ${transactionIdNew ?? 'N/A'})`,
      });
    }
  },
};