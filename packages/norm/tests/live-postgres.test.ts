/**
 * Postgres live run of the Shortly suite — the same 22 steps as
 * SQLite, per the fixture contract ("Replicating for Postgres/Maria =
 * one new fixture file"). Skipped cleanly when the database in
 * `packages/norm/.env` (`POSTGRES_*`) is unreachable.
 *
 * Runs against the CONFIGURED database (drivers-test convention):
 * every norm object is dropped before AND after the run, so a crashed
 * prior run never poisons the next one.
 *
 * Dialect notes: the pg driver returns TIMESTAMP as `Date`, BIGINT as
 * string/bigint, JSON(B) already parsed — the tolerant normalizers
 * cover all three shapes.
 *
 * @module
 */

import { describe, it } from '@tundralibs/compat/test';
import { PostgresEngine } from '@tundralibs/drivers';
import { envArgs } from '@tundralibs/utils';
import { type LiveEngine, runLiveSuite } from './suite.ts';

const env = envArgs('./packages/norm/');

const CONFIG = {
  host: env.get('POSTGRES_HOST') || 'localhost',
  port: Number.parseInt(env.get('POSTGRES_PORT') || '5432', 10),
  // CI sets DB_SCHEMA to isolate NORM's DB from the drivers suite running
  // in parallel against the same container (Option A); local runs keep the
  // configured `POSTGRES_DB`.
  database: env.get('DB_SCHEMA')
    ? `${env.get('DB_SCHEMA')}_norm`
    : env.get('POSTGRES_DB') || 'postgres',
  username: env.get('POSTGRES_USERNAME') || env.get('POSTGRES_USER') ||
    'postgres',
  password: env.get('POSTGRES_PASSWORD') || '',
};

const available = await (async () => {
  const probe = new PostgresEngine('norm-live-pg-probe', CONFIG);
  try {
    await probe.connect();
    await probe.ping();
    return true;
  } catch {
    return false;
  } finally {
    await probe.disconnect().catch(() => {});
  }
})();

/** Views first, then tables children-before-parents. */
const VIEWS = ['active_links', 'tags_of_posts'];
const TABLES = [
  'visits',
  'post_tags',
  'posts',
  'tags',
  'profiles',
  'audit_log',
  'links',
  'users',
  '_norm_migrations',
];

// deno-lint-ignore no-explicit-any
async function dropAll(engine: any): Promise<void> {
  for (const view of VIEWS) {
    try {
      await engine.dropView({ type: 'DROP_VIEW', view, ifExists: true });
    } catch { /* may not exist */ }
  }
  for (const table of TABLES) {
    try {
      await engine.dropTable({
        type: 'DROP_TABLE',
        table,
        ifExists: true,
        cascade: true,
      });
    } catch { /* may not exist */ }
  }
}

if (!available) {
  describe('norm.live-postgres', () => {
    it(`SKIPPED — Postgres at ${CONFIG.host}:${CONFIG.port} unreachable`, () => {});
  });
} else {
  let engine: PostgresEngine;
  runLiveSuite({
    name: 'postgres',
    setup: async () => {
      engine = new PostgresEngine('norm-live-pg', CONFIG);
      await engine.connect();
      await dropAll(engine); // a crashed prior run must not poison this one
      return engine as unknown as LiveEngine;
    },
    teardown: async () => {
      await dropAll(engine);
      await engine.disconnect();
    },
    dialect: {
      asTime: (v) => new Date(v as string | Date).getTime(),
      asBig: (v) => BigInt(String(v)),
      asJson: (v) => (typeof v === 'string' ? JSON.parse(v) : v),
    },
  });
}
