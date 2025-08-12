/**
 * @file migrations/initial.ts
 * Creates the initial database schema for the gateway application on startup.
 * Establishes tables for admins, IDs, merchants, payment buttons, payments, and server settings,
 * restoring the original gateway functionality while adapting to a fresh start. Trigger is commented out to avoid errors.
 *
 * Version: v1.0.8 (Updated 11Aug2025_1723 BST to add merchant_id to ids table)
 * Change Log:
 * - 11Aug2025_0342 BST (v1.0.0): Initial creation, adapted from original initial.js...
 * - 11Aug2025_1005 BST (v1.0.7): Added 'button_id' to payment_buttons...
 * - 11Aug2025_1723 BST (v1.0.8): Added merchant_id to ids table as foreign key to merchants.
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
        //table.unique(['merchant_id', 'type']); // Ensure one button and one payment per merchant
      })
      .transacting(trx);
    await knex.schema
      .createTable('merchants', (table: any) => {
        table.string('merchant_id').notNullable().primary();
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
        table.tinyint('variable_amount').defaultTo(0);
        table.string('merchant_id', 255).nullable().references('merchant_id').inTable('merchants').onDelete('CASCADE');
        table.tinyint('multi_use').defaultTo(0);
        table.tinyint('used').defaultTo(0);
        table.bigInteger('total_paid').unsigned().nullable();
        table.enum('accepts', ['BSV', 'fiat', 'both']).nullable();
        table.timestamp('created_at').defaultTo(knex.fn.now());
        table.timestamp('updated_at').defaultTo(knex.fn.now());
        table.text('description').nullable();
        table.text('customCSS').nullable();
        table.foreign('id').references('id').inTable('ids').onDelete('CASCADE');
      })
      .transacting(trx);
    await knex.schema
      .createTable('payments', (table: any) => {
        table.string('transaction_id', 64).notNullable().primary();
        table.string('payment_id', 12).notNullable();
        table.string('from', 255).nullable();
        table.string('merchant_id', 255).nullable().references('merchant_id').inTable('merchants').onDelete('CASCADE');
        table.tinyint('completed').defaultTo(0);
        table.tinyint('is_new').defaultTo(0);
        table.text('transaction_info', 'longtext').nullable();
        table.bigInteger('amount').unsigned().nullable();
        table.string('currency', 255).nullable();
        table.decimal('exchange_rate', 24, 10).nullable();
        table.timestamp('created_at').defaultTo(knex.fn.now());
        table.timestamp('updated_at').defaultTo(knex.fn.now());
        table.foreign('payment_id').references('id').inTable('ids').onDelete('CASCADE');
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