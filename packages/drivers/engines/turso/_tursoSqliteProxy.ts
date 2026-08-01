/**
 * @fileoverview **Test-only** Turso / libSQL Hrana-v3 `/v3/pipeline` proxy
 * backed by an in-process `:memory:` SQLite database.
 *
 * This stands a localhost HTTP endpoint that speaks the same Hrana-over-HTTP
 * pipeline protocol {@link TursoEngine} dials, so the engine can be exercised
 * end-to-end — real SQL, real value round-trips, real SQLite constraint errors,
 * real `last_insert_rowid` — with **no external service and no secret**. Unlike
 * the Neon proxy (which fronts a live Postgres), the backing store here is a
 * `:memory:` SQLite handle opened through the native SQLite adapter, so the
 * live suite runs green in CI with zero infrastructure. Point the engine at
 * this proxy via its `url` option (or run the live suite against a real
 * Turso / `sqld` with `TURSO_HTTP_ENDPOINT`).
 *
 * ## Why this is NOT exported from `mod.ts`
 * It imports `../sqlite/adapter.ts` — the runtime's **native** SQLite binding
 * (`@db/sqlite` / `bun:sqlite` / `node:sqlite`), which must **never** enter the
 * edge/serverless (`./turso`) production graph. Keeping this module out of every
 * public barrel is exactly what preserves `TursoEngine`'s edge-safety: it is
 * only ever imported by the live test, and `deno task check:edge-safety` walks
 * the runtime graph from `turso/mod.ts` (which never reaches here or the native
 * adapter).
 *
 * ## Faithful round-trip via the engine's own value map
 * Incoming Hrana args are decoded to JS with {@link decodeHranaValue} (the same
 * function the engine uses), bound to the backing SQLite, and the result cells
 * are re-encoded with {@link encodeHranaValue}. Because those two functions are
 * inverses over SQLite's five storage classes, a value flows
 * `engine → wire → decode → SQLite → encode → wire → engine.decode` and comes
 * back with the same JS type it went in as — small int → `number`, int past
 * 2^53 → `bigint`, REAL → `number`, TEXT → `string`, BLOB → `Uint8Array`,
 * NULL → `null`.
 *
 * ## Runtime
 * The HTTP server uses `Deno.serve`, reached lazily via `globalThis` so this
 * module loads without throwing under Bun/Node (where it simply cannot start a
 * proxy — {@link startTursoSqliteProxy} throws, and the live suite gates to
 * Deno or a real `TURSO_HTTP_ENDPOINT`). The engine's per-runtime logic is
 * already covered by the mocked unit tests.
 *
 * @module
 */

import { openDatabase, type SqliteDb } from '../sqlite/adapter.ts';
import { decodeHranaValue, encodeHranaValue } from './values.ts';
import type {
  HranaStmt,
  HranaValue,
  TursoPipelineRequest,
} from './types/mod.ts';

/** A running proxy: the base URL to hand to the engine, and a teardown hook. */
export type TursoSqliteProxy = {
  /** Base URL, e.g. `http://127.0.0.1:54321` — the engine's `url` option. */
  url: string;
  /** Shut the HTTP server down and close the backing SQLite database. */
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
export const canHostTursoProxy = (): boolean =>
  typeof _denoServe === 'function';

/** The Hrana v3 JSON pipeline endpoint path the engine POSTs to. */
const PIPELINE_PATH = '/v3/pipeline';

/**
 * Start a localhost Hrana-v3 `/v3/pipeline` proxy on an ephemeral port, backed
 * by a fresh in-memory SQLite database.
 *
 * A single `:memory:` handle lives for the proxy's lifetime, so DDL and data
 * from one `execute` are visible to the next (the engine issues one HTTP
 * request per statement). On `POST /v3/pipeline` it decodes the pipeline's
 * `execute` statement, runs it against SQLite, and answers with the Hrana
 * success envelope; a SQLite failure becomes a per-statement Hrana `error`
 * result **inside a 200 response** (matching real libSQL), so the engine's
 * `_wrapDriverError` → `sqliteErrorToCode` path is exercised for real.
 *
 * @throws {Error} If the runtime does not expose `Deno.serve` (Bun/Node).
 */
export async function startTursoSqliteProxy(): Promise<TursoSqliteProxy> {
  if (!_denoServe) {
    throw new Error(
      'startTursoSqliteProxy requires the Deno runtime (Deno.serve); under ' +
        'Bun/Node the live Turso suite skips (set TURSO_HTTP_ENDPOINT to run ' +
        'against a real endpoint) and the mocked unit tests cover the engine.',
    );
  }

  const db = await openDatabase(':memory:', {});

  const handler = (request: Request): Promise<Response> =>
    _handlePipeline(db, request);

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
        db.close();
      } catch {
        /* ignore */
      }
    },
  };
}

/** Handle a single `POST /v3/pipeline` request against the backing SQLite. */
async function _handlePipeline(
  db: SqliteDb,
  request: Request,
): Promise<Response> {
  const url = new URL(request.url);
  if (request.method !== 'POST' || url.pathname !== PIPELINE_PATH) {
    return _topLevelError(404, `no route ${request.method} ${url.pathname}`);
  }

  let body: TursoPipelineRequest;
  try {
    body = await request.json();
  } catch {
    return _topLevelError(400, 'request body is not valid JSON');
  }
  if (!body || !Array.isArray(body.requests)) {
    return _topLevelError(400, 'missing `requests` array in pipeline body');
  }

  // The engine always sends `[{ execute }, { close }]`; mirror that positional
  // shape, running the `execute` and answering `ok` for the trailing `close`.
  const results = body.requests.map((req) => {
    if (req.type === 'close') {
      return { type: 'ok' as const, response: { type: 'close' as const } };
    }
    if (req.type !== 'execute') {
      // Unknown step: surface a Hrana error so the client rejects clearly.
      return {
        type: 'error' as const,
        error: {
          message: `unsupported pipeline request type '${
            (req as { type?: string }).type ?? 'unknown'
          }'`,
        },
      };
    }
    try {
      const result = _runStatement(db, req.stmt);
      return {
        type: 'ok' as const,
        response: { type: 'execute' as const, result },
      };
    } catch (error) {
      // A SQLite failure is reported as a per-statement Hrana error result
      // (HTTP stays 200) — exactly how real libSQL surfaces it. The `code`
      // rides along when the binding supplied one; every binding at least
      // supplies the message text, which `sqliteErrorToCode` maps on its own.
      const err = error as { code?: unknown; message?: unknown };
      const message = typeof err.message === 'string'
        ? err.message
        : String(error);
      const code = typeof err.code === 'string' ? err.code : undefined;
      return {
        type: 'error' as const,
        error: code === undefined ? { message } : { message, code },
      };
    }
  });

  return _json(200, { baton: null, base_url: null, results });
}

/**
 * Run one decoded Hrana statement against the backing SQLite and return its
 * result in the wire `StmtResult` shape (`snake_case` keys, `rows` as arrays of
 * re-encoded {@link HranaValue} cells aligned to `cols`).
 */
function _runStatement(db: SqliteDb, stmt: HranaStmt): HranaWireResult {
  // Decode the engine's Hrana args back to JS values. The engine binds named
  // args (`:name`), but positional `?` args are supported too for a real
  // endpoint's sake. @db/sqlite (and the other adapter backends) bind a `:name`
  // placeholder from an object keyed by the bare name, or positional `?` from
  // spread values.
  const named = stmt.named_args ?? [];
  const positional = stmt.args ?? [];
  let bindArgs: ReadonlyArray<unknown>;
  if (named.length > 0) {
    const map: Record<string, unknown> = {};
    for (const { name, value } of named) map[name] = decodeHranaValue(value);
    bindArgs = [map];
  } else if (positional.length > 0) {
    bindArgs = positional.map((v) => decodeHranaValue(v));
  } else {
    bindArgs = [];
  }

  const prepared = db.prepare(stmt.sql);
  try {
    if (_isRowReturning(stmt.sql)) {
      const jsRows = prepared.all(bindArgs);
      // Column order follows the object's insertion order = SQLite's column
      // order; deriving `cols` + each cell from the same key list keeps
      // `cols[i].name` aligned with `rows[*][i]`. An empty result set carries
      // no column info, which is fine — the engine only reads cells it has.
      const keys = jsRows.length > 0 ? Object.keys(jsRows[0]!) : [];
      const cols = keys.map((name) => ({ name, decltype: null }));
      const rows = jsRows.map((row) =>
        keys.map((k) => encodeHranaValue(row[k]))
      );
      return {
        cols,
        rows,
        affected_row_count: jsRows.length,
        last_insert_rowid: null,
      };
    }
    // Bare INSERT/UPDATE/DELETE or DDL — no result set; report affected rows.
    const r = prepared.run(bindArgs);
    return {
      cols: [],
      rows: [],
      affected_row_count: r.changes,
      last_insert_rowid: r.lastInsertRowid === undefined
        ? null
        : String(r.lastInsertRowid),
    };
  } catch (error) {
    // Capture the driver's message NOW, before `finalize()` runs below.
    // @db/sqlite computes the detailed constraint text
    // (`UNIQUE constraint failed: t.id`) from live DB state; `finalize()` on a
    // failed statement both resets that to a generic `19: constraint failed`
    // AND re-throws the step's result code. Reading it here (a single access)
    // and re-throwing a plain error carrying the captured string is what keeps
    // the text `sqliteErrorToCode` matches on from being lost or masked.
    const err = error as { code?: unknown; message?: unknown };
    const rawMessage = err.message;
    const message = typeof rawMessage === 'string' ? rawMessage : String(error);
    const rethrow = new Error(message) as Error & { code?: string };
    if (typeof err.code === 'string') rethrow.code = err.code;
    throw rethrow;
  } finally {
    // Finalizing a statement whose step failed re-surfaces that step's result
    // code as a throw (e.g. SQLITE_CONSTRAINT → `19: constraint failed`), which
    // would mask the real error captured above — swallow it.
    try {
      prepared.finalize?.();
    } catch {
      /* ignore — the meaningful error was already captured/returned */
    }
  }
}

/** The wire `StmtResult` this proxy emits (a subset of the spec's fields). */
type HranaWireResult = {
  cols: Array<{ name: string; decltype: null }>;
  rows: HranaValue[][];
  affected_row_count: number;
  last_insert_rowid: string | null;
};

/**
 * Whether a statement yields a result set (needs `.all()`), mirroring the
 * native `SQLiteEngine`'s own row-vs-run decision: `SELECT` / `PRAGMA` /
 * `WITH` / `EXPLAIN`, plus any `INSERT`/`UPDATE`/`DELETE ... RETURNING`.
 */
function _isRowReturning(sql: string): boolean {
  const t = sql.trimStart().slice(0, 8).toUpperCase();
  if (
    t.startsWith('SELECT') || t.startsWith('PRAGMA') ||
    t.startsWith('WITH ') || t.startsWith('EXPLAIN')
  ) {
    return true;
  }
  const head = t.startsWith('INSERT') || t.startsWith('UPDATE') ||
    t.startsWith('DELETE');
  return head && /\bRETURNING\b/i.test(sql);
}

/** A JSON response with an explicit status. */
function _json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/**
 * A non-2xx pipeline-level error whose JSON body is a bare Hrana
 * `{ message }` — the shape the client's top-level error path expects.
 */
function _topLevelError(status: number, message: string): Response {
  return _json(status, { message });
}
