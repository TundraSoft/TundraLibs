import type { ServerWebSocket } from '../../webserver/types/mod.ts';

/**
 * Per-message execution context — passed to middleware and the
 * `onMessage` handler.
 *
 * @typeParam T - Connection data type (from the server's `T`).
 * @typeParam M - Decoded message type.
 */
export type MessageContext<T = unknown, M = string> = {
  /** The WebSocket connection. */
  ws: ServerWebSocket<T>;
  /** Decoded message payload. */
  message: M;
  /**
   * Mutable per-message state shared across the middleware chain.
   * Use this for cross-cutting concerns (auth, timing, request id).
   * Reset to `{}` on every incoming message.
   */
  state: Record<string, unknown>;
};
