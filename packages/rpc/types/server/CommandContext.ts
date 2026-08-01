import type { ServerWebSocket } from '@tundralibs/compat/webserver';

/**
 * Per-command execution context — passed to middleware and the
 * handler.
 *
 * @typeParam T - Connection data type (from the Server's `T`).
 * @typeParam P - Validated payload type.
 */
export type CommandContext<T = unknown, P = unknown> = {
  /** The WebSocket connection. */
  ws: ServerWebSocket<T>;
  /** Command name (matches the registered name). */
  cmd: string;
  /** Frame id — useful for logging / correlation. */
  id: string;
  /** Validated payload. */
  payload: P;
  /**
   * Mutable per-request state shared across the middleware chain.
   * Use this for cross-cutting concerns (auth, timing, request id).
   */
  state: Record<string, unknown>;
};
