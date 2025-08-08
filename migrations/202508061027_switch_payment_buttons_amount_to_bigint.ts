/**
 * @file migrations/202508061027_switch_payment_buttons_amount_to_bigint.ts
 *
 * Migration to switch the `amount` column in the `payment_buttons` table from DECIMAL (BSV) to BIGINT UNSIGNED (Satoshis).
 *
 * Version: v1.0 (Created 06Aug2025_1027 BST)
 * Change Log:
 * - 06Aug2025_1027 BST (v1.0): Initial migration to switch amount from DECIMAL to BIGINT UNSIGNED and convert from BSV to Satoshis.
 */
import { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  // Step 1: Add a temporary BIGINT column
  await knex.schema.table('payment_buttons', table => {
    table.bigInteger('amount_satoshis').unsigned().defaultTo(0).after('amount')
  })
  // Step 2: Convert existing amount (in BSV) to Satoshis
  await knex('payment_buttons').update({
    amount_satoshis: knex.raw('ROUND(amount * 100000000)')
  })
  // Step 3: Drop the old DECIMAL column
  await knex.schema.table('payment_buttons', table => {
    table.dropColumn('amount')
  })
  // Step 4: Rename the new column to amount
  await knex.schema.table('payment_buttons', table => {
    table.renameColumn('amount_satoshis', 'amount')
  })
  // Step 5: Update the column comment
  await knex.raw("ALTER TABLE payment_buttons MODIFY COLUMN amount BIGINT UNSIGNED COMMENT 'Amount in Satoshis'")
}

export async function down(knex: Knex): Promise<void> {
  // Step 1: Add back the DECIMAL column (in BSV)
  await knex.schema.table('payment_buttons', table => {
    table.decimal('amount_bsv', 24, 10).defaultTo(0).after('amount')
  })
  // Step 2: Convert amount back from Satoshis to BSV
  await knex('payment_buttons').update({
    amount_bsv: knex.raw('amount / 100000000')
  })
  // Step 3: Drop the current amount column
  await knex.schema.table('payment_buttons', table => {
    table.dropColumn('amount')
  })
  // Step 4: Rename the temporary column back to amount
  await knex.schema.table('payment_buttons', table => {
    table.renameColumn('amount_bsv', 'amount')
  })
  // Step 5: Update the column comment
  await knex.raw("ALTER TABLE payment_buttons MODIFY COLUMN amount DECIMAL(24,10) COMMENT 'Amount in BSV'")
}
