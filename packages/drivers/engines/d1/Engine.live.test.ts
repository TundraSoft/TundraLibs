/**
 * @fileoverview End-to-end live test for {@link D1Engine} against a Cloudflare
 * D1 REST `/accounts/{acct}/d1/database/{db}/query` endpoint.
 *
 * By default the engine is driven through {@link startD1SqliteProxy} — a
 * localhost proxy that speaks the same D1 REST query protocol Cloudflare D1
 * does, backed by an in-process `:memory:` SQLite. That exercises the full
 * engine path — `:name:` → positional `?` param encoding, HTTP transport, D1
 * JSON value decoding, and SQLite error-code mapping — with **no external
 * service and no secret**, so this suite runs green in CI with zero
 * infrastructure.
 *
 * ## Gating
 * - The proxy uses `Deno.serve` (+ the native `@db/sqlite` binding), so on
 *   Bun/Node it skips with a clear reason (the engine's per-runtime logic is
 *   covered by the mocked `Engine.test.ts` / `D1HttpClient.test.ts`).
 * - `D1_HTTP_ENDPOINT` escape hatch: when set, the engine is pointed straight at
 *   that real endpoint (no proxy, any runtime) — for running against real
 *   Cloudflare D1. `D1_ACCOUNT_ID` / `D1_DATABASE_ID` / `D1_API_TOKEN` supply the
 *   account, database, and bearer token.
 *
 * @module
 */

import { afterAll, beforeAll, describe, it } from '@tundralibs/compat/test';
import * as asserts from '@std/asserts';
import { envArgs } from '@tundralibs/utils';
import { D1Engine } from './Engine.ts';
import { EngineError } from '../../errors/mod.ts';
import {
  canHostD1Proxy,
  type D1SqliteProxy,
  startD1SqliteProxy,
} from './_d1SqliteProxy.ts';

const env = envArgs('./packages/drivers/');

/** Full base URL of a real Cloudflare D1 endpoint; skips the local proxy. */
const D1_HTTP_ENDPOINT = env.get('D1_HTTP_ENDPOINT');
const useRealEndpoint = !!D1_HTTP_ENDPOINT;

// Account / database segments of the query path. Against the proxy they are
// opaque sentinels; against a real endpoint they must be the caller's real IDs.
const accountId = env.get('D1_ACCOUNT_ID') || 'acct';
const databaseId = env.get('D1_DATABASE_ID') || 'db';

/**
 * Bearer API token the engine sends. Against the proxy it is a sentinel the
 * proxy ignores — its only job is to prove the token never leaks into a thrown
 * error. Against a real endpoint it is the caller's `D1_API_TOKEN`.
 */
const apiToken = useRealEndpoint
  ? (env.get('D1_API_TOKEN') || 'set-D1_API_TOKEN-for-a-real-endpoint')
  : 'test-secret-d1-token-should-never-leak';

// The proxy is backed by in-process SQLite, so no external service is needed —
// the suite runs whenever the runtime can host the proxy (Deno), or always when
// pointed at a real endpoint.
const runtimeCanHost = canHostD1Proxy();
const runSuite = useRealEndpoint || runtimeCanHost;
const skipReason = runSuite
  ? ''
  : 'requires the Deno runtime (Deno.serve + @db/sqlite in-process proxy); ' +
    'set D1_HTTP_ENDPOINT to run against a real endpoint on any runtime';

if (!runSuite) {
  console.warn(`[d1.Engine.live] skipped: ${skipReason}`);
}

let _t = 0;
const tableName = (label: string): string =>
  `tundra_d1_${label.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}_${++_t}`;

describe({
  name: 'drivers.engines.d1.D1Engine.live',
  ignore: !runSuite,
  // The proxy server, its backing SQLite handle, and fetch keep-alive
  // connections all outlive individual `it`s; disable Deno's per-test
  // sanitizers accordingly (mirrors the Neon / Turso live suites).
  sanitizeOps: false,
  sanitizeResources: false,
  fn: () => {
    /** Base URL the engine targets — the proxy, or the real endpoint. */
    let endpoint = '';
    let proxy: D1SqliteProxy | undefined;

    const makeEngine = (name: string): D1Engine =>
      new D1Engine(name, { accountId, databaseId, apiToken, endpoint });

    beforeAll(async () => {
      if (useRealEndpoint) {
        endpoint = D1_HTTP_ENDPOINT!;
      } else {
        proxy = await startD1SqliteProxy();
        endpoint = proxy.url;
      }
    });

    afterAll(async () => {
      if (proxy) await proxy.close();
    });

    describe('lifecycle', () => {
      it('connects, pings, and disconnects', async () => {
        const engine = makeEngine('d1-live-life');
        await engine.connect();
        asserts.assertEquals(engine.status, 'READY');
        asserts.assertEquals(await engine.ping(), true);
        await engine.disconnect();
        asserts.assertEquals(engine.status, 'CLOSED');
      });
    });

    describe('CRUD with SQLite type parity', () => {
      it('DDL + INSERT RETURNING round-trips over positional ?', async () => {
        const engine = makeEngine('d1-live-types');
        const t = tableName('types');
        try {
          await engine.execute({
            sql: `CREATE TABLE ${t} (
              id INTEGER PRIMARY KEY,
              count INTEGER,
              ratio REAL,
              label TEXT NOT NULL,
              payload BLOB,
              note TEXT
            )`,
          });

          // `:name:` params are rewritten to positional `?` and sent in order;
          // RETURNING * proves the round-trip end-to-end.
          const ins = await engine.execute<Record<string, unknown>>({
            sql: `INSERT INTO ${t}
              (id, count, ratio, label, payload, note)
              VALUES (:id:, :count:, :ratio:, :label:, :payload:, :note:)
              RETURNING *`,
            params: {
              id: 1,
              // A safe-range INTEGER: D1 carries int64 as a JSON number, so a
              // value beyond ±(2^53−1) would be lossy (documented limitation) —
              // kept in-range here so the round-trip is exact.
              count: 42,
              ratio: 2.25,
              label: 'hello',
              payload: new Uint8Array([1, 2, 255]),
              note: null,
            },
          });

          asserts.assertEquals(ins.count, 1);
          const row = ins.data[0]!;
          // INTEGER → number.
          asserts.assertEquals(row.id, 1);
          asserts.assertEquals(typeof row.id, 'number');
          asserts.assertEquals(row.count, 42);
          asserts.assertEquals(typeof row.count, 'number');
          // REAL → number.
          asserts.assertEquals(row.ratio, 2.25);
          asserts.assertEquals(typeof row.ratio, 'number');
          // TEXT → string.
          asserts.assertEquals(row.label, 'hello');
          // BLOB → Uint8Array (D1 serializes a BLOB as a JSON array of bytes;
          // the engine decodes it back).
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
          asserts.assertEquals(back.count, 42);
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
        const engine = makeEngine('d1-live-crud');
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
            // A bare INSERT's `count` is the affected-row count (= meta.changes).
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
      it('duplicate PK → DUPLICATE_KEY + constraint meta, and no api token leaks', async () => {
        const engine = makeEngine('d1-live-dup');
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
          // The SQLite-style message ("UNIQUE constraint failed: <t>.id") is
          // parsed by the shared helper into `context.constraint`.
          const ctx = (err as EngineError).context as Record<string, unknown>;
          asserts.assertEquals(typeof ctx.constraint, 'string');
          asserts.assert(
            String(ctx.constraint).endsWith('.id'),
            `expected constraint to name the id column, got ${ctx.constraint}`,
          );

          // The bearer token lives only on the transport (RESTler), never on the
          // error. Assert it does not appear anywhere in the thrown error.
          const dump = JSON.stringify({
            message: (err as EngineError).message,
            context: ctx,
            string: String(err),
          });
          asserts.assert(
            !dump.includes(apiToken),
            'the api token must not appear in the error',
          );
        } finally {
          await engine.execute({ sql: `DROP TABLE IF EXISTS ${t}` });
          await engine.disconnect();
        }
      });

      it('query on a missing table → TABLE_NOT_FOUND', async () => {
        const engine = makeEngine('d1-live-missing');
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

    // A BLOB bind (`Uint8Array` → JSON array of byte numbers) round-trip that
    // ONLY runs against a REAL Cloudflare D1 endpoint (`D1_HTTP_ENDPOINT`).
    // The read direction (BLOB → number[]) is documented, but Cloudflare's REST
    // `/query` docs do not separately specify the BLOB *bind* form, so the
    // engine mirrors the read form. The in-process proxy is collusive — it
    // decodes number[] → Uint8Array itself — so it cannot verify what real D1
    // REST accepts; gate this to the real endpoint so it proves the bind form
    // end-to-end when run opt-in, and skips in normal CI.
    describe({
      name: 'BLOB bind round-trip (real Cloudflare D1 REST only)',
      ignore: !useRealEndpoint,
      fn: () => {
        it('binds a Uint8Array as a BLOB and reads it back byte-for-byte', async () => {
          const engine = makeEngine('d1-live-blob');
          const t = tableName('blob');
          const bytes = new Uint8Array([0, 1, 2, 127, 128, 254, 255]);
          try {
            await engine.execute({
              sql: `CREATE TABLE ${t} (id INTEGER PRIMARY KEY, payload BLOB)`,
            });
            const ins = await engine.execute<Record<string, unknown>>({
              sql: `INSERT INTO ${t} (id, payload) VALUES (:id:, :payload:)
                RETURNING payload`,
              params: { id: 1, payload: bytes },
            });
            // RETURNING surfaces the stored BLOB, decoded back to a Uint8Array.
            asserts.assertInstanceOf(ins.data[0]!.payload, Uint8Array);
            asserts.assertEquals(ins.data[0]!.payload, bytes);

            // Independent SELECT read-back confirms it was actually stored as a
            // BLOB (not, say, JSON text), byte-for-byte.
            const sel = await engine.execute<Record<string, unknown>>({
              sql: `SELECT payload FROM ${t} WHERE id = :id:`,
              params: { id: 1 },
            });
            asserts.assertInstanceOf(sel.data[0]!.payload, Uint8Array);
            asserts.assertEquals(sel.data[0]!.payload, bytes);
          } finally {
            await engine.execute({ sql: `DROP TABLE IF EXISTS ${t}` });
            await engine.disconnect();
          }
        });
      },
    });

    describe('transactions (unsupported over one-shot REST)', () => {
      it('transaction() rejects and the engine stays usable', async () => {
        const engine = makeEngine('d1-live-tx');
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
