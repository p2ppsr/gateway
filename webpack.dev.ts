import { merge } from 'webpack-merge';
import common from './webpack.common.ts';
import type { Configuration as WebpackConfiguration } from 'webpack';
import type { Configuration as DevServerConfiguration } from 'webpack-dev-server';
import ReactRefreshWebpackPlugin from '@pmmmwh/react-refresh-webpack-plugin';
import 'dotenv/config'; // ← still load .env

const API_HOST = process.env.API_HOST ?? 'localhost';
const API_PORT = process.env.API_PORT ?? process.env.HTTP_PORT ?? '3001';

const devServer: DevServerConfiguration = {
  open: true,
  port: 3000,
  hot: true, // Enable HMR
  client: { overlay: true },
  historyApiFallback: { index: 'index.html' },
  proxy: [
    {
      context: ['/api', '/.well-known'], // proxy REST + BRC-104
      target: `http://${API_HOST}:${API_PORT}`,
      changeOrigin: true,
    },
  ],
  static: './public',
  watchFiles: {
    paths: ['src/**/*', 'public/**/*'],
    options: {
      ignored: /node_modules|\.DS_Store|.*\.hot-update\.(js|json)/, // Ignore noise files and HMR artifacts
      poll: 1000, // Poll every 1 second to reduce sensitivity
    },
  },
};

const developmentConfig: WebpackConfiguration = {
  mode: 'development',
  devtool: 'inline-source-map',
  entry: {
    bundle: './src/index.tsx', // Main app entry
    pay: './src/inject.tsx',   // Pay button inject script
  },
  plugins: [new ReactRefreshWebpackPlugin()], // Enable React hot reload
  watchOptions: {
    ignored: /node_modules|\.DS_Store|.*\.hot-update\.(js|json)/, // Ignore noise during watch
    poll: 1000, // Reduce polling frequency
  },
  devServer,
};

export default merge<WebpackConfiguration>(common, developmentConfig);