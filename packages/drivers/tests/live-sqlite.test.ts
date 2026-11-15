/**
 * SQLite run of the live suite in `suite.ts`, on a database file in a
 * temporary directory that is removed afterwards.
 *
 * @module
 */

import { makeTempDir, removeDir } from '@tundralibs/compat/file';
import { SQLiteEngine } from '../engines/sqlite/Engine.ts';
import { runLiveSuite } from './suite.ts';

const tempDir = await makeTempDir({ prefix: 'oql_sqlite_live_' });

await runLiveSuite(
  'sqlite',
  () => new SQLiteEngine('oql-live', { path: tempDir }),
  () => removeDir(tempDir, { recursive: true }),
);
