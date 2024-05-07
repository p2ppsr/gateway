const knex = require('knex')(require('../../knexfile.js'))

module.exports = {
    type: 'get', // Use GET method for listing resources
    path: '/listPayments',
    knex,
    func: async (req, res) => {
        // Extract merchant ID from authentication context
        const merchantId = req.authrite.identityKey;

        // Extract query parameters for optional filtering by button ID, pagination, and sorting
        const { buttonId, limit = 25, offset = 0, sort = 'desc' } = req.query;

        try {
            // Build the query with mandatory conditions
            let query = knex('payments')
                .where({ merchant_id: merchantId })
                .orderBy('created_at', sort)
                .limit(limit)
                .offset(offset);

            // Optionally filter by button ID if one is provided
            if (buttonId) {
                query = query.andWhere({ payment_button_id: buttonId });
            }

            // Execute the query to get the list of payments
            const payments = await query;

            // Respond with the list of payments
            res.status(200).json({
                status: 'success',
                data: payments.map(x => ({
                    ...x,
                    amount: x.amount.slice(0, -2)
                })),
                message: 'Payments fetched successfully'
            });
        } catch (error) {
            console.error('Error listing payments:', error);
            res.status(500).json({
                status: 'error',
                message: 'Internal server error'
            });
        }
    }
}
