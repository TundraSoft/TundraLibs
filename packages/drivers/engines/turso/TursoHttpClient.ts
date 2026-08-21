/**
 * @fileoverview `TursoHttpClient` — the Hrana-over-HTTP transport for Turso /
 * libSQL (SQLite over HTTP), built on the {@link RESTler} base client.
 *
 * This is the transport layer only: it places a single SQL statement over HTTP
 * and returns libSQL's raw result. The `TursoEngine` that adapts it to the
 * drivers' engine interface (connection lifecycle, JS↔wire value coding, error
 * translation) is a later step; this client is shaped so that engine can drive
 * it.
 *
 * ## Verified wire protocol (Hrana v3 over HTTP)
 *
 * Confirmed against the official Hrana v3 spec and the reference client
 * transport source (the wire types quoted in the `types/` files cite the same
 * spec):
 * - https://github.com/tursodatabase/libsql/blob/main/docs/HRANA_3_SPEC.md
 *   (the "Hrana over HTTP" section; JSON encoding uses the `v3/pipeline`
 *   endpoint — the current stable path, vs. legacy `v2/pipeline`).
 * - https://github.com/tursodatabase/hrana-client-ts/blob/main/src/http/stream.ts
 *   (request built as `POST <baseURL>/v3/pipeline`, `content-type:
 *   application/json`, `authorization: Bearer <jwt>`; body
 *   `{ baton, requests }`).
 * - https://github.com/tursodatabase/libsql-client-ts/blob/main/packages/libsql-core/src/config.ts
 *   (`libsql:` maps to `https:` for the HTTP transport when TLS is on).
 *
 * A statement is one pipeline round-trip:
 * - `POST https://<host>/v3/pipeline` with `Content-Type: application/json`
 *   and `Authorization: Bearer <authToken>`.
 * - Request body: `{ "baton": null, "requests": [ { "type": "execute",
 *   "stmt": { "sql", "args": [<Value>…], "named_args": [{ "name", "value" }…] }
 *   }, { "type": "close" } ] }`. The trailing `close` frees the implicit
 *   server-side stream in the same round-trip.
 * - `Value` variants: `{ "type": "null" }` | `{ "type": "integer", "value":
 *   "<int64-as-string>" }` | `{ "type": "float", "value": <number> }` |
 *   `{ "type": "text", "value": "<string>" }` | `{ "type": "blob", "base64":
 *   "<base64>" }`. Args arrive already encoded — this client never coerces.
 * - Success (HTTP 2xx) body: `{ "baton", "base_url", "results": [ { "type":
 *   "ok", "response": { "type": "execute", "result": { "cols", "rows",
 *   "affected_row_count", "last_insert_rowid", … } } }, { "type": "ok",
 *   "response": { "type": "close" } } ] }`.
 * - A failed statement is `{ "type": "error", "error": { "message", "code" } }`
 *   **inside** `results` while the HTTP status stays `200`; a failed pipeline
 *   is a non-2xx response whose JSON body is a bare `{ "message", "code" }`.
 *   Both surface as a {@link TursoHttpError}.
 *
 * Only plain HTTPS over native `fetch` is used — RESTler's `tls` / `socketPath`
 * transport options are never set, keeping the client edge/serverless-safe.
 *
 * @module
 */

import { RESTler, type RESTlerOptions } from '@tundralibs/restler';
import { DriverError } from '../../errors/mod.ts';
import { TursoHttpError } from './TursoHttpError.ts';
import type {
  HranaError,
  HranaExecuteResult,
  HranaNamedArg,
  HranaStmt,
  HranaValue,
  TursoHttpClientOptions,
  TursoPipelineRequest,
  TursoPipelineResponse,
} from './types/mod.ts';

/** The Hrana v3 JSON pipeline endpoint path (current stable; not `v2`). */
const PIPELINE_PATH = '/v3/pipeline';

/**
 * Derive the `https://` (or `http://`) base **origin** to dial from a Turso /
 * libSQL `url` or host.
 *
 * - A `libsql://…` (or `libsqls://…`) URL has its scheme mapped to `https:`
 *   — the reference client maps `libsql:` to `https:` for the HTTP transport.
 * - A `wss://…` URL maps to `https://…`, and `ws://…` to `http://…` — `ws(s)`
 *   are legitimate libSQL schemes whose HTTP-transport equivalents are
 *   `http(s)`.
 * - An `http(s)://…` URL is used as-is (`http` supports a local `sqld`).
 * - A bare host (no scheme at all) is assumed `https://`.
 * - Any other, unrecognized scheme (`ftp://`, `file://`, …) is a
 *   misconfiguration and is rejected — rather than being blindly prefixed with
 *   `https://` (which turned `wss://host` into `https://wss://host`, an origin
 *   of the bogus single-label host `wss`).
 *
 * Only the origin (`scheme://host[:port]`) is kept; any path/query/hash is
 * dropped, so a token accidentally embedded in the URL never rides along and
 * the pipeline path is appended to a clean base.
 *
 * @param url - The configured URL or host.
 * @returns The base origin to use as RESTler's `baseURL`.
 * @throws {@link DriverError} If `url` carries an unsupported scheme or cannot
 *   be parsed into an origin.
 */
const deriveBaseURL = (url: string): string => {
  let candidate = url.trim();
  if (/^libsqls?:\/\//i.test(candidate)) {
    candidate = 'https://' + candidate.replace(/^libsqls?:\/\//i, '');
  } else if (/^wss:\/\//i.test(candidate)) {
    candidate = 'https://' + candidate.replace(/^wss:\/\//i, '');
  } else if (/^ws:\/\//i.test(candidate)) {
    candidate = 'http://' + candidate.replace(/^ws:\/\//i, '');
  } else if (!/^https?:\/\//i.test(candidate)) {
    // Not already an `http(s)://` URL. A URL bearing some OTHER scheme
    // (`ftp://`, `file://`, a typo'd `htttp://`, …) is a misconfiguration —
    // reject it rather than mangle it into a bogus origin. Only a bare host,
    // with no scheme at all, is assumed `https://`.
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(candidate)) {
      throw new DriverError(
        `TursoHttpClient received a \`url\` with an unsupported scheme.`,
        { vendor: 'turso', code: 'INVALID_CONFIG_VALUE', value: url },
      );
    }
    candidate = 'https://' + candidate;
  }
  try {
    return new URL(candidate).origin;
  } catch {
    throw new DriverError(
      `TursoHttpClient could not derive an https base URL from \`url\`.`,
      { vendor: 'turso', code: 'INVALID_CONFIG_VALUE', value: url },
    );
  }
};

/**
 * Cross-runtime HTTP transport for Turso / libSQL's Hrana v3 query API.
 *
 * @example
 * ```typescript
 * const client = new TursoHttpClient({
 *   url: 'libsql://my-db-my-org.turso.io',
 *   authToken: '<jwt>',
 * });
 * const result = await client.execute(
 *   'SELECT ? AS n',
 *   [{ type: 'integer', value: '42' }],
 * );
 * // result.rows[0][0] === { type: 'integer', value: '42' } (raw HranaValue —
 * // decoding to a JS value is the engine's job)
 * ```
 *
 * @see {@link TursoHttpClientOptions} for configuration.
 * @see {@link HranaExecuteResult} for the shape returned by {@link execute}.
 */
export class TursoHttpClient extends RESTler {
  /** Vendor identifier, surfaced in RESTler error contexts and events. */
  public readonly vendor = 'turso';

  /**
   * Build a Turso / libSQL Hrana-over-HTTP client.
   *
   * @param options - Connection target and auth (see
   *   {@link TursoHttpClientOptions}).
   * @throws {@link DriverError} If `url` is missing/empty or cannot be parsed.
   * @throws RESTlerConfigError If the derived `baseURL` is invalid.
   */
  constructor(options: TursoHttpClientOptions) {
    if (!options || typeof options.url !== 'string' || options.url === '') {
      throw new DriverError('TursoHttpClient requires a non-empty `url`.', {
        vendor: 'turso',
        code: 'MISSING_CONFIG_VALUE',
      });
    }

    const restlerOptions: RESTlerOptions = {
      baseURL: deriveBaseURL(options.url),
    };
    if (options.timeout !== undefined) {
      restlerOptions.timeout = options.timeout;
    }
    // Turso authenticates with a bearer JWT. RESTler's built-in BEARER auth
    // injects `Authorization: <prefix> <token>`; pin the prefix to the exact
    // `Bearer` casing libSQL uses. An empty token means "no auth" (a local
    // `sqld`), so leave the header off rather than send `Bearer ` — and avoid
    // RESTler's non-empty-token validation.
    if (typeof options.authToken === 'string' && options.authToken !== '') {
      restlerOptions.auth = {
        type: 'BEARER',
        token: options.authToken,
        prefix: 'Bearer',
      };
    }
    super(restlerOptions);
  }

  /**
   * Execute a single SQL statement over the Hrana v3 pipeline endpoint.
   *
   * POSTs an `[execute, close]` pipeline to `/v3/pipeline`, then extracts the
   * first (`execute`) result and returns it normalized. `rows` hold raw
   * {@link HranaValue} cells — the client performs **no** value coercion (that
   * is the engine's job). Bind values must already be encoded as
   * {@link HranaValue}s.
   *
   * @param sql - SQL text with `?` / `:name` (etc.) placeholders.
   * @param args - Positional bind values, already encoded as `HranaValue`s.
   * @param namedArgs - Named bind values, already encoded.
   * @returns The normalized `{ cols, rows, affectedRowCount, lastInsertRowid }`.
   * @throws {@link TursoHttpError} If libSQL reports a statement error (a
   *   `200` with an `error` result) or a pipeline error (a non-2xx body); it
   *   carries the SQLite `message`/`code` so the engine can translate it into
   *   an `EngineError`.
   * @throws RESTlerTimeoutError / RESTlerRequestError On timeout or a
   *   transport-level failure (surfaced unchanged from RESTler).
   */
  public async execute(
    sql: string,
    args: readonly HranaValue[] = [],
    namedArgs: readonly HranaNamedArg[] = [],
  ): Promise<HranaExecuteResult> {
    const stmt: HranaStmt = { sql, args, named_args: namedArgs };
    const payload: TursoPipelineRequest = {
      baton: null,
      requests: [
        { type: 'execute', stmt },
        { type: 'close' },
      ],
    };

    const response = await this._makeRequest<TursoPipelineResponse>({
      path: PIPELINE_PATH,
      method: 'POST',
      payload,
    });

    const status = response.status ?? 0;
    const body = response.body;

    // A non-2xx reply is a pipeline-level failure: its JSON body is a bare
    // Hrana error `{ message, code }` (else an opaque gateway/text body).
    if (status < 200 || status >= 300) {
      throw this.__toTopLevelError(status, body);
    }

    if (
      !body || typeof body !== 'object' || !Array.isArray(body.results)
    ) {
      throw new TursoHttpError(
        `Turso returned HTTP ${status} without a pipeline-result body.`,
        { status, detail: typeof body === 'string' ? body : undefined },
      );
    }

    // The `execute` request is first, so its result is `results[0]`.
    const first = body.results[0];
    if (!first) {
      throw new TursoHttpError(
        'Turso pipeline response contained no result for the statement.',
        { status },
      );
    }
    if (first.type === 'error') {
      throw this.__toStatementError(first.error);
    }

    const stmtResponse = first.response;
    if (!stmtResponse || stmtResponse.type !== 'execute') {
      throw new TursoHttpError(
        `Turso pipeline returned an unexpected '${
          stmtResponse?.type ?? 'unknown'
        }' response for the statement.`,
        { status },
      );
    }

    const result = stmtResponse.result;
    return {
      cols: result.cols ?? [],
      rows: result.rows ?? [],
      affectedRowCount: result.affected_row_count ?? 0,
      lastInsertRowid: result.last_insert_rowid ?? null,
    };
  }

  /**
   * Turn a per-statement `{ type: 'error' }` result into a
   * {@link TursoHttpError} carrying its SQLite `code`/`message`.
   */
  private __toStatementError(error: HranaError): TursoHttpError {
    return new TursoHttpError(error.message, {
      code: error.code ?? undefined,
    });
  }

  /**
   * Turn a non-2xx response into a {@link TursoHttpError}. A bare Hrana error
   * JSON becomes an error carrying its `message`/`code`; anything else (gateway
   * HTML, plain text) becomes a generic HTTP-status error with the raw body
   * kept as `detail`.
   */
  private __toTopLevelError(status: number, body: unknown): TursoHttpError {
    if (
      body !== null && typeof body === 'object' && 'message' in body &&
      typeof (body as HranaError).message === 'string'
    ) {
      const err = body as HranaError;
      return new TursoHttpError(err.message, {
        status,
        code: err.code ?? undefined,
      });
    }
    return new TursoHttpError(
      `Turso pipeline request failed with HTTP ${status}.`,
      { status, detail: typeof body === 'string' ? body : undefined },
    );
  }
}
