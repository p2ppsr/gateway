import { merge } from 'webpack-merge';
import common from './webpack.common';
import { Configuration } from 'webpack';

module.exports = merge<Configuration>(common, {
  mode: 'production',
  entry: {
    bundle: './src/index.tsx', // Main app entry
    pay: './src/inject.tsx',   // Pay button inject script
  },
  output: {
    filename: '[name].[contenthash].js', // Add content hash for caching
  },
});