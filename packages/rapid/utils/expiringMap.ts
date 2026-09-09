/**
 * @fileoverview `expiringMap` — the per-process TTL map behind every
 * middleware's in-memory hooks: `Map` semantics plus expiry in SECONDS,
 * amortised pruning of expired keys, and an optional entry bound with an
 * eviction guard. Internal; apps implement the middleware hooks over
 * their own backend instead.
 *
 * @module
 */

import { RapidError } from '../errors/mod.ts';

/** Amortised prune: sweep expired entries every N writes. */
const PRUNE_EVERY = 256;

/** Options for {@link expiringMap}. */
export type ExpiringMapOptions<V> = {
  /**
   * Hard cap on live entries. When a NEW key would exceed it, the oldest
   * EVICTABLE entries are evicted first (insertion order) — a safety
   * bound against attacker-minted keys, not an LRU. Unset → unbounded.
   * Must be a positive integer when set.
   */
  maxEntries?: number;
  /**
   * Entries this returns `false` for are never evicted for the bound;
   * when nothing is evictable the bound is exceeded rather than live
   * state corrupted. @default every entry is evictable
   */
  evictable?: (value: V) => boolean;
};

/** A synchronous keyed map with per-entry expiry in seconds. */
export type ExpiringMap<V> = {
  get(key: string): V | undefined;
  set(key: string, value: V, ttl?: number): void;
  /** Set only when absent (or expired); true when this call stored it. */
  setIfAbsent(key: string, value: V, ttl?: number): boolean;
  delete(key: string): void;
  /** Extend a live key's expiry without touching its value. */
  touch(key: string, ttl: number): void;
};

/**
 * Build the map.
 *
 * @throws {RapidError} RAPID_CONFIG when `maxEntries` is not a positive
 *   integer (a zero bound would loop the eviction scan forever).
 */
export function expiringMap<V>(
  options: ExpiringMapOptions<V> = {},
): ExpiringMap<V> {
  const maxEntries = options.maxEntries ?? Infinity;
  if (
    maxEntries !== Infinity &&
    (!Number.isInteger(maxEntries) || maxEntries < 1)
  ) {
    throw new RapidError('RAPID_CONFIG', {
      message: 'maxEntries must be a positive integer',
      details: { maxEntries },
    });
  }
  const evictable = options.evictable;
  const entries = new Map<string, { value: V; expiresAt: number }>();
  let writes = 0;

  const live = (key: string): { value: V; expiresAt: number } | undefined => {
    const entry = entries.get(key);
    if (entry === undefined) return undefined;
    if (entry.expiresAt <= Date.now()) {
      entries.delete(key);
      return undefined;
    }
    return entry;
  };
  const set = (key: string, value: V, ttl?: number): void => {
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
      expiresAt: ttl === undefined ? Infinity : Date.now() + ttl * 1000,
    });
  };

  return {
    get: (key) => live(key)?.value,
    set,
    setIfAbsent(key, value, ttl) {
      if (live(key) !== undefined) return false;
      set(key, value, ttl);
      return true;
    },
    delete(key) {
      entries.delete(key);
    },
    touch(key, ttl) {
      const entry = live(key);
      if (entry !== undefined) entry.expiresAt = Date.now() + ttl * 1000;
    },
  };
}
