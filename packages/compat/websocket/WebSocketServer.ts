/**
 * @fileoverview `WebSocketServer` — middleware-aware primitive on top
 * of `compat/webserver`'s WebSocket primitives.
 *
 * Two ways to use it:
 *
 * 1. **Mounted** into an existing {@link WebServer}: pass
 *    `wss.handlers()` as the `websocket` option. Your HTTP routes and
 *    realtime layer share one server, one port, one TLS config.
 * 2. **Standalone**: call `wss.listen({ port })`. The server creates
 *    its own internal {@link WebServer}.
 *
 * What it gives you:
 *
 * - Middleware composition over every incoming message
 * - A pluggable codec (default = string identity; see {@link Codecs})
 * - Connection-level lifecycle hooks (`onOpen`, `onClose`)
 * - Connection iteration via `wss.connections`
 * - Single-call broadcast via `wss.broadcast(message)`
 *
 * It is opinion-light — no command dispatch, no channels, no
 * id-correlated request/response. For a higher-level RPC + pub/sub
 * framework built on top of this primitive, see `@tundralibs/rpc`.
 *
 * @module
 */

import { WebServer } from '../webserver/WebServer.ts';
import type {
  ServerWebSocket,
  WebSocketData,
  WebSocketHandler,
  WebSocketUpgradeContext,
} from '../webserver/types/mod.ts';
import { StringCodec } from './codecs.ts';
import type {
  Codec,
  DecodeErrorReason,
  MessageContext,
  Middleware,
  WebSocketListenOptions,
  WebSocketServerOptions,
} from './types/mod.ts';

/** Default cap on incoming frame size — 1 MB. */
const DEFAULT_MAX_FRAME_SIZE = 1_048_576;

/** Terminal handler — runs after all middleware. */
type _MessageHandler<T, M> = (
  ctx: MessageContext<T, M>,
) => void | Promise<void>;

/** Fired when an incoming frame is rejected before reaching middleware. */
type _DecodeErrorHandler<T> = (
  ws: ServerWebSocket<T>,
  raw: WebSocketData,
  reason: DecodeErrorReason,
) => void | Promise<void>;

/** Fired when an outbound buffer exceeds the configured threshold. */
type _BackpressureHandler<T> = (
  ws: ServerWebSocket<T>,
  bufferedAmount: number,
) => void | Promise<void>;

/**
 * Returns true when the raw frame exceeds `max` bytes. Fast-paths the
 * common case so we don't allocate a TextEncoder buffer on every text
 * frame: `length > max` means each char is at least 1 byte so we're
 * already over; `length * 4 <= max` means each char is at most 4 bytes
 * so we're definitely under.
 */
const exceedsFrameSize = (raw: WebSocketData, max: number): boolean => {
  if (typeof raw === 'string') {
    if (raw.length > max) return true;
    if (raw.length * 4 <= max) return false;
    return new TextEncoder().encode(raw).byteLength > max;
  }
  if (raw instanceof Uint8Array) return raw.byteLength > max;
  return raw.byteLength > max;
};

/**
 * Middleware-aware WebSocket server primitive.
 *
 * Lifecycle:
 * 1. Construct: `new WebSocketServer<T, M>(options?)`
 * 2. Configure: `.use(middleware)`, `.onMessage(handler)`,
 *    `.onOpen(handler)`, `.onClose(handler)` — chainable.
 * 3. Wire up: either `.listen(opts)` standalone, or pass
 *    `.handlers()` to a {@link WebServer}'s `websocket` option.
 * 4. Tear down: `await wss.close()`.
 *
 * @typeParam T - Connection-state type carried on each `ws.data`. Set
 *   by the upgrade hook's return value (see
 *   {@link WebSocketServerOptions.upgrade}).
 * @typeParam M - Decoded message type. Defaults to `string` (the
 *   built-in {@link StringCodec} passes text frames through).
 */
export class WebSocketServer<T = unknown, M = string> {
  readonly __opts: WebSocketServerOptions<T, M>;
  readonly __codec: Codec<M>;
  readonly __maxFrameSize: number;
  readonly __backpressureThreshold: number | undefined;

  readonly __middleware: Middleware<T, M>[] = [];
  readonly __connections: Set<ServerWebSocket<T>> = new Set<
    ServerWebSocket<T>
  >();

  __onMessage: _MessageHandler<T, M> | null = null;
  __onOpen:
    | ((
      ws: ServerWebSocket<T>,
      ctx: WebSocketUpgradeContext,
    ) => void | Promise<void>)
    | null = null;
  __onClose:
    | ((
      ws: ServerWebSocket<T>,
      code: number,
      reason: string,
    ) => void | Promise<void>)
    | null = null;
  __onDecodeError: _DecodeErrorHandler<T> | null = null;
  __onBackpressure: _BackpressureHandler<T> | null = null;
  __onError: ((err: unknown, ws: ServerWebSocket<T>) => void) | null = null;

  __webServer: WebServer<T> | null = null;
  __closed = false;

  constructor(options: WebSocketServerOptions<T, M> = {}) {
    this.__opts = options;
    this.__codec = options.codec ??
      (StringCodec as unknown as Codec<M>);
    this.__maxFrameSize = options.maxFrameSize ?? DEFAULT_MAX_FRAME_SIZE;
    this.__backpressureThreshold = options.backpressureThreshold;
  }

  // =========================================================================
  // Configuration API
  // =========================================================================

  /**
   * Register a middleware that wraps every incoming message.
   * Middleware runs in registration order; call `next()` to delegate
   * to the next middleware (or the terminal `onMessage` handler when
   * last in the chain).
   */
  use(middleware: Middleware<T, M>): this {
    if (this.__closed) throw new Error('WebSocketServer is closed');
    this.__middleware.push(middleware);
    return this;
  }

  /**
   * Set the terminal message handler — runs after all middleware.
   * Replaces any previously-registered handler. When omitted, the
   * middleware chain runs to completion with no terminal action.
   */
  onMessage(handler: _MessageHandler<T, M>): this {
    if (this.__closed) throw new Error('WebSocketServer is closed');
    this.__onMessage = handler;
    return this;
  }

  /**
   * Set the connection-open handler. Replaces any previously-registered
   * handler. The connection has already been added to
   * {@link connections} when this fires.
   */
  onOpen(
    handler: (
      ws: ServerWebSocket<T>,
      ctx: WebSocketUpgradeContext,
    ) => void | Promise<void>,
  ): this {
    if (this.__closed) throw new Error('WebSocketServer is closed');
    this.__onOpen = handler;
    return this;
  }

  /**
   * Set the connection-close handler. Replaces any previously-registered
   * handler. The connection has already been removed from
   * {@link connections} when this fires.
   */
  onClose(
    handler: (
      ws: ServerWebSocket<T>,
      code: number,
      reason: string,
    ) => void | Promise<void>,
  ): this {
    if (this.__closed) throw new Error('WebSocketServer is closed');
    this.__onClose = handler;
    return this;
  }

  /**
   * Called when an incoming frame is rejected before reaching the
   * message pipeline — either `'oversize'` (exceeded
   * {@link WebSocketServerOptions.maxFrameSize}) or `'malformed'`
   * (codec returned `null`). Use this to send a protocol-level error
   * frame back, log the bad traffic, or close the connection. When
   * omitted, the bad frame is silently dropped.
   */
  onDecodeError(handler: _DecodeErrorHandler<T>): this {
    if (this.__closed) throw new Error('WebSocketServer is closed');
    this.__onDecodeError = handler;
    return this;
  }

  /**
   * Called when a connection's outbound buffer crosses
   * {@link WebSocketServerOptions.backpressureThreshold} after a send
   * that went through {@link send} or {@link broadcast}. Direct
   * `ctx.ws.send(...)` is not observed.
   *
   * The handler is purely informational — implement your own policy
   * (close, log, drop further sends, etc.).
   */
  onBackpressure(handler: _BackpressureHandler<T>): this {
    if (this.__closed) throw new Error('WebSocketServer is closed');
    this.__onBackpressure = handler;
    return this;
  }

  /**
   * Called for any error thrown by middleware or the terminal
   * `onMessage` handler. When omitted, errors are swallowed to keep
   * the connection alive.
   */
  onError(handler: (err: unknown, ws: ServerWebSocket<T>) => void): this {
    if (this.__closed) throw new Error('WebSocketServer is closed');
    this.__onError = handler;
    return this;
  }

  // =========================================================================
  // Send helpers
  // =========================================================================

  /**
   * Encode `message` and send it to a single connection. When
   * {@link WebSocketServerOptions.backpressureThreshold} is set, fires
   * `onBackpressure` after the send if `ws.bufferedAmount` is above
   * the threshold. Errors from `ws.send` are swallowed.
   */
  send(ws: ServerWebSocket<T>, message: M): void {
    const encoded = this.__codec.encode(message);
    try {
      ws.send(encoded);
    } catch {
      return; // dead connection
    }
    this.__checkBackpressure(ws);
  }

  /**
   * Encode `message` once and send it to every open connection. When
   * {@link WebSocketServerOptions.backpressureThreshold} is set, fires
   * `onBackpressure` per-connection after each send if its
   * `bufferedAmount` is above the threshold. Errors from individual
   * `ws.send` calls are swallowed — a single dead connection won't
   * stop the broadcast.
   */
  broadcast(message: M): void {
    if (this.__connections.size === 0) return;
    const encoded = this.__codec.encode(message);
    for (const ws of this.__connections) {
      try {
        ws.send(encoded);
      } catch {
        // dead connection — nothing to do
        continue;
      }
      this.__checkBackpressure(ws);
    }
  }

  /**
   * Snapshot of currently open connections. Returns a new array on
   * each access — safe to iterate while connections come and go.
   */
  get connections(): ReadonlyArray<ServerWebSocket<T>> {
    return [...this.__connections];
  }

  // =========================================================================
  // Wire-up
  // =========================================================================

  /**
   * Returns the {@link WebSocketHandler} to pass into a
   * {@link WebServer}'s `websocket` option.
   */
  handlers(): WebSocketHandler<T> {
    return {
      upgrade: this.__opts.upgrade,
      open: (ws, ctx) => this.__handleOpen(ws, ctx),
      message: (ws, msg) => this.__handleMessage(ws, msg),
      close: (ws, code, reason) => this.__handleClose(ws, code, reason),
    };
  }

  /**
   * Start a standalone server. Internally constructs a {@link WebServer}
   * and binds the handlers. Use this when you don't already have a
   * WebServer; for embedding alongside HTTP routes, use
   * {@link handlers} instead.
   */
  async listen(opts: WebSocketListenOptions): Promise<void> {
    if (this.__webServer) {
      throw new Error('WebSocketServer is already listening');
    }
    this.__webServer = new WebServer<T>('WebSocketServer', {
      mode: 'TCP',
      port: opts.port,
      hostname: opts.hostname,
      handler: opts.httpHandler ??
        (() => new Response('Not Found', { status: 404 })),
      websocket: this.handlers(),
    });
    await this.__webServer.start();
  }

  /**
   * Stop accepting new connections and (if standalone) tear down the
   * internal server. Idempotent.
   *
   * Uses **force** stop on the underlying server. Two reasons:
   *
   * 1. Bun's graceful `server.stop()` hangs indefinitely after a
   *    WebSocket has been opened — even after close-handshake
   *    completes — because Bun.serve waits for the WS lifecycle on
   *    its own.
   * 2. We don't iterate `__connections` and call `ws.close(...)` on
   *    each first, even though that would seem cleaner. On Bun,
   *    initiating an explicit close-handshake on each WS *and then*
   *    calling stop(false) deadlocks: stop waits for the handshakes
   *    we just started. Force-stop without per-connection close
   *    terminates everything cleanly.
   */
  async close(): Promise<void> {
    if (this.__closed) return;
    this.__closed = true;
    this.__connections.clear();
    if (this.__webServer) {
      const ws = this.__webServer;
      this.__webServer = null;
      await ws.stop(false);
    }
  }

  // =========================================================================
  // Internal handlers
  // =========================================================================

  async __handleOpen(
    ws: ServerWebSocket<T>,
    ctx: WebSocketUpgradeContext,
  ): Promise<void> {
    this.__connections.add(ws);
    if (this.__onOpen) {
      try {
        await this.__onOpen(ws, ctx);
      } catch (err) {
        this.__onError?.(err, ws);
      }
    }
  }

  async __handleMessage(
    ws: ServerWebSocket<T>,
    raw: WebSocketData,
  ): Promise<void> {
    if (
      this.__maxFrameSize > 0 && exceedsFrameSize(raw, this.__maxFrameSize)
    ) {
      await this.__fireDecodeError(ws, raw, 'oversize');
      return;
    }
    let decoded: M | null;
    try {
      decoded = this.__codec.decode(raw);
    } catch {
      decoded = null;
    }
    if (decoded === null) {
      await this.__fireDecodeError(ws, raw, 'malformed');
      return;
    }

    const ctx: MessageContext<T, M> = { ws, message: decoded, state: {} };

    let next: () => Promise<void> = async () => {
      if (this.__onMessage) await this.__onMessage(ctx);
    };
    for (let i = this.__middleware.length - 1; i >= 0; i--) {
      const mw = this.__middleware[i]!;
      const downstream = next;
      next = async () => {
        await mw(ctx, downstream);
      };
    }

    try {
      await next();
    } catch (err) {
      if (this.__onError) this.__onError(err, ws);
    }
  }

  async __handleClose(
    ws: ServerWebSocket<T>,
    code: number,
    reason: string,
  ): Promise<void> {
    this.__connections.delete(ws);
    if (this.__onClose) {
      try {
        await this.__onClose(ws, code, reason);
      } catch (err) {
        this.__onError?.(err, ws);
      }
    }
  }

  async __fireDecodeError(
    ws: ServerWebSocket<T>,
    raw: WebSocketData,
    reason: DecodeErrorReason,
  ): Promise<void> {
    if (!this.__onDecodeError) return;
    try {
      await this.__onDecodeError(ws, raw, reason);
    } catch (err) {
      this.__onError?.(err, ws);
    }
  }

  __checkBackpressure(ws: ServerWebSocket<T>): void {
    const threshold = this.__backpressureThreshold;
    if (threshold === undefined || !this.__onBackpressure) return;
    const buffered = ws.bufferedAmount;
    if (buffered <= threshold) return;
    try {
      void this.__onBackpressure(ws, buffered);
    } catch (err) {
      this.__onError?.(err, ws);
    }
  }
}
