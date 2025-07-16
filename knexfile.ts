import 'dotenv/config'
import type { Knex } from 'knex'

const port = process.env.SQL_DATABASE_PORT ? Number(process.env.SQL_DATABASE_PORT) : 3306 // fallback

if (!process.env.SQL_DATABASE_HOST || !process.env.SQL_DATABASE_USER || !process.env.SQL_DATABASE_DB_NAME) {
  throw new Error('Missing required database environment variables')
}

const config: Knex.Config = {
  client: 'mysql2',
  migrations: { directory: './migrations' },
  connection: {
    host: process.env.SQL_DATABASE_HOST,
    port,
    user: process.env.SQL_DATABASE_USER,
    password: process.env.SQL_DATABASE_PASSWORD,
    database: process.env.SQL_DATABASE_DB_NAME
  }
}

export default config
