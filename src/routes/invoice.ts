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
 * Version: v2.14 (Updated 13Aug2025_1130 BST to fix transactionIdNew scoping per ChatGPT suggestion)
 * Change Log:
 * - 05Aug2025_0420 BST (v2.1): Standardized route path and fixed prefix duplication by removing /api.
 * - 05Aug2025_0500 BST (v2.2): Initial attempt to update to use transaction_id (incomplete, rolled back).
 * - 05Aug2025_0600 BST (v2.3): Completed update to use transaction_id instead of payment_id, aligning with schema change to VARCHAR(64) primary key. Added change log to track history. Ensured compatibility with trigger update_transaction_id.
 * - 10Aug2025_0145 BST (v2.4): Enhanced logging to diagnose schema-related payment failures, aligned transaction_id with 12-character Base58 format.
 * - 10Aug2025_0215 BST (v2.4): Clarified logging usage (server-side only) to avoid client-side confusion.
 * - 12Aug2025_2100 BST (v2.5): Fixed id column reference from payment_id to id and enhanced query logging.
 * - 12Aug2025_2120 BST (v2.6): Fixed payments table schema reference from payment_button_id to payment_id and added schema debugging.
 * - 13Aug2025_0430 BST (v2.7): Updated to use payer_id instead of from to match schema.
 * - 13Aug2025_0945 BST (v2.8): Used payment_id as primary key, added button_id, and required buttonId in request.
 * - 13Aug2025_0955 BST (v2.9): Updated PaymentButton interface with id and button_id to match schema.
 * - 13Aug2025_1010 BST (v2.10): Restored transaction_id for locking script validation.
 * - 13Aug2025_1030 BST (v2.11): Required transaction_id in pay request to align with P2PKH validation.
 * - 13Aug2025_1035 BST (v2.12): Removed transaction_id from client response, using it server-side only.
 * - 13Aug2025_1040 BST (v2.13): Updated transaction_id generation to use randomBytes(12).toString('hex').slice(0, 12).
 * - 13Aug2025_1130 BST (v2.14): Fixed transactionIdNew scoping per ChatGPT suggestion with let declaration outside try.
 */
const F = 'routes/invoice';
import knex, { Knex } from 'knex';
import knexConfig from '../../knexfile';
import { randomBytes } from 'crypto';
import { Hash, P2PKH, PrivateKey, PublicKey, Utils } from '@bsv/sdk';
import { Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { logWithTimestamp } from '../utils/logging';
import { generateBase58 } from '../utils/general';
const db: Knex = knex(knexConfig);

let transactionIdNew: string; // Declare transactionIdNew outside try block for broader scope

interface PaymentButton {
  id: string; // Renamed from payment_id to match schema
  button_id: string; // Added to match the foreign key in payment_buttons
  merchant_id: string;
  multi_use: boolean;
  used: boolean;
  variable_amount: boolean;
  amount: number;
  currency: string;
  created_at?: string; // Optional timestamp
  description: string; // Custom spending description
}

interface RequestBody {
  paymentId: string; // Changed from paymentButtonId to align with new identifier
  buttonId: string;  // Required parameter
  merchantId: string;
  currency: string;
  amount: number;
}

export default {
  type: 'post',
  path: '/invoice', // Standardized route path
  middlewares: [
    body('paymentId').trim().escape().isString().notEmpty().withMessage('paymentId must be a non-empty string'),
    body('buttonId').trim().escape().isString().notEmpty().withMessage('buttonId must be a non-empty string'), // Validation
    body('merchantId').trim().escape().isString().notEmpty().withMessage('merchantId must be a non-empty string'),
    body('currency').trim().isIn(['BSV']).withMessage('Currency must be Sats'),
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
   * merchant's public key with an invoice number. Amounts are in Sats for output.
   *
   * @param req - Express request with `paymentId`, `buttonId`, `merchantId`, `currency`, and `amount` in Sats in body.
   * Auth middleware must populate `req.auth.identityKey`.
   * @param res - Express response object for sending success or error responses.
   * @returns {Promise<void>} Sends a 200 success response with derived outputs including merchantId and custom description.
   */
  func: async (req: Request, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      logWithTimestamp(F, '❌ [invoice] Validation errors:', errors.array());
      res.status(400).json({ status: 'error', message: '❌ Invalid parameters', errors: errors.array() });
      return;
    }
    const senderIdentityKey = (req as any).auth?.identityKey;
    if (!senderIdentityKey) {
      logWithTimestamp(F, '❌ [invoice] Missing sender identity key from auth context');
      res.status(401).json({ status: 'error', message: '❌ Unauthorized: Missing sender identity' });
      return;
    }
    const { paymentId, buttonId, merchantId, currency, amount }: RequestBody = req.body;
    logWithTimestamp(F, '🔍 [invoice] [Step 1] Received request body:', { paymentId, buttonId, merchantId, currency, amount });
    try {
      // Verify the payment button exists and belongs to the specified merchant
      logWithTimestamp(F, '🔍 [invoice] [Step 2] Executing query:', { paymentId, merchantId });
      const button: PaymentButton | undefined = await db('payment_buttons')
        .where({
          id: paymentId, // Updated from payment_id to id
          merchant_id: merchantId
        })
        .first();
      logWithTimestamp(F, '🔍 [invoice] [Step 2] Payment button data:', {
        ...button,
        description: button?.description || 'Not set'
      });
      if (button === undefined) {
        logWithTimestamp(F, '❌ [invoice] Payment button not found for merchant:', { paymentId, merchantId });
        res.status(404).json({
          status: 'error',
          message: 'Payment button not found for the specified merchant'
        });
        return;
      }
      // Verify the button_id matches the payment button
      if (button.button_id !== buttonId) {
        logWithTimestamp(F, '❌ [invoice] Button ID mismatch:', { buttonId, expected: button.button_id });
        res.status(400).json({
          status: 'error',
          message: 'Button ID does not match the payment button'
        });
        return;
      }
      // Verify the button has not already been used if it is a single-use button
      logWithTimestamp(F, '🔍 [invoice] [Step 3] Checking multi-use status:', { multi_use: button.multi_use, used: button.used });
      if (!button.multi_use && button.used) {
        logWithTimestamp(F, '❌ [invoice] Single-use button already used:', paymentId);
        res.status(400).json({
          status: 'error',
          message: 'This single-use button has already been used'
        });
        return;
      }
      // Verify the amount matches or the button is variable (all in BSV)
      logWithTimestamp(F, '🔍 [invoice] [Step 4] Validating amount:', { requested: amount, buttonAmount: button.amount, variable: button.variable_amount });
      if (!button.variable_amount && Math.abs(amount - button.amount) > 1) {
        logWithTimestamp(F, '❌ [invoice] Amount mismatch for fixed-amount button:', {
          requested: amount,
          expected: button.amount
        });
        res.status(400).json({
          status: 'error',
          message: 'Amount mismatch for fixed-amount button (expected BSV)'
        });
        return;
      }
      // Create a new payment with completed=false
      transactionIdNew = randomBytes(12).toString('hex').slice(0, 12); // Assign within try block
      logWithTimestamp(F, '🔍 [invoice] [Step 5] Generating transaction ID:', transactionIdNew);
      // Debug the payments table schema
      const paymentsSchema = await db('information_schema.columns')
        .where({ table_name: 'payments' })
        .select('column_name');
      logWithTimestamp(F, '🔍 [invoice] [Step 5] Payments table schema:', paymentsSchema.map(col => col.column_name));
      await db('payments').insert({
        transaction_id: transactionIdNew, // Stored server-side for validation
        payment_id: paymentId, // Client-passed value
        button_id: buttonId,
        payer_id: senderIdentityKey,
        merchant_id: merchantId,
        completed: false,
        blockchain_transaction: '',
        amount,
        currency,
        exchange_rate: 1
      });
      logWithTimestamp(F, '✅ [invoice] [Step 6] Payment invoice created:', { paymentId, buttonId, transactionId: transactionIdNew });
      // Determine sender private key based on button creation context
      let senderPrivateKey: PrivateKey;
      try {
        const hasCreatedAt = (await db('information_schema.columns')
          .where({ table_name: 'payments', column_name: 'created_at' })
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
      const invoiceNumber = `2-3241645161d8-${transactionIdNew} 1`; // Restored to use transactionIdNew
      const combined = Utils.toArray(
        `${senderPrivateKey.toString()}${recipientPublicKey.toString()}${invoiceNumber}`,
        'utf8'
      );
      const derivedHash = Hash.sha256(Hash.sha256(combined));
      const derivedPriv = new PrivateKey(Utils.toHex(derivedHash), 'hex');
      const derivedPublicKey = derivedPriv.toPublicKey().toString();
      const pkh = new P2PKH();
      const derivedScript = pkh.lock(PublicKey.fromString(derivedPublicKey).toHash()).toHex();
      logWithTimestamp(F, '🔍 [invoice] [Step 7] Generated derived script:', derivedScript);
      // Use client-provided amount for variable buttons, button amount for fixed
      const satoshis = button.variable_amount ? amount : button.amount;
      logWithTimestamp(F, '🔍 [invoice] [Step 8] Calculated satoshis for output:', satoshis);
      // Use custom description from payment_buttons, fallback to dynamic default
      const outputDescription = button.description || `Payment to merchant with paymentId: ${paymentId}`;
      logWithTimestamp(F, '🔍 [invoice] [Step 9] Using output description:', outputDescription);
      // Respond with the payment ID and outputs including merchantId
      const outputs = [
        {
          lockingScript: derivedScript,
          satoshis,
          outputDescription,
          merchantId
        }
      ];
      logWithTimestamp(F, '🔍 [invoice] [Step 10] Response outputs:', outputs);
      res.status(200).json({
        status: 'success',
        message: 'Invoice created successfully',
        // transaction_id: transactionIdNew, // Removed from response
        outputs
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : '❌ Unknown error';
      logWithTimestamp(F, '❌ [invoice] Error creating invoice:', {
        message,
        stack: error instanceof Error ? error.stack : '❌ No stack trace',
        requestBody: req.body,
        errorDetails: error,
        transaction_id: transactionIdNew ? transactionIdNew : 'N/A' // Use optional check
      });
      res.status(500).json({
        status: 'error',
        message: `❌ Internal server error: ${message} (transaction_id: ${transactionIdNew ?? 'N/A'})`
      });
    }
  }
};