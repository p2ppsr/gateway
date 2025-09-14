import path from 'path'
import HtmlWebpackPlugin from 'html-webpack-plugin'
import NodePolyfillPlugin from 'node-polyfill-webpack-plugin'
import CopyWebpackPlugin from 'copy-webpack-plugin'
import webpack, { Configuration } from 'webpack'   // 👈 default import, not named

const common: Configuration = {
  target: 'web',
  output: {
    path: path.join(__dirname, 'dist/public'), // serve from dist/public at runtime
    filename: '[name].js',                      // site config will override to bundle.js
    publicPath: '/',
    clean: true                                 // clear old files each build
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: 'public/index.html',
      filename: 'index.html',
      inject: false
    }),
    new NodePolyfillPlugin(),
    new CopyWebpackPlugin({
      patterns: [
        {
          from: 'public',
          to: '.',
          globOptions: {
            ignore: ['**/index.html']
          }
        }
      ]
    }),
    new webpack.DefinePlugin({
      __SERVER_IDENTITY_KEY__: JSON.stringify(process.env.SERVER_IDENTITY_KEY || '')
    })
  ],
  module: {
    rules: [
      {
        test: /\.(ts|tsx|js|jsx)$/,
        exclude: /node_modules/,
        use: { loader: 'babel-loader' }
      },
      { test: /\.css$/, use: ['style-loader', 'css-loader'] },
      { test: /\.scss$/, use: ['style-loader', 'css-loader', 'sass-loader'] },
      {
        test: /\.(png|jpe?g|gif|svg|webp)$/,
        use: [{ loader: 'url-loader', options: { limit: false } }]
      },
      {
        test: /\.(woff|woff2|eot|ttf)$/,
        use: { loader: 'file-loader', options: { name: 'assets/Fonts/[name].[ext]' } }
      },
      {
        test: /\.(mp3|wav|m4v|flac|aiff)$/,
        use: { loader: 'file-loader', options: { name: 'assets/Music/[name].[ext]' } }
      }
    ]
  },
  resolve: {
    extensions: ['.web.tsx', '.web.ts', '.ts', '.tsx', '.js', '.jsx', '.json'],
    alias: { 'react-native$': 'react-native-web', fs: false }
  }
}

export default common
