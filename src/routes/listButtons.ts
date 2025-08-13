/**
 * @file src/routes/listButtons.ts
 *
 * GET route to list payment buttons for a merchant. This endpoint fetches buttons from the payment_buttons table,
 * supports filtering by excludeSingleUse, usage (used, unused, all), pagination with limit and offset, and sorting.
 * Includes payment_id from the payments table via a left join.
 *
 * - Requires authentication to populate req.auth.identityKey.
 * - Validates parameters with express-validator.
 * - Returns paginated results with optional total count.
 * - Optimized for performance with indexed query on merchant_id.
 * - Version: v1.4 (Updated 13Aug2025_1500 BST to include payment_id via join)
 */
import knex, { Knex } from 'knex';
import knexConfig from '../../knexfile';
import type { Request, Response } from 'express';
import { query, validationResult, ValidationError } from 'express-validator';
import { MAX_PAYMENT_SATS } from '../utils/constants';
import { logWithTimestamp } from '../utils/logging';

const db: Knex = knex(knexConfig);

interface AuthRequest extends Request {
  auth?: { identityKey: string };
}

interface ListButtonsResponse {
  status: 'success' | 'error';
  message?: string;
  data?: any[];
  total?: number;
  errors?: ValidationError[]; // Updated to match express-validator ValidationError type
}

export default {
  type: 'get',
  path: '/listButtons',
  middlewares: [
    query('excludeSingleUse').optional().isBoolean().toBoolean().withMessage('excludeSingleUse must be true or false'),
    query('usage').optional().isIn(['used', 'unused', 'all']).withMessage('usage must be used, unused, or all'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: MAX_PAYMENT_SATS })
      .toInt()
      .withMessage(`limit must be an integer between 1 and ${MAX_PAYMENT_SATS}`),
    query('offset').optional().isInt({ min: 0 }).toInt().withMessage('offset must be a non-negative integer'),
    query('sort').optional().isIn(['asc', 'desc']).withMessage('sort must be asc or desc')
  ],
  func: async (req: AuthRequest, res: Response<ListButtonsResponse>): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({
        status: 'error',
        message: '❌ Invalid parameters',
        errors: errors.array()
      });
      return;
    }
    const merchantId = req.auth?.identityKey;
    if (!merchantId) {
      res.status(401).json({ status: 'error', message: '❌ Unauthorized: Missing merchant identity' });
      return;
    }
    const getValidatedQuery = (key: string, defaultValue: any): any => {
      const value = req.query[key];
      return value === undefined ? defaultValue : value;
    };
    const excludeSingleUse = getValidatedQuery('excludeSingleUse', false);
    const usage = getValidatedQuery('usage', 'all');
    const limit = getValidatedQuery('limit', MAX_PAYMENT_SATS);
    const offset = getValidatedQuery('offset', 0);
    const sort = getValidatedQuery('sort', 'desc');
    try {
      let buttonQuery = db('payment_buttons')
        .where('payment_buttons.merchant_id', merchantId) // Qualify merchant_id to resolve ambiguity
        .select(
          'payment_buttons.*',
          'payments.payment_id' // Include payment_id from payments table
        )
        .leftJoin('payments', 'payment_buttons.id', 'payments.button_id');
      if (excludeSingleUse === true) {
        buttonQuery = buttonQuery.where('payment_buttons.multi_use', true);
      }
      if (usage === 'used') {
        buttonQuery = buttonQuery.where('payment_buttons.used', true);
      } else if (usage === 'unused') {
        buttonQuery = buttonQuery.where('payment_buttons.used', false);
      }      
      // let buttonQuery = db('payment_buttons')
      //   .where('merchant_id', merchantId)
      //   .select(
      //     'payment_buttons.*',
      //     'payments.payment_id' // Include payment_id from payments table
      //   )
      //   .leftJoin('payments', 'payment_buttons.id', 'payments.button_id');
      // if (excludeSingleUse === true) {
      //   buttonQuery = buttonQuery.where('multi_use', true);
      // }
      // if (usage === 'used') {
      //   buttonQuery = buttonQuery.where('used', true);
      // } else if (usage === 'unused') {
      //   buttonQuery = buttonQuery.where('used', false);
      // }
      // const totalQuery = buttonQuery.clone().count('* as total').first();
      
    const totalQuery = db('payment_buttons')
      .where('payment_buttons.merchant_id', merchantId)
      .count('* as total')
      .first();
    const buttons = await buttonQuery
      .orderBy('created_at', sort as 'asc' | 'desc')
      .limit(limit as number)
      .offset(offset as number);
    const { total } = (await totalQuery) || { total: 0 };
    const safeButtons = buttons.map(button => ({
      ...button,
      amount: button.amount || 0
    }));
    res.status(200).json({
      status: 'success',
      message: 'Payment buttons fetched successfully',
      data: safeButtons,
      total: Number(total)
    });
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : '❌ Unknown error';
      logWithTimestamp('routes/listButtons', '❌ Error fetching buttons:', {
        message: errorMessage,
        stack: err instanceof Error ? err.stack : '❌ No stack trace',
        queryParams: req.query
      });
      res.status(500).json({ status: 'error', message: '❌ Internal server error' });
    }
  },
};