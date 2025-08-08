/**
 * @file src/server.ts
 *
 * Express server setup for the Gateway application.
 * Registers route handlers from the aggregated routes in `src/routes/index.ts`.
 * Configures middleware and starts the server on the specified port.
 * Includes security enhancements with Helmet and rate limiting.
 * Updated to handle route handlers returning Promise<void | Response>.
 *
 * Version: v1.1 (Updated 05Aug2025_0335 BST to add request logging and fix routing debug)
 */
import dotenv from 'dotenv'
import express, { Request, Response, NextFunction, Router } from 'express'
import bodyParser from 'body-parser'
import path from 'path'
import knex from 'knex'
import { Setup } from '@bsv/wallet-toolbox'
import { AuthRequest, createAuthMiddleware } from '@bsv/auth-express-middleware'
import { createPaymentMiddleware } from '@bsv/payment-express-middleware'
import routes from './routes'
import { spawn } from 'child_process'
import knexConfig from '../knexfile'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
dotenv.config()

interface Route {
  type: string
  path: string
  func: (req: Request | AuthRequest, res: Response) => Promise<void | Response>
  handler?: (req: Request | AuthRequest, res: Response) => Promise<void | Response>
}

const HTTP_PORT = Number(process.env.HTTP_PORT ?? '3001')
const ROUTING_PREFIX = process.env.ROUTING_PREFIX ?? '/api'
const SPAWN_NGINX = process.env.SPAWN_NGINX
const WALLET_STORAGE_URL = process.env.WALLET_STORAGE_URL ?? ''
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN ?? 'http://localhost:3000'

const app = express()
const db = knex(knexConfig)

app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: 'Too many requests from this IP, please try again after 15 minutes',
    standardHeaders: true,
    legacyHeaders: false
  })
)
console.log('🔍 Rate limiting applied: 100 requests per 15 minutes per IP')

app.use(helmet())
console.log('🔍 Helmet security headers applied')

app.use(bodyParser.json({ limit: '1gb' }))

app.use((req: Request, res: Response, next: NextFunction) => {
  res.header('Access-Control-Allow-Origin', ALLOWED_ORIGIN)
  res.header('Access-Control-Allow-Headers', '*')
  res.header('Access-Control-Allow-Methods', '*')
  res.header('Access-Control-Expose-Headers', '*')
  res.header('Access-Control-Allow-Private-Network', 'true')
  if (req.method === 'OPTIONS') return res.sendStatus(200)
  next()
})

app.use((req: Request, res: Response, next: NextFunction) => {
  const originalJson = res.json.bind(res)
  res.json = (data: any) => {
    originalJson(data)
    return res
  }
  next()
})
;(async () => {
  try {
    await db.migrate.latest()
    console.log('✅ Migrations applied successfully')
    const wallet = await Setup.createWalletClientNoEnv({
      rootKeyHex: process.env.SERVER_PRIVATE_KEY ?? '',
      storageUrl: WALLET_STORAGE_URL,
      chain: 'main'
    })
    console.log('🔍 Wallet initialized:', wallet)
    if (!process.env.SERVER_PRIVATE_KEY || process.env.SERVER_PRIVATE_KEY.length !== 64) {
      throw new Error('❌ SERVER_PRIVATE_KEY is missing or invalid (must be 64 hex characters)')
    }
    app.use(
      createAuthMiddleware({
        wallet,
        allowUnauthenticated: true
      })
    )
    app.use(
      createPaymentMiddleware({
        wallet,
        calculateRequestPrice: (req: Request) => {
          if (req.url.includes('/payment')) {
            return 0
          }
          return 0
        }
      } as any)
    )
    app.use(express.static('build'))
    const spaPaths = ['/', '/buttons', '/payments', '/actions', '/money', '/admin']
    spaPaths.forEach(p => {
      app.get(p, (_, res) => res.sendFile(path.join(__dirname, '../build', 'index.html')))
    })
    const apiRouter: Router = express.Router()
    try {
      const routeModules = await routes
      routeModules.forEach((route: any) => {
        if (typeof route?.type === 'string' && typeof route?.path === 'string' && typeof route?.func === 'function') {
          const method = route.type.toLowerCase() as 'get' | 'post'
          const fullPath = `${ROUTING_PREFIX}${route.path}`
          console.log(`🔍 Registering route: ${method.toUpperCase()} ${fullPath}`)
          const handler = route.func
          if (typeof apiRouter[method] === 'function') {
            apiRouter[method](route.path, (req: Request, res: Response, next: NextFunction) => {
              handler(req, res).catch(next)
            })
          }
        }
      })
      console.log('✅ All routes registered successfully')
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      console.error('❌ Failed to register routes:', message)
      throw new Error(`❌ Failed to register routes: ${message}`)
    }
    app.use(ROUTING_PREFIX, apiRouter)

    // Catch-all middleware to log unhandled requests
    app.use((req: Request, res: Response, next: NextFunction) => {
      console.log(`🔍 [server] Unhandled request: ${req.method} ${req.url}`)
      res.status(404).send('Not Found')
    })

    app.use((err: any, req: Request, res: Response, next: NextFunction) => {
      if (err.code === 'ER_BAD_FIELD_ERROR') {
        console.error('❌ Database schema error:', err.message)
        res.status(500).json({ status: 'error', message: 'Database schema issue, please run migrations' })
      } else {
        console.error('❌ Server error:', err)
        res.status(500).json({ status: 'error', message: 'Internal server error' })
      }
    })

    app.listen(HTTP_PORT, () => {
      console.log('✅ Gateway Payment Server listening on', HTTP_PORT)
      if (SPAWN_NGINX === 'yes') {
        spawn('nginx', [], { stdio: 'inherit' })
      }
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('❌ Failed to initialize server:', message)
    throw new Error(`❌ Failed to initialize server: ${message}`)
  }
})()
