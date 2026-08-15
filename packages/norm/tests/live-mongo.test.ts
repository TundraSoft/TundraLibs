/**
 * MongoDB live run of the Shortly suite — the CRUD subset. Mongo is
 * schemaless, so the Migrator does not own the schema (`migrate:
 * false`, matching v4's skipMigrations): collections appear on first
 * insert and setup() creates the two unique indexes the suite's
 * collision tests rely on.
 *
 * Steps a document store cannot run are declared in `skip` with
 * reasons — they render as loud SKIPPED steps, so the gap catalog is
 * part of every test run.
 *
 * @module
 */

import { describe, it } from '@tundralibs/compat/test';
import { MongoEngine } from '@tundralibs/drivers/mongo';
import { envArgs } from '@tundralibs/utils';
import { type LiveEngine, runLiveSuite } from './suite.ts';
import { ActiveLinks } from './models/shortener/mod.ts';
import { TagsOfPosts } from './models/blog/mod.ts';

const env = envArgs('./packages/norm/');

const BASE = {
  host: env.get('MONGO_HOST') || 'localhost',
  port: Number.parseInt(env.get('MONGO_PORT') || '27017', 10),
  // CI sets DB_SCHEMA to isolate NORM's DB from the drivers suite running
  // in parallel against the same container (Option A); local runs keep the
  // configured `MONGO_DB`.
  database: env.get('DB_SCHEMA')
    ? `${env.get('DB_SCHEMA')}_norm`
    : env.get('MONGO_DB') || 'mongo1',
};

/** Try authenticated first, then anonymous (dev servers often run
 * with auth disabled while the .env still carries credentials). */
const CONFIG = await (async () => {
  const candidates = [
    {
      ...BASE,
      username: env.get('MONGO_USERNAME') || env.get('MONGO_USER') ||
        undefined,
      password: env.get('MONGO_PASSWORD') || undefined,
      // Root user (MONGO_INITDB_ROOT_*) authenticates against `admin`; set
      // only when MONGO_AUTHSOURCE is provided so local anon runs are untouched.
      authSource: env.get('MONGO_AUTHSOURCE') || undefined,
    },
    { ...BASE, username: undefined, password: undefined },
  ];
  for (const candidate of candidates) {
    const probe = new MongoEngine('norm-live-mongo-probe', candidate);
    try {
      await probe.connect();
      await probe.ping();
      // Ping succeeds ANONYMOUSLY on auth-enabled servers — prove
      // write capability, or the suite dies in setup instead of
      // skipping cleanly.
      await probe.insert({
        type: 'INSERT',
        table: '_norm_probe',
        columns: ['ok'],
        data: [{ ok: 1 }],
      });
      await probe.dropTable({
        type: 'DROP_TABLE',
        table: '_norm_probe',
        ifExists: true,
      });
      return candidate;
    } catch {
      // next candidate
    } finally {
      await probe.disconnect().catch(() => {});
    }
  }
  return null;
})();

const available = CONFIG !== null;

const COLLECTIONS = [
  'users',
  'profiles',
  'links',
  'visits',
  'posts',
  'tags',
  'post_tags',
  'audit_log',
  'active_links',
  'tags_of_posts',
  '_norm_migrations',
];

// deno-lint-ignore no-explicit-any
async function dropAll(engine: any): Promise<void> {
  for (const table of COLLECTIONS) {
    try {
      await engine.dropTable({ type: 'DROP_TABLE', table, ifExists: true });
    } catch { /* may not exist */ }
  }
}

if (!available) {
  describe('norm.live-mongo', () => {
    it(
      `SKIPPED — MongoDB at ${BASE.host}:${BASE.port} unreachable or ` +
        `credentials rejected (fix MONGO_* in packages/norm/.env)`,
      () => {},
    );
  });
} else {
  let engine: MongoEngine;
  runLiveSuite({
    name: 'mongo',
    migrate: false, // schemaless — no DDL to own
    setup: async () => {
      engine = new MongoEngine('norm-live-mongo', CONFIG!);
      await engine.connect();
      await dropAll(engine);
      // The two unique indexes the suite's collision steps rely on —
      // on SQL these come from the entity `unique:` options via the
      // Migrator; Mongo gets them directly.
      // deno-lint-ignore no-explicit-any
      await (engine as any).createIndex({
        type: 'CREATE_INDEX',
        index: 'ux_users_email',
        table: 'users',
        columns: ['@email_hash'],
        unique: true,
        ifNotExists: true,
      });
      // deno-lint-ignore no-explicit-any
      await (engine as any).createIndex({
        type: 'CREATE_INDEX',
        index: 'ux_links_slug',
        table: 'links',
        columns: ['@slug'],
        unique: true,
        ifNotExists: true,
      });
      // The two VIEWs the suite reads (Migrator owns these on SQL;
      // with migrate:false the fixture creates them from the SAME
      // model definitions — Mongo views are aggregation pipelines).
      for (
        const def of [ActiveLinks, TagsOfPosts] as Array<
          { name: string; query: unknown }
        >
      ) {
        // deno-lint-ignore no-explicit-any
        await (engine as any).createView({
          type: 'CREATE_VIEW',
          view: def.name,
          query: def.query,
          ifNotExists: true,
        });
      }
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
    // The CERTAIN dialect gaps (client-side facts — translator throws
    // / capability flags). The live run may add readback-shaped ones;
    // see TODO.md "Mongo gaps".
    skip: {
      '18c': 'FK ON DELETE CASCADE — no foreign keys in MongoDB',
      '08r': 'raw SQL — db.raw throws NormUnsupportedError on Mongo ' +
        '(no SQL surface; use db.query with OQL IR instead)',
      '08e': 'filter-only to-many lifts to $exists — MongoTranslator ' +
        'throws (no correlated-subquery form in find filters)',
      '13b': 'M2M view read filters through $exists — same ' +
        '$exists/$nexists gap',
      '17': 'no transactions (capabilities.transactions=false; ' +
        'db.transaction throws NormUnsupportedError by design)',
      '17b': 'no transactions — savepoint nesting is moot without them',
    },
  });
}
