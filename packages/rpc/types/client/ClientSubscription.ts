/** Subscription handle returned by `Client.subscribe`. */
export type ClientSubscription = {
  /** Channel this subscription is bound to. */
  readonly channel: string;
  /**
   * Stop receiving messages on this channel. Sends an `unsub` frame to
   * the server and resolves once the server acks it with an
   * `unsubscribed` frame.
   *
   * Best-effort: if the send fails, or the ack does not arrive before
   * the client's default timeout, it resolves anyway rather than
   * throwing — the server drops the subscription on disconnect
   * regardless. Idempotent: repeat calls are no-ops.
   */
  unsubscribe(): Promise<void>;
};
