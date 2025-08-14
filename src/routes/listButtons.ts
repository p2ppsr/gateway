/**
 * @file src/routes/listButtons.ts
 *
 * GET route to list payment buttons for a merchant.
 * Retrieves paginated payment buttons from the payment_buttons table, joined with payments,
 * filtered by merchant_id and optional usage/excludeSingleUse parameters.
 *
 * Used by the Gateway UI to display a merchant's payment buttons.
 * - Supports pagination with limit and offset query parameters.
 * - Includes left join with payments table to fetch payment_id.
 * - Orders by created_at with ascending or descending sort.
 *
 * Version: v2.27 (Updated 14Aug2025_0115 BST to refine join condition)
 * Change Log:
 * - 09Aug2025_2300 BST (v2.10): Initial implementation with pagination and filtering.
 * - 10Aug2025_1100 BST (v2.11): Added sort parameter and enhanced logging.
 * - 10Aug2025_1130 BST (v2.12): Fixed type safety for query parameters.
 * - 12Aug2025_1900 BST (v2.13): Resolved merchant_id ambiguity in where clause.
 * - 13Aug2025_1620 BST (v2.14): Separated total count query to fix only_full_group_by error.
 * - 13Aug2025_1730 BST (v2.15): Adjusted column mapping to use button_id and join with payments for payment_id.
 * - 13Aug2025_1836 BST (v2.16): Enhanced join debugging and ensured Payment Id population.
 * - 13Aug2025_1842 BST (v2.17): Corrected join condition to button_id and added detailed logging.
 * - 13Aug2025_1845 BST (v2.18): Fixed TypeScript type mismatch (TS2367) in excludeSingleUse comparison.
 * - 13Aug2025_1850 BST (v2.19): Fixed TypeScript type mismatch (TS2367) in usage parameter comparison.
 * - 13Aug2025_1855 BST (v2.20): Improved usage type guard to resolve TS2367 in else if branch.
 * - 13Aug2025_1900 BST (v2.21): Applied ChatGPT-inspired fix for excludeSingleUse type mismatch.
 * - 13Aug2025_1905 BST (v2.22): Fixed TS2451 redeclaration error for excludeSingleUse.
 * - 13Aug2025_2140 BST (v2.23): Updated to reflect schema change with button_id as primary key and adjusted payment_id handling.
 * - 13Aug2025_2150 BST (v2.24): Updated to reflect schema changes with html_code and removal of currency/accepts.
 * - 13Aug2025_2200 BST (v2.25): Updated to reflect schema changes with non-nullable amount, description, and html_code.
 * - 13Aug2025_2235 BST (v2.26): Refined mapping and defaults for schema alignment.
 * - 14Aug2025_0115 BST (v2.27): Refined join condition to use payment_id for consistency.
 */
const F = 'routes/listButtons';
import knex, { Knex } from 'knex';
import knexConfig from '../../knexfile';
import type { Request, Response } from 'express';
import { query } from 'express-validator';
import { logWithTimestamp } from '../utils/logging';
const db: Knex = knex(knexConfig);

export default {
  type: 'get',
  path: '/listButtons',
  middlewares: [
    query('limit')
      .optional()
      .isInt({ min: 1, max: 1000 })
      .withMessage('Limit must be an integer between 1 and 1000')
      .toInt(),
    query('offset')
      .optional()
      .isInt({ min: 0 })
      .withMessage('Offset must be a non-negative integer')
      .toInt(),
    query('sort')
      .optional()
      .isIn(['asc', 'desc'])
      .withMessage('Sort must be either asc or desc'),
    query('usage')
      .optional()
      .isIn(['used', 'unused'])
      .withMessage('Usage must be either used or unused'),
    query('excludeSingleUse')
      .optional()
      .isBoolean()
      .withMessage('excludeSingleUse must be a boolean')
      .toBoolean(),
  ],
  func: async (req: Request, res: Response): Promise<void> => {
    const errors = (req as any).validationErrors;
    if (errors && errors.length > 0) {
      logWithTimestamp(F, '❌ [listButtons] Validation errors:', errors);
      res.status(400).json({ status: 'error', message: '❌ Invalid query parameters', errors });
      return;
    }
    const merchantId = (req as any).auth?.identityKey || 'unknown'; // Default to 'unknown' if not authenticated
    const { limit = 500, offset = 0, sort = 'desc', usage, excludeSingleUseRaw } = req.query;
    // Type guard for excludeSingleUse using ChatGPT-inspired approach
    const excludeSingleUse = typeof excludeSingleUseRaw === 'boolean'
      ? excludeSingleUseRaw
      : String(excludeSingleUseRaw).toLowerCase() === 'true';
    // Type guard for usage
    const isUsageDefined = typeof usage === 'string';
    let usageValue: 'used' | 'unused' | undefined = undefined;
    if (isUsageDefined) {
      usageValue = usage as 'used' | 'unused'; // Narrow to valid values
    }
    logWithTimestamp(F, '🔍 [listButtons] Fetching buttons for merchant:', { merchantId, limit, offset, sort, usage: usageValue, excludeSingleUse });
    try {
      let buttonQuery = db('payment_buttons')
        .where('payment_buttons.merchant_id', merchantId)
        .select(
          'payment_buttons.button_id as buttonId', // Primary key
          'payment_buttons.payment_id as paymentId', // Nullable foreign key
          'payment_buttons.amount', // Non-nullable
          'payment_buttons.variable_amount as variable',
          'payment_buttons.multi_use as multiUse',
          'payment_buttons.used',
          'payment_buttons.total_paid as totalPaid', // Nullable
          'payment_buttons.description', // Non-nullable
          'payment_buttons.html_code as htmlCode', // Non-nullable
          'payment_buttons.created_at as timestamp'
        )
        .leftJoin('payments', 'payment_buttons.payment_id', 'payments.payment_id'); // Updated join condition
      if (excludeSingleUse) {
        buttonQuery = buttonQuery.where('payment_buttons.multi_use', true);
      }
      if (usageValue === 'used') {
        buttonQuery = buttonQuery.where('payment_buttons.used', true);
      } else if (usageValue === 'unused') {
        buttonQuery = buttonQuery.where('payment_buttons.used', false);
      }
      const totalQuery = db('payment_buttons')
        .where('payment_buttons.merchant_id', merchantId)
        .count('button_id as total')
        .first();
      const buttons = await buttonQuery
        .orderBy('payment_buttons.created_at', sort as 'asc' | 'desc')
        .limit(limit as number)
        .offset(offset as number);
      logWithTimestamp(F, '🔍 [listButtons] Raw query results:', buttons); // Debug log
      const { total } = (await totalQuery) || { total: 0 };
      const safeButtons = buttons.map(button => ({
        ...button,
        amount: button.amount || 0, // Non-nullable default
        description: button.description || 'No description', // Non-nullable default
        htmlCode: button.htmlCode || '<div>Pay Now</div>', // Non-nullable default
        paymentId: button.paymentId || null, // Nullable
      }));
      logWithTimestamp(F, '✅ [listButtons] Buttons fetched successfully:', { total, data: safeButtons });
      res.status(200).json({
        status: 'success',
        message: 'Payment buttons fetched successfully',
        data: safeButtons,
        total: Number(total),
      });
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : '❌ Unknown error';
      logWithTimestamp(F, '❌ Error fetching buttons:', {
        message: errorMessage,
        stack: err instanceof Error ? err.stack : '❌ No stack trace',
        queryParams: req.query,
      });
      res.status(500).json({ status: 'error', message: `❌ ${errorMessage}` });
    }
  },
};