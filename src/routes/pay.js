const knex = require('knex')(require('../../knexfile.js'))
const SDK = require('@bsv/sdk')
const { getPaymentAddress } = require('sendover')

module.exports = {
  type: 'post',
  path: '/pay',
  knex,
  func: async (req, res) => {
    // Extract the necessary information from the request body
    const { paymentId, transaction } = req.body

    try {
      // Verify the payment exists and has not been completed
      const payment = await knex('payments')
        .where({
          payment_id: paymentId,
          completed: false
        }).first()

      if (!payment) {
        return res.status(404).json({
          status: 'error',
          message: 'Payment not found or already completed'
        })
      }

      if (payment.from !== req.authrite.identityKey) {
        return res.status(401).json({
          status: 'error',
          message: 'Payment not originated by the same user'
        })
      }

      // Verify the associated button has not been marked as used if it is single-use
      const button = await knex('payment_buttons')
        .where({
          button_id: payment.payment_button_id
        }).first()

      if (!button.multi_use && button.used) {
        return res.status(400).json({
          status: 'error',
          message: 'The single-use button has already been used'
        })
      }

      // !!! BIG TODO: Verify transaction SPV data!
      // ChainTracks or similar needs to be used to prevent double spends.

      // Verify transaction output script
      const derivedPublicKey = getPaymentAddress({
        senderPrivateKey: '0000000000000000000000000000000000000000000000000000000000000001',
        recipientPublicKey: button.merchant_id,
        invoiceNumber: `2-3241645161d8-${payment.payment_id} 1`,
        returnType: 'publicKey'
      })
      const expectedAmount = Math.round(payment.amount * 100000000)

      const pkh = new SDK.P2PKH()
      const derivedScript = pkh.lock(SDK.PublicKey.fromString(derivedPublicKey).toHash()).toHex()
      const parsedTXEnvelope = JSON.parse(transaction)
      const bsvtx = SDK.Transaction.fromHex(parsedTXEnvelope.rawTx)
      if (!bsvtx.outputs.some(x => x.lockingScript.toHex() === derivedScript && x.satoshis === expectedAmount)) {
        return res.status(400).json({
          status: 'error',
          message: 'The transaction does not satisfy the invoice'
        })
      }

      // If checks pass, update the payment as completed and the button as used
      await knex.transaction(async trx => {
        // Set the payment as completed
        await trx('payments')
          .where({ payment_id: paymentId })
          .update({
            completed: true,
            transaction_info: transaction,
            is_new: true
          })

        // Mark the button as used and increment the total amount paid to this button
        await trx('payment_buttons')
          .where({ button_id: payment.payment_button_id })
          .update({
            used: true,
            total_paid: knex.raw('?? + ?', ['total_paid', payment.amount])
          })
      })

      // Respond with success
      res.status(200).json({
        status: 'success',
        message: 'Payment completed successfully'
      })
    } catch (error) {
      console.error('Error processing payment:', error)
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      })
    }
  }
}
