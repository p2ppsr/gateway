/**
 * @file src/routes/buttonCode.ts
 * @description GET route to retrieve payment button code details for a given paymentId.
 * @version v2.35 (Updated 18Aug2025_0158 BST to fix TypeScript errors and maintain streamlined code)
 */
const F = 'routes/buttonCode';
import { Request, Response } from 'express';
import { Knex } from 'knex';
import knex from 'knex';
import knexConfig from '../../knexfile';
import { param, validationResult } from 'express-validator';
import { logWithTimestamp } from '../utils/logging';
import { WalletClient } from '@bsv/sdk';
import { CONFIG } from '../utils/constants';
import { isMerchantId } from '../utils/general';

const db: Knex = knex(knexConfig);
const wallet = new WalletClient('auto', CONFIG.WALLET_ORIGIN);

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

export default {
  type: 'get',
  path: '/buttonCode/:paymentId',
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
      logWithTimestamp(F, '[buttonCode] Validation errors:', errors.array());
      res.status(400).json({ status: 'error', message: 'Invalid parameters', errors: errors.array() });
      return;
    }

    const paymentId = req.params.paymentId;
    logWithTimestamp(F, '[buttonCode] [Step 1] Received request for paymentId:', paymentId, 'Type:', typeof paymentId);

    try {
      logWithTimestamp(F, '[buttonCode] [Step 2] Checking database connection...');
      await db.raw('SELECT 1');
      logWithTimestamp(F, '[buttonCode] [Step 2] Database connection successful');

      const query = db('payment_buttons').where({ payment_id: paymentId }).first();
      logWithTimestamp(F, '[buttonCode] [Step 3] Query constructed:', query.toString());

      const button: PaymentButton | undefined = await query;
      logWithTimestamp(F, '[buttonCode] [Step 3] Raw query result:', button ? JSON.stringify(button) : 'No record found');

      if (!button) {
        logWithTimestamp(F, '[buttonCode] [Step 4] No button found for paymentId:', paymentId);
        res.status(404).json({ status: 'error', message: `No button found for paymentId: ${paymentId}` });
        return;
      }

      logWithTimestamp(F, '[buttonCode] [Step 4] Validating button fields:', {
        button_id: button.button_id,
        html_code: button.html_code,
        description: button.description,
        payment_id: button.payment_id,
      });

      if (!button.html_code || button.html_code.trim() === '') {
        logWithTimestamp(F, '[buttonCode] [Step 5] Missing or empty html_code for paymentId:', paymentId);
        res.status(400).json({ status: 'error', message: 'html_code is required and cannot be empty' });
        return;
      }

      if (!button.description || button.description.trim() === '') {
        logWithTimestamp(F, '[buttonCode] [Step 5] Missing or empty description for paymentId:', paymentId);
        res.status(400).json({ status: 'error', message: 'description is required and cannot be empty' });
        return;
      }

      logWithTimestamp(F, '[buttonCode] [Step 5] Found and validated button:', JSON.stringify(button));

      let modifiedCode = button.html_code;
      const divId = button.button_id;
      const divMatch = modifiedCode.match(new RegExp(`<div[^>]*id="${divId}"[^>]*>([\\s\\S]*?)</div>`, 'i'));
      let buttonCode: string;

      if (divMatch) {
        const fullDiv = divMatch[0];
        logWithTimestamp(F, '[buttonCode] [Step 6a] Original div block:', fullDiv);
        const updatedDiv = fullDiv
          .replace(new RegExp(`id="${button.button_id}"`, 'g'), `id="${button.button_id}"`)
          .replace(
            new RegExp(`data-paymentId="${button.payment_id}"`, 'g'),
            `data-paymentId="${button.payment_id || button.button_id}"`
          )
          .replace(
            new RegExp(`data-description="[^"]*"`, 'g'),
            `data-description="${button.description}"`
          );
        logWithTimestamp(F, '[buttonCode] [Step 6b] Updated div block:', updatedDiv);
        modifiedCode = modifiedCode.replace(fullDiv, updatedDiv);
        const styleMatch = modifiedCode.match(/<style>[\s\S]*?<\/style>/i);
        const styles = styleMatch ? styleMatch[0] : '';
        buttonCode = `${styles}${updatedDiv}<script src="${CONFIG.API_BASE}/pay.js"></script>`;
      } else {
        const styleMatch = modifiedCode.match(/<style>[\s\S]*?<\/style>/i);
        const styles = styleMatch ? styleMatch[0] : '';
        const defaultText = `Pay Now ${button.amount} Sats`;
        buttonCode = `
          ${styles}
          <div id="${button.button_id}" class="gateway-paybutton" data-paymentId="${button.payment_id || button.button_id}" data-buttonId="${button.button_id}" data-amount="${button.amount}" data-variable="${button.variable_amount}" data-description="${button.description}" data-server="${CONFIG.API_BASE}">
            ${defaultText}
          </div>
          <script src="${CONFIG.API_BASE}/pay.js"></script>
        `;
      }

      logWithTimestamp(F, '[buttonCode] [Step 6c] Generated button code:', buttonCode);

      if (!isMerchantId(button.merchant_id)) {
        throw new Error(`Invalid merchant_id format: ${button.merchant_id}`);
      }

      res.status(200).json({
        status: 'success',
        payment_id: button.payment_id,
        button_id: button.button_id,
        multi_use: button.multi_use,
        used: button.used,
        code: buttonCode,
      });
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      logWithTimestamp(F, '[buttonCode] Error fetching button code:', {
        message: errorMessage,
        stack: err instanceof Error ? err.stack : 'No stack trace',
        paymentId,
        query: db('payment_buttons').where({ payment_id: paymentId }).toString(),
        errorDetails: err,
      });
      res.status(500).json({ status: 'error', message: errorMessage });
    }
  },
};