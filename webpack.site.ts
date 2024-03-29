const { merge } = require('webpack-merge')
const common = require('./webpack.common.ts')

module.exports = merge(common, {
  mode: 'production'
})
