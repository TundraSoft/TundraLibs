import { deleteFile } from '@tundralibs/compat/file';
import type { HTTPMethod } from '@tundralibs/compat/http';
import type { Application } from '../Application.ts';
import {
  pagingFromHeaders,
  pagingFromQuery,
  parseBody,
  parsePaging,
  parseQueryFilters,
  resolveClientAddress,
  type ResolvedClientAddress,
  serializeResponse,
} from '../utils/mod.ts';
import type {
  RapidContextArgs,
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

export class HTTPContext<S extends RapidContextState = RapidContextState>
  extends Context<S, Response> {
  public readonly type = 'HTTP';
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
  protected readonly _fileUploads: string[] = [];
  protected readonly _headers: Headers = new Headers();

  get headers(): Headers {
    return this.request.headers;
  }

  get method(): HTTPMethod {
    // Uppercased at read; the fetch layer guarantees a valid verb, so
    // the assertion narrows string → the compat union.
    return this.request.method.trim().toUpperCase() as HTTPMethod;
  }

  get url(): string {
    return this.request.url;
  }

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
   * the paging window (headers first, query params override). Built on
   * first access.
   *
   * @throws {RapidError} RAPID_QUERY_INVALID (400) when the query
   *   exceeds a structural cap — first access only.
   */
  public get args(): Readonly<RapidContextArgs> {
    if (this.__args === undefined) {
      const server = this.app.option('server')!;
      const url = new URL(this.request.url);
      const query = parseQueryFilters(url.searchParams, server.query);
      const paging = parsePaging(
        server.paging ?? {},
        pagingFromHeaders(this.request.headers, server.paging ?? {}),
        pagingFromQuery(url.searchParams),
      );
      this.__args = Object.freeze({
        // Frozen — including query/paging's own nested collections, not
        // just the top level — so the advertised Readonly holds at
        // runtime for all of args, not just params (L4's original fix).
        params: Object.freeze(this.params),
        query: Object.freeze({
          filters: Object.freeze(query.filters),
          sorting: Object.freeze(query.sorting),
        }),
        paging: Object.freeze(paging),
      });
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
      uploads: { ...uploads, path: uploads.path! },
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
    return serializeResponse(this._content, this._status, this._headers);
  }
}
