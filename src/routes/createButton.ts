// src/routes/createButton.ts
import knex, { Knex } from 'knex'
import knexConfig from '../../knexfile'
import { randomBytes } from 'crypto'
import type { Request, Response } from 'express'

const db: Knex = knex(knexConfig)

export default {
  type: 'post',
  path: '/createButton',

  /** Create a new payment button */
  func: async (req: Request, res: Response): Promise<void> => {
    const merchantId = (req as any).auth?.identityKey

    const { amount, currency, variableAmount, multiUse, accepts } = req.body
    const validAccepts = ['BSV', 'fiat', 'both']

    if (
      typeof amount !== 'number' ||
      typeof currency !== 'string' ||
      typeof variableAmount !== 'boolean' ||
      typeof multiUse !== 'boolean' ||
      !validAccepts.includes(accepts) ||
      !merchantId
    ) {
      res.status(400).json({ status: 'error', message: 'Invalid parameters' })
      return
    }

    try {
      console.log('🧾 merchantId from auth:', merchantId)

      const merchant = await db('merchants').where({ merchant_id: merchantId }).first()

      console.log('🔍 Merchant exists?', Boolean(merchant))

      if (!merchant) {
        await db('merchants').insert({
          merchant_id: merchantId,
          custom_fee_rate: 0,
          welcomed: false,
          custom_fee: false
        })

        console.log('✅ Inserted new merchant')
      }

      const buttonId = randomBytes(12).toString('hex')

      await db('payment_buttons').insert({
        button_id: buttonId,
        amount,
        currency,
        variable_amount: variableAmount,
        merchant_id: merchantId,
        multi_use: multiUse,
        used: false,
        total_paid: 0,
        accepts
      })

      console.log('✅ Inserted payment button:', buttonId)

      res.status(200).json({
        status: 'success',
        message: 'Payment button created successfully',
        buttonId
      })
    } catch (err) {
      console.error('💥 Error creating payment button:', err)
      res.status(500).json({ status: 'error', message: 'Internal server error' })
    }
  }
}
