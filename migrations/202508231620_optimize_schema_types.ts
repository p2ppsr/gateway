import { Knex } from 'knex'

/**
 * @file migrations/202508231620_optimize_schema_types.ts
 * Optimizes data types and defaults in the 'payment_buttons', 'payments', 'merchants', 'admins', and 'ids' tables.
 * Aligns 'description' with the 80-character limit, adjusts 'html_code' to TEXT, removes 'exchange_rate' as satoshis are used exclusively,
 * and optimizes other types for efficiency and consistency.
 *
 * Version: v1.3.2 (Updated 2025-08-23 20:10 BST)
 * Depends on: 202508211200_add_description_to_payments.ts, 202508210900_initial.ts
 */
export async function up(knex: Knex): Promise<void> {
  try {
    // payment_buttons table
    const hasDescriptionInPaymentButtons = await knex.schema.hasColumn('payment_buttons', 'description')
    if (hasDescriptionInPaymentButtons) {
      await knex.schema.table('payment_buttons', table => {
        table.string('description', 80).notNullable().alter() // Change to VARCHAR(80), make NOT NULL
      })
      console.log('Altered "description" column in payment_buttons to VARCHAR(80) NOT NULL.')
    }
    const hasHtmlCodeInPaymentButtons = await knex.schema.hasColumn('payment_buttons', 'html_code')
    if (hasHtmlCodeInPaymentButtons) {
      await knex.schema.table('payment_buttons', table => {
        table.text('html_code').nullable().alter() // Change to TEXT, allow NULL
      })
      console.log('Altered "html_code" column in payment_buttons to TEXT NULL.')
    }
    const hasTotalPaidInPaymentButtons = await knex.schema.hasColumn('payment_buttons', 'total_paid')
    if (hasTotalPaidInPaymentButtons) {
      await knex.schema.table('payment_buttons', table => {
        table.bigInteger('total_paid').unsigned().defaultTo(0).alter() // Add default 0
      })
      console.log('Altered "total_paid" column in payment_buttons to DEFAULT 0.')
    }
    // payments table
    const hasDescriptionInPayments = await knex.schema.hasColumn('payments', 'description')
    if (hasDescriptionInPayments) {
      // Replace NULL values with an empty string before enforcing NOT NULL
      await knex('payments').whereNull('description').update({ description: '' })
      await knex.schema.table('payments', table => {
        table.string('description', 80).notNullable().defaultTo('').alter() // Ensure VARCHAR(80) NOT NULL with default
      })
      console.log(
        'Replaced NULL and altered "description" column in payments to VARCHAR(80) NOT NULL with default empty string.'
      )
    } else {
      await knex.schema.table('payments', table => {
        table.string('description', 80).notNullable().defaultTo('') // Add if missing, make NOT NULL with default
      })
      console.log('Added "description" column to payments table as VARCHAR(80) NOT NULL with default empty string.')
    }
    const hasAmountInPayments = await knex.schema.hasColumn('payments', 'amount')
    if (hasAmountInPayments) {
      await knex.schema.table('payments', table => {
        table.bigInteger('amount').unsigned().defaultTo(0).alter() // Add default 0
      })
      console.log('Altered "amount" column in payments to DEFAULT 0.')
    }
    const hasExchangeRateInPayments = await knex.schema.hasColumn('payments', 'exchange_rate')
    if (hasExchangeRateInPayments) {
      await knex.schema.table('payments', table => {
        table.dropColumn('exchange_rate') // Remove exchange_rate as satoshis are used exclusively
      })
      console.log('Dropped "exchange_rate" column from payments table.')
    }
    // merchants table
    const hasMerchantIdInMerchants = await knex.schema.hasColumn('merchants', 'merchant_id')
    if (hasMerchantIdInMerchants) {
      // Explicitly drop known foreign key constraints
      const tablesWithFK = ['payment_buttons', 'ids', 'payments']
      for (const table of tablesWithFK) {
        const fkExists = await knex.schema.hasColumn(table, 'merchant_id')
        if (fkExists) {
          try {
            const tableInfo = await knex('INFORMATION_SCHEMA.KEY_COLUMN_USAGE')
              .where({
                TABLE_SCHEMA: knex.client.database(),
                TABLE_NAME: table,
                COLUMN_NAME: 'merchant_id',
                REFERENCED_TABLE_NAME: 'merchants',
                REFERENCED_COLUMN_NAME: 'merchant_id'
              })
              .first()
            if (tableInfo) {
              await knex.schema.table(table, table => {
                table.dropForeign(['merchant_id'])
              })
              console.log(`Dropped foreign key constraint on ${table}.merchant_id.`)
            } else if (table === 'payments') {
              // Explicitly drop payments_merchant_id_foreign if not found in query
              await knex.schema.raw('ALTER TABLE payments DROP FOREIGN KEY payments_merchant_id_foreign')
              console.log(
                'Explicitly dropped foreign key constraint payments_merchant_id_foreign on payments.merchant_id.'
              )
            }
          } catch (error) {
            console.warn(
              `Warning: Could not drop foreign key on ${table}.merchant_id:`,
              error instanceof Error ? error.message : 'Unknown error'
            )
          }
        }
      }
      // Alter merchant_id column
      await knex.schema.table('merchants', table => {
        table.string('merchant_id', 66).alter() // Change to varchar(66) for compressed public keys
      })
      console.log('Altered "merchant_id" column in merchants to VARCHAR(66).')
      // Recreate foreign key constraints
      for (const table of tablesWithFK) {
        const fkExists = await knex.schema.hasColumn(table, 'merchant_id')
        if (fkExists) {
          await knex.schema.table(table, table => {
            table
              .foreign('merchant_id')
              .references('merchant_id')
              .inTable('merchants')
              .onDelete('CASCADE')
              .onUpdate('CASCADE')
          })
          console.log(`Recreated foreign key constraint on ${table}.merchant_id.`)
        }
      }
    }
    const hasCustomFeeRateInMerchants = await knex.schema.hasColumn('merchants', 'custom_fee_rate')
    if (hasCustomFeeRateInMerchants) {
      await knex.schema.table('merchants', table => {
        table.decimal('custom_fee_rate', 10, 6).unsigned().defaultTo(0.0).alter() // Change to decimal(10,6)
      })
      console.log('Altered "custom_fee_rate" column in merchants to DECIMAL(10,6) DEFAULT 0.0.')
    }
    // admins table
    const hasAdminIdInAdmins = await knex.schema.hasColumn('admins', 'admin_id')
    if (hasAdminIdInAdmins) {
      await knex.schema.table('admins', table => {
        table.string('admin_id', 66).alter() // Change to varchar(66) for compressed public keys
      })
      console.log('Altered "admin_id" column in admins to VARCHAR(66).')
    }
    // ids table
    const hasMerchantIdInIds = await knex.schema.hasColumn('ids', 'merchant_id')
    if (hasMerchantIdInIds) {
      // Drop the foreign key constraint on ids.merchant_id
      const idsFKInfo = await knex('INFORMATION_SCHEMA.KEY_COLUMN_USAGE')
        .where({
          TABLE_SCHEMA: knex.client.database(),
          TABLE_NAME: 'ids',
          COLUMN_NAME: 'merchant_id'
        })
        .first()
      if (idsFKInfo) {
        await knex.schema.table('ids', table => {
          table.dropForeign(['merchant_id'])
        })
        console.log('Dropped foreign key constraint on ids.merchant_id.')
      }
      // Alter merchant_id column
      await knex.schema.table('ids', table => {
        table.string('merchant_id', 66).alter() // Change to varchar(66) for compressed public keys
      })
      console.log('Altered "merchant_id" column in ids to VARCHAR(66).')
      // Recreate the foreign key constraint if it references merchants
      if (
        idsFKInfo &&
        idsFKInfo.REFERENCED_TABLE_NAME === 'merchants' &&
        idsFKInfo.REFERENCED_COLUMN_NAME === 'merchant_id'
      ) {
        await knex.schema.table('ids', table => {
          table
            .foreign('merchant_id')
            .references('merchant_id')
            .inTable('merchants')
            .onDelete('CASCADE')
            .onUpdate('CASCADE')
        })
        console.log('Recreated foreign key constraint on ids.merchant_id.')
      }
    }
    // Additional alignment for payment_buttons.merchant_id
    const hasMerchantIdInPaymentButtons = await knex.schema.hasColumn('payment_buttons', 'merchant_id')
    if (hasMerchantIdInPaymentButtons) {
      const paymentButtonsFKInfo = await knex('INFORMATION_SCHEMA.KEY_COLUMN_USAGE')
        .where({
          TABLE_SCHEMA: knex.client.database(),
          TABLE_NAME: 'payment_buttons',
          COLUMN_NAME: 'merchant_id',
          REFERENCED_TABLE_NAME: 'merchants',
          REFERENCED_COLUMN_NAME: 'merchant_id'
        })
        .first()
      if (paymentButtonsFKInfo) {
        await knex.schema.table('payment_buttons', table => {
          table.dropForeign(['merchant_id'])
        })
        console.log('Dropped foreign key constraint on payment_buttons.merchant_id for realignment.')
      }
      await knex.schema.table('payment_buttons', table => {
        table.string('merchant_id', 66).notNullable().alter()
      })
      console.log('Altered "merchant_id" column in payment_buttons to VARCHAR(66).')
      if (paymentButtonsFKInfo) {
        await knex.schema.table('payment_buttons', table => {
          table
            .foreign('merchant_id')
            .references('merchant_id')
            .inTable('merchants')
            .onDelete('CASCADE')
            .onUpdate('CASCADE')
        })
        console.log('Recreated foreign key constraint on payment_buttons.merchant_id.')
      }
    }
    // Additional alignment for payments.merchant_id
    const hasMerchantIdInPayments = await knex.schema.hasColumn('payments', 'merchant_id')
    if (hasMerchantIdInPayments) {
      const paymentsFKInfo = await knex('INFORMATION_SCHEMA.KEY_COLUMN_USAGE')
        .where({
          TABLE_SCHEMA: knex.client.database(),
          TABLE_NAME: 'payments',
          COLUMN_NAME: 'merchant_id',
          REFERENCED_TABLE_NAME: 'merchants',
          REFERENCED_COLUMN_NAME: 'merchant_id'
        })
        .first()
      if (paymentsFKInfo) {
        await knex.schema.table('payments', table => {
          table.dropForeign(['merchant_id'])
        })
        console.log('Dropped foreign key constraint on payments.merchant_id for realignment.')
      }
      await knex.schema.table('payments', table => {
        table.string('merchant_id', 66).notNullable().alter()
      })
      console.log('Altered "merchant_id" column in payments to VARCHAR(66).')
      if (paymentsFKInfo) {
        await knex.schema.table('payments', table => {
          table
            .foreign('merchant_id')
            .references('merchant_id')
            .inTable('merchants')
            .onDelete('CASCADE')
            .onUpdate('CASCADE')
        })
        console.log('Recreated foreign key constraint on payments.merchant_id.')
      }
    }
  } catch (error) {
    console.error('Migration up failed:', error)
    throw error // Re-throw to ensure rollback if needed
  }
}

/**
 * Rollback to revert the optimized types to their original definitions, including restoring exchange_rate.
 */
export async function down(knex: Knex): Promise<void> {
  try {
    // payment_buttons table
    const hasDescriptionInPaymentButtons = await knex.schema.hasColumn('payment_buttons', 'description')
    if (hasDescriptionInPaymentButtons) {
      await knex.schema.table('payment_buttons', table => {
        table.text('description').notNullable().alter() // Revert to TEXT
      })
      console.log('Reverted "description" column in payment_buttons to TEXT.')
    }
    const hasHtmlCodeInPaymentButtons = await knex.schema.hasColumn('payment_buttons', 'html_code')
    if (hasHtmlCodeInPaymentButtons) {
      await knex.schema.table('payment_buttons', table => {
        table.text('html_code').notNullable().alter() // Revert to TEXT
      })
      console.log('Reverted "html_code" column in payment_buttons to TEXT.')
    }
    const hasTotalPaidInPaymentButtons = await knex.schema.hasColumn('payment_buttons', 'total_paid')
    if (hasTotalPaidInPaymentButtons) {
      await knex.schema.table('payment_buttons', table => {
        table.bigInteger('total_paid').unsigned().nullable().alter() // Remove default
      })
      console.log('Reverted "total_paid" column in payment_buttons to NULL default.')
    }
    const hasMerchantIdInPaymentButtons = await knex.schema.hasColumn('payment_buttons', 'merchant_id')
    if (hasMerchantIdInPaymentButtons) {
      const paymentButtonsFKInfo = await knex('INFORMATION_SCHEMA.KEY_COLUMN_USAGE')
        .where({
          TABLE_SCHEMA: knex.client.database(),
          TABLE_NAME: 'payment_buttons',
          COLUMN_NAME: 'merchant_id',
          REFERENCED_TABLE_NAME: 'merchants',
          REFERENCED_COLUMN_NAME: 'merchant_id'
        })
        .first()
      if (paymentButtonsFKInfo) {
        await knex.schema.table('payment_buttons', table => {
          table.dropForeign(['merchant_id'])
        })
        console.log('Dropped foreign key constraint on payment_buttons.merchant_id for revert.')
      }
      await knex.schema.table('payment_buttons', table => {
        table.string('merchant_id', 255).notNullable().alter()
      })
      console.log('Reverted "merchant_id" column in payment_buttons to VARCHAR(255).')
      if (paymentButtonsFKInfo) {
        await knex.schema.table('payment_buttons', table => {
          table
            .foreign('merchant_id')
            .references('merchant_id')
            .inTable('merchants')
            .onDelete('CASCADE')
            .onUpdate('CASCADE')
        })
        console.log('Recreated foreign key constraint on payment_buttons.merchant_id.')
      }
    }
    // payments table
    const hasDescriptionInPayments = await knex.schema.hasColumn('payments', 'description')
    if (hasDescriptionInPayments) {
      await knex.schema.table('payments', table => {
        table.text('description').nullable().alter() // Revert to TEXT
      })
      console.log('Reverted "description" column in payments to TEXT.')
    }
    const hasAmountInPayments = await knex.schema.hasColumn('payments', 'amount')
    if (hasAmountInPayments) {
      await knex.schema.table('payments', table => {
        table.bigInteger('amount').unsigned().nullable().alter() // Remove default
      })
      console.log('Reverted "amount" column in payments to NULL default.')
    }
    const hasExchangeRateInPayments = await knex.schema.hasColumn('payments', 'exchange_rate')
    if (!hasExchangeRateInPayments) {
      await knex.schema.table('payments', table => {
        table.decimal('exchange_rate', 24, 10).nullable() // Restore exchange_rate
      })
      console.log('Restored "exchange_rate" column in payments table as DECIMAL(24,10) NULL.')
    }
    const hasMerchantIdInPayments = await knex.schema.hasColumn('payments', 'merchant_id')
    if (hasMerchantIdInPayments) {
      const paymentsFKInfo = await knex('INFORMATION_SCHEMA.KEY_COLUMN_USAGE')
        .where({
          TABLE_SCHEMA: knex.client.database(),
          TABLE_NAME: 'payments',
          COLUMN_NAME: 'merchant_id',
          REFERENCED_TABLE_NAME: 'merchants',
          REFERENCED_COLUMN_NAME: 'merchant_id'
        })
        .first()
      if (paymentsFKInfo) {
        await knex.schema.table('payments', table => {
          table.dropForeign(['merchant_id'])
        })
        console.log('Dropped foreign key constraint on payments.merchant_id for revert.')
      }
      await knex.schema.table('payments', table => {
        table.string('merchant_id', 255).notNullable().alter()
      })
      console.log('Reverted "merchant_id" column in payments to VARCHAR(255).')
      if (paymentsFKInfo) {
        await knex.schema.table('payments', table => {
          table
            .foreign('merchant_id')
            .references('merchant_id')
            .inTable('merchants')
            .onDelete('CASCADE')
            .onUpdate('CASCADE')
        })
        console.log('Recreated foreign key constraint on payments.merchant_id.')
      }
    }
    // merchants table
    const hasMerchantIdInMerchants = await knex.schema.hasColumn('merchants', 'merchant_id')
    if (hasMerchantIdInMerchants) {
      // Drop all foreign key constraints referencing merchants.merchant_id
      const tablesWithFK = ['payment_buttons', 'ids', 'payments']
      for (const table of tablesWithFK) {
        const fkExists = await knex.schema.hasColumn(table, 'merchant_id')
        if (fkExists) {
          const tableInfo = await knex('INFORMATION_SCHEMA.KEY_COLUMN_USAGE')
            .where({
              TABLE_SCHEMA: knex.client.database(),
              TABLE_NAME: table,
              COLUMN_NAME: 'merchant_id',
              REFERENCED_TABLE_NAME: 'merchants',
              REFERENCED_COLUMN_NAME: 'merchant_id'
            })
            .first()
          if (tableInfo) {
            await knex.schema.table(table, table => {
              table.dropForeign(['merchant_id'])
            })
            console.log(`Dropped foreign key constraint on ${table}.merchant_id.`)
          }
        }
      }
      // Revert merchant_id column
      await knex.schema.table('merchants', table => {
        table.string('merchant_id', 255).alter() // Revert to varchar(255)
      })
      console.log('Reverted "merchant_id" column in merchants to VARCHAR(255).')
      // Recreate foreign key constraints
      for (const table of tablesWithFK) {
        const fkExists = await knex.schema.hasColumn(table, 'merchant_id')
        if (fkExists) {
          await knex.schema.table(table, table => {
            table
              .foreign('merchant_id')
              .references('merchant_id')
              .inTable('merchants')
              .onDelete('CASCADE')
              .onUpdate('CASCADE')
          })
          console.log(`Recreated foreign key constraint on ${table}.merchant_id.`)
        }
      }
    }
    const hasCustomFeeRateInMerchants = await knex.schema.hasColumn('merchants', 'custom_fee_rate')
    if (hasCustomFeeRateInMerchants) {
      await knex.schema.table('merchants', table => {
        table.decimal('custom_fee_rate', 24, 10).unsigned().nullable().alter() // Revert to original
      })
      console.log('Reverted "custom_fee_rate" column in merchants to DECIMAL(24,10) NULL.')
    }
    // admins table
    const hasAdminIdInAdmins = await knex.schema.hasColumn('admins', 'admin_id')
    if (hasAdminIdInAdmins) {
      await knex.schema.table('admins', table => {
        table.string('admin_id', 255).alter() // Revert to varchar(255)
      })
      console.log('Reverted "admin_id" column in admins to VARCHAR(255).')
    }
    // ids table
    const hasMerchantIdInIds = await knex.schema.hasColumn('ids', 'merchant_id')
    if (hasMerchantIdInIds) {
      // Drop the foreign key constraint on ids.merchant_id
      const idsFKInfo = await knex('INFORMATION_SCHEMA.KEY_COLUMN_USAGE')
        .where({
          TABLE_SCHEMA: knex.client.database(),
          TABLE_NAME: 'ids',
          COLUMN_NAME: 'merchant_id'
        })
        .first()
      if (idsFKInfo) {
        await knex.schema.table('ids', table => {
          table.dropForeign(['merchant_id'])
        })
        console.log('Dropped foreign key constraint on ids.merchant_id.')
      }
      // Revert merchant_id column
      await knex.schema.table('ids', table => {
        table.string('merchant_id', 255).alter() // Revert to varchar(255)
      })
      console.log('Reverted "merchant_id" column in ids to VARCHAR(255).')
      // Recreate the foreign key constraint if it references merchants
      if (
        idsFKInfo &&
        idsFKInfo.REFERENCED_TABLE_NAME === 'merchants' &&
        idsFKInfo.REFERENCED_COLUMN_NAME === 'merchant_id'
      ) {
        await knex.schema.table('ids', table => {
          table
            .foreign('merchant_id')
            .references('merchant_id')
            .inTable('merchants')
            .onDelete('CASCADE')
            .onUpdate('CASCADE')
        })
        console.log('Recreated foreign key constraint on ids.merchant_id.')
      }
    }
  } catch (error) {
    console.error('Migration down failed:', error)
    throw error // Re-throw to ensure rollback failure is reported
  }
}
