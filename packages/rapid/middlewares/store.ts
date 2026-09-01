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

import { RapidError } from '../errors/mod.ts';

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

/** Options for {@link memoryStore}. */
export type MemoryStoreOptions<V = unknown> = {
  /**
   * Hard cap on live entries. When a NEW key would exceed it, the oldest
   * EVICTABLE entries are evicted first (insertion order) — a safety
   * bound against attacker-minted keys growing the process without
   * limit, not an LRU. Unset → unbounded (fine for server-minted keys
   * like session ids). Must be a positive integer when set.
   */
  maxEntries?: number;
  /**
   * Entries this returns `false` for are NEVER evicted for the bound —
   * e.g. idempotency's in-flight `pending` markers, whose loss would
   * silently break its 409/single-execution guarantee. When nothing is
   * evictable the bound is EXCEEDED rather than corrupting live state
   * (such entries carry their own short TTLs, so the excess is
   * transient). @default every entry is evictable
   */
  evictable?: (value: V) => boolean;
};

/**
 * A synchronous, per-process {@link Store} backed by a `Map`, with TTL
 * expiry and amortised pruning of expired keys. The default for every
 * stateful middleware; swap in a shared store for multi-replica
 * deployments.
 */
export function memoryStore<V>(options: MemoryStoreOptions<V> = {}): Store<V> {
  const maxEntries = options.maxEntries ?? Infinity;
  if (
    maxEntries !== Infinity &&
    (!Number.isInteger(maxEntries) || maxEntries < 1)
  ) {
    // <= 0 would loop the eviction scan forever; fail the config loudly.
    throw new RapidError('RAPID_CONFIG', {
      message: 'memoryStore maxEntries must be a positive integer',
      details: { maxEntries },
    });
  }
  const evictable = options.evictable;
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
      if (!entries.has(key)) {
        while (entries.size >= maxEntries) {
          let victim: string | undefined;
          for (const [k, e] of entries) {
            if (evictable === undefined || evictable(e.value)) {
              victim = k;
              break;
            }
          }
          if (victim === undefined) break; // nothing evictable — exceed the bound
          entries.delete(victim);
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
