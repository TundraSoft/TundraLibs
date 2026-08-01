import { describe, it } from '@tundralibs/compat/test';
import {
  assert,
  assertEquals,
  assertInstanceOf,
  assertRejects,
  assertThrows,
} from '@std/asserts';
import { NeonHttpEngine } from './Engine.ts';
import type { NeonHttpClient } from './NeonHttpClient.ts';
import { NeonHttpError } from './NeonHttpError.ts';
import { EngineError } from '../../errors/mod.ts';
import type { EngineQuery } from '../../types/mod.ts';
import type { NeonPostgresError, NeonQueryResult } from './types/mod.ts';

const HOST = 'ep-cool-name-a1b2c3.us-east-2.aws.neon.tech';
const SECRET = 'supersecretpw';
const CONN = `postgresql://user:${SECRET}@${HOST}/neondb`;

const EMPTY_RESULT: NeonQueryResult = {
  rows: [],
  fields: [],
  rowCount: 0,
  command: '',
};

/**
 * A fake `NeonHttpClient` — records the `(query, params)` it received and
 * returns a scripted result (or rejects with a scripted error). No network.
 */
class StubClient {
  public lastQuery: string | null = null;
  public lastParams: readonly unknown[] = [];
  public callCount = 0;
  public result: NeonQueryResult = EMPTY_RESULT;
  public error: unknown = null;

  // deno-lint-ignore require-await
  public async sql<R = Record<string, unknown>>(
    query: string,
    params: readonly unknown[] = [],
  ): Promise<NeonQueryResult<R>> {
    this.callCount++;
    this.lastQuery = query;
    this.lastParams = params;
    if (this.error) throw this.error;
    return this.result as unknown as NeonQueryResult<R>;
  }
}

/**
 * `NeonHttpEngine` wired to a {@link StubClient} instead of a real HTTP client,
 * with the protected hooks re-exposed for direct assertion.
 */
class TestNeonHttpEngine extends NeonHttpEngine {
  public stub = new StubClient();

  protected override _open(): void {
    this._resource = this.stub as unknown as NeonHttpClient;
  }

  public std(q: EngineQuery): EngineQuery {
    return this._standardizeQuery(q);
  }
  public enc(v: unknown): unknown {
    return this._encodeValue(v);
  }
  public wrap(e: unknown, q: EngineQuery): EngineError {
    return this._wrapDriverError(e, q);
  }
}

const makeEngine = (): TestNeonHttpEngine =>
  new TestNeonHttpEngine('neon-test', { host: HOST, connectionString: CONN });

const neonError = (
  code: string | undefined,
  fields?: Partial<NeonPostgresError>,
): NeonHttpError =>
  new NeonHttpError(`synthetic ${code}`, {
    status: 400,
    code,
    fields: code
      ? { message: `synthetic ${code}`, code, ...fields }
      : undefined,
  });

describe('drivers.engines.neon.NeonHttpEngine', () => {
  describe('configuration', () => {
    it('exposes NEON identity, postgres Dialect, and honest capabilities', () => {
      const eng = new NeonHttpEngine('cfg', {
        host: HOST,
        connectionString: CONN,
      });
      assertEquals(eng.Engine, 'NEON');
      assertEquals(eng.Dialect, 'postgres');
      assertEquals(eng.Capabilities.pooledConnections, false);
      assertEquals(eng.Capabilities.transactions, false);
      assertEquals(eng.Capabilities.preparedStatements, false);
      assertEquals(eng.Capabilities.advisoryLock, false);
      assertEquals(eng.Capabilities.inPlaceAlter, true);
      assertEquals(eng.Capabilities.referentialActions, true);
      assertEquals(eng.Capabilities.parameterReplacement, undefined);
    });

    it('requires host', () => {
      const err = assertThrows(
        () =>
          new NeonHttpEngine('no-host', {
            connectionString: CONN,
          } as unknown as { host: string }),
        EngineError,
      );
      assertEquals((err as EngineError).code, 'MISSING_CONFIG_VALUE');
    });

    it('requires at least one auth mechanism', () => {
      const err = assertThrows(
        () => new NeonHttpEngine('no-auth', { host: HOST }),
        EngineError,
      );
      assertEquals((err as EngineError).code, 'MISSING_CONFIG_VALUE');
    });

    it('accepts a bearer token as the sole auth', () => {
      const eng = new NeonHttpEngine('tok', { host: HOST, token: 'jwt.abc' });
      assertEquals(eng.Engine, 'NEON');
    });

    it('accepts username+password+database components', () => {
      const eng = new NeonHttpEngine('components', {
        host: HOST,
        username: 'user',
        password: 'pw',
        database: 'neondb',
      });
      assertEquals(eng.Engine, 'NEON');
    });

    it('rejects an empty token / connectionString', () => {
      assertThrows(
        () => new NeonHttpEngine('bad', { host: HOST, token: '   ' }),
        EngineError,
      );
    });

    it("rejects a timeout outside RESTler's 1..120s range at construction", () => {
      // RESTler enforces 1..120 at connect(); validating eagerly turns a late
      // CONNECTION_FAILED into an INVALID_CONFIG_VALUE thrown at construction.
      for (const bad of [200, 0.5, 0, -1]) {
        const err = assertThrows(
          () =>
            new NeonHttpEngine('t', {
              host: HOST,
              connectionString: CONN,
              timeout: bad,
            }),
          EngineError,
        );
        assertEquals((err as EngineError).code, 'INVALID_CONFIG_VALUE');
      }
      // A valid in-range timeout still constructs.
      const ok = new NeonHttpEngine('t', {
        host: HOST,
        connectionString: CONN,
        timeout: 30,
      });
      assertEquals(ok.Engine, 'NEON');
    });
  });

  describe('_standardizeQuery (:name: → $N)', () => {
    it('rewrites, orders, and dedupes named placeholders', () => {
      const eng = makeEngine();
      const q = eng.std({
        sql: 'SELECT * FROM t WHERE a = :a: AND b = :b: AND a2 = :a:',
        params: { a: 1, b: 2 },
      });
      assertEquals(
        q.sql,
        'SELECT * FROM t WHERE a = $1 AND b = $2 AND a2 = $1;',
      );
      // `:a:` appears twice but is bound once, in first-seen order.
      assertEquals(q.__params, [1, 2]);
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

  describe('_encodeValue', () => {
    it('maps each JS type to its Neon HTTP param form', () => {
      const eng = makeEngine();
      assertEquals(eng.enc(null), null);
      assertEquals(eng.enc(undefined), null);
      // boolean + number stay JSON-native.
      assertEquals(eng.enc(true), true);
      assertEquals(eng.enc(false), false);
      assertEquals(eng.enc(42), 42);
      assertEquals(eng.enc(1.5), 1.5);
      // Non-finite numbers become their PG-accepted text form — NOT the SQL
      // NULL that `JSON.stringify` would silently produce from the raw value.
      assertEquals(eng.enc(NaN), 'NaN');
      assertEquals(eng.enc(Infinity), 'Infinity');
      assertEquals(eng.enc(-Infinity), '-Infinity');
      // bigint → decimal string (JSON number would lose precision).
      assertEquals(eng.enc(9007199254740993n), '9007199254740993');
      // Date → ISO-8601.
      assertEquals(
        eng.enc(new Date('2020-01-02T03:04:05.000Z')),
        '2020-01-02T03:04:05.000Z',
      );
      // Uint8Array → \x hex (Postgres bytea).
      assertEquals(eng.enc(new Uint8Array([1, 2, 255])), '\\x0102ff');
      // object / array → json/jsonb text.
      assertEquals(eng.enc({ a: 1 }), '{"a":1}');
      assertEquals(eng.enc([1, 2, 3]), '[1,2,3]');
      // string passes through.
      assertEquals(eng.enc('hello'), 'hello');
    });

    it('throws a typed EngineError for an Invalid Date (not a raw RangeError)', () => {
      const eng = makeEngine();
      const invalid = new Date('not-a-date');
      // Sanity: this really is an Invalid Date whose `toISOString()` would
      // throw a raw RangeError.
      assertEquals(Number.isNaN(invalid.getTime()), true);

      // Directly through `_encodeValue`.
      const err = assertThrows(() => eng.enc(invalid), EngineError);
      assertEquals((err as EngineError).code, 'OPERATION_FAILED');

      // …and through `_standardizeQuery`, where `_encodeValue` runs OUTSIDE
      // `execute()`'s try/catch — so a raw RangeError there would escape the
      // `@throws {EngineError}` contract entirely.
      const err2 = assertThrows(
        () =>
          eng.std({
            sql: 'INSERT INTO t (d) VALUES (:d:)',
            params: { d: invalid },
          }),
        EngineError,
      );
      assertInstanceOf(err2, EngineError);
      assertEquals((err2 as EngineError).code, 'OPERATION_FAILED');
    });

    it('rejects execute() with an EngineError for an Invalid Date param', async () => {
      const eng = makeEngine();
      await assertRejects(
        () =>
          eng.execute({
            sql: 'INSERT INTO t (d) VALUES (:d:)',
            params: { d: new Date('nope') },
          }),
        EngineError,
      );
    });
  });

  describe('execute + value decoding', () => {
    it('auto-connects a CLOSED engine and returns { data, count }', async () => {
      const eng = makeEngine();
      assertEquals(eng.status, 'CLOSED');
      eng.stub.result = {
        rows: [{ id: '7', name: 'ada' }],
        fields: [
          { name: 'id', dataTypeID: 23 },
          { name: 'name', dataTypeID: 25 },
        ],
        rowCount: 1,
        command: 'INSERT',
      };

      const res = await eng.execute({
        sql: 'INSERT INTO users (name) VALUES (:name:) RETURNING id, name',
        params: { name: 'ada' },
      });

      assertEquals(eng.status, 'READY'); // auto-connected
      // RETURNING rows surface, decoded by OID (int4 → number).
      assertEquals(res.data, [{ id: 7, name: 'ada' }]);
      assertEquals(res.count, 1);
      // The stub saw the rewritten SQL + ordered, encoded params.
      assertEquals(
        eng.stub.lastQuery,
        'INSERT INTO users (name) VALUES ($1) RETURNING id, name;',
      );
      assertEquals(eng.stub.lastParams, ['ada']);
    });

    it('decodes every OID via the shared Postgres text decoder', async () => {
      const eng = makeEngine();
      eng.stub.result = {
        command: 'SELECT',
        rowCount: 1,
        fields: [
          { name: 'big', dataTypeID: 20 },
          { name: 'flag', dataTypeID: 16 },
          { name: 'i', dataTypeID: 23 },
          { name: 'f4', dataTypeID: 700 },
          { name: 'f8', dataTypeID: 701 },
          { name: 'ts', dataTypeID: 1114 },
          { name: 'tstz', dataTypeID: 1184 },
          { name: 'j', dataTypeID: 114 },
          { name: 'jb', dataTypeID: 3802 },
          { name: 'b', dataTypeID: 17 },
          { name: 'txt', dataTypeID: 25 },
          { name: 'nul', dataTypeID: 23 },
        ],
        rows: [{
          big: '9007199254740993',
          flag: 't',
          i: '42',
          f4: '1.5',
          f8: '2.25',
          ts: '2020-01-02 03:04:05',
          tstz: '2020-01-02 03:04:05+00',
          j: '{"a":1}',
          jb: '[1,2,3]',
          b: '\\x0102',
          txt: 'hello',
          nul: null,
        }],
      };

      const res = await eng.execute({ sql: 'SELECT 1' });
      const row = res.data[0]!;

      assertEquals(typeof row.big, 'bigint');
      assertEquals(row.big, 9007199254740993n);
      assertEquals(row.flag, true);
      assertEquals(row.i, 42);
      assertEquals(row.f4, 1.5);
      assertEquals(row.f8, 2.25);
      assertInstanceOf(row.ts, Date);
      assertInstanceOf(row.tstz, Date);
      assertEquals(row.j, { a: 1 });
      assertEquals(row.jb, [1, 2, 3]);
      assertInstanceOf(row.b, Uint8Array);
      assertEquals(row.b, new Uint8Array([1, 2]));
      assertEquals(row.txt, 'hello');
      assertEquals(row.nul, null); // SQL NULL → null
    });

    it('binds NaN/±Infinity as their text form on the wire (never SQL NULL)', async () => {
      const eng = makeEngine();
      await eng.execute({
        sql: 'INSERT INTO t (a, b, c) VALUES (:a:, :b:, :c:)',
        params: { a: NaN, b: Infinity, c: -Infinity },
      });
      // Had these ridden the JSON fast path, `JSON.stringify` on the request
      // body would coerce all three to `null` and silently bind SQL NULL. The
      // text form is what actually reaches the wire.
      assertEquals(eng.stub.lastParams, ['NaN', 'Infinity', '-Infinity']);
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
      assert(/CREATE TABLE/i.test(eng.stub.lastQuery ?? ''));
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
      assert(/ALTER TABLE/i.test(eng.stub.lastQuery ?? ''));
    });
  });

  describe('error mapping', () => {
    it('maps SQLSTATE codes to standardized EngineError codes', () => {
      const eng = makeEngine();
      const q: EngineQuery = { sql: 'INSERT INTO t VALUES (1)' };

      const dup = eng.wrap(
        neonError('23505', {
          constraint: 'users_pkey',
          table: 'users',
          detail: 'Key (id)=(1) already exists.',
        }),
        q,
      );
      assertEquals(dup.code, 'DUPLICATE_KEY');
      const ctx = dup.context as Record<string, unknown>;
      assertEquals(ctx.sqlState, '23505');
      assertEquals(ctx.constraint, 'users_pkey');
      assertEquals(ctx.table, 'users');
      assertEquals(ctx.detail, 'Key (id)=(1) already exists.');
      assertEquals(ctx.sql, 'INSERT INTO t VALUES (1)');

      assertEquals(eng.wrap(neonError('42P01'), q).code, 'TABLE_NOT_FOUND');
      assertEquals(
        eng.wrap(neonError('23503'), q).code,
        'FOREIGN_KEY_VIOLATION',
      );
      // Unknown SQLSTATE and a code-less HTTP error both fall through.
      assertEquals(
        eng.wrap(neonError('XX000'), q).code,
        'QUERY_EXECUTION_FAILED',
      );
      assertEquals(
        eng.wrap(neonError(undefined), q).code,
        'QUERY_EXECUTION_FAILED',
      );
    });

    it('maps a generic (non-Neon) error to QUERY_EXECUTION_FAILED', () => {
      const eng = makeEngine();
      const wrapped = eng.wrap(new Error('socket hang up'), {
        sql: 'SELECT 1',
      });
      assertEquals(wrapped.code, 'QUERY_EXECUTION_FAILED');
    });

    it('returns an existing EngineError unchanged', () => {
      const eng = makeEngine();
      const pre = new EngineError('MISSING_PARAMETERS', {
        instanceId: 'x',
        missing: 'a',
      });
      assertEquals(eng.wrap(pre, { sql: '' }), pre);
    });

    it('never leaks the connection string / password into the EngineError', () => {
      const eng = makeEngine();
      const wrapped = eng.wrap(
        neonError('23505', { constraint: 'users_pkey' }),
        { sql: 'INSERT INTO t VALUES (1)' },
      );
      // Serialize everything reachable off the error and assert the secret is
      // absent (it lives only on the RESTler client headers, never on the
      // error, and is deliberately not copied by _wrapDriverError).
      const dump = JSON.stringify({
        message: wrapped.message,
        context: wrapped.context,
        string: String(wrapped),
      });
      assert(!dump.includes(SECRET), 'password must not appear');
      assert(!dump.includes(CONN), 'connection string must not appear');
    });

    it('surfaces a mapped error from execute() and leaves the engine usable', async () => {
      const eng = makeEngine();
      eng.stub.error = neonError('42P01', { table: 'missing' });
      await assertRejects(
        () => eng.execute({ sql: 'SELECT * FROM missing' }),
        EngineError,
      );

      // Engine still usable for the next query.
      eng.stub.error = null;
      eng.stub.result = {
        rows: [{ one: '1' }],
        fields: [{ name: 'one', dataTypeID: 23 }],
        rowCount: 1,
        command: 'SELECT',
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
        rows: [{ one: '1' }],
        fields: [{ name: 'one', dataTypeID: 23 }],
        rowCount: 1,
        command: 'SELECT',
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
      // Uses the real _open (a NeonHttpClient is constructed, no request sent).
      const eng = new NeonHttpEngine('lifecycle', {
        host: HOST,
        connectionString: CONN,
      });
      assertEquals(eng.status, 'CLOSED');
      await eng.connect();
      assertEquals(eng.status, 'READY');
      await eng.disconnect();
      assertEquals(eng.status, 'CLOSED');
    });
  });
});
