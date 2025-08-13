/**
 * @file migrations/initial.ts
 * Creates the initial database schema for the gateway application on startup.
 * Establishes tables for admins, IDs, merchants, payment buttons, payments, and server settings,
 * restoring the original gateway functionality while adapting to a fresh start. Trigger is commented out to avoid errors.
 *
 * Version: v1.0.10 (Updated 13Aug2025_1430 BST to set merchant_id and payer_id to 255 characters)
 * Change Log:
 * - 11Aug2025_0342 BST (v1.0.0): Initial creation, adapted from original initial.js...
 * - 11Aug2025_1005 BST (v1.0.7): Added 'button_id' to payment_buttons...
 * - 11Aug2025_1723 BST (v1.0.8): Added merchant_id to ids table as foreign key to merchants.
 * - 13Aug2025_1420 BST (v1.0.9): Standardized merchant_id and payer_id to 66 characters, adjusted transaction_id to 64 characters, and added unique constraint to ids.
 * - 13Aug2025_1430 BST (v1.0.10): Updated merchant_id and payer_id to 255 characters for flexibility, retaining button_id and payment_id at 12.
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
        table.timestamp('timestamp').defaultTo(knex.fn.now());
        table.unique(['merchant_id', 'type']); // Ensure one button/payment per merchant
      })
      .transacting(trx);
    await knex.schema
      .createTable('merchants', (table: any) => {
        table.string('merchant_id', 255).notNullable().primary(); // Updated to 255
        table.decimal('custom_fee_rate', 24, 10).unsigned().defaultTo(0);
        table.boolean('welcomed').defaultTo(false);
        table.boolean('custom_fee').defaultTo(false);
        table.timestamp('created_at').defaultTo(knex.fn.now());
        table.timestamp('updated_at').defaultTo(knex.fn.now());
      })
      .transacting(trx);
    await knex.schema
      .createTable('payment_buttons', (table: any) => {
        table.string('id', 12).notNullable().primary();
        table.string('button_id', 12).nullable();
        table.bigInteger('amount').unsigned().nullable();
        table.string('currency', 255).nullable();
        table.boolean('variable_amount').defaultTo(false);
        table.boolean('multi_use').defaultTo(false);
        table.boolean('used').defaultTo(false);
        table.string('merchant_id', 255).notNullable().references('merchant_id').inTable('merchants').onDelete('CASCADE'); // Updated to 255, notNullable
        table.bigInteger('total_paid').unsigned().nullable();
        table.enum('accepts', ['BSV', 'fiat', 'both']).nullable();
        table.timestamp('created_at').defaultTo(knex.fn.now());
        table.timestamp('updated_at').defaultTo(knex.fn.now());
        table.text('description').nullable();
        table.text('customCSS').nullable();
        table.foreign('id').references('id').inTable('ids').onDelete('CASCADE');
      })
      .transacting(trx);
    await knex.schema.createTable('payments', (table) => {
      table.string('payment_id', 12).notNullable().primary().references('id').inTable('ids').onDelete('CASCADE');
      table.string('transaction_id', 64).notNullable(); // Retains 64 for P2PKH validation
      table.string('button_id', 12).notNullable().references('id').inTable('ids').onDelete('CASCADE');
      table.string('payer_id', 255).nullable(); // Updated to 255
      table.string('merchant_id', 255).notNullable().references('merchant_id').inTable('merchants').onDelete('CASCADE'); // Updated to 255
      table.string('txid', 64).nullable();
      table.boolean('completed').defaultTo(false);
      table.boolean('is_new').defaultTo(true);
      table.text('blockchain_transaction', 'longtext').nullable();
      table.bigInteger('amount').unsigned().notNullable();
      table.string('currency', 3).notNullable();
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
        table.boolean('setup_complete').defaultTo(false);
        table.timestamp('created_at').defaultTo(knex.fn.now());
        table.timestamp('updated_at').defaultTo(knex.fn.now());
      })
      .transacting(trx);
    await knex.raw('SET FOREIGN_KEY_CHECKS = 1');
  });
}

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