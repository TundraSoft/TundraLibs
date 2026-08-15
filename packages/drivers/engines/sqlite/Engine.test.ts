import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import {
  makeDir,
  makeTempDir,
  removeDir,
  writeTextFile,
} from '@tundralibs/compat/file';
import { SQLiteEngine } from './Engine.ts';
import type { SqliteDb } from './adapter.ts';
import { EngineError } from '../../errors/mod.ts';
import type { EngineQuery } from '../../types/mod.ts';

// SQLite is embedded — always available IF the runtime's native binding is
// loadable. On Node.js: `node:sqlite` (built-in, Node 22.5+) or
// `better-sqlite3` (optional dep). When neither is available, skip.
const TEST_CONFIG = { path: ':memory:' };

async function isSqliteAvailable(): Promise<boolean> {
  try {
    const probe = new SQLiteEngine('sqlite-probe', TEST_CONFIG);
    await probe.connect();
    await probe.disconnect();
    return true;
  } catch {
    return false;
  }
}

const sqliteAvailable = await isSqliteAvailable();

let _t = 0;
const tableName = (label: string): string =>
  `tundra_sqlite_${label.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}_${++_t}`;

// ---------------------------------------------------------------------------
// Engine-specific behaviour.
// ---------------------------------------------------------------------------
describe({
  name: 'drivers.SQLiteEngine',
  // jsr:@db/sqlite loads libsqlite via FFI and doesn't unload it inside a
  // single test step; Deno's strict resource sanitizer flags this even
  // though the library is owned by the runtime.
  sanitizeResources: false,
  sanitizeOps: false,
  fn: () => {
    describe('configuration', () => {
      it('should expose Engine and Capabilities', () => {
        const engine = new SQLiteEngine('cfg-1', TEST_CONFIG);
        asserts.assertEquals(engine.Engine, 'SQLITE');
        asserts.assertEquals(engine.Capabilities.transactions, true);
        asserts.assertEquals(engine.Capabilities.preparedStatements, true);
      });

      it('should require path', () => {
        asserts.assertThrows(
          // deno-lint-ignore no-explicit-any
          () => new SQLiteEngine('cfg-2', {} as any),
          EngineError,
          'path',
        );
      });
    });
  },
});

// ---------------------------------------------------------------------------
// Error-code mapping (NO live DB). Feeds synthetic driver-native errors
// (`{ code, message }`) through the protected `_wrapDriverError` and asserts
// the resulting `EngineError.code`, covering the `_sqliteErrorToCode` branches
// (both code-keyed and message-keyed) the live suite rarely reaches. No
// database handle is opened — construction is lazy and these calls are pure.
// ---------------------------------------------------------------------------
class ProbeSqliteEngine extends SQLiteEngine {
  public wrapError(error: unknown, query: EngineQuery): EngineError {
    return this._wrapDriverError(error, query);
  }
}

describe({
  name: 'drivers.SQLiteEngine.error-mapping (no DB)',
  sanitizeResources: false,
  sanitizeOps: false,
  fn: () => {
    const engine = new ProbeSqliteEngine('sqlite-errmap', TEST_CONFIG);
    const q: EngineQuery = { sql: 'SELECT 1' };
    const codeFor = (code: string | undefined, message: string): string =>
      engine.wrapError({ code, message }, q).code;

    it('maps SQLite constraint / status codes to EngineError codes', () => {
      const cases: Array<[string, string]> = [
        ['SQLITE_CONSTRAINT_UNIQUE', 'DUPLICATE_KEY'],
        ['SQLITE_CONSTRAINT_PRIMARYKEY', 'DUPLICATE_KEY'],
        ['SQLITE_CONSTRAINT_FOREIGNKEY', 'FOREIGN_KEY_VIOLATION'],
        ['SQLITE_CONSTRAINT_NOTNULL', 'NOT_NULL_VIOLATION'],
        ['SQLITE_CONSTRAINT_CHECK', 'CHECK_VIOLATION'],
        ['SQLITE_READONLY', 'PERMISSION_DENIED'],
      ];
      for (const [code, expected] of cases) {
        asserts.assertEquals(
          codeFor(code, 'synthetic'),
          expected,
          `${code} should map to ${expected}`,
        );
      }
    });

    it('maps by message text when no driver code is present', () => {
      const cases: Array<[string, string]> = [
        ['UNIQUE constraint failed: t.c', 'DUPLICATE_KEY'],
        ['FOREIGN KEY constraint failed', 'FOREIGN_KEY_VIOLATION'],
        ['NOT NULL constraint failed: t.c', 'NOT_NULL_VIOLATION'],
        ['CHECK constraint failed: t', 'CHECK_VIOLATION'],
        ['no such table: widgets', 'TABLE_NOT_FOUND'],
        ['no such column: qty', 'COLUMN_NOT_FOUND'],
        ['near "SELEKT": syntax error', 'SYNTAX_ERROR'],
        ['attempt to write a readonly database', 'PERMISSION_DENIED'],
      ];
      for (const [message, expected] of cases) {
        asserts.assertEquals(
          codeFor(undefined, message),
          expected,
          `"${message}" should map to ${expected}`,
        );
      }
    });

    it('maps an unrecognized error to QUERY_EXECUTION_FAILED', () => {
      asserts.assertEquals(
        codeFor('SQLITE_ERROR', 'database disk image is malformed'),
        'QUERY_EXECUTION_FAILED',
      );
    });

    it('extracts the table name into metadata for no-such-table', () => {
      const err = engine.wrapError(
        { code: undefined, message: 'no such table: widgets' },
        q,
      );
      asserts.assertInstanceOf(err, EngineError);
      asserts.assertEquals(err.code, 'TABLE_NOT_FOUND');
      asserts.assertEquals(
        (err.context as Record<string, unknown>).table,
        'widgets',
      );
    });

    it('lifts constraint / column names into metadata (resolves the template placeholder)', () => {
      // UNIQUE / CHECK fill `${constraint}`; NOT NULL fills `${column}`. Without
      // this the EngineError template renders a literal `${constraint}` /
      // `${column}` (onMissing:'literal') and the context field stays undefined.
      const dup = engine.wrapError(
        {
          code: 'SQLITE_CONSTRAINT_UNIQUE',
          message: 'UNIQUE constraint failed: users.email',
        },
        q,
      );
      asserts.assertEquals(dup.code, 'DUPLICATE_KEY');
      asserts.assertEquals(
        (dup.context as Record<string, unknown>).constraint,
        'users.email',
      );
      asserts.assert(
        !dup.message.includes('${'),
        `message must not keep a literal placeholder: ${dup.message}`,
      );

      const nn = engine.wrapError(
        {
          code: 'SQLITE_CONSTRAINT_NOTNULL',
          message: 'NOT NULL constraint failed: users.name',
        },
        q,
      );
      asserts.assertEquals(nn.code, 'NOT_NULL_VIOLATION');
      asserts.assertEquals(
        (nn.context as Record<string, unknown>).column,
        'users.name',
      );

      const chk = engine.wrapError(
        {
          code: 'SQLITE_CONSTRAINT_CHECK',
          message: 'CHECK constraint failed: age_positive',
        },
        q,
      );
      asserts.assertEquals(chk.code, 'CHECK_VIOLATION');
      asserts.assertEquals(
        (chk.context as Record<string, unknown>).constraint,
        'age_positive',
      );
    });

    it('returns an EngineError argument unchanged', () => {
      const original = new EngineError('DUPLICATE_KEY', {
        instanceId: 'SQLITE::sqlite-errmap',
      });
      asserts.assertStrictEquals(engine.wrapError(original, q), original);
    });
  },
});

describe({
  name: 'drivers.SQLiteEngine.engine-specific',
  ignore: !sqliteAvailable,
  sanitizeResources: false,
  sanitizeOps: false,
  fn: () => {
    describe('SQLite-specific behaviour', () => {
      it('handles :memory: databases independently per instance', async () => {
        const a = new SQLiteEngine('mem-a', { path: ':memory:' });
        const b = new SQLiteEngine('mem-b', { path: ':memory:' });
        await a.execute({ sql: 'CREATE TABLE t (id INT PRIMARY KEY)' });
        await a.execute({ sql: 'INSERT INTO t VALUES (1)' });
        try {
          await b.execute({ sql: 'SELECT * FROM t' });
          asserts.fail('second :memory: should not see the first one');
        } catch (e) {
          asserts.assertInstanceOf(e, EngineError);
          asserts.assertEquals((e as EngineError).code, 'TABLE_NOT_FOUND');
        }
        await a.disconnect();
        await b.disconnect();
      });

      it('UNIQUE constraint violation maps to DUPLICATE_KEY', async () => {
        const engine = new SQLiteEngine('uniq-1', TEST_CONFIG);
        await engine.execute({
          sql: 'CREATE TABLE u (id INTEGER PRIMARY KEY, name TEXT UNIQUE)',
        });
        await engine.execute({
          sql: 'INSERT INTO u VALUES (1, :n:)',
          params: { n: 'A' },
        });
        try {
          await engine.execute({
            sql: 'INSERT INTO u VALUES (2, :n:)',
            params: { n: 'A' },
          });
          asserts.fail('expected DUPLICATE_KEY');
        } catch (e) {
          asserts.assertInstanceOf(e, EngineError);
          asserts.assertEquals((e as EngineError).code, 'DUPLICATE_KEY');
        }
        await engine.disconnect();
      });

      it('transaction(fn): commit persists, rollback vanishes, nested savepoint recovers a SQL error', async () => {
        const engine = new SQLiteEngine('cb-live', { path: ':memory:' });
        await engine.execute({
          sql: 'CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT)',
        });

        // Committed callback:
        await engine.transaction((tx) =>
          tx.execute({
            sql: 'INSERT INTO t VALUES (1, :n:)',
            params: { n: 'kept' },
          })
        );

        // Rolled-back callback (throw):
        await asserts.assertRejects(() =>
          engine.transaction(async (tx) => {
            await tx.execute({
              sql: 'INSERT INTO t VALUES (2, :n:)',
              params: { n: 'doomed' },
            });
            throw new Error('boom');
          })
        );

        // Nested savepoint recovers a REAL pk collision — outer survives:
        await engine.transaction(async (tx) => {
          await tx.execute({
            sql: 'INSERT INTO t VALUES (3, :n:)',
            params: { n: 'outer' },
          });
          await asserts.assertRejects(() =>
            tx.transaction(async (sp) => {
              await sp.execute({
                sql: 'INSERT INTO t VALUES (4, :n:)',
                params: { n: 'inner' },
              });
              await sp.execute({ // pk 3 already exists → SQL failure
                sql: 'INSERT INTO t VALUES (3, :n:)',
                params: { n: 'dup' },
              });
            })
          );
          await tx.execute({
            sql: 'INSERT INTO t VALUES (5, :n:)',
            params: { n: 'after' },
          });
        });

        const rows = await engine.execute<{ name: string }>({
          sql: 'SELECT name FROM t ORDER BY id',
        });
        // kept (committed), outer + after (third tx), everything doomed /
        // inner rolled away:
        asserts.assertEquals(rows.data.map((r) => r.name), [
          'kept',
          'outer',
          'after',
        ]);
        await engine.disconnect();
      });

      it('transaction(fn): arbitrary-depth nesting — all-successful blocks fold in and commit', async () => {
        const engine = new SQLiteEngine('cb-deep', { path: ':memory:' });
        await engine.execute({
          sql: 'CREATE TABLE d (id INTEGER PRIMARY KEY, name TEXT)',
        });

        const out = await engine.transaction(async (tx) => {
          await tx.execute({
            sql: 'INSERT INTO d VALUES (1, :n:)',
            params: { n: 'lvl0' },
          });
          return await tx.transaction(async (sp1) => { // depth 1
            await sp1.execute({
              sql: 'INSERT INTO d VALUES (2, :n:)',
              params: { n: 'lvl1' },
            });
            return await sp1.transaction(async (sp2) => { // depth 2
              asserts.assertStrictEquals(sp2.id, tx.id); // one engine tx
              await sp2.execute({
                sql: 'INSERT INTO d VALUES (3, :n:)',
                params: { n: 'lvl2' },
              });
              return 'deep';
            });
          });
        });
        asserts.assertStrictEquals(out, 'deep'); // value bubbles up

        const rows = await engine.execute<{ name: string }>({
          sql: 'SELECT name FROM d ORDER BY id',
        });
        // every nested block released into the one commit:
        asserts.assertEquals(rows.data.map((r) => r.name), [
          'lvl0',
          'lvl1',
          'lvl2',
        ]);
        await engine.disconnect();
      });
    });
  },
});

// ---------------------------------------------------------------------------
// SQL scenarios (same script as the other SQL engines, inlined per file).
// SQLite has no TRUNCATE — the truncate test is omitted.
// ---------------------------------------------------------------------------
describe({
  name: 'drivers.SQLiteEngine.sql',
  ignore: !sqliteAvailable,
  sanitizeResources: false,
  sanitizeOps: false,
  fn: () => {
    describe('lifecycle', () => {
      it('should connect, ping, and disconnect', async () => {
        const engine = new SQLiteEngine('sqlite-life-1', TEST_CONFIG);
        await engine.connect();
        asserts.assertEquals(engine.status, 'READY');
        asserts.assertEquals(await engine.ping(), true);
        await engine.disconnect();
        asserts.assertEquals(engine.status, 'CLOSED');
      });

      it('should be idempotent on repeated connect/disconnect', async () => {
        const engine = new SQLiteEngine('sqlite-life-2', TEST_CONFIG);
        await engine.connect();
        await engine.connect();
        await engine.disconnect();
        await engine.disconnect();
        asserts.assertEquals(engine.status, 'CLOSED');
      });

      it('should auto-connect on first execute', async () => {
        const engine = new SQLiteEngine('sqlite-life-3', TEST_CONFIG);
        asserts.assertEquals(engine.status, 'CLOSED');
        const r = await engine.execute({ sql: 'SELECT 1 AS v' });
        asserts.assertEquals(engine.status, 'READY');
        asserts.assertEquals(r.data.length, 1);
        await engine.disconnect();
      });
    });

    describe('DDL', () => {
      it('should CREATE and DROP a table', async () => {
        const engine = new SQLiteEngine('sqlite-ddl-1', TEST_CONFIG);
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
        const engine = new SQLiteEngine('sqlite-ddl-2', TEST_CONFIG);
        await engine.connect();
        await engine.execute({
          sql: `DROP TABLE IF EXISTS ${tableName('ddl_missing')}`,
        });
        await engine.disconnect();
      });
    });

    describe('CRUD on users table', () => {
      const seed = async (engine: SQLiteEngine, t: string): Promise<void> => {
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
        const engine = new SQLiteEngine('sqlite-crud-insert', TEST_CONFIG);
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
        const engine = new SQLiteEngine('sqlite-crud-select-all', TEST_CONFIG);
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
        const engine = new SQLiteEngine('sqlite-crud-where', TEST_CONFIG);
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
        const engine = new SQLiteEngine('sqlite-crud-orderby', TEST_CONFIG);
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
        const engine = new SQLiteEngine('sqlite-crud-limit', TEST_CONFIG);
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
        const engine = new SQLiteEngine('sqlite-crud-update', TEST_CONFIG);
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
        const engine = new SQLiteEngine('sqlite-crud-delete', TEST_CONFIG);
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
    });

    describe('type round-trips', () => {
      it('string / integer / null', async () => {
        const engine = new SQLiteEngine('sqlite-types-1', TEST_CONFIG);
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
        const engine = new SQLiteEngine('sqlite-types-utf8', TEST_CONFIG);
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
        const engine = new SQLiteEngine('sqlite-err-table', TEST_CONFIG);
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
        const engine = new SQLiteEngine('sqlite-err-column', TEST_CONFIG);
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
        const engine = new SQLiteEngine('sqlite-err-syntax', TEST_CONFIG);
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
        const engine = new SQLiteEngine('sqlite-err-dup', TEST_CONFIG);
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
        const engine = new SQLiteEngine('sqlite-err-nn', TEST_CONFIG);
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
        const engine = new SQLiteEngine('sqlite-err-params', TEST_CONFIG);
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

      it('OPERATION_FAILED (not raw RangeError) on an Invalid Date param', async () => {
        // The Date encoder runs inside `_standardizeQuery`, OUTSIDE execute()'s
        // try/catch, so an Invalid Date's `toISOString()` RangeError would
        // escape the `@throws {EngineError}` contract. The guard turns it into a
        // typed EngineError (parity with the Postgres binary encoder).
        const engine = new SQLiteEngine('sqlite-err-invalid-date', TEST_CONFIG);
        await engine.connect();
        try {
          await engine.execute({
            sql: 'SELECT :d: AS v',
            params: { d: new Date('not-a-date') },
          });
          asserts.fail('expected an EngineError for an Invalid Date param');
        } catch (e) {
          asserts.assertInstanceOf(e, EngineError); // not a raw RangeError
          asserts.assertEquals((e as EngineError).code, 'OPERATION_FAILED');
        } finally {
          await engine.disconnect();
        }
      });
    });

    describe('transactions', () => {
      it('commit persists changes', async () => {
        const engine = new SQLiteEngine('sqlite-tx-commit', TEST_CONFIG);
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
        const engine = new SQLiteEngine('sqlite-tx-rollback', TEST_CONFIG);
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
        const engine = new SQLiteEngine('sqlite-tx-auto', TEST_CONFIG);
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
        const engine = new SQLiteEngine('sqlite-tx-idem', TEST_CONFIG);
        await engine.connect();
        const tx = await engine.transaction();
        await tx.commit();
        await tx.commit();
        await tx.rollback();
        await engine.disconnect();
      });
    });

    describe('transaction API forms', () => {
      // SQLite forces min=max=1 (file-locked), so concurrent transactions
      // are not exercised here. The single-tx path is what matters.

      it('beginTransaction + execute(transactionId) + commitTransaction', async () => {
        const engine = new SQLiteEngine('sqlite-txform-1', TEST_CONFIG);
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
        const engine = new SQLiteEngine('sqlite-txform-2', TEST_CONFIG);
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
        const engine = new SQLiteEngine('sqlite-txform-3', TEST_CONFIG);
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
        const engine = new SQLiteEngine('sqlite-txform-4', TEST_CONFIG);
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
        const engine = new SQLiteEngine('sqlite-txform-5', TEST_CONFIG);
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
          await asserts.assertRejects(
            () =>
              engine.execute({
                sql: `INSERT INTO ${t} (id) VALUES (:id:)`,
                params: { id: 2 },
                transactionId: id,
              }),
            EngineError,
          );
          await asserts.assertRejects(
            () =>
              engine.execute({
                sql: 'SELECT 1',
                transactionId: id,
              }),
            EngineError,
          );
          const r = await engine.execute({
            sql: `SELECT COUNT(*) AS n FROM ${t}`,
          });
          asserts.assertEquals(Number((r.data[0] as { n: unknown }).n), 0);
        } finally {
          await engine.execute({ sql: `DROP TABLE IF EXISTS ${t}` });
          await engine.disconnect();
        }
      });

      it('transactionTimeout auto-rolls back a stale transaction', async () => {
        const engine = new SQLiteEngine('sqlite-txform-7', TEST_CONFIG);
        await engine.connect();
        const t = tableName('txform_timeout');
        try {
          await engine.execute({
            sql: `CREATE TABLE ${t} (id INT PRIMARY KEY)`,
          });
          const id = await engine.beginTransaction({ timeout: 1 });
          await engine.execute({
            sql: `INSERT INTO ${t} VALUES (:id:)`,
            params: { id: 1 },
            transactionId: id,
          });
          await new Promise((r) => setTimeout(r, 1500));
          await engine.commitTransaction(id);
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
        const engine = new SQLiteEngine('sqlite-stat-1', TEST_CONFIG);
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
        const engine = new SQLiteEngine('sqlite-stat-2', TEST_CONFIG);
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
        const engine = new SQLiteEngine('sqlite-evt-1', TEST_CONFIG);
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

// ---------------------------------------------------------------------------
// Directory-mode resource cleanup: a per-file ATTACH failure must not leak
// the freshly opened main.db handle.
// ---------------------------------------------------------------------------
describe({
  name: 'drivers.SQLiteEngine.attach-leak',
  ignore: !sqliteAvailable,
  sanitizeResources: false,
  sanitizeOps: false,
  fn: () => {
    it('closes the opened handle when a per-file ATTACH throws', async () => {
      // Subclass that counts close() calls on the handle it opens.
      class SpyEngine extends SQLiteEngine {
        public mainDbCloses = 0;
        protected override async _openDatabase(
          path: string,
          options: { readonly?: boolean; create?: boolean },
        ): Promise<SqliteDb> {
          const db = await super._openDatabase(path, options);
          if (path.endsWith('main.db')) {
            const realClose = db.close.bind(db);
            db.close = () => {
              this.mainDbCloses++;
              realClose();
            };
          }
          return db;
        }
      }

      const root = await makeTempDir({ prefix: 'drivers-sqlite-attach-' });
      const dir = `${root}/spy`;
      await makeDir(dir, { recursive: true });
      // Plant a corrupt `.db` file so the auto-ATTACH loop throws.
      await writeTextFile(`${dir}/broken.db`, 'not a sqlite database');

      const engine = new SpyEngine('spy', { path: root });
      await asserts.assertRejects(() => engine.connect(), EngineError);

      // The main.db handle opened before the failed ATTACH must be closed,
      // not leaked.
      asserts.assertEquals(engine.mainDbCloses, 1);

      await engine.disconnect();
      await removeDir(root, { recursive: true }).catch(() => {});
    });
  },
});
