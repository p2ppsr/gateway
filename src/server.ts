/**
 * @file src/server.ts
 *
 * Express server setup for the Gateway application.
 * Registers route handlers from the aggregated routes in `src/routes/index.ts`.
 * Configures middleware and starts the server on the specified port.
 * Includes security enhancements with Helmet and rate limiting (disabled for testing).
 * Updated to handle route handlers returning Promise<void | Response> and reflect new schema.
 * Added security check for max payment allowed (10000 sats) in payment middleware.
 * Relaxed authentication for testing purposes.
 * Added table existence check to prevent migration errors.
 * Added /api/resetState to clear database state for session and ID issues.
 *
 * Version: v1.8 (Updated 18Aug2025_1004 BST to add /api/resetState for stale ID cleanup)
 */
const F = 'server';
import dotenv from 'dotenv';
import express, { Request, Response, NextFunction, Router } from 'express';
import bodyParser from 'body-parser';
import path from 'path';
import { Setup } from '@bsv/wallet-toolbox';
import { AuthRequest, createAuthMiddleware } from '@bsv/auth-express-middleware';
import { createPaymentMiddleware } from '@bsv/payment-express-middleware';
import routes from './routes';
import { spawn } from 'child_process';
import knex from 'knex';
import knexConfig from '../knexfile';
import helmet from 'helmet';
import { MAX_PAYMENT_SATS } from './utils/constants';
import { logWithTimestamp } from './utils/logging';
import util from 'util';
dotenv.config();

interface Route {
  type: string;
  path: string;
  func: (req: Request | AuthRequest, res: Response) => Promise<void | Response>;
  handler?: (req: Request | AuthRequest, res: Response) => Promise<void | Response>;
}

const HTTP_PORT = Number(process.env.HTTP_PORT ?? '3001');
const ROUTING_PREFIX = process.env.ROUTING_PREFIX ?? '/api';
const SPAWN_NGINX = process.env.SPAWN_NGINX;
const WALLET_STORAGE_URL = process.env.WALLET_STORAGE_URL ?? '';
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN ?? 'http://localhost:3000';

const app = express();
app.use(bodyParser.json({ limit: '1gb' }));
app.use((req: Request, res: Response, next: NextFunction) => {
  res.header('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.header('Access-Control-Allow-Headers', '*');
  res.header('Access-Control-Allow-Methods', '*');
  res.header('Access-Control-Expose-Headers', '*');
  res.header('Access-Control-Allow-Private-Network', 'true');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});
app.use((req: Request, res: Response, next: NextFunction) => {
  const originalJson = res.json.bind(res);
  res.json = (data: any) => {
    originalJson(data);
    return res;
  };
  next();
});

(async () => {
  let db: knex.Knex;
  try {
    db = knex(knexConfig);
    logWithTimestamp(F, '🔍 [server] Knex instance created');
    // Check if 'admins' table exists before running migrations
    const tableExists = await db.schema.hasTable('admins');
    if (tableExists) {
      logWithTimestamp(F, '✅ [server] Admins table exists, skipping migrations');
    } else {
      logWithTimestamp(F, '🔍 [server] Running migrations');
      await db.migrate.latest();
      logWithTimestamp(F, '✅ [server] Migrations applied successfully');
    }

    const wallet = await Setup.createWalletClientNoEnv({
      rootKeyHex: process.env.SERVER_PRIVATE_KEY ?? '',
      storageUrl: WALLET_STORAGE_URL,
      chain: 'main'
    });
    logWithTimestamp(F, '🔍 [server] Wallet initialized:', util.inspect(wallet, { depth: 2, colors: true }));
    if (!process.env.SERVER_PRIVATE_KEY || process.env.SERVER_PRIVATE_KEY.length !== 64) {
      throw new Error('❌ SERVER_PRIVATE_KEY is missing or invalid (must be 64 hex characters)');
    }

    app.use(
      createAuthMiddleware({
        wallet,
        allowUnauthenticated: true
      })
    );
    logWithTimestamp(F, '[server] Auth middleware applied, wallet attached to req:', {
      walletAttached: !!wallet
    });

    app.use(
      createPaymentMiddleware({
        wallet,
        calculateRequestPrice: (req: Request) => {
          if (req.url.includes('/payment')) {
            const amount = parseInt(req.body?.amount as string) || 0;
            if (amount > MAX_PAYMENT_SATS) {
              throw new Error(`❌ Payment amount (${amount} sats) exceeds maximum allowed (${MAX_PAYMENT_SATS} sats)`);
            }
            return 0;
          }
          return 0;
        }
      } as any)
    );

    app.use(express.static('build'));
    const spaPaths = ['/', '/buttons', '/payments', '/actions', '/money', '/admin'];
    spaPaths.forEach(p => {
      app.get(p, (_, res) => res.sendFile(path.join(__dirname, '../build', 'index.html')));
    });

    const apiRouter: Router = express.Router();
    try {
      const routeModules = await routes;
      routeModules.forEach((route: any) => {
        if (typeof route?.type === 'string' && typeof route?.path === 'string' && typeof route?.func === 'function') {
          const method = route.type.toLowerCase() as 'get' | 'post';
          const fullPath = `${ROUTING_PREFIX}${route.path}`;
          logWithTimestamp(F, `🔍 [server] Registering route: ${method.toUpperCase()} ${fullPath}`);
          const handler = route.func;
          if (typeof apiRouter[method] === 'function') {
            apiRouter[method](route.path, (req: Request, res: Response, next: NextFunction) => {
              handler(req, res).catch(next);
            });
          }
        }
      });
      logWithTimestamp(F, '✅ [server] All routes registered successfully');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.error('❌ [server] Failed to register routes:', message);
      throw new Error(`❌ Failed to register routes: ${message}`);
    }

    // Add /api/resetState to clear database state
    app.post('/api/resetState', async (req: Request, res: Response) => {
      try {
        const { merchantId } = req.body;
        if (!merchantId) {
          return res.status(400).json({ status: 'error', message: 'Merchant ID required' });
        }
        await db('ids').where({ merchant_id: merchantId }).delete();
        await db('payment_buttons').where({ merchant_id: merchantId }).delete();
        await db('payments').where({ merchant_id: merchantId }).delete();
        logWithTimestamp(F, '[server] Database state reset for merchant:', merchantId);
        res.json({ status: 'success', message: 'Database state reset' });
      } catch (err) {
        console.error(`[${new Date().toISOString()}] [server] ❌ Failed to reset database state:`, err);
        res.status(500).json({ status: 'error', message: 'Failed to reset database state' });
      }
    });

    app.use(ROUTING_PREFIX, apiRouter);

    // Placeholder routes for missing endpoints
    app.post('/.well-known/auth', (req, res) => {
      logWithTimestamp(F, '🔍 [server] Handling /.well-known/auth', {
        body: req.body,
        headers: req.headers,
        nonce: req.body.nonce || 'missing'
      });
      res.json({ status: 'ok', token: 'placeholder-auth-token', nonce: req.body.nonce || 'missing' });
    });

    app.get('/api/getStatus', (req: Request, res: Response) => {
      logWithTimestamp(F, '🔍 [server] Handling /api/getStatus');
      res.json({ status: 'ok', paymentStatus: 'pending' });
    });

    app.use((req: Request, res: Response, next: NextFunction) => {
      logWithTimestamp(F, `🔍 [server] Unhandled request: ${req.method} ${req.url}`);
      res.status(404).send('Not Found');
    });

    app.use((err: any, req: Request, res: Response, next: NextFunction) => {
      if (err.code === 'ER_BAD_FIELD_ERROR') {
        console.error('❌ [server] Database schema error:', err.message);
        res.status(500).json({
          status: 'error',
          message: 'Database schema mismatch, please update route handlers to use new schema'
        });
      } else {
        console.error('❌ [server] Server error:', err);
        res.status(500).json({ status: 'error', message: '❌ Internal server error' });
      }
    });

    app.listen(HTTP_PORT, () => {
      logWithTimestamp(F, '✅ [server] Gateway Payment Server listening on', HTTP_PORT);
      if (SPAWN_NGINX === 'yes') {
        spawn('nginx', [], { stdio: 'inherit' });
      }
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '❌ Unknown error';
    console.error('❌ [server] Failed to initialize server:', message);
    throw new Error(`❌ Failed to initialize server: ${message}`);
  }
})();