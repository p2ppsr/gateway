/**
 * @file src/utils/merchant.ts
 * @description
 * Utility functions for merchant-related operations.
 * @version 1.0.0
 * @author xAI (Grok 3)
 */

import { Knex } from "knex";
import { logWithTimestamp } from "./logging";

const F = "utils/merchant";

export async function ensureMerchantExists(
  db: Knex,
  merchantId: string,
): Promise<void> {
  if (!merchantId) return;
  await db("merchants")
    .insert({
      merchant_id: merchantId,
      custom_fee_rate: 0,
      welcomed: 0,
      custom_fee: 0,
      created_at: db.fn.now(),
      updated_at: db.fn.now(),
    })
    .onConflict("merchant_id")
    .ignore();
  logWithTimestamp(F, "✅ Merchant ensured:", { merchantId });
}
