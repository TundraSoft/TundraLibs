import { describe, it } from '@tundralibs/compat/test';
import {
  assert,
  assertEquals,
  assertInstanceOf,
  assertRejects,
  assertThrows,
} from '@std/asserts';
import { D1Engine } from './Engine.ts';
import type { D1HttpClient } from './D1HttpClient.ts';
import { D1HttpError } from './D1HttpError.ts';
import { EngineError } from '../../errors/mod.ts';
import type { EngineQuery } from '../../types/mod.ts';
import type { D1QueryResult } from './types/mod.ts';

const ACCOUNT_ID = 'acct-123';
const DATABASE_ID = 'db-abc';
const TOKEN = 'cf-sup3r-s3cret-token';

const EMPTY_RESULT: D1QueryResult = {
  results: [],
  meta: { changes: 0, lastRowId: null },
};

/**
 * A fake `D1HttpClient` — records the `(sql, params)` it received and returns a
 * scripted `{ results, meta }` (or rejects with a scripted error). No network.
 */
class StubClient {
  public lastSql: string | null = null;
  public lastParams: readonly unknown[] = [];
  public callCount = 0;
  public result: D1QueryResult = EMPTY_RESULT;
  public error: unknown = null;

  // deno-lint-ignore require-await
  public async query<R = Record<string, unknown>>(
    sql: string,
    params: readonly unknown[] = [],
  ): Promise<D1QueryResult<R>> {
    this.callCount++;
    this.lastSql = sql;
    this.lastParams = params;
    if (this.error) throw this.error;
    return this.result as unknown as D1QueryResult<R>;
  }
}

/**
 * `D1Engine` wired to a {@link StubClient} instead of a real HTTP client, with
 * the protected hooks re-exposed for direct assertion.
 */
class TestD1Engine extends D1Engine {
  public stub = new StubClient();

  protected override _open(): void {
    this._resource = this.stub as unknown as D1HttpClient;
  }

  public std(q: EngineQuery): EngineQuery {
    return this._standardizeQuery(q);
  }
  public wrap(e: unknown, q: EngineQuery): EngineError {
    return this._wrapDriverError(e, q);
  }
  public enc(v: unknown): unknown {
    return this._encodeValue(v);
  }
}

const makeEngine = (): TestD1Engine =>
  new TestD1Engine('d1-test', {
    accountId: ACCOUNT_ID,
    databaseId: DATABASE_ID,
    apiToken: TOKEN,
  });

describe('drivers.engines.d1.D1Engine', () => {
  describe('configuration', () => {
    it('exposes D1 identity, sqlite Dialect, and honest capabilities', () => {
      const eng = makeEngine();
      assertEquals(eng.Engine, 'D1');
      assertEquals(eng.Dialect, 'sqlite');
      assertEquals(eng.Capabilities.pooledConnections, false);
      assertEquals(eng.Capabilities.transactions, false);
      assertEquals(eng.Capabilities.preparedStatements, false);
      assertEquals(eng.Capabilities.advisoryLock, false);
      assertEquals(eng.Capabilities.inPlaceAlter, false);
      assertEquals(eng.Capabilities.referentialActions, true);
      // We emit positional `?` ourselves, so no base placeholder rewrite.
      assertEquals(eng.Capabilities.parameterReplacement, undefined);
    });

    it('requires accountId, databaseId, and apiToken', () => {
      for (
        const opts of [
          { databaseId: DATABASE_ID, apiToken: TOKEN },
          { accountId: ACCOUNT_ID, apiToken: TOKEN },
          { accountId: ACCOUNT_ID, databaseId: DATABASE_ID },
        ]
      ) {
        const err = assertThrows(
          () => new D1Engine('missing', opts as never),
          EngineError,
        );
        assertEquals((err as EngineError).code, 'MISSING_CONFIG_VALUE');
      }
    });

    it('rejects an empty required option with INVALID_CONFIG_VALUE', () => {
      const err = assertThrows(
        () =>
          new D1Engine('empty', {
            accountId: '',
            databaseId: DATABASE_ID,
            apiToken: TOKEN,
          }),
        EngineError,
      );
      assertEquals((err as EngineError).code, 'INVALID_CONFIG_VALUE');
    });

    it("rejects a timeout outside RESTler's 1..120s range at construction", () => {
      for (const bad of [200, 0.5, 0, -1]) {
        const err = assertThrows(
          () =>
            new D1Engine('t', {
              accountId: ACCOUNT_ID,
              databaseId: DATABASE_ID,
              apiToken: TOKEN,
              timeout: bad,
            }),
          EngineError,
        );
        assertEquals((err as EngineError).code, 'INVALID_CONFIG_VALUE');
      }
      const ok = new D1Engine('t', {
        accountId: ACCOUNT_ID,
        databaseId: DATABASE_ID,
        apiToken: TOKEN,
        timeout: 30,
      });
      assertEquals(ok.Engine, 'D1');
    });
  });

  describe('_standardizeQuery (:name: -> positional ?)', () => {
    it('rewrites named placeholders to ? with correct ordering', () => {
      const eng = makeEngine();
      const q = eng.std({
        sql: 'SELECT * FROM t WHERE a = :a: AND b = :b:',
        params: { a: 1, b: 'two' },
      });
      assertEquals(q.sql, 'SELECT * FROM t WHERE a = ? AND b = ?;');
      assertEquals(q.__params, [1, 'two']);
    });

    it('repeats the value for a repeated placeholder (positional cannot dedupe)', () => {
      const eng = makeEngine();
      const q = eng.std({
        sql: 'SELECT * FROM t WHERE a = :a: AND b = :b: AND a2 = :a:',
        params: { a: 1, b: 2 },
      });
      // Three `?` markers, one per occurrence — including the repeated :a:.
      assertEquals(
        q.sql,
        'SELECT * FROM t WHERE a = ? AND b = ? AND a2 = ?;',
      );
      // The value of :a: is pushed once per occurrence: [1, 2, 1].
      assertEquals(q.__params, [1, 2, 1]);
    });

    it('throws MISSING_PARAMETERS for an absent placeholder', () => {
      const eng = makeEngine();
      const err = assertThrows(
        () => eng.std({ sql: 'SELECT :x:', params: {} }),
        EngineError,
      );
      assertEquals((err as EngineError).code, 'MISSING_PARAMETERS');
    });

    it('always stashes a __params array, even with no placeholders', () => {
      const eng = makeEngine();
      const q = eng.std({ sql: 'SELECT 1' });
      assertEquals(q.sql, 'SELECT 1;');
      assertEquals(q.__params, []);
    });
  });

  describe('_encodeValue', () => {
    it('maps each JS type to its D1 JSON param form', () => {
      const eng = makeEngine();
      // null / undefined -> null.
      assertEquals(eng.enc(null), null);
      assertEquals(eng.enc(undefined), null);
      // boolean -> 1 / 0 (SQLite has no boolean).
      assertEquals(eng.enc(true), 1);
      assertEquals(eng.enc(false), 0);
      // number -> number; string -> string.
      assertEquals(eng.enc(42), 42);
      assertEquals(eng.enc(1.5), 1.5);
      assertEquals(eng.enc('hi'), 'hi');
      // Date -> ISO text (parity with the native SQLiteEngine).
      assertEquals(
        eng.enc(new Date('2020-01-02T03:04:05.000Z')),
        '2020-01-02T03:04:05.000Z',
      );
      // Uint8Array -> array of byte numbers (D1's JSON BLOB form).
      assertEquals(eng.enc(new Uint8Array([1, 2, 255])), [1, 2, 255]);
      // plain object / array -> JSON text.
      assertEquals(eng.enc({ a: 1 }), '{"a":1}');
    });

    it('encodes a safe-range bigint to an exact number', () => {
      const eng = makeEngine();
      assertEquals(eng.enc(42n), 42);
      // Number.MAX_SAFE_INTEGER round-trips exactly.
      assertEquals(eng.enc(9007199254740991n), 9007199254740991);
    });

    it('documents the int64 precision loss: an unsafe bigint rounds over JSON', () => {
      const eng = makeEngine();
      // 2^53 + 1 cannot be represented as a JS number — it collapses to 2^53.
      // This is the documented D1/JSON int64 limitation (unlike Turso's Hrana
      // string-encoded integers, JSON numbers cannot carry int64 losslessly).
      assertEquals(eng.enc(9007199254740993n), 9007199254740992);
    });

    it('throws OPERATION_FAILED on an Invalid Date', () => {
      const eng = makeEngine();
      const err = assertThrows(
        () => eng.enc(new Date('nope')),
        EngineError,
      );
      assertEquals((err as EngineError).code, 'OPERATION_FAILED');
    });
  });

  describe('execute + round-trip', () => {
    it('auto-connects a CLOSED engine, sends positional params, surfaces RETURNING rows', async () => {
      const eng = makeEngine();
      assertEquals(eng.status, 'CLOSED');
      eng.stub.result = {
        results: [{ id: 7, name: 'ada' }],
        meta: { changes: 1, lastRowId: 7 },
      };

      const res = await eng.execute({
        sql: 'INSERT INTO users (name) VALUES (:name:) RETURNING id, name',
        params: { name: 'ada' },
      });

      assertEquals(eng.status, 'READY'); // auto-connected
      // RETURNING rows surface; plain-JSON values pass through unchanged.
      assertEquals(res.data, [{ id: 7, name: 'ada' }]);
      // count = returned-row count when rows come back.
      assertEquals(res.count, 1);
      // The stub saw the rewritten SQL and the positional params array.
      assertEquals(
        eng.stub.lastSql,
        'INSERT INTO users (name) VALUES (?) RETURNING id, name;',
      );
      assertEquals(eng.stub.lastParams, ['ada']);
    });

    it("a bare INSERT's count = meta.changes (no rows returned)", async () => {
      const eng = makeEngine();
      eng.stub.result = {
        results: [],
        meta: { changes: 3, lastRowId: 99 },
      };
      const res = await eng.execute({
        sql: 'UPDATE t SET x = 1 WHERE y > :y:',
        params: { y: 0 },
      });
      assertEquals(res.data, []);
      // No rows -> count falls back to the affected-row count.
      assertEquals(res.count, 3);
      assertEquals(eng.stub.lastParams, [0]);
    });

    it('passes read values through and decodes a BLOB (byte array -> Uint8Array)', async () => {
      const eng = makeEngine();
      eng.stub.result = {
        results: [{
          i: 42,
          f: 2.25,
          txt: 'hello',
          nul: null,
          // D1 serializes a BLOB as a JSON array of byte numbers.
          blob: [1, 2, 255],
        }],
        meta: { changes: 0, lastRowId: null },
      };
      const res = await eng.execute({ sql: 'SELECT * FROM t' });
      const row = res.data[0]!;
      assertEquals(row.i, 42);
      assertEquals(row.f, 2.25);
      assertEquals(row.txt, 'hello');
      assertEquals(row.nul, null);
      assertInstanceOf(row.blob, Uint8Array);
      assertEquals(row.blob, new Uint8Array([1, 2, 255]));
      assertEquals(res.count, 1);
    });
  });

  describe('DDL over one-shot HTTP (no transaction)', () => {
    it('createTable executes the statement instead of throwing UNSUPPORTED_OPERATION', async () => {
      const eng = makeEngine();
      const res = await eng.createTable({
        type: 'CREATE_TABLE',
        table: 'edge_ddl',
        columns: {
          id: { type: 'INTEGER', nullable: false },
          name: { type: 'VARCHAR', length: 100, nullable: false },
        },
        primaryKey: ['id'],
        ifNotExists: true,
      });
      // transactions:false -> __runMany runs statements sequentially with no
      // auto-transaction (which would reject with UNSUPPORTED_OPERATION before
      // any statement ran). The stub records the executed CREATE TABLE.
      assertEquals(res.length, 1);
      assertEquals(eng.stub.callCount, 1);
      assert(/CREATE TABLE/i.test(eng.stub.lastSql ?? ''));
    });
  });

  describe('error mapping', () => {
    const q: EngineQuery = { sql: 'INSERT INTO t VALUES (1)' };

    it('maps a UNIQUE-constraint D1HttpError to DUPLICATE_KEY + constraint meta', () => {
      const eng = makeEngine();
      const wrapped = eng.wrap(
        // D1's code is Cloudflare's NUMERIC code; the SQLite detail is in the
        // message. Mapping falls to the message text.
        new D1HttpError('UNIQUE constraint failed: t.x', { code: 7500 }),
        q,
      );
      assertEquals(wrapped.code, 'DUPLICATE_KEY');
      const ctx = wrapped.context as Record<string, unknown>;
      // constraint lifted from the message via the shared pure parser.
      assertEquals(ctx.constraint, 't.x');
      // The numeric D1 code is surfaced as diagnostic meta only.
      assertEquals(ctx.code, 7500);
      assertEquals(ctx.sql, 'INSERT INTO t VALUES (1)');
    });

    it('maps a NOT NULL-constraint D1HttpError to NOT_NULL_VIOLATION + column meta', () => {
      const eng = makeEngine();
      const wrapped = eng.wrap(
        new D1HttpError('NOT NULL constraint failed: t.y', { code: 7500 }),
        q,
      );
      assertEquals(wrapped.code, 'NOT_NULL_VIOLATION');
      const ctx = wrapped.context as Record<string, unknown>;
      assertEquals(ctx.column, 't.y');
    });

    it('maps a no-such-table D1HttpError to TABLE_NOT_FOUND + table meta', () => {
      const eng = makeEngine();
      const wrapped = eng.wrap(
        new D1HttpError('no such table: widgets', { code: 7400, status: 400 }),
        q,
      );
      assertEquals(wrapped.code, 'TABLE_NOT_FOUND');
      const ctx = wrapped.context as Record<string, unknown>;
      assertEquals(ctx.table, 'widgets');
      // The HTTP status is preserved as diagnostic meta.
      assertEquals(ctx.status, 400);
    });

    it('strips the real workerd SQLITE_* decoration before extracting constraint/column/table meta', () => {
      const eng = makeEngine();

      // Real Cloudflare D1 (workerd `dbErrorMessage()`) appends a
      // `: SQLITE_<PRIMARY> [(extended: SQLITE_<EXT>)]` tail to every SQLite
      // error message. Without stripping it, `parseSqliteErrorMeta`'s
      // `([^\s]+)` capture grabs the extra colon (`t.id:` / `t.y:` /
      // `widgets:`). Assert the identifier meta comes out clean (no trailing
      // colon) AND the code still maps correctly. This locks FIX-1 independently
      // of the proxy.

      // UNIQUE (PRIMARY KEY) → DUPLICATE_KEY, constraint 't.id' (no colon).
      const dup = eng.wrap(
        new D1HttpError(
          'UNIQUE constraint failed: t.id: SQLITE_CONSTRAINT (extended: SQLITE_CONSTRAINT_PRIMARYKEY)',
          { code: 7500 },
        ),
        q,
      );
      assertEquals(dup.code, 'DUPLICATE_KEY');
      assertEquals((dup.context as Record<string, unknown>).constraint, 't.id');
      // `reason` still carries the full raw (decorated) message for diagnostics.
      assertEquals(
        (dup.context as Record<string, unknown>).reason,
        'UNIQUE constraint failed: t.id: SQLITE_CONSTRAINT (extended: SQLITE_CONSTRAINT_PRIMARYKEY)',
      );

      // NOT NULL → NOT_NULL_VIOLATION, column 't.y' (no colon).
      const nn = eng.wrap(
        new D1HttpError(
          'NOT NULL constraint failed: t.y: SQLITE_CONSTRAINT (extended: SQLITE_CONSTRAINT_NOTNULL)',
          { code: 7500 },
        ),
        q,
      );
      assertEquals(nn.code, 'NOT_NULL_VIOLATION');
      assertEquals((nn.context as Record<string, unknown>).column, 't.y');

      // no such table → TABLE_NOT_FOUND, table 'widgets' (no colon).
      const nt = eng.wrap(
        new D1HttpError('no such table: widgets: SQLITE_ERROR', { code: 7400 }),
        q,
      );
      assertEquals(nt.code, 'TABLE_NOT_FOUND');
      assertEquals((nt.context as Record<string, unknown>).table, 'widgets');

      // CHECK → CHECK_VIOLATION, constraint 't.chk' (no colon).
      const chk = eng.wrap(
        new D1HttpError(
          'CHECK constraint failed: t.chk: SQLITE_CONSTRAINT (extended: SQLITE_CONSTRAINT_CHECK)',
          { code: 7500 },
        ),
        q,
      );
      assertEquals(chk.code, 'CHECK_VIOLATION');
      assertEquals(
        (chk.context as Record<string, unknown>).constraint,
        't.chk',
      );
    });

    it('never leaks the apiToken in the wrapped error', () => {
      const eng = makeEngine();
      const wrapped = eng.wrap(
        new D1HttpError('UNIQUE constraint failed: t.x', { code: 7500 }),
        q,
      );
      const dump = JSON.stringify({
        message: wrapped.message,
        context: wrapped.context,
        string: String(wrapped),
      });
      assert(!dump.includes(TOKEN), 'auth token must not appear in the error');
    });

    it('maps a generic (non-D1) error to QUERY_EXECUTION_FAILED', () => {
      const eng = makeEngine();
      assertEquals(
        eng.wrap(new Error('network down'), { sql: 'SELECT 1' }).code,
        'QUERY_EXECUTION_FAILED',
      );
    });

    it('returns an existing EngineError unchanged', () => {
      const eng = makeEngine();
      const pre = new EngineError('MISSING_PARAMETERS', {
        instanceId: 'x',
        missing: 'a',
      });
      assertEquals(eng.wrap(pre, { sql: '' }), pre);
    });

    it('surfaces a mapped error from execute() and leaves the engine usable', async () => {
      const eng = makeEngine();
      eng.stub.error = new D1HttpError('no such table: missing', {
        code: 7400,
      });
      const err = await assertRejects(
        () => eng.execute({ sql: 'SELECT * FROM missing' }),
        EngineError,
      );
      assertEquals((err as EngineError).code, 'TABLE_NOT_FOUND');

      // Engine still usable for the next query.
      eng.stub.error = null;
      eng.stub.result = {
        results: [{ one: 1 }],
        meta: { changes: 0, lastRowId: null },
      };
      const res = await eng.execute({ sql: 'SELECT 1 AS one' });
      assertEquals(res.data, [{ one: 1 }]);
    });
  });

  describe('transactions (unsupported)', () => {
    it('rejects transaction() and leaves the engine usable afterwards', async () => {
      const eng = makeEngine();
      const err = await assertRejects(
        () => eng.transaction(async () => {/* never runs */}),
        EngineError,
      );
      assertEquals((err as EngineError).code, 'UNSUPPORTED_OPERATION');

      // No client was reserved — a subsequent query still works.
      eng.stub.result = {
        results: [{ one: 1 }],
        meta: { changes: 0, lastRowId: null },
      };
      const res = await eng.execute({ sql: 'SELECT 1 AS one' });
      assertEquals(res.data, [{ one: 1 }]);
    });

    it('rejects beginTransaction()', async () => {
      const eng = makeEngine();
      const err = await assertRejects(
        () => eng.beginTransaction(),
        EngineError,
      );
      assertEquals((err as EngineError).code, 'UNSUPPORTED_OPERATION');
    });
  });

  describe('lifecycle', () => {
    it('connect() constructs the client with no network; disconnect() clears it', async () => {
      // Uses the real _open (a D1HttpClient is constructed, no request sent).
      const eng = new D1Engine('lifecycle', {
        accountId: ACCOUNT_ID,
        databaseId: DATABASE_ID,
        apiToken: TOKEN,
      });
      assertEquals(eng.status, 'CLOSED');
      await eng.connect();
      assertEquals(eng.status, 'READY');
      await eng.disconnect();
      assertEquals(eng.status, 'CLOSED');
    });
  });
});
