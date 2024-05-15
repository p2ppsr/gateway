const knex = require('knex')(require('../../knexfile.js'))

const {
  BSV_NETWORK
} = process.env

module.exports = {
  type: 'get',
  path: '/getStatus',
  knex,
  func: async (req, res) => {
    try {
      const admin = await knex('admins').where({
        admin_id: req.authrite.identityKey
      }).first()
      res.status(200).json({
        status: 'success',
        network: BSV_NETWORK,
        isAdmin: !!admin
      })
    } catch (e) {
      console.error('Error getting status', e)
      res.status(500).json({
        status: 'error',
        message: 'An internal error has occurred.'
      })
    }
  }
}