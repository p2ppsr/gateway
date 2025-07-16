import { Configuration as WebpackConfiguration } from 'webpack'
import { merge } from 'webpack-merge'
import common from './webpack.common'
import 'dotenv/config'

const API_HOST = process.env.API_HOST ?? 'localhost'
const API_PORT = process.env.API_PORT ?? process.env.HTTP_PORT ?? '3001'

const developmentConfig: WebpackConfiguration = {
  mode: 'development',
  devServer: {
    open: true,
    port: 3000,
    client: {
      overlay: true
    },
    historyApiFallback: {
      index: 'index.html'
    },
    proxy: {
      '/api': `http://${API_HOST}:${API_PORT}`
    },
    static: './public'
  },
  devtool: 'inline-source-map'
}

export default merge<WebpackConfiguration>(common, developmentConfig)

