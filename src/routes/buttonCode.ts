/**
 * @file src/routes/buttonCode.ts
 *
 * GET route to retrieve payment button code details for a given paymentId.
 * Fetches the button configuration from the payment_buttons table and returns it for client-side rendering.
 * Adjusted to align with the current schema using 'id' as the primary key and include detailed debugging.
 *
 * Used by the Gateway inject script to initialize PayButtons on a webpage.
 *
 * Version: v2.30 (Updated 10Aug2025_1635 BST to use data-buttonId-id for original buttonId)
 * Change Log:
 * - ... (previous entries)
 * - 10Aug2025_1635 BST (v2.29): Preserved data-buttonId as original buttonId, updated only payment-related attributes.
 * - 10Aug2025_1635 BST (v2.30): Introduced data-buttonId-id to pass original buttonId, aligning id and data-paymentId with database ID.
 */
const F = 'routes/buttonCode';
import knex, { Knex } from 'knex';
import knexConfig from '../../knexfile';
import type { Request, Response } from 'express';
import { param, validationResult } from 'express-validator';
import { logWithTimestamp } from '../utils/logging';

const db: Knex = knex(knexConfig);

interface PaymentButton {
  id: string; // Primary key, VARCHAR(12)
  merchant_id: string;
  multi_use: boolean;
  used: boolean;
  variable_amount: boolean;
  amount: number | null;
  currency: string | null;
  customCSS: string; // Non-optional, must be present
  description: string; // Non-optional, must be present
  button_id?: string; // Optional legacy field
  original_button_id: string; // Non-optional
  original_payment_id: string; // Non-optional
  total_paid: number | null;
  accepts: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export default {
  type: 'get',
  path: '/buttonCode/:paymentId', // Standardized to match other routes (no /api prefix)
  middlewares: [
    param('paymentId').trim().escape().isString().notEmpty().withMessage('paymentId must be a non-empty string'),
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
      logWithTimestamp(F, '🔍 [buttonCode] [Step 3] Executing query for id:', paymentId);
      const query = db('payment_buttons').where({ id: paymentId }).first();
      logWithTimestamp(F, '🔍 [buttonCode] [Step 3] Query constructed:', query.toString());
      const button: PaymentButton | undefined = await query;
      logWithTimestamp(F, '🔍 [buttonCode] [Step 3] Raw query result:', button ? JSON.stringify(button) : 'No record found');
      if (!button) {
        logWithTimestamp(F, '⚠️ [buttonCode] No button found for paymentId:', paymentId, 'Attempting to list existing records...');
        const allButtons = await db('payment_buttons').select('id', 'description', 'customCSS', 'original_button_id', 'original_payment_id');
        logWithTimestamp(F, '🔍 [buttonCode] All payment_buttons records:', allButtons.map(b => ({ id: b.id, original_payment_id: b.original_payment_id })));
        const validIds = allButtons.map(b => b.id).filter(id => id);
        const matchingOriginal = allButtons.find(b => b.original_payment_id === paymentId);
        if (matchingOriginal) {
          logWithTimestamp(F, 'ℹ️ [buttonCode] Found match via original_payment_id:', matchingOriginal.id, 'for requested paymentId:', paymentId);
        } else {
          logWithTimestamp(F, 'ℹ️ [buttonCode] No match via original_payment_id for:', paymentId);
        }
        logWithTimestamp(F, 'ℹ️ [buttonCode] Suggested valid paymentIds:', validIds);
        res.status(404).json({
          status: 'error',
          message: `❌ No button found for paymentId: ${paymentId}. Did you mean to use the corresponding id?`,
          availableIds: validIds,
          suggestedId: matchingOriginal?.id,
          note: 'The client should use the id (e.g., from availableIds) or map original_payment_id to the correct id.',
        });
        return;
      }
      logWithTimestamp(F, '🔍 [buttonCode] [Step 4] Validating button fields:', {
        id: button.id,
        customCSS: button.customCSS,
        description: button.description,
        original_button_id: button.original_button_id,
        original_payment_id: button.original_payment_id,
      });
      if (!button.customCSS || button.customCSS.trim() === '') {
        logWithTimestamp(F, '❌ [buttonCode] Missing or empty customCSS for paymentId:', paymentId, 'Value:', button.customCSS);
        res.status(400).json({ status: 'error', message: '❌ customCSS is required and cannot be empty' });
        return;
      }
      if (!button.description || button.description.trim() === '') {
        logWithTimestamp(F, '❌ [buttonCode] Missing or empty description for paymentId:', paymentId, 'Value:', button.description);
        res.status(400).json({ status: 'error', message: '❌ description is required and cannot be empty' });
        return;
      }
      logWithTimestamp(F, '✅ [buttonCode] [Step 5] Found and validated button:', JSON.stringify(button));
      let modifiedCSS = button.customCSS;
      const divId = button.original_button_id;
      const divMatch = modifiedCSS.match(new RegExp(`<div[^>]*id="${divId}"[^>]*>([\\s\\S]*?)</div>`, 'i'));
      let buttonCode: string;
      if (divMatch) {
        const fullDiv = divMatch[0];
        logWithTimestamp(F, '🔍 [buttonCode] [Step 6a] Original div block:', fullDiv);
        const updatedDiv = fullDiv
          .replace(new RegExp(`id="${button.original_button_id}"`, 'g'), `id="${button.id}"`) // Replace div ID
          .replace(new RegExp(`data-paymentId="${button.original_payment_id}"`, 'g'), `data-paymentId="${button.id}"`)
          .replace(new RegExp(`data-description="Payment using paymentId: ${button.original_payment_id}"`, 'g'), `data-description="Payment using paymentId: ${button.id}"`)
          .replace(new RegExp(`data-buttonId-id="${button.original_button_id}"`, 'g'), `data-buttonId-id="${button.original_button_id}"`); // Preserve original buttonId
        logWithTimestamp(F, '🔍 [buttonCode] [Step 6b] Updated div block:', updatedDiv);
        modifiedCSS = modifiedCSS.replace(fullDiv, updatedDiv);
        const styleMatch = modifiedCSS.match(/<style>[\s\\S]*?<\/style>/i);
        const styles = styleMatch ? styleMatch[0] : '';
        buttonCode = `${styles}${updatedDiv}<script src="${req.protocol}://${req.get('host')}/pay.js"></script>`;
      } else {
        const styleMatch = modifiedCSS.match(/<style>[\s\\S]*?<\/style>/i);
        const styles = styleMatch ? styleMatch[0] : '';
        const defaultText = `Pay Now ${button.amount || 0} Sats`;
        buttonCode = `
          ${styles}
          <div id="${button.id}" class="gateway-paybutton" data-paymentId="${button.id}" data-buttonId-id="${button.original_button_id}" data-amount="${button.amount || 0}" data-currency="${button.currency || 'BSV'}" data-variable="${button.variable_amount}" data-description="Payment using paymentId: ${button.id}" data-server="${req.protocol}://${req.get('host')}">
            ${defaultText}
          </div>
          <script src="${req.protocol}://${req.get('host')}/pay.js"></script>
        `;
      }
      logWithTimestamp(F, '🔍 [buttonCode] [Step 6c] Generated button code:', buttonCode);
      res.status(200).json({
        status: 'success',
        payment_id: button.id,
        code: buttonCode,
      });
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : '❌ Unknown error';
      logWithTimestamp(F, '❌ [buttonCode] Error fetching button code:', {
        message: errorMessage,
        stack: err instanceof Error ? err.stack : '❌ No stack trace',
        paymentId,
        query: db('payment_buttons').where({ id: paymentId }).toString(),
        errorDetails: err,
      });
      res.status(500).json({ status: 'error', message: `❌ ${errorMessage}` });
    }
  },
};