import 'dotenv/config'
import type { Knex } from 'knex'

interface KnexConfig extends Knex.Config {
  migrations: {
    directory: string
    extension: string
    tableName?: string
  }
  seeds?: {
    directory: string
    extension?: string
  }
}

const {
  SQL_DATABASE_HOST,
  SQL_DATABASE_USER,
  SQL_DATABASE_PASSWORD,
  SQL_DATABASE_DB_NAME,
  SQL_DATABASE_PORT
} = process.env

const port = Number(SQL_DATABASE_PORT ?? '3306')
const isPortValid = Number.isInteger(port) && port > 0 && port < 65536

const missing: string[] = []
if (typeof SQL_DATABASE_HOST !== 'string' || !SQL_DATABASE_HOST)
  missing.push('SQL_DATABASE_HOST')
if (typeof SQL_DATABASE_USER !== 'string' || !SQL_DATABASE_USER)
  missing.push('SQL_DATABASE_USER')
if (typeof SQL_DATABASE_PASSWORD !== 'string')
  missing.push('SQL_DATABASE_PASSWORD')
if (typeof SQL_DATABASE_DB_NAME !== 'string' || !SQL_DATABASE_DB_NAME)
  missing.push('SQL_DATABASE_DB_NAME')
if (!isPortValid) missing.push('SQL_DATABASE_PORT (invalid or not a number)')

if (missing.length) {
  throw new Error(
    `❌ Missing/invalid database environment variables: ${missing.join(', ')}`
  )
}

const config: KnexConfig = {
  client: 'mysql2',
  connection: {
    host: SQL_DATABASE_HOST!,
    port,
    user: SQL_DATABASE_USER!,
    password: SQL_DATABASE_PASSWORD!, // may be empty string if you really intend that
    database: SQL_DATABASE_DB_NAME!
  },
  pool: {
    min: 0,
    max: 10
  },
  migrations: {
    directory: './migrations',
    extension: 'ts',
    tableName: 'knex_migrations'
  },
  seeds: {
    directory: './seeds'
  }
}

export default config
