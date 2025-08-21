import { Knex } from 'knex';

/**
 * @file migrations/202508211200_add_description_to_payments.ts
 * Adds a 'description' column to the 'payments' table in the 'gateway' database.
 * Populates it with a default value based on payment_id for existing records.
 *
 * Version: v1.0.0 (Generated 2025-08-21 14:30 BST)
 * Depends on: 202508210900_initial.ts
 */
export async function up(knex: Knex): Promise<void> {
  try {
    // Check if the column already exists to avoid duplication
    const hasDescription = await knex.schema.hasColumn('payments', 'description');
    if (!hasDescription) {
      await knex.schema.table('payments', (table) => {
        table.text('description').nullable().defaultTo(null); // Matches payment_buttons.description type
      });
      console.log('Added "description" column to payments table.');

      // Populate description for existing payments using payment_id
      await knex('payments')
        .update({
          description: knex.raw("CONCAT('Payment using paymentId: ', COALESCE(payment_id, ''))")
        })
        .whereNotNull('payment_id');
      console.log('Populated "description" for rows with payment_id.');
    } else {
      console.log('Column "description" already exists in payments table, skipping addition.');
    }
  } catch (error) {
    console.error('Migration up failed:', error);
    throw error; // Re-throw to ensure rollback if needed
  }
}

/**
 * Rollback to remove the 'description' column from the 'payments' table.
 */
export async function down(knex: Knex): Promise<void> {
  try {
    // Check if the column exists before attempting to drop
    const hasDescription = await knex.schema.hasColumn('payments', 'description');
    if (hasDescription) {
      await knex.schema.table('payments', (table) => {
        table.dropColumn('description');
      });
      console.log('Dropped "description" column from payments table.');
    } else {
      console.log('Column "description" does not exist, skipping drop.');
    }
  } catch (error) {
    console.error('Migration down failed:', error);
    throw error; // Re-throw to ensure rollback failure is reported
  }
}