// webpack.dev.ts
import { merge } from 'webpack-merge'
import common from './webpack.common.ts'
import type { Configuration as WebpackConfiguration } from 'webpack'
import type { Configuration as DevServerConfiguration } from 'webpack-dev-server'

import 'dotenv/config' // ← still load .env
const API_HOST = process.env.API_HOST ?? 'localhost'
const API_PORT = process.env.API_PORT ?? process.env.HTTP_PORT ?? '3001'

const devServer: DevServerConfiguration = {
  open: true,
  port: 3000,
  client: { overlay: true },
  historyApiFallback: { index: 'index.html' },

  proxy: [
    {
      context: ['/api', '/.well-known'], // proxy REST + BRC-104
      target: `http://${API_HOST}:${API_PORT}`,
      changeOrigin: true
    }
  ],

  static: './public'
}

const developmentConfig: WebpackConfiguration = {
  mode: 'development',
  devtool: 'inline-source-map',
  devServer
}

export default merge<WebpackConfiguration>(common, developmentConfig)
