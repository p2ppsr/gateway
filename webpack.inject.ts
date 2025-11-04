// webpack.inject.ts
import { merge } from 'webpack-merge'
import common from './webpack.common'
import type { Configuration } from 'webpack'
import webpack from 'webpack'
import 'dotenv/config' // ✅ load .env into process.env at build time

const injectConfig: Configuration = merge(common, {
  mode: 'development',
  entry: './src/inject.tsx',
  output: {
    path: __dirname + '/public',
    filename: 'pay.js',
    publicPath: '/'
  },
  plugins: [
    new webpack.DefinePlugin({
      'process.env.HOSTING_DOMAIN': JSON.stringify(process.env.HOSTING_DOMAIN ?? ''),
      'process.env.API_ROUTING_PREFIX': JSON.stringify(process.env.API_ROUTING_PREFIX ?? '/api'),
      'process.env.HTTP_PORT': JSON.stringify(process.env.HTTP_PORT ?? '3001')
    })
  ]
})

export default injectConfig
