/**
 * @file src/routes/getStatus.ts
 *
 * GET route to return the current server status including:
 * - The active BSV network (e.g. mainnet or testnet).
 * - Whether the authenticated user is an admin.
 *
 * This is used by the frontend to detect environment context
 * and display admin-only UI features when appropriate.
 *
 * Requires authentication middleware to populate `req.auth.identityKey`.
 */

import knex, { Knex } from 'knex'
import knexConfig from '../../knexfile'
import type { Request, Response } from 'express'

const db: Knex = knex(knexConfig)
const { BSV_NETWORK = 'mainnet' } = process.env

export default {
  type: 'get',
  path: '/getStatus',

  /**
   * Express route handler to return current status info.
   *
   * Responds with the active network mode (`BSV_NETWORK`) and a boolean flag
   * indicating whether the caller is a recognized admin in the `admins` table.
   *
   * @param req - Express request, optionally containing `auth.identityKey` from middleware.
   * @param res - Express response to send the network and admin status.
   * @returns {Promise<void>} Sends a 200 success response with `{ network, isAdmin }`.
   */
  func: async (req: Request, res: Response): Promise<void> => {
    try {
      const identityKey = (req as any).auth?.identityKey

      const admin = identityKey ? await db('admins').where({ admin_id: identityKey }).first() : null

      res.status(200).json({
        status: 'success',
        network: BSV_NETWORK,
        isAdmin: Boolean(admin)
      })
    } catch (err) {
      console.error('❌ Error in /getStatus:', err)
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      })
    }
  }
}
