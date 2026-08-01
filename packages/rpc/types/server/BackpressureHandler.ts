import type { ServerWebSocket } from '@tundralibs/compat/webserver';

/**
 * Backpressure observation handler — fired when a connection's
 * outbound buffer crosses `ServerOptions.backpressureThreshold`
 * after a server-side send.
 *
 * @typeParam T - Connection data type.
 */
export type BackpressureHandler<T = unknown> = (
  ws: ServerWebSocket<T>,
  bufferedAmount: number,
) => void | Promise<void>;
