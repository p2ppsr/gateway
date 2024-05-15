const knex = require('knex')(require('../../knexfile.js'))

module.exports = {
  type: 'post', // Using POST method since this operation changes server state
  path: '/acknowledgePayment',
  knex,
  func: async (req, res) => {
    // Extract the merchant's ID from the authentication context
    const merchantId = req.authrite.identityKey
    // Extract the payment ID from the request body
    const { paymentId } = req.body

    try {
      // Verify the payment exists, is new, and belongs to the merchant
      const payment = await knex('payments')
        .where({
          payment_id: paymentId,
          merchant_id: merchantId,
          is_new: true
        }).first()

      if (!payment) {
        return res.status(404).json({
          status: 'error',
          message: 'Payment not found, already acknowledged, or does not belong to the merchant'
        })
      }

      // Update the payment's is_new status to false
      await knex('payments')
        .where({ payment_id: paymentId })
        .update({ is_new: false })

      // Respond with success
      res.status(200).json({
        status: 'success',
        message: 'Payment acknowledged successfully'
      })
    } catch (error) {
      console.error('Error acknowledging payment:', error)
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      })
    }
  }
}
