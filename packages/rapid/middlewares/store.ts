/**
 * @fileoverview `Store` + `memoryStore` — the read/write seam every
 * STATEFUL middleware injects, so an app brings its own backend (memory,
 * redis, cacher, …) by handing over two functions instead of
 * implementing a class. `get`/`set` may be sync OR async; a middleware
 * that needs read-modify-write atomicity keeps a synchronous fast path so
 * the in-memory default stays race-free (see `rateLimit`).
 *
 * @module
 */

/**
 * A keyed value store: `get` reads (or `undefined` when absent/expired),
 * `set` writes with an optional TTL in milliseconds. Both may be
 * synchronous (the in-memory default) or return a promise (redis/cacher).
 */
export type Store<V> = {
  get(key: string): (V | undefined) | Promise<V | undefined>;
  set(key: string, value: V, ttlMs?: number): void | Promise<void>;
  /**
   * Evict a key (a no-op when absent). Optional: `session()` uses it to drop
   * a record on logout / id-rotation, falling back to a short-TTL overwrite
   * when a store doesn't implement it. `memoryStore` provides it.
   */
  delete?(key: string): void | Promise<void>;
};

/** Amortised prune: sweep expired entries every N writes. */
const PRUNE_EVERY = 256;

/**
 * A synchronous, per-process {@link Store} backed by a `Map`, with TTL
 * expiry and amortised pruning of expired keys. The default for every
 * stateful middleware; swap in a shared store for multi-replica
 * deployments.
 */
export function memoryStore<V>(): Store<V> {
  const entries = new Map<string, { value: V; expiresAt: number }>();
  let writes = 0;

  return {
    get(key: string): V | undefined {
      const entry = entries.get(key);
      if (entry === undefined) return undefined;
      if (entry.expiresAt <= Date.now()) {
        entries.delete(key);
        return undefined;
      }
      return entry.value;
    },
    set(key: string, value: V, ttlMs?: number): void {
      if (++writes % PRUNE_EVERY === 0) {
        const now = Date.now();
        for (const [k, e] of entries) {
          if (e.expiresAt <= now) entries.delete(k);
        }
      }
      entries.set(key, {
        value,
        expiresAt: ttlMs === undefined ? Infinity : Date.now() + ttlMs,
      });
    },
    delete(key: string): void {
      entries.delete(key);
    },
  };
}
