/**
 * @file src/routes/listPayments.ts
 *
 * GET route to list all payments for the authenticated merchant.
 * Retrieves payment records from the database, including related button details,
 * with pagination support via query parameters (limit and offset).
 *
 * Used by the Gateway frontend to display the Payments page.
 *
 * Version: v1.3 (Updated 12Aug2025_2330 BST to fix TypeScript auth property error)
 * Change Log:
 * - 05Aug2025_0500 BST (v1.0): Initial creation with basic payment listing.
 * - 12Aug2025_2250 BST (v1.1): Added join with payment_buttons and ids, fixed 500 error, added query debugging.
 * - 12Aug2025_2315 BST (v1.2): Removed invalid payment_button_id reference, adjusted join, enhanced error logging.
 * - 12Aug2025_2330 BST (v1.3): Added AuthRequest interface to fix TypeScript 'auth' property error.
 */
const F = 'routes/listPayments';
import knex, { Knex } from 'knex';
import knexConfig from '../../knexfile';
import { Request, Response } from 'express';
import { logWithTimestamp } from '../utils/logging';

// Extend Request type to include auth property
interface AuthRequest extends Request {
  auth: {
    identityKey: string;
  };
}

const db: Knex = knex(knexConfig);

interface Payment {
  transaction_id: string;
  payment_id: string;
  from: string;
  merchant_id: string;
  completed: boolean;
  is_new: boolean;
  transaction_info: string;
  amount: number;
  currency: string;
  exchange_rate: string;
  created_at: string;
  updated_at: string;
}

interface PaymentButton {
  id: string;
  button_id: string;
  amount: number;
  currency: string;
  variable_amount: number;
  merchant_id: string;
  multi_use: number;
  used: number;
  total_paid: number;
  accepts: string;
  created_at: string;
  updated_at: string;
  description: string;
  customCSS: string;
}

export default {
  type: 'get' as const,
  path: '/listPayments',
  func: async (req: AuthRequest, res: Response): Promise<void> => {
    logWithTimestamp(F, '🔍 [listPayments] Received request with query:', req.query);
    const { limit = 10, offset = 0 } = req.query;
    const limitNum = parseInt(limit as string, 10) || 10;
    const offsetNum = parseInt(offset as string, 10) || 0;

    try {
      const payments: Payment[] = await db('payments')
        .select(
          'payments.transaction_id as ID',
          'payments.payment_id',
          'payments.amount',
          'payments.currency',
          'payments.completed',
          'payments.is_new',
          'payments.created_at',
          'payment_buttons.button_id as button_id',
          'payment_buttons.description',
          'payment_buttons.customCSS'
        )
        .join('payment_buttons', 'payments.payment_id', '=', 'payment_buttons.id')
        .where('payments.merchant_id', req.auth.identityKey) // Updated to use non-nullable auth
        .limit(limitNum)
        .offset(offsetNum);
      logWithTimestamp(F, '🔍 [listPayments] Query result:', payments);

      const total = await db('payments').where('merchant_id', req.auth.identityKey).count('* as count').first();
      const totalCount = total ? parseInt(total.count as string, 10) : 0;

      logWithTimestamp(F, '✅ [listPayments] Payments fetched successfully:', { total: totalCount, returned: payments.length });
      res.status(200).json({
        status: 'success',
        message: 'Payment buttons fetched successfully',
        data: payments,
        total: totalCount,
      });
      return;
    } catch (error: unknown) {
      logWithTimestamp(F, '❌ [listPayments] Error fetching payments:', {
        message: error instanceof Error ? error.message : '❌ Unknown error',
        stack: error instanceof Error ? error.stack : '❌ No stack trace',
        query: req.query,
        sql: (error as any).sql || 'No SQL available',
      });
      res.status(500).json({
        status: 'error',
        message: '❌ Internal server error',
      });
      return;
    }
  },
};