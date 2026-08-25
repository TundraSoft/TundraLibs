import type { ServerWebSocket } from '@tundralibs/compat/webserver';

/**
 * Fired when a server-initiated send (`publish`, `result`, `msg`,
 * `subscribed`, …) throws while `ws.readyState` is still `OPEN` — i.e.
 * NOT the ordinary closed-mid-flight case, which is swallowed silently
 * the same as before this hook existed.
 *
 * @typeParam T - Connection data type.
 */
export type SendErrorHandler<T = unknown> = (
  ws: ServerWebSocket<T>,
  error: unknown,
) => void | Promise<void>;
