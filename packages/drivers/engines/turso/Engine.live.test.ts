/**
 * @fileoverview End-to-end live test for {@link TursoEngine} against a Hrana-v3
 * `/v3/pipeline` endpoint.
 *
 * By default the engine is driven through {@link startTursoSqliteProxy} — a
 * localhost proxy that speaks the same Hrana-over-HTTP protocol Turso / libSQL
 * do, backed by an in-process `:memory:` SQLite. That exercises the full engine
 * path — `:name:` param encoding, HTTP transport, `HranaValue` decoding, and
 * SQLite error-code mapping — with **no external service and no secret**, so
 * this suite runs green in CI with zero infrastructure.
 *
 * ## Gating
 * - The proxy uses `Deno.serve` (+ the native `@db/sqlite` binding), so on
 *   Bun/Node it skips with a clear reason (the engine's per-runtime logic is
 *   covered by the mocked `Engine.test.ts` / `TursoHttpClient.test.ts`).
 * - `TURSO_HTTP_ENDPOINT` escape hatch: when set, the engine is pointed straight
 *   at that real endpoint (no proxy, any runtime) — for running against real
 *   Turso / a standalone `sqld`. `TURSO_AUTH_TOKEN` supplies the bearer JWT.
 *
 * @module
 */

import { afterAll, beforeAll, describe, it } from '@tundralibs/compat/test';
import * as asserts from '@std/asserts';
import { envArgs } from '@tundralibs/utils';
import { TursoEngine } from './Engine.ts';
import { EngineError } from '../../errors/mod.ts';
import {
  canHostTursoProxy,
  startTursoSqliteProxy,
  type TursoSqliteProxy,
} from './_tursoSqliteProxy.ts';

const env = envArgs('./packages/drivers/');

/** Full base URL of a real Turso / `sqld` endpoint; skips the local proxy. */
const TURSO_HTTP_ENDPOINT = env.get('TURSO_HTTP_ENDPOINT');
const TURSO_AUTH_TOKEN = env.get('TURSO_AUTH_TOKEN');
const useRealEndpoint = !!TURSO_HTTP_ENDPOINT;

// The proxy is backed by in-process SQLite, so no external service is needed —
// the suite runs whenever the runtime can host the proxy (Deno), or always when
// pointed at a real endpoint.
const runtimeCanHost = canHostTursoProxy();
const runSuite = useRealEndpoint || runtimeCanHost;
const skipReason = runSuite
  ? ''
  : 'requires the Deno runtime (Deno.serve + @db/sqlite in-process proxy); ' +
    'set TURSO_HTTP_ENDPOINT to run against a real endpoint on any runtime';

if (!runSuite) {
  console.warn(`[turso.Engine.live] skipped: ${skipReason}`);
}

/**
 * Auth token the engine sends. Against the proxy it is a sentinel that the
 * proxy ignores — its only job is to prove the token never leaks into a thrown
 * error. Against a real endpoint it is the caller's `TURSO_AUTH_TOKEN`.
 */
const authToken = useRealEndpoint
  ? (TURSO_AUTH_TOKEN ?? '')
  : 'test-secret-turso-token-should-never-leak';

let _t = 0;
const tableName = (label: string): string =>
  `tundra_turso_${label.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}_${++_t}`;

describe({
  name: 'drivers.engines.turso.TursoEngine.live',
  ignore: !runSuite,
  // The proxy server, its backing SQLite handle, and fetch keep-alive
  // connections all outlive individual `it`s; disable Deno's per-test
  // sanitizers accordingly (mirrors the Neon live suite).
  sanitizeOps: false,
  sanitizeResources: false,
  fn: () => {
    /** Base URL the engine targets — the proxy, or the real endpoint. */
    let url = '';
    let proxy: TursoSqliteProxy | undefined;

    const makeEngine = (name: string): TursoEngine =>
      new TursoEngine(name, { url, authToken });

    beforeAll(async () => {
      if (useRealEndpoint) {
        url = TURSO_HTTP_ENDPOINT!;
      } else {
        proxy = await startTursoSqliteProxy();
        url = proxy.url;
      }
    });

    afterAll(async () => {
      if (proxy) await proxy.close();
    });

    describe('lifecycle', () => {
      it('connects, pings, and disconnects', async () => {
        const engine = makeEngine('turso-live-life');
        await engine.connect();
        asserts.assertEquals(engine.status, 'READY');
        asserts.assertEquals(await engine.ping(), true);
        await engine.disconnect();
        asserts.assertEquals(engine.status, 'CLOSED');
      });
    });

    describe('CRUD with SQLite type parity', () => {
      it('DDL + INSERT RETURNING decodes with SQLite parity', async () => {
        const engine = makeEngine('turso-live-types');
        const t = tableName('types');
        try {
          await engine.execute({
            sql: `CREATE TABLE ${t} (
              id INTEGER PRIMARY KEY,
              big INTEGER,
              ratio REAL,
              label TEXT NOT NULL,
              payload BLOB,
              note TEXT
            )`,
          });

          const ins = await engine.execute<Record<string, unknown>>({
            sql: `INSERT INTO ${t}
              (id, big, ratio, label, payload, note)
              VALUES (:id:, :big:, :ratio:, :label:, :payload:, :note:)
              RETURNING *`,
            params: {
              id: 1,
              // Past 2^53 — must survive as a bigint, not a lossy number.
              big: 9007199254740993n,
              ratio: 2.25,
              label: 'hello',
              payload: new Uint8Array([1, 2, 255]),
              note: null,
            },
          });

          asserts.assertEquals(ins.count, 1);
          const row = ins.data[0]!;
          // small INTEGER → number.
          asserts.assertEquals(row.id, 1);
          asserts.assertEquals(typeof row.id, 'number');
          // INTEGER past 2^53 → bigint (full 64-bit precision).
          asserts.assertEquals(typeof row.big, 'bigint');
          asserts.assertEquals(row.big, 9007199254740993n);
          // REAL → number.
          asserts.assertEquals(row.ratio, 2.25);
          asserts.assertEquals(typeof row.ratio, 'number');
          // TEXT → string.
          asserts.assertEquals(row.label, 'hello');
          // BLOB → Uint8Array.
          asserts.assertInstanceOf(row.payload, Uint8Array);
          asserts.assertEquals(row.payload, new Uint8Array([1, 2, 255]));
          // NULL → null.
          asserts.assertEquals(row.note, null);

          // SELECT round-trip returns the same decoded row.
          const sel = await engine.execute<Record<string, unknown>>({
            sql: `SELECT * FROM ${t} WHERE id = :id:`,
            params: { id: 1 },
          });
          asserts.assertEquals(sel.count, 1);
          const back = sel.data[0]!;
          asserts.assertEquals(back.id, 1);
          asserts.assertEquals(back.big, 9007199254740993n);
          asserts.assertEquals(back.ratio, 2.25);
          asserts.assertEquals(back.label, 'hello');
          asserts.assertInstanceOf(back.payload, Uint8Array);
          asserts.assertEquals(back.payload, new Uint8Array([1, 2, 255]));
          asserts.assertEquals(back.note, null);
        } finally {
          await engine.execute({ sql: `DROP TABLE IF EXISTS ${t}` });
          await engine.disconnect();
        }
      });

      it('UPDATE / DELETE report affected-row counts; bare INSERT counts one', async () => {
        const engine = makeEngine('turso-live-crud');
        const t = tableName('crud');
        try {
          await engine.execute({
            sql: `CREATE TABLE ${t} (
              id INTEGER PRIMARY KEY, name TEXT, active INTEGER
            )`,
          });
          for (
            const r of [
              { id: 1, n: 'Alice', ac: 1 },
              { id: 2, n: 'Bob', ac: 1 },
              { id: 3, n: 'Charlie', ac: 0 },
            ]
          ) {
            const bare = await engine.execute({
              sql:
                `INSERT INTO ${t} (id, name, active) VALUES (:id:, :n:, :ac:)`,
              params: r,
            });
            // A bare INSERT's `count` is the affected-row count (1 here).
            asserts.assertEquals(bare.count, 1);
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

    describe('error mapping (real SQLite errors via the proxy)', () => {
      it('duplicate PK → DUPLICATE_KEY, and no auth token leaks', async () => {
        const engine = makeEngine('turso-live-dup');
        const t = tableName('dup');
        try {
          await engine.execute({
            sql: `CREATE TABLE ${t} (id INTEGER PRIMARY KEY)`,
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

          // The bearer token lives only on the transport (RESTler), never on
          // the error. Assert it does not appear anywhere in the thrown error.
          if (authToken) {
            const dump = JSON.stringify({
              message: (err as EngineError).message,
              context: (err as EngineError).context,
              string: String(err),
            });
            asserts.assert(
              !dump.includes(authToken),
              'the auth token must not appear in the error',
            );
          }
        } finally {
          await engine.execute({ sql: `DROP TABLE IF EXISTS ${t}` });
          await engine.disconnect();
        }
      });

      it('query on a missing table → TABLE_NOT_FOUND', async () => {
        const engine = makeEngine('turso-live-missing');
        try {
          const err = await asserts.assertRejects(
            () =>
              engine.execute({
                sql: `SELECT * FROM ${tableName('does_not_exist')}`,
              }),
            EngineError,
          );
          asserts.assertEquals((err as EngineError).code, 'TABLE_NOT_FOUND');
        } finally {
          await engine.disconnect();
        }
      });
    });

    describe('transactions (unsupported over one-shot Hrana HTTP)', () => {
      it('transaction() rejects and the engine stays usable', async () => {
        const engine = makeEngine('turso-live-tx');
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
