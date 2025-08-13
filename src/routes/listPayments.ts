/**
 * @file src/routes/listPayments.ts
 *
 * GET route to list all payments for the authenticated merchant.
 * Retrieves payment records from the database, including button details,
 * with pagination support via query parameters (limit and offset).
 *
 * Used by the Gateway frontend to display the Payments page.
 *
 * Version: v2.0 (Updated 13Aug2025_0315 BST to fix TypeScript const reassignment errors)
 * Change Log:
 * - 05Aug2025_0500 BST (v1.0): Initial creation with basic payment listing.
 * - 12Aug2025_2250 BST (v1.1): Added join with payment_buttons and ids, fixed 500 error, added query debugging.
 * - 12Aug2025_2315 BST (v1.2): Removed invalid payment_button_id reference, adjusted join, enhanced error logging.
 * - 12Aug2025_2330 BST (v1.3): Added AuthRequest interface to fix TypeScript 'auth' property error.
 * - 12Aug2025_2359 BST (v1.4): Added txid extraction from transaction_info, ensured transaction_id for Payment Id.
 * - 13Aug2025_0030 BST (v1.5): Updated for new txid column, added button description for user context.
 * - 13Aug2025_0100 BST (v1.6): Switched to txid as primary key, removed transaction_id.
 * - 13Aug2025_0130 BST (v1.7): Switched to payment_id as primary key, renamed button_id_ref to button_id, payer_identity to payer_id.
 * - 13Aug2025_0135 BST (v1.8): Ensured payment_id and button_id reference ids.id consistently.
 * - 13Aug2025_0315 BST (v1.9): Updated Payment interface for latest schema, improved pagination handling and logging.
 * - 13Aug2025_0315 BST (v2.0): Fixed TypeScript const reassignment errors for limitNum and offsetNum.
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
  payment_id: string;
  button_id: string;
  payer_id: string | null; // Added to match schema (varchar(66), nullable)
  merchant_id: string;
  txid: string;
  completed: boolean;
  is_new: boolean;
  blockchain_transaction: string | null;
  amount: number;
  currency: string;
  exchange_rate: string | null; // Added to match schema (decimal(24,10), nullable)
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
    const { limit = '10', offset = '0' } = req.query; // Default as strings to handle query params
    let limitNum = parseInt(limit as string, 10);
    let offsetNum = parseInt(offset as string, 10);

    // Validate pagination parameters
    if (isNaN(limitNum) || limitNum <= 0) {
      logWithTimestamp(F, '⚠️ [listPayments] Invalid limit parameter, using default 10:', { limit });
      limitNum = 10;
    }
    if (isNaN(offsetNum) || offsetNum < 0) {
      logWithTimestamp(F, '⚠️ [listPayments] Invalid offset parameter, using default 0:', { offset });
      offsetNum = 0;
    }

    try {
      const payments: Payment[] = await db('payments')
        .select(
          'payments.payment_id as PaymentId', // Unique payment record ID, pre-created in ids
          'payments.txid as Txid', // Blockchain transaction ID
          'payments.payer_id as PayerId', // Added for completeness
          'payments.amount',
          'payments.currency',
          'payments.completed',
          'payments.is_new',
          'payments.created_at',
          'payment_buttons.button_id as ButtonId',
          'payment_buttons.description as Button'
        )
        .join('payment_buttons', 'payments.button_id', '=', 'payment_buttons.id')
        .where('payments.merchant_id', req.auth.identityKey)
        .limit(limitNum)
        .offset(offsetNum);

      logWithTimestamp(F, '🔍 [listPayments] Query result:', { payments, limit: limitNum, offset: offsetNum });
      const total = await db('payments').where('merchant_id', req.auth.identityKey).count('* as count').first();
      const totalCount = total ? parseInt(total.count as string, 10) : 0;

      logWithTimestamp(F, '✅ [listPayments] Payments fetched successfully:', { total: totalCount, returned: payments.length, limit: limitNum, offset: offsetNum });
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