/**
 * @fileoverview Pub/Sub adapter contract.
 *
 * `Server` delegates topic broadcast to a {@link PubSubAdapter}.
 * The default adapter ({@link MemoryPubSubAdapter}) is in-process only;
 * for cross-process broadcast (multiple node instances behind a load
 * balancer) plug in an adapter backed by Redis or another shared
 * substrate.
 *
 * Adapters declare their support level via {@link AdapterCapabilities}.
 * Today these flags are adapter self-description only — `Server` does
 * not gate any feature on them; it just calls `subscribe` / `publish` /
 * `close`. Inspect `server.adapter.capabilities` at boot to assert what
 * your deployment requires (see the `adapter` getter on `Server`).
 *
 * @module
 */

/**
 * Optional capabilities an adapter may support beyond the required
 * `subscribe` / `publish` / `close` minimum.
 */
export type AdapterCapabilities = {
  /**
   * Subscribe to a pattern (e.g. `'chat:*'`) rather than an exact
   * topic. When `false`, only exact-name subscriptions work.
   */
  patternSubscribe: boolean;

  /**
   * Enumerate active subscribers for a topic. Useful for "who's
   * online?" features.
   */
  presence: boolean;

  /**
   * Replay historical messages on subscribe. When `false`, a
   * subscriber only receives messages published after they subscribed.
   */
  replay: boolean;

  /**
   * Per-topic FIFO delivery guarantee. Most local adapters provide
   * this trivially; distributed adapters may relax it for throughput.
   */
  guaranteedOrder: boolean;

  /**
   * At-least-once delivery (no silent drops). When `false`, the
   * adapter may drop messages under load. Informational only — inspect
   * it yourself; `Server` does not act on this flag.
   */
  guaranteedDelivery: boolean;

  /**
   * Broadcast spans process boundaries. `false` for in-memory; `true`
   * for Redis pub/sub or similar.
   */
  crossProcess: boolean;

  /**
   * Adapter exposes back-pressure visibility — i.e. tells the server
   * when its outbound queue is filling. Informational only today:
   * `Server` does not apply any per-connection drop policy based on
   * this flag.
   */
  backpressureVisibility: boolean;
};

/**
 * Subscription handle returned by {@link PubSubAdapter.subscribe}.
 * Calling `unsubscribe()` removes the handler; idempotent.
 */
export type Subscription = {
  unsubscribe(): void;
};

/**
 * Abstract base for pub/sub adapters. Concrete implementations must
 * provide subscribe / publish / close. Capabilities default to all
 * `false` if not overridden.
 */
export abstract class PubSubAdapter {
  /**
   * Register a handler for a topic. Returns a {@link Subscription}
   * whose `.unsubscribe()` removes this specific handler.
   */
  abstract subscribe(
    topic: string,
    handler: (data: unknown) => void,
  ): Subscription;

  /**
   * Broadcast `data` to all subscribers of `topic`. Resolves once the
   * adapter has accepted the message (delivery semantics depend on
   * the adapter's `guaranteedDelivery` capability).
   */
  abstract publish(topic: string, data: unknown): Promise<void>;

  /**
   * Tear down the adapter. After `close()`, subscribe / publish must
   * either no-op or throw; either way they must not deliver. Idempotent.
   */
  abstract close(): Promise<void>;

  /** Capability flags — `false` for unsupported features. */
  abstract readonly capabilities: AdapterCapabilities;
}
