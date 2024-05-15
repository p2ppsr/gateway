const knex = require('knex')(require('../../knexfile.js'))

module.exports = {
  type: 'post',
  path: '/createButton',
  knex,
  func: async (req, res) => {
    // Extract the merchant's ID from the authentication context
    const merchantId = req.authrite.identityKey

    // Validate the input parameters (basic example)
    const { amount, currency, variableAmount, multiUse, accepts } = req.body
    if (typeof amount !== 'number' || typeof currency !== 'string' || typeof variableAmount !== 'boolean' || typeof multiUse !== 'boolean' || !['BSV', 'fiat', 'both'].includes(accepts)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid parameters'
      })
    }

    try {
      // Check if the merchant exists
      const merchantExists = await knex('merchants').where({ merchant_id: merchantId }).first()
      if (!merchantExists) {
        await knex('merchants').insert({
          merchant_id: merchantId,
          custom_fee_rate: 0, // Default fee rate
          welcomed: false, // Has not been welcomed with a tutorial yet
          custom_fee: false // Uses default fee rate
        })
      }

      // Generate a unique button ID. This is a simplistic approach.
      // Consider using a more robust method for generating unique IDs.
      const buttonId = require('crypto').randomBytes(12).toString('hex')

      // Insert the new button into the database
      await knex('payment_buttons').insert({
        button_id: buttonId,
        amount,
        currency,
        variable_amount: variableAmount,
        merchant_id: merchantId,
        multi_use: multiUse,
        used: false, // New buttons haven't been used
        total_paid: 0, // No payments have been made to the new button yet
        accepts
      })

      // Respond with success
      res.status(200).json({
        status: 'success',
        message: 'Payment button created successfully',
        buttonId
      })
    } catch (error) {
      console.error('Error creating payment button:', error)
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      })
    }
  }
}
