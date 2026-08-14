/**
 * @fileoverview In-process pub/sub adapter — the default for
 * `Server`. Works for any single-process deployment; doesn't
 * cross node instances.
 *
 * @module
 */

import {
  type AdapterCapabilities,
  PubSubAdapter,
  type Subscription,
} from './Adapter.ts';

/**
 * In-memory pub/sub adapter. Holds subscribers in a `Map<topic,
 * Set<handler>>`; publish iterates and calls each handler
 * synchronously (delivery within the same microtask).
 *
 * Trade-offs:
 * - **Process-local only.** No cross-process broadcast.
 * - **Bounded by memory.** No replay, no persistence.
 * - **Simple and fast.** Direct function-call dispatch, no
 *   serialization, no network.
 */
export class MemoryPubSubAdapter extends PubSubAdapter {
  /**
   * Ordering and delivery are guaranteed because dispatch is a direct
   * function call; everything requiring shared or durable state —
   * patterns, presence, replay, cross-process — is `false`.
   */
  override readonly capabilities: AdapterCapabilities = {
    patternSubscribe: false,
    presence: false,
    replay: false,
    guaranteedOrder: true,
    guaranteedDelivery: true,
    crossProcess: false,
    backpressureVisibility: false,
  };

  private readonly __subscribers: Map<string, Set<(data: unknown) => void>> =
    new Map();
  private __closed = false;

  /**
   * Add `handler` to `topic`'s subscriber set. Registering the same
   * function twice is a no-op — handlers are held in a `Set`, so it is
   * delivered to once and the first `unsubscribe()` removes it.
   *
   * @throws {@link Error} When called after {@link close}. (The adapter
   *   contract permits either throwing or no-op'ing; this one throws.)
   */
  override subscribe(
    topic: string,
    handler: (data: unknown) => void,
  ): Subscription {
    if (this.__closed) {
      throw new Error('MemoryPubSubAdapter: subscribe after close()');
    }
    let set = this.__subscribers.get(topic);
    if (!set) {
      set = new Set();
      this.__subscribers.set(topic, set);
    }
    set.add(handler);
    return {
      unsubscribe: () => {
        const s = this.__subscribers.get(topic);
        if (!s) return;
        s.delete(handler);
        if (s.size === 0) this.__subscribers.delete(topic);
      },
    };
  }

  /**
   * Call every subscriber of `topic` synchronously — handlers have already
   * run by the time the returned promise is awaited. `data` is passed by
   * reference with no serialization, so subscribers see the same object.
   * A throwing handler is swallowed so fan-out continues. No-ops after
   * {@link close}.
   */
  override publish(topic: string, data: unknown): Promise<void> {
    if (this.__closed) return Promise.resolve();
    const set = this.__subscribers.get(topic);
    if (!set || set.size === 0) return Promise.resolve();
    for (const handler of set) {
      try {
        handler(data);
      } catch {
        // Subscribers shouldn't throw; swallow to keep fan-out going.
      }
    }
    return Promise.resolve();
  }

  /**
   * Drop every subscriber and latch the adapter closed. Idempotent, and
   * terminal — there is no reopen.
   */
  override close(): Promise<void> {
    this.__closed = true;
    this.__subscribers.clear();
    return Promise.resolve();
  }
}
