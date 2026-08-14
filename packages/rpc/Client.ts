/**
 * @fileoverview `Client` — RPC + pub/sub client matching {@link Server}.
 *
 * Connects to a TundraLibs RPC server over WebSocket, sends typed
 * commands and waits for correlated `result` frames, subscribes to
 * channels and dispatches `msg` frames to per-channel handlers,
 * and exposes Koa-style middleware on both the send path
 * (`useSend`) and the receive path (`useReceive`) — mirroring the
 * Server's middleware mental model so users learn one pattern for
 * both ends of the wire.
 *
 * Lifecycle:
 * 1. Construct: `new Client({ url, ... })`
 * 2. Configure: `.useSend(fn)`, `.useReceive(fn)` — chainable.
 * 3. Connect: `await client.connect()` — resolves on the WebSocket
 *    `open` event.
 * 4. Use: `await client.command(name, payload)`,
 *    `await client.subscribe(channel, handler)`,
 *    `await client.publish(channel, payload)`.
 * 5. Tear down: `await client.close()`.
 *
 * Reconnect is opt-out: enabled by default with exponential backoff.
 * Active subscriptions are re-established on reconnect; in-flight
 * `command()` calls reject with `CONNECTION_LOST`.
 *
 * @module
 */

import { RpcConfigError, RpcStateError } from './errors/mod.ts';
import { encodeFrame } from './protocol.ts';
import type {
  ClientOptions,
  ClientReceiveContext,
  ClientReceiveMiddleware,
  ClientSendContext,
  ClientSendMiddleware,
  ClientState,
  ClientSubscription,
  CommandFrame,
  InboundFrame,
  MessageFrame,
  OutboundFrame,
  PublishFrame,
  ReconnectPolicy,
  ResultFrame,
  SubscribedFrame,
  SubscribeFrame,
  UnsubscribeFrame,
} from './types/mod.ts';

/** Internal record for an in-flight request awaiting a `result` frame. */
type _PendingRequest = {
  resolve: (data: unknown) => void;
  reject: (err: Error) => void;
  timeoutHandle: number | undefined;
};

/** Internal record for an active channel subscription. */
type _ChannelSubscription = {
  handler: (data: unknown) => void;
  // Resolved by the next `subscribed` ack on this channel — used to
  // make `subscribe()` await server confirmation. Replaced on each
  // re-subscribe after a reconnect.
  pendingAck: Promise<void>;
  ackResolve: () => void;
  ackReject: (err: Error) => void;
};

const DEFAULT_RECONNECT: Required<ReconnectPolicy> = {
  enabled: true,
  maxAttempts: 10,
  initialDelayMs: 500,
  backoffFactor: 2,
  maxDelayMs: 30_000,
};

const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * Build the rejection handed to a caller whose request failed on the
 * wire: an `Error` messaged `` `${code}: ${message}` `` that ALSO
 * carries `code` — and `data` when the frame supplied any — as
 * properties, so callers branch on the code instead of parsing the
 * string.
 *
 * Both server-driven reject paths go through here (a `result` frame
 * with `ok: false`, and a correlated out-of-band `error` frame) so
 * they cannot drift back into handing out different error shapes.
 * Only the `result` arm has structured detail to pass — the
 * `ServerErrorFrame` shape has no `data` field — so the out-of-band
 * caller simply omits the argument.
 */
function rejectionError(
  code: string,
  message: string,
  data?: unknown,
): Error & { code: string; data?: unknown } {
  return Object.assign(new Error(`${code}: ${message}`), {
    code,
    ...(data === undefined ? {} : { data }),
  });
}

/**
 * RPC + pub/sub client. See module JSDoc for lifecycle.
 *
 * @example
 * ```ts
 * const client = new Client({ url: 'ws://localhost:8080' });
 * await client.connect();
 * const out = await client.command('echo', { text: 'hi' });
 * console.log(out); // server's handler return value
 * await client.close();
 * ```
 */
export class Client {
  // Use protected so subclasses (like rAPId's typed wrapper) can reach
  // these fields if they need to. The double-underscore naming is
  // strictly informational — nothing inside this class is part of the
  // public surface unless typed as `public`.
  /** Constructor options, stored unmodified. */
  protected readonly _opts: ClientOptions;
  /** Reconnect policy with every field defaulted. */
  protected readonly _reconnect: Required<ReconnectPolicy>;
  /** Timeout applied to calls that don't pass their own `timeoutMs`. */
  protected readonly _defaultTimeoutMs: number;

  /** Send-path middleware, run in registration order. */
  protected readonly _sendMiddleware: ClientSendMiddleware[] = [];
  /** Receive-path middleware, run in registration order. */
  protected readonly _receiveMiddleware: ClientReceiveMiddleware[] = [];

  /** In-flight requests awaiting a `result`, keyed by frame id. */
  protected readonly _pending: Map<string, _PendingRequest> = new Map();
  /** Locally-tracked subscriptions, keyed by channel name. */
  protected readonly _subscriptions: Map<string, _ChannelSubscription> =
    new Map();
  // Frame ids of `unsub` frames this client has sent whose `unsubscribed`
  // ack has not yet arrived. Lets `_dispatchSubAck` tell OUR own unsub
  // ack apart from a genuine server-initiated `unsubscribed` frame. Our
  // own ack is a no-op for the map — `unsubscribe()` already removed the
  // local entry, and a channel that was re-subscribed in the meantime
  // must survive — whereas a server-initiated drop must clean up locally.
  // An id lives here until the matching ack arrives (`_dispatchSubAck`
  // removes it) or the connection drops (`_handleClose` clears the set) —
  // NOT merely until `unsubscribe()`'s ack-wait times out. Bounding the
  // window to the timeout would let a late ack be misread as
  // server-initiated and delete a freshly re-created subscription.
  /** Ids of our own `unsub` frames whose `unsubscribed` ack is outstanding. */
  protected readonly _pendingUnsubs: Set<string> = new Set();

  /** The live socket, or `null` while disconnected or between retries. */
  protected _ws: WebSocket | null = null;
  /** Current connection state; surfaced publicly via {@link state}. */
  protected _state: ClientState = 'DISCONNECTED';
  /** Latched by {@link close} to stop reconnects; cleared by {@link connect}. */
  protected _closeRequested = false;
  /** Retries used in the current backoff cycle; reset to 0 on a good open. */
  protected _reconnectAttempt = 0;
  // Handle + waker for the backoff sleep between reconnect attempts, so
  // `close()` can cancel a pending retry instead of leaving a timer —
  // and the event loop — alive up to `maxDelayMs` after close.
  /** Armed backoff timer, or `undefined` when no retry is parked. */
  protected _reconnectTimer: ReturnType<typeof setTimeout> | undefined =
    undefined;
  /** Resolver that unparks the backoff sleep early (used by {@link close}). */
  protected _reconnectWake: (() => void) | undefined = undefined;
  /** Monotonic frame-id counter, reset on every successful open. */
  protected _nextId = 0;
  // Per-connection nonce, bumped on every (re)connect. Folded into the
  // frame-id prefix so ids minted on a new socket can never collide
  // with a stale in-flight `result` still arriving from the old one —
  // otherwise the sequential `c1, c2, …` counter would let an old
  // socket's late reply resolve a freshly minted request with the same
  // id.
  /** Per-connection nonce forming the `c<connId>-` frame-id prefix. */
  protected _connId = 0;

  /**
   * Create a client. Does not open the socket — call {@link connect}.
   *
   * @param opts - Only `url` is required; the rest default to a 30s
   *   request timeout and reconnect enabled with 10 attempts.
   * @throws {@link RpcConfigError} When `url` is missing or not a string.
   */
  constructor(opts: ClientOptions) {
    if (!opts.url || typeof opts.url !== 'string') {
      throw new RpcConfigError(
        'Client: `url` is required and must be a string',
      );
    }
    this._opts = opts;
    this._reconnect = {
      ...DEFAULT_RECONNECT,
      ...(opts.reconnect ?? {}),
    };
    this._defaultTimeoutMs = opts.defaultTimeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  /** Current connection state. */
  get state(): ClientState {
    return this._state;
  }

  /**
   * Register a middleware around every outbound frame. Chainable.
   *
   * Runs in registration order; the last middleware's `next()` writes
   * the frame to the wire. Throwing rejects the awaiting caller of
   * `command()` / `subscribe()` / etc.
   */
  useSend(fn: ClientSendMiddleware): this {
    this._sendMiddleware.push(fn);
    return this;
  }

  /**
   * Register a middleware around every inbound frame. Chainable.
   *
   * Runs in registration order; the last middleware's `next()`
   * performs the built-in dispatch (id correlation for `result`
   * frames, channel routing for `msg` frames, etc.). Skip `next()`
   * to drop the frame.
   */
  useReceive(fn: ClientReceiveMiddleware): this {
    this._receiveMiddleware.push(fn);
    return this;
  }

  /**
   * Open the WebSocket. Resolves on `open`; rejects on `error` before
   * `open`. After this resolves, `state` is `'CONNECTED'`.
   *
   * Safe to call multiple times — a no-op when already connected or
   * connecting. Calling it during reconnect backoff (state
   * `'DISCONNECTED'`) cancels the pending retry and connects immediately,
   * so it never races the backoff into a second concurrent socket. This is
   * the intended way to recover after {@link ClientOptions.onReconnectFailed}.
   *
   * A manual `connect()` during backoff **supersedes** the currently-parked
   * retry but does not disable auto-reconnect: if this call itself fails
   * (server still down) and reconnect is enabled, the backoff schedule is
   * re-armed so the client keeps retrying and recovers on its own once the
   * server returns. Only {@link close} stops reconnecting. A first-ever
   * `connect()` (with no backoff in progress) keeps its plain semantics — a
   * failure just rejects and does not start reconnecting on its own.
   */
  async connect(): Promise<void> {
    if (this._state === 'CONNECTED' || this._state === 'CONNECTING') {
      return;
    }
    this._closeRequested = false;
    // Was a reconnect backoff already parked when this manual connect() ran?
    // If so, this attempt SUPERSEDES the parked one (we cancel it just below so
    // it can't later race us into a second concurrent socket) — but if our own
    // open then FAILS we must RE-ARM the schedule (see the catch). Otherwise a
    // failed manual connect() during backoff silently cancels all future
    // auto-reconnect and strands the client DISCONNECTED forever, even with
    // `reconnect.enabled`. A first-ever connect() (nothing parked) keeps its
    // original semantics — a failure just rejects, no background retries.
    const wasReconnectPending = this._reconnectTimer !== undefined ||
      this._reconnectWake !== undefined;
    // Cancel the parked backoff so a concurrently-firing timer / woken chain
    // can't open a duplicate socket over the one we open here. (The
    // CONNECTED/CONNECTING guard in `_scheduleReconnect` also stops that woken
    // retry, but cancelling avoids leaving a timer — and the event loop —
    // alive until it fires.)
    this._clearReconnectTimer();
    try {
      await this._openSocket();
    } catch (err) {
      // The manual open failed. If a reconnect cycle was already active when
      // we superseded it above — and close() wasn't called in the meantime —
      // resume the backoff schedule so auto-reconnect survives a failed manual
      // connect(). Without this, clearing the parked timer above is a one-way
      // trip to a permanently-disconnected client (round-5 finding C1). The
      // caller still sees the failure via the re-thrown error.
      if (
        wasReconnectPending && !this._closeRequested && this._reconnect.enabled
      ) {
        void this._scheduleReconnect();
      }
      throw err;
    }
  }

  /**
   * Invoke a command and wait for the server's `result` frame.
   *
   * Resolves to the handler's return value on success; rejects on
   * `ok: false` responses with an `Error` whose `.message` is
   * `` `${code}: ${serverMessage}` ``, and which also carries `.code`
   * plus any structured `.data` the handler attached — branch on the
   * code instead of parsing the message. Times out after `timeoutMs`
   * (or the client's `defaultTimeoutMs`) — pass `0` to disable for a
   * single call.
   *
   * @throws If the send path throws (a throwing `useSend` middleware, or
   *   the socket leaving `OPEN` mid-send), the returned Promise rejects
   *   with that error and the pending entry is dropped — no orphaned
   *   pending is left to reject later as an unhandled rejection.
   */
  async command<R = unknown>(
    name: string,
    payload?: unknown,
    options?: { timeoutMs?: number },
  ): Promise<R> {
    this._assertSendable();
    const id = this._nextFrameId();
    const frame: CommandFrame = {
      id,
      type: 'cmd',
      cmd: name,
      ...(payload === undefined ? {} : { payload }),
    };
    const timeoutMs = options?.timeoutMs ?? this._defaultTimeoutMs;
    const resultPromise = this._registerPending<R>(id, timeoutMs);
    try {
      await this._sendThroughMiddleware(frame);
    } catch (err) {
      // The send path threw before the frame reached the wire, so no
      // `result` will ever arrive to settle this pending. Drop it (clear
      // the armed timeout + map entry) and reject the caller — otherwise
      // the orphaned pending's timeout would later reject a promise
      // nobody holds, surfacing as a process-fatal unhandled rejection.
      this._clearPending(id);
      throw err;
    }
    return resultPromise;
  }

  /**
   * Subscribe to a channel. The `handler` is invoked for every `msg`
   * frame the server publishes to the channel. Returns a
   * {@link ClientSubscription} handle — call `.unsubscribe()` to stop
   * receiving messages.
   *
   * Resolves once the server acks with a `subscribed` frame. If the
   * server refuses (channel not registered, authorize failed, etc.),
   * the returned Promise rejects with the error message.
   *
   * If a subscription for the same channel already exists, the new
   * handler **replaces** the old one (the server already has the
   * subscription; we don't re-`sub` over the wire).
   */
  async subscribe(
    channel: string,
    handler: (data: unknown) => void,
  ): Promise<ClientSubscription> {
    this._assertSendable();
    const existing = this._subscriptions.get(channel);
    if (existing) {
      existing.handler = handler;
      return this._makeSubscriptionHandle(channel);
    }
    const sub = this._registerSubscription(channel, handler);
    const id = this._nextFrameId();
    const frame: SubscribeFrame = { id, type: 'sub', channel };
    // Register the sub frame's id as pending too, so an error
    // `result` frame (e.g. UNKNOWN_CHANNEL, FORBIDDEN) rejects the
    // subscribe call. The `subscribed` frame resolves
    // `sub.pendingAck`; whichever fires first wins.
    const errorIfAny = this._registerPending<void>(
      id,
      this._defaultTimeoutMs,
    );
    // The pending entry exists only so an error/timeout `result` frame
    // can reject this call; the success path is carried by
    // `sub.pendingAck` (the server emits `subscribed`, not an `ok`
    // result). Whichever settles first wins the race — but the loser is
    // still live, so its timeout could fire and reject later. Clear the
    // pending unconditionally in `finally` once the race settles to
    // drop the timer and the map entry no matter which branch won.
    // Pre-attach a catch on `errorIfAny` so that, if it loses the race,
    // its eventual (now-defused) settlement never surfaces as an
    // unhandled rejection.
    errorIfAny.catch(() => {});
    try {
      await this._sendThroughMiddleware(frame);
      await Promise.race([sub.pendingAck, errorIfAny]);
    } catch (err) {
      this._subscriptions.delete(channel);
      throw err;
    } finally {
      const p = this._pending.get(id);
      if (p?.timeoutHandle !== undefined) clearTimeout(p.timeoutHandle);
      this._pending.delete(id);
    }
    return this._makeSubscriptionHandle(channel);
  }

  /**
   * Publish a payload to a channel. The server's channel
   * `onPublish` hook (if registered) decides what to do with it
   * (e.g. fan out via `server.publish`).
   *
   * Resolves once the server acks with a `result` frame.
   *
   * @throws If the send path throws (a throwing `useSend` middleware, or
   *   the socket leaving `OPEN` mid-send), the returned Promise rejects
   *   with that error and the pending entry is dropped — no orphaned
   *   pending is left to reject later as an unhandled rejection.
   */
  async publish(channel: string, payload: unknown): Promise<void> {
    this._assertSendable();
    const id = this._nextFrameId();
    // Normalize an `undefined` payload to `null`. `PublishFrame.payload` is a
    // REQUIRED field and the server's pub decoder rejects any frame missing it
    // (`'payload' in obj`, see protocol.ts). But `JSON.stringify` DROPS a key
    // whose value is `undefined`, so `publish(channel, undefined)` would emit
    // `{"id":…,"type":"pub","channel":…}` — no `payload` key — which the server
    // treats as malformed and answers with an id-less BAD_FORMAT `error` frame
    // the client can't correlate, hanging the call until its request timeout.
    // `null` is an accepted payload and survives serialization, so undefined
    // now behaves exactly like `publish(channel, null)`. (Unlike CommandFrame,
    // whose `payload` is optional and whose decoder tolerates its absence, so
    // `command()` can omit the key.)
    const frame: PublishFrame = {
      id,
      type: 'pub',
      channel,
      payload: payload === undefined ? null : payload,
    };
    const ack = this._registerPending<void>(id, this._defaultTimeoutMs);
    try {
      await this._sendThroughMiddleware(frame);
    } catch (err) {
      // See `command()`: drop the orphaned pending on a send-path throw
      // so its timeout can't later reject a promise nobody holds.
      this._clearPending(id);
      throw err;
    }
    await ack;
  }

  /**
   * Close the connection and stop reconnecting. Idempotent. Any
   * in-flight commands reject with `CLOSED`.
   *
   * Stops reconnecting **even when called during backoff** — while the
   * client is parked between retries `state` reads `'DISCONNECTED'`, but this
   * still latches the close intent and cancels the pending retry, so the
   * client will not silently reconnect when the server returns. A later
   * `connect()` clears that intent and reconnects normally.
   */
  async close(): Promise<void> {
    // A second close() while a prior one is still tearing down is a no-op.
    if (this._state === 'CLOSING') {
      return;
    }
    // Latch the close intent and cancel any parked reconnect FIRST — before
    // inspecting state. During reconnect backoff `state` reads DISCONNECTED,
    // so an early `if (state === 'DISCONNECTED') return` (as this used to have)
    // would let close() no-op while the backoff timer stayed armed, and the
    // client would reconnect the instant the server returned — the opposite of
    // "close stops reconnecting". Setting `_closeRequested` before waking the
    // parked chain also makes any woken `_scheduleReconnect` unwind instead of
    // opening a socket. `connect()` resets `_closeRequested`, so this never
    // wedges a later reconnect the caller actually wants.
    this._closeRequested = true;
    this._clearReconnectTimer();
    if (this._state === 'DISCONNECTED') {
      // Parked in backoff (or already idle): nothing to tear down beyond the
      // reconnect just cancelled. Drop any dead socket reference and stop.
      this._ws = null;
      return;
    }
    this._state = 'CLOSING';
    this._rejectAllPending(new Error('CLOSED'));
    if (this._ws) {
      const closing = new Promise<void>((resolve) => {
        const ws = this._ws!;
        if (ws.readyState === 3 /* CLOSED */) {
          resolve();
          return;
        }
        const onClose = () => {
          ws.removeEventListener('close', onClose);
          resolve();
        };
        ws.addEventListener('close', onClose);
        try {
          ws.close(1000, 'client.close()');
        } catch {
          resolve();
        }
      });
      await closing;
    }
    this._ws = null;
    this._state = 'DISCONNECTED';
  }

  // =========================================================================
  // Internals
  // =========================================================================

  /**
   * Mint the next frame id, shaped `c<connId>-<n>`. The connection nonce
   * keeps ids unique across reconnects, so a late `result` from a dead
   * socket can never resolve a request minted on the new one.
   */
  protected _nextFrameId(): string {
    this._nextId++;
    return `c${this._connId}-${this._nextId}`;
  }

  /**
   * Guard every public send path against a non-`CONNECTED` state.
   *
   * @throws {@link RpcStateError} When the client is not connected.
   */
  protected _assertSendable(): void {
    if (this._state !== 'CONNECTED') {
      throw new RpcStateError(`Client not connected (state=${this._state})`);
    }
  }

  /**
   * Open one WebSocket and settle on its first `open` or `error`. On
   * success it bumps the connection nonce, wires the socket handlers, and
   * replays surviving subscriptions; on failure state returns to
   * `'DISCONNECTED'` and the error is re-thrown to the caller.
   */
  protected _openSocket(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this._state = 'CONNECTING';
      let ws: WebSocket;
      try {
        ws = new WebSocket(this._opts.url, this._opts.protocols);
      } catch (err) {
        this._state = 'DISCONNECTED';
        reject(err);
        return;
      }
      this._ws = ws;
      const onOpen = () => {
        ws.removeEventListener('open', onOpen);
        ws.removeEventListener('error', onErrorBeforeOpen);
        this._state = 'CONNECTED';
        this._reconnectAttempt = 0;
        // Fresh nonce for this socket so frame ids never collide with a
        // stale reply from a previous connection. Reset the counter too
        // — the nonce carries cross-connection uniqueness.
        this._connId++;
        this._nextId = 0;
        this._wireSocketHandlers(ws);
        // Re-subscribe to any channels that survived a previous
        // connection. Errors here don't fail connect() — the
        // subscription's own pendingAck Promise carries them.
        this._resubscribeAll();
        resolve();
      };
      const onErrorBeforeOpen = (_event: Event) => {
        ws.removeEventListener('open', onOpen);
        ws.removeEventListener('error', onErrorBeforeOpen);
        this._state = 'DISCONNECTED';
        reject(new Error(`WebSocket failed to open (url=${this._opts.url})`));
      };
      ws.addEventListener('open', onOpen);
      ws.addEventListener('error', onErrorBeforeOpen);
    });
  }

  /**
   * Attach the steady-state `message` / `close` / `error` listeners to a
   * socket that has already opened. Non-string messages are dropped — the
   * server only ever sends text JSON.
   */
  protected _wireSocketHandlers(ws: WebSocket): void {
    ws.addEventListener('message', (event: MessageEvent) => {
      // The wire format is text JSON. Binary frames are unexpected
      // and dropped — the server never emits them.
      if (typeof event.data !== 'string') return;
      const frame = this._parseOutboundFrame(event.data);
      if (!frame) return;
      void this._receiveThroughMiddleware(frame);
    });
    ws.addEventListener('close', (event: CloseEvent) => {
      this._handleClose(event);
    });
    ws.addEventListener('error', (_event: Event) => {
      // Mid-connection errors are reported but the actual cleanup
      // happens on the subsequent 'close' event.
    });
  }

  /**
   * React to the socket closing: reject every in-flight request with
   * `CONNECTION_LOST`, drop outstanding unsub correlations, and arm the
   * backoff — but only when the close was not requested by {@link close}
   * and the socket had actually reached `'CONNECTED'`.
   */
  protected _handleClose(_event: CloseEvent): void {
    const wasConnected = this._state === 'CONNECTED';
    this._ws = null;
    this._state = 'DISCONNECTED';
    this._rejectAllPending(new Error('CONNECTION_LOST'));
    // Any `unsubscribed` ack we were still waiting for can no longer arrive
    // on this (now-dead) socket, so drop the correlation ids. Frame ids are
    // connection-scoped (`c<connId>-…`), so a stale id could never match a
    // future ack anyway; clearing here just bounds the set instead of
    // leaking one entry per never-acked unsub across a connection's life.
    this._pendingUnsubs.clear();
    if (!this._closeRequested && wasConnected && this._reconnect.enabled) {
      void this._scheduleReconnect();
    }
  }

  /**
   * Sleep out one exponential-backoff delay, then reopen — recursing on
   * failure until `maxAttempts` is spent, at which point
   * {@link ClientOptions.onReconnectFailed} fires and retrying stops.
   * Unparks early and bails if {@link close} or a manual {@link connect}
   * intervenes, so it can never open a second concurrent socket.
   */
  protected async _scheduleReconnect(): Promise<void> {
    if (this._reconnectAttempt >= this._reconnect.maxAttempts) {
      // Exhausted every attempt. Previously this returned silently,
      // leaving callers with no signal that the client had given up and
      // would no longer retry. Surface it so the app can react.
      this._opts.onReconnectFailed?.(this._reconnectAttempt);
      return;
    }
    this._reconnectAttempt++;
    const delay = Math.min(
      this._reconnect.initialDelayMs *
        Math.pow(this._reconnect.backoffFactor, this._reconnectAttempt - 1),
      this._reconnect.maxDelayMs,
    );
    // Store the timer handle so `close()` can cancel the backoff, and
    // the resolver so `close()` can also unpark this function at once
    // (rather than leaving it awaiting a timer that was just cleared).
    await new Promise<void>((resolve) => {
      this._reconnectWake = resolve;
      this._reconnectTimer = setTimeout(() => {
        this._reconnectTimer = undefined;
        this._reconnectWake = undefined;
        resolve();
      }, delay);
    });
    if (this._closeRequested) return;
    // A manual connect() (or a prior reconnect chain) may have already
    // opened — or begun opening — a socket while we were parked in backoff.
    // `connect()` cancels this timer, but a concurrently-firing timer, or a
    // second parked reconnect chain, can still resume here. Opening another
    // socket now would leave two live sockets wired to this Client (double
    // message delivery, and the abandoned socket's close corrupting the live
    // one's state). Only proceed from a genuinely disconnected state.
    if (this._state === 'CONNECTED' || this._state === 'CONNECTING') return;
    try {
      await this._openSocket();
    } catch {
      void this._scheduleReconnect();
    }
  }

  /** Cancel a pending reconnect backoff and unpark `_scheduleReconnect`. */
  protected _clearReconnectTimer(): void {
    if (this._reconnectTimer !== undefined) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = undefined;
    }
    if (this._reconnectWake) {
      const wake = this._reconnectWake;
      this._reconnectWake = undefined;
      wake();
    }
  }

  /**
   * Record an in-flight request under `id` and return the promise its
   * `result` frame will settle.
   *
   * @param timeoutMs - Arms a `REQUEST_TIMEOUT` rejection; `0` or less
   *   leaves the request pending indefinitely.
   */
  protected _registerPending<R>(
    id: string,
    timeoutMs: number,
  ): Promise<R> {
    return new Promise<R>((resolve, reject) => {
      let timeoutHandle: number | undefined;
      if (timeoutMs > 0) {
        timeoutHandle = setTimeout(() => {
          this._pending.delete(id);
          reject(new Error('REQUEST_TIMEOUT'));
        }, timeoutMs) as unknown as number;
      }
      this._pending.set(id, {
        resolve: (data) => resolve(data as R),
        reject,
        timeoutHandle,
      });
    });
  }

  /**
   * Drop a pending entry by id without settling it: cancel its armed
   * timeout and remove it from the map. Used on send-path failures where
   * the request never reached the wire, so leaving the entry (and its
   * timer) live would later reject a promise nobody holds.
   */
  protected _clearPending(id: string): void {
    const p = this._pending.get(id);
    if (!p) return;
    if (p.timeoutHandle !== undefined) clearTimeout(p.timeoutHandle);
    this._pending.delete(id);
  }

  /** Reject and clear every in-flight request, cancelling their timeouts. */
  protected _rejectAllPending(err: Error): void {
    for (const [id, pending] of this._pending) {
      if (pending.timeoutHandle !== undefined) {
        clearTimeout(pending.timeoutHandle);
      }
      pending.reject(err);
      this._pending.delete(id);
    }
  }

  /**
   * Create the local subscription record for `channel`, including the
   * `pendingAck` promise that the server's `subscribed` frame resolves.
   * Overwrites any existing record for the same channel.
   */
  protected _registerSubscription(
    channel: string,
    handler: (data: unknown) => void,
  ): _ChannelSubscription {
    let ackResolve!: () => void;
    let ackReject!: (err: Error) => void;
    const pendingAck = new Promise<void>((resolve, reject) => {
      ackResolve = resolve;
      ackReject = reject;
    });
    const sub: _ChannelSubscription = {
      handler,
      pendingAck,
      ackResolve,
      ackReject,
    };
    this._subscriptions.set(channel, sub);
    return sub;
  }

  /**
   * Build the caller-facing {@link ClientSubscription} handle. Its
   * `unsubscribe()` is idempotent per handle and best-effort — it never
   * throws, since the server drops subscriptions on close regardless.
   */
  protected _makeSubscriptionHandle(channel: string): ClientSubscription {
    let unsubscribed = false;
    return {
      channel,
      unsubscribe: async () => {
        if (unsubscribed) return;
        unsubscribed = true;
        const sub = this._subscriptions.get(channel);
        if (!sub) return;
        this._subscriptions.delete(channel);
        if (this._state !== 'CONNECTED') return;
        const id = this._nextFrameId();
        const frame: UnsubscribeFrame = { id, type: 'unsub', channel };
        // Track this id so the eventual `unsubscribed` ack is recognised
        // as confirmation of OUR unsub (a no-op for the subscription map)
        // rather than a server-initiated drop — otherwise, in an
        // unsub-then-resubscribe sequence, the in-flight ack would delete
        // the freshly re-created subscription (see `_dispatchSubAck`).
        this._pendingUnsubs.add(id);
        // Register a pending keyed by the unsub id so we can honour the
        // documented contract: resolve once the server acks. Pre-attach a
        // catch so a timeout / connection-loss rejection never surfaces as
        // an unhandled rejection — `unsubscribe()` is best-effort and must
        // never throw.
        const ackWait = this._registerPending<void>(
          id,
          this._defaultTimeoutMs,
        );
        ackWait.catch(() => {});
        try {
          await this._sendThroughMiddleware(frame);
          await ackWait;
        } catch {
          // Best-effort — the server cleans subs up on close anyway.
        } finally {
          // Drop only the pending request (its armed timeout). Deliberately
          // KEEP this id in `_pendingUnsubs` until the matching
          // `unsubscribed` ack actually arrives (which removes it in
          // `_dispatchSubAck`) or the connection drops (`_handleClose`
          // clears the set). If `ackWait` rejected via timeout, the ack is
          // still in flight; removing the id here — as this `finally` used
          // to — would let that late ack fall through to the
          // server-initiated branch in `_dispatchSubAck` and delete a
          // subscription that may have been re-created for this same
          // channel in the meantime (silent, permanent message loss).
          this._clearPending(id);
        }
      },
    };
  }

  /**
   * Replay every surviving subscription over a freshly opened socket.
   * Fire-and-forget: failures don't fail {@link connect}, they surface
   * through {@link ClientOptions.onSubscriptionError}.
   */
  protected _resubscribeAll(): void {
    // Replay subscriptions after a reconnect. Each gets a fresh
    // pendingAck so callers that re-await the subscription handle
    // observe the new server ack. In-place mutation keeps the existing
    // handle valid.
    for (const [channel, sub] of this._subscriptions) {
      let ackResolve!: () => void;
      let ackReject!: (err: Error) => void;
      sub.pendingAck = new Promise<void>((resolve, reject) => {
        ackResolve = resolve;
        ackReject = reject;
      });
      // The refreshed pendingAck may reject (server refuses the replayed
      // subscribe); pre-attach a catch so its rejection never surfaces as
      // an unhandled rejection — the app is told via onSubscriptionError.
      sub.pendingAck.catch(() => {});
      sub.ackResolve = ackResolve;
      sub.ackReject = ackReject;
      const id = this._nextFrameId();
      const frame: SubscribeFrame = { id, type: 'sub', channel };
      // Register a pending entry keyed by this sub frame's id so a server
      // error `result` (FORBIDDEN / UNKNOWN_CHANNEL after a revoked role)
      // rejects it instead of being silently dropped by _dispatchResult.
      // On success the `subscribed` ack clears this pending — see
      // _dispatchSubAck. Mirrors how the initial subscribe() registers a
      // pending so an authz denial is surfaced rather than swallowed.
      const errorIfAny = this._registerPending<void>(
        id,
        this._defaultTimeoutMs,
      );
      errorIfAny.catch((err) =>
        this._handleResubscribeFailure(channel, err as Error)
      );
      void this._sendThroughMiddleware(frame).catch((err) => {
        // Couldn't even send the frame — drop the (now never-answered)
        // pending and treat it as a resubscribe failure.
        const p = this._pending.get(id);
        if (p?.timeoutHandle !== undefined) clearTimeout(p.timeoutHandle);
        this._pending.delete(id);
        this._handleResubscribeFailure(channel, err as Error);
      });
    }
  }

  /**
   * Handle a re-subscribe (after a reconnect) that the server refused,
   * the network dropped, or that timed out. Idempotent per channel:
   * removes the now-dead subscription, rejects its refreshed
   * `pendingAck`, and notifies the app via
   * {@link ClientOptions.onSubscriptionError}. Without this, a denied
   * re-subscribe would leave a subscription half-alive — present in the
   * map, never delivering, its `pendingAck` never settling.
   */
  protected _handleResubscribeFailure(channel: string, error: Error): void {
    const sub = this._subscriptions.get(channel);
    if (!sub) return; // already cleaned up / unsubscribed / handled once
    this._subscriptions.delete(channel);
    sub.ackReject(error);
    this._opts.onSubscriptionError?.(channel, error);
  }

  /**
   * Run `frame` through the {@link useSend} chain; the final `next()`
   * writes it to the wire. A middleware that skips `next()` silently drops
   * the frame, leaving the caller's request to time out.
   *
   * @throws {@link RpcStateError} When a middleware calls `next()` twice.
   */
  protected async _sendThroughMiddleware(frame: InboundFrame): Promise<void> {
    const ctx: ClientSendContext = { frame, state: {} };
    const chain = this._sendMiddleware;
    let index = -1;
    const runner = async (i: number): Promise<void> => {
      if (i <= index) {
        throw new RpcStateError(
          'useSend middleware called next() multiple times',
        );
      }
      index = i;
      const mw = chain[i];
      if (mw) {
        await mw(ctx, () => runner(i + 1));
        return;
      }
      this._writeFrame(ctx.frame);
    };
    await runner(0);
  }

  /**
   * Serialize and write a frame to the live socket.
   *
   * @throws {@link RpcStateError} When the socket is absent or not `OPEN`
   *   — including when it closed mid-send, after the caller's own
   *   `_assertSendable` guard already passed.
   */
  protected _writeFrame(frame: InboundFrame): void {
    if (!this._ws || this._ws.readyState !== 1 /* OPEN */) {
      throw new RpcStateError('Client not connected');
    }
    // encodeFrame is typed for OutboundFrame but is just JSON.stringify
    // — the wire envelope shape is identical in either direction.
    this._ws.send(encodeFrame(frame as unknown as OutboundFrame));
  }

  /**
   * Parse a server-sent text frame into an {@link OutboundFrame}.
   *
   * The shared `decodeFrame` helper in `protocol.ts` is hardcoded to the
   * server's input side (`InboundFrame`: `cmd` / `sub` / `unsub` /
   * `pub`) and returns null for anything else — so the client has to
   * do its own envelope validation. We accept the five
   * client-facing types (`result` / `subscribed` / `unsubscribed` /
   * `msg` / `error`) and drop everything else as malformed.
   */
  protected _parseOutboundFrame(raw: string): OutboundFrame | null {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return null;
    }
    if (typeof parsed !== 'object' || parsed === null) return null;
    const obj = parsed as Record<string, unknown>;
    if (typeof obj.type !== 'string') return null;
    switch (obj.type) {
      case 'result':
        if (typeof obj.id !== 'string') return null;
        if (obj.ok === true) {
          return { id: obj.id, type: 'result', ok: true, data: obj.data };
        }
        if (obj.ok === false) {
          const err = obj.error as
            | { code?: unknown; message?: unknown; data?: unknown }
            | null;
          if (
            !err || typeof err.code !== 'string' ||
            typeof err.message !== 'string'
          ) {
            return null;
          }
          return {
            id: obj.id,
            type: 'result',
            ok: false,
            // `data` is optional structured detail; absent from peers
            // that predate it, so it is carried through as-is and
            // never validated into a rejection.
            error: {
              code: err.code,
              message: err.message,
              ...(err.data === undefined ? {} : { data: err.data }),
            },
          };
        }
        return null;
      case 'subscribed':
      case 'unsubscribed':
        if (typeof obj.id !== 'string' || typeof obj.channel !== 'string') {
          return null;
        }
        return {
          id: obj.id,
          type: obj.type,
          channel: obj.channel,
        };
      case 'msg':
        if (typeof obj.channel !== 'string') return null;
        return { type: 'msg', channel: obj.channel, data: obj.data };
      case 'error':
        if (typeof obj.code !== 'string' || typeof obj.message !== 'string') {
          return null;
        }
        return {
          ...(typeof obj.id === 'string' ? { id: obj.id } : {}),
          type: 'error',
          code: obj.code,
          message: obj.message,
        };
      default:
        return null;
    }
  }

  /**
   * Run `frame` through the {@link useReceive} chain; the final `next()`
   * dispatches it. A middleware that throws is logged and swallowed so one
   * bad frame can't take down the receive loop.
   */
  protected async _receiveThroughMiddleware(
    frame: OutboundFrame,
  ): Promise<void> {
    const ctx: ClientReceiveContext = { frame, state: {} };
    const chain = this._receiveMiddleware;
    let index = -1;
    const runner = async (i: number): Promise<void> => {
      if (i <= index) {
        throw new RpcStateError(
          'useReceive middleware called next() multiple times',
        );
      }
      index = i;
      const mw = chain[i];
      if (mw) {
        await mw(ctx, () => runner(i + 1));
        return;
      }
      this._dispatchFrame(ctx.frame);
    };
    try {
      await runner(0);
    } catch (err) {
      // Middleware errors don't take down the receive loop; surface
      // for visibility but keep the connection alive.
      // deno-lint-ignore no-console
      console.error('rpc.Client: receive middleware threw:', err);
    }
  }

  /**
   * Route a validated server frame to its per-type dispatcher. An
   * out-of-band `error` frame rejects the request its `id` correlates
   * to — with the frame's `code` attached, matching the `result` reject
   * path; an uncorrelated one is dropped (observable via
   * {@link useReceive}).
   */
  protected _dispatchFrame(frame: OutboundFrame): void {
    switch (frame.type) {
      case 'result':
        this._dispatchResult(frame);
        return;
      case 'subscribed':
      case 'unsubscribed':
        this._dispatchSubAck(frame);
        return;
      case 'msg':
        this._dispatchMessage(frame);
        return;
      case 'error':
        // Out-of-band error. If correlated with a pending request,
        // reject that request; otherwise drop (middleware can observe
        // via useReceive).
        if (frame.id) {
          const pending = this._pending.get(frame.id);
          if (pending) {
            if (pending.timeoutHandle !== undefined) {
              clearTimeout(pending.timeoutHandle);
            }
            // Same shape as the `result` reject path: message format
            // unchanged (`CODE: text`), with `code` attached so callers
            // branch on protocol failures the same way they branch on
            // handler failures. No `data` — the `error` frame has none.
            pending.reject(rejectionError(frame.code, frame.message));
            this._pending.delete(frame.id);
          }
        }
        return;
    }
  }

  /**
   * Settle the request correlated with a `result` frame. On `ok: false`
   * the rejection is an `Error` messaged `` `${code}: ${message}` `` with
   * `.code` and any structured `.data` attached as properties. A frame
   * whose id matches nothing (a late reply after a timeout) is dropped.
   */
  protected _dispatchResult(frame: ResultFrame): void {
    const pending = this._pending.get(frame.id);
    if (!pending) return;
    if (pending.timeoutHandle !== undefined) {
      clearTimeout(pending.timeoutHandle);
    }
    this._pending.delete(frame.id);
    if (frame.ok) {
      pending.resolve(frame.data);
    } else {
      // The message format is unchanged (`CODE: text`); `code` and any
      // structured `data` are ALSO attached as properties, so callers
      // can branch on the code and read the detail without parsing the
      // string.
      pending.reject(
        rejectionError(frame.error.code, frame.error.message, frame.error.data),
      );
    }
  }

  /**
   * Handle a `subscribed` / `unsubscribed` ack. An `unsubscribed` whose id
   * we sent just settles the waiting `unsubscribe()`; one we never sent is
   * a server-initiated drop and removes the local subscription.
   */
  protected _dispatchSubAck(frame: SubscribedFrame): void {
    if (frame.type === 'unsubscribed') {
      // Correlate against our own outstanding unsub before touching the
      // map. The server echoes our unsub id, so a matching id means this
      // is confirmation of an unsub WE sent: `unsubscribe()` already
      // removed the local entry, and a channel that has since been
      // re-subscribed (a fresh entry under the same name) must NOT be
      // clobbered by this stale ack. Just settle the awaiting
      // `unsubscribe()` (if it hasn't already resolved via timeout — a late
      // ack finds no pending here, which is fine) and stop. Only an id we
      // never sent is a genuine server-initiated unsubscribe, which cleans
      // up the subscription.
      if (this._pendingUnsubs.delete(frame.id)) {
        const pending = this._pending.get(frame.id);
        if (pending) {
          if (pending.timeoutHandle !== undefined) {
            clearTimeout(pending.timeoutHandle);
          }
          this._pending.delete(frame.id);
          pending.resolve(undefined);
        }
        return;
      }
      // Server-initiated unsubscribe — clean up locally.
      this._subscriptions.delete(frame.channel);
      return;
    }
    const sub = this._subscriptions.get(frame.channel);
    if (!sub) return;
    sub.ackResolve();
    // Settle and drop the frame-id pending registered by subscribe() /
    // _resubscribeAll. subscribe() also clears it in its own `finally`,
    // but a fire-and-forget resubscribe has no such cleanup — without
    // this, its timeout would later fire a false resubscribe failure.
    const pending = this._pending.get(frame.id);
    if (pending) {
      if (pending.timeoutHandle !== undefined) {
        clearTimeout(pending.timeoutHandle);
      }
      this._pending.delete(frame.id);
      pending.resolve(undefined);
    }
  }

  /**
   * Deliver a `msg` frame to its channel handler. Messages for unknown
   * channels are dropped, and a throwing handler is logged rather than
   * allowed to break the receive loop.
   */
  protected _dispatchMessage(frame: MessageFrame): void {
    const sub = this._subscriptions.get(frame.channel);
    if (!sub) return;
    try {
      sub.handler(frame.data);
    } catch (err) {
      // Handler exceptions don't take down the receive loop.
      // deno-lint-ignore no-console
      console.error(`rpc.Client: handler for '${frame.channel}' threw:`, err);
    }
  }
}
