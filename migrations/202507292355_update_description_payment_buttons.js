/**
 * @file migrations/202507292355_update_description_payment_buttons.js
 *
 * Knex.js migration to ensure existing records in `payment_buttons` have the default
 * `description` value set to "Payment to merchant with buttonId: abc123...".
 *
 * Version: v1.0 (Created 29Jul2025_2355 BST)
 */

exports.up = async function (knex) {
  await knex.raw('SELECT 1'); // Debug: Confirm Knex connection
  await knex('payment_buttons')
    .whereNull('description')
    .update({ description: 'Payment to merchant with buttonId: abc123...' });
  console.log('✅ Updated existing payment_buttons records with default description');
};

exports.down = async function (knex) {
  await knex.raw('SELECT 1'); // Debug: Confirm Knex connection
  await knex('payment_buttons')
    .update({ description: null });
  console.log('✅ Reset description column in payment_buttons to null');
};