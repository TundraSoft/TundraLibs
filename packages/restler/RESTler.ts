import { parse as XMLParse, stringify as XMLStringify } from '$xml';
import { EventOptionKeys, Options } from '@tundralibs/utils/Options';
// Narrow subpath imports (not the `@tundralibs/compat` barrel): the barrel's
// module graph statically pulls in the TCP/UDP wire stack (`net.ts`/`udp.ts` →
// `node:net`/`node:tls`/`node:dgram`) and the web server, none of which RESTler
// needs. Every symbol below lives in a net-free module, so importing them
// directly keeps RESTler — and edge/serverless clients built on it, such as the
// Neon HTTP driver — from pulling that stack in through RESTler.
import { fetch } from '@tundralibs/compat/fetch';
import { statSync } from '@tundralibs/compat/file';
import { STATUS_TEXT, type StatusCode } from '@tundralibs/compat/http';
import { type TLSOptions, validateTLS } from '@tundralibs/compat/common';
import * as path from '@tundralibs/compat/path';
import type {
  ResponseBody,
  RESTlerContentType,
  RESTlerEndpoint,
  RESTlerEvents,
  RESTlerOptions,
  RESTlerRequest,
  RESTlerRequestOptions,
  RESTlerResponse,
  RESTlerResponseHandler,
} from './types/mod.ts';
import {
  RESTlerConfigError,
  RESTlerError,
  RESTlerRequestError,
  RESTlerResponseValidationError,
  RESTlerTimeoutError,
} from './errors/mod.ts';

const MAX_TIMEOUT_VALUE = 120;

/**
 * Request header names whose values are credentials and must be redacted
 * before a request is placed into an error's `context` or an emitted event
 * (both of which are commonly serialised to logs by consumers).
 *
 * Covers the standard credential headers plus the common non-standard token
 * headers a `CUSTOM`-auth {@link RESTler._authInjector} override typically
 * sets (`X-Auth-Token`, `PRIVATE-TOKEN`, `X-Amz-Security-Token`).
 *
 * This is the default set tested by {@link RESTler._isSensitiveHeader}; a
 * subclass that authenticates with a vendor-specific header (e.g. a driver
 * that puts a connection string in its own header) extends the set by
 * overriding that method rather than editing this constant.
 */
const SENSITIVE_HEADER =
  /^(authorization|cookie|proxy-authorization|x-api-key|x-auth-token|private-token|x-amz-security-token)$/i;

/**
 * Abstract base for REST API clients, extended once per API vendor
 *
 * A subclass sets the abstract {@link vendor} field and exposes methods that
 * call the protected {@link _makeRequest} to perform requests. Requests run
 * over compat's runtime-aware `fetch`, so the same client works on Deno, Bun,
 * and Node.
 *
 * @example
 * ```typescript
 * class GitHub extends RESTler {
 *   public readonly vendor = 'github';
 *
 *   constructor() {
 *     super({ baseURL: 'https://api.github.com' });
 *   }
 *
 *   user(login: string) {
 *     return this._makeRequest<{ id: number }>({
 *       path: `/users/${login}`,
 *       method: 'GET',
 *     });
 *   }
 * }
 *
 * const res = await new GitHub().user('octocat');
 * console.log(res.body?.id);
 * ```
 *
 * @typeParam O - The options bag the subclass accepts. Extend
 *   {@link RESTlerOptions} to add vendor-specific options; they then type the
 *   constructor argument and `_getOption`.
 *
 * @see {@link RESTlerOptions} for configuration options
 * @see {@link RESTlerEndpoint} for the per-request endpoint shape
 */
export abstract class RESTler<O extends RESTlerOptions = RESTlerOptions>
  extends Options<O, RESTlerEvents> {
  /**
   * Vendor identifier for the API client implementation.
   * Used in error messages and logging to identify the API provider.
   */
  public abstract readonly vendor: string;

  /** Default headers to include with every request */
  protected _defaultHeaders: Record<string, string> = {};

  /**
   * The `fetch` implementation used for requests — compat's runtime-aware
   * `fetch` by default. Exposed as a seam so tests can substitute a stub
   * without reassigning the global `fetch` (which compat captures at import).
   */
  protected _fetch: typeof globalThis.fetch = fetch;

  /**
   * Vendor-wide default response handler, applied to every request unless
   * `options.responseHandler` is passed to {@link _makeRequest} (which
   * takes precedence entirely — it does not compose with this default).
   * Use it when the vendor has one response convention (e.g. errors inside
   * a 200 envelope) that every endpoint shares. Must RETURN the value the
   * request resolves to (see {@link RESTlerResponseHandler}) — return
   * `response.body` unchanged if nothing needs transforming.
   */
  protected _responseHandler?: RESTlerResponseHandler;

  /**
   * HTTP status codes that should be treated as authentication errors
   */
  protected _authStatus: StatusCode[] = [
    401,
    403,
    407,
  ];

  /**
   * HTTP status codes that indicate rate limiting
   */
  protected _rateLimitStatus: StatusCode[] = [
    429,
  ];

  /**
   * Per-listener isolation wrappers, keyed by the consumer's original
   * callback.
   *
   * A throwing or rejecting listener must neither corrupt a request's outcome
   * nor disable the listeners registered after it, and an `async` listener's
   * rejection must never escape as an unhandled rejection that terminates the
   * process. {@link Options.emit} provides none of that: it runs listeners in a
   * bare loop (a synchronous throw aborts it, skipping every later listener)
   * and does not await their results (a rejected promise escapes). So each
   * listener is wrapped once, at registration, by {@link __isolate}; the map
   * lets {@link off} translate a consumer's original listener back to the
   * wrapper that was actually registered.
   */
  private readonly __isoListeners = new WeakMap<
    (...args: unknown[]) => unknown,
    (...args: unknown[]) => unknown
  >();

  /**
   * Creates a new RESTler instance.
   *
   * Every supplied option is validated (see {@link _processOption}); the
   * required `baseURL` is additionally enforced here, so an omitted `baseURL`
   * fails fast at construction rather than as a raw `TypeError` at the first
   * request.
   *
   * @param options - Configuration options for the REST client
   * @param defaults - Default options to apply if not specified in options
   *
   * @throws {@link RESTlerConfigError} If any option is invalid, or if the
   *   required `baseURL` is missing.
   */

  constructor(
    options: EventOptionKeys<O, RESTlerEvents>,
    defaults?: Partial<O>,
  ) {
    super();
    super._setOptions(options, {
      timeout: 30,
      contentType: 'JSON',
      ...defaults,
    } as Partial<O>);
    // `baseURL` is required, but `_setOptions` only routes keys that are
    // *present* through validation — an absent `baseURL` (e.g. a plain-JS
    // caller or config loaded from JSON/env with the key missing) would slip
    // through construction and surface as a raw `TypeError` at the first
    // request. Enforce it here so the documented "validated in the
    // constructor, throws RESTlerConfigError" contract holds.
    if (!this.hasOption('baseURL')) {
      throw new RESTlerConfigError(
        `Base URL must be a valid URL.`,
        // `vendor` is an abstract field whose subclass initializer has not yet
        // run during `super(...)`, so it is read (and resolves) the same way
        // as in the option validators that already run at construction time.
        {
          vendor: (this as { vendor: string }).vendor,
          key: 'baseURL',
          value: undefined,
        },
      );
    }
    this._defaultHeaders = this._getOption('headers') || {};
  }

  //#region Event registration (per-listener isolation)

  /**
   * Register `callback` for `event`, wrapped so its exceptions are isolated
   * (see {@link __isolate} / {@link __runIsolated}).
   *
   * Mirrors {@link Options.on} — accepts a single listener or an array, and
   * de-duplicates repeat registrations — but a non-function listener is
   * dropped rather than registered: a non-callable entry would make the base
   * `emit` throw on it, skipping every later listener. (A constructor
   * `_on<Event>` option left unset arrives here as `undefined`.)
   *
   * @param event - The event to subscribe to.
   * @param callback - The listener, or an array of listeners.
   */
  override on<K extends keyof RESTlerEvents>(
    event: K,
    callback: RESTlerEvents[K],
  ): this;
  /**
   * Array form: each entry is registered — and isolation-wrapped —
   * independently, so one faulty listener does not affect its siblings.
   *
   * @param event - The event to subscribe to.
   * @param callback - The listeners to register. Non-function entries are
   *   dropped rather than registered.
   */
  override on<K extends keyof RESTlerEvents>(
    event: K,
    callback: RESTlerEvents[K][],
  ): this;
  override on<K extends keyof RESTlerEvents>(
    event: K,
    callback: RESTlerEvents[K] | RESTlerEvents[K][],
  ): this {
    if (Array.isArray(callback)) {
      for (const cb of callback) this.on(event, cb);
      return this;
    }
    if (typeof callback !== 'function') return this;
    super.on(event, this.__isolate(callback) as unknown as RESTlerEvents[K]);
    return this;
  }

  /**
   * Register a one-shot listener for `event`.
   *
   * The base one-shot closure is registered through this class's {@link on}
   * (so it is isolation-wrapped) and removes itself through this class's
   * {@link off} (which resolves it back to that wrapper), so `once` inherits
   * the same isolation as {@link on}.
   *
   * @param event - The event to subscribe to.
   * @param callback - The listener, or an array of listeners.
   */
  override once<K extends keyof RESTlerEvents>(
    event: K,
    callback: RESTlerEvents[K],
  ): this;
  /**
   * Array form: each entry fires at most once, independently of the others.
   *
   * @param event - The event to subscribe to.
   * @param callback - The listeners to register. Non-function entries are
   *   dropped rather than registered.
   */
  override once<K extends keyof RESTlerEvents>(
    event: K,
    callback: RESTlerEvents[K][],
  ): this;
  override once<K extends keyof RESTlerEvents>(
    event: K,
    callback: RESTlerEvents[K] | RESTlerEvents[K][],
  ): this {
    if (Array.isArray(callback)) {
      for (const cb of callback) this.once(event, cb);
      return this;
    }
    if (typeof callback !== 'function') return this;
    super.once(event, callback as RESTlerEvents[K]);
    return this;
  }

  /**
   * Remove `callback` from `event` (or every listener for `event` when
   * `callback` is omitted).
   *
   * Translates the consumer's original listener back to the isolation wrapper
   * that {@link on} actually registered, so an `off` with the original
   * function still removes the listener.
   *
   * @param event - The event to unsubscribe from.
   * @param callback - The listener, or an array of listeners, to remove.
   */
  override off<K extends keyof RESTlerEvents>(
    event: K,
    callback?: RESTlerEvents[K],
  ): this;
  /**
   * Array form: each entry is resolved back to the isolation wrapper
   * {@link on} registered for it, then removed.
   *
   * @param event - The event to unsubscribe from.
   * @param callback - The listeners to remove. When omitted, every listener
   *   for `event` is removed.
   */
  override off<K extends keyof RESTlerEvents>(
    event: K,
    callback?: RESTlerEvents[K][],
  ): this;
  override off<K extends keyof RESTlerEvents>(
    event: K,
    callback?: RESTlerEvents[K] | RESTlerEvents[K][],
  ): this {
    if (callback === undefined) {
      super.off(event);
      return this;
    }
    if (Array.isArray(callback)) {
      for (const cb of callback) this.off(event, cb);
      return this;
    }
    const cb = callback as unknown as (...args: unknown[]) => unknown;
    const wrapper = this.__isoListeners.get(cb);
    super.off(event, (wrapper ?? cb) as unknown as RESTlerEvents[K]);
    return this;
  }

  //#endregion Event registration (per-listener isolation)

  //#region Protected methods

  /**
   * Decide whether a request header carries a credential and must therefore be
   * replaced with `[REDACTED]` before the header map is copied into an error's
   * `context`, an emitted event, or a config-error context (all of which
   * consumers commonly serialise to logs).
   *
   * The default matches the standard credential headers plus the common
   * non-standard token headers (see {@link SENSITIVE_HEADER}). It is the single
   * overridable seam every header-redaction site routes through, so a subclass
   * that authenticates with a vendor-specific header extends the sensitive set
   * by overriding this method — for example:
   *
   * ```typescript ignore
   * protected override _isSensitiveHeader(name: string): boolean {
   *   return name.toLowerCase() === 'x-vendor-secret' ||
   *     super._isSensitiveHeader(name);
   * }
   * ```
   *
   * Chaining to `super` keeps the base credential headers redacted too. The
   * check must be case-insensitive: header names are compared as sent, and a
   * vendor may use any casing.
   *
   * @param name - The header name (as it appears on the request).
   * @returns `true` if the header's value should be redacted.
   */
  protected _isSensitiveHeader(name: string): boolean {
    return SENSITIVE_HEADER.test(name);
  }

  /**
   * Inject authentication headers onto the endpoint before it is sent
   *
   * The base implementation handles `BASIC` and `BEARER` auth (from the
   * endpoint's `auth` or the instance `auth` option). May be `async`:
   * subclasses can override it to fetch or refresh a token before the request,
   * returning a `Promise`.
   *
   * The `endpoint` passed in is a per-request copy created by
   * {@link _processEndpoint} (with its own `headers`/`query` objects), so
   * mutating it — as this method does — never writes back onto the caller's
   * endpoint object. This is what keeps a shared or reused endpoint object
   * from accumulating one call's credentials and leaking them into the next.
   *
   * By the time this runs, `endpoint.headers` already holds the FULL
   * outbound header set — instance-level defaults, `headerProvider()`'s
   * output, and the caller's own explicit headers, already merged (caller
   * wins on a collision). A signing-based `CUSTOM` auth override (HMAC,
   * SigV4-style) can read and sign the actual set that goes out, not just
   * whatever the caller happened to pass on this one call. The one
   * exception: the default `Content-Type` for JSON/XML/TEXT payloads is
   * computed later, in `_buildBody` — a signature that must cover it still
   * needs the caller to set `Content-Type` explicitly on `endpoint.headers`
   * before calling `_makeRequest`.
   *
   * @param endpoint - Per-request endpoint copy to mutate with auth headers
   *
   * @throws {@link RESTlerConfigError} If the endpoint's auth config is invalid
   */
  protected _authInjector(
    endpoint: RESTlerEndpoint,
  ): void | Promise<void> {
    if (endpoint.auth && !this._validateAuth(endpoint.auth)) {
      throw new RESTlerConfigError(
        `Invalid auth configuration for endpoint ${endpoint.path}`,
        {
          vendor: this.vendor,
          key: 'auth',
          value: this.__redactedAuth(endpoint.auth),
        },
      );
    }
    const auth = endpoint.auth ?? this._getOption('auth');
    if (auth) {
      endpoint.headers = endpoint.headers || {};
      if (auth.type === 'BASIC') {
        const { username, password } = auth;
        const encoded = this._base64Utf8(`${username}:${password}`);
        endpoint.headers['Authorization'] = `Basic ${encoded}`;
      } else if (auth.type === 'BEARER') {
        const { token, prefix = 'BEARER' } = auth;
        endpoint.headers['Authorization'] = `${prefix} ${token}`;
      }
    }
  }

  /**
   * Shallow-copy a request with credentials stripped, so they never reach an
   * error's `context` or an emitted event (both of which consumers commonly
   * serialise to logs). Sensitive header values are replaced with
   * `[REDACTED]`, credentials embedded in the `url` (query-string values and
   * userinfo) are redacted via {@link __redactedURL}, and the `payload` is
   * omitted entirely.
   *
   * The payload is dropped rather than field-redacted like headers: a request
   * body is arbitrary in shape and routinely carries credentials (a login
   * body, an OAuth token exchange, an API key in the body), with no fixed set
   * of secret-bearing keys to match, so omitting it is the safe default. The
   * body actually sent over the wire is unaffected.
   */
  private __redactedRequest(request: RESTlerRequest): RESTlerRequest {
    const { payload: _payload, ...rest } = request as
      & RESTlerRequest
      & { payload?: unknown };
    const safe = { ...rest, url: this.__redactedURL(rest.url) } as
      & RESTlerRequest
      & { headers?: Record<string, string> };
    const headers = safe.headers;
    if (headers) {
      const safeHeaders: Record<string, string> = {};
      for (const [key, value] of Object.entries(headers)) {
        safeHeaders[key] = this._isSensitiveHeader(key) ? '[REDACTED]' : value;
      }
      safe.headers = safeHeaders;
    }
    return safe as RESTlerRequest;
  }

  /**
   * Redact credentials embedded in a request URL before it reaches an error's
   * `context` or an emitted event. Every query-string value is replaced with
   * `[REDACTED]` (keys are kept, so a log still shows which parameters were
   * sent) and any userinfo in the authority (`user:pass@host`) is stripped.
   *
   * Query-string auth is a first-class, documented pattern in this package —
   * an API key injected via `endpoint.query` (see {@link _authInjector}) — and
   * like the request payload a query string has no fixed set of secret-bearing
   * keys to match, so every value is treated as sensitive. The URL actually
   * requested over the wire is unaffected.
   *
   * @param url - The fully-resolved request URL.
   * @returns The URL with query-string values and userinfo redacted.
   */
  private __redactedURL(url: string): string {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      // Not a parseable absolute URL — `_processEndpoint` always produces one,
      // so this only guards a hand-built request. Nothing structured to redact.
      return url;
    }
    // Strip any credentials embedded in the authority (`https://key:secret@…`).
    if (parsed.username || parsed.password) {
      parsed.username = '';
      parsed.password = '';
    }
    // Redact every query-string value. Setting `search` (rather than mutating
    // `searchParams`) keeps the `[REDACTED]` marker un-encoded, matching the
    // literal placeholder used everywhere else.
    if (parsed.search) {
      const keys = [...new Set([...parsed.searchParams.keys()])];
      parsed.search = keys
        .map((key) => `${encodeURIComponent(key)}=[REDACTED]`)
        .join('&');
    }
    return parsed.toString();
  }

  /**
   * Copy a response with the `url` redacted, for the copy handed to the `call`
   * and `authFailure` events. The response returned to the caller keeps its
   * real `url` (the caller already holds the credentials); only the
   * event-facing copy — which consumers commonly log — is redacted.
   */
  private __redactedResponse(
    response: RESTlerResponse,
  ): RESTlerResponse {
    return { ...response, url: this.__redactedURL(response.url) };
  }

  /**
   * Redact credentials from a {@link RESTlerError} thrown by a vendor
   * {@link _responseHandler} before it is stored on `response.error` — which is
   * both re-thrown to the caller and handed to the `call` event (directly, and
   * via the response copy's own `error` field).
   *
   * A response handler receives only the response, so the documented way to
   * record the failed request on the error it throws is to copy `response.url`
   * into `context.request` (see the README example and the WeatherAPI
   * fixture) — but `response.url` is the raw, credential-bearing URL. Left
   * untouched, an API key injected via the query string would surface in the
   * serialized error on every vendor-envelope failure, defeating the same
   * redaction applied to the event's request/response copies.
   *
   * Only the standardised `request` field (a {@link RESTlerRequest}, redacted
   * exactly as {@link __redactedRequest} does) is rewritten in place, so the
   * original error instance — its type and stack — surfaces unchanged. (Its
   * `cause` chain is separately scrubbed of the request URL by
   * {@link __redactedCause}.) A URL a handler chooses to place under a
   * non-standard context key, or interpolate into the message text, is outside
   * what the library can retroactively redact.
   *
   * @param error - The handler-thrown error to redact and return.
   */
  private __redactedError(error: RESTlerError): RESTlerError {
    const context = error.context as { request?: unknown } | undefined;
    const request = context?.request;
    if (
      request !== null && typeof request === 'object' &&
      typeof (request as RESTlerRequest).url === 'string'
    ) {
      (context as { request: RESTlerRequest }).request = this.__redactedRequest(
        request as RESTlerRequest,
      );
    }
    return error;
  }

  /**
   * Scrub the credential-bearing request URL out of an error's `cause` chain
   * (and its own message/stack) before that error is surfaced from
   * {@link _makeRequest}.
   *
   * {@link __redactedRequest} only redacts the `context.request` copy. When
   * `fetch` itself fails (DNS, TLS, connection refused) the runtime embeds the
   * full request URL — including any query-string credential or `user:pass@`
   * userinfo — in the transport error's `message`, and therefore its `stack`,
   * and often again one level down in that error's own nested `cause` (on Deno
   * the URL lives in the cause of `TypeError: fetch failed`). That error is
   * attached verbatim as the wrapping {@link RESTlerRequestError}'s `cause`
   * (and is the same object handed to the `call` event's 4th argument), so
   * without this the secret survives in the chain and surfaces through any
   * cause-expanding logger — `console.error(err)`, `util.inspect`,
   * `Deno.inspect(err, { depth })` — even though `JSON.stringify` /
   * {@link BaseError.toJSON} (which render only the *direct* cause as
   * `"Name: message"`) do not expand it.
   *
   * The chain is scrubbed **in place**, so each error keeps its original type
   * (a consumer's `cause instanceof TypeError` check still holds) and identity:
   * every occurrence of the raw request URL is replaced with its redacted form
   * (query-string values and userinfo blanked — see {@link __redactedURL}) in
   * both `message` and `stack`, for every error reachable via `cause`. The walk
   * is cycle- and depth-guarded, and when the URL carries nothing sensitive
   * (no query string, no userinfo) the chain is left untouched so genuine
   * transport diagnostics survive for debugging.
   *
   * @param cause - The error whose own message/stack and `cause` chain may
   *   embed the request URL.
   * @param rawUrl - The fully-resolved request URL that was handed to `fetch`.
   * @returns The same `cause` object, scrubbed in place.
   */
  private __redactedCause(cause: Error, rawUrl: string): Error {
    const safeUrl = this.__redactedURL(rawUrl);
    // The URL carries nothing sensitive (no query string, no userinfo) — the
    // address alone is not a credential, so leave the diagnostic intact.
    if (safeUrl === rawUrl) return cause;
    const seen = new Set<unknown>();
    let node: unknown = cause;
    // `seen` breaks cycles; the depth cap is a belt-and-suspenders backstop.
    for (let depth = 0; node && depth < 16; depth++) {
      if (typeof node !== 'object' || seen.has(node)) break;
      seen.add(node);
      const err = node as Record<string, unknown>;
      this.__scrubField(err, 'message', rawUrl, safeUrl);
      this.__scrubField(err, 'stack', rawUrl, safeUrl);
      node = err.cause;
    }
    return cause;
  }

  /**
   * Replace every occurrence of `rawUrl` with `safeUrl` in `obj[field]` (an
   * error's `message` or `stack` string), in place.
   *
   * Falls back to {@link Object.defineProperty} when a plain assignment does
   * not take (e.g. a read-only `message` accessor on an exotic error subclass),
   * and swallows any failure — redaction must never itself break request
   * handling.
   *
   * @param obj - The error being scrubbed.
   * @param field - The string field to rewrite (`message` or `stack`).
   * @param rawUrl - The raw request URL to remove.
   * @param safeUrl - Its redacted replacement.
   */
  private __scrubField(
    obj: Record<string, unknown>,
    field: 'message' | 'stack',
    rawUrl: string,
    safeUrl: string,
  ): void {
    try {
      const value = obj[field];
      if (typeof value !== 'string' || !value.includes(rawUrl)) return;
      // Use a function replacement, not a string: a string replacement expands
      // `$`-patterns (`$&`, `$$`, `` $` ``, `$'`, `$1`), and `safeUrl` echoes the
      // URL's path/scheme/host verbatim — so a request path containing `$&`
      // would re-insert the raw, credential-bearing `rawUrl` into the scrubbed
      // text. A function replacement is not subject to `$` interpretation.
      const scrubbed = value.replaceAll(rawUrl, () => safeUrl);
      obj[field] = scrubbed;
      // If the assignment didn't stick (read-only accessor), force it so the
      // credential can't survive behind a getter.
      if (
        typeof obj[field] === 'string' &&
        (obj[field] as string).includes(rawUrl)
      ) {
        Object.defineProperty(obj, field, {
          value: scrubbed,
          writable: true,
          configurable: true,
          enumerable: false,
        });
      }
    } catch {
      // Best-effort: never let redaction throw and break the request path.
    }
  }

  /**
   * Emit an event for which a throwing or rejecting listener must never affect
   * the request outcome: `call` runs inside {@link _makeRequest}'s `finally`
   * (where a thrown listener error would supplant the real return value or
   * error), while `authFailure` and `rateLimit` run inside its `try` (where it
   * would be caught and mis-reported as a `RESTlerRequestError`, discarding a
   * normally-returned 401/429).
   *
   * The isolation itself is per-listener and installed at registration (see
   * {@link on} / {@link __runIsolated}): a listener's synchronous throw is
   * caught and its async rejection neutralised before either can reach here, so
   * one listener's fault neither disables the listeners after it nor escapes as
   * an unhandled rejection. The surrounding `try/catch` is a defensive
   * backstop for any path that bypasses that wrapping; the base client has no
   * logger, so a listener error is swallowed.
   *
   * @param event - The event to emit.
   * @param args - The event arguments.
   */
  private __safeEmit<K extends keyof RESTlerEvents>(
    event: K,
    ...args: Parameters<RESTlerEvents[K]>
  ): void {
    try {
      this._emit(event, ...args);
    } catch {
      // Defensive backstop; per-listener isolation (see `on`) already contains
      // listener faults. The base client has no logger, so any error that
      // still reaches here is intentionally swallowed.
    }
  }

  /**
   * Return the memoized isolation wrapper for `callback`, creating it on first
   * use. Memoizing (same callback → same wrapper) keeps {@link on}/{@link off}
   * symmetric and preserves the base emitter's duplicate-registration
   * de-duplication.
   *
   * @param callback - The consumer's original listener.
   */
  private __isolate(
    callback: RESTlerEvents[keyof RESTlerEvents],
  ): (...args: unknown[]) => unknown {
    const cb = callback as unknown as (...args: unknown[]) => unknown;
    let wrapper = this.__isoListeners.get(cb);
    if (wrapper === undefined) {
      wrapper = (...args: unknown[]): unknown => this.__runIsolated(cb, args);
      this.__isoListeners.set(cb, wrapper);
    }
    return wrapper;
  }

  /**
   * Invoke a single listener with full isolation, so neither a synchronous
   * throw nor an async rejection can affect the request outcome or the other
   * listeners:
   *
   * - a **synchronous** throw is caught here rather than left to propagate to
   *   {@link Options.emit}'s bare loop, which would abort and skip every
   *   listener registered after this one, and
   * - an **async** listener's rejection is neutralised by attaching a rejection
   *   handler to the returned promise — {@link Options.emit} does not await
   *   listener results, so an unhandled rejection would otherwise escape and
   *   terminate the process.
   *
   * The (now rejection-safe) promise is still returned so the inherited
   * {@link Options.emitSync} keeps sequencing listeners in turn.
   *
   * @param cb - The consumer's original listener.
   * @param args - The event arguments to forward.
   */
  private __runIsolated(
    cb: (...args: unknown[]) => unknown,
    args: unknown[],
  ): unknown {
    try {
      const result = cb(...args);
      if (
        result !== null && typeof result === 'object' &&
        typeof (result as PromiseLike<unknown>).then === 'function'
      ) {
        return Promise.resolve(result as PromiseLike<unknown>).then(
          undefined,
          () => {},
        );
      }
      return result;
    } catch {
      // Synchronous listener throw isolated here so the emit loop continues to
      // the next listener and the request outcome is unaffected.
      return undefined;
    }
  }

  /**
   * Base64-encode a string's UTF-8 bytes, RFC 7617-correct for any Unicode
   * credential and identical across Deno, Bun, and Node.
   *
   * `btoa` alone operates on a Latin1 (binary) string: it throws
   * `InvalidCharacterError` for any code point above U+00FF and emits
   * U+0080–U+00FF as single Latin1 bytes rather than the UTF-8 byte sequences
   * the HTTP `Authorization: Basic` header requires. Encoding the string to
   * its UTF-8 bytes via {@link TextEncoder} first, then mapping each byte into
   * the binary string `btoa` expects, avoids both problems.
   *
   * PROTECTED (not private): a `CUSTOM`-auth subclass that wants
   * Basic-style header encoding for some other purpose (a vendor's own
   * non-standard Basic-shaped scheme) can reuse this rather than
   * reimplementing UTF-8-correct base64 from scratch.
   *
   * @param value - The string to encode.
   * @returns The base64 encoding of `value`'s UTF-8 bytes.
   */
  protected _base64Utf8(value: string): string {
    const bytes = new TextEncoder().encode(value);
    let binary = '';
    for (const byte of bytes) {
      binary += String.fromCharCode(byte);
    }
    return btoa(binary);
  }

  /**
   * Copy an `auth` config with secret fields (`password`/`token`) masked, for
   * safe inclusion in a config-error context.
   */
  private __redactedAuth(auth: unknown): unknown {
    if (!auth || typeof auth !== 'object') return auth;
    const out = { ...(auth as Record<string, unknown>) };
    for (const key of ['password', 'token']) {
      if (key in out) out[key] = '[REDACTED]';
    }
    return out;
  }

  /**
   * Redact secret-bearing option values before they enter a config-error
   * context: `auth` (password/token), `headers` (Authorization, Cookie, …),
   * and `tls` (inline private key). Every other option passes through unchanged.
   */
  private __redactedOption(key: string, value: unknown): unknown {
    if (key === 'auth') return this.__redactedAuth(value);
    if (!value || typeof value !== 'object') return value;
    if (key === 'headers') {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        out[k] = this._isSensitiveHeader(k) ? '[REDACTED]' : v;
      }
      return out;
    }
    if (key === 'tls') {
      const out = { ...(value as Record<string, unknown>) };
      if ('key' in out) out.key = '[REDACTED]';
      return out;
    }
    return value;
  }

  /**
   * Perform a request for the given endpoint and return a typed response
   *
   * Resolves the endpoint, injects auth, sends it via {@link _fetch}, and
   * parses the body. On failure the error is also attached to the rejected
   * response's `error` field before being re-thrown.
   *
   * The caller's `endpoint` object is never mutated — auth is injected onto a
   * per-request copy made by {@link _processEndpoint}. The `request` and
   * `response` handed to the `call`/`authFailure` events (and the `request`
   * stored on any error `context`, including one thrown by a vendor
   * {@link _responseHandler}) are credential-redacted (sensitive headers,
   * query-string values, userinfo, and the payload). When `fetch` itself fails,
   * the transport error is preserved as the wrapped error's `cause` but has the
   * request URL scrubbed from its whole chain (see {@link __redactedCause}), so
   * even a cause-expanding logger (`console.error`, `util.inspect`) never sees
   * the credential. A throwing or rejecting
   * event listener cannot corrupt the outcome: each listener runs in isolation
   * (a synchronous throw is contained, an async rejection is caught), so a bug
   * in one listener neither replaces a successful response, masks the real
   * error, nor disables the listeners registered after it.
   *
   * @param endpoint - Endpoint configuration (path, method, baseURL, payload, etc.)
   * @param options - `responseHandler` overrides {@link _responseHandler};
   *   `responseSchema` runs after it (or on the raw parsed body, if no
   *   handler ran); `skipAuth` skips {@link _authInjector} for this one
   *   request. See {@link RESTlerRequestOptions}.
   * @returns The response, with `status`, `headers`, parsed `body`, and `timeTaken`
   *
   * @throws {@link RESTlerTimeoutError} If the request exceeds its timeout
   * @throws {@link RESTlerResponseValidationError} If `responseSchema`
   *   rejects the response
   * @throws {@link RESTlerRequestError} If the request fails for any other
   *   reason, or wrapping (as `cause`) a non-{@link RESTlerError} thrown by
   *   the response handler
   * @throws {@link RESTlerConfigError} If the endpoint configuration is invalid
   * @throws {@link RESTlerError} Subclasses thrown by the response handler
   *   surface unwrapped (with the `request` in their `context` redacted)
   */
  protected _makeRequest<H = ResponseBody, B = H>(
    endpoint: RESTlerEndpoint,
    options: RESTlerRequestOptions<H, B> = {},
  ): Promise<RESTlerResponse<B>> {
    const witness = this._getOption('witness');
    if (witness === undefined) {
      return this.__request<H, B>(endpoint, options);
    }
    // The whole request — endpoint resolution, headerProvider, fetch, body
    // parsing — runs inside the witnessed window, so a tracer's span is
    // ambient-active when the headerProvider fires (that composition is what
    // puts THIS request's span id into an injected `traceparent`). Name and
    // attributes stay low-cardinality and redaction-safe: the raw `path` is
    // passed as given (no query string, no resolved URL, no userinfo).
    return witness(
      {
        name: `restler.${this.vendor} ${endpoint.method}`,
        attributes: {
          'restler.vendor': this.vendor,
          'http.request.method': endpoint.method,
          'url.path': endpoint.path,
        },
      },
      () => this.__request<H, B>(endpoint, options),
    );
  }

  /** The request pipeline {@link _makeRequest} runs (witnessed or not). */
  private async __request<H = ResponseBody, B = H>(
    endpoint: RESTlerEndpoint,
    options: RESTlerRequestOptions<H, B> = {},
  ): Promise<RESTlerResponse<B>> {
    // The vendor-wide default is declared `RESTlerResponseHandler` (H =
    // unknown) because a class field can't be parameterized per-call —
    // this cast bridges that the same way `response.body = ... as B` casts
    // already do throughout this method.
    const handler = options.responseHandler ??
      (this._responseHandler as RESTlerResponseHandler<H> | undefined);
    const request = await this._processEndpoint(endpoint, {
      skipAuth: options.skipAuth,
    });
    const response: RESTlerResponse<B> = {
      url: request.url,
      status: null,
      statusText: null,
      timeTaken: 0,
    };
    const start = performance.now();
    // A manual controller + timer, not `AbortSignal.timeout`: that signal's
    // timer stays armed for the entire (up to 120s) window even when the
    // request completes in milliseconds, so timers accumulate under load.
    // The `finally` below releases it.
    //
    // The abort reason is a `TimeoutError` so the catch classifies it the same
    // way `AbortSignal.timeout` was classified. `DOMException` is available and
    // propagates its `name` verbatim through `fetch` on Deno, Bun, and Node.
    const controller = new AbortController();
    const timer = setTimeout(
      () =>
        controller.abort(
          new DOMException(
            `Request exceeded its ${request.timeout}s timeout`,
            'TimeoutError',
          ),
        ),
      request.timeout * 1000,
    );
    try {
      const headers: Record<string, string> = { ...request.headers };
      const body = this._buildBody(request, headers);
      // compat's `fetch` resolves TLS and Unix-socket transport
      // internally — we just hand it the options.
      const init: RequestInit & { unix?: string; tls?: TLSOptions } = {
        method: request.method,
        headers,
        signal: controller.signal,
      };
      if (body !== undefined) init.body = body;
      const socketPath = this._getOption('socketPath');
      if (socketPath) init.unix = socketPath;
      const tls = this._getOption('tls');
      if (tls) init.tls = tls;

      const resp = await this._fetch(request.url, init);
      response.status = resp.status;
      response.statusText = STATUS_TEXT[resp.status] ??
        resp.statusText ?? 'Unknown';
      response.headers = Object.fromEntries(resp.headers.entries());
      const responseType = endpoint.responseType;
      if (responseType === 'BLOB') {
        response.body = (await resp.blob()) as B;
      } else if (responseType === 'ARRAY_BUFFER') {
        response.body = (await resp.arrayBuffer()) as B;
      } else {
        const respContentType = resp.headers.get('content-type')?.toLowerCase();
        response.body = this._parseResponseBody<B>(
          await resp.text(),
          respContentType,
        );
      }
      response.timeTaken = performance.now() - start;

      // Check for authentication failure
      if (response.status && this._authStatus.includes(response.status)) {
        this.__safeEmit(
          'authFailure',
          this.vendor,
          this.__redactedRequest(request),
          this.__redactedResponse(response as RESTlerResponse),
        );
      }

      // Check for rate limiting
      if (response.status && this._rateLimitStatus.includes(response.status)) {
        // Extract rate limit information from headers
        const limit = this._extractHeaderNumber(
          response.headers,
          'x-ratelimit-limit',
          'ratelimit-limit',
        );
        const remaining = this._extractHeaderNumber(
          response.headers,
          'x-ratelimit-remaining',
          'ratelimit-remaining',
        );
        const reset = this._extractHeaderNumber(
          response.headers,
          'x-ratelimit-reset',
          'ratelimit-reset',
        );

        this.__safeEmit('rateLimit', this.vendor, limit, reset, remaining);
      }

      // Vendor response hook — runs on every response (any status, empty
      // body included) so it can translate vendor conventions: throw to
      // reject, or RETURN the value that becomes the request's result (raw
      // `response.body` unchanged, or an unwrapped envelope). Its output
      // feeds `responseSchema` next, if also given; if only one of the two
      // is present, its result is final; if neither, the raw parsed body
      // stands as `response.body` already does.
      if (handler) {
        response.body = await handler(
          response as RESTlerResponse<unknown>,
        ) as B;
      }
      if (options.responseSchema) {
        try {
          response.body = await options.responseSchema(
            response.body as unknown as H,
          ) as B;
        } catch (schemaError) {
          // Propagates to the catch below exactly like a vendor
          // `responseHandler` throwing a `RESTlerError` directly does —
          // `request` here is passed RAW (unredacted), relying on that
          // catch's existing generic `__redactedError` handling.
          throw new RESTlerResponseValidationError(
            { vendor: this.vendor, request },
            schemaError instanceof Error
              ? schemaError
              : new Error(String(schemaError)),
          );
        }
      }

      return response;
    } catch (error) {
      response.timeTaken = performance.now() - start;
      if (error instanceof Error) {
        if (error.name === 'TimeoutError' || error.name === 'AbortError') {
          response.error = new RESTlerTimeoutError(
            {
              vendor: this.vendor,
              request: this.__redactedRequest(request),
            },
          );
        } else if (error instanceof RESTlerError) {
          // A vendor `_responseHandler` surfaces its `RESTlerError` subclass
          // unwrapped, but its `context.request` (built from the raw
          // `response.url`) must be redacted first — this error is re-thrown to
          // the caller and handed to the `call` event. Any transport URL the
          // handler preserved in the error's `cause` chain is scrubbed too.
          if (error.cause instanceof Error) {
            this.__redactedCause(error.cause, request.url);
          }
          response.error = this.__redactedError(error);
        } else {
          response.error = new RESTlerRequestError(
            'Unknown error processing the request',
            {
              vendor: this.vendor,
              request: this.__redactedRequest(request),
            },
            // `fetch`'s transport error embeds the full (credential-bearing)
            // request URL in its message/stack and nested `cause` on some
            // runtimes; scrub it out of the whole chain before preserving it
            // as this error's `cause` (see `__redactedCause`).
            this.__redactedCause(error, request.url),
          );
        }
      } else {
        response.error = new RESTlerRequestError(
          'Unknown error processing the request',
          {
            vendor: this.vendor,
            request: this.__redactedRequest(request),
          },
        );
      }
      throw response.error;
    } finally {
      // Released here, not when `fetch` resolves: `fetch` settles as soon as
      // the response headers arrive, so the body read above (`text()` /
      // `blob()` / `arrayBuffer()`) still needs the signal armed. Clearing it
      // any earlier would leave a stalled body read running unbounded.
      clearTimeout(timer);
      this.__safeEmit(
        'call',
        this.vendor,
        this.__redactedRequest(request),
        this.__redactedResponse(response as RESTlerResponse),
        response.error,
      );
    }
  }

  /**
   * Serialize the request payload to a `BodyInit` based on its content
   * type, setting a default `Content-Type` header when one isn't already
   * present. Returns `undefined` for body-less methods (GET/HEAD) or when
   * no payload was supplied.
   *
   * @param request - The processed request.
   * @param headers - Header map to augment with a `Content-Type`.
   */
  protected _buildBody(
    request: RESTlerRequest,
    headers: Record<string, string>,
  ): BodyInit | undefined {
    if (request.method === 'GET' || request.method === 'HEAD') {
      return undefined;
    }
    const payload = (request as { payload?: unknown }).payload;
    if (payload === undefined) return undefined;
    // Normalise case: the validator accepts a case-insensitive contentType
    // (e.g. 'json'), so upper-case it here — otherwise the switch below hits
    // `default` and silently drops the request body.
    const contentType = String(
      (request as { contentType?: RESTlerContentType }).contentType ?? 'JSON',
    ).toUpperCase() as RESTlerContentType;
    // Match Content-Type case-insensitively so a caller-supplied header (e.g.
    // a lowercase `content-type`) isn't duplicated by the default below.
    const hasContentType = Object.keys(headers).some(
      (key) => key.toLowerCase() === 'content-type',
    );
    switch (contentType) {
      case 'JSON':
        if (!hasContentType) headers['Content-Type'] = 'application/json';
        return JSON.stringify(payload);
      case 'XML':
        if (!hasContentType) headers['Content-Type'] = 'application/xml';
        return XMLStringify(payload as Record<string, unknown>);
      case 'FORM': {
        if (payload instanceof FormData) {
          // Let fetch set multipart/form-data with the correct boundary.
          Object.keys(headers).forEach((key) => {
            if (key.toLowerCase() === 'content-type') {
              delete headers[key];
            }
          });
          return payload;
        }
        // A `URLSearchParams` or plain object -> `application/x-www-form-
        // urlencoded` — the wire format essentially every OAuth2 token
        // exchange (and e.g. Stripe's whole API) requires, and multipart
        // is the wrong shape for. `URLSearchParams`'s own serializer
        // (space -> `+`) is CORRECT here — unlike a URL query string
        // (see the query-building block above), `+` for space is the
        // `application/x-www-form-urlencoded` media type's own convention
        // for a request BODY, not something to route around.
        if (!hasContentType) {
          headers['Content-Type'] = 'application/x-www-form-urlencoded';
        }
        const params = payload instanceof URLSearchParams
          ? payload
          : new URLSearchParams(
            Object.fromEntries(
              Object.entries(payload as Record<string, unknown>).map((
                [key, value],
              ) => [key, String(value)]),
            ),
          );
        return params.toString();
      }
      case 'TEXT':
        if (!hasContentType) headers['Content-Type'] = 'text/plain';
        return payload as string;
      case 'BLOB':
        return payload as Blob;
      default:
        return undefined;
    }
  }

  /**
   * Parses a response body based on its content type.
   *
   * Content types are matched by substring, so vendor suffixes
   * (`application/vnd.api+json`, `application/atom+xml`) route to their
   * structured parser. A missing or unrecognized content type is parsed
   * best-effort — JSON first, then XML — falling back to the raw text.
   *
   * Lenient by design: when a structured (JSON/XML) parse fails, the raw text
   * is returned rather than throwing. The generic `B` is a cast, not a
   * guarantee — a malformed structured response yields a `string`.
   *
   * @param body - The response body as string
   * @param contentType - Content-Type header value
   * @returns Parsed response body
   */
  protected _parseResponseBody<B = ResponseBody>(
    body: string,
    contentType: string | null | undefined,
  ): B {
    // No body — nothing to parse.
    if (!body) return undefined as unknown as B;
    const ct = contentType?.toLowerCase() ?? '';
    try {
      // Check the structured types before the generic `text` fallback so
      // e.g. `text/xml` routes to XML rather than being treated as text.
      if (ct.includes('json')) {
        return JSON.parse(body) as B;
      }
      if (ct.includes('xml')) {
        return XMLParse(body) as unknown as B;
      }
      if (ct.includes('text')) {
        // Genuine text — return as-is (don't JSON-parse text/plain etc.).
        return body as unknown as B;
      }
      // Missing or unrecognized content type — best-effort structured parse:
      // try JSON, then XML. The XML parser is strict (plain text and binary
      // make it throw), so the outer catch returns those bodies raw.
      try {
        return JSON.parse(body) as B;
      } catch {
        return XMLParse(body) as unknown as B;
      }
    } catch {
      // Structured parse failed — return the raw text.
      return body as unknown as B;
    }
  }

  /**
   * Return the first parseable numeric value among the given header names
   * (case-insensitive), or `undefined` if none is present. Used to read
   * rate-limit headers, which differ in spelling between APIs.
   *
   * @param headers - The response headers.
   * @param names - Candidate header names, in priority order.
   */
  protected _extractHeaderNumber(
    headers: Record<string, string> | undefined,
    ...names: string[]
  ): number | undefined {
    if (!headers) return undefined;
    for (const name of names) {
      const value = headers[name.toLowerCase()];
      if (value !== undefined) {
        const n = Number(value);
        if (!Number.isNaN(n)) return n;
      }
    }
    return undefined;
  }

  /**
   * Resolve an endpoint into a complete, executable request
   *
   * Merges endpoint and instance options, substitutes `{version}` placeholders,
   * builds the final URL (path, query, port), and injects auth via
   * {@link _authInjector}.
   *
   * Operates on a private copy of `endpoint` (with its own `headers`/`query`
   * objects), so the caller's endpoint object is never mutated — auth headers
   * or query params written by {@link _authInjector} do not persist on it or
   * bleed into later requests that reuse the same object.
   *
   * `endpoint.path` is joined onto the base URL's pathname via `path.join`,
   * which normalizes it — see {@link RESTlerEndpoint.path} for what that
   * means for a caller-controlled path segment.
   *
   * @param endpoint - Endpoint configuration to process (not mutated)
   * @param options - `skipAuth` skips the {@link _authInjector} call for
   *   this one request — see `RESTlerRequestOptions.skipAuth`.
   * @returns A request ready to be sent
   *
   * @throws {@link RESTlerConfigError} If the endpoint's `baseURL`, `port`,
   *   `version`, `contentType`, `timeout`, or `auth` is invalid — every
   *   override is held to the same contract as its instance-level option
   */
  protected async _processEndpoint(
    endpoint: RESTlerEndpoint,
    options: { skipAuth?: boolean } = {},
  ): Promise<RESTlerRequest> {
    // Work on a copy — with its own `headers`/`query` objects — so neither the
    // base `_authInjector` nor a subclass override can mutate the caller's
    // endpoint object. Writing auth onto the caller's object would otherwise
    // persist the credential on it (in plaintext) and let it bleed into later
    // calls, including calls made with the same shared endpoint object by a
    // differently-authenticated instance.
    endpoint = {
      ...endpoint,
      headers: endpoint.headers ? { ...endpoint.headers } : undefined,
      query: endpoint.query ? { ...endpoint.query } : undefined,
    };
    if (endpoint.baseURL && this._validateBaseURL(endpoint.baseURL) === false) {
      throw new RESTlerConfigError(
        `Invalid endpoint baseURL ${endpoint.baseURL}`,
        { vendor: this.vendor, key: 'baseUrl', value: endpoint.baseURL },
      );
    }
    const version = this.__resolveEndpointVersion(endpoint.version);
    // Resolved (and validated) up-front, before `_authInjector` runs — an
    // invalid content type shouldn't cost the caller a token refresh first.
    const contentType = 'contentType' in endpoint
      ? this.__resolveEndpointContentType(endpoint.contentType)
      : this._getOption('contentType');
    const baseURL = endpoint.baseURL ?? this._getOption('baseURL');
    const port = endpoint.port ?? this._getOption('port');
    if (endpoint.port && !this._validatePort(endpoint.port)) {
      // Validate port!!!
      throw new RESTlerConfigError(
        `Invalid port ${endpoint.port}`,
        { vendor: this.vendor, key: 'port', value: endpoint.port },
      );
    }
    const headers: Record<string, string> = {};
    // Replace version in default headers
    Object.entries(this._defaultHeaders).forEach(([key, value]) => {
      headers[key] = this._replaceVersion(value, version);
    });
    // Per-request outbound headers (traceparent, correlation ids). Layered
    // over the defaults but under the endpoint's own headers and auth —
    // explicit always beats ambient. Values are runtime-computed, so no
    // {version} replacement. A throwing provider is contained: observability
    // wiring must never break the request it decorates.
    const headerProvider = this._getOption('headerProvider');
    if (headerProvider !== undefined) {
      try {
        for (const [key, value] of Object.entries(headerProvider() ?? {})) {
          headers[key] = String(value);
        }
      } catch {
        // contained by design — see the option's contract
      }
    }
    // Fold the accumulated defaults+headerProvider set INTO endpoint.headers
    // — the caller's own entries still win on a collision — BEFORE auth
    // runs, not after. A signing-based CUSTOM `_authInjector` mutates
    // `endpoint.headers` directly (see its default implementation below);
    // running this merge first means that's now the FULL outbound set, so
    // a signature computed over it covers everything actually sent, not
    // just whatever the caller happened to pass on this one call.
    endpoint.headers = {
      ...headers,
      ...Object.fromEntries(
        Object.entries(endpoint.headers ?? {}).map((
          [key, value],
        ) => [key, this._replaceVersion(value, version)]),
      ),
    };
    // Handle auth (may be async — e.g. token refresh before the request) —
    // skipped for a CUSTOM auth's own token-exchange request, which would
    // otherwise recurse into _authInjector before the token exists.
    if (!options.skipAuth) {
      await this._authInjector(endpoint);
    }
    if (endpoint.headers) {
      Object.assign(headers, endpoint.headers);
    }
    const url = new URL(this._replaceVersion(baseURL, version));
    url.pathname = path.join(
      url.pathname,
      this._replaceVersion(endpoint.path, version),
    );
    if (endpoint.query) {
      // Built manually with `encodeURIComponent` (RFC 3986: space -> `%20`)
      // rather than `URLSearchParams.set`, which follows the WHATWG
      // `application/x-www-form-urlencoded` serializer and encodes a space
      // as `+` — real, verified platform behavior that breaks any
      // signing-based auth re-deriving a canonical query string server-side
      // (a `+` does not round-trip as a space there).
      url.search = Object.entries(endpoint.query)
        .map(([key, value]) =>
          `${encodeURIComponent(key)}=${
            encodeURIComponent(this._replaceVersion(value, version))
          }`
        )
        .join('&');
    }
    if (port) {
      url.port = port.toString();
    }
    return {
      url: url.toString(),
      headers: headers,
      timeout: this.__resolveEndpointTimeout(endpoint.timeout),
      method: endpoint.method,
      contentType: contentType,
      payload: 'payload' in endpoint ? endpoint.payload : undefined,
    } as RESTlerRequest;
  }

  /**
   * Resolve the effective request timeout, validating a per-endpoint override
   * against the same 1..120s contract as the instance option. Without this an
   * endpoint `timeout: 0` fired immediately, a negative value threw a
   * mis-reported TypeError, and a value above the max silently bypassed it.
   *
   * @throws {@link RESTlerConfigError} If `timeout` is out of range.
   */
  private __resolveEndpointTimeout(timeout: number | undefined): number {
    if (timeout !== undefined && !this._validateTimeout(timeout)) {
      throw new RESTlerConfigError(
        `Timeout must be a number between 1 and ${MAX_TIMEOUT_VALUE}.`,
        { vendor: this.vendor, key: 'timeout', value: timeout },
      );
    }
    return timeout ?? this._getOption('timeout')!;
  }

  /**
   * Resolve the effective request version, validating a per-endpoint override
   * against the same contract as the instance option. Without this a non-string
   * endpoint `version` bypassed validation and reached {@link _replaceVersion},
   * corrupting every `{version}` placeholder in the URL and headers.
   *
   * @param version - The endpoint's `version` override, if any.
   * @returns The endpoint version, else the instance option, else `''`.
   *
   * @throws {@link RESTlerConfigError} If `version` is not a string.
   */
  private __resolveEndpointVersion(version: string | undefined): string {
    if (version !== undefined && !this._validateVersion(version)) {
      throw new RESTlerConfigError(
        `Version must be a string.`,
        { vendor: this.vendor, key: 'version', value: version },
      );
    }
    return version ?? this._getOption('version') ?? '';
  }

  /**
   * Resolve the effective request content type, validating a per-endpoint
   * override against the same contract as the instance option and normalising
   * its case the way {@link _processOption} does. Without this an unsupported
   * endpoint `contentType` fell through {@link _buildBody}'s `default` and
   * silently dropped the request body.
   *
   * @param contentType - The endpoint's `contentType` override, if any.
   * @returns The upper-cased content type, or `undefined` when none was given.
   *
   * @throws {@link RESTlerConfigError} If `contentType` is not a supported type.
   */
  private __resolveEndpointContentType(
    contentType: RESTlerContentType | undefined,
  ): RESTlerContentType | undefined {
    if (contentType !== undefined && !this._validateContentType(contentType)) {
      throw new RESTlerConfigError(
        `Content type must be one of: JSON, XML, FORM, TEXT, BLOB.`,
        { vendor: this.vendor, key: 'contentType', value: contentType },
      );
    }
    // Canonicalise so the endpoint path and the instance path (normalised in
    // `_processOption`) agree on casing. Guard the type: the validator also
    // accepts a nullish value, meaning "use the default".
    return typeof contentType === 'string'
      ? contentType.toUpperCase() as RESTlerContentType
      : contentType;
  }

  /**
   * Replaces version placeholders in strings with actual version.
   *
   * @param param - The string containing potential version placeholders
   * @param version - Version string to insert (defaults to empty string)
   * @returns String with version placeholders replaced
   */
  protected _replaceVersion(param: string, version: string = ''): string {
    const versionRegex = /{version}/g;
    // Function replacement, not a string: a version value containing a
    // `$`-pattern (`$&`, `$$`, `` $` ``, `$'`, `$1`) would otherwise be
    // interpreted as a substitution directive rather than substituted
    // literally, corrupting the resolved URL/header.
    return param.replaceAll(versionRegex, () => version);
  }

  /**
   * Processes and validates configuration options.
   *
   * @param key - Option key
   * @param value - Option value
   * @returns Processed option value
   * @throws {RESTlerConfigError} If the option value is invalid
   */
  protected override _processOption<K extends keyof RESTlerOptions>(
    key: K,
    value: O[K],
  ): O[K] {
    switch (key) {
      case 'baseURL':
        if (!this._validateBaseURL(value)) {
          throw new RESTlerConfigError(
            `Base URL must be a valid URL.`,
            { vendor: this.vendor, key: key, value: value },
          );
        }
        break;
      case 'version':
        if (!this._validateVersion(value)) {
          throw new RESTlerConfigError(
            `Version must be a string.`,
            { vendor: this.vendor, key: key, value: value },
          );
        }
        break;
      case 'port':
        if (!this._validatePort(value)) {
          throw new RESTlerConfigError(
            `Port must be a number between 1 and 65535.`,
            { vendor: this.vendor, key: key, value: value },
          );
        }
        break;
      case 'timeout':
        if (!this._validateTimeout(value)) {
          throw new RESTlerConfigError(
            `Timeout must be a number between 1 and ${MAX_TIMEOUT_VALUE}.`,
            { vendor: this.vendor, key: key, value: value },
          );
        }
        break;
      case 'contentType':
        if (!this._validateContentType(value)) {
          throw new RESTlerConfigError(
            `Content type must be one of: JSON, XML, FORM, TEXT, BLOB.`,
            { vendor: this.vendor, key: key, value: value },
          );
        }
        // Canonicalise to upper-case so getOption('contentType') and the
        // body builder always agree on casing. Guard the type: the validator
        // also accepts a nullish value (meaning "use the default").
        if (typeof value === 'string') {
          value = value.toUpperCase() as O[K];
        }
        break;
      case 'headers':
        if (!this._validateHeaders(value)) {
          throw new RESTlerConfigError(
            `Headers must be an object.`,
            {
              vendor: this.vendor,
              key: key,
              value: this.__redactedOption(key, value),
            },
          );
        }
        break;
      case 'socketPath':
        if (!this._validateSocketPath(value)) {
          throw new RESTlerConfigError(
            `Socket path must be a string and point to a valid file.`,
            { vendor: this.vendor, key: key, value: value },
          );
        }
        break;
      case 'tls':
        if (!this._validateTls(value)) {
          throw new RESTlerConfigError(
            `TLS must use inline PEM (cert/key/ca) or file paths (certFile/keyFile/caFile), not both, with valid, existing certificates.`,
            {
              vendor: this.vendor,
              key: key,
              value: this.__redactedOption(key, value),
            },
          );
        }
        break;
      case 'witness':
        if (value !== undefined && typeof value !== 'function') {
          throw new RESTlerConfigError(
            `witness must be a function (the suite's Witness shape).`,
            { vendor: this.vendor, key: key, value: value },
          );
        }
        break;
      case 'headerProvider':
        if (value !== undefined && typeof value !== 'function') {
          throw new RESTlerConfigError(
            `headerProvider must be a function returning a header record.`,
            { vendor: this.vendor, key: key, value: value },
          );
        }
        break;
      case 'auth':
        if (!this._validateAuth(value)) {
          throw new RESTlerConfigError(
            `Auth must be an object with a 'type' of BASIC ({ username, password }), BEARER ({ token, prefix? }), or CUSTOM.`,
            {
              vendor: this.vendor,
              key: key,
              value: this.__redactedOption(key, value),
            },
          );
        }
        break;
    }
    return super._processOption(key, value) as O[K];
  }

  //#region Validate options

  /**
   * Validates a baseURL option value.
   *
   * @param value - Value to validate
   * @returns Whether the value is valid
   */
  protected _validateBaseURL(
    value: unknown,
  ): value is RESTlerOptions['baseURL'] {
    if (typeof value === 'string') {
      try {
        const a = new URL(value);
        if (a.protocol !== 'http:' && a.protocol !== 'https:') {
          return false;
        }
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }

  /**
   * Validates a port option value.
   *
   * @param value - Value to validate
   * @returns Whether the value is valid
   */
  protected _validatePort(value: unknown): value is RESTlerOptions['port'] {
    if (value === undefined || value === null) return true;
    return typeof value === 'number' && (value > 0 && value <= 65535);
  }

  /**
   * Validates a version option value.
   *
   * @param value - Value to validate
   * @returns Whether the value is valid
   */
  protected _validateVersion(
    value: unknown,
  ): value is RESTlerOptions['version'] {
    return (
      !value || (typeof value === 'string' && value.length > 0)
    );
  }

  /**
   * Validates a timeout option value.
   *
   * @param value - Value to validate
   * @returns Whether the value is valid
   */
  protected _validateTimeout(
    value: unknown,
  ): value is RESTlerOptions['timeout'] {
    if (value === undefined || value === null) return true;
    return (typeof value === 'number' && value >= 1 &&
      value <= MAX_TIMEOUT_VALUE);
  }

  /**
   * Validates a contentType option value.
   *
   * @param value - Value to validate
   * @returns Whether the value is valid
   */
  protected _validateContentType(
    value: unknown,
  ): value is RESTlerOptions['contentType'] {
    return (
      !value || (typeof value === 'string' &&
        ['JSON', 'XML', 'FORM', 'TEXT', 'BLOB']
          .includes(value.toUpperCase()))
    );
  }

  /**
   * Validates a headers option value.
   *
   * @param value - Value to validate
   * @returns Whether the value is valid
   */
  protected _validateHeaders(
    value: unknown,
  ): value is RESTlerOptions['headers'] {
    return (
      !value || (typeof value === 'object' && value !== null)
    );
  }

  /**
   * Validates a socketPath option value.
   *
   * @param value - Value to validate
   * @returns Whether the value is valid
   */
  protected _validateSocketPath(
    value: unknown,
  ): value is RESTlerOptions['socketPath'] {
    if (!value) {
      return true;
    }
    if (typeof value === 'string') {
      try {
        statSync(value);
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }

  /**
   * Validates a TLS option value.
   *
   * @param value - Value to validate
   * @returns Whether the value is valid
   */
  protected _validateTls(
    value: unknown,
  ): value is RESTlerOptions['tls'] {
    if (value === undefined || value === null) return true;
    if (typeof value !== 'object') return false;
    try {
      // Config-time validation only: `validateTLS` enforces the inline-vs-file
      // exclusivity and checks the PEM content / file paths, throwing on a bad
      // config. `fetch` re-resolves the material itself at request time.
      validateTLS(value);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Validates an auth option value.
   *
   * @param value - Value to validate
   * @returns Whether the value is valid
   */
  protected _validateAuth(
    value: unknown,
  ): value is RESTlerOptions['auth'] {
    if (value === undefined || value === null) return true;
    if (typeof value !== 'object') return false;
    const v = value as Record<string, unknown>;
    switch (v.type) {
      case 'BASIC':
        // An EMPTY password is valid per RFC 7617 — and a real, common
        // pattern (Stripe's own documented primary auth is `sk_live_...:`
        // with nothing after the colon). Only the username is required.
        return typeof v.username === 'string' && v.username.length > 0 &&
          typeof v.password === 'string';
      case 'BEARER':
        return typeof v.token === 'string' && v.token.length > 0 &&
          (v.prefix === undefined || typeof v.prefix === 'string');
      case 'CUSTOM':
        return true;
      default:
        return false;
    }
  }
  //#endregion Validate options

  //#endregion Protected methods
}
