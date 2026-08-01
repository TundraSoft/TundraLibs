import type { ChannelContext } from './ChannelContext.ts';

/**
 * Channel registration options.
 *
 * @typeParam T - Connection data type.
 */
export type ChannelOptions<T = unknown> = {
  /**
   * Subscription gate. Return `false` to refuse the subscription;
   * the client receives an error frame.
   */
  authorize?: (ctx: ChannelContext<T>) => boolean | Promise<boolean>;

  /** Called immediately after a subscription is confirmed. */
  onSubscribe?: (ctx: ChannelContext<T>) => void | Promise<void>;

  /**
   * Called when a client's active subscription is removed — via an
   * explicit `unsub`, a disconnect, or a force-drop when a re-subscribe
   * is now unauthorized. Fires exactly once per subscription removed,
   * paired 1:1 with {@link onSubscribe}. A no-op `unsub` (a channel the
   * connection was never subscribed to, or one already force-dropped)
   * is still acked but does **not** fire this hook, so lifecycle-paired
   * app state (presence counters, room membership) stays balanced.
   */
  onUnsubscribe?: (ctx: ChannelContext<T>) => void | Promise<void>;

  /**
   * Client-publish handler. When set, clients **subscribed** to this
   * channel can send `pub` frames; the handler decides what to do
   * (validate, fan out via `Server.publish`, reject, …). When
   * omitted, client publishes to this channel are refused with
   * `PUBLISH_REFUSED`.
   *
   * The subscription requirement is enforced: a `pub` from a
   * connection that is not currently subscribed to this channel is
   * rejected with `NOT_SUBSCRIBED` and the handler does not run. This
   * makes the publish inherit the {@link authorize} decision taken at
   * subscribe time — there is no separate publish-path authorize hook.
   */
  onPublish?: (
    ctx: ChannelContext<T>,
    payload: unknown,
  ) => void | Promise<void>;
};
