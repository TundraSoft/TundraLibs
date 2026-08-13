/**
 * @fileoverview `Server` — RPC + pub/sub framework over WebSocket.
 *
 * Wraps `@tundralibs/compat/websocket`'s {@link WebSocketServer}
 * primitive with:
 *
 * - Command router (id-correlated request/response)
 * - Per-command Koa-style middleware
 * - Channel registry with subscribe / publish / unsubscribe
 * - Pluggable {@link PubSubAdapter} for cross-process broadcast
 *
 * Two ways to use it:
 *
 * 1. **Mounted** into an existing `WebServer`: pass `server.handlers()`
 *    as the `websocket` option. Your HTTP routes and realtime layer
 *    share one server, one port, one TLS config.
 * 2. **Standalone**: call `server.listen({ port })`. The Server creates
 *    its own internal `WebServer`.
 *
 * The wire protocol is a JSON envelope — see {@link "./types/mod.ts"}
 * for the frame shapes and {@link "./protocol.ts"} for the codec.
 *
 * @module
 */

import { type Codec, WebSocketServer } from '@tundralibs/compat/websocket';
import type {
  ServerWebSocket,
  WebSocketHandler,
} from '@tundralibs/compat/webserver';
import { RpcRegistrationError, RpcStateError } from './errors/mod.ts';
import { type PubSubAdapter, type Subscription } from './pubsub/Adapter.ts';
import { MemoryPubSubAdapter } from './pubsub/MemoryPubSubAdapter.ts';
import { decodeFrame, encodeFrame, recoverFrameId } from './protocol.ts';
import type {
  ChannelOptions,
  CommandContext,
  CommandFrame,
  CommandHandler,
  InboundFrame,
  ListenOptions,
  Middleware,
  OutboundFrame,
  PublishFrame,
  ServerOptions,
  SubscribeFrame,
  UnsubscribeFrame,
  Validator,
} from './types/mod.ts';

/** Codec mapping the rpc wire protocol onto the base primitive. */
const ServerCodec: Codec<InboundFrame> = {
  encode: () => {
    // Server does not use the codec for outbound frames — it sends
    // OutboundFrame shapes directly. This branch is only reached if
    // a caller calls `wss.broadcast` on the underlying primitive,
    // which Server does not do.
    throw new Error('ServerCodec.encode is not called by Server');
  },
  decode: (raw) => (typeof raw === 'string' ? decodeFrame(raw) : null),
};

/** Internal record for a registered command. */
type _CommandRegistration<T> = {
  schema: Validator<unknown> | undefined;
  handler: CommandHandler<T, unknown, unknown>;
};

/** Per-connection bookkeeping (pub/sub subscriptions). */
type _ConnState = {
  subscriptions: Map<string, Subscription>;
};

/**
 * Command router + pub/sub framework on top of `WebSocketServer`.
 *
 * Lifecycle:
 * 1. Construct: `new Server<T>(options?)`
 * 2. Configure: `.use(middleware)`, `.command(name, schema, handler)`,
 *    `.channel(name, options)` — chainable, all return `this`.
 * 3. Wire up: either `.listen(opts)` standalone, or pass `.handlers()`
 *    to a `WebServer`'s `websocket` option.
 * 4. Tear down: `await server.close()`.
 *
 * @typeParam T - Connection-state type carried on each `ws.data`. Set
 *   by the upgrade hook's return value (see
 *   {@link ServerOptions.upgrade}).
 */
export class Server<T = unknown> {
  // Internals are `protected` so subclasses can extend the framework —
  // override a `_handle*` dispatch hook, wrap `_send`, or reach the
  // underlying `_wss` primitive (see `docs/Rpc-Extending.md`). Mirrors
  // `Client`, which exposes its internals the same way. The single-
  // underscore prefix is the convention's signal for "not public API":
  // reachable from a subclass, but may be rearranged between minor
  // versions. Nothing here is part of the public surface unless typed
  // as `public`.
  protected readonly _opts: ServerOptions<T>;
  protected readonly _pubsub: PubSubAdapter;
  protected readonly _wss: WebSocketServer<T, InboundFrame>;

  protected readonly _middleware: Middleware<T>[] = [];
  private readonly __commands = new Map<string, _CommandRegistration<T>>();
  // `protected` extension seam — a subclass (see examples/pattern-subscribe.ts)
  // reads/writes this to register channels lazily. Explicitly typed because
  // JSR slow-types requires an explicit type on every public-API symbol.
  protected readonly _channels: Map<string, ChannelOptions<T>> = new Map();
  private readonly __connState = new WeakMap<ServerWebSocket<T>, _ConnState>();

  protected _closed = false;

  constructor(options: ServerOptions<T> = {}) {
    this._opts = options;
    this._pubsub = options.pubsub ?? new MemoryPubSubAdapter();

    this._wss = new WebSocketServer<T, InboundFrame>({
      codec: ServerCodec,
      upgrade: options.upgrade,
      maxFrameSize: options.maxFrameSize,
      backpressureThreshold: options.backpressureThreshold,
    });

    this._wss.onOpen((ws) => {
      if (this._closed) {
        // Mounted mode: the outer `WebServer` keeps upgrading connections
        // after `close()` — the underlying primitive's `close()` only
        // flips a flag it never consults on open. Refuse late connections
        // so a closed RPC layer doesn't keep accepting (and then serving)
        // them. Standalone mode force-stops the transport, so this guard
        // is a no-op there.
        this._refuseAfterClose(ws);
        return;
      }
      this.__connState.set(ws, { subscriptions: new Map() });
    });

    this._wss.onClose((ws) => {
      this._handleClose(ws);
    });

    this._wss.onDecodeError((ws, raw, reason) => {
      // The wire format is text-only; binary or malformed JSON gets
      // a BAD_FORMAT error frame back; frames over `maxFrameSize` get
      // a FRAME_TOO_LARGE so the client can distinguish.
      if (reason === 'oversize') {
        // Deliberately id-less: the frame is over `maxFrameSize`, and
        // JSON.parsing an over-limit payload just to recover an id would
        // reintroduce the exact cost the size gate exists to avoid (a
        // cheap DoS — flood the server with just-over-limit blobs to force
        // full parses). So FRAME_TOO_LARGE never carries a correlating id.
        this._send(ws, {
          type: 'error',
          code: 'FRAME_TOO_LARGE',
          message: 'frame exceeds maximum size',
        });
        return;
      }
      // A frame can be malformed (unknown `type`, missing `cmd` /
      // `channel` / `payload`) yet still carry a parsable `id`. Recover it
      // so the error frame correlates to the offending request: the client
      // rejects that pending call immediately (see Client `_dispatchFrame`)
      // instead of hanging until its request timeout — the very hang the
      // publish(undefined) regression exhibited. Invalid JSON and binary
      // frames carry no recoverable id, so those stay id-less.
      const message = typeof raw === 'string'
        ? 'invalid frame'
        : 'binary frames not supported';
      const id = typeof raw === 'string' ? recoverFrameId(raw) : undefined;
      this._send(ws, {
        ...(id !== undefined ? { id } : {}),
        type: 'error',
        code: 'BAD_FORMAT',
        message,
      });
    });

    if (options.onBackpressure) {
      this._wss.onBackpressure(options.onBackpressure);
    }

    this._wss.onMessage((ctx) => this._dispatch(ctx.ws, ctx.message));
  }

  // =========================================================================
  // Configuration API
  // =========================================================================

  /**
   * Register a middleware that wraps every command. Middleware runs in
   * registration order; call `next()` to delegate to the next
   * middleware (or the handler when last in the chain).
   */
  use(middleware: Middleware<T>): this {
    if (this._closed) throw new RpcStateError('Server is closed');
    this._middleware.push(middleware);
    return this;
  }

  /**
   * Register a command handler.
   *
   * @param name - Command name (matches the `cmd` field of the wire frame)
   * @param schema - Optional payload validator. Throws on invalid input;
   *   the throw's `.message` is sent to the client as a result error.
   *   Pass `undefined` to skip validation (handler receives raw payload).
   * @param handler - Function called with the validated payload. The
   *   return value is sent back to the client as `result.data`.
   */
  command<P, R>(
    name: string,
    schema: Validator<P> | undefined,
    handler: CommandHandler<T, P, R>,
  ): this {
    if (this._closed) throw new RpcStateError('Server is closed');
    if (this.__commands.has(name)) {
      throw new RpcRegistrationError(`Command already registered: ${name}`);
    }
    this.__commands.set(name, {
      schema: schema,
      handler: handler as CommandHandler<T, unknown, unknown>,
    });
    return this;
  }

  /**
   * Register channel-level handlers. The channel name is matched
   * exactly against incoming `sub` / `unsub` / `pub` frames.
   *
   * Pattern matching (e.g. `'chat:*'`) is not supported in v1 — use
   * one channel registration per concrete name, or register a single
   * channel and dispatch internally based on the frame's channel string.
   */
  channel(name: string, options: ChannelOptions<T>): this {
    if (this._closed) throw new RpcStateError('Server is closed');
    if (this._channels.has(name)) {
      throw new RpcRegistrationError(`Channel already registered: ${name}`);
    }
    this._channels.set(name, options);
    return this;
  }

  /**
   * Server-initiated publish. Broadcasts to every subscriber on the
   * adapter — including subscribers in other processes when a
   * cross-process adapter is configured.
   */
  publish(channel: string, data: unknown): Promise<void> {
    if (this._closed) return Promise.resolve();
    return this._pubsub.publish(channel, data);
  }

  /**
   * The active pub/sub adapter. Useful for inspecting
   * `adapter.capabilities` at boot — Server doesn't currently gate any
   * feature on those flags, so it's up to your code to assert what
   * the deployment requires (e.g. warn or fail fast if
   * `crossProcess` is `false` in a multi-instance setup).
   *
   * @example
   * ```ts
   * import { Server } from '@tundralibs/rpc';
   *
   * const server = new Server();
   * const clusterMode = true;
   *
   * if (clusterMode && !server.adapter.capabilities.crossProcess) {
   *   console.warn('cluster mode with single-process pub/sub adapter');
   * }
   * ```
   */
  get adapter(): PubSubAdapter {
    return this._pubsub;
  }

  /**
   * Snapshot of currently open connections. Returns a new array on
   * each access — safe to iterate while connections come and go.
   *
   * Useful for app-level features that need direct connection access:
   * heartbeat sweepers, idle-connection close, presence enumeration,
   * server-initiated pings.
   *
   * ## Security & operational notes
   *
   * This getter is server-side only — clients cannot reach it via the
   * wire protocol. The objects returned were already accessible from
   * any handler via `ctx.ws`; this just lets you reach them outside
   * a handler. No new attack surface, but a few things to keep in
   * mind:
   *
   * - **`ws.data` may carry sensitive state** (auth tokens, session
   *   IDs, PII). Don't dump it wholesale into logs / metrics / error
   *   reports.
   * - **Mass-action capability.** Code with the `Server` in scope can
   *   send to or close every connection. Keep it out of modules that
   *   handle untrusted input as code (eval-style, not data).
   * - **Cross-tenant iteration.** If one Server serves multiple tenants
   *   (unusual), the sweeper sees all of them — filter on
   *   `ws.data.tenantId` (or equivalent) inside the loop.
   * - **No `await` per connection without batching.** `await
   *   somethingAsync(ws)` inside the loop serializes fan-out. Use
   *   `Promise.all` if you need parallelism.
   *
   * @example Heartbeat sweeper
   * ```ts
   * import { Server } from '@tundralibs/rpc';
   *
   * const server = new Server();
   *
   * server.command('heartbeat', undefined, (ctx) => {
   *   (ctx.ws.data as { lastSeen?: number }).lastSeen = Date.now();
   * });
   *
   * setInterval(() => {
   *   const cutoff = Date.now() - 60_000;
   *   for (const ws of server.connections) {
   *     const last = (ws.data as { lastSeen?: number }).lastSeen ?? 0;
   *     if (last < cutoff) ws.close(1011, 'idle');
   *   }
   * }, 10_000);
   * ```
   */
  get connections(): ReadonlyArray<ServerWebSocket<T>> {
    return this._wss.connections;
  }

  // =========================================================================
  // Wire-up
  // =========================================================================

  /**
   * Returns the {@link WebSocketHandler} to pass into a `WebServer`'s
   * `websocket` option.
   */
  handlers(): WebSocketHandler<T> {
    return this._wss.handlers();
  }

  /**
   * Start a standalone server. Internally constructs a `WebServer`
   * via the underlying primitive's `listen()`. Use this when you
   * don't already have a `WebServer`; for embedding alongside HTTP
   * routes, use {@link handlers} instead.
   */
  listen(opts: ListenOptions): Promise<void> {
    return this._wss.listen(opts);
  }

  /**
   * Stop accepting new connections and serving frames, drain pub/sub
   * state, and (if standalone) tear down the internal server. Idempotent.
   *
   * In **standalone** mode the internal `WebServer` is force-stopped, so
   * the transport is gone. In **mounted** mode the outer `WebServer`
   * keeps running and may still route WebSocket upgrades and frames here
   * after close(); those are now refused rather than served — a late
   * connection is closed on open, and any frame arriving on an
   * already-open socket closes that socket instead of being dispatched
   * (previously such connections were accepted and commands answered,
   * while `sub` frames hung the client until its request timeout).
   * Fully stopping the shared transport in mounted mode remains the
   * outer server's responsibility.
   */
  async close(): Promise<void> {
    if (this._closed) return;
    this._closed = true;
    await this._wss.close();
    await this._pubsub.close();
  }

  // =========================================================================
  // Internal handlers
  // =========================================================================

  protected _handleClose(ws: ServerWebSocket<T>): void {
    const state = this.__connState.get(ws);
    if (!state) return;
    for (const [channel, sub] of state.subscriptions) {
      sub.unsubscribe();
      const opts = this._channels.get(channel);
      if (opts?.onUnsubscribe) {
        try {
          // Fire-and-forget; the connection is already closing, so we
          // don't await. `onUnsubscribe` may be async — attach a
          // `.catch` so a rejected promise doesn't escape as an
          // unhandled rejection (which crashes Node under
          // `--unhandled-rejections=strict`). The surrounding try/catch
          // only traps a synchronous throw; `void`-ing the promise
          // would drop the rejection on the floor.
          const maybe = opts.onUnsubscribe({ ws, channel });
          if (maybe && typeof (maybe as Promise<void>).then === 'function') {
            (maybe as Promise<void>).catch(() => {});
          }
        } catch {
          // swallow a synchronous throw — the connection is closing anyway
        }
      }
    }
    this.__connState.delete(ws);
  }

  /**
   * Refuse a connection that reached us after `close()` (only possible in
   * mounted mode — see `close()`). Closes the socket with a going-away
   * code so the client observes a clean disconnect instead of a silent
   * hang. Best-effort: a socket already torn down throws, which we ignore.
   */
  protected _refuseAfterClose(ws: ServerWebSocket<T>): void {
    try {
      ws.close(1001, 'server closing');
    } catch {
      // already gone — nothing to do
    }
  }

  protected async _dispatch(
    ws: ServerWebSocket<T>,
    frame: InboundFrame,
  ): Promise<void> {
    if (this._closed) {
      // Mounted mode: the outer `WebServer` can keep delivering frames
      // after `close()`. Don't serve them — close the socket rather than
      // leaving the client hanging. A `sub` in particular would otherwise
      // reach the now-closed pub/sub adapter, throw `subscribe after
      // close()`, and be swallowed by the primitive, hanging the client
      // until its request timeout with no error frame.
      this._refuseAfterClose(ws);
      return;
    }
    switch (frame.type) {
      case 'cmd':
        await this._handleCommand(ws, frame);
        break;
      case 'sub':
        await this._handleSubscribe(ws, frame);
        break;
      case 'unsub':
        await this._handleUnsubscribe(ws, frame);
        break;
      case 'pub':
        await this._handlePublish(ws, frame);
        break;
    }
  }

  // -------------------------------------------------------------------------
  // Command path
  // -------------------------------------------------------------------------

  protected async _handleCommand(
    ws: ServerWebSocket<T>,
    frame: CommandFrame,
  ): Promise<void> {
    const reg = this.__commands.get(frame.cmd);
    if (!reg) {
      this._sendResultError(
        ws,
        frame.id,
        'UNKNOWN_COMMAND',
        `unknown command: ${frame.cmd}`,
      );
      return;
    }

    let payload: unknown;
    if (reg.schema) {
      try {
        payload = await reg.schema(frame.payload);
      } catch (err) {
        this._sendResultError(
          ws,
          frame.id,
          'VALIDATION',
          err instanceof Error ? err.message : String(err),
        );
        return;
      }
    } else {
      payload = frame.payload;
    }

    const ctx: CommandContext<T, unknown> = {
      ws,
      cmd: frame.cmd,
      id: frame.id,
      payload,
      state: {},
    };

    let handlerResult: unknown;
    let handlerCalled = false;

    // Koa-style middleware chain with a double-`next()` guard. Each
    // middleware receives a `next` bound to its position in the chain;
    // calling it more than once throws RpcStateError instead of silently
    // re-running the downstream chain — and the handler — a second time
    // (duplicated side effects). Mirrors the guard the Client applies on
    // both its send and receive chains.
    const chain = this._middleware;
    let index = -1;
    const runner = async (i: number): Promise<void> => {
      if (i <= index) {
        throw new RpcStateError(
          'command middleware called next() more than once',
        );
      }
      index = i;
      const mw = chain[i];
      if (mw) {
        await mw(ctx, () => runner(i + 1));
        return;
      }
      // End of the chain — run the handler exactly once.
      handlerCalled = true;
      handlerResult = await reg.handler(ctx);
    };

    try {
      await runner(0);
      this._sendResultOk(
        ws,
        frame.id,
        handlerCalled ? handlerResult : undefined,
      );
    } catch (err) {
      const code = (err as { code?: unknown })?.code;
      // A handler may attach structured detail to the thrown error
      // (`Object.assign(new Error(msg), { code, data })`); it rides the
      // error frame so the caller gets more than a string.
      const data = (err as { data?: unknown })?.data;
      this._sendResultError(
        ws,
        frame.id,
        typeof code === 'string' ? code : 'HANDLER_ERROR',
        err instanceof Error ? err.message : String(err),
        data,
      );
    }
  }

  // -------------------------------------------------------------------------
  // Pub/Sub path
  // -------------------------------------------------------------------------

  protected async _handleSubscribe(
    ws: ServerWebSocket<T>,
    frame: SubscribeFrame,
  ): Promise<void> {
    const opts = this._channels.get(frame.channel);
    if (!opts) {
      this._sendResultError(
        ws,
        frame.id,
        'UNKNOWN_CHANNEL',
        `unknown channel: ${frame.channel}`,
      );
      return;
    }
    const state = this.__connState.get(ws);
    if (!state) return;

    // Re-run authorize even on a duplicate subscribe so changed authz
    // state (e.g. a revoked role) is re-checked rather than silently
    // honoured from the first subscribe. If a now-forbidden client
    // re-subscribes, drop the existing subscription too.
    if (opts.authorize) {
      let allowed: boolean;
      try {
        allowed = await opts.authorize({ ws, channel: frame.channel });
      } catch (err) {
        this._sendResultError(
          ws,
          frame.id,
          'AUTHZ_ERROR',
          err instanceof Error ? err.message : String(err),
        );
        return;
      }
      // The `authorize` await yielded to the event loop, so the socket
      // may have closed — or the Server shut down — while we were
      // suspended. Re-check the live connection state before touching
      // `state` or the adapter: if `_handleClose` deleted (or replaced)
      // this connection's `__connState` entry, the `state` captured
      // above is now orphaned, and subscribing into it would leak a
      // Subscription bound to a dead socket that nothing ever
      // unsubscribes. If the Server closed, `_pubsub.subscribe` would
      // throw `subscribe after close()` and escape `_dispatch`. Either
      // way, bail cleanly.
      if (this._closed || this.__connState.get(ws) !== state) return;
      if (!allowed) {
        const existing = state.subscriptions.get(frame.channel);
        if (existing) {
          existing.unsubscribe();
          state.subscriptions.delete(frame.channel);
          // Force-dropping a live subscription is still a removal — fire
          // onUnsubscribe so lifecycle-paired app state (presence
          // counters, room membership) stays balanced. onSubscribe fired
          // for the original subscribe, and every other removal path
          // (explicit `unsub` frame, disconnect) fires onUnsubscribe too;
          // this authz-revocation path must not be the odd one out.
          if (opts.onUnsubscribe) {
            try {
              await opts.onUnsubscribe({ ws, channel: frame.channel });
            } catch {
              // swallow — matches the other onUnsubscribe call sites
            }
          }
        }
        this._sendResultError(
          ws,
          frame.id,
          'FORBIDDEN',
          `not authorized for channel: ${frame.channel}`,
        );
        return;
      }
    }

    if (state.subscriptions.has(frame.channel)) {
      // Already subscribed and still authorized — re-ack without
      // creating a second underlying subscription or re-firing
      // onSubscribe.
      this._sendSubscribed(ws, frame.id, frame.channel, 'subscribed');
      return;
    }

    const sub = this._pubsub.subscribe(frame.channel, (data) => {
      this._send(ws, { type: 'msg', channel: frame.channel, data });
    });
    state.subscriptions.set(frame.channel, sub);

    this._sendSubscribed(ws, frame.id, frame.channel, 'subscribed');

    if (opts.onSubscribe) {
      try {
        await opts.onSubscribe({ ws, channel: frame.channel });
      } catch {
        // Hooks shouldn't throw post-subscribe; swallow.
      }
    }
  }

  protected async _handleUnsubscribe(
    ws: ServerWebSocket<T>,
    frame: UnsubscribeFrame,
  ): Promise<void> {
    const state = this.__connState.get(ws);
    if (!state) return;
    const sub = state.subscriptions.get(frame.channel);
    const removed = sub !== undefined;
    if (sub) {
      sub.unsubscribe();
      state.subscriptions.delete(frame.channel);
    }
    // Ack unconditionally — a stray `unsub` (never subscribed, or already
    // force-dropped server-side) is not an error and still gets an
    // `unsubscribed` ack, so unsubscribe is idempotent (see
    // docs/Rpc-Protocol.md).
    this._sendSubscribed(ws, frame.id, frame.channel, 'unsubscribed');

    // Fire onUnsubscribe ONLY when this frame actually removed a live
    // subscription, keeping the hook 1:1 with onSubscribe. A stray `unsub`
    // must NOT fire it: the channel was either never subscribed, or already
    // force-dropped by the authz-revocation path in `_handleSubscribe`
    // (which already fired onUnsubscribe for that removal). Firing here too
    // would double-count — driving lifecycle-paired app state (presence
    // counters, room membership) negative, the mirror image of the
    // under-count the force-drop hook was added to prevent.
    if (removed) {
      const opts = this._channels.get(frame.channel);
      if (opts?.onUnsubscribe) {
        try {
          await opts.onUnsubscribe({ ws, channel: frame.channel });
        } catch {
          // swallow
        }
      }
    }
  }

  protected async _handlePublish(
    ws: ServerWebSocket<T>,
    frame: PublishFrame,
  ): Promise<void> {
    const opts = this._channels.get(frame.channel);
    if (!opts) {
      this._sendResultError(
        ws,
        frame.id,
        'UNKNOWN_CHANNEL',
        `unknown channel: ${frame.channel}`,
      );
      return;
    }
    if (!opts.onPublish) {
      this._sendResultError(
        ws,
        frame.id,
        'PUBLISH_REFUSED',
        `channel does not accept client publishes: ${frame.channel}`,
      );
      return;
    }
    // Gate the publish on subscription membership. `authorize` only runs
    // on the subscribe path, so accepting a `pub` from a connection that
    // never subscribed (and was never authorized) would let any client
    // publish to any `onPublish` channel. Requiring an active
    // subscription means the publish inherits the subscribe-time authz
    // decision — matching the documented contract on
    // `ChannelOptions.onPublish` ("clients subscribed to this channel
    // can send `pub` frames").
    const state = this.__connState.get(ws);
    if (!state || !state.subscriptions.has(frame.channel)) {
      this._sendResultError(
        ws,
        frame.id,
        'NOT_SUBSCRIBED',
        `must subscribe before publishing to channel: ${frame.channel}`,
      );
      return;
    }
    try {
      await opts.onPublish({ ws, channel: frame.channel }, frame.payload);
      this._sendResultOk(ws, frame.id, undefined);
    } catch (err) {
      this._sendResultError(
        ws,
        frame.id,
        'PUBLISH_ERROR',
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  // -------------------------------------------------------------------------
  // Wire helpers
  // -------------------------------------------------------------------------

  protected _send(ws: ServerWebSocket<T>, frame: OutboundFrame): void {
    try {
      ws.send(encodeFrame(frame));
    } catch {
      // ws closed mid-flight; nothing to do.
      return;
    }
    // Mirror the observability that `wss.send`/`wss.broadcast` give for
    // codec-encoded sends. Server bypasses those paths (it encodes its
    // OutboundFrame shape directly), so without this call the configured
    // `onBackpressure` hook would never fire for Server-originated traffic.
    this._wss.__checkBackpressure(ws);
  }

  protected _sendResultOk(
    ws: ServerWebSocket<T>,
    id: string,
    data: unknown,
  ): void {
    this._send(ws, { id, type: 'result', ok: true, data });
  }

  protected _sendResultError(
    ws: ServerWebSocket<T>,
    id: string,
    code: string,
    message: string,
    data?: unknown,
  ): void {
    this._send(ws, {
      id,
      type: 'result',
      ok: false,
      // `data` is omitted entirely when absent — an `undefined` value
      // would serialise away anyway, but omitting keeps the frame
      // byte-identical to what pre-`data` servers sent.
      error: data === undefined ? { code, message } : { code, message, data },
    });
  }

  protected _sendSubscribed(
    ws: ServerWebSocket<T>,
    id: string,
    channel: string,
    type: 'subscribed' | 'unsubscribed',
  ): void {
    this._send(ws, { id, type, channel });
  }
}
