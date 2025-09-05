import { merge } from 'webpack-merge'
import common from './webpack.common.ts'
import type { Configuration as WebpackConfiguration } from 'webpack'
import type { Configuration as DevServerConfiguration } from 'webpack-dev-server'
import ReactRefreshWebpackPlugin from '@pmmmwh/react-refresh-webpack-plugin'
import 'dotenv/config' // ← still load .env
import path from 'path'

const API_HOST = process.env.API_HOST ?? 'localhost'
const API_PORT = process.env.API_PORT ?? process.env.HTTP_PORT ?? '3001'

const devServer: DevServerConfiguration = {
  open: true,
  port: 3000,
  hot: true, // Enable HMR
  client: {
    overlay: true,
    webSocketURL: { protocol: 'wss', hostname: 'newspaper-investments-demonstrated-mesa.trycloudflare.com', port: 443 },
  },
  allowedHosts: 'all', // accept Cloudflare tunnel host
  static: {
    directory: path.resolve(__dirname, 'public'),
    publicPath: '/',
    watch: true,
    serveIndex: false, // avoid directory index clashing with SPA fallback
  },
  historyApiFallback: {
    index: '/index.html',   // leading slash prevents double send
    disableDotRule: true,   // let paths with dots fall back too
  },
  proxy: [
    {
      context: ['/api', '/.well-known'], // proxy REST + BRC-104
      target: `http://${API_HOST}:${API_PORT}`,
      changeOrigin: true,
      secure: false,
      logLevel: 'debug',
    },
  ],
  watchFiles: {
    paths: ['src/**/*', 'public/**/*'],
    options: {
      ignored: /node_modules|\.DS_Store|.*\.hot-update\.(js|json)/,
      poll: 1000,
    },
  },
}

const developmentConfig: WebpackConfiguration = {
  mode: 'development',
  devtool: 'inline-source-map',
  entry: {
    bundle: './src/index.tsx', // Main app entry
    pay: './src/inject.tsx' // Pay button inject script
  },
  plugins: [new ReactRefreshWebpackPlugin()], // Enable React hot reload
  watchOptions: {
    ignored: /node_modules|\.DS_Store|.*\.hot-update\.(js|json)/, // Ignore noise during watch
    poll: 1000 // Reduce polling frequency
  },
  devServer
}

export default merge<WebpackConfiguration>(common, developmentConfig)
