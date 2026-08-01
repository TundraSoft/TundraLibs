import { describe, it } from '@tundralibs/compat/test';
import {
  assert,
  assertEquals,
  assertInstanceOf,
  assertRejects,
  assertThrows,
} from '@std/asserts';
import { TursoHttpClient } from './TursoHttpClient.ts';
import { TursoHttpError } from './TursoHttpError.ts';
import { DriverError } from '../../errors/mod.ts';
import type { HranaValue } from './types/mod.ts';

const HOST = 'my-db-my-org.turso.io';
const LIBSQL_URL = `libsql://${HOST}`;
const HTTPS_URL = `https://${HOST}`;
const TOKEN = 'jwt-abc';

/** Canned Hrana OK pipeline body: one `execute` ok result + a `close` ok. */
const OK_BODY = {
  baton: null,
  base_url: null,
  results: [
    {
      type: 'ok',
      response: {
        type: 'execute',
        result: {
          cols: [
            { name: 'n', decltype: 'INTEGER' },
            { name: 'name', decltype: 'TEXT' },
          ],
          rows: [
            [
              { type: 'integer', value: '42' },
              { type: 'text', value: 'ada' },
            ],
          ],
          affected_row_count: 0,
          last_insert_rowid: '7',
          rows_read: 1,
          rows_written: 0,
          query_duration_ms: 0.1,
        },
      },
    },
    { type: 'ok', response: { type: 'close' } },
  ],
};

/** Canned Hrana per-statement error result (HTTP status is still 200). */
const STMT_ERR_BODY = {
  baton: null,
  base_url: null,
  results: [
    {
      type: 'error',
      error: {
        message: 'UNIQUE constraint failed: users.id',
        code: 'SQLITE_CONSTRAINT_PRIMARYKEY',
      },
    },
    { type: 'ok', response: { type: 'close' } },
  ],
};

/** Canned top-level (pipeline) error body, returned with a non-2xx status. */
const TOP_ERR_BODY = {
  message: 'stream not found',
  code: 'STREAM_NOT_FOUND',
};

type Captured = {
  url: string | null;
  method: string | null;
  headers: Headers | null;
  body: string | null;
};

/**
 * Build a stub `fetch` (RESTler's `_fetch` seam) that records the outgoing
 * request and returns a fresh canned JSON `Response` on every call.
 */
const makeStub = (status: number, payload: unknown) => {
  const captured: Captured = {
    url: null,
    method: null,
    headers: null,
    body: null,
  };
  const fn: typeof fetch = (input, init) => {
    captured.url = input.toString();
    captured.method = init?.method ?? null;
    captured.headers = new Headers(
      (init?.headers ?? undefined) as HeadersInit | undefined,
    );
    captured.body = typeof init?.body === 'string' ? init.body : null;
    return Promise.resolve(
      new Response(JSON.stringify(payload), {
        status,
        headers: { 'content-type': 'application/json' },
      }),
    );
  };
  return { fn, captured };
};

/** Test subclass exposing the protected `_fetch` seam. */
class TestTursoHttpClient extends TursoHttpClient {
  public setFetch(fn: typeof fetch): void {
    this._fetch = fn;
  }
}

describe('drivers.engines.turso.TursoHttpClient', () => {
  describe('request shape', () => {
    it('POSTs to https://<host>/v3/pipeline with a JSON content type', async () => {
      const client = new TestTursoHttpClient({
        url: HTTPS_URL,
        authToken: TOKEN,
      });
      const { fn, captured } = makeStub(200, OK_BODY);
      client.setFetch(fn);

      await client.execute('SELECT 1');

      assertEquals(captured.url, `https://${HOST}/v3/pipeline`);
      assertEquals(captured.method, 'POST');
      assertEquals(captured.headers?.get('content-type'), 'application/json');
    });

    it('normalizes a libsql:// URL to https://', async () => {
      const client = new TestTursoHttpClient({
        url: LIBSQL_URL,
        authToken: TOKEN,
      });
      const { fn, captured } = makeStub(200, OK_BODY);
      client.setFetch(fn);

      await client.execute('SELECT 1');

      assertEquals(captured.url, `https://${HOST}/v3/pipeline`);
    });

    it('accepts a bare host and assumes https://', async () => {
      const client = new TestTursoHttpClient({ url: HOST, authToken: TOKEN });
      const { fn, captured } = makeStub(200, OK_BODY);
      client.setFetch(fn);

      await client.execute('SELECT 1');

      assertEquals(captured.url, `https://${HOST}/v3/pipeline`);
    });

    it('maps a wss:// URL to https:// (not the bogus single-label host `wss`)', async () => {
      const client = new TestTursoHttpClient({
        url: `wss://${HOST}`,
        authToken: TOKEN,
      });
      const { fn, captured } = makeStub(200, OK_BODY);
      client.setFetch(fn);

      await client.execute('SELECT 1');

      // The old catch-all blindly prepended `https://`, yielding
      // `https://wss://…` whose origin is `https://wss` — every request then
      // dialed the non-existent single-label host `wss`. The fix dials the
      // real host.
      assertEquals(captured.url, `https://${HOST}/v3/pipeline`);
    });

    it('maps a ws:// URL to http:// (local sqld over ws)', async () => {
      const client = new TestTursoHttpClient({
        url: `ws://${HOST}`,
        authToken: TOKEN,
      });
      const { fn, captured } = makeStub(200, OK_BODY);
      client.setFetch(fn);

      await client.execute('SELECT 1');

      assertEquals(captured.url, `http://${HOST}/v3/pipeline`);
    });

    it('sends an [execute, close] pipeline with sql/args/named_args', async () => {
      const client = new TestTursoHttpClient({
        url: LIBSQL_URL,
        authToken: TOKEN,
      });
      const { fn, captured } = makeStub(200, OK_BODY);
      client.setFetch(fn);

      const args: HranaValue[] = [{ type: 'integer', value: '42' }];
      const namedArgs = [
        { name: 'x', value: { type: 'text', value: 'ada' } as HranaValue },
      ];
      await client.execute('SELECT ?, :x', args, namedArgs);

      const parsed = JSON.parse(captured.body ?? 'null');
      assertEquals(parsed.baton, null);
      assertEquals(parsed.requests, [
        {
          type: 'execute',
          stmt: {
            sql: 'SELECT ?, :x',
            args: [{ type: 'integer', value: '42' }],
            named_args: [{ name: 'x', value: { type: 'text', value: 'ada' } }],
          },
        },
        { type: 'close' },
      ]);
    });

    it('defaults args/named_args to empty arrays when omitted', async () => {
      const client = new TestTursoHttpClient({
        url: LIBSQL_URL,
        authToken: TOKEN,
      });
      const { fn, captured } = makeStub(200, OK_BODY);
      client.setFetch(fn);

      await client.execute('SELECT 1');

      const parsed = JSON.parse(captured.body ?? 'null');
      assertEquals(parsed.requests[0], {
        type: 'execute',
        stmt: { sql: 'SELECT 1', args: [], named_args: [] },
      });
      assertEquals(parsed.requests[1], { type: 'close' });
    });
  });

  describe('auth', () => {
    it('sends the auth token as Authorization: Bearer <token>', async () => {
      const client = new TestTursoHttpClient({
        url: LIBSQL_URL,
        authToken: TOKEN,
      });
      const { fn, captured } = makeStub(200, OK_BODY);
      client.setFetch(fn);

      await client.execute('SELECT 1');

      assertEquals(captured.headers?.get('authorization'), `Bearer ${TOKEN}`);
    });

    it('sends no Authorization header for an empty token (local sqld)', async () => {
      const client = new TestTursoHttpClient({ url: HTTPS_URL, authToken: '' });
      const { fn, captured } = makeStub(200, OK_BODY);
      client.setFetch(fn);

      await client.execute('SELECT 1');

      assertEquals(captured.headers?.get('authorization'), null);
    });
  });

  describe('response handling', () => {
    it('parses an OK execute result into a normalized HranaExecuteResult', async () => {
      const client = new TestTursoHttpClient({
        url: LIBSQL_URL,
        authToken: TOKEN,
      });
      const { fn } = makeStub(200, OK_BODY);
      client.setFetch(fn);

      const result = await client.execute('SELECT 42 AS n');

      assertEquals(result.affectedRowCount, 0);
      assertEquals(result.lastInsertRowid, '7');
      assertEquals(result.cols, [
        { name: 'n', decltype: 'INTEGER' },
        { name: 'name', decltype: 'TEXT' },
      ]);
      // Raw HranaValue cells are preserved — the client never coerces them.
      assertEquals(result.rows, [
        [
          { type: 'integer', value: '42' },
          { type: 'text', value: 'ada' },
        ],
      ]);
      assertEquals(result.rows[0]?.[0], { type: 'integer', value: '42' });
    });

    it('throws TursoHttpError carrying { code, message } on a statement error', async () => {
      const client = new TestTursoHttpClient({
        url: LIBSQL_URL,
        authToken: TOKEN,
      });
      // A per-statement error rides inside a 200 response.
      const { fn } = makeStub(200, STMT_ERR_BODY);
      client.setFetch(fn);

      const error = await assertRejects(
        () => client.execute('INSERT INTO users(id) VALUES (1)'),
        TursoHttpError,
        'UNIQUE constraint failed',
      );
      assertEquals(error.code, 'SQLITE_CONSTRAINT_PRIMARYKEY');
      // A statement error is not an HTTP failure — no status is attached.
      assertEquals(error.status, undefined);
    });

    it('throws TursoHttpError on a top-level pipeline error (non-2xx)', async () => {
      const client = new TestTursoHttpClient({
        url: LIBSQL_URL,
        authToken: TOKEN,
      });
      const { fn } = makeStub(400, TOP_ERR_BODY);
      client.setFetch(fn);

      const error = await assertRejects(
        () => client.execute('SELECT 1'),
        TursoHttpError,
        'stream not found',
      );
      assertEquals(error.code, 'STREAM_NOT_FOUND');
      assertEquals(error.status, 400);
    });

    it('throws TursoHttpError on a non-Hrana-JSON error body', async () => {
      const client = new TestTursoHttpClient({
        url: LIBSQL_URL,
        authToken: TOKEN,
      });
      // A gateway that returns a plain string / non-object body.
      const { fn } = makeStub(502, 'Bad Gateway');
      client.setFetch(fn);

      const error = await assertRejects(
        () => client.execute('SELECT 1'),
        TursoHttpError,
        'HTTP 502',
      );
      assertEquals(error.status, 502);
      assertEquals(error.code, undefined);
    });
  });

  describe('credential redaction', () => {
    const SECRET = 'jwt-sup3r-s3cret-token';

    it('redacts the Bearer Authorization in the call-event request copy', async () => {
      const client = new TestTursoHttpClient({
        url: HTTPS_URL,
        authToken: SECRET,
      });
      let eventHeaders: Record<string, string> | undefined;
      client.on('call', (_vendor, request) => {
        eventHeaders =
          (request as { headers?: Record<string, string> }).headers;
      });
      const { fn } = makeStub(200, OK_BODY);
      client.setFetch(fn);

      await client.execute('SELECT 1');

      // The bearer token is redacted by RESTler's base rule (it rides the
      // Authorization header, which needs no client-specific override).
      assertEquals(eventHeaders?.['Authorization'], '[REDACTED]');
    });

    it('keeps the token out of a thrown transport error', async () => {
      const client = new TestTursoHttpClient({
        url: HTTPS_URL,
        authToken: SECRET,
      });
      client.setFetch(() => Promise.reject(new Error('network down')));

      const error = await assertRejects(() => client.execute('SELECT 1'));
      const serialized = JSON.stringify(error);

      assert(
        !serialized.includes(SECRET),
        'the auth token must not appear in the serialized error',
      );
    });
  });

  describe('config validation', () => {
    it('throws DriverError when url is missing/empty', () => {
      assertThrows(
        () => new TursoHttpClient({ url: '', authToken: TOKEN }),
        DriverError,
        'url',
      );
    });

    it('throws DriverError for an unsupported URL scheme (never `https://<scheme>`)', () => {
      // A genuinely unknown scheme is a misconfiguration — fail cleanly at
      // construction rather than mangling it into a bogus `https://ftp://…`
      // origin.
      const err = assertThrows(
        () => new TursoHttpClient({ url: `ftp://${HOST}`, authToken: TOKEN }),
        DriverError,
        'scheme',
      );
      assertInstanceOf(err, DriverError);
      assertEquals(
        (err as DriverError).context.code,
        'INVALID_CONFIG_VALUE',
      );
    });

    it('is a DriverError subclass so the engine can catch it uniformly', () => {
      const err = new TursoHttpError('boom', { code: 'SQLITE_ERROR' });
      assertInstanceOf(err, DriverError);
      assertEquals(err.code, 'SQLITE_ERROR');
    });
  });
});
