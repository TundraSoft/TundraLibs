/**
 * @fileoverview `D1HttpClient` — the SQLite-over-HTTP transport for Cloudflare
 * D1's REST query API, built on the {@link RESTler} base client.
 *
 * This is the transport layer only: it places a single SQL statement over HTTP
 * and returns D1's raw result. The `D1Engine` that adapts it to the drivers'
 * engine interface (connection lifecycle, JS↔wire value coding, error
 * translation via the shared SQLite error helpers) is a later step; this client
 * is shaped so that engine can drive it.
 *
 * ## Verified wire protocol (Cloudflare D1 REST — "Query a database")
 *
 * Confirmed against the official Cloudflare D1 REST API reference (operation
 * `d1-query-database`) and the D1 REST docs:
 * - https://developers.cloudflare.com/api/resources/d1/subresources/database/methods/query/
 * - https://developers.cloudflare.com/d1/worker-api/d1-database/
 *
 * A statement is a single request:
 * - `POST https://api.cloudflare.com/client/v4/accounts/{accountId}/d1/database/{databaseId}/query`
 *   with `Content-Type: application/json` and `Authorization: Bearer <apiToken>`.
 * - Request body: `{ "sql": "SELECT * FROM t WHERE id = ?", "params": ["1"] }`
 *   — positional `?` placeholders, `params` a JSON array in order. Args arrive
 *   already encoded — this client never coerces. (D1 also accepts a `batch`
 *   array of `{ sql, params }`; this transport issues one statement per call.)
 * - Endpoint choice: the `/query` endpoint returns each row as an **object**
 *   keyed by column name; the sibling `/raw` endpoint returns
 *   `{ columns, rows: [[…]] }` arrays instead. This client uses `/query` so the
 *   engine receives object rows directly (no column-zipping).
 * - Success (HTTP 2xx) body: `{ "success": true, "errors": [], "messages": [],
 *   "result": [ { "success": true, "results": [ {…row…}, … ], "meta": {
 *   "changes", "last_row_id", "rows_read", "rows_written", "duration",
 *   "changed_db", "served_by_region", "size_after", … } } ] }`. A single
 *   statement uses `result[0]`.
 * - Failure: a non-2xx status, **or** a 2xx envelope with `"success": false`.
 *   Either way the failure rides `errors: [{ "code": N, "message": "…" }]`,
 *   where `code` is Cloudflare's numeric API/D1 code and `message` is
 *   SQLite-style for a query failure (e.g. `UNIQUE constraint failed: t.email`).
 *   Both surface as a {@link D1HttpError} carrying `code` + `message` so the
 *   engine can map the message via the shared `sqliteErrorToCode` /
 *   `parseSqliteErrorMeta` helpers.
 *
 * Only plain HTTPS over native `fetch` is used — RESTler's `tls` / `socketPath`
 * transport options are never set, keeping the client edge/serverless-safe.
 *
 * @module
 */

import { RESTler } from '@tundralibs/restler';
import type { RESTlerOptions } from '@tundralibs/restler';
import { DriverError } from '../../errors/mod.ts';
import { D1HttpError } from './D1HttpError.ts';
import type {
  D1HttpClientOptions,
  D1HttpRequestBody,
  D1HttpResponseBody,
  D1QueryResult,
} from './types/mod.ts';

/** Cloudflare's API base URL; the D1 query path is appended to it. */
const BASE_URL = 'https://api.cloudflare.com/client/v4';

/**
 * Cross-runtime HTTP transport for Cloudflare D1's REST (SQLite-over-HTTP)
 * query API.
 *
 * @example
 * ```typescript
 * const client = new D1HttpClient({
 *   accountId: '<account-id>',
 *   databaseId: '<database-id>',
 *   apiToken: '<api-token>',
 * });
 * const { results, meta } = await client.query<{ n: number }>(
 *   'SELECT ? AS n',
 *   [42],
 * );
 * console.log(results[0]?.n, meta.changes); // 42 0
 * ```
 *
 * @see {@link D1HttpClientOptions} for configuration.
 * @see {@link D1QueryResult} for the shape returned by {@link query}.
 */
export class D1HttpClient extends RESTler {
  /** Vendor identifier, surfaced in RESTler error contexts and events. */
  public readonly vendor = 'd1';

  /** `/accounts/{accountId}/d1/database/{databaseId}/query` request path. */
  private readonly __queryPath: string;

  /**
   * Build a Cloudflare D1 SQLite-over-HTTP client.
   *
   * @param options - Connection target and auth (see
   *   {@link D1HttpClientOptions}).
   * @throws {@link DriverError} If `accountId`, `databaseId`, or `apiToken` is
   *   missing/empty.
   * @throws RESTlerConfigError If the derived `baseURL` is invalid.
   */
  constructor(options: D1HttpClientOptions) {
    if (
      !options || typeof options.accountId !== 'string' ||
      options.accountId === ''
    ) {
      throw new DriverError('D1HttpClient requires a non-empty `accountId`.', {
        vendor: 'd1',
        code: 'MISSING_CONFIG_VALUE',
      });
    }
    if (typeof options.databaseId !== 'string' || options.databaseId === '') {
      throw new DriverError('D1HttpClient requires a non-empty `databaseId`.', {
        vendor: 'd1',
        code: 'MISSING_CONFIG_VALUE',
      });
    }
    if (typeof options.apiToken !== 'string' || options.apiToken === '') {
      throw new DriverError('D1HttpClient requires a non-empty `apiToken`.', {
        vendor: 'd1',
        code: 'MISSING_CONFIG_VALUE',
      });
    }

    const restlerOptions: RESTlerOptions = {
      // `endpoint` (a Cloudflare-compatible gateway / local test proxy)
      // overrides Cloudflare's default API base URL verbatim; the request path
      // stays `/accounts/{accountId}/d1/database/{databaseId}/query`.
      baseURL: options.endpoint ?? BASE_URL,
      // Cloudflare authenticates with a bearer API token. RESTler's built-in
      // BEARER auth injects `Authorization: <prefix> <token>`; pin the prefix
      // to the exact `Bearer` casing Cloudflare documents. The token lives in
      // RESTler's closure-backed options store (never on the enumerable
      // `_defaultHeaders`), and rides the `Authorization` header, which RESTler
      // already redacts from error/event request copies.
      auth: {
        type: 'BEARER',
        token: options.apiToken,
        prefix: 'Bearer',
      },
    };
    if (options.timeout !== undefined) {
      restlerOptions.timeout = options.timeout;
    }
    super(restlerOptions);

    this.__queryPath =
      `/accounts/${options.accountId}/d1/database/${options.databaseId}/query`;
  }

  /**
   * Execute a single parameterized SQL statement over D1's REST query API.
   *
   * POSTs `{ sql, params }` to the account/database `/query` path and returns
   * the first statement's result normalized to `{ results, meta }`. `results`
   * hold the rows as D1 returned them (objects keyed by column name) — the
   * client performs **no** value coercion (that is the engine's job). Bind
   * values are sent as-is, in order, for the `?` placeholders.
   *
   * @typeParam R - Row shape; defaults to `Record<string, unknown>`.
   * @param sql - SQL text with positional (`?`) placeholders.
   * @param params - Positional bind values, in order.
   * @returns The normalized `{ results, meta }` result.
   * @throws {@link D1HttpError} If D1 reports an error (a non-2xx response, or a
   *   2xx envelope with `success: false`); it carries the SQLite-style
   *   `message` and Cloudflare `code` so the engine can translate it into an
   *   `EngineError`.
   * @throws RESTlerTimeoutError / RESTlerRequestError On timeout or a
   *   transport-level failure (surfaced unchanged from RESTler).
   */
  public async query<R = Record<string, unknown>>(
    sql: string,
    params: readonly unknown[] = [],
  ): Promise<D1QueryResult<R>> {
    const payload: D1HttpRequestBody = { sql, params };

    const response = await this._makeRequest<D1HttpResponseBody<R>>({
      path: this.__queryPath,
      method: 'POST',
      payload,
    });

    const status = response.status ?? 0;
    const body = response.body;

    // A non-2xx reply is a transport/API-level failure; its JSON body is the
    // standard Cloudflare envelope (`errors: [{ code, message }]`), else an
    // opaque gateway/text body.
    if (status < 200 || status >= 300) {
      throw this.__toError(body, status);
    }

    if (!body || typeof body !== 'object') {
      throw new D1HttpError(
        `Cloudflare D1 returned HTTP ${status} without a query-result body.`,
        { status, detail: typeof body === 'string' ? body : undefined },
      );
    }

    // A 2xx envelope can still report a query-level (SQLite) failure via
    // `success: false` and the `errors` array — no HTTP status is attached to
    // that error, mirroring how a statement error is distinguished from a
    // transport error.
    if (body.success === false) {
      throw this.__toError(body);
    }

    // Single-statement query: the statement's result is `result[0]`.
    const first = body.result?.[0];
    if (!first) {
      throw new D1HttpError(
        'Cloudflare D1 response contained no result for the statement.',
        { status },
      );
    }

    const meta = first.meta ?? {};
    return {
      results: first.results ?? [],
      meta: {
        changes: meta.changes ?? 0,
        lastRowId: meta.last_row_id ?? null,
        rowsRead: meta.rows_read,
        rowsWritten: meta.rows_written,
        duration: meta.duration,
      },
    };
  }

  /**
   * Turn a D1 failure into a {@link D1HttpError}. A recognizable Cloudflare
   * envelope (`errors: [{ code, message }]`) becomes an error carrying its
   * first entry's `message`/`code`; anything else (gateway HTML, plain text)
   * becomes a generic HTTP-status error with the raw body kept as `detail`.
   *
   * @param body - The parsed response body.
   * @param status - HTTP status, when the failure was a non-2xx reply; omitted
   *   for a query-level (`success: false`) failure inside a 2xx envelope.
   */
  private __toError(body: unknown, status?: number): D1HttpError {
    if (
      body !== null && typeof body === 'object' && 'errors' in body &&
      Array.isArray((body as D1HttpResponseBody).errors)
    ) {
      const first = (body as D1HttpResponseBody).errors[0];
      if (first && typeof first.message === 'string') {
        return new D1HttpError(first.message, { status, code: first.code });
      }
    }
    return new D1HttpError(
      `Cloudflare D1 request failed${
        status !== undefined ? ` with HTTP ${status}` : ''
      }.`,
      { status, detail: typeof body === 'string' ? body : undefined },
    );
  }
}
