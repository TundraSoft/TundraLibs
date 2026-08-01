import type { ServerWebSocket } from '@tundralibs/compat/webserver';

/**
 * Channel-related context — passed to channel hooks (`authorize`,
 * `onSubscribe`, `onPublish`, …).
 *
 * @typeParam T - Connection data type.
 */
export type ChannelContext<T = unknown> = {
  /** The WebSocket connection. */
  ws: ServerWebSocket<T>;
  /** Resolved channel name (e.g. `'chat:room1'`). */
  channel: string;
};
