/**
 * @file migrations/202508241218_make_payment_buttons_description_nullable.ts
 * Makes description column nullable in payment_buttons table and sets existing values to empty string.
 *
 * Version: v1.0.0 (Created 24Aug2025_1218 BST)
 */
import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Set existing description values to empty string to satisfy NOT NULL temporarily
  await knex('payment_buttons').update({ description: '' });
  // Make description column nullable
  await knex.schema.table('payment_buttons', (table) => {
    table.string('description', 80).nullable().alter();
  });
  // Set description to NULL
  await knex('payment_buttons').update({ description: null });
  console.log('Made description column nullable and set to NULL in payment_buttons.');
}

export async function down(knex: Knex): Promise<void> {
  // Restore NOT NULL constraint with default empty string
  await knex.schema.table('payment_buttons', (table) => {
    table.string('description', 80).notNullable().defaultTo('').alter();
  });
  console.log('Restored description column to NOT NULL with default empty string in payment_buttons.');
}