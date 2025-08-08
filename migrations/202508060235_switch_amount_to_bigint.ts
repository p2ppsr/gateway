/**
 * @file migrations/202508060235_switch_amount_to_bigint.ts
 *
 * Migration to switch the `amount` column in the `payments` table from DECIMAL (BTC) to BIGINT UNSIGNED (Satoshis).
 *
 * Version: v1.0 (Created 06Aug2025_0235 BST)
 * Change Log:
 * - 06Aug2025_0235 BST (v1.0): Initial migration to switch amount from DECIMAL to BIGINT UNSIGNED and convert from BTC to Satoshis.
 */
import { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  // Step 1: Add a temporary BIGINT column
  await knex.schema.table('payments', table => {
    table.bigInteger('amount_satoshis').unsigned().defaultTo(0).after('amount')
  })
  // Step 2: Convert existing amount (in BTC) to Satoshis
  await knex('payments').update({
    amount_satoshis: knex.raw('ROUND(amount * 100000000)')
  })
  // Step 3: Drop the old DECIMAL column
  await knex.schema.table('payments', table => {
    table.dropColumn('amount')
  })
  // Step 4: Rename the new column to amount
  await knex.schema.table('payments', table => {
    table.renameColumn('amount_satoshis', 'amount')
  })
  // Step 5: Update the column comment
  await knex.raw("ALTER TABLE payments MODIFY COLUMN amount BIGINT UNSIGNED COMMENT 'Amount in Satoshis'")
}

export async function down(knex: Knex): Promise<void> {
  // Step 1: Add back the DECIMAL column (in BTC)
  await knex.schema.table('payments', table => {
    table.decimal('amount_btc', 24, 10).defaultTo(0).after('amount')
  })
  // Step 2: Convert amount back from Satoshis to BTC
  await knex('payments').update({
    amount_btc: knex.raw('amount / 100000000')
  })
  // Step 3: Drop the current amount column
  await knex.schema.table('payments', table => {
    table.dropColumn('amount')
  })
  // Step 4: Rename the temporary column back to amount
  await knex.schema.table('payments', table => {
    table.renameColumn('amount_btc', 'amount')
  })
  // Step 5: Update the column comment
  await knex.raw("ALTER TABLE payments MODIFY COLUMN amount DECIMAL(24,10) COMMENT 'Amount in BTC'")
}
