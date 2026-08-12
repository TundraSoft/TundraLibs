/**
 * @fileoverview `NeonHttpClient` — the SQL-over-HTTP transport for Neon
 * (serverless Postgres), built on the {@link RESTler} base client.
 *
 * This is the transport layer only: it places a single query over HTTP and
 * returns Neon's raw response. The `NeonHttpEngine` that adapts it to the
 * drivers' engine interface (connection lifecycle, value decoding, error
 * translation) is a later step (PR4); this client is shaped so that engine
 * can drive it.
 *
 * ## Verified wire protocol
 *
 * Confirmed against the Neon serverless driver source and config docs
 * (the marketing docs only link to these):
 * - https://github.com/neondatabase/serverless/blob/main/src/httpQuery.ts
 * - https://github.com/neondatabase/serverless/blob/main/CONFIG.md
 *   (`fetchEndpoint` default: `host => 'https://' + host + '/sql'`)
 *
 * A query is a single request:
 * - `POST https://<host>/sql` with `Content-Type: application/json`.
 * - Request body: `{ "query": "SELECT $1::int AS n", "params": ["42"] }` —
 *   positional `$N` placeholders, `params` a JSON array in order.
 * - Authentication (one or both):
 *   - `Neon-Connection-String: postgresql://user:password@host/db` — the
 *     primary/documented mechanism; the password in the string authenticates.
 *   - `Authorization: Bearer <jwt>` — optional, for Neon Authorize / RLS.
 * - Response shaping headers this client sets:
 *   - `Neon-Raw-Text-Output: true` — values come back as raw Postgres text so
 *     coercion stays the engine's job (PR4 reuses the Postgres `decodeValue`
 *     path, which parses from text). This client never coerces.
 *   - `Neon-Array-Mode` is **not** set, so `rows` are objects keyed by column
 *     name (no zipping against `fields` needed).
 * - Success (HTTP 2xx) body: `{ command, rowCount, rows, fields:[{ name,
 *   dataTypeID, … }] }` (see {@link NeonHttpSuccessBody}).
 * - Error (non-2xx, typically 400) body: a Postgres error JSON
 *   `{ message, code, severity, detail, … }` (see {@link NeonPostgresError}).
 *
 * Only plain HTTPS over native `fetch` is used — RESTler's `tls` / `socketPath`
 * transport options are never set, keeping the client edge/serverless-safe.
 *
 * @module
 */

import { RESTler } from '@tundralibs/restler';
import type { RESTlerEndpoint, RESTlerOptions } from '@tundralibs/restler';
import { DriverError } from '../../errors/mod.ts';
import { NeonHttpError } from './NeonHttpError.ts';
import type {
  NeonHttpClientOptions,
  NeonHttpSuccessBody,
  NeonPostgresError,
  NeonQueryResult,
} from './types/mod.ts';

/**
 * Assemble a `postgresql://` connection string from discrete components, or
 * return `undefined` when the required parts (`username`, `password`,
 * `database`) are not all present. Userinfo and database name are
 * percent-encoded so credentials with URL-significant characters survive.
 */
const buildConnectionString = (
  options: NeonHttpClientOptions,
): string | undefined => {
  const { username, password, database, host } = options;
  if (!username || password === undefined || !database) return undefined;
  const user = encodeURIComponent(username);
  const pass = encodeURIComponent(password);
  const db = encodeURIComponent(database);
  return `postgresql://${user}:${pass}@${host}/${db}`;
};

/**
 * RESTler options plus Neon's connection string.
 *
 * The connection string carries the database password (it is the primary auth
 * mechanism), so it is held here in RESTler's closure-backed options store —
 * exactly where the bearer token lives — rather than on the enumerable
 * `_defaultHeaders`. That keeps the plaintext credential out of
 * `JSON.stringify` / `Deno.inspect` of the client (or an engine that holds it);
 * it is injected as the `Neon-Connection-String` header per-request by
 * {@link NeonHttpClient._authInjector} instead.
 */
type NeonRESTlerOptions = RESTlerOptions & { connectionString?: string };

/**
 * Cross-runtime HTTP transport for Neon's SQL-over-HTTP query API.
 *
 * @example
 * ```typescript
 * const client = new NeonHttpClient({
 *   host: 'ep-cool-name-a1b2c3.us-east-2.aws.neon.tech',
 *   connectionString: 'postgresql://user:pass@ep-cool-name-a1b2c3…/neondb',
 * });
 * const { rows } = await client.sql<{ n: string }>(
 *   'SELECT $1::int AS n',
 *   [42],
 * );
 * console.log(rows[0]?.n); // '42' (raw text — coercion is the engine's job)
 * ```
 *
 * @see {@link NeonHttpClientOptions} for configuration.
 * @see {@link NeonQueryResult} for the shape returned by {@link sql}.
 */
export class NeonHttpClient extends RESTler<NeonRESTlerOptions> {
  /** Vendor identifier, surfaced in RESTler error contexts and events. */
  public readonly vendor = 'neon';

  /**
   * Build a Neon SQL-over-HTTP client.
   *
   * @param options - Connection target and auth (see
   *   {@link NeonHttpClientOptions}).
   * @throws {@link DriverError} If `host` is missing, or if no authentication
   *   (connection string, its components, or a bearer token) is supplied.
   * @throws RESTlerConfigError If the derived `baseURL` is invalid.
   */
  constructor(options: NeonHttpClientOptions) {
    if (!options || typeof options.host !== 'string' || options.host === '') {
      throw new DriverError('NeonHttpClient requires a non-empty `host`.', {
        vendor: 'neon',
        code: 'MISSING_CONFIG_VALUE',
      });
    }
    const connectionString = options.connectionString ??
      buildConnectionString(options);
    if (!connectionString && !options.token) {
      throw new DriverError(
        'NeonHttpClient requires a `connectionString` (or ' +
          '`username`/`password`/`database`) or a bearer `token`.',
        { vendor: 'neon', code: 'MISSING_CONFIG_VALUE' },
      );
    }

    const restlerOptions: NeonRESTlerOptions = {
      // `endpoint` (a Neon-compatible gateway / local test proxy) overrides the
      // default `https://<host>` base URL verbatim; the request path stays
      // `/sql`. `host` is still used for the `Neon-Connection-String` header.
      baseURL: options.endpoint ?? `https://${options.host}`,
    };
    if (options.timeout !== undefined) {
      restlerOptions.timeout = options.timeout;
    }
    // Neon accepts a bearer JWT (Neon Authorize / RLS) in addition to — or
    // instead of — the connection-string header. RESTler's built-in BEARER
    // auth injects `Authorization: <prefix> <token>`; pin the prefix to the
    // exact `Bearer` casing Neon documents.
    if (options.token !== undefined) {
      restlerOptions.auth = {
        type: 'BEARER',
        token: options.token,
        prefix: 'Bearer',
      };
    }
    // The connection string carries the DB password (it is the primary auth
    // mechanism). Hold it in RESTler's closure-backed options store — like the
    // bearer token above — NOT on the enumerable `_defaultHeaders`; otherwise
    // the plaintext credential would surface in `JSON.stringify` /
    // `Deno.inspect` of the client (and of any engine that holds it). It is
    // injected as the `Neon-Connection-String` header per-request in
    // `_authInjector`.
    if (connectionString) {
      restlerOptions.connectionString = connectionString;
    }
    super(restlerOptions);

    // Request raw Postgres text so value coercion stays the engine's job.
    this._defaultHeaders['Neon-Raw-Text-Output'] = 'true';
  }

  /**
   * Inject Neon's auth headers onto the per-request endpoint copy.
   *
   * Chaining to `super` first lets RESTler add the optional bearer
   * `Authorization` header (from the `auth` option). The
   * `Neon-Connection-String` header — the primary auth mechanism, whose
   * password authenticates the request — is then read from the closure-backed
   * options store and set here, per-request, rather than parked on the
   * enumerable `_defaultHeaders`. This is what keeps the plaintext credential
   * out of `JSON.stringify` / `Deno.inspect` of the client while still sending
   * it on the wire. It rides `endpoint.headers` (a fresh per-request copy made
   * by `_processEndpoint`), so nothing accumulates across calls, and
   * {@link _isSensitiveHeader} still redacts it from the request copy handed to
   * errors and the `call` event.
   *
   * @param endpoint - Per-request endpoint copy to mutate with auth headers.
   */
  protected override async _authInjector(
    endpoint: RESTlerEndpoint,
  ): Promise<void> {
    await super._authInjector(endpoint);
    const connectionString = this._getOption('connectionString');
    if (connectionString) {
      endpoint.headers = endpoint.headers || {};
      endpoint.headers['Neon-Connection-String'] = connectionString;
    }
  }

  /**
   * Treat Neon's `Neon-Connection-String` header as sensitive in addition to
   * RESTler's built-in credential headers.
   *
   * The connection-string header carries the database password (it is the
   * primary auth mechanism), so without this override its value would surface
   * unredacted in a `RESTlerRequestError`'s `context.request.headers` and in
   * the request copy handed to the `call` event — both of which consumers
   * commonly serialise to logs. Chaining to `super` keeps `Authorization`
   * (the optional bearer JWT) and the other base credential headers redacted.
   *
   * @param name - The header name (as it appears on the request).
   * @returns `true` if the header's value should be redacted.
   */
  protected override _isSensitiveHeader(name: string): boolean {
    return name.toLowerCase() === 'neon-connection-string' ||
      super._isSensitiveHeader(name);
  }

  /**
   * Execute a single parameterized SQL statement over HTTP.
   *
   * POSTs `{ query, params }` to `/sql` and returns Neon's result verbatim —
   * `rows` hold raw Postgres text values (no coercion), and `fields` carry the
   * `dataTypeID` the engine needs to decode them. `params` are sent as-is, in
   * order, for the `$1`, `$2`, … placeholders.
   *
   * @typeParam R - Row shape; defaults to `Record<string, unknown>`.
   * @param query - SQL text with positional (`$1`, `$2`, …) placeholders.
   * @param params - Positional bind values, in order.
   * @returns The typed `{ rows, fields, rowCount, command }` result.
   * @throws {@link NeonHttpError} If Neon returns a non-2xx response; it
   *   carries the Postgres `message`/`code` (and full error object) so PR4 can
   *   translate it into an `EngineError`.
   * @throws RESTlerTimeoutError / RESTlerRequestError On timeout or a
   *   transport-level failure (surfaced unchanged from RESTler).
   */
  public async sql<R = Record<string, unknown>>(
    query: string,
    params: readonly unknown[] = [],
  ): Promise<NeonQueryResult<R>> {
    const response = await this._makeRequest<NeonHttpSuccessBody<R>>({
      path: '/sql',
      method: 'POST',
      payload: { query, params },
    });

    const status = response.status ?? 0;
    if (status < 200 || status >= 300) {
      throw this.__toError(status, response.body);
    }

    const body = response.body;
    if (!body || typeof body !== 'object') {
      // A 2xx with no/unparseable JSON body — Neon should never do this, but
      // fail loudly rather than return a malformed result.
      throw new NeonHttpError(
        `Neon returned HTTP ${status} without a query-result body.`,
        { status, detail: typeof body === 'string' ? body : undefined },
      );
    }
    return {
      rows: body.rows ?? [],
      fields: body.fields ?? [],
      rowCount: body.rowCount ?? 0,
      command: body.command ?? '',
    };
  }

  /**
   * Turn a non-2xx Neon response into a {@link NeonHttpError}. A Postgres
   * error JSON becomes an error carrying its `message`/`code`/full object;
   * anything else (gateway HTML, plain text) becomes a generic HTTP-status
   * error with the raw body kept as `detail`.
   */
  private __toError(status: number, body: unknown): NeonHttpError {
    if (
      body !== null && typeof body === 'object' && 'message' in body &&
      typeof (body as NeonPostgresError).message === 'string'
    ) {
      const pg = body as NeonPostgresError;
      return new NeonHttpError(pg.message, {
        status,
        code: pg.code,
        fields: pg,
      });
    }
    return new NeonHttpError(`Neon SQL request failed with HTTP ${status}.`, {
      status,
      detail: typeof body === 'string' ? body : undefined,
    });
  }
}
