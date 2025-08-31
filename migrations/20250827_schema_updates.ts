import { Knex } from 'knex'
const F = 'migrations/20250827_schema_updates'
/**
 * @file migrations/20250827_schema_updates.ts
 * Updates schema for payment_buttons table by dropping description and total_paid columns,
 * and modifying html_code to NOT NULL with a default value.
 *
 * Version: v1.0.3 (Updated 2025-09-01 01:00 BST)
 * Depends on: 202508211200_add_description_to_payments.ts
 */
export async function up(knex: Knex): Promise<void> {
  try {
    console.log(`${F}: Running schema updates migration`)
    // 1. Drop payment_buttons.description
    await knex.schema.alterTable('payment_buttons', (table: Knex.TableBuilder) => {
      table.dropColumn('description')
    })
    console.log(`${F}: Dropped payment_buttons.description`)

    // 2. Modify payment_buttons.html_code to NOT NULL
    await knex.schema.alterTable('payment_buttons', (table: Knex.TableBuilder) => {
      table
        .text('html_code')
        .notNullable()
        .defaultTo('<div>Pay Now</div>')
        .alter()
    })
    console.log(`${F}: Modified payment_buttons.html_code to NOT NULL with default`)

    // 3. Drop payment_buttons.total_paid
    await knex.schema.alterTable('payment_buttons', (table: Knex.TableBuilder) => {
      table.dropColumn('total_paid')
    })
    console.log(`${F}: Dropped payment_buttons.total_paid`)
  } catch (error) {
    console.error(`${F}: Migration up failed:`, error)
    throw error // Re-throw to ensure rollback if needed
  }
}

export async function down(knex: Knex): Promise<void> {
  try {
    console.log(`${F}: Reverting schema updates migration`)
    // Revert: Add payment_buttons.description
    await knex.schema.alterTable('payment_buttons', (table: Knex.TableBuilder) => {
      table.string('description', 80).nullable()
    })
    console.log(`${F}: Restored payment_buttons.description`)

    // Revert: Make payment_buttons.html_code nullable
    await knex.schema.alterTable('payment_buttons', (table: Knex.TableBuilder) => {
      table.text('html_code').nullable().alter()
    })
    console.log(`${F}: Reverted payment_buttons.html_code to nullable`)

    // Revert: Add payment_buttons.total_paid
    await knex.schema.alterTable('payment_buttons', (table: Knex.TableBuilder) => {
      table.bigint('total_paid').unsigned().defaultTo(0)
    })
    console.log(`${F}: Restored payment_buttons.total_paid`)
  } catch (error) {
    console.error(`${F}: Migration down failed:`, error)
    throw error // Re-throw to ensure rollback failure is reported
  }
}
