import type { UpgradeDecision } from '../../webserver/types/mod.ts';
import type { Codec } from './Codec.ts';

/**
 * Construction options for `WebSocketServer`.
 *
 * @typeParam T - Connection data type.
 * @typeParam M - Decoded message type — defaults to `string` (text
 *   frames passed through unchanged via `StringCodec`).
 */
export type WebSocketServerOptions<T = unknown, M = string> = {
  /**
   * Codec for incoming/outgoing messages. Defaults to `StringCodec`
   * (identity for text frames). Provide a different codec when
   * working with JSON, binary, or any custom shape.
   */
  codec?: Codec<M>;

  /**
   * Upgrade hook applied to incoming WebSocket connections. Use it
   * to authenticate, refuse, or attach typed connection state (`T`).
   *
   * Returning `false` falls through to the WebServer's HTTP handler.
   */
  upgrade?: (
    request: Request,
    info: { remoteAddress: string | null; remotePort: number | null },
  ) => UpgradeDecision<T> | Promise<UpgradeDecision<T>>;

  /**
   * Maximum accepted incoming frame size in bytes. Frames larger
   * than this are dropped before decoding and routed to
   * `WebSocketServer.onDecodeError` with `reason='oversize'`.
   * Default: `1_048_576` (1 MB). Set to `0` to disable the check.
   *
   * For string frames the byte length is computed via UTF-8
   * encoding; a fast-path bound (`length` and `length * 4`) avoids
   * the allocation for the common cases.
   */
  maxFrameSize?: number;

  /**
   * When set, after every send via `WebSocketServer.send` or
   * `WebSocketServer.broadcast`, if `ws.bufferedAmount` exceeds
   * this many bytes, the configured `onBackpressure` handler fires
   * for that connection. Default: `undefined` (no observation).
   *
   * Backpressure observation does **not** fire for direct
   * `ctx.ws.send(...)` calls — only for sends that go through the
   * server's helpers. For direct sends, read `ws.bufferedAmount`
   * yourself.
   */
  backpressureThreshold?: number;
};
