/**
 * @fileoverview {@link RapidChannelOptions} — the hooks a WebSocket
 * pub/sub channel declared with {@link Application.channel} may carry:
 * who is allowed to subscribe, and lifecycle callbacks.
 *
 * @module
 */

import type { SOCKETConnection } from '../context/mod.ts';

/**
 * Options for a pub/sub channel. `authorize` gates subscription (re-run
 * on every subscribe, so revoking access drops an existing subscriber);
 * `onSubscribe` / `onUnsubscribe` observe membership. Each hook receives
 * the subscribing connection (id + upgrade query/headers). A channel with
 * no `authorize` is open to any connected client.
 */
export type RapidChannelOptions = {
  /** Allow this connection to subscribe? Re-run on every subscribe. */
  authorize?: (connection: SOCKETConnection) => boolean | Promise<boolean>;
  /** Called after a connection subscribes. */
  onSubscribe?: (connection: SOCKETConnection) => void | Promise<void>;
  /** Called after a connection unsubscribes (or drops). */
  onUnsubscribe?: (connection: SOCKETConnection) => void | Promise<void>;
};
