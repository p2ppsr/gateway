const F = 'routes/acknowledgePayment';
import knex, { Knex } from 'knex';
import knexConfig from '../../knexfile';
import type { Request, Response } from 'express';
import { logWithTimestamp } from '../utils/logging';

const db: Knex = knex(knexConfig);

export default {
  type: 'post' as const,
  path: '/acknowledgePayment',
  func: async (req: Request, res: Response): Promise<void> => {
    try {
      const { paymentId } = req.body;
      logWithTimestamp(F, 'Received request body:', req.body); // Log the incoming request

      if (!paymentId) {
        logWithTimestamp(F, '❌ Missing paymentId');
        res.status(400).json({ status: 'error', message: '❌ Missing paymentId' });
        return;
      }

      // Log the current column info to verify type
      const columns = await db('information_schema.columns')
        .where({ table_name: 'payments', column_name: 'is_new' })
        .first();
      logWithTimestamp(F, 'is_new column info:', columns);

      // Update using payment_id with is_new as false (for BOOLEAN)
      await db.transaction(async (trx: Knex.Transaction) => {
        const result = await trx('payments').where({ payment_id: paymentId }).update({ is_new: false });
        logWithTimestamp(F, 'Update result:', result); // Log the result of the update
        if (result === 0) {
          throw new Error('No rows updated');
        }
      });

      logWithTimestamp(F, '✅ Payment acknowledged successfully:', { paymentId });
      res.status(200).json({ status: 'success', message: 'Payment acknowledged successfully' });
    } catch (err) {
      logWithTimestamp(F, '❌ Error in acknowledgePayment:', {
        message: err instanceof Error ? err.message : '❌ Unknown error',
        stack: err instanceof Error ? err.stack : '❌ No stack trace',
      });
      res.status(500).json({ status: 'error', message: '❌ Internal server error' });
    }
  },
};