/**
 * @file knexfile.ts
 * @description
 * Centralized Knex configuration for the Gateway application. Provides:
 * - MySQL2 connection (reads from `.env`)
 * - Conservative pool sizing for small VMs
 * - TypeScript migrations support via `ts-node` (`loadExtensions: ['.ts']`)
 * - Basic environment validation with helpful error messages
 *
 * @author xAI
 * @date 2025-09-04
 * @version 1.17
 * @changelog
 * - 2025-09-04 (v1.17): Added strict env validation, enabled TS migrations with
 *   `loadExtensions`, documented config with JSDoc, and left seeds as JS by default.
 */

import "dotenv/config";
import type { Knex } from "knex";

/**
 * Strongly-typed Knex config with explicit `migrations`/`seeds` shapes.
 */
interface KnexConfig extends Knex.Config {
  migrations: {
    directory: string;
    extension: string;
    tableName?: string;
    loadExtensions?: string[];
  };
  seeds?: {
    directory: string;
    extension?: string;
  };
}

/**
 * Required database configuration sourced from the environment.
 *
 * - `SQL_DATABASE_HOST` (e.g., `127.0.0.1`)
 * - `SQL_DATABASE_PORT` (e.g., `3306`)
 * - `SQL_DATABASE_USER` (e.g., `gateway`)
 * - `SQL_DATABASE_PASSWORD` (string; may be empty but must be defined)
 * - `SQL_DATABASE_DB_NAME` (e.g., `gateway`)
 */
const {
  SQL_DATABASE_HOST,
  SQL_DATABASE_USER,
  SQL_DATABASE_PASSWORD,
  SQL_DATABASE_DB_NAME,
  SQL_DATABASE_PORT,
} = process.env;

const port = Number(SQL_DATABASE_PORT ?? "3306");
const isPortValid = Number.isInteger(port) && port > 0 && port < 65536;

// Collect any missing/invalid env configuration up front for a clear error
const missing: string[] = [];
if (typeof SQL_DATABASE_HOST !== "string" || !SQL_DATABASE_HOST)
  missing.push("SQL_DATABASE_HOST");
if (typeof SQL_DATABASE_USER !== "string" || !SQL_DATABASE_USER)
  missing.push("SQL_DATABASE_USER");
// Password can be empty string but must be defined
if (typeof SQL_DATABASE_PASSWORD !== "string")
  missing.push("SQL_DATABASE_PASSWORD");
if (typeof SQL_DATABASE_DB_NAME !== "string" || !SQL_DATABASE_DB_NAME)
  missing.push("SQL_DATABASE_DB_NAME");
if (!isPortValid) missing.push("SQL_DATABASE_PORT (invalid or not a number)");

if (missing.length) {
  throw new Error(
    `❌ Missing/invalid database environment variables: ${missing.join(", ")}`,
  );
}

/**
 * Gateway Knex configuration.
 *
 * @remarks
 * - Uses the `mysql2` client.
 * - Migrations: TypeScript files are supported via `loadExtensions: ['.ts']`.
 *   Ensure commands load `ts-node/register` (our scripts already do).
 * - Seeds: kept as JS by default (no `extension` override) to match current repo.
 */
const config: KnexConfig = {
  client: "mysql2",
  connection: {
    host: SQL_DATABASE_HOST!,
    port,
    user: SQL_DATABASE_USER!,
    password: SQL_DATABASE_PASSWORD!,
    database: SQL_DATABASE_DB_NAME!,
  },
  // Small, friendly pool for modest VM sizes; bump if needed.
  pool: { min: 0, max: 10 },

  migrations: {
    directory: "./migrations",
    extension: "ts", // used by `migrate:make`
    loadExtensions: [".ts"], // actually load TypeScript migrations
    tableName: "knex_migrations",
  },

  // Seeds currently live as JS files in ./seeds
  seeds: {
    directory: "./seeds",
  },
};

export default config;
