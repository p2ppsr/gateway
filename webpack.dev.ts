import { merge } from "webpack-merge"
import common from "./webpack.common.ts"
import { Configuration } from "webpack"
import "webpack-dev-server"

const developmentConfig: Configuration = {
  mode: "development",
  devServer: {
    open: true,
    port: 3000, // you can change the port
    client: {
      overlay: true, // Show application errors
    },
    historyApiFallback: {
      index: "index.html",
    },
    proxy: {
      '/api': 'http://localhost:3001',
      '/authrite': 'http://localhost:3001'
    },
    static: "./public",
  },
  devtool: "inline-source-map",
}

module.exports = merge<Configuration>(common, developmentConfig)
