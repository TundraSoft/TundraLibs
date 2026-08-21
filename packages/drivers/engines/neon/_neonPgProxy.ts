/**
 * @fileoverview **Test-only** Neon SQL-over-HTTP `/sql` proxy backed by a real
 * Postgres connection.
 *
 * This stands a localhost HTTP endpoint in front of the CI Postgres so the
 * {@link NeonHttpEngine} can be exercised end-to-end — real SQL, real value
 * decoding, real SQLSTATE error mapping — without a Neon cloud account or any
 * secret. Point the engine at this proxy via its `endpoint` option (or run the
 * live suite against real Neon with `NEON_HTTP_ENDPOINT`).
 *
 * ## Why this is NOT exported from `mod.ts`
 * It imports `../postgres/PgConnection.ts` — the TCP wire stack (`protocol.ts`
 * / `binary.ts` / `auth.ts`, compat `connect`) — which must **never** enter the
 * edge/serverless (`./neon`) production graph. Keeping this module out of every
 * public barrel is what preserves `NeonHttpEngine`'s edge-safety: it is only
 * ever imported by the live test.
 *
 * ## Runtime
 * The HTTP server uses `Deno.serve`, reached lazily via `globalThis` so this
 * module loads without throwing under Bun/Node (where it simply cannot start a
 * proxy — {@link startNeonPgProxy} throws, and the live suite gates to Deno).
 * The engine's per-runtime logic is already covered by the mocked unit tests.
 *
 * @module
 */

import { connect } from '@tundralibs/compat/net';
import { PgConnection, PgServerError } from '../postgres/mod.ts';

/** Connection target for the Postgres the proxy fronts. */
export type NeonPgProxyConfig = {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
};

/** A running proxy: the base URL to hand to the engine, and a teardown hook. */
export type NeonPgProxy = {
  /** Base URL, e.g. `http://127.0.0.1:54321` — the engine's `endpoint`. */
  url: string;
  /** Shut the HTTP server down and close the backing Postgres connection. */
  close: () => Promise<void>;
};

/** Minimal shape of the `Deno.serve` handle this module relies on. */
type DenoHttpServer = {
  addr: { hostname: string; port: number };
  shutdown: () => Promise<void>;
  finished: Promise<void>;
};
type DenoServe = (
  options: {
    port: number;
    hostname?: string;
    onListen?: (addr: { hostname: string; port: number }) => void;
  },
  handler: (request: Request) => Response | Promise<Response>,
) => DenoHttpServer;

/** `Deno.serve`, or `undefined` under Bun/Node. Read lazily via `globalThis`. */
const _denoServe: DenoServe | undefined =
  (globalThis as { Deno?: { serve?: DenoServe } }).Deno?.serve;

/** Whether this runtime can host the proxy (i.e. exposes `Deno.serve`). */
export const canHostNeonPgProxy = (): boolean =>
  typeof _denoServe === 'function';

/**
 * Open a raw {@link PgConnection} to the target Postgres over plain TCP.
 *
 * CI Postgres is unencrypted, so no TLS/STARTTLS dance is attempted and
 * cleartext-password auth is permitted (the engine's own connect path applies
 * the same relaxation for local development).
 */
export async function openPgConnection(
  config: NeonPgProxyConfig,
): Promise<PgConnection> {
  const conn = await connect({ hostname: config.host, port: config.port });
  const pg = new PgConnection(conn, undefined, 'NEON::pg-proxy');
  try {
    await pg.connect({
      user: config.username,
      database: String(config.database),
      password: config.password,
      applicationName: 'neon-pg-proxy',
      tlsActive: false,
      allowCleartextPassword: true,
    });
    return pg;
  } catch (error) {
    try {
      await pg.close();
    } catch {
      /* ignore */
    }
    throw error;
  }
}

/**
 * Start a localhost Neon-compatible `/sql` proxy on an ephemeral port, backed
 * by a fresh {@link PgConnection} to `config`.
 *
 * On `POST /sql` with `{ query, params }` it runs {@link PgConnection.queryRaw}
 * and answers with Neon's success JSON `{ command, rowCount, rows, fields }`.
 * A Postgres error becomes a non-2xx Neon/Postgres error JSON
 * (`{ message, code, … }`) so the engine's `_wrapDriverError` →
 * `pgSqlStateToCode` path is exercised for real.
 *
 * @throws {Error} If the runtime does not expose `Deno.serve` (Bun/Node).
 */
export async function startNeonPgProxy(
  config: NeonPgProxyConfig,
): Promise<NeonPgProxy> {
  if (!_denoServe) {
    throw new Error(
      'startNeonPgProxy requires the Deno runtime (Deno.serve); under Bun/Node ' +
        'the live Neon suite skips and the mocked unit tests cover the engine.',
    );
  }

  const pg = await openPgConnection(config);

  // One Postgres connection backs the proxy, and the extended-query protocol is
  // not concurrency-safe, so requests are serialised through a promise chain.
  // (The engine issues one HTTP request per `execute`, so contention is nil —
  // this is belt-and-braces.)
  let tail: Promise<unknown> = Promise.resolve();
  const handler = (request: Request): Promise<Response> => {
    const run = tail.then(() => _handleSql(pg, request));
    tail = run.catch(() => {/* keep the chain alive after a failed request */});
    return run;
  };

  let resolveReady!: () => void;
  const ready = new Promise<void>((resolve) => {
    resolveReady = resolve;
  });
  const server = _denoServe(
    { port: 0, hostname: '127.0.0.1', onListen: () => resolveReady() },
    handler,
  );
  const port = server.addr.port;
  await ready;

  return {
    url: `http://127.0.0.1:${port}`,
    close: async () => {
      try {
        await server.shutdown();
      } catch {
        /* ignore */
      }
      try {
        await pg.close();
      } catch {
        /* ignore */
      }
    },
  };
}

/** Handle a single `POST /sql` request against the backing connection. */
async function _handleSql(
  pg: PgConnection,
  request: Request,
): Promise<Response> {
  const url = new URL(request.url);
  if (request.method !== 'POST' || url.pathname !== '/sql') {
    return _errorResponse(404, {
      message: `no route ${request.method} ${url.pathname}`,
    });
  }

  let body: { query?: unknown; params?: unknown };
  try {
    body = await request.json();
  } catch {
    return _errorResponse(400, { message: 'request body is not valid JSON' });
  }
  if (typeof body?.query !== 'string') {
    return _errorResponse(400, {
      message: 'missing `query` string in request body',
    });
  }
  const params = Array.isArray(body.params) ? body.params : [];

  try {
    const result = await pg.queryRaw(body.query, params);
    // Neon success shape: object rows keyed by column, raw text values.
    return Response.json({
      command: result.command,
      rowCount: result.rowCount,
      rows: result.rows,
      fields: result.fields,
    });
  } catch (error) {
    if (error instanceof PgServerError) {
      // Non-2xx with a Postgres ErrorResponse rendered as Neon's error JSON so
      // the engine maps `code` (SQLSTATE) → EngineError code.
      return _errorResponse(400, _pgErrorToNeonJson(error));
    }
    return _errorResponse(500, {
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

/** Serialise a Neon/Postgres error object as a non-2xx JSON response. */
function _errorResponse(
  status: number,
  body: Record<string, unknown>,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/** ErrorResponse field code → Neon `NeonPostgresError` property name. */
const _PG_ERROR_FIELDS: ReadonlyArray<[string, string]> = [
  ['S', 'severity'],
  ['D', 'detail'],
  ['H', 'hint'],
  ['P', 'position'],
  ['p', 'internalPosition'],
  ['q', 'internalQuery'],
  ['W', 'where'],
  ['s', 'schema'],
  ['t', 'table'],
  ['c', 'column'],
  ['d', 'dataType'],
  ['n', 'constraint'],
  ['F', 'file'],
  ['L', 'line'],
  ['R', 'routine'],
];

/** Render a {@link PgServerError} as Neon's Postgres-error JSON body. */
function _pgErrorToNeonJson(error: PgServerError): Record<string, unknown> {
  const fields = error.fields;
  const out: Record<string, unknown> = {
    message: fields.get('M') ?? error.message,
    code: error.code || fields.get('C'),
  };
  for (const [key, name] of _PG_ERROR_FIELDS) {
    const value = fields.get(key);
    if (value !== undefined) out[name] = value;
  }
  return out;
}
