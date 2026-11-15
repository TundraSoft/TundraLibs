/**
 * Postgres run of the live suite in `suite.ts`. Connection details come from
 * `packages/drivers/.env` (`POSTGRES_*`). Skipped when the database is
 * unreachable.
 *
 * @module
 */

import { envArgs } from '@tundralibs/utils';
import { PostgresEngine } from '../engines/postgres/Engine.ts';
import { runLiveSuite } from './suite.ts';

const env = envArgs('./packages/drivers/');

const CONFIG = {
  host: env.get('POSTGRES_HOST') || 'localhost',
  port: Number.parseInt(env.get('POSTGRES_PORT') || '5432', 10),
  // CI sets DB_SCHEMA to keep this package's tables apart from NORM's.
  database: env.get('DB_SCHEMA')
    ? `${env.get('DB_SCHEMA')}_drivers`
    : env.get('POSTGRES_DB') || 'postgres',
  username: env.get('POSTGRES_USER') || 'postgres',
  password: env.get('POSTGRES_PASSWORD') || '',
};

await runLiveSuite('postgres', () => new PostgresEngine('oql-live', CONFIG));
