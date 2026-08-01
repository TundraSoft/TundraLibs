import { describe, it } from '@tundralibs/compat/test';
import {
  assert,
  assertEquals,
  assertInstanceOf,
  assertRejects,
  assertThrows,
} from '@std/asserts';
import { NeonHttpClient } from './NeonHttpClient.ts';
import { NeonHttpError } from './NeonHttpError.ts';
import { DriverError } from '../../errors/mod.ts';

const HOST = 'ep-cool-name-a1b2c3.us-east-2.aws.neon.tech';
const CONN = `postgresql://user:pass@${HOST}/neondb`;

/** Canned Neon success body: object rows (array-mode off) with raw text. */
const OK_BODY = {
  command: 'SELECT',
  rowCount: 1,
  rows: [{ n: '42', name: 'ada' }],
  fields: [
    { name: 'n', dataTypeID: 23 },
    { name: 'name', dataTypeID: 25 },
  ],
};

/** Canned Neon error body: a Postgres ErrorResponse as JSON. */
const ERR_BODY = {
  message: 'duplicate key value violates unique constraint "users_pkey"',
  code: '23505',
  severity: 'ERROR',
  detail: 'Key (id)=(1) already exists.',
};

type Captured = {
  url: string | null;
  method: string | null;
  headers: Headers | null;
  body: string | null;
};

/**
 * Build a stub `fetch` (RESTler's `_fetch` seam) that records the outgoing
 * request and returns a fresh canned JSON `Response` on every call — so a
 * single test may fire more than one request without re-reading a consumed
 * body.
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
class TestNeonHttpClient extends NeonHttpClient {
  public setFetch(fn: typeof fetch): void {
    this._fetch = fn;
  }
}

describe('drivers.engines.neon.NeonHttpClient', () => {
  describe('request shape', () => {
    it('POSTs to https://<host>/sql with a JSON content type', async () => {
      const client = new TestNeonHttpClient({
        host: HOST,
        connectionString: CONN,
      });
      const { fn, captured } = makeStub(200, OK_BODY);
      client.setFetch(fn);

      await client.sql('SELECT 1');

      assertEquals(captured.url, `https://${HOST}/sql`);
      assertEquals(captured.method, 'POST');
      assertEquals(captured.headers?.get('content-type'), 'application/json');
    });

    it('POSTs to <endpoint>/sql verbatim when `endpoint` is set', async () => {
      // A Neon-compatible gateway / local proxy: the base URL is used verbatim
      // (no `https://<host>`), the path stays `/sql`, and `host` still feeds the
      // connection-string header.
      const client = new TestNeonHttpClient({
        host: 'localhost',
        endpoint: 'http://localhost:1234',
        connectionString: CONN,
      });
      const { fn, captured } = makeStub(200, OK_BODY);
      client.setFetch(fn);

      await client.sql('SELECT 1');

      assertEquals(captured.url, 'http://localhost:1234/sql');
      assertEquals(captured.method, 'POST');
    });

    it('sends the exact { query, params } JSON body', async () => {
      const client = new TestNeonHttpClient({
        host: HOST,
        connectionString: CONN,
      });
      const { fn, captured } = makeStub(200, OK_BODY);
      client.setFetch(fn);

      await client.sql('SELECT $1::int AS n', [42]);

      assertEquals(JSON.parse(captured.body ?? 'null'), {
        query: 'SELECT $1::int AS n',
        params: [42],
      });
    });

    it('defaults params to an empty array when omitted', async () => {
      const client = new TestNeonHttpClient({
        host: HOST,
        connectionString: CONN,
      });
      const { fn, captured } = makeStub(200, OK_BODY);
      client.setFetch(fn);

      await client.sql('SELECT 1');

      assertEquals(JSON.parse(captured.body ?? 'null'), {
        query: 'SELECT 1',
        params: [],
      });
    });
  });

  describe('auth + response-shaping headers', () => {
    it('sends the connection string and raw-text header, not array-mode', async () => {
      const client = new TestNeonHttpClient({
        host: HOST,
        connectionString: CONN,
      });
      const { fn, captured } = makeStub(200, OK_BODY);
      client.setFetch(fn);

      await client.sql('SELECT 1');

      assertEquals(captured.headers?.get('neon-connection-string'), CONN);
      assertEquals(captured.headers?.get('neon-raw-text-output'), 'true');
      // Array mode is deliberately left off — rows come back as objects.
      assertEquals(captured.headers?.get('neon-array-mode'), null);
    });

    it('builds the connection string from components (URL-encoded)', async () => {
      const client = new TestNeonHttpClient({
        host: HOST,
        username: 'ada',
        password: 'p@ss/w:rd',
        database: 'neondb',
      });
      const { fn, captured } = makeStub(200, OK_BODY);
      client.setFetch(fn);

      await client.sql('SELECT 1');

      assertEquals(
        captured.headers?.get('neon-connection-string'),
        `postgresql://ada:${encodeURIComponent('p@ss/w:rd')}@${HOST}/neondb`,
      );
    });

    it('sends a bearer token as Authorization: Bearer <jwt>', async () => {
      const client = new TestNeonHttpClient({ host: HOST, token: 'jwt-abc' });
      const { fn, captured } = makeStub(200, OK_BODY);
      client.setFetch(fn);

      await client.sql('SELECT 1');

      assertEquals(captured.headers?.get('authorization'), 'Bearer jwt-abc');
    });
  });

  describe('response handling', () => {
    it('parses a 200 body into a typed { rows, fields, rowCount, command }', async () => {
      const client = new TestNeonHttpClient({
        host: HOST,
        connectionString: CONN,
      });
      const { fn } = makeStub(200, OK_BODY);
      client.setFetch(fn);

      const result = await client.sql<{ n: string; name: string }>(
        'SELECT 42 AS n',
      );

      assertEquals(result.command, 'SELECT');
      assertEquals(result.rowCount, 1);
      assertEquals(result.rows, [{ n: '42', name: 'ada' }]);
      assertEquals(result.fields.length, 2);
      assertEquals(result.fields[0]?.name, 'n');
      assertEquals(result.fields[0]?.dataTypeID, 23);
      // Values are the raw Postgres text — no coercion in the client.
      assertEquals(result.rows[0]?.n, '42');
    });

    it('throws NeonHttpError carrying { message, code } on a Postgres error', async () => {
      const client = new TestNeonHttpClient({
        host: HOST,
        connectionString: CONN,
      });
      const { fn } = makeStub(400, ERR_BODY);
      client.setFetch(fn);

      const error = await assertRejects(
        () => client.sql('INSERT INTO users(id) VALUES (1)'),
        NeonHttpError,
        'duplicate key value',
      );
      assertEquals(error.code, '23505');
      assertEquals(error.status, 400);
      // The full Postgres error object is preserved for the engine.
      assertEquals(
        error.context.fields?.detail,
        'Key (id)=(1) already exists.',
      );
    });

    it('throws NeonHttpError on a non-Postgres-JSON error body', async () => {
      const client = new TestNeonHttpClient({
        host: HOST,
        connectionString: CONN,
      });
      // A gateway that returns a plain string / non-object body.
      const { fn } = makeStub(502, 'Bad Gateway');
      client.setFetch(fn);

      const error = await assertRejects(
        () => client.sql('SELECT 1'),
        NeonHttpError,
        'HTTP 502',
      );
      assertEquals(error.status, 502);
      assertEquals(error.code, undefined);
    });
  });

  describe('credential redaction', () => {
    // A distinctive password so a leak is unambiguous in the serialized error.
    const SECRET_CONN = `postgresql://user:sup3r-s3cret-pw@${HOST}/neondb`;

    it('redacts Neon-Connection-String (and a bearer Authorization) in the call-event request copy', async () => {
      const client = new TestNeonHttpClient({
        host: HOST,
        connectionString: SECRET_CONN,
        token: 'jwt-secret-xyz',
      });
      let eventHeaders: Record<string, string> | undefined;
      client.on('call', (_vendor, request) => {
        eventHeaders =
          (request as { headers?: Record<string, string> }).headers;
      });
      const { fn } = makeStub(200, OK_BODY);
      client.setFetch(fn);

      await client.sql('SELECT 1');

      // The connection-string header carries the DB password — it must be
      // redacted in the request copy handed to the `call` event (consumers
      // commonly log it), even though the real value went over the wire.
      assertEquals(eventHeaders?.['Neon-Connection-String'], '[REDACTED]');
      // The optional bearer token is redacted by RESTler's base rule.
      assertEquals(eventHeaders?.['Authorization'], '[REDACTED]');
      // The non-secret response-shaping header passes through untouched.
      assertEquals(eventHeaders?.['Neon-Raw-Text-Output'], 'true');
    });

    it('keeps the connection string out of a thrown transport error', async () => {
      const client = new TestNeonHttpClient({
        host: HOST,
        connectionString: SECRET_CONN,
      });
      // A transport failure is wrapped by RESTler into a RESTlerRequestError
      // whose `context.request` is credential-redacted.
      client.setFetch(() => Promise.reject(new Error('network down')));

      const error = await assertRejects(() => client.sql('SELECT 1'));
      const serialized = JSON.stringify(error);

      assert(
        !serialized.includes('sup3r-s3cret-pw'),
        'the connection-string password must not appear in the serialized error',
      );
      assert(
        serialized.includes('[REDACTED]'),
        'the redacted placeholder should be present in the error context',
      );
    });
  });

  describe('serialization safety (no credential leak)', () => {
    // A distinctive password so any leak is unambiguous in a snapshot.
    const LEAK_CONN = `postgresql://user:SUPERSECRETPW@${HOST}/db`;

    // `Deno.inspect` is Deno-only; read it off the global without depending on
    // the `Deno` ambient type so the check compiles under every runtime.
    const g = globalThis as unknown as {
      Deno?: { inspect(v: unknown, o?: { depth?: number }): string };
    };

    it('keeps the connection string out of JSON.stringify / Deno.inspect while still sending it on the wire', async () => {
      const client = new TestNeonHttpClient({
        host: HOST,
        connectionString: LEAK_CONN,
      });

      // The plaintext DB password must NOT be an enumerable part of the client:
      // it is held in RESTler's closure-backed options store (like the bearer
      // token), not on the enumerable `_defaultHeaders`. So a structured logger
      // / error monitor that snapshots the client — or an engine holding it —
      // never ships the credential to logs.
      assert(
        !JSON.stringify(client).includes('SUPERSECRETPW'),
        'connection-string password must not appear in JSON.stringify(client)',
      );
      if (typeof g.Deno?.inspect === 'function') {
        assert(
          !g.Deno.inspect(client, { depth: 8 }).includes('SUPERSECRETPW'),
          'connection-string password must not appear in Deno.inspect(client)',
        );
      }

      // …but the credential still reaches the wire: it is injected as the
      // `Neon-Connection-String` header per-request by `_authInjector`.
      const { fn, captured } = makeStub(200, OK_BODY);
      client.setFetch(fn);
      await client.sql('SELECT 1');
      assertEquals(
        captured.headers?.get('neon-connection-string'),
        LEAK_CONN,
      );

      // Firing a request must not park the credential back onto the enumerable
      // object (the header rides a per-request endpoint copy, not the client).
      assert(
        !JSON.stringify(client).includes('SUPERSECRETPW'),
        'connection-string password must not appear after a request either',
      );
      if (typeof g.Deno?.inspect === 'function') {
        assert(
          !g.Deno.inspect(client, { depth: 8 }).includes('SUPERSECRETPW'),
          'connection-string password must not appear in Deno.inspect after a request',
        );
      }
    });
  });

  describe('config validation', () => {
    it('throws DriverError when host is missing/empty', () => {
      assertThrows(
        () => new NeonHttpClient({ host: '', connectionString: CONN }),
        DriverError,
        'host',
      );
    });

    it('throws DriverError when no auth is supplied', () => {
      const err = assertThrows(
        () => new NeonHttpClient({ host: HOST }),
        DriverError,
      );
      assertInstanceOf(err, DriverError);
    });
  });
});
