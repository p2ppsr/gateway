/**
 * @file migrations/202508210900_initial.ts
 * @description Canonical single initial migration for the Gateway database (idempotent).
 * Consolidates prior changes into one file with the current schema (03 Sep 2025):
 *  - merchant_id/admin_id = VARCHAR(66)
 *  - ids reservation table for 12-char tokens (button/payment)
 *  - payment_buttons has NO description or total_paid; html_code is NOT NULL (no TEXT default)
 *  - payments.button_id → FK to payment_buttons.button_id
 *  - payments use BRC-29 derivation_prefix/derivation_suffix (replacing legacy transaction_id)
 *  - monetary amounts are satoshis (BIGINT UNSIGNED)
 * Notes:
 *  - No explicit transaction (MySQL DDL auto-commits).
 *  - Uses hasTable() and INFORMATION_SCHEMA to be safely re-runnable.
 * @version 1.0.2 (Updated 03Sep2025_18:44 BST; idempotent, no TEXT defaults)
 */

import { Knex } from 'knex'

async function ensureIndex(knex: Knex, tableName: string, indexName: string, columns: string[]): Promise<void> {
  const row = await knex('INFORMATION_SCHEMA.STATISTICS')
    .where({
      TABLE_SCHEMA: (knex.client as any).config?.connection?.database,
      TABLE_NAME: tableName,
      INDEX_NAME: indexName
    })
    .first()
  if (!row) {
    const cols = columns.map(c => `\`${c}\``).join(', ')
    await knex.raw(`CREATE INDEX \`${indexName}\` ON \`${tableName}\` (${cols})`)
  }
}

export async function up(knex: Knex): Promise<void> {
  // merchants
  if (!(await knex.schema.hasTable('merchants'))) {
    await knex.schema.createTable('merchants', table => {
      table.string('merchant_id', 66).notNullable().primary()
      table.decimal('custom_fee_rate', 10, 6).unsigned().defaultTo(0.0)
      table.boolean('welcomed').notNullable().defaultTo(false)
      table.boolean('custom_fee').notNullable().defaultTo(false)
      table.timestamp('created_at').defaultTo(knex.fn.now())
      table.timestamp('updated_at').defaultTo(knex.fn.now())
    })
  }

  // admins
  if (!(await knex.schema.hasTable('admins'))) {
    await knex.schema.createTable('admins', table => {
      table.string('admin_id', 66).notNullable().primary()
      table.timestamp('created_at').defaultTo(knex.fn.now())
      table.timestamp('updated_at').defaultTo(knex.fn.now())
    })
  }

  // ids (reservation tokens)
  if (!(await knex.schema.hasTable('ids'))) {
    await knex.schema.createTable('ids', table => {
      table.string('id', 12).notNullable().primary()
      table
        .string('merchant_id', 66)
        .notNullable()
        .references('merchant_id')
        .inTable('merchants')
        .onDelete('CASCADE')
        .onUpdate('CASCADE')
      table.enu('type', ['payment', 'button']).notNullable()
      table.timestamp('timestamp').defaultTo(knex.fn.now())
    })
  }

  // payment_buttons
  if (!(await knex.schema.hasTable('payment_buttons'))) {
    await knex.schema.createTable('payment_buttons', table => {
      table
        .string('button_id', 12)
        .notNullable()
        .primary()
        .references('id')
        .inTable('ids')
        .onDelete('CASCADE')
        .onUpdate('CASCADE')

      table
        .string('merchant_id', 66)
        .notNullable()
        .references('merchant_id')
        .inTable('merchants')
        .onDelete('CASCADE')
        .onUpdate('CASCADE')

      table.string('payment_id', 12).nullable().references('id').inTable('ids').onDelete('CASCADE').onUpdate('CASCADE')

      table.bigInteger('amount').unsigned().notNullable().defaultTo(0)
      // NOTE: MySQL does not allow defaults on TEXT/BLOB types.
      table.text('html_code').notNullable()
      table.boolean('variable_amount').notNullable().defaultTo(false)
      table.boolean('multi_use').notNullable().defaultTo(false)
      table.boolean('used').notNullable().defaultTo(false)

      table.timestamp('created_at').defaultTo(knex.fn.now())
      table.timestamp('updated_at').defaultTo(knex.fn.now())
    })
  }
  await ensureIndex(knex, 'payment_buttons', 'idx_payment_buttons_merchant_time', ['merchant_id', 'created_at'])

  // payments
  if (!(await knex.schema.hasTable('payments'))) {
    await knex.schema.createTable('payments', table => {
      table
        .string('payment_id', 12)
        .notNullable()
        .primary()
        .references('id')
        .inTable('ids')
        .onDelete('CASCADE')
        .onUpdate('CASCADE')

      table
        .string('merchant_id', 66)
        .notNullable()
        .references('merchant_id')
        .inTable('merchants')
        .onDelete('CASCADE')
        .onUpdate('CASCADE')

      table
        .string('button_id', 12)
        .notNullable()
        .references('button_id')
        .inTable('payment_buttons')
        .onDelete('CASCADE')
        .onUpdate('CASCADE')

      // BRC-29 derivations (replace legacy transaction_id)
      table.string('derivation_prefix', 64).notNullable()
      table.string('derivation_suffix', 64).nullable().defaultTo(null)

      table.bigInteger('amount').unsigned().notNullable().defaultTo(0)
      table.string('payer_id', 255).nullable()
      table.string('txid', 64).nullable()

      table.boolean('completed').notNullable().defaultTo(false)
      table.boolean('is_new').notNullable().defaultTo(true)

      table.text('blockchain_transaction', 'longtext').nullable()
      table.string('description', 80).notNullable().defaultTo('')

      table.timestamp('created_at').defaultTo(knex.fn.now())
      table.timestamp('updated_at').defaultTo(knex.fn.now())
    })
  }
  await ensureIndex(knex, 'payments', 'idx_payments_inbox', ['merchant_id', 'is_new', 'created_at'])
  await ensureIndex(knex, 'payments', 'idx_payments_button_time', ['button_id', 'created_at'])

  // server_settings
  if (!(await knex.schema.hasTable('server_settings'))) {
    await knex.schema.createTable('server_settings', table => {
      table.increments('id').primary()
      table.string('stripe_api_key').nullable()
      table.text('sendgrid_credentials').nullable()
      table.decimal('default_fee_rate', 24, 10).unsigned().defaultTo(0)
      table.boolean('setup_complete').notNullable().defaultTo(false)
      table.timestamp('created_at').defaultTo(knex.fn.now())
      table.timestamp('updated_at').defaultTo(knex.fn.now())
    })
  }
}

export async function down(knex: Knex): Promise<void> {
  // Drop in FK-safe order; IF EXISTS keeps it idempotent
  await knex.schema.dropTableIfExists('server_settings')
  await knex.schema.dropTableIfExists('payments')
  await knex.schema.dropTableIfExists('payment_buttons')
  await knex.schema.dropTableIfExists('ids')
  await knex.schema.dropTableIfExists('admins')
  await knex.schema.dropTableIfExists('merchants')
}
