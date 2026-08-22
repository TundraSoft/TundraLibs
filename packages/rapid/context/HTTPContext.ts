/**
 * @fileoverview `HTTPContext` — the HTTP transport's per-request context.
 * Wraps the inbound Fetch `Request`, exposes headers/method/url and the
 * lazily-parsed query, cookies, and body, resolves the client address,
 * and interprets the full `status`/`headers` response — materializing a
 * Fetch `Response` at {@link HTTPContext.respond}. Also carries the
 * file-serving, redirect, and cookie helpers.
 *
 * @module
 */

import { deleteFile, FileNotFound, stat } from '@tundralibs/compat/file';
import type { HTTPMethod, StatusCode } from '@tundralibs/compat/http';
import type { Application } from '../Application.ts';
import { RapidError } from '../errors/mod.ts';
import {
  type CookieOptions,
  fileStream,
  mimeTypeFor,
  negotiate,
  pagingFromHeaders,
  pagingFromQuery,
  parseBody,
  parseCookies,
  parsePaging,
  parseQueryFilters,
  resolveClientAddress,
  type ResolvedClientAddress,
  serializeCookie,
  serializeResponse,
  signValue,
  type SseEvent,
  sseStream,
  verifySignedValue,
} from '../utils/mod.ts';
import type {
  RapidContextArgs,
  RapidContextPaging,
  RapidContextQuery,
  RapidContextResponse,
  RapidContextState,
  RapidHTTPRequestBody,
} from '../types/mod.ts';
import { Context } from './Context.ts';

/** Construction data for an {@link HTTPContext}. */
export type HTTPContextInit = {
  /** The inbound Fetch-standard request. */
  request: Request;
  /** Transport-reported peer address ('' when unavailable/unix). */
  remoteAddress: string;
  /** Route params from the matched pattern; empty until matched. */
  params?: Readonly<Record<string, string>>;
  /**
   * Invocation identity — the transport passes the MATCHED route
   * pattern (`GET /users/:id:`); defaults to method + raw pathname.
   */
  action?: string;
  /** Whether a route matched (see {@link HTTPContext.matched}). */
  matched?: boolean;
  /**
   * Correlation id — the transport sources the inbound candidate and
   * validates it through `app.newRequestId()`. Minted when absent.
   */
  requestId?: string;
};

/**
 * The HTTP transport context — one per request. Adopts the inbound
 * request's correlation header, parses body/query/cookies/client-address
 * lazily (most requests touch few of them), and interprets the full
 * `status`/`headers` response, emitting a Fetch `Response` at
 * {@link respond}.
 */
export class HTTPContext<S extends RapidContextState = RapidContextState>
  extends Context<S, Response> {
  /** The transport discriminator — always `'HTTP'`. */
  public readonly type = 'HTTP';
  /** The inbound Fetch-standard request. */
  public readonly request: Request;
  /** Transport-reported peer address, unresolved — see {@link remoteAddress}. */
  private readonly __rawRemoteAddress: string;
  /**
   * Lazy cache for {@link remoteAddress}/{@link remoteAddrList} — the
   * resolution (regex + a CIDR scan) runs on FIRST access of either,
   * not unconditionally for every request, since most handlers never
   * read the client address at all.
   */
  private __resolvedAddress: ResolvedClientAddress | undefined = undefined;
  /** Route params from the matched pattern (`/users/:id:` → `{ id }`). */
  public readonly params: Readonly<Record<string, string>>;
  /**
   * Whether a registered route matched this request. When `false`,
   * {@link Context.action} is the RAW pathname — attacker-controlled
   * input; middleware feeding action into metrics/log labels should
   * check this first (cardinality + injection).
   */
  public readonly matched: boolean;
  /**
   * The parse, cached AS A PROMISE on first {@link payload} access — so
   * concurrent first readers share ONE stream read (the body stream is
   * single-shot), and a parse FAILURE replays to every awaiter instead
   * of a second read of a consumed stream.
   */
  private __payloadPromise: Promise<RapidHTTPRequestBody> | undefined =
    undefined;
  /** Lazy args cache — see the base {@link Context.args} contract. */
  private __args: Readonly<RapidContextArgs> | undefined = undefined;
  /** Lazy parsed inbound cookies — see {@link cookies}. */
  private __cookies: Record<string, string> | undefined = undefined;
  /** Reply `cookies` awaiting the async apply — see {@link _applyReplyCookies}. */
  private __replyCookies: RapidContextResponse['cookies'] | undefined =
    undefined;
  protected readonly _fileUploads: string[] = [];
  protected readonly _headers: Headers = new Headers();

  /** The inbound request headers. */
  get headers(): Headers {
    return this.request.headers;
  }

  /**
   * Content negotiation: given the media types this handler can produce, return
   * the client's best match for the `Accept` header (by q-value; the
   * most-specific `Accept` entry decides an offer's quality; ties resolve to
   * the earliest offered = server preference), or `undefined` when the client
   * accepts none. No `Accept` header → the first offered. Offers must be full
   * `type/subtype` media types.
   *
   * @example
   * ```ts ignore
   * const type = ctx.accepts('application/json', 'text/html');
   * return type === 'text/html'
   *   ? { content: render(), headers: { 'content-type': 'text/html' } }
   *   : { content: data };
   * ```
   */
  accepts(...offered: string[]): string | undefined {
    return negotiate(this.headers.get('accept'), offered);
  }

  /** The request method, uppercased and narrowed to the compat {@link HTTPMethod} union. */
  get method(): HTTPMethod {
    // Uppercased at read; the fetch layer guarantees a valid verb, so
    // the assertion narrows string → the compat union.
    return this.request.method.trim().toUpperCase() as HTTPMethod;
  }

  /** The full request URL. */
  get url(): string {
    return this.request.url;
  }

  /** Wrap the inbound request; default {@link Context.action} to method + pathname when unmatched. */
  constructor(app: Application<S>, init: HTTPContextInit) {
    const { request, remoteAddress } = init;
    super(app, {
      action: init.action ??
        `${request.method.trim().toUpperCase()} ${
          new URL(request.url).pathname
        }`,
      requestId: init.requestId,
    });
    this.request = request;
    this.params = init.params ?? {};
    this.matched = init.matched ?? false;
    this.__rawRemoteAddress = remoteAddress;
  }

  /**
   * The resolved client address (trustProxy hop count) — see
   * {@link resolveClientAddress} for the security rationale. Resolved
   * on first access of either this or {@link remoteAddrList}, both
   * from ONE cached call — most handlers never read either.
   */
  get remoteAddress(): string {
    return this.__resolveAddress().address;
  }

  /** The full observed address chain (socket peer + trusted XFF hops). */
  get remoteAddrList(): readonly string[] {
    return this.__resolveAddress().chain;
  }

  private __resolveAddress(): ResolvedClientAddress {
    return this.__resolvedAddress ??= resolveClientAddress(
      this.__rawRemoteAddress,
      this.request.headers,
      this.app.option('server')!.trustProxy,
    );
  }

  /**
   * HTTP args: route params, the parsed query (filters + sorting), and
   * the paging window (headers first, query params override). `params`
   * is immediate (known from the route match); `query` and `paging`
   * parse LAZILY — each on first read, once — so a handler that touches
   * only `params` pays for neither.
   *
   * @throws {RapidError} RAPID_QUERY_INVALID (400) when the query
   *   exceeds a structural cap — thrown on the FIRST read of `.query`
   *   (deferred with the parse), not on `args`/`params` access.
   */
  public get args(): Readonly<RapidContextArgs> {
    if (this.__args === undefined) {
      const server = this.app.option('server')!;
      const request = this.request;
      // `query` and `paging` PARSE LAZILY, each on first read. A handler
      // that only wants `args.params` — already known from the route
      // match — never pays the query-filter/paging parse (the single
      // biggest per-request cost) it didn't ask for. The URL is parsed
      // once, shared, and only when query or paging is actually touched.
      let query: RapidContextQuery | undefined;
      let paging: RapidContextPaging | undefined;
      let searchParams: URLSearchParams | undefined;
      const getSearchParams =
        (): URLSearchParams => (searchParams ??=
          new URL(request.url).searchParams);
      this.__args = Object.freeze({
        // Frozen — including query/paging's own nested collections, not
        // just the top level — so the advertised Readonly holds at
        // runtime for all of args, not just params (L4's original fix).
        params: Object.freeze(this.params),
        get query(): RapidContextQuery {
          if (query === undefined) {
            const parsed = parseQueryFilters(getSearchParams(), server.query);
            query = Object.freeze({
              filters: Object.freeze(parsed.filters),
              sorting: Object.freeze(parsed.sorting),
            });
          }
          return query;
        },
        get paging(): RapidContextPaging {
          if (paging === undefined) {
            paging = Object.freeze(parsePaging(
              server.paging ?? {},
              pagingFromHeaders(request.headers, server.paging ?? {}),
              pagingFromQuery(getSearchParams()),
            ));
          }
          return paging;
        },
      }) as Readonly<RapidContextArgs>;
    }
    return this.__args;
  }

  /**
   * The parsed request body — parse-once, byte-capped (see
   * {@link parseBody} for caps and the upload gauntlet). The parse starts on FIRST access
   * and every later access (even concurrent) shares it: results and
   * failures alike replay from the cached promise, never from a second
   * read of the consumed stream.
   *
   * @throws {RapidError} As a REJECTION of the returned promise:
   *   RAPID_PAYLOAD_TOO_LARGE (over a byte cap),
   *   RAPID_VALIDATION_FAILED (malformed JSON), or
   *   RAPID_UNSUPPORTED_MEDIA (upload gauntlet).
   */
  public override get payload(): Promise<RapidHTTPRequestBody> {
    this.__payloadPromise ??= this.__parsePayload();
    return this.__payloadPromise;
  }

  private async __parsePayload(): Promise<RapidHTTPRequestBody> {
    const server = this.app.option('server')!;
    const uploads = this.app.option('uploads')!;
    const { value, files } = await parseBody(this.request, {
      maxBodySize: server.maxBodySize!,
      uploads: { ...uploads, path: uploads.path },
    });
    // Track written uploads so cleanup() removes them post-response.
    this._fileUploads.push(...files);
    return value;
  }

  /**
   * Temp paths of uploaded files (a COPY) — populated once
   * {@link payload} resolves; deleted by {@link cleanup} after the
   * response.
   */
  public get files(): readonly string[] {
    return [...this._fileUploads];
  }

  /**
   * Whether {@link cleanup} has anything to do — a body parse still to
   * settle, or upload temp files to delete. When `false` the transport
   * skips awaiting cleanup entirely, so a request that never touched the
   * body (the common case) finalizes without an extra microtask.
   */
  public get hasPendingCleanup(): boolean {
    return this.__payloadPromise !== undefined || this._fileUploads.length > 0;
  }

  /**
   * Build a response that SERVES a file: read its bytes and set the
   * content-type from the extension (HTML/CSS/JS/images/… via
   * {@link mimeTypeFor}; unknown → `application/octet-stream`). Return it
   * from a handler — `return await ctx.serve('./public/index.html')` — or
   * assign it to {@link response}. `download` sends it as an attachment.
   *
   * Reads the whole file into memory (no range/streaming yet — that's the
   * static-serving roadmap item). A missing or non-file path is a 404.
   *
   * @throws {RapidError} RAPID_NOT_FOUND when `path` is not an existing
   *   regular file.
   */
  public async serve(
    path: string,
    options: {
      status?: StatusCode;
      /** Override the extension-derived content-type. */
      contentType?: string;
      /** `true` → attachment named after the file; a string → that name. */
      download?: boolean | string;
    } = {},
  ): Promise<RapidContextResponse> {
    // Stat first (size → a correct content-length, and the 404 for a missing
    // or non-file path), then STREAM the body — the file is never buffered.
    let size: number;
    let isFile: boolean;
    try {
      ({ size, isFile } = await stat(path));
    } catch (error) {
      // A missing path is a 404; a real read failure (permissions, I/O)
      // propagates to the 500 disclosure path.
      if (error instanceof FileNotFound) {
        throw new RapidError('RAPID_NOT_FOUND', {
          details: { path },
          cause: error,
        });
      }
      throw error;
    }
    if (!isFile) {
      // A directory / special file is not servable — a 404, not a read error.
      throw new RapidError('RAPID_NOT_FOUND', { details: { path } });
    }
    const content = await fileStream(path);
    const headers: Record<string, string> = {
      'content-type': options.contentType ?? mimeTypeFor(path),
      'content-length': String(size),
    };
    if (options.download !== undefined && options.download !== false) {
      const raw = typeof options.download === 'string'
        ? options.download
        : path.slice(
          Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\')) + 1,
        );
      // Strip quotes/CR/LF so a filename can't break out of the header.
      const name = raw.replace(/["\r\n]/g, '');
      headers['content-disposition'] = `attachment; filename="${name}"`;
    }
    return { content, status: options.status ?? 200, headers };
  }

  /**
   * Build a Server-Sent Events response: each event yielded by `events` is
   * framed per the SSE spec and streamed (`text/event-stream`, no buffering,
   * caching disabled). A client disconnect cancels the stream, which returns
   * the source iterator so an `async function*`'s `finally` runs — the place
   * to unsubscribe. Return it from a handler: `return ctx.sse(ticker())`.
   *
   * @example
   * ```ts ignore
   * app.get('/events', (ctx) =>
   *   ctx.sse((async function* () {
   *     for (let i = 0; i < 3; i++) {
   *       yield { event: 'tick', data: { i } };
   *       await new Promise((r) => setTimeout(r, 1000));
   *     }
   *   })()));
   * ```
   */
  public sse(events: AsyncIterable<SseEvent>): RapidContextResponse {
    return {
      content: sseStream(events),
      headers: {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
        connection: 'keep-alive',
      },
    };
  }

  /**
   * Build an HTML response from an inline string (`content-type:
   * text/html`). For a file on disk use {@link serve} instead.
   */
  public html(content: string, status: StatusCode = 200): RapidContextResponse {
    return {
      content,
      status,
      // Same casing @std/media-types uses, so serve()/html() agree.
      headers: { 'content-type': 'text/html; charset=UTF-8' },
    };
  }

  /**
   * Build a redirect response: `302 Found` by default, `301 Moved
   * Permanently` when `permanent` is true. Return it from a handler
   * (`return ctx.redirect('/login')`). Equivalent to returning
   * `{ content: '', redirect: { url, permanent } }` — the reply key is the
   * transport-blind form a module method can use without `ctx`.
   */
  public redirect(url: string, permanent = false): RapidContextResponse {
    // Fully formed (status + location inline) so the object is correct when
    // read directly, AND carries the `redirect` key so the setter derives the
    // same values — idempotent either way.
    return {
      status: permanent ? 301 : 302,
      content: '',
      headers: { location: url },
      redirect: { url, permanent },
    };
  }

  /**
   * Inbound cookies as a name → value map (values percent-decoded),
   * parsed once from the `Cookie` header on first access.
   */
  public get cookies(): Readonly<Record<string, string>> {
    return this.__cookies ??= parseCookies(this.request.headers.get('cookie'));
  }

  /**
   * Queue a `Set-Cookie` on the outbound response (appended, so multiple
   * cookies coexist). Frozen after {@link respond}.
   *
   * @throws {RapidError} RAPID_RESPONSE_INVALID after {@link respond}.
   * @throws {Error} When `name` is not a legal cookie name.
   */
  public setCookie(
    name: string,
    value: string,
    options: CookieOptions = {},
  ): void | Promise<void> {
    if (options.signed === true) {
      // Signing is async (HMAC) — await the returned promise. The secret is
      // read up front so a missing one fails here, not inside the promise.
      const secret = this.app.secret;
      return signValue(value, secret).then((signed) => {
        this.appendHeader('set-cookie', serializeCookie(name, signed, options));
      });
    }
    this.appendHeader('set-cookie', serializeCookie(name, value, options));
  }

  /**
   * Read a cookie set with `{ signed: true }`: verifies the HMAC against the
   * app `secret` and returns the bare value, or `undefined` when the cookie
   * is missing, unsigned, or forged. Tamper-evident by construction — a
   * client cannot alter the value without invalidating it.
   *
   * @throws {RapidError} RAPID_CONFIG when no app `secret` is configured.
   */
  public signedCookie(name: string): Promise<string | undefined> {
    return verifySignedValue(this.cookies[name], this.app.secret);
  }

  /**
   * Apply the reply `cookies` key captured by the response setter, just
   * before the sync {@link respond}. SYNC-THROUGH: returns `undefined` when
   * there is nothing pending (the common case) so the hot path stays
   * promise-free; returns a promise only when a cookie must be signed
   * (async HMAC). Idempotent: drains the pending list.
   *
   * @internal Called by the HTTP transport's finalize.
   */
  public _applyReplyCookies(): void | Promise<void> {
    const pending = this.__replyCookies;
    if (pending === undefined) return;
    this.__replyCookies = undefined;
    // Plain cookies apply synchronously; only a signed one yields a promise.
    let chain: Promise<void> | undefined;
    for (const c of pending) {
      const r = this.setCookie(c.name, c.value, c.options);
      if (r !== undefined) {
        chain = chain === undefined ? r : chain.then(() => r);
      }
    }
    return chain;
  }

  /**
   * Expire a cookie on the client — a `Set-Cookie` with an epoch expiry.
   * Pass the SAME `path`/`domain` the cookie was set with, or the
   * browser won't match it.
   *
   * @throws {RapidError} RAPID_RESPONSE_INVALID after {@link respond}.
   */
  public deleteCookie(
    name: string,
    options: Pick<CookieOptions, 'path' | 'domain'> = {},
  ): void {
    this.setCookie(name, '', {
      ...options,
      expires: new Date(0),
      maxAge: 0,
    });
  }

  /**
   * HTTP interprets the full payload: `content` via the base, `status`
   * (preserved across body-only overrides — a transform middleware
   * re-setting `content` without a status does NOT reset a 404/500 to
   * 200), `headers` merged per-key so an override never wipes middleware
   * contributions. `set-cookie` is appended (never collapsed).
   */
  public override set response(response: RapidContextResponse | null) {
    super.response = response;
    if (response === null) {
      this._status = 200; // cleared → back to the default
      return;
    }
    if (response.status !== undefined) this._status = response.status;
    // The reply `redirect` key wins over `status`: 302 (or 301 when
    // permanent) + a `location` header. Interpreted ONLY here — JOB/SOCKET
    // never see it, so it can't become a 3xx there.
    if (response.redirect !== undefined) {
      const r = response.redirect;
      const url = typeof r === 'string' ? r : r.url;
      this._status = typeof r !== 'string' && r.permanent === true ? 301 : 302;
      this._headers.set('location', url);
    }
    if (response.headers !== undefined) {
      const entries = response.headers instanceof Headers
        ? response.headers.entries()
        : Object.entries(response.headers);
      for (const [name, value] of entries) {
        if (name.toLowerCase() === 'set-cookie') {
          this._headers.append(name, value);
        } else {
          this._headers.set(name, value);
        }
      }
    }
    // The reply `cookies` key is captured, not applied: a signed cookie needs
    // an async HMAC, and this setter is sync. The transport's finalize awaits
    // `_applyReplyCookies()` before respond(). Later assignments add to it.
    if (response.cookies !== undefined && response.cookies.length > 0) {
      this.__replyCookies = [
        ...(this.__replyCookies ?? []),
        ...response.cookies,
      ];
    }
  }

  /**
   * The interpreted response, extras composed back in. `headers` is a
   * COPY — the same guard {@link responseHeaders} applies, so reading
   * the response cannot become a back door to mutating the live
   * outbound headers after {@link respond}.
   */
  public override get response(): Readonly<RapidContextResponse> | null {
    const base = super.response;
    return base === null ? null : {
      content: base.content,
      status: this._status,
      headers: new Headers(this._headers),
    };
  }

  /**
   * Set an outbound header (replace). Frozen after {@link respond}.
   *
   * @throws {RapidError} RAPID_RESPONSE_INVALID after {@link respond}.
   */
  public setHeader(name: string, value: string): void {
    this._assertNotResponded();
    this._headers.set(name, value);
  }

  /**
   * Remove an outbound header. Frozen after {@link respond}. The lever for a
   * header that was correct when set but no longer applies — e.g. `compress`
   * dropping a handler's `content-length` once the body is a stream whose
   * encoded size is unknowable. A no-op when the header is absent.
   *
   * @throws {RapidError} RAPID_RESPONSE_INVALID after {@link respond}.
   */
  public deleteHeader(name: string): void {
    this._assertNotResponded();
    this._headers.delete(name);
  }

  /**
   * Append an outbound header (multi-value — `set-cookie`). Frozen after
   * {@link respond}.
   *
   * @throws {RapidError} RAPID_RESPONSE_INVALID after {@link respond}.
   */
  public appendHeader(name: string, value: string): void {
    this._assertNotResponded();
    this._headers.append(name, value);
  }

  /**
   * Read access to the accumulated outbound headers — a COPY, so
   * mutating it cannot bypass the {@link setHeader}/{@link respond}
   * freeze on the live headers.
   */
  public get responseHeaders(): Headers {
    return new Headers(this._headers);
  }

  /**
   * Delete every temp file the body parse wrote. Runs after the
   * response is materialised, so it never delays the client.
   */
  public override async cleanup(): Promise<void> {
    // A parse still IN FLIGHT (a handler that read `ctx.payload` without
    // awaiting it, or a client that aborted mid-upload) has not pushed
    // its files yet — deleting now would find nothing and leave them on
    // disk forever. Wait for it to settle first; its failure is not
    // ours to report here.
    if (this.__payloadPromise !== undefined) {
      await this.__payloadPromise.catch(() => {});
    }
    for (const file of this._fileUploads) {
      // One undeletable file (already gone, permissions) must not
      // strand every file after it in the list.
      try {
        await deleteFile(file);
      } catch (error) {
        this._log.warn('upload cleanup failed', {
          file,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  protected _respond(): Response {
    // A HEAD request sends GET's status + headers (incl. a correct
    // content-length) with NO body — see serializeResponse's `head` arg.
    return serializeResponse(
      this._content,
      this._status,
      this._headers,
      this.method === 'HEAD',
    );
  }
}
