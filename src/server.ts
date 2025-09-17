// src/server.ts
/**
 * @file src/server.ts
 * @description Express server entrypoint for the Gateway application.
 *
 * Middleware sequencing is carefully ordered:
 * 1. Parse request body (JSON, urlencoded, raw)
 * 2. Apply security headers (Helmet) and rate limiting
 * 3. Expose /healthz raw (no auth, no headers)
 * 4. Run authentication middleware
 * 5. Apply CORS headers
 * 6. Apply payment middleware
 * 7. Serve static assets (including pay.js under CONFIG.PAY_BASE)
 * 8. Register API routes under ROUTING_PREFIX
 *
 * @version 1.10.4 (Updated 13Sep2025_UTC: fixed body parsing order for /.well-known and authMiddleware order)
 * @author xAI
 */

const F = "server";

import fs from "fs";
import dotenv from "dotenv";
dotenv.config();

import express, { Request, Response, NextFunction, Router } from "express";
import bodyParser from "body-parser";
import path from "path";
import knex from "knex";
import { Setup } from "@bsv/wallet-toolbox";
import {
  AuthRequest,
  createAuthMiddleware,
} from "@bsv/auth-express-middleware";
import { createPaymentMiddleware } from "@bsv/payment-express-middleware";
import routes from "./routes";
import knexConfig from "./knexfile";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { CONFIG, MAX_PAYMENT_SATS } from "./utils/constants";
import { logWithTimestamp } from "./utils/logging";
import util from "util";

interface Route {
  type: string;
  path: string;
  func: (req: Request | AuthRequest, res: Response) => Promise<void | Response>;
  handler?: (
    req: Request | AuthRequest,
    res: Response,
  ) => Promise<void | Response>;
}

// ------------------ env / config ------------------
const HTTP_PORT = Number(process.env.HTTP_PORT ?? "3001");
const ROUTING_PREFIX = process.env.ROUTING_PREFIX ?? "/api";
const WALLET_STORAGE_URL = process.env.WALLET_STORAGE_URL ?? "";
const HOSTING_DOMAIN = process.env.HOSTING_DOMAIN ?? "http://localhost:3000";
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN ?? HOSTING_DOMAIN;

// Heuristic VM/prod detector
let IS_VM = false;
try {
  const h = new URL(HOSTING_DOMAIN).hostname;
  // Treat anything non-localhost as VM/prod
  IS_VM = h !== "localhost" && h !== "127.0.0.1";
} catch {}

// Still allow overrides
IS_VM =
  IS_VM ||
  process.env.GATEWAY_ENV === "vm" ||
  process.env.NODE_ENV === "production";

// For check script visibility
export const WELL_KNOWN_PATH = "/.well-known/auth";
export const WELLKNOWN_SENTINEL = true;

const app = express();
const db = knex(knexConfig);

// ------------------ tiny tracer ------------------
function tap(name: string, opts?: { postOnly?: boolean }) {
  const postOnly = opts?.postOnly ?? false;
  return (req: Request, _res: Response, next: NextFunction) => {
    if (postOnly && req.method !== "POST") return next();
    const a: any = req as any;
    logWithTimestamp(F, `[mw] → ${name}`, {
      method: req.method,
      url: req.originalUrl || req.url,
      contentType: req.headers["content-type"],
      contentLength: req.headers["content-length"],
      hasReqBodyProp: Object.prototype.hasOwnProperty.call(req, "body"),
      authPresent: !!a?.auth,
      senderIdentityKey: a?.auth?.senderIdentityKey ?? "n/a",
    });
    next();
  };
}

// ------------------ unified auth middleware ------------------
function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  const allowFallback =
    (process.env.ALLOW_UNAUTH_FALLBACK ?? "").toLowerCase() === "yes";

  if (!req.auth?.identityKey) {
    if (allowFallback) {
      logWithTimestamp(
        F,
        "⚠️ Allowing unauthenticated request (ALLOW_UNAUTH_FALLBACK=yes)",
      );
      return next();
    }
    return res.status(401).json({ status: "error", message: "Unauthorized" });
  }

  next();
}

async function initializeServer(): Promise<void> {
  try {
    logWithTimestamp(F, "🔧 Config", {
      HTTP_PORT,
      ROUTING_PREFIX,
      ALLOWED_ORIGIN,
      HOSTING_DOMAIN,
      IS_VM,
      WALLET_STORAGE_URL_present: Boolean(WALLET_STORAGE_URL),
      SERVER_PRIVATE_KEY_len: (process.env.SERVER_PRIVATE_KEY ?? "").length,
    });

    await db.migrate.latest();
    logWithTimestamp(F, "✅ Migrations applied successfully");

    const serverKey = process.env.SERVER_PRIVATE_KEY ?? "";
    if (serverKey.length !== 64)
      throw new Error(
        "❌ SERVER_PRIVATE_KEY is missing or invalid (must be 64 hex characters)",
      );

    const wallet = await Setup.createWalletClientNoEnv({
      rootKeyHex: serverKey,
      storageUrl: WALLET_STORAGE_URL,
      chain: "main",
    });
    logWithTimestamp(
      F,
      "🔍 Wallet initialized:",
      util.inspect(wallet, { depth: 2, colors: true } as any),
    );

    // In dev (localhost) → keep strict
    // In prod/VM → trust all proxies so Host/X-Forwarded headers validate correctly
    if (
      process.env.NODE_ENV === "production" ||
      process.env.GATEWAY_ENV === "vm"
    ) {
      app.set("trust proxy", true); // trust ALL hops
      logWithTimestamp(F, "⚙️ trust proxy set to TRUE (prod/vm)");
    } else {
      app.set("trust proxy", 1); // keep single-hop for dev safety
      logWithTimestamp(F, "⚙️ trust proxy set to 1 (dev)");
    }

    //app.set('trust proxy', 1)

    // --- Global preflight/trace
    app.use(tap("00 - request received"));

    // =====================================================
    // 🧩 PARSERS FIRST
    // =====================================================
    app.use(tap("01 - before parsers"));
    app.use(bodyParser.json({ limit: "1mb" }));
    app.use(bodyParser.urlencoded({ extended: true, limit: "1mb" }));
    app.use(
      bodyParser.raw({ type: "application/octet-stream", limit: "16mb" }),
    );
    app.use(tap("02 - after parsers"));

    // =====================================================
    // ✅ Healthz (raw, no headers)
    // =====================================================
    app.get("/healthz", (_req, res) => res.status(200).json({ status: "ok" }));

    // 🌐 WELL-KNOWN CORS (OPTIONS + all requests) — reflect caller origin
    app.use(
      "/.well-known",
      (req: Request, res: Response, next: NextFunction) => {
        const origin = req.headers.origin;
        if (origin) {
          res.header("Access-Control-Allow-Origin", origin);
          res.header("Vary", "Origin");
        }
        res.header("Access-Control-Allow-Headers", "*");
        res.header("Access-Control-Allow-Methods", "*");
        res.header("Access-Control-Allow-Credentials", "true");

        if (req.method === "OPTIONS") {
          return res.sendStatus(200);
        }
        next();
      },
    );

    // =====================================================
    // 🔑 AUTH MIDDLEWARE — create BEFORE mounting
    // =====================================================
    const authRouter = createAuthMiddleware({
      wallet,
      allowUnauthenticated: true,
      logger: {
        debug: (...args: any[]) => logWithTimestamp("auth-mw", ...args),
        info: (...args: any[]) => logWithTimestamp("auth-mw", ...args),
        warn: (...args: any[]) => logWithTimestamp("auth-mw", ...args),
        error: (...args: any[]) => logWithTimestamp("auth-mw", ...args),
      },
      logLevel: "info",
    } as any);

    // =====================================================
    // 🛡️ Security headers (apply EARLY)
    // =====================================================
    app.use(tap("05 - before helmet"));
    app.use(
      helmet.hsts({ maxAge: 31536000, includeSubDomains: true, preload: true }),
    );
    app.use(
      helmet.contentSecurityPolicy({
        useDefaults: true,
        directives: {
          ...helmet.contentSecurityPolicy.getDefaultDirectives(),
          "connect-src": [
            "'self'",
            "http://localhost:3321",
            "http://127.0.0.1:3321",
            "ws://localhost:3321",
            "ws://127.0.0.1:3321",
            "https:",
            "https://*.trycloudflare.com",
            "https://api.github.com",
          ],
        },
      }),
    );
    app.use(tap("06 - after helmet"));

    // mount authRouter under WELL_KNOWN_PATH
    app.use(
      WELL_KNOWN_PATH,
      (req: Request, res: Response, next: NextFunction) => {
        logWithTimestamp(F, "[AUTH ROUTER ENTRY]", {
          url: req.url,
          body: req.body,
          headers: req.headers,
        });
        (authRouter as any)(req, res, (err?: any) => {
          if (err) return next(err);
          if (res.headersSent) {
            logWithTimestamp(
              F,
              "[AUTH ROUTER EXIT] response already sent, stopping middleware chain",
            );
            return;
          }
          next();
        });
      },
    );

    // global debug wrapper to log before/after authRouter
    app.use(async (req: Request, res: Response, next: NextFunction) => {
      logWithTimestamp(F, "[AUTH DEBUG pre-middleware]", {
        url: req.url,
        body: req.body,
        headers: req.headers,
      });
      try {
        await (authRouter as any)(req, res, (err?: any) => {
          if (err) return next(err);
          if (res.headersSent) {
            logWithTimestamp(
              F,
              "[AUTH DEBUG exit] response already sent, skipping post-middleware + next()",
            );
            return;
          }
          next();
        });
      } catch (err) {
        console.error("[AUTH ERROR]", err);
        next(err);
      }

      logWithTimestamp(F, "[AUTH DEBUG post-middleware]", {
        url: req.url,
        auth: (req as any).auth,
      });
    });

    // Removed for prod
    // app.use(tap('07 - before rateLimit'))
    // app.use(
    //   rateLimit({
    //     windowMs: 15 * 60 * 1000,
    //     max: 100,
    //     standardHeaders: true,
    //     legacyHeaders: false,
    //     keyGenerator: (req: Request) => {
    //       return req.ip || (req.headers['x-forwarded-for'] as string) || 'unknown'
    //     }
    //   })
    // )
    // app.use(tap('08 - after rateLimit'))

    // After createAuthMiddleware → now check/fallback

    // 🌐 CORS (reflect caller origin globally)
    app.use((req: Request, res: Response, next: NextFunction) => {
      const origin = req.headers.origin;
      if (origin) {
        res.header("Access-Control-Allow-Origin", origin);
        res.header("Vary", "Origin");
      }
      res.header("Access-Control-Allow-Headers", "*");
      res.header("Access-Control-Allow-Methods", "*");
      res.header("Access-Control-Expose-Headers", "*");
      res.header("Access-Control-Allow-Credentials", "true");
      res.header("Access-Control-Allow-Private-Network", "true");

      if (req.method === "OPTIONS") {
        return res.sendStatus(200);
      }
      next();
    });

    app.use(authMiddleware as any);

    // =====================================================
    // 🔄 WALLET PROXY (relay to local wallet on 3321)
    // =====================================================
    app.use("/wallet-proxy", async (req: Request, res: Response) => {
      try {
        if (req.path === "/getStatus") {
          logWithTimestamp(F, "[wallet-proxy] blocked /getStatus");
          return res
            .status(404)
            .json({ error: "Not available on wallet proxy" });
        }

        // Enforce identity key presence and validity
        const identityKey = req.headers["x-bsv-auth-identity-key"];
        if (
          typeof identityKey !== "string" ||
          identityKey.trim() === "" ||
          identityKey === "unknown"
        ) {
          logWithTimestamp(
            F,
            "[wallet-proxy] reject 401 — missing/unknown identity key",
            { url: req.url },
          );
          return res
            .status(401)
            .json({ error: "Missing or unknown identity key" });
        }

        const targetUrl = `http://127.0.0.1:3321${req.url}`;
        logWithTimestamp(F, "[wallet-proxy] relaying request", {
          url: req.url,
          identityKey,
        });

        // Convert headers into a plain object acceptable to fetch
        const headers: Record<string, string> = {};
        for (const [key, value] of Object.entries(req.headers)) {
          if (typeof value === "string") {
            headers[key] = value;
          } else if (Array.isArray(value)) {
            headers[key] = value.join(", ");
          }
        }
        headers["host"] = "127.0.0.1:3321";

        const response = await fetch(targetUrl, {
          method: req.method,
          headers,
          body:
            req.method !== "GET" && req.method !== "HEAD"
              ? JSON.stringify(req.body)
              : undefined,
        });

        response.headers.forEach((value, key) => res.setHeader(key, value));
        const text = await response.text();
        res.status(response.status).send(text);
      } catch (err) {
        logWithTimestamp(F, "[wallet-proxy error]", err);
        res.status(500).json({ error: "Wallet relay failed" });
      }
    });

    // =====================================================
    // 💳 PAYMENT MIDDLEWARE
    // =====================================================
    app.use(tap("11 - before payment (POST only)", { postOnly: true }));
    const paymentRouter = createPaymentMiddleware({
      wallet,
      calculateRequestPrice: (req: Request) => {
        if (req.url.includes("/payment")) {
          const amount = parseInt((req.body as any)?.amount as string) || 0;
          if (amount > MAX_PAYMENT_SATS) {
            throw new Error(
              `❌ Payment amount (${amount} sats) exceeds maximum allowed (${MAX_PAYMENT_SATS} sats)`,
            );
          }
          return 0;
        }
        return 0;
      },
    } as any);
    app.use((req: Request, res: Response, next: NextFunction) => {
      if (req.method !== "POST") return next();
      return (paymentRouter as any)(req, res, next);
    });
    app.use(tap("12 - after payment (POST only)", { postOnly: true }));

    // =====================================================
    // 📁 Static + SPA
    // =====================================================
    const candidateStaticDirs = [
      path.join(__dirname, "public"),
      path.join(process.cwd(), "dist/public"),
      path.join(process.cwd(), "public"),
    ];
    const staticDir =
      candidateStaticDirs.find((d) => {
        try {
          return fs.existsSync(d);
        } catch {
          return false;
        }
      }) || path.join(process.cwd(), "public");

    app.use(tap("13 - before static"));
    app.use(express.static(staticDir));
    logWithTimestamp(F, "static dir:", staticDir);
    app.use(tap("14 - after static"));

    const spaPaths = ["/", "/buttons", "/payments", "/actions"];
    spaPaths.forEach((p) => {
      app.get(p, (_req, res) =>
        res.sendFile(path.join(staticDir, "index.html")),
      );
    });

    // =====================================================
    // 🛣️ API routes
    // =====================================================
    const apiRouter: Router = express.Router();

    // Explicit /getStatus route (only for prod/vm)
    if (
      process.env.NODE_ENV === "production" ||
      process.env.GATEWAY_ENV === "vm"
    ) {
      apiRouter.get("/getStatus", (_req: Request, res: Response) => {
        logWithTimestamp(F, "↪ /api/getStatus probe", {
          env: process.env.NODE_ENV,
        });
        res.json({ status: "ok", env: process.env.NODE_ENV, ts: Date.now() });
      });
    }

    try {
      const routeModules = await routes;
      (routeModules as Route[]).forEach((route: Route) => {
        if (
          typeof route?.type === "string" &&
          typeof route?.path === "string" &&
          typeof route?.func === "function"
        ) {
          const method = route.type.toLowerCase() as "get" | "post";
          const fullPath = `${ROUTING_PREFIX}${route.path}`;
          logWithTimestamp(
            F,
            `🔍 Registering route: ${method.toUpperCase()} ${fullPath}`,
          );
          const handler = route.func;
          if (typeof (apiRouter as any)[method] === "function") {
            (apiRouter as any)[method](
              route.path,
              (req: Request, res: Response, next: NextFunction) => {
                handler(req as any, res).catch(next);
              },
            );
          }
        }
      });
      logWithTimestamp(F, "✅ All routes registered successfully");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error("❌ Failed to register routes:", message);
      throw new Error(`❌ Failed to register routes: ${message}`);
    }
    app.use(ROUTING_PREFIX, apiRouter);

    // --- Version endpoint (fix blank "Loading..." screen) ---
    app.get(["/api/getVersion", "/getVersion"], (req, res) => {
      res.json({
        version: process.env.npm_package_version ?? "dev",
        serverIdentityKey: process.env.SERVER_IDENTITY_KEY ?? "unknown",
      });
    });

    // =====================================================
    // 🚀 Start server
    // =====================================================
    app.listen(HTTP_PORT, () => {
      logWithTimestamp(
        F,
        `🚀 Server listening on http://localhost:${HTTP_PORT}`,
      );
    });
  } catch (err) {
    console.error("❌ Failed to initialize server", err);
    process.exit(1);
  }
}

initializeServer();
