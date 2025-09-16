// webpack.site.ts
import { merge } from 'webpack-merge'
import type { Configuration } from 'webpack'
import webpack from 'webpack'
import common from './webpack.common'
import 'dotenv/config'   // ✅ ensures .env is loaded into process.env during build

const site: Configuration = merge(common, {
  mode: 'production',
  entry: './src/index.tsx',
  output: {
    filename: 'bundle.js' // match what index.html expects
  },
  optimization: {
    splitChunks: false,
    runtimeChunk: false
  },
  performance: { hints: false },
  devtool: false,
  plugins: [
    new webpack.DefinePlugin({
      'process.env.HOSTING_DOMAIN': JSON.stringify(process.env.HOSTING_DOMAIN || ''),
      'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'production'),
    }),
  ],
})

export default site
