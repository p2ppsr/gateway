// webpack.demo.js
const path = require('path')
const webpack = require('webpack')

module.exports = {
  mode: 'development',
  entry: {
    demoIdsAuth1: path.resolve(__dirname, 'demo/demoIdsAuth.tsx'),
  },
  output: {
    path: path.resolve(__dirname, 'public'),
    filename: '[name].js',
    clean: false,
  },
  devtool: 'source-map',
  resolve: {
    extensions: ['.tsx', '.ts', '.js'],
    fallback: {
      crypto: require.resolve('crypto-browserify'),
      https: require.resolve('https-browserify'),
      buffer: require.resolve('buffer/'),
      process: require.resolve('process/browser'),
      stream: require.resolve('stream-browserify'),
      http: require.resolve('stream-http'),
      vm: require.resolve('vm-browserify'),
      util: require.resolve('util/'),
      assert: require.resolve('assert/'),
      path: require.resolve('path-browserify'),
      url: require.resolve('url/'),
      os: require.resolve('os-browserify/browser'),
      zlib: require.resolve('browserify-zlib'),
    },
  },
  module: {
    rules: [
      { test: /\.tsx?$/, loader: 'ts-loader', options: { transpileOnly: true }, exclude: /node_modules/ },
    ],
  },
  plugins: [
    new webpack.ProvidePlugin({
      Buffer: ['buffer', 'Buffer'],
      process: ['process'],
    }),
  ],
}
