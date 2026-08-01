/**
 * @fileoverview **Test-only** Cloudflare D1 REST (`/accounts/{acct}/d1/database/
 * {db}/query`) proxy backed by an in-process `:memory:` SQLite database.
 *
 * This stands a localhost HTTP endpoint that speaks the same D1 REST query
 * protocol {@link D1Engine} dials, so the engine can be exercised end-to-end —
 * real SQL, real value round-trips, real SQLite constraint errors,
 * real `last_insert_rowid` — with **no external service and no secret**. Unlike
 * the Neon proxy (which fronts a live Postgres), the backing store here is a
 * `:memory:` SQLite database opened through the native `@db/sqlite` binding, so
 * the live suite runs green in CI with zero infrastructure. Point the engine at
 * this proxy via its `endpoint` option (or run the live suite against a real
 * Cloudflare D1 endpoint with `D1_HTTP_ENDPOINT`).
 *
 * ## Why this is NOT exported from `mod.ts`
 * It imports the runtime's **native** SQLite binding (`@db/sqlite`, via the
 * `$sqlite_deno` import-map alias — dynamically, Deno-only), which must **never**
 * enter the edge/serverless (`./d1`) production graph. Keeping this module out of
 * every public barrel is exactly what preserves `D1Engine`'s edge-safety: it is
 * only ever imported by the live test, and `deno task check:edge-safety` walks
 * the runtime graph from `d1/mod.ts` (which never reaches here or the native
 * binding).
 *
 * ## Faithful round-trip via the D1 JSON value shape
 * D1's `/query` endpoint returns rows as objects keyed by column name with
 * plain-JSON values (INTEGER→number, REAL→number, TEXT→string, NULL→null), and
 * a BLOB as an **array of byte numbers** (JSON has no binary type). The engine
 * encodes a `Uint8Array` bind value the same way (an array of byte numbers), so
 * this proxy decodes any **array** param back to a `Uint8Array` before binding,
 * and re-encodes a result `Uint8Array` cell to an array of byte numbers —
 * mirroring real D1. Positional `?` placeholders bind natively (no `:name`
 * conversion, unlike the Turso proxy).
 *
 * ### int64 over JSON is lossy — by design
 * D1 carries an INTEGER as a JSON `number`, so a value beyond ±(2^53 − 1) loses
 * precision (the documented `D1Engine` limitation). This proxy matches that: a
 * `bigint` result cell is `Number()`-ed into the JSON body exactly as D1 would,
 * rather than string-preserved like Turso's Hrana transport.
 *
 * ## Foreign keys ON (matches real D1)
 * Cloudflare D1 enforces foreign keys by default on every query, so the backing
 * database runs `PRAGMA foreign_keys = ON` — a bare SQLite would ship it OFF.
 *
 * ## Runtime
 * The HTTP server uses `Deno.serve`, reached lazily via `globalThis` so this
 * module loads without throwing under Bun/Node (where it simply cannot start a
 * proxy — {@link startD1SqliteProxy} throws, and the live suite gates to Deno or
 * a real `D1_HTTP_ENDPOINT`). The engine's per-runtime logic is already covered
 * by the mocked unit tests.
 *
 * @module
 */

/** A running proxy: the base URL to hand to the engine, and a teardown hook. */
export type D1SqliteProxy = {
  /** Base URL, e.g. `http://127.0.0.1:54321` — the engine's `endpoint`. */
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
export const canHostD1Proxy = (): boolean => typeof _denoServe === 'function';

/** Minimal shape of the `@db/sqlite` database handle this module drives. */
type SqliteDatabase = {
  exec(sql: string): void;
  prepare(sql: string): SqliteStatement;
  close(): void;
  readonly changes: number;
  readonly lastInsertRowId: number | bigint;
};
type SqliteStatement = {
  all(...params: unknown[]): Record<string, unknown>[];
  run(...params: unknown[]): number;
  finalize?(): void;
};

/**
 * The D1 REST query path this proxy serves —
 * `/accounts/{accountId}/d1/database/{databaseId}/query`. The account/database
 * segments are opaque here (the single backing `:memory:` database answers every
 * request), so they are matched but not otherwise used.
 */
const QUERY_PATH_RE = /^\/accounts\/[^/]+\/d1\/database\/[^/]+\/query$/;

/**
 * Cloudflare's generic D1 query-error code, surfaced as the numeric `code` on a
 * statement error. The engine maps the error from the SQLite-style **message**
 * (it passes `undefined` for the string code to `sqliteErrorToCode`), so the
 * exact number here is diagnostic only — but D1 always supplies one.
 */
const D1_QUERY_ERROR_CODE = 7500;

/**
 * Start a localhost D1-REST `/query` proxy on an ephemeral port, backed by a
 * fresh in-memory SQLite database.
 *
 * A single `:memory:` handle lives for the proxy's lifetime, so DDL and data
 * from one `execute` are visible to the next (the engine issues one HTTP request
 * per statement). On a `POST` to the account/database `/query` path it runs the
 * `?`-placeholder statement against SQLite and answers with the D1 success
 * envelope; a SQLite failure becomes a `success:false` D1 envelope **inside a
 * 200 response** (matching how real D1 surfaces a statement error), with the
 * message carrying the real workerd `: SQLITE_<PRIMARY> [(extended: …)]`
 * decoration (see {@link _decorateWorkerdError}), so the engine's
 * `_wrapDriverError` → decoration-strip → `sqliteErrorToCode` /
 * `parseSqliteErrorMeta` path is exercised against the true wire shape.
 *
 * @throws {Error} If the runtime does not expose `Deno.serve` (Bun/Node).
 */
export async function startD1SqliteProxy(): Promise<D1SqliteProxy> {
  if (!_denoServe) {
    throw new Error(
      'startD1SqliteProxy requires the Deno runtime (Deno.serve); under ' +
        'Bun/Node the live D1 suite skips (set D1_HTTP_ENDPOINT to run ' +
        'against a real endpoint) and the mocked unit tests cover the engine.',
    );
  }

  // The `as string` cast keeps non-Deno runtimes from statically resolving this
  // Deno-only specifier; this dynamic import only ever runs on Deno (gated by
  // `_denoServe` above), mirroring the native adapter's own `_openDeno`.
  const mod = await import('$sqlite_deno' as string);
  const Database = mod.Database ?? mod.default;
  const db = new Database(':memory:', {
    // Lossless int64 binds (without it, @db/sqlite truncates a bigint bind to
    // its low 32 bits). Reads return `number` within the safe range and `bigint`
    // beyond it — which `_encodeD1Cell` then folds to a JSON `number` (D1's own
    // lossy int64-over-JSON), so the wire shape matches real D1.
    int64: true,
  }) as SqliteDatabase;
  // D1 enforces foreign keys by default on every query; match that (SQLite ships
  // the pragma OFF).
  db.exec('PRAGMA foreign_keys = ON');

  const handler = (request: Request): Promise<Response> =>
    _handleQuery(db, request);

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

/** Handle a single `POST …/query` request against the backing SQLite. */
async function _handleQuery(
  db: SqliteDatabase,
  request: Request,
): Promise<Response> {
  const url = new URL(request.url);
  if (request.method !== 'POST' || !QUERY_PATH_RE.test(url.pathname)) {
    // A route miss is a transport/API-level failure — a non-2xx D1 envelope.
    return _topError(404, `no route ${request.method} ${url.pathname}`);
  }

  let body: { sql?: unknown; params?: unknown };
  try {
    body = await request.json();
  } catch {
    return _topError(400, 'request body is not valid JSON');
  }
  if (typeof body?.sql !== 'string') {
    return _topError(400, 'missing `sql` string in request body');
  }
  const params = Array.isArray(body.params) ? body.params : [];

  try {
    const entry = _runStatement(db, body.sql, params);
    return _json(200, {
      success: true,
      errors: [],
      messages: [],
      result: [entry],
    });
  } catch (error) {
    // A SQLite failure is reported as a `success:false` D1 envelope with HTTP
    // still 200 — exactly how real D1 surfaces a statement error. The numeric
    // `code` rides along (D1 always supplies one); the message text is what the
    // engine maps via `sqliteErrorToCode`.
    const err = error as { code?: unknown; message?: unknown };
    const rawMessage = typeof err.message === 'string'
      ? err.message
      : String(error);
    // Emit the REAL Cloudflare-D1 wire shape: workerd's `dbErrorMessage()`
    // decorates every SQLite error message with a trailing
    // `: SQLITE_<PRIMARY> [(extended: SQLITE_<EXT>)]` tail. `@db/sqlite` (this
    // proxy's backing engine) hands back the UNDECORATED text, so re-create the
    // decoration here — otherwise the live/proxy suite would never exercise the
    // engine's decoration-stripping (`_wrapDriverError`) and could not catch the
    // trailing-colon constraint/column/table corruption it guards against.
    const message = _decorateWorkerdError(rawMessage);
    const code = typeof err.code === 'number' ? err.code : D1_QUERY_ERROR_CODE;
    return _json(200, {
      success: false,
      errors: [{ code, message }],
      messages: [],
      result: [],
    });
  }
}

/** One D1 statement-result entry (the `result[0]` the engine reads). */
type D1WireEntry = {
  success: true;
  results: Record<string, unknown>[];
  meta: {
    changes: number;
    last_row_id: number;
    rows_read: number;
    rows_written: number;
    duration: number;
  };
};

/**
 * Run one `?`-placeholder statement against the backing SQLite and return its
 * result in the D1 wire entry shape (`snake_case` meta, `results` as objects
 * keyed by column name with D1-JSON-encoded cell values).
 */
function _runStatement(
  db: SqliteDatabase,
  sql: string,
  params: ReadonlyArray<unknown>,
): D1WireEntry {
  // The engine binds positional `?`; SQLite binds those natively from spread
  // args. Only a BLOB needs work: the engine sends it as a JSON array of byte
  // numbers, so decode any array param back to a `Uint8Array` before binding
  // (objects/arrays for TEXT/JSON columns arrive JSON-stringified, never as an
  // array, so an array param is unambiguously a BLOB).
  const bound = params.map((p) => (Array.isArray(p) ? Uint8Array.from(p) : p));

  const started = performance.now();
  const stmt = db.prepare(sql);
  try {
    if (_isRowReturning(sql)) {
      const jsRows = stmt.all(...bound);
      const changes = db.changes;
      const lastRowId = Number(db.lastInsertRowId);
      const results = jsRows.map((row) => {
        const mapped: Record<string, unknown> = {};
        for (const key of Object.keys(row)) {
          mapped[key] = _encodeD1Cell(row[key]);
        }
        return mapped;
      });
      return {
        success: true,
        results,
        meta: {
          changes,
          last_row_id: lastRowId,
          rows_read: results.length,
          rows_written: changes,
          duration: performance.now() - started,
        },
      };
    }
    // Bare INSERT/UPDATE/DELETE or DDL — no result set; report affected rows.
    stmt.run(...bound);
    const changes = db.changes;
    const lastRowId = Number(db.lastInsertRowId);
    return {
      success: true,
      results: [],
      meta: {
        changes,
        last_row_id: lastRowId,
        rows_read: 0,
        rows_written: changes,
        duration: performance.now() - started,
      },
    };
  } catch (error) {
    // Capture the driver's message NOW, before `finalize()` runs below.
    // @db/sqlite computes the detailed constraint text
    // (`UNIQUE constraint failed: t.id`) from live DB state; `finalize()` on a
    // failed statement both resets that to a generic message AND re-throws the
    // step's result code. Reading it here and re-throwing a plain error carrying
    // the captured string is what keeps the text `sqliteErrorToCode` matches on
    // from being lost or masked.
    const err = error as { code?: unknown; message?: unknown };
    const rawMessage = err.message;
    const message = typeof rawMessage === 'string' ? rawMessage : String(error);
    const rethrow = new Error(message) as Error & { code?: number };
    if (typeof err.code === 'number') rethrow.code = err.code;
    throw rethrow;
  } finally {
    // Finalizing a statement whose step failed can re-surface that step's result
    // code as a throw, which would mask the real error captured above — swallow
    // it. (The meaningful error was already captured/returned.)
    try {
      stmt.finalize?.();
    } catch {
      /* ignore */
    }
  }
}

/**
 * Re-create Cloudflare D1 (workerd `dbErrorMessage()`) error-message decoration.
 *
 * Real D1 appends a `: SQLITE_<PRIMARY> [(extended: SQLITE_<EXT>)]` tail to
 * EVERY SQLite error message before it reaches the `errors[]` envelope — e.g.
 * `UNIQUE constraint failed: t.id: SQLITE_CONSTRAINT (extended:
 * SQLITE_CONSTRAINT_PRIMARYKEY)`. `@db/sqlite` emits only the bare SQLite text
 * and exposes no numeric `code`, so this maps the failure by its message to a
 * plausible primary/extended `SQLITE_*` name and appends the tail, reproducing
 * the exact wire shape the engine's `_wrapDriverError` must strip before it
 * extracts `constraint`/`column`/`table`.
 *
 * The chosen extended name is one plausible value for each failure class (a
 * PRIMARY KEY vs a plain UNIQUE index yields the same message text; both strip
 * and classify identically). Any message this does not recognize gets the bare
 * primary `SQLITE_ERROR` (matching `no such table` / `no such column` /
 * `syntax error`, which real D1 tags `SQLITE_ERROR` with no extended code).
 */
function _decorateWorkerdError(message: string): string {
  const lower = message.toLowerCase();
  let primary = 'SQLITE_ERROR';
  let extended: string | undefined;
  if (lower.includes('unique constraint failed')) {
    primary = 'SQLITE_CONSTRAINT';
    extended = 'SQLITE_CONSTRAINT_PRIMARYKEY';
  } else if (lower.includes('not null constraint failed')) {
    primary = 'SQLITE_CONSTRAINT';
    extended = 'SQLITE_CONSTRAINT_NOTNULL';
  } else if (lower.includes('check constraint failed')) {
    primary = 'SQLITE_CONSTRAINT';
    extended = 'SQLITE_CONSTRAINT_CHECK';
  } else if (lower.includes('foreign key constraint failed')) {
    primary = 'SQLITE_CONSTRAINT';
    extended = 'SQLITE_CONSTRAINT_FOREIGNKEY';
  }
  const tail = extended ? `${primary} (extended: ${extended})` : primary;
  return `${message}: ${tail}`;
}

/**
 * Encode a single SQLite result cell into D1's JSON value shape:
 * - `Uint8Array` (BLOB) → an array of byte numbers (JSON has no binary type)
 * - `bigint` (INTEGER > 2^53−1) → a JSON `number` — D1's lossy int64-over-JSON
 * - everything else (number / string / null) → pass-through
 */
function _encodeD1Cell(value: unknown): unknown {
  if (value instanceof Uint8Array) return Array.from(value);
  if (typeof value === 'bigint') return Number(value);
  return value;
}

/**
 * Whether a statement yields a result set (needs `.all()`), mirroring the native
 * `SQLiteEngine`'s own row-vs-run decision: `SELECT` / `PRAGMA` / `WITH` /
 * `EXPLAIN`, plus any `INSERT`/`UPDATE`/`DELETE ... RETURNING`.
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
 * A non-2xx transport/API-level error whose JSON body is the D1 envelope
 * (`success:false` + `errors:[{ code, message }]`) — the shape the client's
 * top-level (HTTP-status) error path expects.
 */
function _topError(status: number, message: string): Response {
  return _json(status, {
    success: false,
    errors: [{ code: D1_QUERY_ERROR_CODE, message }],
    messages: [],
    result: [],
  });
}
