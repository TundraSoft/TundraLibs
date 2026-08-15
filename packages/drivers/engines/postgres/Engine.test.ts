import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { envArgs } from '@tundralibs/utils';
import { PostgresEngine } from './Engine.ts';
import { PgServerError } from './PgServerError.ts';
import { EngineError } from '../../errors/mod.ts';
import type { EngineQuery } from '../../types/mod.ts';

// Wave-note: emission/option accessors are protected now — tests reach
// them through deliberate casts.
// deno-lint-ignore no-explicit-any
const readOption = (t: unknown, k: string): any =>
  // deno-lint-ignore no-explicit-any
  (t as any)._getOption(k);
// deno-lint-ignore no-explicit-any
const readOptions = (t: unknown): any =>
  // deno-lint-ignore no-explicit-any
  (t as any)._getOptions();
// deno-lint-ignore no-explicit-any
const fireEvent = (t: unknown, e: string, ...a: unknown[]): any =>
  // deno-lint-ignore no-explicit-any
  (t as any)._emitRaw(e, ...a);

const env = envArgs('./packages/drivers/');

const TEST_CONFIG = {
  host: env.get('POSTGRES_HOST') || 'localhost',
  port: Number.parseInt(env.get('POSTGRES_PORT') || '5432', 10),
  // CI sets DB_SCHEMA to isolate this suite from NORM's, which runs in
  // parallel against the same container (Option A); local keeps POSTGRES_DB.
  database: env.get('DB_SCHEMA')
    ? `${env.get('DB_SCHEMA')}_drivers`
    : env.get('POSTGRES_DB') || 'postgres',
  username: env.get('POSTGRES_USER') || 'postgres',
  password: env.get('POSTGRES_PASSWORD') || '',
};

async function isPgAvailable(): Promise<boolean> {
  const probe = new PostgresEngine('pg-probe', TEST_CONFIG);
  try {
    await probe.connect();
    const ok = await probe.ping();
    await probe.disconnect();
    return ok;
  } catch {
    try {
      await probe.disconnect();
    } catch {
      /* ignore */
    }
    return false;
  }
}

const pgAvailable = await isPgAvailable();

let _t = 0;
const tableName = (label: string): string =>
  `tundra_pg_${label.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}_${++_t}`;

// ---------------------------------------------------------------------------
// Engine-specific behaviour: configuration, SCRAM auth, type decoding for PG
// types that other engines don't have (jsonb, bigint→bigint, timestamp→Date).
// ---------------------------------------------------------------------------
describe('drivers.PostgresEngine', () => {
  describe('configuration', () => {
    it('should expose Engine and Capabilities', () => {
      const engine = new PostgresEngine('cfg-1', TEST_CONFIG);
      asserts.assertEquals(engine.Engine, 'POSTGRES');
      asserts.assertEquals(engine.Capabilities.transactions, true);
      asserts.assertEquals(engine.Capabilities.preparedStatements, true);
      asserts.assertEquals(engine.Capabilities.pooledConnections, true);
    });

    it('should default port to 5432', () => {
      const { port: _p, ...rest } = TEST_CONFIG;
      const engine = new PostgresEngine('cfg-2', rest);
      asserts.assertEquals(readOption(engine, 'port'), 5432);
    });

    it('should require host / database / username', () => {
      for (const missing of ['host', 'database', 'username'] as const) {
        const { [missing]: _, ...rest } = TEST_CONFIG;
        asserts.assertThrows(
          // deno-lint-ignore no-explicit-any
          () => new PostgresEngine(`cfg-${missing}`, rest as any),
          EngineError,
          missing,
        );
      }
    });
  });
});

// ---------------------------------------------------------------------------
// Error-code mapping (NO live DB). Feeds synthetic `PgServerError`s (and a
// transport-style error) through the protected `_wrapDriverError` and asserts
// the resulting `EngineError.code`, covering the `_pgSqlStateToCode` branches
// the live suite rarely reaches (DEADLOCK, LOCK_TIMEOUT, SERIALIZATION_FAILURE,
// CONNECTION_LOST, PERMISSION_DENIED, INVALID_AUTH-by-code, QUERY_TIMEOUT, …).
// ---------------------------------------------------------------------------
class ProbePgEngine extends PostgresEngine {
  public wrapError(error: unknown, query: EngineQuery): EngineError {
    return this._wrapDriverError(error, query);
  }
}

describe('drivers.PostgresEngine.error-mapping (no DB)', () => {
  const engine = new ProbePgEngine('pg-errmap', TEST_CONFIG);
  const q: EngineQuery = { sql: 'SELECT 1' };
  const codeFor = (sqlState: string): string =>
    engine.wrapError(
      new PgServerError(sqlState, new Map([['M', `synthetic ${sqlState}`]])),
      q,
    ).code;

  it('maps SQLSTATE codes to EngineError codes', () => {
    const cases: Array<[string, string]> = [
      ['28P01', 'INVALID_AUTH'],
      ['28000', 'INVALID_AUTH'],
      ['42501', 'PERMISSION_DENIED'],
      ['3D000', 'DATABASE_NOT_FOUND'],
      ['42P01', 'TABLE_NOT_FOUND'],
      ['42703', 'COLUMN_NOT_FOUND'],
      ['23505', 'DUPLICATE_KEY'],
      ['23503', 'FOREIGN_KEY_VIOLATION'],
      ['23502', 'NOT_NULL_VIOLATION'],
      ['23514', 'CHECK_VIOLATION'],
      ['42601', 'SYNTAX_ERROR'],
      ['40P01', 'DEADLOCK'],
      ['55P03', 'LOCK_TIMEOUT'],
      ['57014', 'QUERY_TIMEOUT'],
      ['40001', 'SERIALIZATION_FAILURE'],
      ['08000', 'CONNECTION_LOST'],
      ['08006', 'CONNECTION_LOST'],
      ['57P01', 'CONNECTION_LOST'],
    ];
    for (const [sqlState, expected] of cases) {
      asserts.assertEquals(
        codeFor(sqlState),
        expected,
        `SQLSTATE ${sqlState} should map to ${expected}`,
      );
    }
  });

  it('maps unknown SQLSTATE to QUERY_EXECUTION_FAILED', () => {
    asserts.assertEquals(codeFor('XX000'), 'QUERY_EXECUTION_FAILED');
  });

  it('maps a non-server (transport) error to QUERY_EXECUTION_FAILED', () => {
    const err = engine.wrapError(new Error('socket hang up'), q);
    asserts.assertInstanceOf(err, EngineError);
    asserts.assertEquals(err.code, 'QUERY_EXECUTION_FAILED');
  });

  it('returns an EngineError argument unchanged', () => {
    const original = new EngineError('DEADLOCK', {
      instanceId: 'POSTGRES::pg-errmap',
    });
    asserts.assertStrictEquals(engine.wrapError(original, q), original);
  });
});

describe({
  name: 'drivers.PostgresEngine.engine-specific',
  ignore: !pgAvailable,
  fn: () => {
    describe('authentication', () => {
      it('should reject bad password as INVALID_AUTH (or CONNECTION_FAILED)', async () => {
        const engine = new PostgresEngine('auth-bad', {
          ...TEST_CONFIG,
          password: 'definitely-wrong-password',
          pool: { min: 1, acquireTimeoutSeconds: 5 },
        });
        try {
          await engine.connect();
          asserts.fail('expected auth failure');
        } catch (e) {
          asserts.assertInstanceOf(e, EngineError);
          asserts.assert(
            (e as EngineError).code === 'INVALID_AUTH' ||
              (e as EngineError).code === 'CONNECTION_FAILED',
            `unexpected code: ${(e as EngineError).code}`,
          );
        }
        await engine.disconnect();
      });
    });

    describe('Postgres-specific type decoding', () => {
      it('decodes int8 (BIGINT), float8, jsonb, timestamp, bool, null', async () => {
        const engine = new PostgresEngine('types-pg', TEST_CONFIG);
        await engine.connect();
        const r = await engine.execute<Record<string, unknown>>({
          sql: `
            SELECT
              42::int AS i,
              42::bigint AS bi,
              3.14::float8 AS f,
              true AS b,
              'hello'::text AS t,
              NULL::int AS n,
              '2026-04-28 00:00:00'::timestamp AS ts,
              '{"a":1}'::jsonb AS j
          `,
        });
        const row = r.data[0]!;
        asserts.assertEquals(row.i, 42);
        asserts.assertEquals(row.bi, 42n);
        asserts.assert(typeof row.f === 'number');
        asserts.assertEquals(row.b, true);
        asserts.assertEquals(row.t, 'hello');
        asserts.assertEquals(row.n, null);
        asserts.assertInstanceOf(row.ts, Date);
        asserts.assertEquals(row.j, { a: 1 });
        await engine.disconnect();
      });
    });

    describe('Postgres-specific events', () => {
      it('should emit notice for server NOTICE', async () => {
        const notices: string[] = [];
        const engine = new PostgresEngine('evt-notice', {
          ...TEST_CONFIG,
          _onnotice: (_id: string, msg: string) => notices.push(msg),
        });
        await engine.execute({
          sql: `DO $$ BEGIN RAISE NOTICE 'tundra-test-notice'; END $$`,
        });
        await new Promise((r) => setTimeout(r, 50));
        asserts.assert(
          notices.some((n) => n.includes('tundra-test-notice')),
          `notices: ${JSON.stringify(notices)}`,
        );
        await engine.disconnect();
      });
    });

    describe('repeated placeholders', () => {
      it('same name maps to same $N index', async () => {
        const engine = new PostgresEngine('placeholders', TEST_CONFIG);
        const r = await engine.execute<{ a: string; a2: string }>({
          sql: 'SELECT :a: AS a, :a: AS a2',
          params: { a: 'hello' },
        });
        asserts.assertEquals(r.data, [{ a: 'hello', a2: 'hello' }]);
        await engine.disconnect();
      });
    });
  },
});

// ---------------------------------------------------------------------------
// SQL scenarios (inlined — the same script runs against every SQL engine).
// ---------------------------------------------------------------------------
describe({
  name: 'drivers.PostgresEngine.sql',
  ignore: !pgAvailable,
  fn: () => {
    describe('lifecycle', () => {
      it('should connect, ping, and disconnect', async () => {
        const engine = new PostgresEngine('pg-life-1', TEST_CONFIG);
        await engine.connect();
        asserts.assertEquals(engine.status, 'READY');
        asserts.assertEquals(await engine.ping(), true);
        await engine.disconnect();
        asserts.assertEquals(engine.status, 'CLOSED');
      });

      it('should be idempotent on repeated connect/disconnect', async () => {
        const engine = new PostgresEngine('pg-life-2', TEST_CONFIG);
        await engine.connect();
        await engine.connect();
        await engine.disconnect();
        await engine.disconnect();
        asserts.assertEquals(engine.status, 'CLOSED');
      });

      it('should auto-connect on first execute', async () => {
        const engine = new PostgresEngine('pg-life-3', TEST_CONFIG);
        asserts.assertEquals(engine.status, 'CLOSED');
        const r = await engine.execute({ sql: 'SELECT 1 AS v' });
        asserts.assertEquals(engine.status, 'READY');
        asserts.assertEquals(r.data.length, 1);
        await engine.disconnect();
      });
    });

    describe('DDL', () => {
      it('should CREATE and DROP a table', async () => {
        const engine = new PostgresEngine('pg-ddl-1', TEST_CONFIG);
        await engine.connect();
        const t = tableName('ddl_basic');
        try {
          await engine.execute({
            sql: `CREATE TABLE ${t} (id INT PRIMARY KEY, name VARCHAR(100))`,
          });
          await engine.execute({
            sql: `INSERT INTO ${t} (id, name) VALUES (:id:, :n:)`,
            params: { id: 1, n: 'Alice' },
          });
          const r = await engine.execute({ sql: `SELECT * FROM ${t}` });
          asserts.assertEquals(r.data.length, 1);
        } finally {
          await engine.execute({ sql: `DROP TABLE IF EXISTS ${t}` });
          await engine.disconnect();
        }
      });

      it('DROP TABLE IF EXISTS should not error on missing table', async () => {
        const engine = new PostgresEngine('pg-ddl-2', TEST_CONFIG);
        await engine.connect();
        await engine.execute({
          sql: `DROP TABLE IF EXISTS ${tableName('ddl_missing')}`,
        });
        await engine.disconnect();
      });
    });

    describe('CRUD on users table', () => {
      const seed = async (
        engine: PostgresEngine,
        t: string,
      ): Promise<void> => {
        await engine.execute({
          sql: `CREATE TABLE ${t} (
            id INT PRIMARY KEY,
            name VARCHAR(100) NOT NULL,
            email VARCHAR(255),
            age INT,
            active INT
          )`,
        });
        for (
          const row of [
            { id: 1, n: 'Alice', e: 'alice@example.com', a: 30, ac: 1 },
            { id: 2, n: 'Bob', e: 'bob@example.com', a: 25, ac: 1 },
            { id: 3, n: 'Charlie', e: 'charlie@example.com', a: 35, ac: 0 },
          ]
        ) {
          await engine.execute({
            sql:
              `INSERT INTO ${t} (id, name, email, age, active) VALUES (:id:, :n:, :e:, :a:, :ac:)`,
            params: row,
          });
        }
      };

      it('INSERT should report affected row count', async () => {
        const engine = new PostgresEngine('pg-crud-insert', TEST_CONFIG);
        await engine.connect();
        const t = tableName('users_insert');
        try {
          await engine.execute({
            sql: `CREATE TABLE ${t} (id INT PRIMARY KEY, name VARCHAR(100))`,
          });
          const r = await engine.execute({
            sql: `INSERT INTO ${t} (id, name) VALUES (:id:, :n:)`,
            params: { id: 1, n: 'Alice' },
          });
          asserts.assertEquals(r.count, 1);
        } finally {
          await engine.execute({ sql: `DROP TABLE IF EXISTS ${t}` });
          await engine.disconnect();
        }
      });

      it('SELECT * should return all rows', async () => {
        const engine = new PostgresEngine('pg-crud-select-all', TEST_CONFIG);
        await engine.connect();
        const t = tableName('users_select');
        try {
          await seed(engine, t);
          const r = await engine.execute({
            sql: `SELECT * FROM ${t} ORDER BY id`,
          });
          asserts.assertEquals(r.data.length, 3);
          asserts.assertEquals(
            r.data.map((row) => row.name as string),
            ['Alice', 'Bob', 'Charlie'],
          );
        } finally {
          await engine.execute({ sql: `DROP TABLE IF EXISTS ${t}` });
          await engine.disconnect();
        }
      });

      it('SELECT with WHERE filters by named param', async () => {
        const engine = new PostgresEngine('pg-crud-where', TEST_CONFIG);
        await engine.connect();
        const t = tableName('users_where');
        try {
          await seed(engine, t);
          const r = await engine.execute({
            sql: `SELECT name FROM ${t} WHERE active = :ac:`,
            params: { ac: 1 },
          });
          asserts.assertEquals(r.data.length, 2);
        } finally {
          await engine.execute({ sql: `DROP TABLE IF EXISTS ${t}` });
          await engine.disconnect();
        }
      });

      it('SELECT with ORDER BY DESC', async () => {
        const engine = new PostgresEngine('pg-crud-orderby', TEST_CONFIG);
        await engine.connect();
        const t = tableName('users_order');
        try {
          await seed(engine, t);
          const r = await engine.execute({
            sql: `SELECT name FROM ${t} ORDER BY age DESC`,
          });
          asserts.assertEquals(
            r.data.map((row) => row.name as string),
            ['Charlie', 'Alice', 'Bob'],
          );
        } finally {
          await engine.execute({ sql: `DROP TABLE IF EXISTS ${t}` });
          await engine.disconnect();
        }
      });

      it('SELECT with LIMIT', async () => {
        const engine = new PostgresEngine('pg-crud-limit', TEST_CONFIG);
        await engine.connect();
        const t = tableName('users_limit');
        try {
          await seed(engine, t);
          const r = await engine.execute({
            sql: `SELECT * FROM ${t} ORDER BY id LIMIT 2`,
          });
          asserts.assertEquals(r.data.length, 2);
        } finally {
          await engine.execute({ sql: `DROP TABLE IF EXISTS ${t}` });
          await engine.disconnect();
        }
      });

      it('UPDATE should report rows affected', async () => {
        const engine = new PostgresEngine('pg-crud-update', TEST_CONFIG);
        await engine.connect();
        const t = tableName('users_update');
        try {
          await seed(engine, t);
          const r = await engine.execute({
            sql: `UPDATE ${t} SET email = :e: WHERE active = :ac:`,
            params: { e: 'updated@example.com', ac: 1 },
          });
          asserts.assertEquals(r.count, 2);
          const verify = await engine.execute<{ email: string }>({
            sql: `SELECT email FROM ${t} WHERE id = :id:`,
            params: { id: 1 },
          });
          asserts.assertEquals(verify.data[0]?.email, 'updated@example.com');
        } finally {
          await engine.execute({ sql: `DROP TABLE IF EXISTS ${t}` });
          await engine.disconnect();
        }
      });

      it('DELETE should remove matching rows', async () => {
        const engine = new PostgresEngine('pg-crud-delete', TEST_CONFIG);
        await engine.connect();
        const t = tableName('users_delete');
        try {
          await seed(engine, t);
          const r = await engine.execute({
            sql: `DELETE FROM ${t} WHERE active = :ac:`,
            params: { ac: 0 },
          });
          asserts.assertEquals(r.count, 1);
          const remaining = await engine.execute({
            sql: `SELECT COUNT(*) AS n FROM ${t}`,
          });
          asserts.assertEquals(
            Number((remaining.data[0] as { n: unknown }).n),
            2,
          );
        } finally {
          await engine.execute({ sql: `DROP TABLE IF EXISTS ${t}` });
          await engine.disconnect();
        }
      });

      it('TRUNCATE should empty the table', async () => {
        const engine = new PostgresEngine('pg-crud-truncate', TEST_CONFIG);
        await engine.connect();
        const t = tableName('users_truncate');
        try {
          await seed(engine, t);
          await engine.execute({ sql: `TRUNCATE TABLE ${t}` });
          const remaining = await engine.execute({
            sql: `SELECT COUNT(*) AS n FROM ${t}`,
          });
          asserts.assertEquals(
            Number((remaining.data[0] as { n: unknown }).n),
            0,
          );
        } finally {
          await engine.execute({ sql: `DROP TABLE IF EXISTS ${t}` });
          await engine.disconnect();
        }
      });
    });

    describe('type round-trips', () => {
      it('string / integer / null', async () => {
        const engine = new PostgresEngine('pg-types-1', TEST_CONFIG);
        await engine.connect();
        const t = tableName('types_basic');
        try {
          await engine.execute({
            sql:
              `CREATE TABLE ${t} (id INT PRIMARY KEY, txt VARCHAR(100), num INT, nullable_txt VARCHAR(50))`,
          });
          await engine.execute({
            sql:
              `INSERT INTO ${t} (id, txt, num, nullable_txt) VALUES (:id:, :t:, :n:, :nt:)`,
            params: { id: 1, t: 'hello world', n: 42, nt: null },
          });
          const r = await engine.execute<
            { txt: string; num: number; nullable_txt: string | null }
          >({
            sql: `SELECT txt, num, nullable_txt FROM ${t} WHERE id = 1`,
          });
          const row = r.data[0]!;
          asserts.assertEquals(row.txt, 'hello world');
          asserts.assertEquals(row.num, 42);
          asserts.assertEquals(row.nullable_txt, null);
        } finally {
          await engine.execute({ sql: `DROP TABLE IF EXISTS ${t}` });
          await engine.disconnect();
        }
      });

      it('utf-8 / multi-byte values round-trip', async () => {
        const engine = new PostgresEngine('pg-types-utf8', TEST_CONFIG);
        await engine.connect();
        const t = tableName('types_utf8');
        try {
          await engine.execute({
            sql: `CREATE TABLE ${t} (id INT PRIMARY KEY, val VARCHAR(255))`,
          });
          const value = '日本語 🚀 émoji éàü ñ';
          await engine.execute({
            sql: `INSERT INTO ${t} (id, val) VALUES (:id:, :v:)`,
            params: { id: 1, v: value },
          });
          const r = await engine.execute<{ val: string }>({
            sql: `SELECT val FROM ${t} WHERE id = 1`,
          });
          asserts.assertEquals(r.data[0]?.val, value);
        } finally {
          await engine.execute({ sql: `DROP TABLE IF EXISTS ${t}` });
          await engine.disconnect();
        }
      });
    });

    describe('error mapping', () => {
      it('TABLE_NOT_FOUND on undefined table', async () => {
        const engine = new PostgresEngine('pg-err-table', TEST_CONFIG);
        await engine.connect();
        try {
          await engine.execute({
            sql: `SELECT * FROM tundra_does_not_exist_${Date.now()}`,
          });
          asserts.fail('expected TABLE_NOT_FOUND');
        } catch (e) {
          asserts.assertInstanceOf(e, EngineError);
          asserts.assertEquals((e as EngineError).code, 'TABLE_NOT_FOUND');
        }
        await engine.disconnect();
      });

      it('COLUMN_NOT_FOUND on undefined column', async () => {
        const engine = new PostgresEngine('pg-err-column', TEST_CONFIG);
        await engine.connect();
        const t = tableName('err_column');
        try {
          await engine.execute({
            sql: `CREATE TABLE ${t} (id INT PRIMARY KEY)`,
          });
          try {
            await engine.execute({
              sql: `SELECT no_such_column FROM ${t}`,
            });
            asserts.fail('expected COLUMN_NOT_FOUND');
          } catch (e) {
            asserts.assertInstanceOf(e, EngineError);
            asserts.assertEquals((e as EngineError).code, 'COLUMN_NOT_FOUND');
          }
        } finally {
          await engine.execute({ sql: `DROP TABLE IF EXISTS ${t}` });
          await engine.disconnect();
        }
      });

      it('SYNTAX_ERROR on bad SQL', async () => {
        const engine = new PostgresEngine('pg-err-syntax', TEST_CONFIG);
        await engine.connect();
        try {
          await engine.execute({ sql: 'SELEKT 1' });
          asserts.fail('expected SYNTAX_ERROR');
        } catch (e) {
          asserts.assertInstanceOf(e, EngineError);
          asserts.assertEquals((e as EngineError).code, 'SYNTAX_ERROR');
        }
        await engine.disconnect();
      });

      it('DUPLICATE_KEY on PK violation', async () => {
        const engine = new PostgresEngine('pg-err-dup', TEST_CONFIG);
        await engine.connect();
        const t = tableName('err_dup');
        try {
          await engine.execute({
            sql: `CREATE TABLE ${t} (id INT PRIMARY KEY, name VARCHAR(100))`,
          });
          await engine.execute({ sql: `INSERT INTO ${t} VALUES (1, 'A')` });
          try {
            await engine.execute({ sql: `INSERT INTO ${t} VALUES (1, 'B')` });
            asserts.fail('expected DUPLICATE_KEY');
          } catch (e) {
            asserts.assertInstanceOf(e, EngineError);
            asserts.assertEquals((e as EngineError).code, 'DUPLICATE_KEY');
          }
        } finally {
          await engine.execute({ sql: `DROP TABLE IF EXISTS ${t}` });
          await engine.disconnect();
        }
      });

      it('NOT_NULL_VIOLATION on missing required column', async () => {
        const engine = new PostgresEngine('pg-err-nn', TEST_CONFIG);
        await engine.connect();
        const t = tableName('err_nn');
        try {
          await engine.execute({
            sql:
              `CREATE TABLE ${t} (id INT NOT NULL PRIMARY KEY, name VARCHAR(100) NOT NULL)`,
          });
          try {
            await engine.execute({ sql: `INSERT INTO ${t} (id) VALUES (1)` });
            asserts.fail('expected NOT_NULL_VIOLATION');
          } catch (e) {
            asserts.assertInstanceOf(e, EngineError);
            asserts.assertEquals(
              (e as EngineError).code,
              'NOT_NULL_VIOLATION',
            );
          }
        } finally {
          await engine.execute({ sql: `DROP TABLE IF EXISTS ${t}` });
          await engine.disconnect();
        }
      });

      it('MISSING_PARAMETERS when a placeholder lacks a param', async () => {
        const engine = new PostgresEngine('pg-err-params', TEST_CONFIG);
        await engine.connect();
        try {
          await engine.execute({ sql: 'SELECT :foo: AS v', params: {} });
          asserts.fail('expected MISSING_PARAMETERS');
        } catch (e) {
          asserts.assertInstanceOf(e, EngineError);
          asserts.assertEquals((e as EngineError).code, 'MISSING_PARAMETERS');
        }
        await engine.disconnect();
      });
    });

    describe('transactions', () => {
      it('commit persists changes', async () => {
        const engine = new PostgresEngine('pg-tx-commit', TEST_CONFIG);
        await engine.connect();
        const t = tableName('tx_commit');
        try {
          await engine.execute({
            sql: `CREATE TABLE ${t} (id INT PRIMARY KEY)`,
          });
          const tx = await engine.transaction();
          await tx.execute({
            sql: `INSERT INTO ${t} VALUES (:id:)`,
            params: { id: 1 },
          });
          await tx.commit();
          const r = await engine.execute({
            sql: `SELECT COUNT(*) AS n FROM ${t}`,
          });
          asserts.assertEquals(Number((r.data[0] as { n: unknown }).n), 1);
        } finally {
          await engine.execute({ sql: `DROP TABLE IF EXISTS ${t}` });
          await engine.disconnect();
        }
      });

      it('rollback discards changes', async () => {
        const engine = new PostgresEngine('pg-tx-rollback', TEST_CONFIG);
        await engine.connect();
        const t = tableName('tx_rollback');
        try {
          await engine.execute({
            sql: `CREATE TABLE ${t} (id INT PRIMARY KEY)`,
          });
          const tx = await engine.transaction();
          await tx.execute({
            sql: `INSERT INTO ${t} VALUES (:id:)`,
            params: { id: 1 },
          });
          await tx.rollback();
          const r = await engine.execute({
            sql: `SELECT COUNT(*) AS n FROM ${t}`,
          });
          asserts.assertEquals(Number((r.data[0] as { n: unknown }).n), 0);
        } finally {
          await engine.execute({ sql: `DROP TABLE IF EXISTS ${t}` });
          await engine.disconnect();
        }
      });

      it('auto-rollback on query failure inside transaction', async () => {
        const engine = new PostgresEngine('pg-tx-auto', TEST_CONFIG);
        await engine.connect();
        const t = tableName('tx_auto');
        try {
          await engine.execute({
            sql:
              `CREATE TABLE ${t} (id INT PRIMARY KEY, name VARCHAR(100) NOT NULL)`,
          });
          const tx = await engine.transaction();
          await tx.execute({ sql: `INSERT INTO ${t} VALUES (1, 'A')` });
          await asserts.assertRejects(
            () => tx.execute({ sql: `INSERT INTO ${t} VALUES (1, 'B')` }),
            EngineError,
          );
          await tx.rollback();
          const r = await engine.execute({
            sql: `SELECT COUNT(*) AS n FROM ${t}`,
          });
          asserts.assertEquals(Number((r.data[0] as { n: unknown }).n), 0);
        } finally {
          await engine.execute({ sql: `DROP TABLE IF EXISTS ${t}` });
          await engine.disconnect();
        }
      });

      it('idempotent commit/rollback after end', async () => {
        const engine = new PostgresEngine('pg-tx-idem', TEST_CONFIG);
        await engine.connect();
        const tx = await engine.transaction();
        await tx.commit();
        await tx.commit();
        await tx.rollback();
        await engine.disconnect();
      });
    });

    describe('transaction API forms', () => {
      it('beginTransaction + execute(transactionId) + commitTransaction', async () => {
        const engine = new PostgresEngine('pg-txform-1', TEST_CONFIG);
        await engine.connect();
        const t = tableName('txform_commit');
        try {
          await engine.execute({
            sql: `CREATE TABLE ${t} (id INT PRIMARY KEY)`,
          });
          const id = await engine.beginTransaction();
          await engine.execute({
            sql: `INSERT INTO ${t} VALUES (:id:)`,
            params: { id: 1 },
            transactionId: id,
          });
          await engine.execute({
            sql: `INSERT INTO ${t} VALUES (:id:)`,
            params: { id: 2 },
            transactionId: id,
          });
          await engine.commitTransaction(id);
          const r = await engine.execute({
            sql: `SELECT COUNT(*) AS n FROM ${t}`,
          });
          asserts.assertEquals(Number((r.data[0] as { n: unknown }).n), 2);
        } finally {
          await engine.execute({ sql: `DROP TABLE IF EXISTS ${t}` });
          await engine.disconnect();
        }
      });

      it('beginTransaction + execute(transactionId) + rollbackTransaction', async () => {
        const engine = new PostgresEngine('pg-txform-2', TEST_CONFIG);
        await engine.connect();
        const t = tableName('txform_rollback');
        try {
          await engine.execute({
            sql: `CREATE TABLE ${t} (id INT PRIMARY KEY)`,
          });
          const id = await engine.beginTransaction();
          await engine.execute({
            sql: `INSERT INTO ${t} VALUES (:id:)`,
            params: { id: 1 },
            transactionId: id,
          });
          await engine.rollbackTransaction(id);
          const r = await engine.execute({
            sql: `SELECT COUNT(*) AS n FROM ${t}`,
          });
          asserts.assertEquals(Number((r.data[0] as { n: unknown }).n), 0);
        } finally {
          await engine.execute({ sql: `DROP TABLE IF EXISTS ${t}` });
          await engine.disconnect();
        }
      });

      it('named transactions: beginTransaction({name}) reuses the supplied id', async () => {
        const engine = new PostgresEngine('pg-txform-3', TEST_CONFIG);
        await engine.connect();
        try {
          const id = await engine.beginTransaction({ name: 'my-named-tx' });
          asserts.assertEquals(id, 'my-named-tx');
          await engine.execute({ sql: 'SELECT 1', transactionId: id });
          await engine.commitTransaction(id);
        } finally {
          await engine.disconnect();
        }
      });

      it('TRANSACTION_NOT_FOUND when execute references an unknown transactionId', async () => {
        const engine = new PostgresEngine('pg-txform-4', TEST_CONFIG);
        await engine.connect();
        try {
          await engine.execute({
            sql: 'SELECT 1',
            transactionId: 'nonexistent-tx-id',
          });
          asserts.fail('expected TRANSACTION_NOT_FOUND');
        } catch (e) {
          asserts.assertInstanceOf(e, EngineError);
          asserts.assertEquals(
            (e as EngineError).code,
            'TRANSACTION_NOT_FOUND',
          );
        }
        await engine.disconnect();
      });

      it('autoRollbackOnFailure rolls back the txn when a query fails inside it', async () => {
        const engine = new PostgresEngine('pg-txform-5', TEST_CONFIG);
        await engine.connect();
        const t = tableName('txform_autoroll');
        try {
          await engine.execute({
            sql:
              `CREATE TABLE ${t} (id INT PRIMARY KEY, name VARCHAR(100) NOT NULL)`,
          });
          const id = await engine.beginTransaction();
          await engine.execute({
            sql: `INSERT INTO ${t} VALUES (:id:, :n:)`,
            params: { id: 1, n: 'A' },
            transactionId: id,
          });
          // NOT NULL violation — should auto-rollback the transaction.
          await asserts.assertRejects(
            () =>
              engine.execute({
                sql: `INSERT INTO ${t} (id) VALUES (:id:)`,
                params: { id: 2 },
                transactionId: id,
              }),
            EngineError,
          );
          // Subsequent execute on the same id must error — txn is gone.
          await asserts.assertRejects(
            () =>
              engine.execute({
                sql: 'SELECT 1',
                transactionId: id,
              }),
            EngineError,
          );
          // Original row should not have persisted.
          const r = await engine.execute({
            sql: `SELECT COUNT(*) AS n FROM ${t}`,
          });
          asserts.assertEquals(Number((r.data[0] as { n: unknown }).n), 0);
        } finally {
          await engine.execute({ sql: `DROP TABLE IF EXISTS ${t}` });
          await engine.disconnect();
        }
      });

      it('rollbackAllTransactions clears every active transaction', async () => {
        // Two simultaneous transactions need at least two pool connections.
        const engine = new PostgresEngine('pg-txform-6', {
          ...TEST_CONFIG,
          pool: { min: 2, max: 4 },
        });
        await engine.connect();
        try {
          const a = await engine.beginTransaction();
          const b = await engine.beginTransaction();
          await engine.execute({ sql: 'SELECT 1', transactionId: a });
          await engine.execute({ sql: 'SELECT 1', transactionId: b });
          await engine.rollbackAllTransactions();
          // Both ids must now be unknown.
          await asserts.assertRejects(
            () => engine.execute({ sql: 'SELECT 1', transactionId: a }),
            EngineError,
          );
          await asserts.assertRejects(
            () => engine.execute({ sql: 'SELECT 1', transactionId: b }),
            EngineError,
          );
        } finally {
          await engine.disconnect();
        }
      });

      it('transactionTimeout auto-rolls back a stale transaction', async () => {
        const engine = new PostgresEngine('pg-txform-7', TEST_CONFIG);
        await engine.connect();
        const t = tableName('txform_timeout');
        try {
          await engine.execute({
            sql: `CREATE TABLE ${t} (id INT PRIMARY KEY)`,
          });
          // Override the default 120s timeout for this txn — 1 second is
          // long enough to BEGIN + INSERT, short enough to expire before
          // we attempt to commit.
          const id = await engine.beginTransaction({ timeout: 1 });
          await engine.execute({
            sql: `INSERT INTO ${t} VALUES (:id:)`,
            params: { id: 1 },
            transactionId: id,
          });
          // Wait past the timeout.
          await new Promise((r) => setTimeout(r, 1500));
          // Commit must error — transaction was timed-out and rolled back.
          await engine.commitTransaction(id);
          // Insert must not have persisted.
          const r = await engine.execute({
            sql: `SELECT COUNT(*) AS n FROM ${t}`,
          });
          asserts.assertEquals(Number((r.data[0] as { n: unknown }).n), 0);
        } finally {
          await engine.execute({ sql: `DROP TABLE IF EXISTS ${t}` });
          await engine.disconnect();
        }
      });
    });

    describe('stats and events', () => {
      it('query stats accumulate', async () => {
        const engine = new PostgresEngine('pg-stat-1', TEST_CONFIG);
        await engine.execute({ sql: 'SELECT 1 AS v' });
        await engine.execute({ sql: 'SELECT 2 AS v' });
        await engine.execute({ sql: 'SELECT 3 AS v' });
        const s = engine.stats;
        asserts.assert(s.query.totalQueries >= 3);
        asserts.assert(s.query.successfulQueries >= 3);
        asserts.assertEquals(s.query.failedQueries, 0);
        await engine.disconnect();
      });

      it('failed queries are counted', async () => {
        const engine = new PostgresEngine('pg-stat-2', TEST_CONFIG);
        try {
          await engine.execute({ sql: 'SELEKT 1' });
        } catch {
          /* expected */
        }
        asserts.assert(engine.stats.query.failedQueries >= 1);
        await engine.disconnect();
      });

      it('query event fires for every execute', async () => {
        const events: number[] = [];
        const engine = new PostgresEngine('pg-evt-1', TEST_CONFIG);
        // deno-lint-ignore no-explicit-any
        (engine as any).on('query', () => events.push(1));
        await engine.execute({ sql: 'SELECT 1' });
        await engine.execute({ sql: 'SELECT 2' });
        await engine.disconnect();
        asserts.assertEquals(events.length, 2);
      });
    });
  },
});
