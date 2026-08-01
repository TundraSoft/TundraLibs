import type { ReconnectPolicy } from './ReconnectPolicy.ts';

/** Construction options for `Client`. */
export type ClientOptions = {
  /** WebSocket URL — `ws://` or `wss://`. Required. */
  url: string;

  /** Optional sub-protocol(s) sent in the WebSocket handshake. */
  protocols?: string | string[];

  /**
   * Default timeout for `command()` calls, in milliseconds. A
   * pending command that doesn't get a `result` frame within this
   * window rejects with `REQUEST_TIMEOUT`. Default: `30_000`.
   *
   * Pass `0` to disable timeouts entirely. **Caution:** with
   * timeouts disabled, the client's internal pending-request map
   * only releases entries on `result` frame arrival or on
   * connection close (which calls the internal reject-all path).
   * A server that accepts commands but never replies — while
   * keeping the connection alive — will cause the map to grow
   * unbounded. Apply your own ceiling via send-side middleware if
   * you have a use case for `0` over a long-lived connection.
   */
  defaultTimeoutMs?: number;

  /**
   * Reconnect policy. Defaults to enabled with exponential
   * backoff — see {@link ReconnectPolicy}. Pass `{ enabled: false }`
   * to opt out.
   */
  reconnect?: ReconnectPolicy;

  /**
   * Called when a subscription that survived a reconnect is refused by
   * the server as it is replayed — e.g. the connection's authorization
   * was revoked while it was disconnected, so the fresh `sub` frame
   * comes back `FORBIDDEN` (or `UNKNOWN_CHANNEL` if the channel is gone).
   *
   * Without this hook a denied re-subscribe would fail silently: the
   * server drops the frame and the client would otherwise keep a dead
   * entry in its subscription map that never delivers again. When it
   * fires, the dead subscription has already been removed — use it to
   * alert, tear down UI bound to that channel, or attempt a fresh
   * `subscribe()`.
   *
   * @param channel - Channel whose re-subscribe was refused.
   * @param error - The server-side error (message carries the code).
   */
  onSubscriptionError?: (channel: string, error: Error) => void;

  /**
   * Called when auto-reconnect gives up after exhausting
   * `reconnect.maxAttempts` consecutive failed attempts. Until this
   * fires the retries are silent; afterwards the client stays
   * `DISCONNECTED` and will not retry on its own. Surface it, retry
   * manually via `connect()`, or tear down.
   *
   * @param attempts - Number of failed attempts made before giving up.
   */
  onReconnectFailed?: (attempts: number) => void;
};
