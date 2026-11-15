/**
 * MariaDB run of the live suite in `suite.ts`. Connection details come from
 * `packages/drivers/.env` (`MARIA_*`). Skipped when the database is
 * unreachable.
 *
 * @module
 */

import { envArgs } from '@tundralibs/utils';
import { MariaEngine } from '../engines/maria/Engine.ts';
import { runLiveSuite } from './suite.ts';

const env = envArgs('./packages/drivers/');

const CONFIG = {
  host: env.get('MARIA_HOST') || 'localhost',
  port: Number.parseInt(env.get('MARIA_PORT') || '3306', 10),
  // CI sets DB_SCHEMA to keep this package's tables apart from NORM's.
  database: env.get('DB_SCHEMA')
    ? `${env.get('DB_SCHEMA')}_drivers`
    : env.get('MARIA_DB') || 'mysql',
  username: env.get('MARIA_USER') || 'root',
  password: env.get('MARIA_PASSWORD') || '',
};

await runLiveSuite('maria', () => new MariaEngine('oql-live', CONFIG));
