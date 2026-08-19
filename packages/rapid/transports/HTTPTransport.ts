import type { HTTPMethod, StatusCode } from '@tundralibs/compat/http';
import { WebServer, type WebSocketHandler } from '@tundralibs/compat/webserver';
import { ulid } from '@tundralibs/id';
import { Server as RpcServer } from '@tundralibs/rpc';
import { RadRouter } from '@tundralibs/radrouter';
import { extract, SpanKind } from '@tundralibs/tracer';
import { ambient } from '@tundralibs/ambient';
import { HTTPContext, SOCKETContext } from '../context/mod.ts';
import { RapidError } from '../errors/mod.ts';
import { socketOutcome } from '../utils/mod.ts';
import type { RapidContextState, RapidRouteEntry } from '../types/mod.ts';
import { Transport } from './Transport.ts';

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
  private readonly __router = new RadRouter<RapidRouteEntry<S>>();

  public get address(): string | null {
    return this.__server?.address ?? null;
  }

  public get port(): number | null {
    return this.__server?.port ?? null;
  }

  /**
   * Register routes on the router and start the listener.
   *
   * @throws {RapidError} RAPID_CONFIG when a route collides or is
   *   malformed (radrouter's duplicate/conflict detection, wrapped).
   */
  public async start(): Promise<void> {
    const server = this._app.option('server')!;

    // Routes registered on the app → the router. Collisions are
    // radrouter's loud errors, wrapped into our taxonomy.
    for (const entry of this._app.routes) {
      try {
        this.__router.addRoute(entry.method, entry.path, [entry]);
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

    // Websocket commands mount the rpc server INTO this listener (one
    // server, one port, one TLS config) — only when commands exist.
    const websocket = this._app.socketCommands.length > 0
      ? this.__buildSocket(server.socketPath ?? '/ws')
      : undefined;

    this.__server = server.unixSocketPath !== undefined
      ? new WebServer(this._app.option('name'), {
        mode: 'UNIX',
        unixSocketPath: server.unixSocketPath,
        handler: (request, info) => this.__handle(request, info.remoteAddress),
        websocket,
      })
      : new WebServer(this._app.option('name'), {
        mode: 'TCP',
        port: server.port,
        hostname: server.hostname,
        tls: server.tls,
        handler: (request, info) => this.__handle(request, info.remoteAddress),
        websocket,
      });
    await this.__server.start();
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
          // The universal onion runs per FRAME, then the COMMAND'S own
          // chain — same composition order as HTTP's route chains
          // (base-typed; cast bridges S).
          [
            ...this._app.middlewares,
            ...entry.middlewares,
          ] as unknown as readonly ((
            ctx: SOCKETContext<S>,
            next: () => Promise<void>,
          ) => Promise<void>)[],
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
    return rpc.handlers();
  }

  public async stop(): Promise<void> {
    const server = this.__server;
    this.__server = undefined;
    // Force-close (graceful=false): a mounted websocket is a long-lived
    // connection that never drains, so Bun's graceful stop would hang on
    // it forever (Deno's shutdown() already force-collapses). The app's
    // shutdownTimeout is the real graceful window.
    if (server !== undefined) await server.stop(false);
  }

  private async __handle(
    request: Request,
    remoteAddress: string | null,
  ): Promise<Response> {
    const serverOptions = this._app.option('server')!;
    const method = request.method.trim().toUpperCase() as HTTPMethod;
    const { pathname } = new URL(request.url);
    const match = this.__router.find(method, pathname);
    const entry = match?.middlewares[0];

    const requestIdHeader = serverOptions.requestIdHeader!;
    const ctx = new HTTPContext<S>(this._app, {
      request,
      remoteAddress: remoteAddress ?? '',
      params: match?.params ?? {},
      // Matched route PATTERN as identity (low cardinality); the raw
      // pathname only when nothing matched.
      action: entry !== undefined ? `${method} ${entry.path}` : undefined,
      matched: entry !== undefined,
      // The transport knows WHERE to look; the app owns the POLICY.
      requestId: this._app.newRequestId(request.headers.get(requestIdHeader)),
    });

    // Correlation echo at cycle START — every response carries it,
    // including 404s and errors (framework-owned, no middleware needed).
    ctx.setHeader(requestIdHeader, ctx.requestId);

    const dispatch = entry !== undefined
      ? async () => {
        const returned = await entry.handler(ctx);
        // The return-value channel: applied only when nothing was set.
        if (returned !== undefined && ctx.response === null) {
          ctx.response = returned;
        }
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
        return Promise.resolve();
      };

    await this._invoke(
      ctx,
      // Base-typed middleware operate on the untyped state bag; the cast
      // fits them to the S-typed context (same object at runtime). The
      // handler's own S-typing is preserved in `dispatch`.
      [
        ...this._app.middlewares,
        ...(entry?.middlewares ?? []),
      ] as unknown as readonly ((
        ctx: HTTPContext<S>,
        next: () => Promise<void>,
      ) => Promise<void>)[],
      dispatch,
      this._app.tracer !== undefined ? extract(request.headers) : undefined,
      {
        'http.request.method': method,
        'http.route': entry?.path ?? pathname,
      },
    );

    // Finalization (respond + cleanup) runs inside an ambient scope too,
    // so its logs stay correlated — the _invoke scope has already closed.
    return await ambient.run(
      { requestId: ctx.requestId, action: ctx.action },
      () => this.__finalize(ctx, requestIdHeader),
    );
  }

  private async __finalize(
    ctx: HTTPContext<S>,
    requestIdHeader: string,
  ): Promise<Response> {
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
    } finally {
      try {
        await ctx.cleanup();
      } catch (error) {
        // Cleanup must never break a response — log and move on.
        this._app.log.error('context cleanup failed', {
          requestId: ctx.requestId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return response;
  }
}
