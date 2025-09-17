// webpack.prod.ts
import { merge } from 'webpack-merge'
import common from './webpack.common'
import type { Configuration } from 'webpack'
import 'dotenv/config' // ✅ load .env.production when NODE_ENV=production

module.exports = merge<Configuration>(common, {
  mode: 'production',
  entry: {
    bundle: './src/index.tsx', // Main app entry
    pay: './src/inject.tsx' // Pay button inject script
  },
  output: {
    filename: '[name].[contenthash].js'
  }
})
