/**
 * @file server.ts
 *
 * Entry point for the Gateway Payment Server.
 * 
 * This file configures and launches an Express.js server that:
 * - Enables CORS and logs JSON requests/responses
 * - Adds authentication and payment middleware using Wallet Toolbox
 * - Serves static frontend files (SPA) from `build/`
 * - Registers API routes from `src/routes/`
 * - Optionally spawns NGINX and runs database migrations
 *
 * Environment variables:
 * - `HTTP_PORT`: Port the server listens on (default: 3001)
 * - `ROUTING_PREFIX`: Prefix for API routes (default: /api)
 * - `WALLET_STORAGE_URL`: Wallet storage endpoint (required)
 * - `SERVER_PRIVATE_KEY`: Private key for signing wallet requests (required)
 * - `SPAWN_NGINX`: If set to 'yes', starts NGINX and runs DB migrations
 */

import dotenv from 'dotenv'
dotenv.config()

import express, { Request as ExpressRequest, Response, NextFunction, Router } from 'express'
import bodyParser from 'body-parser'
//import prettyjson from 'prettyjson'
import path from 'path'
import knex from 'knex'
import { Setup } from '@bsv/wallet-toolbox'
import { createAuthMiddleware } from '@bsv/auth-express-middleware'
import { createPaymentMiddleware } from '@bsv/payment-express-middleware'
import routes from './routes'

const HTTP_PORT = process.env.HTTP_PORT || 3001
const ROUTING_PREFIX = process.env.ROUTING_PREFIX || '/api'
const SPAWN_NGINX = process.env.SPAWN_NGINX
const WALLET_STORAGE_URL = process.env.WALLET_STORAGE_URL

const app = express()

app.use(bodyParser.json({ limit: '1gb' }))

// CORS headers and preflight response
app.use((req: ExpressRequest, res: Response, next: NextFunction) => {
  res.header('Access-Control-Allow-Origin', '*')
  res.header('Access-Control-Allow-Headers', '*')
  res.header('Access-Control-Allow-Methods', '*')
  res.header('Access-Control-Expose-Headers', '*')
  res.header('Access-Control-Allow-Private-Network', 'true')
  if (req.method === 'OPTIONS') return res.sendStatus(200)
  next()
})

// Response JSON logger (disabled by default, can be enabled for debugging)
app.use((req: ExpressRequest, res: Response, next: NextFunction) => {
  // console.log(`[${req.method}] <- ${req.path}`)
  // console.log(prettyjson.render(req.body ?? {}, { keysColor: 'blue' }))
  const originalJson = res.json.bind(res)
  res.json = (data: any) => {
    originalJson(data)
    // console.log(`[${req.method}] -> ${req.path}`)
    // console.log(prettyjson.render(data, { keysColor: 'green' }))
    return res
  }
  next()
})
;(async () => {

  // Initialize WalletClient
  const wallet = await Setup.createWalletClientNoEnv({
    rootKeyHex: process.env.SERVER_PRIVATE_KEY || '',
    storageUrl: WALLET_STORAGE_URL,
    chain: 'main'
  })

  // Attach authentication middleware (allows unauthenticated requests by default)
  app.use(
    createAuthMiddleware({
      wallet,
      allowUnauthenticated: true // Allow public routes like getStatus; secure others in routes if needed
    })
  )

  // Attach payment middleware with optional custom pricing
  app.use(
    createPaymentMiddleware({
      wallet,
      calculateRequestPrice: async (req: ExpressRequest) => {
        if (req.url.includes('/payment')) {
          // TODO: Configure a custom price calculation as needed.
          return 0
        }
        return 0
      }
    } as unknown as import('@bsv/payment-express-middleware').PaymentMiddlewareOptions)
  )

  // Serve static files and route SPA paths to index.html
  app.use(express.static('build'))
  const spaPaths = ['/', '/buttons', '/payments', '/actions', '/money', '/admin']
  spaPaths.forEach(p => {
    app.get(p, (_, res) => res.sendFile(path.join(__dirname, '../build', 'index.html')))
  })

  // Register API routes
  const apiRouter: Router = express.Router()
  routes.forEach(route => {
    const method = String(route.type || 'get').toLowerCase() as 'get' | 'post' | 'put' | 'delete' | 'patch'
    const handler = route.func || route.handler
    if (typeof apiRouter[method] === 'function') {
      apiRouter[method](route.path, handler)
    }
  })
  app.use(ROUTING_PREFIX, apiRouter)


  // Start the server
  app.listen(HTTP_PORT, async () => {
    console.log('🚀 Gateway Payment Server listening on', HTTP_PORT)
    if (SPAWN_NGINX === 'yes') {
      require('child_process').spawn('nginx', [], { stdio: 'inherit' })
      await knex(require('../knexfile.js')).migrate.latest()
    }
  })
})()
