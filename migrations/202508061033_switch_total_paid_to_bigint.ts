/**
 * @file migrations/202508061033_switch_total_paid_to_bigint.ts
 *
 * Migration to switch the `total_paid` column in the `payment_buttons` table from DECIMAL (BSV) to BIGINT UNSIGNED (Satoshis).
 *
 * Version: v1.0 (Created 06Aug2025_1033 BST)
 * Change Log:
 * - 06Aug2025_1033 BST (v1.0): Initial migration to switch total_paid from DECIMAL to BIGINT UNSIGNED and convert from BSV to Satoshis.
 */
import { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  // Step 1: Add a temporary BIGINT column
  await knex.schema.table('payment_buttons', table => {
    table.bigInteger('total_paid_satoshis').unsigned().defaultTo(0).after('total_paid')
  })
  // Step 2: Convert existing total_paid (in BSV) to Satoshis
  await knex('payment_buttons').update({
    total_paid_satoshis: knex.raw('ROUND(total_paid * 100000000)')
  })
  // Step 3: Drop the old DECIMAL column
  await knex.schema.table('payment_buttons', table => {
    table.dropColumn('total_paid')
  })
  // Step 4: Rename the new column to total_paid
  await knex.schema.table('payment_buttons', table => {
    table.renameColumn('total_paid_satoshis', 'total_paid')
  })
  // Step 5: Update the column comment
  await knex.raw(
    "ALTER TABLE payment_buttons MODIFY COLUMN total_paid BIGINT UNSIGNED COMMENT 'Total paid in Satoshis'"
  )
}

export async function down(knex: Knex): Promise<void> {
  // Step 1: Add back the DECIMAL column (in BSV)
  await knex.schema.table('payment_buttons', table => {
    table.decimal('total_paid_bsv', 24, 10).defaultTo(0).after('total_paid')
  })
  // Step 2: Convert total_paid back from Satoshis to BSV
  await knex('payment_buttons').update({
    total_paid_bsv: knex.raw('total_paid / 100000000')
  })
  // Step 3: Drop the current total_paid column
  await knex.schema.table('payment_buttons', table => {
    table.dropColumn('total_paid')
  })
  // Step 4: Rename the temporary column back to total_paid
  await knex.schema.table('payment_buttons', table => {
    table.renameColumn('total_paid_bsv', 'total_paid')
  })
  // Step 5: Update the column comment
  await knex.raw("ALTER TABLE payment_buttons MODIFY COLUMN total_paid DECIMAL(24,10) COMMENT 'Total paid in BSV'")
}
