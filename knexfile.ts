import 'dotenv/config';
import type { Knex } from 'knex';

interface KnexConfig extends Knex.Config {
  migrations: {
    directory: string;
    extension: string;
    tableName?: string;
  };
}

const rawPort = Number(process.env.SQL_DATABASE_PORT);
const port = !isNaN(rawPort) ? rawPort : 3306;
const { SQL_DATABASE_HOST, SQL_DATABASE_USER, SQL_DATABASE_DB_NAME, SQL_DATABASE_PASSWORD } = process.env;

if (
  typeof SQL_DATABASE_HOST !== 'string' ||
  typeof SQL_DATABASE_USER !== 'string' ||
  typeof SQL_DATABASE_DB_NAME !== 'string'
) {
  throw new Error('❌ Missing required database environment variables');
}

const config: KnexConfig = {
  client: 'mysql2',
  migrations: {
    directory: './migrations',
    extension: 'ts',
    tableName: 'knex_migrations',
  },
  connection: {
    host: SQL_DATABASE_HOST,
    port,
    user: SQL_DATABASE_USER,
    password: SQL_DATABASE_PASSWORD,
    database: SQL_DATABASE_DB_NAME,
  },
};

export default config;
