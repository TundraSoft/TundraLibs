import type { HTTPMethod, StatusCode } from '@tundralibs/compat/http';
import {
  type ServerMetrics,
  WebServer,
  type WebSocketHandler,
} from '@tundralibs/compat/webserver';
import { ulid } from '@tundralibs/id';
import { type ChannelOptions, Server as RpcServer } from '@tundralibs/rpc';
import { RadRouter } from '@tundralibs/radrouter';
import { extract, SpanKind } from '@tundralibs/tracer';
import { HTTPContext, SOCKETContext } from '../context/mod.ts';
import type { SOCKETConnection } from '../context/mod.ts';
import { asValidationError, RapidError } from '../errors/mod.ts';
import { represent } from '../ui/represent.ts';
import {
  compose,
  resolveVersion,
  serveStaticFile,
  socketOutcome,
} from '../utils/mod.ts';
import { isStreamBody } from '../utils/streams.ts';
import type {
  RapidChannelOptions,
  RapidContextResponse,
  RapidContextState,
  RapidRouteEntry,
} from '../types/mod.ts';
import { Transport } from './Transport.ts';

/** A pre-composed onion runner for an {@link HTTPContext}. */
type ComposedHTTPChain<S extends RapidContextState> = (
  ctx: HTTPContext<S>,
  next: () => void | Promise<void>,
) => void | Promise<void>;

/** A pre-composed onion runner for a {@link SOCKETContext}. */
type ComposedSocketChain<S extends RapidContextState> = (
  ctx: SOCKETContext<S>,
  next: () => void | Promise<void>,
) => void | Promise<void>;

/**
 * Per-connection websocket data, captured ONCE at upgrade — becomes the
 * `ctx.connection` envelope of every frame on that connection.
 */
type SocketData = {
  connectionId: string;
  /** Query params of the upgrade URL. */
  query: Readonly<Record<string, string>>;
  /** Headers of the upgrade request. */
  headers: Headers;
};

/**
 * Wrap a declared-response `parse` failure (the DEV-only response
 * contract check) as the 500 it is — a SERVER bug, not a client error,
 * so it must not reuse the 400 that `asValidationError` builds. A
 * guardian failure's per-field detail is carried over; anything else
 * keeps its message.
 */
function responseContractError(action: string, cause: unknown): RapidError {
  const validation = asValidationError(cause);
  const err = cause instanceof Error ? cause : undefined;
  return new RapidError('RAPID_RESPONSE_INVALID', {
    message:
      `'${action}' returned a reply that fails its declared response schema`,
    details: validation?.context.details ??
      { reason: err?.message ?? String(cause) },
    cause: err,
  });
}

/**
 * The HTTP transport: owns the compat WebServer and the radrouter,
 * builds an HTTPContext per request, and runs it through the shared
 * cycle. The router's generic M IS the {@link RapidRouteEntry} — one entry
 * per route, so a match hands back pattern + chain + handler at once.
 */
export class HTTPTransport<S extends RapidContextState = RapidContextState>
  extends Transport<S> {
  protected override _spanKind = SpanKind.SERVER;
  private __server?: WebServer<SocketData>;
  private readonly __router = new RadRouter<RapidRouteEntry<S>>({
    defaultVersion: this._app.option('server')?.versioning?.default,
    // The trailing-slash policy lives in the ROUTER (registration + lookup);
    // rapid only pre-strips the request path so path-mode versioning sees
    // the canonical form. Passing it through is what makes `false` real.
    ignoreTrailingSlash: this._app.option('server')?.ignoreTrailingSlash,
  });
  /**
   * Per-route composed onion, keyed by the SAME entry object radrouter
   * hands back on a match — the middleware list for a route never
   * changes after `start()`, so composing per request is pure waste.
   */
  private readonly __composedRoutes = new Map<
    RapidRouteEntry<S>,
    ComposedHTTPChain<S>
  >();
  /** Composed onion for an unmatched request (global middleware only). */
  private __composedNoMatch?: ComposedHTTPChain<S>;
  private __rpc?: RpcServer<SocketData>;
  private __prepared = false;

  public get address(): string | null {
    return this.__server?.address ?? null;
  }

  public get port(): number | null {
    return this.__server?.port ?? null;
  }

  /**
   * Per-request server metrics (request/status/latency + websocket
   * counters), or `undefined` before the listener is up. Populated only
   * when `server.metrics` is enabled — otherwise the compat server hands
   * back a zeroed structure.
   */
  public get metrics(): ServerMetrics | undefined {
    return this.__server?.metrics;
  }

  /**
   * Register routes on the router and start the listener.
   *
   * @throws {RapidError} RAPID_CONFIG when a route collides or is
   *   malformed (radrouter's duplicate/conflict detection, wrapped).
   */
  /**
   * Routes → router, every onion composed ONCE. Idempotent, and the
   * only prerequisite of {@link handle} — a listener is optional.
   */
  public prepare(): void {
    if (this.__prepared) return;
    // Routes registered on the app → the router. Collisions are
    // radrouter's loud errors, wrapped into our taxonomy. Each route's
    // onion (app middleware + its own) is composed ONCE here, keyed by
    // the same entry object radrouter will hand back on a match.
    for (const entry of this._app.routes) {
      try {
        this.__router.addRoute(
          entry.method,
          entry.path,
          [entry],
          entry.version,
        );
        this.__composedRoutes.set(
          entry,
          compose<S, HTTPContext<S>>(
            [
              ...this._app.middlewares,
              ...entry.middlewares,
            ] as unknown as readonly ComposedHTTPChain<S>[],
          ),
        );
      } catch (cause) {
        throw new RapidError('RAPID_CONFIG', {
          message: `Route registration failed: ${
            cause instanceof Error ? cause.message : String(cause)
          }`,
          details: {
            reason: cause instanceof Error ? cause.message : String(cause),
            method: entry.method,
            path: entry.path,
          },
          cause: cause instanceof Error ? cause : undefined,
        });
      }
    }
    // Auto-HEAD (default on): after every route is registered, give each
    // GET route a HEAD sibling it lacks. The synthesized entry reuses the
    // GET's handler + composed onion; the response is sent bodiless (see
    // HTTPContext._respond / serializeResponse's `head`). An explicit HEAD
    // route is left untouched — it registered above and wins here.
    if (this._app.option('server')?.autoHead !== false) {
      const has = new Set(
        this._app.routes.map((e) =>
          `${e.method}\0${e.path}\0${e.version ?? ''}`
        ),
      );
      for (const entry of this._app.routes) {
        if (entry.method !== 'GET') continue;
        if (has.has(`HEAD\0${entry.path}\0${entry.version ?? ''}`)) {
          continue;
        }
        const head: RapidRouteEntry<S> = { ...entry, method: 'HEAD' };
        this.__router.addRoute('HEAD', head.path, [head], head.version);
        // Same middleware as the GET → reuse its composed chain verbatim.
        this.__composedRoutes.set(head, this.__composedRoutes.get(entry)!);
      }
    }
    this.__composedNoMatch = compose<S, HTTPContext<S>>(
      [...this._app.middlewares] as unknown as readonly ComposedHTTPChain<S>[],
    );
    this.__prepared = true;
  }

  /** Open the listener (TCP or UNIX) and serve through {@link handle}. */
  public async listen(): Promise<void> {
    this.prepare();
    const server = this._app.option('server')!;
    // Websocket commands mount the rpc server INTO this listener (one
    // server, one port, one TLS config) — only when commands exist.
    const websocket =
      this._app.socketCommands.length > 0 || this._app.channels.size > 0
        ? this.__buildSocket(server.socketPath ?? '/ws')
        : undefined;

    this.__server = server.unixSocketPath !== undefined
      ? new WebServer(this._app.option('name'), {
        mode: 'UNIX',
        unixSocketPath: server.unixSocketPath,
        metrics: server.metrics,
        handler: (request, info) => this.handle(request, info.remoteAddress),
        websocket,
      })
      : new WebServer(this._app.option('name'), {
        mode: 'TCP',
        port: server.port,
        hostname: server.hostname,
        tls: server.tls,
        metrics: server.metrics,
        handler: (request, info) => this.handle(request, info.remoteAddress),
        websocket,
      });
    await this.__server.start();
  }

  public start(): Promise<void> {
    return this.listen();
  }

  /**
   * Build the mounted rpc server: path-gated upgrade minting a
   * per-connection id, every registered command dispatched through the
   * shared invocation cycle (ambient scope, SERVER span named by the
   * command, error disclosure by mode).
   */
  private __buildSocket(socketPath: string): WebSocketHandler<SocketData> {
    const rpc = new RpcServer<SocketData>({
      upgrade: (request) => {
        const url = new URL(request.url);
        if (url.pathname !== socketPath) return false;
        // Connection-scope capture: everything ctx.connection carries
        // exists only HERE, at upgrade time.
        return {
          data: {
            connectionId: ulid(),
            query: Object.freeze(Object.fromEntries(url.searchParams)),
            headers: request.headers,
          },
        };
      },
    });
    for (const entry of this._app.socketCommands) {
      // Composed ONCE per command — the universal onion runs per
      // FRAME, then the COMMAND'S own chain (same composition order
      // as HTTP's route chains; base-typed, cast bridges S) — but the
      // list itself never changes between frames on the same command.
      const chain = compose<S, SOCKETContext<S>>(
        [
          ...this._app.middlewares,
          ...entry.middlewares,
        ] as unknown as readonly ComposedSocketChain<S>[],
      );
      rpc.command(entry.command, undefined, async (c) => {
        const data = c.ws.data;
        const ctx = new SOCKETContext<S>(this._app, {
          connection: {
            id: data?.connectionId ?? 'unknown',
            query: data?.query ?? {},
            headers: data?.headers ?? new Headers(),
          },
          command: c.cmd,
          payload: c.payload,
          frameId: c.id,
        });
        await this._invoke<SOCKETContext<S>>(
          ctx,
          chain,
          async () => {
            // Enforce the object-payload contract for EVERY command —
            // args validation throws inside the cycle (logged, error
            // envelope), even for handlers that never read args.
            void ctx.args;
            const returned = await entry.handler(ctx);
            if (returned !== undefined && ctx.response === null) {
              ctx.response = returned;
            }
          },
        );
        let outcome: { status: StatusCode; content: unknown };
        try {
          outcome = ctx.respond();
        } catch (error) {
          // Parity with HTTP __finalize and JOB __run: an early
          // respond() (a middleware breaking the contract) becomes a
          // uniform disclosure envelope, never a raw throw into rpc.
          const err = RapidError.from(error);
          this._app.log.error('socket finalization failed', {
            requestId: ctx.requestId,
            command: entry.command,
            code: err.code,
          });
          outcome = {
            status: err.status,
            content: { code: err.code, message: 'Internal server error' },
          };
        }
        if (outcome.status >= 400) {
          // Ride rpc's error envelope. A FRAMEWORK failure carries its
          // own code/message; a HANDLER-authored one (a 422 with field
          // errors) gets a status-derived code and keeps its content as
          // `data`, so sockets and HTTP report the same thing.
          const envelope = socketOutcome(outcome.status, outcome.content);
          throw Object.assign(new Error(envelope.message), {
            code: envelope.code,
            ...(envelope.data === undefined ? {} : { data: envelope.data }),
          });
        }
        return outcome.content;
      });
    }
    // Pub/sub channels declared via app.channel() — adapt each rapid
    // ChannelOptions to rpc's (mapping the connection's SocketData to a
    // SOCKETConnection). Clients subscribe over this same /ws socket.
    for (const [name, opts] of this._app.channels) {
      rpc.channel(name, this.__adaptChannel(opts));
    }
    this.__rpc = rpc;
    return rpc.handlers();
  }

  /** Map a rapid {@link RapidChannelOptions} onto rpc's channel hooks. */
  private __adaptChannel(
    opts: RapidChannelOptions,
  ): ChannelOptions<SocketData> {
    const conn = (data: SocketData | undefined): SOCKETConnection => ({
      id: data?.connectionId ?? 'unknown',
      query: data?.query ?? {},
      headers: data?.headers ?? new Headers(),
    });
    return {
      ...(opts.authorize
        ? { authorize: (c) => opts.authorize!(conn(c.ws.data)) }
        : {}),
      ...(opts.onSubscribe
        ? { onSubscribe: (c) => opts.onSubscribe!(conn(c.ws.data)) }
        : {}),
      ...(opts.onUnsubscribe
        ? { onUnsubscribe: (c) => opts.onUnsubscribe!(conn(c.ws.data)) }
        : {}),
    };
  }

  /** Whether a websocket/rpc listener is mounted (channels + commands need it). */
  public get hasSocketListener(): boolean {
    return this.__rpc !== undefined;
  }

  /** Declare a channel on the live rpc server (post-start app.channel()). */
  public declareChannel(name: string, opts: RapidChannelOptions): void {
    this.__rpc?.channel(name, this.__adaptChannel(opts));
  }

  /** Server-initiated publish; no-op until the socket listener is up. */
  public publish(channel: string, data: unknown): Promise<void> {
    return this.__rpc?.publish(channel, data) ?? Promise.resolve();
  }

  public async stop(drainMs = 0): Promise<void> {
    const server = this.__server;
    this.__server = undefined;
    this.__rpc = undefined;
    if (server === undefined) return;
    // `drainMs > 0` (a configured graceful window): drain in-flight requests
    // for up to `drainMs`, then force-close the rest. A mounted websocket
    // never "drains" — it is held until the deadline and then force-closed,
    // so `drainMs` also bounds how long a live socket delays shutdown.
    // `drainMs === 0` (no window): force-close immediately, as before.
    if (drainMs > 0) await server.stop(true, drainMs);
    else await server.stop(false);
  }

  /**
   * The fetch handler: one `Request` in, one `Response` out, no socket
   * involved. {@link listen} feeds it from the WebServer;
   * `Application.fetch()` feeds it directly (Workers, `Deno.serve`,
   * `Bun.serve`, in-process tests). Requires {@link prepare}.
   */
  public handle(
    request: Request,
    remoteAddress: string | null,
  ): Response | Promise<Response> {
    if (!this.__prepared) {
      throw new RapidError('RAPID_CONFIG', {
        message: 'HTTPTransport.handle() called before prepare()',
      });
    }
    const serverOptions = this._app.option('server')!;
    const method = request.method.trim().toUpperCase() as HTTPMethod;
    // `new URL(...).pathname` — NOT a raw substring scan: it also
    // resolves dot-segments (`/a/../b` → `/b`). `Deno.serve` (unlike
    // Bun/Node) delivers `request.url` UN-normalized, so scanning it
    // would route `/a/../b` differently per runtime. The query is still
    // parsed only lazily, when a handler reads `ctx.args`.
    let rawPathname = new URL(request.url).pathname;
    // Trailing slash (ignored by default): strip it so `/users/` routes as
    // `/users`; the root `/` is left alone. Applied BEFORE version
    // resolution so a `path`-mode version segment and static prefixes see
    // the canonical form. (The router is slash-insensitive regardless.)
    if (
      serverOptions.ignoreTrailingSlash !== false &&
      rawPathname.length > 1 && rawPathname.endsWith('/')
    ) {
      rawPathname = rawPathname.slice(0, -1);
    }
    // Version + the pathname to route on, per the configured mode
    // (header/accept/path). `path` mode strips the version segment so the
    // router (and static/OpenAPI) see a clean path. Absent version →
    // undefined, resolved by the router's own exact → defaultVersion →
    // unversioned fallback — NOT re-defaulted here.
    const { version, pathname } = resolveVersion(
      request.headers,
      rawPathname,
      serverOptions.versioning!,
    );
    const match = this.__router.find(method, pathname, version);
    const entry = match?.middlewares[0];

    const requestIdHeader = serverOptions.requestIdHeader!;
    const ctx = new HTTPContext<S>(this._app, {
      request,
      remoteAddress: remoteAddress ?? '',
      params: match?.params ?? {},
      // Matched route PATTERN as identity (low cardinality); the raw
      // pathname only when nothing matched. Supplied for BOTH cases from
      // the pathname already in hand, so the context ctor's no-match
      // fallback (a second `new URL`) never runs.
      action: `${method} ${entry !== undefined ? entry.path : pathname}`,
      matched: entry !== undefined,
      ...(entry?.template !== undefined ? { template: entry.template } : {}),
      // The transport knows WHERE to look; the app owns the POLICY.
      requestId: this._app.newRequestId(request.headers.get(requestIdHeader)),
    });

    // Correlation echo at cycle START — every response carries it,
    // including 404s and errors (framework-owned, no middleware needed).
    ctx.setHeader(requestIdHeader, ctx.requestId);

    // The return-value channel: applied only when nothing was set. A
    // SYNC handler stays sync (no await) — the whole request then
    // finalizes without allocating a promise; an async handler takes
    // the thenable branch, same behaviour as before. A templated route
    // runs the representer here — the innermost onion point, so every
    // middleware's post-next() view sees the final HTML (represent() is
    // synchronous, preserving the sync fast path).
    const apply = (
      returned: RapidContextResponse | void,
    ): void | Promise<void> => {
      if (returned === undefined || ctx.response !== null) return;
      // A `null` return means "no body" (→ 204) on templated routes
      // too — only a real reply is represented.
      const commit = (): void => {
        // A ui.enabled:false replica short-circuits representation
        // entirely — templated routes serve their content as JSON.
        ctx.response = returned !== null && entry?.template !== undefined &&
            this._app.uiEnabled
          ? represent(returned, entry.template, ctx)
          : returned;
      };
      // DEV-only response contract: a parse-capable declared response
      // schema (`@GET(..., { response: Schema })` / `openapi.response`)
      // checks the DATA reply — before representation, on the success
      // shape only (2xx or unset status, no redirect, not bytes/stream).
      // Enforce, never transform: the reply goes out as returned, so a
      // stripping/coercing schema cannot change PRODUCTION behavior.
      // Ordered so PRODUCTION pays one `undefined` check per request.
      const schema = entry?.openapi?.response;
      if (
        schema?.parse !== undefined && returned !== null &&
        returned.redirect === undefined &&
        (returned.status === undefined ||
          (returned.status >= 200 && returned.status < 300)) &&
        !(returned.content instanceof Uint8Array) &&
        !isStreamBody(returned.content) &&
        this._app.mode === 'DEVELOPMENT'
      ) {
        const fail = (cause: unknown): never => {
          throw responseContractError(ctx.action, cause);
        };
        let parsed: unknown;
        try {
          parsed = schema.parse(returned.content);
        } catch (cause) {
          fail(cause);
        }
        if (
          parsed !== null && typeof parsed === 'object' &&
          typeof (parsed as { then?: unknown }).then === 'function'
        ) {
          return (parsed as Promise<unknown>).then(() => commit(), fail);
        }
      }
      commit();
    };
    const dispatch: () => void | Promise<void> = entry !== undefined
      ? () => {
        const returned = entry.handler(ctx);
        // `!= null` (not `!== undefined`): a handler that returns `null`
        // must NOT reach `.then` on it (that throws) — it falls through to
        // `apply`, which clears to a 204 just like a `void`/`0`/`''`
        // return. Only a real thenable takes the async branch.
        if (
          returned != null &&
          typeof (returned as Promise<RapidContextResponse | void>).then ===
            'function'
        ) {
          return (returned as Promise<RapidContextResponse | void>).then(apply);
        }
        return apply(returned as RapidContextResponse | void);
      }
      : async () => {
        // A catch-all middleware still wins (preserve the old `??=`).
        if (ctx.response !== null) return;
        // Config-driven static (`server.static`) serves HERE — on route
        // miss, before the 404 — so routes always win a collision, every
        // outer middleware has already run, and routed requests never
        // pay a stat(). Entries try in declaration order.
        const mounts = this._app.staticMounts;
        if (mounts.length > 0 && (method === 'GET' || method === 'HEAD')) {
          for (const mount of mounts) {
            if (await serveStaticFile(ctx, mount)) return;
          }
        }
        // 405 / generic OPTIONS: the PATH exists under other methods. Gated
        // by server.methodNotAllowed (off → a wrong method is a plain 404,
        // hiding the path's existence). One radrouter walk, miss-path only.
        if (serverOptions.methodNotAllowed === true) {
          const methods = this.__router.allowedMethods(pathname, version);
          if (methods.length > 0) {
            // We answer OPTIONS ourselves, so advertise it in Allow too.
            const allow = methods.includes('OPTIONS')
              ? methods
              : [...methods, 'OPTIONS'];
            ctx.setHeader('allow', allow.join(', ')); // survives disclosure
            if (method === 'OPTIONS') {
              // 204 is a null-body status — serializeResponse drops the ''
              // body; the accumulated Allow + requestId headers remain.
              ctx.response = { status: 204, content: '' };
              return;
            }
            throw new RapidError('RAPID_METHOD_NOT_ALLOWED', {
              message: 'Method not allowed',
              details: { allow },
            });
          }
        }
        // Nothing matched at all → 404 through the disclosure path (→
        // RapidError.from → app.onError), so the hook can theme it and the
        // body matches every other framework error. Byte-identical default.
        throw new RapidError('RAPID_NOT_FOUND', { message: 'Not found' });
      };

    const chain = entry !== undefined
      ? this.__composedRoutes.get(entry)!
      : this.__composedNoMatch!;

    // Finalization (respond + cleanup) runs as `_invoke`'s `finalize`
    // step — the SAME ambient scope as the onion, not a second one, so
    // its logs stay correlated without a second AsyncLocalStorage entry.
    // Span attributes are read ONLY when a tracer is active — build them (and
    // the parent context) only then, so the common no-tracer request allocates
    // neither. The route TEMPLATE, never the raw (attacker-controlled) path,
    // keeps `http.route` low-cardinality (OTel semconv; mirrors __identity).
    const tracing = this._app.tracer !== undefined;
    return this._invoke(
      ctx,
      chain,
      dispatch,
      tracing ? extract(request.headers) : undefined,
      tracing
        ? {
          'http.request.method': method,
          'http.route': entry !== undefined ? entry.path : '<unmatched>',
        }
        : undefined,
      () => this.__finalize(ctx, requestIdHeader),
    );
  }

  private __finalize(
    ctx: HTTPContext<S>,
    requestIdHeader: string,
  ): Response | Promise<Response> {
    // Reply `cookies` apply right before respond(). SYNC-THROUGH: a plain
    // request (no reply cookies, or only unsigned ones) gets `undefined`
    // back and finalizes fully synchronously; only a SIGNED reply cookie
    // (async HMAC) yields a promise, and only then do we go async.
    //
    // _applyReplyCookies() can THROW (an illegal reply-cookie name reaches
    // serializeCookie) or REJECT (signed variant). finalize runs OUTSIDE the
    // onion's disclose() try, so an unguarded throw here would escape as a raw
    // 500 / unhandled rejection, bypassing the disclosure envelope every other
    // response path gets — catch it and surface it through the same model.
    let signing: void | Promise<void>;
    try {
      signing = ctx._applyReplyCookies();
    } catch (error) {
      return this.__errorResponse(ctx, error, requestIdHeader);
    }
    if (signing !== undefined) {
      return signing.then(
        () => this.__materialize(ctx, requestIdHeader),
        (error) => this.__errorResponse(ctx, error, requestIdHeader),
      );
    }
    return this.__materialize(ctx, requestIdHeader);
  }

  /**
   * Build the disclosure `Response` for a finalize-time failure (a reply-cookie
   * apply or a respond()/serialization throw), through the same model the
   * onion uses. Seeds from `ctx.responseHeaders` so headers already accumulated
   * (a queued `Set-Cookie`, CORS/security headers) survive — the success path
   * keeps them, so the error path must too.
   */
  private __errorResponse(
    ctx: HTTPContext<S>,
    error: unknown,
    requestIdHeader: string,
  ): Response {
    const err = RapidError.from(error);
    this._app.log.error('response finalization failed', {
      requestId: ctx.requestId,
      code: err.code,
      stack: err.stack,
    });
    const payload = err.payload(this._app.mode);
    const headers = ctx.responseHeaders;
    headers.set('content-type', 'application/json');
    headers.set(requestIdHeader, ctx.requestId);
    return new Response(
      JSON.stringify(
        typeof payload === 'object' && payload !== null
          ? { ...payload, requestId: ctx.requestId }
          : { message: payload, requestId: ctx.requestId },
      ),
      { status: err.status, headers },
    );
  }

  /** The respond() + cleanup half of finalize, sync-through (see above). */
  private __materialize(
    ctx: HTTPContext<S>,
    requestIdHeader: string,
  ): Response | Promise<Response> {
    let response: Response;
    try {
      response = ctx.respond();
    } catch (error) {
      // respond() itself failing (bad status, serialization) must NOT escape
      // into the WebServer as a raw handler rejection — surface it through the
      // same disclosure model, keeping the accumulated headers (see
      // __errorResponse: a just-queued Set-Cookie must not vanish).
      response = this.__errorResponse(ctx, error, requestIdHeader);
    }
    // Cleanup (settle a still-in-flight body parse, unlink upload temp files)
    // runs AFTER the response — and must NOT delay it, as the client gains
    // nothing from waiting on `unlink()`s. Nothing to clean → return
    // synchronously; otherwise DETACH it (fire-and-forget; `detach` absorbs
    // the rejection, and `cleanup()` logs its own per-file failures) so the
    // response flushes immediately. Upload temp files live only on
    // Deno/Bun/Node, where a background task settles fine, and `app.stop()`
    // removes the owned upload dir regardless.
    if (ctx.hasPendingCleanup) ctx.detach(ctx.cleanup());
    return response;
  }
}
