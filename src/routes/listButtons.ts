/**
 * @file src/routes/listButtons.ts
 *
 * GET route to list payment buttons for a merchant.
 * Retrieves paginated payment buttons from the payment_buttons table, joined with payments,
 * filtered by merchant_id and optional usage/excludeSingleUse parameters.
 *
 * Version: v2.49 (Updated 26Aug2025_2000 BST)
 * Change Log:
 * - 26Aug2025_2000 BST (v2.49): Added fallback for empty rows; enhanced error logging; ensured all completed payments in button.payments; fixed used computation.
 * - 26Aug2025_1920 BST (v2.48): Ensured all completed payments in button.payments; added payment validation; enhanced logging.
 * ... [Previous changelog entries]
 */
const F = 'routes/listButtons';
import knex, { Knex } from 'knex';
import knexConfig from '../../knexfile';
import type { Request, Response } from 'express';
import { query } from 'express-validator';
import { logWithTimestamp } from '../utils/logging';
import { formatId } from '../utils/general';
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
    query('offset').optional().isInt({ min: 0 }).withMessage('Offset must be a non-negative integer').toInt(),
    query('sort').optional().isIn(['asc', 'desc']).withMessage('Sort must be either asc or desc'),
    query('usage').optional().isIn(['used', 'unused']).withMessage('Usage must be either used or unused'),
    query('excludeSingleUse')
      .optional()
      .isBoolean()
      .withMessage('excludeSingleUse must be a boolean')
      .toBoolean(),
  ],
  func: async (req: Request, res: Response): Promise<void> => {
    logWithTimestamp(F, '🔍 [listButtons] Starting listButtons execution v2.49');
    const errors = (req as any).validationErrors;
    if (errors && errors.length > 0) {
      logWithTimestamp(F, '❌ [listButtons] Validation errors:', errors);
      res.status(400).json({ status: 'error', message: '❌ Invalid query parameters', errors });
      return;
    }
    const merchantId = (req as any).auth?.identityKey || 'unknown';
    const { limit = 500, offset = 0, sort = 'desc', usage, excludeSingleUseRaw } = req.query;
    const excludeSingleUse =
      typeof excludeSingleUseRaw === 'boolean'
        ? excludeSingleUseRaw
        : String(excludeSingleUseRaw).toLowerCase() === 'true';
    const isUsageDefined = typeof usage === 'string';
    let usageValue: 'used' | 'unused' | undefined = undefined;
    if (isUsageDefined) {
      usageValue = usage as 'used' | 'unused';
    }
    logWithTimestamp(F, '🔍 [listButtons] Fetching buttons for merchant:', {
      merchantId,
      limit,
      offset,
      sort,
      usage: usageValue,
      excludeSingleUse,
    });
    try {
      // ---------- helpers ----------
      const logSql = (label: string, qb: Knex.QueryBuilder) => {
        const s = qb.clone().toSQL();
        logWithTimestamp(F, `📜 ${label} SQL:`, { sql: s.sql, bindings: s.bindings });
      };
      // ---------- pre-aggregate payments by button_id for completed payments only ----------
      const paymentsAgg = db('payments')
        .select('button_id')
        .sum<{ paidSum: number }>({ paidSum: 'amount' })
        .where('completed', 1)
        .groupBy('button_id');
      logSql('paymentsAgg', paymentsAgg);
      // Main query
      let buttonQuery = db({ pb: 'payment_buttons' })
        .leftJoin(paymentsAgg.as('pa'), 'pb.button_id', 'pa.button_id')
        .where('pb.merchant_id', merchantId)
        .select(
          'pb.button_id as buttonId',
          'pb.payment_id as paymentId',
          'pb.amount',
          'pb.variable_amount as variableAmount',
          'pb.multi_use as multiUse',
          'pb.used as dbUsed',
          'pb.html_code as htmlCode',
          db.raw(`COALESCE(pb.created_at, CURRENT_TIMESTAMP) as "createdAt"`),
          db.raw(`COALESCE(pb.updated_at, pb.created_at, CURRENT_TIMESTAMP) as "updatedAt"`),
          db.raw(`COALESCE(pa.paidSum, 0) as "totalPaid"`)
        )
        .orderBy('pb.created_at', 'desc')
        .limit(500);
      logSql('buttonQuery', buttonQuery);
      // ---------- filters ----------
      if (excludeSingleUse) {
        buttonQuery = buttonQuery.where('pb.multi_use', true);
      }
      if (usageValue === 'used') {
        buttonQuery = buttonQuery.whereExists(
          db('payments').where({ button_id: db.raw('pb.button_id'), completed: 1 })
        );
      } else if (usageValue === 'unused') {
        buttonQuery = buttonQuery.whereNotExists(
          db('payments').where({ button_id: db.raw('pb.button_id'), completed: 1 })
        );
      }
      // ---------- preview final SQL ----------
      const preview = buttonQuery
        .clone()
        .orderBy('pb.created_at', sort as 'asc' | 'desc')
        .limit(Number(limit))
        .offset(Number(offset));
      logSql('listButtons(final)', preview);
      // ---------- execute ----------
      const rows = await buttonQuery
        .orderBy('pb.created_at', sort as 'asc' | 'desc')
        .limit(Number(limit))
        .offset(Number(offset));
      logWithTimestamp(F, '📊 [listButtons] Query executed', { rowCount: rows.length });
      if (!rows.length) {
        logWithTimestamp(F, '⚠️ [listButtons] No rows returned, checking database');
        const totalCheck = await db('payment_buttons')
          .where('merchant_id', merchantId)
          .count<{ total: number }>('button_id as total')
          .first();
        logWithTimestamp(F, '🔎 [listButtons] Database check:', { totalCheck });
        res.status(200).json({
          status: 'success',
          message: 'No buttons found',
          title: 'Payment Buttons',
          data: [],
          total: Number(totalCheck?.total ?? 0),
        });
        return;
      }
      if (rows[0]) logWithTimestamp(F, '🔎 [listButtons] Sample row[0]:', rows[0]);
      // Fetch all completed payments
      for (const button of rows) {
        const paymentsQuery = db('payments')
          .select(
            'payment_id as paymentId',
            'transaction_id as transactionId',
            'amount',
            'txid',
            'completed as completed',
            'created_at as createdAt',
            'description'
          )
          .where({ button_id: button.buttonId, completed: 1 })
          .orderBy('created_at', 'desc');
        logSql(`payments for button ${button.buttonId}`, paymentsQuery);
        button.payments = await paymentsQuery;
        // Compute used based on all completed payments
        const allPayments = await db('payments')
          .where({ button_id: button.buttonId, completed: 1 })
          .count<{ count: number }>('payment_id as count')
          .first();
        const paymentCount = allPayments?.count ?? 0;
        const totalPaidCheck = await db('payments')
          .where({ button_id: button.buttonId, completed: 1 })
          .sum<{ total: number }>({ total: 'amount' })
          .first();
        button.used = paymentCount > 0 || button.dbUsed === 1 || (totalPaidCheck?.total ?? 0) > 0;
        logWithTimestamp(F, `Computed used field for button ${button.buttonId}:`, {
          computedUsed: button.used,
          dbUsed: button.dbUsed,
          totalPaid: button.totalPaid,
          totalPaidCheck: totalPaidCheck?.total ?? 0,
          paymentCount,
          payments: button.payments.map((p: any) => ({
            paymentId: p.paymentId,
            amount: p.amount,
            completed: p.completed
          }))
        });
        // Fetch first completed payment description
        const firstPaymentDesc = await db('payments')
          .select('description', 'payment_id')
          .where({ button_id: button.buttonId, completed: 1 })
          .orderBy('created_at', 'asc')
          .first();
        logWithTimestamp(F, `First payment for button ${button.buttonId}:`, { firstPaymentDesc });
        button.description = firstPaymentDesc?.description || `Payment using paymentId: ${formatId(button.paymentId)}`;
        logWithTimestamp(F, `Description for button ${button.buttonId}:`, {
          description: button.description
        });
        logWithTimestamp(F, `Payments for button ${button.buttonId}:`, {
          paymentCount: button.payments.length,
          payments: button.payments
        });
      }
      // ---------- count ----------
      const totalRow = await db('payment_buttons')
        .where('merchant_id', merchantId)
        .count<{ total: number }>('button_id as total')
        .first();
      const total = Number(totalRow?.total ?? 0);
      logWithTimestamp(F, '🧮 [listButtons] Total buttons:', { total });
      // ---------- normalize + quick sanity on totalPaid ----------
      const safeButtons = rows.map((b: any) => ({
        buttonId: b.buttonId,
        merchantId,
        paymentId: b.paymentId ?? null,
        amount: b.amount ?? 0,
        description: b.description ?? `Payment using paymentId: ${formatId(b.paymentId)}`,
        htmlCode: b.htmlCode ?? '<div>Pay Now</div>',
        variableAmount: !!b.variableAmount,
        multiUse: !!b.multiUse,
        used: b.used,
        totalPaid: Number(b.totalPaid ?? 0),
        createdAt: b.createdAt,
        updatedAt: b.updatedAt,
        payments: b.payments
          ? b.payments.map((p: any) => ({
              paymentId: p.paymentId,
              transactionId: p.transactionId,
              amount: p.amount,
              txid: p.txid ?? null,
              completed: !!p.completed,
              createdAt: p.createdAt,
              description: p.description || `Payment using paymentId: ${formatId(p.paymentId)}`
            }))
          : [],
      }));
      logWithTimestamp(F, '🔍 [listButtons] Verified totalPaid and payments for buttons:', {
        buttons: safeButtons.map((b: any) => ({
          buttonId: b.buttonId,
          totalPaid: b.totalPaid,
          used: b.used,
          multiUse: b.multiUse,
          paymentCount: b.payments.length,
          description: b.description
        }))
      });
      const paidSum = safeButtons.reduce((acc: number, x: any) => acc + (Number(x.totalPaid) || 0), 0);
      logWithTimestamp(F, '💰 [listButtons] Sum totalPaid (page):', { paidSum });
      logWithTimestamp(F, '✅ [listButtons] Buttons fetched successfully', { total, pagePaidSum: paidSum });
      res.status(200).json({
        status: 'success',
        message: 'Buttons fetched successfully',
        title: 'Payment Buttons',
        data: safeButtons,
        total,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logWithTimestamp(F, '❌ [listButtons] Error fetching buttons', { message, queryParams: req.query });
      res.status(500).json({ status: 'error', message: `❌ ${message}` });
    }
  },
};