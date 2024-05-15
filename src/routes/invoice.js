const knex = require('knex')(require('../../knexfile.js'))
const { getPaymentAddress } = require('sendover')
const SDK = require('@bsv/sdk')

module.exports = {
  type: 'post',
  path: '/invoice',
  knex,
  func: async (req, res) => {
    // Extract the necessary information from the request body
    const { paymentButtonId, merchantId, currency, amount } = req.body

    try {
      // Verify the payment button exists and belongs to the specified merchant
      const button = await knex('payment_buttons')
        .where({
          button_id: paymentButtonId,
          merchant_id: merchantId
        }).first()

      if (!button) {
        return res.status(404).json({
          status: 'error',
          message: 'Payment button not found for the specified merchant'
        })
      }

      // Verify the button has not already been used if it is a single-use button
      if (!button.multi_use && button.used) {
        return res.status(400).json({
          status: 'error',
          message: 'This single-use button has already been used'
        })
      }

      // Verify the amount matches or the button is variable
      if (
        !button.variable_amount &&
        (amount !== button.amount || currency !== button.currency)
      ) {
        return res.status(400).json({
          status: 'error',
          message: 'Amount and/or currency mismatch for fixed-amount button.'
        })
      }

      // Create a new payment with complete=false
      const paymentID = require('crypto').randomBytes(12).toString('hex')
      await knex('payments').insert({
        payment_id: paymentID,
        merchant_id: merchantId,
        completed: false,
        from: req.authrite.identityKey,
        transaction_info: '',
        amount,
        currency,
        exchange_rate: 1, // Placeholder, calculate the actual exchange rate as needed
        payment_button_id: paymentButtonId
      })

      const derivedPublicKey = getPaymentAddress({
        senderPrivateKey: '0000000000000000000000000000000000000000000000000000000000000001',
        recipientPublicKey: button.merchant_id,
        invoiceNumber: `2-3241645161d8-${paymentID} 1`,
        returnType: 'publicKey'
      })

      const pkh = new SDK.P2PKH()
      const derivedScript = pkh.lock(SDK.PublicKey.fromString(derivedPublicKey).toHash()).toHex()

      // Respond with the payment ID
      res.status(200).json({
        status: 'success',
        message: 'Invoice created successfully',
        paymentId: paymentID,
        outputs: [{
          script: derivedScript,
          satoshis: Math.round(amount * 100000000)
        }]
      })

    } catch (error) {
      console.error('Error creating invoice:', error)
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      })
    }
  }
}
