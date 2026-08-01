/**
 * SQLite live run of the Shortly suite — THE default norm suite.
 *
 * The models live in tests/models/ (pure definitions), the 20 steps
 * in tests/suite.ts (engine-agnostic). Only the engine-specific parts
 * live here:
 *
 * - Dialect normalizers: SQLite returns TIMESTAMP columns as stored
 *   strings, JSON as its stored TEXT, and INTEGER as number within
 *   2^53−1 / bigint beyond.
 *
 * Replicating for Postgres/Maria = one new fixture file like this.
 *
 * @module
 */

import { makeTempDir, removeDir } from '@tundralibs/compat/file';
import { SQLiteEngine } from '@tundralibs/drivers';
import { type LiveEngine, runLiveSuite } from './suite.ts';

let dir = '';

runLiveSuite({
  name: 'sqlite',
  setup: async () => {
    dir = await makeTempDir({ prefix: 'norm-live-sqlite-' });
    // No DDL here — the suite's Migrator owns the schema.
    return new SQLiteEngine('norm-live', {
      path: dir,
    }) as unknown as LiveEngine;
  },
  teardown: async () => {
    await removeDir(dir, { recursive: true });
  },
  dialect: {
    asTime: (v) => new Date(v as string | Date).getTime(),
    asBig: (v) => BigInt(String(v)),
    asJson: (v) => (typeof v === 'string' ? JSON.parse(v) : v),
  },
});
