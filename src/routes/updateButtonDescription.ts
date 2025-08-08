/**
 * @file src/routes/updateButtonDescription.ts
 * @description Handles the /api/updateButtonDescription endpoint to update the description of a payment button.
 *
 * This route accepts a POST request with a JSON body containing `buttonId` and `description`.
 * It updates the corresponding payment button's description in the database using Knex.
 *
 * Version: v1.0 (Created 04Aug2025_0310 BST)
 */

import { Request, Response } from 'express'
import { Knex } from 'knex'

/**
 * Updates the description of a payment button in the database.
 * @param req - Express request object with buttonId and description in the body
 * @param res - Express response object
 * @returns Promise<void | Response> - Resolves with a JSON response
 */
export default async (req: Request, res: Response): Promise<void | Response> => {
  const { buttonId, description } = req.body
  const db = req.app.get('db') as Knex // Access the Knex instance from the app

  try {
    if (!buttonId || !description) {
      return res.status(400).json({ status: 'error', message: 'buttonId and description are required' })
    }

    // Update the payment_buttons table
    const result = await db('payment_buttons').where({ button_id: buttonId }).update({ description })

    if (result === 0) {
      return res.status(404).json({ status: 'error', message: 'Button not found' })
    }

    res.status(200).json({ status: 'success' })
  } catch (error) {
    console.error('Error updating button description:', error)
    res.status(500).json({ status: 'error', message: error instanceof Error ? error.message : 'Internal server error' })
  }
}
