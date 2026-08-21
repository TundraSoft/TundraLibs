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
import { RapidError } from '../errors/mod.ts';
import { compose, resolveVersion, socketOutcome } from '../utils/mod.ts';
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

  /** Declare a channel on the live rpc server (post-start app.channel()). */
  public declareChannel(name: string, opts: RapidChannelOptions): void {
    this.__rpc?.channel(name, this.__adaptChannel(opts));
  }

  /** Server-initiated publish; no-op until the socket listener is up. */
  public publish(channel: string, data: unknown): Promise<void> {
    return this.__rpc?.publish(channel, data) ?? Promise.resolve();
  }

  public async stop(): Promise<void> {
    const server = this.__server;
    this.__server = undefined;
    this.__rpc = undefined;
    // Force-close (graceful=false): a mounted websocket is a long-lived
    // connection that never drains, so Bun's graceful stop would hang on
    // it forever (Deno's shutdown() already force-collapses). The app's
    // shutdownTimeout is the real graceful window.
    if (server !== undefined) await server.stop(false);
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
    const rawPathname = new URL(request.url).pathname;
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
      // The transport knows WHERE to look; the app owns the POLICY.
      requestId: this._app.newRequestId(request.headers.get(requestIdHeader)),
    });

    // Correlation echo at cycle START — every response carries it,
    // including 404s and errors (framework-owned, no middleware needed).
    ctx.setHeader(requestIdHeader, ctx.requestId);

    // The return-value channel: applied only when nothing was set. A
    // SYNC handler stays sync (no await) — the whole request then
    // finalizes without allocating a promise; an async handler takes
    // the thenable branch, same behaviour as before.
    const apply = (returned: RapidContextResponse | void): void => {
      if (returned !== undefined && ctx.response === null) {
        ctx.response = returned;
      }
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
        apply(returned as RapidContextResponse | void);
      }
      : () => {
        ctx.response ??= {
          status: 404,
          content: {
            code: 'RAPID_NOT_FOUND',
            message: 'Not found',
            requestId: ctx.requestId,
          },
        };
      };

    const chain = entry !== undefined
      ? this.__composedRoutes.get(entry)!
      : this.__composedNoMatch!;

    // Finalization (respond + cleanup) runs as `_invoke`'s `finalize`
    // step — the SAME ambient scope as the onion, not a second one, so
    // its logs stay correlated without a second AsyncLocalStorage entry.
    return this._invoke(
      ctx,
      chain,
      dispatch,
      this._app.tracer !== undefined ? extract(request.headers) : undefined,
      {
        'http.request.method': method,
        'http.route': entry?.path ?? pathname,
      },
      () => this.__finalize(ctx, requestIdHeader),
    );
  }

  private __finalize(
    ctx: HTTPContext<S>,
    requestIdHeader: string,
  ): Response | Promise<Response> {
    let response: Response;
    try {
      response = ctx.respond();
    } catch (error) {
      // respond() itself failing (bad status, serialization) must NOT
      // escape into the WebServer as a raw handler rejection — surface
      // it through the same disclosure model as any other error.
      const err = RapidError.from(error);
      this._app.log.error('response materialization failed', {
        requestId: ctx.requestId,
        code: err.code,
        stack: err.stack,
      });
      const payload = err.payload(this._app.mode);
      response = new Response(
        JSON.stringify(
          typeof payload === 'object' && payload !== null
            ? { ...payload, requestId: ctx.requestId }
            : { message: payload, requestId: ctx.requestId },
        ),
        {
          status: err.status,
          headers: {
            'content-type': 'application/json',
            [requestIdHeader]: ctx.requestId,
          },
        },
      );
    }
    // Cleanup runs AFTER the response is materialised (success or error),
    // never blocking it. When there is nothing to clean — no body parse
    // to settle, no upload temp files — skip the await entirely so a
    // plain request finalizes fully synchronously.
    if (!ctx.hasPendingCleanup) return response;
    return ctx.cleanup().then(
      () => response,
      (error) => {
        // Cleanup must never break a response — log and move on.
        this._app.log.error('context cleanup failed', {
          requestId: ctx.requestId,
          error: error instanceof Error ? error.message : String(error),
        });
        return response;
      },
    );
  }
}
