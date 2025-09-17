// webpack.dev.ts
import { merge } from "webpack-merge";
import common from "./webpack.common.ts";
import type { Configuration as WebpackConfiguration } from "webpack";
import type { Configuration as DevServerConfiguration } from "webpack-dev-server";
import ReactRefreshWebpackPlugin from "@pmmmwh/react-refresh-webpack-plugin";
import "dotenv/config";
import path from "path";

const API_HOST = process.env.API_HOST ?? "localhost";
const API_PORT = process.env.API_PORT ?? process.env.HTTP_PORT ?? "3001";

const devServer: DevServerConfiguration = {
  open: true,
  port: 3000,
  hot: true,
  client: {
    overlay: true,
    webSocketURL: {
      protocol: "ws",
      hostname: "localhost",
      port: 3000,
    },
  },
  allowedHosts: "all",
  static: {
    directory: path.resolve(__dirname, "public"),
    publicPath: "/",
    watch: true,
    serveIndex: false,
  },
  historyApiFallback: {
    index: "/index.html",
    disableDotRule: true,
  },
  proxy: [
    {
      context: ["/api", "/.well-known"],
      target: `http://${API_HOST}:${API_PORT}`,
      changeOrigin: true,
      secure: false,
      logLevel: "debug",
    },
  ],
  watchFiles: {
    paths: ["src/**/*", "public/**/*"],
    options: {
      ignored: /node_modules|\.DS_Store|.*\.hot-update\.(js|json)/,
      poll: 1000,
    },
  },
};

const developmentConfig: WebpackConfiguration = {
  mode: "development",
  devtool: "inline-source-map",
  entry: {
    bundle: "./src/index.tsx",
    pay: "./src/inject.tsx",
  },
  output: {
    path: path.resolve(__dirname, "dist/public"),
    filename: "[name].js",
    publicPath: "/",
    clean: true,
  },
  plugins: [new ReactRefreshWebpackPlugin()],
  watchOptions: {
    ignored: /node_modules|\.DS_Store|.*\.hot-update\.(js|json)/,
    poll: 1000,
  },
  devServer,
};

export default merge<WebpackConfiguration>(common, developmentConfig);
