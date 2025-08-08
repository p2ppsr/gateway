/**
 * @file migrations/202507292330_add_description_to_payment_buttons.js
 *
 * Knex.js migration to add a `description` column to the `payment_buttons` table.
 *
 * Adds a nullable TEXT column for storing custom spending descriptions, with a default
 * value of "Payment to merchant with buttonId: abc123..." for existing records.
 *
 * Version: v1.0 (Created 29Jul2025_2255 BST)
 */

exports.up = async function (knex) {
  await knex.raw('SELECT 1') // Debug: Confirm Knex connection
  await knex.schema.table('payment_buttons', table => {
    table.text('description').nullable().defaultTo('Payment to merchant with buttonId: abc123...')
  })
  await knex.raw('SELECT 1') // Debug: Confirm schema update
  console.log('✅ Added description column to payment_buttons table')
}

exports.down = async function (knex) {
  await knex.raw('SELECT 1') // Debug: Confirm Knex connection
  await knex.schema.table('payment_buttons', table => {
    table.dropColumn('description')
  })
  await knex.raw('SELECT 1') // Debug: Confirm schema rollback
  console.log('✅ Removed description column from payment_buttons table')
}
