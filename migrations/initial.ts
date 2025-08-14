/**
 * @file migrations/initial.ts
 * Creates the initial database schema for the gateway application on startup.
 * Establishes tables for admins, IDs, merchants, payment buttons, payments, and server settings,
 * restoring the original gateway functionality while adapting to a fresh start. Trigger is commented out to avoid errors.
 *
 * Version: v1.0.14 (Updated 13Aug2025_2225 BST to fix TS1005 syntax error)
 * Change Log:
 * - 11Aug2025_0342 BST (v1.0.0): Initial creation, adapted from original initial.js...
 * - 11Aug2025_1005 BST (v1.0.7): Added 'button_id' to payment_buttons...
 * - 11Aug2025_1723 BST (v1.0.8): Added merchant_id to ids table as foreign key to merchants.
 * - 13Aug2025_1420 BST (v1.0.9): Standardized merchant_id and payer_id to 255 characters, adjusted transaction_id to 64 characters, and added unique constraint to ids.
 * - 13Aug2025_1430 BST (v1.0.10): Updated merchant_id and payer_id to 255 characters for flexibility, retaining button_id and payment_id at 12.
 * - 13Aug2025_2120 BST (v1.0.11): Standardized foreign key syntax with table.foreign() for clarity.
 * - 13Aug2025_2135 BST (v1.0.12): Standardized foreign key syntax with single-line definitions for consistency.
 * - 13Aug2025_2215 BST (v1.0.13): Standardized field ordering across all tables (primary key, foreign keys, non-nullable attributes, nullable attributes, timestamps).
 * - 13Aug2025_2220 BST (v1.0.14): Fixed TS1005 syntax error by ensuring proper brace matching.
 */
import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.raw('SET FOREIGN_KEY_CHECKS = 0');
  return knex.transaction(async (trx) => {
    await knex.schema
      .createTable('admins', (table: any) => {
        table.string('admin_id', 255).notNullable().primary();
        table.timestamp('created_at').defaultTo(knex.fn.now());
        table.timestamp('updated_at').defaultTo(knex.fn.now());
      })
      .transacting(trx);
    await knex.schema
      .createTable('ids', (table: any) => {
        table.string('id', 12).notNullable().primary();
        table.string('merchant_id', 255).notNullable().references('merchant_id').inTable('merchants').onDelete('CASCADE');
        table.enum('type', ['payment', 'button']).notNullable();
        table.unique(['merchant_id', 'type']); // Ensure one button/payment per merchant
        table.timestamp('timestamp').defaultTo(knex.fn.now());
      })
      .transacting(trx);
    await knex.schema
      .createTable('merchants', (table: any) => {
        table.string('merchant_id', 255).notNullable().primary();
        table.decimal('custom_fee_rate', 24, 10).unsigned().defaultTo(0);
        table.boolean('welcomed').notNullable().defaultTo(false);
        table.boolean('custom_fee').notNullable().defaultTo(false);
        table.timestamp('created_at').defaultTo(knex.fn.now());
        table.timestamp('updated_at').defaultTo(knex.fn.now());
      })
      .transacting(trx);
    await knex.schema
      .createTable('payment_buttons', (table: any) => {
        table.string('button_id', 12).notNullable().primary().references('id').inTable('ids').onDelete('CASCADE');
        table.string('merchant_id', 255).notNullable().references('merchant_id').inTable('merchants').onDelete('CASCADE');
        table.string('payment_id', 12).nullable().references('id').inTable('ids').onDelete('CASCADE');
        table.bigInteger('amount').unsigned().notNullable().defaultTo(0);
        table.text('description').notNullable().defaultTo('No description');
        table.text('html_code').notNullable().defaultTo('<div>Pay Now</div>');
        table.boolean('variable_amount').notNullable().defaultTo(false);
        table.boolean('multi_use').notNullable().defaultTo(false);
        table.boolean('used').notNullable().defaultTo(false);
        table.bigInteger('total_paid').unsigned().nullable();
        table.timestamp('created_at').defaultTo(knex.fn.now());
        table.timestamp('updated_at').defaultTo(knex.fn.now());
      })
      .transacting(trx);
    await knex.schema
      .createTable('payments', (table: any) => {
        table.string('payment_id', 12).notNullable().primary().references('id').inTable('ids').onDelete('CASCADE');
        table.string('merchant_id', 255).notNullable().references('merchant_id').inTable('merchants').onDelete('CASCADE');
        table.string('button_id', 12).notNullable().references('id').inTable('ids').onDelete('CASCADE');
        table.string('transaction_id', 64).notNullable();
        table.bigInteger('amount').unsigned().notNullable();
        table.string('payer_id', 255).nullable();
        table.string('txid', 64).nullable();
        table.boolean('completed').notNullable().defaultTo(false);
        table.boolean('is_new').notNullable().defaultTo(true);
        table.text('blockchain_transaction', 'longtext').nullable();
        table.decimal('exchange_rate', 24, 10).nullable();
        table.timestamp('created_at').defaultTo(knex.fn.now());
        table.timestamp('updated_at').defaultTo(knex.fn.now());
      })
      .transacting(trx);
    await knex.schema
      .createTable('server_settings', (table: any) => {
        table.increments('id').primary();
        table.string('stripe_api_key').nullable();
        table.text('sendgrid_credentials').nullable();
        table.decimal('default_fee_rate', 24, 10).unsigned().defaultTo(0);
        table.boolean('setup_complete').notNullable().defaultTo(false);
        table.timestamp('created_at').defaultTo(knex.fn.now());
        table.timestamp('updated_at').defaultTo(knex.fn.now());
      })
      .transacting(trx);
    await knex.raw('SET FOREIGN_KEY_CHECKS = 1');
  }); // Closing brace for knex.transaction
} // Closing brace for up function

export async function down(knex: Knex): Promise<void> {
  await knex.raw('SET FOREIGN_KEY_CHECKS = 0');
  return knex.transaction(async (trx) => {
    await knex.schema
      .dropTableIfExists('server_settings')
      .dropTableIfExists('payments')
      .dropTableIfExists('payment_buttons')
      .dropTableIfExists('merchants')
      .dropTableIfExists('ids')
      .dropTableIfExists('admins')
      .transacting(trx);
  });
  await knex.raw('SET FOREIGN_KEY_CHECKS = 1');
}