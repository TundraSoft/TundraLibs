import { describe, it } from '@tundralibs/compat/test';
import {
  assert,
  assertEquals,
  assertInstanceOf,
  assertRejects,
  assertThrows,
} from '@std/asserts';
import { D1HttpClient } from './D1HttpClient.ts';
import { D1HttpError } from './D1HttpError.ts';
import { DriverError } from '../../errors/mod.ts';

const ACCOUNT_ID = 'acct-123';
const DATABASE_ID = 'db-abc';
const TOKEN = 'cf-token-abc';
const QUERY_URL =
  `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/d1/database/${DATABASE_ID}/query`;

/** Canned D1 OK envelope: one statement result with rows + meta. */
const OK_BODY = {
  success: true,
  errors: [],
  messages: [],
  result: [
    {
      success: true,
      results: [
        { n: 42, name: 'ada' },
      ],
      meta: {
        changes: 3,
        last_row_id: 7,
        rows_read: 1,
        rows_written: 3,
        duration: 0.25,
        changed_db: true,
        served_by_region: 'EEUR',
        size_after: 16384,
      },
    },
  ],
};

/** Canned D1 OK envelope for a read-only statement (no changes/last_row_id). */
const SELECT_ONLY_BODY = {
  success: true,
  errors: [],
  messages: [],
  result: [
    {
      success: true,
      results: [{ n: 1 }],
      meta: { rows_read: 1, duration: 0.1 },
    },
  ],
};

/** Canned D1 failure envelope, returned with a 2xx status (`success:false`). */
const STMT_ERR_BODY = {
  success: false,
  errors: [
    { code: 7500, message: 'UNIQUE constraint failed: users.email' },
  ],
  messages: [],
  result: [],
};

/** Canned D1 failure envelope, returned with a non-2xx status. */
const TOP_ERR_BODY = {
  success: false,
  errors: [
    { code: 7400, message: 'no such table: widgets' },
  ],
  messages: [],
  result: [],
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
      new Response(
        typeof payload === 'string' ? payload : JSON.stringify(payload),
        {
          status,
          headers: {
            'content-type': typeof payload === 'string'
              ? 'text/plain'
              : 'application/json',
          },
        },
      ),
    );
  };
  return { fn, captured };
};

/** Test subclass exposing the protected `_fetch` seam. */
class TestD1HttpClient extends D1HttpClient {
  public setFetch(fn: typeof fetch): void {
    this._fetch = fn;
  }
}

const newClient = () =>
  new TestD1HttpClient({
    accountId: ACCOUNT_ID,
    databaseId: DATABASE_ID,
    apiToken: TOKEN,
  });

describe('drivers.engines.d1.D1HttpClient', () => {
  describe('request shape', () => {
    it('POSTs to the account/database /query path with a JSON content type', async () => {
      const client = newClient();
      const { fn, captured } = makeStub(200, OK_BODY);
      client.setFetch(fn);

      await client.query('SELECT 1');

      assertEquals(captured.url, QUERY_URL);
      assertEquals(captured.method, 'POST');
      assertEquals(captured.headers?.get('content-type'), 'application/json');
    });

    it('sends the body as exactly { sql, params }', async () => {
      const client = newClient();
      const { fn, captured } = makeStub(200, OK_BODY);
      client.setFetch(fn);

      await client.query('SELECT * FROM t WHERE id = ?', [1]);

      const parsed = JSON.parse(captured.body ?? 'null');
      assertEquals(parsed, {
        sql: 'SELECT * FROM t WHERE id = ?',
        params: [1],
      });
    });

    it('defaults params to an empty array when omitted', async () => {
      const client = newClient();
      const { fn, captured } = makeStub(200, OK_BODY);
      client.setFetch(fn);

      await client.query('SELECT 1');

      const parsed = JSON.parse(captured.body ?? 'null');
      assertEquals(parsed, { sql: 'SELECT 1', params: [] });
    });

    it('POSTs to <endpoint>/accounts/.../query when `endpoint` is set', async () => {
      // The `endpoint` override (Cloudflare-compatible gateway / local test
      // proxy) replaces Cloudflare's API host verbatim; the account/database
      // query path is still appended.
      const client = new TestD1HttpClient({
        accountId: ACCOUNT_ID,
        databaseId: DATABASE_ID,
        apiToken: TOKEN,
        endpoint: 'http://127.0.0.1:8787',
      });
      const { fn, captured } = makeStub(200, OK_BODY);
      client.setFetch(fn);

      await client.query('SELECT 1');

      assertEquals(
        captured.url,
        `http://127.0.0.1:8787/accounts/${ACCOUNT_ID}/d1/database/${DATABASE_ID}/query`,
      );
      assertEquals(captured.method, 'POST');
    });
  });

  describe('auth', () => {
    it('sends the api token as Authorization: Bearer <token>', async () => {
      const client = newClient();
      const { fn, captured } = makeStub(200, OK_BODY);
      client.setFetch(fn);

      await client.query('SELECT 1');

      assertEquals(captured.headers?.get('authorization'), `Bearer ${TOKEN}`);
    });
  });

  describe('response handling', () => {
    it('parses an OK envelope into a normalized { results, meta }', async () => {
      const client = newClient();
      const { fn } = makeStub(200, OK_BODY);
      client.setFetch(fn);

      const result = await client.query<{ n: number; name: string }>(
        'SELECT n, name FROM t',
      );

      // Rows preserved verbatim — the client never coerces them.
      assertEquals(result.results, [{ n: 42, name: 'ada' }]);
      // meta.changes / meta.lastRowId mapped from changes / last_row_id.
      assertEquals(result.meta.changes, 3);
      assertEquals(result.meta.lastRowId, 7);
      assertEquals(result.meta.rowsRead, 1);
      assertEquals(result.meta.rowsWritten, 3);
      assertEquals(result.meta.duration, 0.25);
    });

    it('defaults changes to 0 and lastRowId to null for a read-only statement', async () => {
      const client = newClient();
      const { fn } = makeStub(200, SELECT_ONLY_BODY);
      client.setFetch(fn);

      const result = await client.query('SELECT 1 AS n');

      assertEquals(result.results, [{ n: 1 }]);
      assertEquals(result.meta.changes, 0);
      assertEquals(result.meta.lastRowId, null);
      assertEquals(result.meta.rowsWritten, undefined);
    });

    it('throws D1HttpError carrying { code, message } on a success:false 2xx body', async () => {
      const client = newClient();
      // A query-level failure rides inside a 200 envelope.
      const { fn } = makeStub(200, STMT_ERR_BODY);
      client.setFetch(fn);

      const error = await assertRejects(
        () => client.query('INSERT INTO users(email) VALUES (?)', ['a@b.c']),
        D1HttpError,
        'UNIQUE constraint failed',
      );
      assertEquals(error.code, 7500);
      // A query-level error is not an HTTP failure — no status is attached.
      assertEquals(error.status, undefined);
    });

    it('throws D1HttpError carrying { code, message, status } on a non-2xx body', async () => {
      const client = newClient();
      const { fn } = makeStub(400, TOP_ERR_BODY);
      client.setFetch(fn);

      const error = await assertRejects(
        () => client.query('SELECT * FROM widgets'),
        D1HttpError,
        'no such table: widgets',
      );
      assertEquals(error.code, 7400);
      assertEquals(error.status, 400);
    });

    it('throws D1HttpError on a non-D1-JSON error body', async () => {
      const client = newClient();
      // A gateway that returns a plain string / non-object body.
      const { fn } = makeStub(502, 'Bad Gateway');
      client.setFetch(fn);

      const error = await assertRejects(
        () => client.query('SELECT 1'),
        D1HttpError,
        'HTTP 502',
      );
      assertEquals(error.status, 502);
      assertEquals(error.code, undefined);
    });
  });

  describe('credential redaction', () => {
    const SECRET = 'cf-sup3r-s3cret-token';

    it('redacts the Bearer Authorization in the call-event request copy', async () => {
      const client = new TestD1HttpClient({
        accountId: ACCOUNT_ID,
        databaseId: DATABASE_ID,
        apiToken: SECRET,
      });
      let eventHeaders: Record<string, string> | undefined;
      client.on('call', (_vendor, request) => {
        eventHeaders =
          (request as { headers?: Record<string, string> }).headers;
      });
      const { fn } = makeStub(200, OK_BODY);
      client.setFetch(fn);

      await client.query('SELECT 1');

      // The bearer token rides the Authorization header, redacted by RESTler's
      // base rule (no client-specific override needed).
      assertEquals(eventHeaders?.['Authorization'], '[REDACTED]');
    });

    it('keeps the token out of a thrown transport error', async () => {
      const client = new TestD1HttpClient({
        accountId: ACCOUNT_ID,
        databaseId: DATABASE_ID,
        apiToken: SECRET,
      });
      client.setFetch(() => Promise.reject(new Error('network down')));

      const error = await assertRejects(() => client.query('SELECT 1'));
      const serialized = JSON.stringify(error);

      assert(
        !serialized.includes(SECRET),
        'the api token must not appear in the serialized error',
      );
    });
  });

  describe('config validation', () => {
    it('throws DriverError when accountId is missing/empty', () => {
      assertThrows(
        () =>
          new D1HttpClient({
            accountId: '',
            databaseId: DATABASE_ID,
            apiToken: TOKEN,
          }),
        DriverError,
        'accountId',
      );
    });

    it('throws DriverError when databaseId is missing/empty', () => {
      assertThrows(
        () =>
          new D1HttpClient({
            accountId: ACCOUNT_ID,
            databaseId: '',
            apiToken: TOKEN,
          }),
        DriverError,
        'databaseId',
      );
    });

    it('throws DriverError when apiToken is missing/empty', () => {
      assertThrows(
        () =>
          new D1HttpClient({
            accountId: ACCOUNT_ID,
            databaseId: DATABASE_ID,
            apiToken: '',
          }),
        DriverError,
        'apiToken',
      );
    });

    it('is a DriverError subclass so the engine can catch it uniformly', () => {
      const err = new D1HttpError('boom', { code: 7500 });
      assertInstanceOf(err, DriverError);
      assertEquals(err.code, 7500);
    });
  });
});
