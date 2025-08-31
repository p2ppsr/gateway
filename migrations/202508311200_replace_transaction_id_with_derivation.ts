import { Knex } from 'knex'
/**
 * @file migrations/202508311200_replace_transaction_id_with_derivation.ts
 * Renames the 'transaction_id' column to 'derivation_prefix' and adds 'derivation_suffix' in the 'payments' table.
 * Populates 'derivation_suffix' with '1' for all existing rows.
 *
 * Version: v1.2.0 (Generated 2025-09-01 00:15 BST)
 * Depends on: 202508211200_add_description_to_payments.ts
 */
export async function up(knex: Knex): Promise<void> {
  try {
    // Check if columns already exist or if transaction_id is missing
    const hasTransactionId = await knex.schema.hasColumn('payments', 'transaction_id')
    const hasDerivationPrefix = await knex.schema.hasColumn('payments', 'derivation_prefix')
    const hasDerivationSuffix = await knex.schema.hasColumn('payments', 'derivation_suffix')

    if (!hasTransactionId) {
      console.log('Column "transaction_id" does not exist in payments table, skipping migration.')
      return
    }

    if (hasDerivationPrefix || hasDerivationSuffix) {
      console.log('Column "derivation_prefix" or "derivation_suffix" already exists, skipping addition.')
      return
    }

    // Rename transaction_id to derivation_prefix
    await knex.schema.table('payments', (table: Knex.TableBuilder) => {
      table.renameColumn('transaction_id', 'derivation_prefix')
    })
    console.log('Renamed "transaction_id" to "derivation_prefix" in payments table.')

    // Add derivation_suffix column and populate with '1'
    await knex.schema.table('payments', (table: Knex.TableBuilder) => {
      table.string('derivation_suffix', 64).nullable().defaultTo(null)
    })
    console.log('Added "derivation_suffix" column to payments table.')

    await knex('payments').update({ derivation_suffix: '1' })
    console.log('Populated "derivation_suffix" with "1" for all rows.')
  } catch (error) {
    console.error('Migration up failed:', error)
    throw error // Re-throw to ensure rollback if needed
  }
}

/**
 * Rollback to rename 'derivation_prefix' back to 'transaction_id' and drop 'derivation_suffix'.
 */
export async function down(knex: Knex): Promise<void> {
  try {
    // Check if columns exist
    const hasDerivationPrefix = await knex.schema.hasColumn('payments', 'derivation_prefix')
    const hasDerivationSuffix = await knex.schema.hasColumn('payments', 'derivation_suffix')
    const hasTransactionId = await knex.schema.hasColumn('payments', 'transaction_id')

    if (hasTransactionId) {
      console.log('Column "transaction_id" already exists, skipping restoration.')
    } else if (hasDerivationPrefix) {
      // Rename derivation_prefix back to transaction_id
      await knex.schema.table('payments', (table: Knex.TableBuilder) => {
        table.renameColumn('derivation_prefix', 'transaction_id')
      })
      console.log('Renamed "derivation_prefix" back to "transaction_id" in payments table.')
    }

    if (hasDerivationSuffix) {
      await knex.schema.table('payments', (table: Knex.TableBuilder) => {
        table.dropColumn('derivation_suffix')
      })
      console.log('Dropped "derivation_suffix" column from payments table.')
    } else {
      console.log('Column "derivation_suffix" does not exist, skipping drop.')
    }
  } catch (error) {
    console.error('Migration down failed:', error)
    throw error // Re-throw to ensure rollback failure is reported
  }
}
