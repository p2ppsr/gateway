exports.seed = function (knex) {
    // Deletes ALL existing entries
    return knex('server_settings').del()
        .then(() => knex('admins').del())
        .then(() => knex('payments').del())
        .then(() => knex('payment_buttons').del())
        .then(() => knex('merchants').del())
        .then(() => {
            // Inserts seed entries for merchants
            return knex('merchants').insert([
                { merchant_id: 'merchant1', custom_fee_rate: 0.1, welcomed: true, custom_fee: true },
                { merchant_id: 'merchant2', custom_fee_rate: 0.5, welcomed: false, custom_fee: false },
                { merchant_id: 'merchant3', custom_fee_rate: 0, welcomed: true, custom_fee: false }
            ]);
        })
        .then(() => {
            // Inserts seed entries for payment_buttons
            return knex('payment_buttons').insert([
                { button_id: 'button1', amount: 50.00, currency: 'USD', variable_amount: false, merchant_id: 'merchant1', multi_use: false, used: false, total_paid: 0, accepts: 'BSV' },
                { button_id: 'button2', amount: 100.00, currency: 'BSV', variable_amount: true, merchant_id: 'merchant2', multi_use: true, used: true, total_paid: 100.00, accepts: 'both' },
                { button_id: 'button3', amount: 75.00, currency: 'USD', variable_amount: false, merchant_id: 'merchant3', multi_use: false, used: false, total_paid: 0, accepts: 'fiat' }
            ]);
        })
        .then(() => {
            // Inserts seed entries for payments
            return knex('payments').insert([
                { payment_id: 'payment1', merchant_id: 'merchant1', completed: true, transaction_info: 'Transaction 1 info', amount: 50.00, currency: 'USD', exchange_rate: 1, payment_button_id: 'button1' },
                { payment_id: 'payment2', merchant_id: 'merchant2', completed: false, transaction_info: 'Transaction 2 info', amount: 1.00, currency: 'BSV', exchange_rate: 100, payment_button_id: 'button2' }
            ]);
        })
        .then(() => {
            // Inserts seed entries for admins
            return knex('admins').insert([
                { admin_id: 'admin1' },
                { admin_id: 'admin2' }
            ]);
        })
        .then(() => {
            // Inserts seed entries for server settings
            return knex('server_settings').insert([
                { stripe_api_key: 'sk_test_123', sendgrid_credentials: 'sg_test_456', default_fee_rate: 0.5, setup_complete: false }
            ]);
        });
};
