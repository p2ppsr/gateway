// webpack.site.ts
import { merge } from 'webpack-merge'
import type { Configuration } from 'webpack'
import common from './webpack.common'
import 'dotenv/config'   // ✅ ensure SERVER_IDENTITY_KEY is loaded for site build too

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
  devtool: false
})

export default site
