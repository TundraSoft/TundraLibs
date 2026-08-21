import type { UpgradeDecision } from '@tundralibs/compat/webserver';
import type { PubSubAdapter } from '../../pubsub/mod.ts';
import type { BackpressureHandler } from './BackpressureHandler.ts';

/**
 * Construction options for `Server`.
 *
 * @typeParam T - Connection data type.
 */
export type ServerOptions<T = unknown> = {
  /**
   * Pub/sub adapter. When omitted, an in-memory adapter is used —
   * fine for single-process deployments. For cross-process
   * broadcast (multiple node instances behind a load balancer)
   * plug in an adapter backed by Redis or another shared substrate.
   */
  pubsub?: PubSubAdapter;

  /**
   * Upgrade hook applied to incoming WebSocket connections — same
   * shape as `WebSocketHandler`'s `upgrade`. Use it to
   * authenticate, refuse, or attach typed connection state (`T`).
   *
   * Returning `false` falls through to the WebServer's HTTP
   * handler (so non-WS routes still work).
   */
  upgrade?: (
    request: Request,
    info: { remoteAddress: string | null; remotePort: number | null },
  ) => UpgradeDecision<T> | Promise<UpgradeDecision<T>>;

  /**
   * Maximum accepted incoming frame size in bytes. Frames over
   * this limit are rejected with a `FRAME_TOO_LARGE` error frame
   * before decoding. Default: `1_048_576` (1 MB). Set to `0` to
   * disable.
   */
  maxFrameSize?: number;

  /**
   * Soft cap on per-connection outbound buffer in bytes. When set,
   * after every server-initiated send (`publish`, `result`, `msg`,
   * `subscribed`, …) — if `ws.bufferedAmount` exceeds this many
   * bytes, the configured `onBackpressure` handler fires for that
   * connection. Default: `undefined` (no observation).
   */
  backpressureThreshold?: number;

  /**
   * Called when an outbound buffer crosses
   * `backpressureThreshold` after a server-side send. The handler
   * is purely informational — implement your own policy (close,
   * log, drop further sends, …).
   */
  onBackpressure?: BackpressureHandler<T>;
};
