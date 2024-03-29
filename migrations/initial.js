exports.up = function (knex) {
    return knex.schema
        // Merchants table
        .createTable('merchants', table => {
            table.string('merchant_id').primary();
            table.decimal('custom_fee_rate', 24, 10).unsigned().defaultTo(0).comment('Custom fee rate percentage, from 0 to 100');
            table.boolean('welcomed').defaultTo(false).comment('Whether the merchant has been welcomed with a tutorial');
            table.boolean('custom_fee').defaultTo(false).comment('Whether the merchant gets a custom fee rate');
            table.timestamps(true, true); // Create and update timestamps
        })
        // Payment Buttons table
        .createTable('payment_buttons', table => {
            table.string('button_id').primary();
            table.decimal('amount', 24, 10); // Assuming a precision that should cover most use cases
            table.string('currency');
            table.boolean('variable_amount').defaultTo(false);
            table.string('merchant_id').references('merchant_id').inTable('merchants').onDelete('CASCADE');
            table.boolean('multi_use').defaultTo(false);
            table.boolean('used').defaultTo(false);
            table.decimal('total_paid', 24, 10).defaultTo(0);
            table.enum('accepts', ['BSV', 'fiat', 'both']);
            table.timestamps(true, true);
        })
        // Payments table
        .createTable('payments', table => {
            table.string('payment_id').primary();
            table.string('from')
            table.string('merchant_id').references('merchant_id').inTable('merchants').onDelete('CASCADE');
            table.boolean('completed').defaultTo(false);
            table.boolean('is_new').defaultTo(false); // Set to true when paid, not when created
            table.text('transaction_info', 'longtext');
            table.decimal('amount', 24, 10);
            table.string('currency');
            table.decimal('exchange_rate', 24, 10);
            table.string('payment_button_id').references('button_id').inTable('payment_buttons').onDelete('CASCADE');
            table.timestamps(true, true);
        })
        // Admins table
        .createTable('admins', table => {
            table.string('admin_id').primary();
            table.timestamps(true, true);
        })
        // Server Settings table
        .createTable('server_settings', table => {
            table.increments('id').primary();
            table.string('stripe_api_key');
            table.text('sendgrid_credentials');
            table.decimal('default_fee_rate', 24, 10).unsigned().defaultTo(0);
            table.boolean('setup_complete').defaultTo(false);
            table.timestamps(true, true);
        });
};

exports.down = function (knex) {
    return knex.schema
        .dropTableIfExists('server_settings')
        .dropTableIfExists('admins')
        .dropTableIfExists('payments')
        .dropTableIfExists('payment_buttons')
        .dropTableIfExists('merchants');
};
