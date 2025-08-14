/**
 * @file src/routes/buttonCode.ts
 *
 * GET route to retrieve payment button code details for a given paymentId.
 * Fetches the button configuration from the payment_buttons table and returns it for client-side rendering.
 * Adjusted to align with the current schema using 'payment_id' and 'button_id' instead of 'id'.
 *
 * Used by the Gateway inject script to initialize PayButtons on a webpage.
 *
 * Version: v2.32 (Updated 14Aug2025_0010 BST to fix RegExp syntax errors)
 * Change Log:
 * - ... (previous entries)
 * - 10Aug2025_1635 BST (v2.29): Preserved data-buttonId as original buttonId, updated only payment-related attributes.
 * - 10Aug2025_1635 BST (v2.30): Introduced data-buttonId-id to pass original buttonId, aligning id and data-paymentId with database ID.
 * - 13Aug2025_2355 BST (v2.31): Updated to use payment_id and button_id, removed id column reference, and adjusted interface.
 * - 14Aug2025_0005 BST (v2.31): Reapplied with schema alignment confirmation.
 * - 14Aug2025_0010 BST (v2.32): Fixed RegExp syntax errors in styleMatch.
 */
const F = 'routes/buttonCode';
import knex, { Knex } from 'knex';
import knexConfig from '../../knexfile';
import type { Request, Response } from 'express';
import { param, validationResult } from 'express-validator';
import { logWithTimestamp } from '../utils/logging';
const db: Knex = knex(knexConfig);

interface PaymentButton {
  button_id: string; // Primary key
  merchant_id: string;
  payment_id: string | null; // Nullable foreign key
  multi_use: boolean;
  used: boolean;
  variable_amount: boolean;
  amount: number;
  description: string;
  html_code: string; // Renamed from customCSS
  total_paid: number | null;
  created_at: string | null;
  updated_at: string | null;
}

export default {
  type: 'get',
  path: '/buttonCode/:paymentId', // Standardized to match other routes (no /api prefix)
  middlewares: [
    param('paymentId')
      .trim()
      .escape()
      .isString()
      .notEmpty()
      .withMessage('paymentId must be a non-empty string')
      .isLength({ min: 12, max: 24 })
      .withMessage('paymentId must be between 12 and 24 characters'),
  ],
  func: async (req: Request, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      logWithTimestamp(F, '❌ [buttonCode] Validation errors:', errors.array());
      res.status(400).json({ status: 'error', message: '❌ Invalid parameters', errors: errors.array() });
      return;
    }
    const paymentId = req.params.paymentId;
    logWithTimestamp(F, '🔍 [buttonCode] [Step 1] Received request for paymentId:', paymentId, 'Type:', typeof paymentId);
    try {
      logWithTimestamp(F, '🔍 [buttonCode] [Step 2] Checking database connection...');
      await db.raw('SELECT 1');
      logWithTimestamp(F, '✅ [buttonCode] [Step 2] Database connection successful');
      const columns = await db('information_schema.columns')
        .where({ table_name: 'payment_buttons' })
        .select('column_name');
      logWithTimestamp(F, '🔍 [buttonCode] [Step 2] payment_buttons schema columns:', columns.map(c => c.column_name).join(', '));
      logWithTimestamp(F, '🔍 [buttonCode] [Step 3] Executing query for paymentId:', paymentId);
      const query = db('payment_buttons').where({ payment_id: paymentId }).first(); // Use payment_id instead of id
      logWithTimestamp(F, '🔍 [buttonCode] [Step 3] Query constructed:', query.toString());
      const button: PaymentButton | undefined = await query;
      logWithTimestamp(F, '🔍 [buttonCode] [Step 3] Raw query result:', button ? JSON.stringify(button) : 'No record found');
      if (!button) {
        logWithTimestamp(F, '⚠️ [buttonCode] No button found for paymentId:', paymentId, 'Attempting to list existing records...');
        const allButtons = await db('payment_buttons').select('button_id', 'payment_id', 'description', 'html_code');
        logWithTimestamp(F, '🔍 [buttonCode] All payment_buttons records:', allButtons.map(b => ({ button_id: b.button_id, payment_id: b.payment_id })));
        const validPaymentIds = allButtons.map(b => b.payment_id).filter(id => id) as string[];
        const matchingButton = allButtons.find(b => b.payment_id === paymentId);
        if (matchingButton) {
          logWithTimestamp(F, 'ℹ️ [buttonCode] Found match via payment_id:', matchingButton.button_id, 'for requested paymentId:', paymentId);
        } else {
          logWithTimestamp(F, 'ℹ️ [buttonCode] No match via payment_id for:', paymentId);
        }
        logWithTimestamp(F, 'ℹ️ [buttonCode] Suggested valid paymentIds:', validPaymentIds);
        res.status(404).json({
          status: 'error',
          message: `❌ No button found for paymentId: ${paymentId}. Did you mean to use the corresponding button_id?`,
          availablePaymentIds: validPaymentIds,
          suggestedButtonId: matchingButton?.button_id,
          note: 'The client should use the payment_id or map to the correct button_id.',
        });
        return;
      }
      logWithTimestamp(F, '🔍 [buttonCode] [Step 4] Validating button fields:', {
        button_id: button.button_id,
        html_code: button.html_code,
        description: button.description,
        payment_id: button.payment_id,
      });
      if (!button.html_code || button.html_code.trim() === '') {
        logWithTimestamp(F, '❌ [buttonCode] Missing or empty html_code for paymentId:', paymentId, 'Value:', button.html_code);
        res.status(400).json({ status: 'error', message: '❌ html_code is required and cannot be empty' });
        return;
      }
      if (!button.description || button.description.trim() === '') {
        logWithTimestamp(F, '❌ [buttonCode] Missing or empty description for paymentId:', paymentId, 'Value:', button.description);
        res.status(400).json({ status: 'error', message: '❌ description is required and cannot be empty' });
        return;
      }
      logWithTimestamp(F, '✅ [buttonCode] [Step 5] Found and validated button:', JSON.stringify(button));
      let modifiedCode = button.html_code;
      const divId = button.button_id; // Use button_id as the div ID
      const divMatch = modifiedCode.match(new RegExp(`<div[^>]*id="${divId}"[^>]*>([\\s\\S]*?)</div>`, 'i'));
      let buttonCode: string;
      if (divMatch) {
        const fullDiv = divMatch[0];
        logWithTimestamp(F, '🔍 [buttonCode] [Step 6a] Original div block:', fullDiv);
        const updatedDiv = fullDiv
          .replace(new RegExp(`id="${button.button_id}"`, 'g'), `id="${button.button_id}"`) // Ensure consistency
          .replace(new RegExp(`data-paymentId="${button.payment_id}"`, 'g'), `data-paymentId="${button.payment_id || button.button_id}"`)
          .replace(
            new RegExp(`data-description="Payment using paymentId: ${button.payment_id}"`, 'g'),
            `data-description="${button.description}"`
          )
          .replace(new RegExp(`data-buttonId-id="${button.button_id}"`, 'g'), `data-buttonId-id="${button.button_id}"`);
        logWithTimestamp(F, '🔍 [buttonCode] [Step 6b] Updated div block:', updatedDiv);
        modifiedCode = modifiedCode.replace(fullDiv, updatedDiv);
        const styleMatch = modifiedCode.match(/<style>[\s\S]*?<\/style>/i); // Corrected RegExp syntax
        const styles = styleMatch ? styleMatch[0] : '';
        buttonCode = `${styles}${updatedDiv}<script src="${req.protocol}://${req.get('host')}/pay.js"></script>`;
      } else {
        const styleMatch = modifiedCode.match(/<style>[\s\S]*?<\/style>/i); // Corrected RegExp syntax
        const styles = styleMatch ? styleMatch[0] : '';
        const defaultText = `Pay Now ${button.amount} Sats`;
        buttonCode = `
          ${styles}
          <div id="${button.button_id}" class="gateway-paybutton" data-paymentId="${button.payment_id || button.button_id}" data-buttonId-id="${button.button_id}" data-amount="${button.amount}" data-variable="${button.variable_amount}" data-description="${button.description}" data-server="${req.protocol}://${req.get('host')}">
            ${defaultText}
          </div>
          <script src="${req.protocol}://${req.get('host')}/pay.js"></script>
        `;
      }
      logWithTimestamp(F, '🔍 [buttonCode] [Step 6c] Generated button code:', buttonCode);
      res.status(200).json({
        status: 'success',
        payment_id: button.payment_id || button.button_id, // Return the payment_id or button_id if payment_id is null
        code: buttonCode,
      });
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : '❌ Unknown error';
      logWithTimestamp(F, '❌ [buttonCode] Error fetching button code:', {
        message: errorMessage,
        stack: err instanceof Error ? err.stack : '❌ No stack trace',
        paymentId,
        query: db('payment_buttons').where({ payment_id: paymentId }).toString(),
        errorDetails: err,
      });
      res.status(500).json({ status: 'error', message: `❌ ${errorMessage}` });
    }
  },
};