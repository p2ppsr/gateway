// src/utils/idGenerator.ts
// Version: v1.0.7 (Updated 26Aug2025_0100 BST)
// Change Log:
// - 26Aug2025_0100 BST (v1.0.7): Updated generateAndValidateUniqueId to return { id, description } for use in invoice.ts.
// - 24Aug2025_1645 BST (v1.0.6): Made previousId optional; handle replaceAll for payment descriptions.
// - 24Aug2025_1159 BST (v1.0.5): Removed all payment_buttons.description updates, as they use placeholder descriptions; kept replaceAll for payments.description in duplicate case.
// - 24Aug2025_1207 BST (v1.0.4): Removed unnecessary payment_buttons.description update for type=button; used replaceAll for payment duplicates.
// - 24Aug2025_1200 BST (v1.0.3): Replaced regex with replaceAll using known duplicate id for description updates in payment case.
// - 24Aug2025_1152 BST (v1.0.2): Replaced regex with replaceAll using previous ID from database; updated regex to match exactly 12 characters.
// - 24Aug2025_1145 BST (v1.0.1): Replaced regex with replaceAll using previous ID from database for description updates.
// - Initial version: ID generation and validation with regex-based description updates.
import knex, { Knex } from 'knex';
import knexConfig from '../../knexfile';
import { generateBase58 } from './general';
import { logWithTimestamp } from './logging';
const db: Knex = knex(knexConfig);
const F = 'utils/idGenerator';
export async function generateAndValidateUniqueId(merchantId: string, type: 'payment' | 'button', description: string, previousId?: string, maxAttempts = 5): Promise<{ id: string, description: string }> {
  if (!description || typeof description !== 'string' || description.length > 80) {
    throw new Error('Description is required and must not exceed 80 characters');
  }
  let id = generateBase58(12);
  let attempts = 0;
  let finalDescription = description;
  if (type === 'payment' && previousId) {
    finalDescription = description.replaceAll(previousId, id);
    logWithTimestamp(F, '🔍 Replaced previous payment_id in description:', {
      oldId: previousId,
      newId: id,
      finalDescription
    });
  }
  await db.transaction(async (trx) => {
    while (attempts < maxAttempts) {
      const existingId = await trx('ids')
        .where({ id, type, merchant_id: merchantId })
        .first();
      const existingPayment = await trx('payments')
        .where({ payment_id: id })
        .first();
      logWithTimestamp(F, '🔍 Checking uniqueness:', { id, type, merchantId, attempt: attempts + 1, existsInIds: !!existingId, existsInPayments: !!existingPayment });
      if (!existingId && !existingPayment) {
        await trx('ids').insert({
          id,
          merchant_id: merchantId,
          type,
          timestamp: trx.fn.now(),
        });
        logWithTimestamp(F, '✅ Unique ID generated and inserted:', { id, type, merchantId, finalDescription });
        break;
      } else if (type === 'payment' && existingPayment) {
        const newId = generateBase58(12);
        finalDescription = finalDescription.replaceAll(id, newId);
        await trx('payments')
          .where({ payment_id: id, merchant_id: merchantId })
          .update({ description: finalDescription });
        logWithTimestamp(F, '✅ Updated payments description for duplicate:', { payment_id: id, finalDescription });
        id = newId;
      } else {
        id = generateBase58(12);
        if (type === 'payment' && previousId) {
          finalDescription = description.replaceAll(previousId, id);
          logWithTimestamp(F, '🔍 Replaced previous payment_id in description:', {
            oldId: previousId,
            newId: id,
            finalDescription
          });
        }
      }
      attempts++;
      if (attempts >= maxAttempts) {
        throw new Error(`Failed to generate unique ${type} ID after ${maxAttempts} attempts`);
      }
    }
  });
  logWithTimestamp(F, '🔍 Returning ID and description:', { id, finalDescription });
  return { id, description: finalDescription };
}