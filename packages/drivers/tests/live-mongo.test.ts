/**
 * MongoDB run of the live suite in `suite.ts`. Connection details come from
 * `packages/drivers/.env` (`MONGO_*`). Skipped when the database is
 * unreachable.
 *
 * @module
 */

import { envArgs } from '@tundralibs/utils';
import { MongoEngine } from '../engines/mongo/Engine.ts';
import { runLiveSuite } from './suite.ts';

const env = envArgs('./packages/drivers/');

const CONFIG = {
  host: env.get('MONGO_HOST') || 'localhost',
  port: Number.parseInt(env.get('MONGO_PORT') || '27017', 10),
  username: env.get('MONGO_USERNAME') || env.get('MONGO_USER') || undefined,
  password: env.get('MONGO_PASSWORD') || undefined,
  authSource: env.get('MONGO_AUTHSOURCE') || undefined,
  // CI sets DB_SCHEMA to keep this package's collections apart from NORM's.
  database: env.get('DB_SCHEMA')
    ? `${env.get('DB_SCHEMA')}_drivers`
    : env.get('MONGO_DB') || 'tundra_test',
};

await runLiveSuite('mongo', () => new MongoEngine('oql-live', CONFIG));
