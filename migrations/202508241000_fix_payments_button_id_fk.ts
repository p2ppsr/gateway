/**
 * @file migrations/202508241018_fix_payments_button_id_fk.ts
 * Fixes the foreign key constraint on payments.button_id to reference payment_buttons.button_id instead of ids.id.
 *
 * Version: v1.0.0 (Created 24Aug2025_1018 BST)
 * Depends on: 202508231620_optimize_schema_types.ts, 202508210900_initial.ts
 */
import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.raw('SET FOREIGN_KEY_CHECKS = 0');
  try {
    // Drop existing foreign key
    await knex.schema.table('payments', (table) => {
      table.dropForeign(['button_id'], 'payments_button_id_foreign');
    });
    console.log('Dropped foreign key constraint payments_button_id_foreign on payments.button_id.');

    // Add new foreign key
    await knex.schema.table('payments', (table) => {
      table.foreign('button_id').references('button_id').inTable('payment_buttons').onDelete('CASCADE').onUpdate('CASCADE');
    });
    console.log('Created foreign key constraint on payments.button_id referencing payment_buttons.button_id.');
  } catch (error) {
    console.error('Migration up failed:', error);
    throw error;
  } finally {
    await knex.raw('SET FOREIGN_KEY_CHECKS = 1');
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('SET FOREIGN_KEY_CHECKS = 0');
  try {
    // Drop new foreign key
    await knex.schema.table('payments', (table) => {
      table.dropForeign(['button_id']);
    });
    console.log('Dropped foreign key constraint on payments.button_id.');

    // Restore original foreign key
    await knex.schema.table('payments', (table) => {
      table.foreign('button_id').references('id').inTable('ids').onDelete('CASCADE').onUpdate('CASCADE');
    });
    console.log('Restored foreign key constraint on payments.button_id referencing ids.id.');
  } catch (error) {
    console.error('Migration down failed:', error);
    throw error;
  } finally {
    await knex.raw('SET FOREIGN_KEY_CHECKS = 1');
  }
}