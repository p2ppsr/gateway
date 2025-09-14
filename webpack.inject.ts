// webpack.inject.ts
import { merge } from 'webpack-merge'
import common from './webpack.common'
import type { Configuration } from 'webpack'

const injectConfig: Configuration = merge(common, {
  mode: 'development',
  entry: './src/inject.tsx',
  output: {
    path: __dirname + '/public',
    filename: 'pay.js',
    publicPath: '/'
  }
})

export default injectConfig
