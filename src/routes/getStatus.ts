// newworld/backend/src/routes/getStatus.ts
import knex, { Knex } from 'knex'
import knexConfig from '../../knexfile'
import type { Request, Response } from 'express'

const db: Knex = knex(knexConfig)
const { BSV_NETWORK = 'mainnet' } = process.env

export default {
  type: 'get',
  path: '/getStatus',
  knex: db,

  /** Returns network and admin status */
  func: async (req: Request, res: Response): Promise<void> => {
    try {
      const admin = await db('admins')
        .where({ admin_id: (req as any).authrite?.identityKey })
        .first()

      res.status(200).json({
        status: 'success',
        network: BSV_NETWORK,
        isAdmin: Boolean(admin)
      })
    } catch (err) {
      console.error('Error in /getStatus:', err)
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      })
    }
  }
}
