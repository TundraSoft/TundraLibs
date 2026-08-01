import { describe, it } from '@tundralibs/compat/test';
import {
  assert,
  assertEquals,
  assertInstanceOf,
  assertRejects,
  assertThrows,
} from '@std/asserts';
import { TursoEngine } from './Engine.ts';
import type { TursoHttpClient } from './TursoHttpClient.ts';
import { TursoHttpError } from './TursoHttpError.ts';
import { decodeHranaValue, encodeHranaValue } from './values.ts';
import { SQLiteEngine } from '../sqlite/Engine.ts';
import { EngineError } from '../../errors/mod.ts';
import type { EngineQuery } from '../../types/mod.ts';
import type {
  HranaExecuteResult,
  HranaNamedArg,
  HranaValue,
} from './types/mod.ts';

const URL_ = 'libsql://my-db-my-org.turso.io';
const TOKEN = 'jwt.supersecrettoken.sig';

const EMPTY_RESULT: HranaExecuteResult = {
  cols: [],
  rows: [],
  affectedRowCount: 0,
  lastInsertRowid: null,
};

/**
 * A fake `TursoHttpClient` — records the `(sql, args, namedArgs)` it received
 * and returns a scripted result (or rejects with a scripted error). No network.
 */
class StubClient {
  public lastSql: string | null = null;
  public lastArgs: readonly HranaValue[] = [];
  public lastNamedArgs: readonly HranaNamedArg[] = [];
  public callCount = 0;
  public result: HranaExecuteResult = EMPTY_RESULT;
  public error: unknown = null;

  // deno-lint-ignore require-await
  public async execute(
    sql: string,
    args: readonly HranaValue[] = [],
    namedArgs: readonly HranaNamedArg[] = [],
  ): Promise<HranaExecuteResult> {
    this.callCount++;
    this.lastSql = sql;
    this.lastArgs = args;
    this.lastNamedArgs = namedArgs;
    if (this.error) throw this.error;
    return this.result;
  }
}

/**
 * `TursoEngine` wired to a {@link StubClient} instead of a real HTTP client,
 * with the protected hooks re-exposed for direct assertion.
 */
class TestTursoEngine extends TursoEngine {
  public stub = new StubClient();

  protected override _open(): void {
    this._resource = this.stub as unknown as TursoHttpClient;
  }

  public std(q: EngineQuery): EngineQuery {
    return this._standardizeQuery(q);
  }
  public wrap(e: unknown, q: EngineQuery): EngineError {
    return this._wrapDriverError(e, q);
  }
}

const makeEngine = (): TestTursoEngine =>
  new TestTursoEngine('turso-test', { url: URL_, authToken: TOKEN });

/**
 * A native `SQLiteEngine` with its protected `_wrapDriverError` re-exposed, used
 * ONLY as the parity oracle for c3. Construction is lazy — no native SQLite
 * binding is loaded and no handle is opened, so `wrap()` is a pure call that
 * runs on every runtime regardless of SQLite availability. It also keeps the
 * shipped `./turso` import graph untouched (this coupling is test-only).
 */
class ProbeSqliteEngine extends SQLiteEngine {
  public wrap(error: unknown, query: EngineQuery): EngineError {
    return this._wrapDriverError(error, query);
  }
}

describe('drivers.engines.turso.TursoEngine', () => {
  describe('configuration', () => {
    it('exposes TURSO identity, sqlite Dialect, and honest capabilities', () => {
      const eng = new TursoEngine('cfg', { url: URL_, authToken: TOKEN });
      assertEquals(eng.Engine, 'TURSO');
      assertEquals(eng.Dialect, 'sqlite');
      assertEquals(eng.Capabilities.pooledConnections, false);
      assertEquals(eng.Capabilities.transactions, false);
      assertEquals(eng.Capabilities.preparedStatements, false);
      assertEquals(eng.Capabilities.advisoryLock, false);
      assertEquals(eng.Capabilities.inPlaceAlter, false);
      assertEquals(eng.Capabilities.referentialActions, true);
      assertEquals(eng.Capabilities.parameterReplacement, {
        prefix: ':',
        suffix: '',
      });
    });

    it('requires url', () => {
      const err = assertThrows(
        () => new TursoEngine('no-url', {} as unknown as { url: string }),
        EngineError,
      );
      assertEquals((err as EngineError).code, 'MISSING_CONFIG_VALUE');
    });

    it('accepts a url with no authToken (local sqld)', () => {
      const eng = new TursoEngine('local', { url: 'http://localhost:8080' });
      assertEquals(eng.Engine, 'TURSO');
    });

    it("rejects a timeout outside RESTler's 1..120s range at construction", () => {
      // `timeout` is forwarded to RESTler, which enforces 1..120 at connect();
      // validating eagerly turns a late CONNECTION_FAILED into an
      // INVALID_CONFIG_VALUE thrown at construction.
      for (const bad of [200, 0.5, 0, -1]) {
        const err = assertThrows(
          () =>
            new TursoEngine('t', { url: URL_, authToken: TOKEN, timeout: bad }),
          EngineError,
        );
        assertEquals((err as EngineError).code, 'INVALID_CONFIG_VALUE');
      }
      // A valid in-range timeout still constructs.
      const ok = new TursoEngine('t', {
        url: URL_,
        authToken: TOKEN,
        timeout: 30,
      });
      assertEquals(ok.Engine, 'TURSO');
    });
  });

  describe('_standardizeQuery (:name: -> :name)', () => {
    it('rewrites named placeholders to the Hrana :name form', () => {
      const eng = makeEngine();
      const q = eng.std({
        sql: 'SELECT * FROM t WHERE a = :a: AND b = :b: AND a2 = :a:',
        params: { a: 1, b: 2 },
      });
      assertEquals(
        q.sql,
        'SELECT * FROM t WHERE a = :a AND b = :b AND a2 = :a;',
      );
      // Params stay a name->value map (identity `_encodeValue`).
      assertEquals(q.params, { a: 1, b: 2 });
    });

    it('throws MISSING_PARAMETERS for an absent placeholder', () => {
      const eng = makeEngine();
      const err = assertThrows(
        () => eng.std({ sql: 'SELECT :x:', params: {} }),
        EngineError,
      );
      assertEquals((err as EngineError).code, 'MISSING_PARAMETERS');
    });
  });

  describe('encodeHranaValue', () => {
    it('maps each JS type to its Hrana wire form', () => {
      assertEquals(encodeHranaValue(null), { type: 'null' });
      assertEquals(encodeHranaValue(undefined), { type: 'null' });
      // boolean -> integer '1'/'0' (SQLite has no boolean).
      assertEquals(encodeHranaValue(true), { type: 'integer', value: '1' });
      assertEquals(encodeHranaValue(false), { type: 'integer', value: '0' });
      // integer number -> integer decimal string.
      assertEquals(encodeHranaValue(42), { type: 'integer', value: '42' });
      assertEquals(encodeHranaValue(-7), { type: 'integer', value: '-7' });
      // non-integer number -> float.
      assertEquals(encodeHranaValue(1.5), { type: 'float', value: 1.5 });
      // bigint -> integer string (full 64-bit precision).
      assertEquals(encodeHranaValue(9007199254740993n), {
        type: 'integer',
        value: '9007199254740993',
      });
      // string -> text.
      assertEquals(encodeHranaValue('hello'), { type: 'text', value: 'hello' });
      // Uint8Array -> blob (base64).
      assertEquals(encodeHranaValue(new Uint8Array([1, 2, 255])), {
        type: 'blob',
        base64: 'AQL/',
      });
      // Date -> ISO text (parity with the native SQLiteEngine).
      assertEquals(encodeHranaValue(new Date('2020-01-02T03:04:05.000Z')), {
        type: 'text',
        value: '2020-01-02T03:04:05.000Z',
      });
      // plain object / array -> JSON text.
      assertEquals(encodeHranaValue({ a: 1 }), {
        type: 'text',
        value: '{"a":1}',
      });
      assertEquals(encodeHranaValue([1, 2, 3]), {
        type: 'text',
        value: '[1,2,3]',
      });
    });

    // Regression: integer-valued numbers past the safe range used to go through
    // `String(v)`, which switches to exponential notation at |v| >= 1e21
    // (`String(1e21) === '1e+21'`) — a malformed Hrana integer the server /
    // `BigInt()` reject. They must render as a plain decimal, no exponent.
    it('renders large integer-valued numbers as plain decimals (no exponent)', () => {
      const at1e21 = encodeHranaValue(1e21) as { type: string; value: string };
      assertEquals(at1e21.type, 'integer');
      assertEquals(at1e21.value, '1000000000000000000000');
      assert(!at1e21.value.includes('e'), 'must not use exponential notation');

      // 1.5e21 is *also* an integer-valued double (every double >= 2^53 is an
      // integer), so it too encodes as a plain-decimal integer, not a float.
      const at15e21 = encodeHranaValue(1.5e21) as {
        type: string;
        value: string;
      };
      assertEquals(at15e21.type, 'integer');
      assertEquals(at15e21.value, '1500000000000000000000');
      assert(!at15e21.value.includes('e'), 'must not use exponential notation');

      // A value in (2^53, 1e21): still an integer, still plain decimal.
      const mid = encodeHranaValue(2 ** 60) as { type: string; value: string };
      assertEquals(mid.type, 'integer');
      assertEquals(mid.value, '1152921504606846976');

      // A genuine fraction stays a float.
      assertEquals(encodeHranaValue(1.5), { type: 'float', value: 1.5 });
    });

    // The round trip must survive: decoding the encoded 1e21 yields a bigint
    // (past the safe range) and does not throw on `BigInt(value)`.
    it('round-trips a large integer through decodeHranaValue without throwing', () => {
      const wire = encodeHranaValue(1e21);
      const back = decodeHranaValue(wire);
      assertEquals(back, 1000000000000000000000n);
    });
  });

  describe('decodeHranaValue', () => {
    it('maps each Hrana wire form to a JS value', () => {
      assertEquals(decodeHranaValue({ type: 'null' }), null);
      // integer within safe range -> number.
      assertEquals(decodeHranaValue({ type: 'integer', value: '42' }), 42);
      assertEquals(decodeHranaValue({ type: 'integer', value: '-7' }), -7);
      // integer beyond 2^53-1 -> bigint (precision preserved).
      const big = decodeHranaValue({
        type: 'integer',
        value: '9007199254740993',
      });
      assertEquals(typeof big, 'bigint');
      assertEquals(big, 9007199254740993n);
      // float -> number.
      assertEquals(decodeHranaValue({ type: 'float', value: 2.25 }), 2.25);
      // text -> string.
      assertEquals(decodeHranaValue({ type: 'text', value: 'hi' }), 'hi');
      // blob -> Uint8Array (base64-decoded).
      const bytes = decodeHranaValue({ type: 'blob', base64: 'AQL/' });
      assertInstanceOf(bytes, Uint8Array);
      assertEquals(bytes, new Uint8Array([1, 2, 255]));
    });

    it('round-trips a blob through encode + decode', () => {
      const original = new Uint8Array([0, 1, 127, 128, 255, 42]);
      const wire = encodeHranaValue(original) as {
        type: 'blob';
        base64: string;
      };
      assertEquals(wire.type, 'blob');
      assertEquals(decodeHranaValue(wire), original);
    });
  });

  describe('execute + Hrana round-trip', () => {
    it('auto-connects a CLOSED engine, builds named_args, returns { data, count }', async () => {
      const eng = makeEngine();
      assertEquals(eng.status, 'CLOSED');
      eng.stub.result = {
        cols: [
          { name: 'id', decltype: 'INTEGER' },
          { name: 'name', decltype: 'TEXT' },
        ],
        rows: [[{ type: 'integer', value: '7' }, {
          type: 'text',
          value: 'ada',
        }]],
        affectedRowCount: 1,
        lastInsertRowid: '7',
      };

      const res = await eng.execute({
        sql: 'INSERT INTO users (name) VALUES (:name:) RETURNING id, name',
        params: { name: 'ada' },
      });

      assertEquals(eng.status, 'READY'); // auto-connected
      // RETURNING rows surface, decoded by HranaValue tag (integer -> number).
      assertEquals(res.data, [{ id: 7, name: 'ada' }]);
      assertEquals(res.count, 1);
      // The stub saw the rewritten SQL, empty positional args, and named_args
      // in { name, value } shape with the value Hrana-encoded.
      assertEquals(
        eng.stub.lastSql,
        'INSERT INTO users (name) VALUES (:name) RETURNING id, name;',
      );
      assertEquals(eng.stub.lastArgs, []);
      assertEquals(eng.stub.lastNamedArgs, [
        { name: 'name', value: { type: 'text', value: 'ada' } },
      ]);
    });

    it('encodes named_args per JS type', async () => {
      const eng = makeEngine();
      await eng.execute({
        sql: 'INSERT INTO t (i, big, f, flag, txt, blob, nul) VALUES ' +
          '(:i:, :big:, :f:, :flag:, :txt:, :blob:, :nul:)',
        params: {
          i: 10,
          big: 9007199254740993n,
          f: 1.5,
          flag: true,
          txt: 'x',
          blob: new Uint8Array([1, 2]),
          nul: null,
        },
      });
      assertEquals(eng.stub.lastNamedArgs, [
        { name: 'i', value: { type: 'integer', value: '10' } },
        { name: 'big', value: { type: 'integer', value: '9007199254740993' } },
        { name: 'f', value: { type: 'float', value: 1.5 } },
        { name: 'flag', value: { type: 'integer', value: '1' } },
        { name: 'txt', value: { type: 'text', value: 'x' } },
        { name: 'blob', value: { type: 'blob', base64: 'AQI=' } },
        { name: 'nul', value: { type: 'null' } },
      ]);
    });

    it("a bare INSERT's count = affectedRowCount (no rows returned)", async () => {
      const eng = makeEngine();
      eng.stub.result = {
        cols: [],
        rows: [],
        affectedRowCount: 3,
        lastInsertRowid: '99',
      };
      const res = await eng.execute({
        sql: 'UPDATE t SET x = 1 WHERE y > :y:',
        params: { y: 0 },
      });
      assertEquals(res.data, []);
      assertEquals(res.count, 3);
    });

    it('decodes a mixed-type SELECT row by column', async () => {
      const eng = makeEngine();
      eng.stub.result = {
        cols: [
          { name: 'i', decltype: 'INTEGER' },
          { name: 'big', decltype: 'INTEGER' },
          { name: 'f', decltype: 'REAL' },
          { name: 'txt', decltype: 'TEXT' },
          { name: 'b', decltype: 'BLOB' },
          { name: 'nul', decltype: null },
        ],
        rows: [[
          { type: 'integer', value: '42' },
          { type: 'integer', value: '9007199254740993' },
          { type: 'float', value: 2.25 },
          { type: 'text', value: 'hello' },
          { type: 'blob', base64: 'AQI=' },
          { type: 'null' },
        ]],
        affectedRowCount: 0,
        lastInsertRowid: null,
      };
      const res = await eng.execute({ sql: 'SELECT * FROM t' });
      const row = res.data[0]!;
      assertEquals(row.i, 42);
      assertEquals(typeof row.big, 'bigint');
      assertEquals(row.big, 9007199254740993n);
      assertEquals(row.f, 2.25);
      assertEquals(row.txt, 'hello');
      assertInstanceOf(row.b, Uint8Array);
      assertEquals(row.b, new Uint8Array([1, 2]));
      assertEquals(row.nul, null);
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
      // transactions:false → __runMany runs statements sequentially with no
      // auto-transaction (which would reject with UNSUPPORTED_OPERATION before
      // any statement ran). The stub records the executed CREATE TABLE.
      assertEquals(res.length, 1);
      assertEquals(eng.stub.callCount, 1);
      assert(/CREATE TABLE/i.test(eng.stub.lastSql ?? ''));
    });

    it('alterTable executes the statement instead of throwing UNSUPPORTED_OPERATION', async () => {
      const eng = makeEngine();
      const res = await eng.alterTable({
        type: 'ALTER_TABLE',
        table: 'edge_ddl',
        addColumns: { extra: { type: 'INTEGER' } },
      });
      assertEquals(res.length, 1);
      assertEquals(eng.stub.callCount, 1);
      assert(/ALTER TABLE/i.test(eng.stub.lastSql ?? ''));
    });
  });

  describe('error mapping', () => {
    const q: EngineQuery = { sql: 'INSERT INTO t VALUES (1)' };

    it('maps SQLite constraint codes to standardized EngineError codes', () => {
      const eng = makeEngine();
      assertEquals(
        eng.wrap(
          new TursoHttpError('dup', { code: 'SQLITE_CONSTRAINT_UNIQUE' }),
          q,
        )
          .code,
        'DUPLICATE_KEY',
      );
      assertEquals(
        eng.wrap(
          new TursoHttpError('pk', { code: 'SQLITE_CONSTRAINT_PRIMARYKEY' }),
          q,
        ).code,
        'DUPLICATE_KEY',
      );
      assertEquals(
        eng.wrap(
          new TursoHttpError('fk', { code: 'SQLITE_CONSTRAINT_FOREIGNKEY' }),
          q,
        ).code,
        'FOREIGN_KEY_VIOLATION',
      );
      assertEquals(
        eng.wrap(
          new TursoHttpError('nn', { code: 'SQLITE_CONSTRAINT_NOTNULL' }),
          q,
        ).code,
        'NOT_NULL_VIOLATION',
      );
      // Unknown SQLite code falls through.
      assertEquals(
        eng.wrap(new TursoHttpError('boom', { code: 'SQLITE_ERROR' }), q).code,
        'QUERY_EXECUTION_FAILED',
      );
    });

    it('carries the SQLite code + sql in context, never the auth token', () => {
      const eng = makeEngine();
      const wrapped = eng.wrap(
        new TursoHttpError('UNIQUE constraint failed: t.c', {
          code: 'SQLITE_CONSTRAINT_UNIQUE',
        }),
        q,
      );
      assertEquals(wrapped.code, 'DUPLICATE_KEY');
      const ctx = wrapped.context as Record<string, unknown>;
      assertEquals(ctx.code, 'SQLITE_CONSTRAINT_UNIQUE');
      assertEquals(ctx.sql, 'INSERT INTO t VALUES (1)');
      // The auth token lives only on the RESTler client, never on the error.
      const dump = JSON.stringify({
        message: wrapped.message,
        context: wrapped.context,
        string: String(wrapped),
      });
      assert(!dump.includes(TOKEN), 'auth token must not appear in the error');
    });

    it('maps a generic (non-Turso) error to QUERY_EXECUTION_FAILED', () => {
      const eng = makeEngine();
      assertEquals(
        eng.wrap(new Error('socket hang up'), { sql: 'SELECT 1' }).code,
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
      eng.stub.error = new TursoHttpError('no such table: missing', {
        code: 'SQLITE_ERROR',
      });
      await assertRejects(
        () => eng.execute({ sql: 'SELECT * FROM missing' }),
        EngineError,
      );

      // Engine still usable for the next query.
      eng.stub.error = null;
      eng.stub.result = {
        cols: [{ name: 'one', decltype: 'INTEGER' }],
        rows: [[{ type: 'integer', value: '1' }]],
        affectedRowCount: 0,
        lastInsertRowid: null,
      };
      const res = await eng.execute({ sql: 'SELECT 1 AS one' });
      assertEquals(res.data, [{ one: 1 }]);
    });
  });

  describe('SQLite error-metadata parity with native SQLiteEngine (c3)', () => {
    // The native `SQLiteEngine._wrapDriverError` parses the SQLite message to
    // fill `constraint` / `column`, so DUPLICATE_KEY / NOT_NULL_VIOLATION /
    // CHECK_VIOLATION resolve their `${constraint}` / `${column}` placeholders.
    // Turso must produce the SAME metadata from the identical SQLite error —
    // both now go through the shared `parseSqliteErrorMeta`.
    const turso = makeEngine();
    const sqlite = new ProbeSqliteEngine('parity', { path: ':memory:' });
    const q: EngineQuery = { sql: 'INSERT INTO users (email) VALUES (:e:)' };

    // The only legitimate difference between the two rendered messages is the
    // engine-specific `instanceId` (`Engine::Name`). Normalize it away; what
    // remains must be byte-identical.
    const norm = (msg: string, instanceId: string): string =>
      msg.replaceAll(instanceId, '<INSTANCE>');

    const cases: Array<{
      label: string;
      driverCode: string;
      message: string;
      engineCode: string;
      metaKey: 'constraint' | 'column';
      metaValue: string;
    }> = [
      {
        label: 'UNIQUE -> DUPLICATE_KEY (constraint)',
        driverCode: 'SQLITE_CONSTRAINT_UNIQUE',
        message: 'UNIQUE constraint failed: users.email',
        engineCode: 'DUPLICATE_KEY',
        metaKey: 'constraint',
        metaValue: 'users.email',
      },
      {
        label: 'NOT NULL -> NOT_NULL_VIOLATION (column)',
        driverCode: 'SQLITE_CONSTRAINT_NOTNULL',
        message: 'NOT NULL constraint failed: users.name',
        engineCode: 'NOT_NULL_VIOLATION',
        metaKey: 'column',
        metaValue: 'users.name',
      },
      {
        label: 'CHECK -> CHECK_VIOLATION (constraint)',
        driverCode: 'SQLITE_CONSTRAINT_CHECK',
        message: 'CHECK constraint failed: age_positive',
        engineCode: 'CHECK_VIOLATION',
        metaKey: 'constraint',
        metaValue: 'age_positive',
      },
    ];

    for (const c of cases) {
      it(`${c.label}: identical resolved message + metadata`, () => {
        const tursoErr = turso.wrap(
          new TursoHttpError(c.message, { code: c.driverCode }),
          q,
        );
        const sqliteErr = sqlite.wrap(
          { code: c.driverCode, message: c.message },
          q,
        );

        // Same standardized engine code on both.
        assertEquals(tursoErr.code, c.engineCode);
        assertEquals(sqliteErr.code, c.engineCode);

        // Metadata parity: the name is lifted identically (and populated).
        const tctx = tursoErr.context as Record<string, unknown>;
        const sctx = sqliteErr.context as Record<string, unknown>;
        assertEquals(tctx[c.metaKey], c.metaValue);
        assertEquals(tctx[c.metaKey], sctx[c.metaKey]);

        // The placeholder is resolved — no literal `${...}` survives, and the
        // real name appears in the rendered message.
        assert(
          !tursoErr.message.includes('${'),
          `Turso message kept a literal placeholder: ${tursoErr.message}`,
        );
        assert(tursoErr.message.includes(c.metaValue));

        // Byte-identical rendered message once the engine-specific instanceId
        // is normalized away.
        assertEquals(
          norm(tursoErr.message, turso.instanceId),
          norm(sqliteErr.message, sqlite.instanceId),
        );
      });
    }

    it('FOREIGN KEY (no name): literal ${constraint} on both engines (matched parity)', () => {
      // SQLite reports no name for a bare `FOREIGN KEY constraint failed`, so
      // neither engine can fill `${constraint}`. They must still MATCH: the
      // native engine emits a literal placeholder here, and Turso must too.
      const msg = 'FOREIGN KEY constraint failed';
      const tursoErr = turso.wrap(
        new TursoHttpError(msg, { code: 'SQLITE_CONSTRAINT_FOREIGNKEY' }),
        q,
      );
      const sqliteErr = sqlite.wrap(
        { code: 'SQLITE_CONSTRAINT_FOREIGNKEY', message: msg },
        q,
      );
      assertEquals(tursoErr.code, 'FOREIGN_KEY_VIOLATION');
      assertEquals(sqliteErr.code, 'FOREIGN_KEY_VIOLATION');
      assertEquals(
        (tursoErr.context as Record<string, unknown>).constraint,
        undefined,
      );
      assertEquals(
        norm(tursoErr.message, turso.instanceId),
        norm(sqliteErr.message, sqlite.instanceId),
      );
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
        cols: [{ name: 'one', decltype: 'INTEGER' }],
        rows: [[{ type: 'integer', value: '1' }]],
        affectedRowCount: 0,
        lastInsertRowid: null,
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
      // Uses the real _open (a TursoHttpClient is constructed, no request sent).
      const eng = new TursoEngine('lifecycle', { url: URL_, authToken: TOKEN });
      assertEquals(eng.status, 'CLOSED');
      await eng.connect();
      assertEquals(eng.status, 'READY');
      await eng.disconnect();
      assertEquals(eng.status, 'CLOSED');
    });
  });
});
