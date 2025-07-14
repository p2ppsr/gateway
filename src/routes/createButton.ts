// newworld/backend/src/routes/createButton.ts
import knex, { Knex } from 'knex'
import knexConfig from '../../knexfile'
import { randomBytes } from 'crypto'
import type { Request, Response } from 'express'

// Initialise once, reuse everywhere
const db: Knex = knex(knexConfig)

export default {
  type: 'post',
  path: '/createButton',
  knex: db,

  /** Create a new payment button */
  func: async (req: Request, res: Response): Promise<void> => {
    // Merchant identity supplied by Authrite middleware
    const merchantId = (req as any).authrite?.identityKey as string

    // Basic payload validation
    const { amount, currency, variableAmount, multiUse, accepts } = req.body
    const validAccepts = ['BSV', 'fiat', 'both']

    if (
      typeof amount !== 'number' ||
      typeof currency !== 'string' ||
      typeof variableAmount !== 'boolean' ||
      typeof multiUse !== 'boolean' ||
      !validAccepts.includes(accepts)
    ) {
      res.status(400).json({ status: 'error', message: 'Invalid parameters' })
      return
    }

    try {
      /* ------------------------------------------------------------------ */
      /* 1. Ensure merchant exists                                           */
      /* ------------------------------------------------------------------ */
      const merchant = await db('merchants')
        .where({ merchant_id: merchantId })
        .first()

      if (!merchant) {
        await db('merchants').insert({
          merchant_id: merchantId,
          custom_fee_rate: 0,
          welcomed: false,
          custom_fee: false
        })
      }

      /* ------------------------------------------------------------------ */
      /* 2. Insert new button                                               */
      /* ------------------------------------------------------------------ */
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

      res.status(200).json({
        status: 'success',
        message: 'Payment button created successfully',
        buttonId
      })
    } catch (err) {
      console.error('Error creating payment button:', err)
      res
        .status(500)
        .json({ status: 'error', message: 'Internal server error' })
    }
  }
}
