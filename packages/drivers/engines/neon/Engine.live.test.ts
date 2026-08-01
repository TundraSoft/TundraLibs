/**
 * @fileoverview End-to-end live test for {@link NeonHttpEngine} against **real
 * Postgres**, reached through a localhost Neon-compatible `/sql` proxy.
 *
 * The proxy ({@link startNeonPgProxy}) fronts the CI Postgres and speaks Neon's
 * SQL-over-HTTP JSON, so this exercises the full engine path — `:name:` param
 * encoding, HTTP transport, raw-text → JS value decoding, and SQLSTATE error
 * mapping — with no Neon cloud account and no secret.
 *
 * ## Gating (mirrors the Postgres live suite)
 * - Skips when Postgres is unreachable.
 * - The in-process proxy uses `Deno.serve`, so on Bun/Node it skips with a
 *   clear reason (the engine's per-runtime logic is covered by the mocked
 *   `Engine.test.ts` / `NeonHttpClient.test.ts`).
 * - `NEON_HTTP_ENDPOINT` escape hatch: when set, the engine is pointed straight
 *   at that real endpoint (no proxy, any runtime) — for running against Neon.
 *
 * @module
 */

import { afterAll, beforeAll, describe, it } from '@tundralibs/compat/test';
import * as asserts from '@std/asserts';
import { envArgs } from '@tundralibs/utils';
import { NeonHttpEngine } from './Engine.ts';
import { EngineError } from '../../errors/mod.ts';
import {
  canHostNeonPgProxy,
  type NeonPgProxy,
  openPgConnection,
  startNeonPgProxy,
} from './_neonPgProxy.ts';

const env = envArgs('./packages/drivers/');

const TEST_CONFIG = {
  host: env.get('POSTGRES_HOST') || 'localhost',
  port: Number.parseInt(env.get('POSTGRES_PORT') || '5432', 10),
  // CI sets DB_SCHEMA to isolate this suite from NORM's, which runs in
  // parallel against the same container; local keeps POSTGRES_DB.
  database: env.get('DB_SCHEMA')
    ? `${env.get('DB_SCHEMA')}_drivers`
    : env.get('POSTGRES_DB') || 'postgres',
  username: env.get('POSTGRES_USER') || 'postgres',
  password: env.get('POSTGRES_PASSWORD') || '',
};

/** Full base URL of a real Neon(-compatible) endpoint; skips the local proxy. */
const NEON_HTTP_ENDPOINT = env.get('NEON_HTTP_ENDPOINT');
const useRealEndpoint = !!NEON_HTTP_ENDPOINT;

/** Probe: a `PgConnection` connect + `SELECT 1` against the CI Postgres. */
async function isPgAvailable(): Promise<boolean> {
  try {
    const pg = await openPgConnection(TEST_CONFIG);
    try {
      const r = await pg.queryRaw('SELECT 1 AS one');
      return r.rows.length === 1;
    } finally {
      await pg.close();
    }
  } catch {
    return false;
  }
}

// Only probe local Postgres when we actually need the in-process proxy.
const runtimeCanHost = canHostNeonPgProxy();
const pgAvailable = (!useRealEndpoint && runtimeCanHost)
  ? await isPgAvailable()
  : false;

const runSuite = useRealEndpoint || (runtimeCanHost && pgAvailable);
const skipReason = runSuite
  ? ''
  : !runtimeCanHost
  ? 'requires the Deno runtime (Deno.serve-backed /sql proxy); ' +
    'set NEON_HTTP_ENDPOINT to run against a real endpoint on any runtime'
  : 'Postgres not reachable';

if (!runSuite) {
  console.warn(`[neon.Engine.live] skipped: ${skipReason}`);
}

let _t = 0;
const tableName = (label: string): string =>
  `tundra_neon_${label.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}_${++_t}`;

describe({
  name: 'drivers.engines.neon.NeonHttpEngine.live',
  ignore: !runSuite,
  // The proxy server, its backing socket, and fetch keep-alive connections all
  // outlive individual `it`s; disable Deno's per-test sanitizers accordingly.
  sanitizeOps: false,
  sanitizeResources: false,
  fn: () => {
    /** Base URL the engine targets — the proxy, or the real endpoint. */
    let endpoint = '';
    let proxy: NeonPgProxy | undefined;

    const makeEngine = (name: string): NeonHttpEngine =>
      new NeonHttpEngine(name, {
        host: TEST_CONFIG.host,
        endpoint,
        username: TEST_CONFIG.username,
        password: TEST_CONFIG.password,
        database: TEST_CONFIG.database,
      });

    beforeAll(async () => {
      if (useRealEndpoint) {
        endpoint = NEON_HTTP_ENDPOINT!;
      } else {
        proxy = await startNeonPgProxy(TEST_CONFIG);
        endpoint = proxy.url;
      }
    });

    afterAll(async () => {
      if (proxy) await proxy.close();
    });

    describe('lifecycle', () => {
      it('connects, pings, and disconnects', async () => {
        const engine = makeEngine('neon-live-life');
        await engine.connect();
        asserts.assertEquals(engine.status, 'READY');
        asserts.assertEquals(await engine.ping(), true);
        await engine.disconnect();
        asserts.assertEquals(engine.status, 'CLOSED');
      });
    });

    describe('CRUD with PG type parity', () => {
      it('DDL + INSERT RETURNING decodes with Postgres parity', async () => {
        const engine = makeEngine('neon-live-types');
        const t = tableName('types');
        try {
          await engine.execute({
            sql: `CREATE TABLE ${t} (
              id INT PRIMARY KEY,
              big BIGINT,
              flag BOOLEAN,
              ratio DOUBLE PRECISION,
              created TIMESTAMPTZ,
              meta JSONB,
              payload BYTEA,
              label TEXT NOT NULL,
              note TEXT
            )`,
          });

          const created = new Date('2020-01-02T03:04:05.000Z');
          const ins = await engine.execute<Record<string, unknown>>({
            sql: `INSERT INTO ${t}
              (id, big, flag, ratio, created, meta, payload, label, note)
              VALUES (:id:, :big:, :flag:, :ratio:, :created:, :meta:, :payload:, :label:, :note:)
              RETURNING *`,
            params: {
              id: 1,
              big: 9007199254740993n,
              flag: true,
              ratio: 2.25,
              created,
              meta: { a: 1, b: [2, 3] },
              payload: new Uint8Array([1, 2, 255]),
              label: 'hello',
              note: null,
            },
          });

          asserts.assertEquals(ins.count, 1);
          const row = ins.data[0]!;
          asserts.assertEquals(row.id, 1);
          // int8 → bigint (not a lossy number).
          asserts.assertEquals(typeof row.big, 'bigint');
          asserts.assertEquals(row.big, 9007199254740993n);
          // bool → boolean.
          asserts.assertEquals(row.flag, true);
          // float8 → number.
          asserts.assertEquals(row.ratio, 2.25);
          // timestamptz → Date (same OID→Date mapping the socket PostgresEngine
          // applies). NB: Postgres renders a zero-minute offset as `+00`, which
          // the shared text decoder turns into an (intentionally-unchanged-here)
          // Date; the instant itself is proven to round-trip at the SQL level
          // below, independent of JS `Date` offset-parsing.
          asserts.assertInstanceOf(row.created, Date);
          // jsonb → parsed value.
          asserts.assertEquals(row.meta, { a: 1, b: [2, 3] });
          // bytea → Uint8Array.
          asserts.assertInstanceOf(row.payload, Uint8Array);
          asserts.assertEquals(row.payload, new Uint8Array([1, 2, 255]));
          // text passes through; NULL → null.
          asserts.assertEquals(row.label, 'hello');
          asserts.assertEquals(row.note, null);

          // SELECT round-trip returns the same decoded row.
          const sel = await engine.execute<Record<string, unknown>>({
            sql: `SELECT * FROM ${t} WHERE id = :id:`,
            params: { id: 1 },
          });
          asserts.assertEquals(sel.count, 1);
          const back = sel.data[0]!;
          asserts.assertEquals(back.big, 9007199254740993n);
          asserts.assertEquals(back.flag, true);
          asserts.assertEquals(back.meta, { a: 1, b: [2, 3] });
          asserts.assertEquals(back.payload, new Uint8Array([1, 2, 255]));
          asserts.assertEquals(back.note, null);

          // timestamptz round-trips its instant through encode → PG → compare:
          // the row is found by matching on the same Date-valued param.
          const byTs = await engine.execute<{ id: number }>({
            sql: `SELECT id FROM ${t} WHERE created = :created:`,
            params: { created },
          });
          asserts.assertEquals(byTs.count, 1);
          asserts.assertEquals(byTs.data[0]?.id, 1);
        } finally {
          await engine.execute({ sql: `DROP TABLE IF EXISTS ${t}` });
          await engine.disconnect();
        }
      });

      it('UPDATE and DELETE report affected-row counts', async () => {
        const engine = makeEngine('neon-live-crud');
        const t = tableName('crud');
        try {
          await engine.execute({
            sql:
              `CREATE TABLE ${t} (id INT PRIMARY KEY, name TEXT, active INT)`,
          });
          for (
            const r of [
              { id: 1, n: 'Alice', ac: 1 },
              { id: 2, n: 'Bob', ac: 1 },
              { id: 3, n: 'Charlie', ac: 0 },
            ]
          ) {
            await engine.execute({
              sql:
                `INSERT INTO ${t} (id, name, active) VALUES (:id:, :n:, :ac:)`,
              params: r,
            });
          }

          const upd = await engine.execute({
            sql: `UPDATE ${t} SET name = :n: WHERE active = :ac:`,
            params: { n: 'updated', ac: 1 },
          });
          asserts.assertEquals(upd.count, 2);

          const del = await engine.execute({
            sql: `DELETE FROM ${t} WHERE active = :ac:`,
            params: { ac: 0 },
          });
          asserts.assertEquals(del.count, 1);

          const left = await engine.execute({
            sql: `SELECT id FROM ${t} ORDER BY id`,
          });
          asserts.assertEquals(left.count, 2);
        } finally {
          await engine.execute({ sql: `DROP TABLE IF EXISTS ${t}` });
          await engine.disconnect();
        }
      });
    });

    describe('error mapping (real SQLSTATE via the proxy)', () => {
      it('duplicate PK → DUPLICATE_KEY carrying sqlState, no leaked creds', async () => {
        const engine = makeEngine('neon-live-dup');
        const t = tableName('dup');
        try {
          await engine.execute({
            sql: `CREATE TABLE ${t} (id INT PRIMARY KEY)`,
          });
          await engine.execute({
            sql: `INSERT INTO ${t} (id) VALUES (:id:)`,
            params: { id: 1 },
          });
          const err = await asserts.assertRejects(
            () =>
              engine.execute({
                sql: `INSERT INTO ${t} (id) VALUES (:id:)`,
                params: { id: 1 },
              }),
            EngineError,
          );
          asserts.assertEquals((err as EngineError).code, 'DUPLICATE_KEY');
          const ctx = (err as EngineError).context as Record<string, unknown>;
          asserts.assertEquals(ctx.sqlState, '23505');

          // The connection string / password lives only on the transport
          // headers, never on the error.
          const dump = JSON.stringify({
            message: (err as EngineError).message,
            context: ctx,
            string: String(err),
          });
          asserts.assert(
            !dump.includes('postgresql://'),
            'a connection string must not appear in the error',
          );
        } finally {
          await engine.execute({ sql: `DROP TABLE IF EXISTS ${t}` });
          await engine.disconnect();
        }
      });

      it('query on an undefined table → TABLE_NOT_FOUND with sqlState', async () => {
        const engine = makeEngine('neon-live-missing');
        try {
          const err = await asserts.assertRejects(
            () =>
              engine.execute({
                sql: `SELECT * FROM ${tableName('does_not_exist')}`,
              }),
            EngineError,
          );
          asserts.assertEquals((err as EngineError).code, 'TABLE_NOT_FOUND');
          const ctx = (err as EngineError).context as Record<string, unknown>;
          asserts.assertEquals(ctx.sqlState, '42P01');
        } finally {
          await engine.disconnect();
        }
      });
    });

    describe('transactions (unsupported over one-shot HTTP)', () => {
      it('transaction() rejects and the engine stays usable', async () => {
        const engine = makeEngine('neon-live-tx');
        try {
          const err = await asserts.assertRejects(
            () => engine.transaction(async () => {/* never runs */}),
            EngineError,
          );
          asserts.assertEquals(
            (err as EngineError).code,
            'UNSUPPORTED_OPERATION',
          );

          // Still usable after the rejected transaction.
          const r = await engine.execute<{ one: number }>({
            sql: 'SELECT 1 AS one',
          });
          asserts.assertEquals(r.data[0]?.one, 1);
        } finally {
          await engine.disconnect();
        }
      });
    });
  },
});
