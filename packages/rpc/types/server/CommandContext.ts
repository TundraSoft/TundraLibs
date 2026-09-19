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
   * Metadata to send ALONGSIDE the handler's return value, in the
   * result frame's `meta` field rather than inside `data` — a total and
   * page window for a paged command, say. Left unset, the frame carries
   * no `meta` at all. Middleware may set or amend it; the value is read
   * once, after the handler returns.
   */
  meta?: Record<string, unknown>;
  /**
   * Mutable per-request state shared across the middleware chain.
   * Use this for cross-cutting concerns (auth, timing, request id).
   */
  state: Record<string, unknown>;
};
