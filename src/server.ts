/**
 * @file src/server.ts
 *
 * Express server setup for the Gateway application.
 * Registers route handlers from the aggregated routes in `src/routes/index.ts`.
 * Configures middleware and starts the server on the specified port.
 */

import dotenv from 'dotenv'
import express, { Request, Response, NextFunction, Router } from 'express'
import bodyParser from 'body-parser'
import path from 'path'
import knex from 'knex'
import { Setup } from '@bsv/wallet-toolbox'
import { AuthRequest, createAuthMiddleware } from '@bsv/auth-express-middleware'
import { createPaymentMiddleware, PaymentMiddlewareOptions } from '@bsv/payment-express-middleware'
import routes from './routes'
import { spawn } from 'child_process'
import knexConfig from '../knexfile'

dotenv.config()

/**
 * Defines the structure of a route handler for the Express server.
 * @interface Route
 * @property {string} type - The HTTP method (e.g., 'get', 'post', 'put', 'delete', 'patch').
 * @property {string} path - The URL path for the route (e.g., '/api/pay').
 * @property {(req: Request | AuthRequest, res: Response) => Promise<void>} func - The primary handler function for the route.
 * @property {(req: Request | AuthRequest, res: Response) => Promise<void>} [handler] - Optional fallback handler function.
 */
interface Route {
  type: string
  path: string
  func: (req: Request | AuthRequest, res: Response) => Promise<void>
  handler?: (req: Request | AuthRequest, res: Response) => Promise<void>
}

/**
 * Configuration options for the payment middleware from `@bsv/payment-express-middleware`.
 * Defined externally in the middleware package.
 * @typedef {import('@bsv/payment-express-middleware').PaymentMiddlewareOptions} PaymentMiddlewareOptions
 */

/**
 * Port for the Express server to listen on.
 * @default 3001
 */
const HTTP_PORT = Number(process.env.HTTP_PORT ?? process.env.PORT ?? '3001')

/**
 * Prefix for API routes.
 * @default '/api'
 */
const ROUTING_PREFIX = process.env.ROUTING_PREFIX ?? '/api'
const BSV_NETWORK = process.env.BSV_NETWORK ?? 'mainnet'
const CHAIN = BSV_NETWORK === 'testnet' || BSV_NETWORK === 'test' ? 'test' : 'main'

/**
 * Flag to spawn NGINX and run database migrations.
 * @default undefined
 */
const SPAWN_NGINX = process.env.SPAWN_NGINX

/**
 * Wallet storage endpoint URL.
 * @default ''
 */
const WALLET_STORAGE_URL = process.env.WALLET_STORAGE_URL ?? ''

const app = express()
const db = knex(knexConfig)

app.use(bodyParser.json({ limit: '1gb' }))

// CORS headers and preflight response
app.use((req: Request, res: Response, next: NextFunction) => {
  res.header('Access-Control-Allow-Origin', '*')
  res.header('Access-Control-Allow-Headers', '*')
  res.header('Access-Control-Allow-Methods', '*')
  res.header('Access-Control-Expose-Headers', '*')
  res.header('Access-Control-Allow-Private-Network', 'true')
  if (req.method === 'OPTIONS') return res.sendStatus(200)
  next()
})

app.get('/healthz', async (_req: Request, res: Response) => {
  let database = 'ok'
  try {
    await db.raw('select 1')
  } catch {
    database = 'error'
  }

  res.status(database === 'ok' ? 200 : 503).json({
    ok: database === 'ok',
    service: 'gateway-app',
    network: BSV_NETWORK,
    chain: CHAIN,
    routingPrefix: ROUTING_PREFIX,
    database
  })
})

// Public frontend assets must bypass BRC-103 payment enforcement. The hardened
// payment middleware intentionally rejects requests that have not completed
// authentication, while the SPA shell and its static assets are public.
app.use(express.static('build'))
const spaPaths = ['/', '/buttons', '/payments', '/actions', '/money', '/admin']
spaPaths.forEach(p => {
  app.get(p, (_, res) => res.sendFile(path.join(__dirname, '../build', 'index.html')))
})

/**
 * Middleware to log JSON requests and responses (disabled by default).
 * @param req - Express request object.
 * @param res - Express response object.
 * @param next - Express next function to pass control to the next middleware.
 */
app.use((req: Request, res: Response, next: NextFunction) => {
  // console.log(`🔍 [${req.method}] <- ${req.path}`)
  // console.log(`🔍 prettyjson.render(req.body ?? {}, { keysColor: 'blue' })`)
  const originalJson = res.json.bind(res)
  res.json = (data: any) => {
    originalJson(data)
    // console.log(`🔍 [${req.method}] -> ${req.path}`)
    // console.log(`🔍 prettyjson.render(data, { keysColor: 'green' })`)
    return res
  }
  next()
})

/**
 * Initializes the Express server, configures middleware, registers routes, and starts listening.
 * @async
 */
// eslint-disable-next-line @typescript-eslint/no-floating-promises
;(async () => {
  // Initialize WalletClient
  try {
    const wallet = await Setup.createWalletClientNoEnv({
      rootKeyHex: process.env.SERVER_PRIVATE_KEY ?? '',
      storageUrl: WALLET_STORAGE_URL,
      chain: CHAIN
    })
    console.log('🔍 Wallet initialized:', wallet)

    /**
     * Attaches authentication middleware to validate requests.
     * Allows unauthenticated requests for public routes like `/getStatus`.
     */
    app.use(createAuthMiddleware({
      wallet,
      allowUnauthenticated: true // Allow public routes like getStatus; secure others in routes if needed
    }))

    /**
     * Attaches payment middleware to handle payment-related logic.
     * Configures custom pricing for requests to '/payment'.
     */
    app.use(
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      createPaymentMiddleware({
        wallet,
        calculateRequestPrice: (req: Request) => {
          if (req.url.includes('/payment')) {
            // TODO: Configure a custom price calculation as needed.
            return 0
          }
          return 0
        }
      } as unknown as PaymentMiddlewareOptions)
    )

    /**
     * Registers API routes from `src/routes/index.ts`.
     * Iterates through route modules and assigns handlers to the appropriate HTTP methods and paths.
     */
    const apiRouter: Router = express.Router()
    try {
      const routeModules = await routes
      routeModules.forEach((route: Route) => {
        console.log(`🔍 Registering route: ${route.type} ${route.path}`)
        const method = String(route.type ?? 'get').toLowerCase() as 'get' | 'post' | 'put' | 'delete' | 'patch'
        const handler = route.func
        if (typeof apiRouter[method] === 'function') {
          apiRouter[method](route.path, (req: Request, res: Response, next: NextFunction) => {
            handler(req, res).catch(next)
          })
        }
      })
      console.log('✅ All routes registered successfully')
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      console.error('❌ Failed to register routes:', message)
      throw new Error(`❌ Failed to register routes: ${message}`)
    }

    app.use(ROUTING_PREFIX, apiRouter)

    await db.migrate.latest()

    /**
     * Starts the Express server and optionally spawns NGINX.
     */
    app.listen(HTTP_PORT, () => {
      console.log('✅ Gateway Payment Server listening on', HTTP_PORT)
      if (SPAWN_NGINX === 'yes') {
        spawn('nginx', [], { stdio: 'inherit' })
      }
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('❌ Failed to initialize wallet:', message)
    throw new Error(`❌ Failed to initialize wallet: ${message}`)
  }
})()
