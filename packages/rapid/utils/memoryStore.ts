/**
 * @fileoverview {@link memoryStore} — the in-process {@link RapidCacheStore}
 * for development and tests: a bounded, expiring map the caller owns (one
 * per call, never a process-wide registry entry).
 *
 * @module
 */

import type { RapidCacheStore } from '../types/mod.ts';

/**
 * A `RapidCacheStore` over a `Map`: entries expire after their `seconds`,
 * the oldest is evicted past `max`, and `invalidate({ prefix })` walks the
 * map. Per-process only — a second replica has its own; use
 * `@tundralibs/cacher` for anything shared.
 */
export function memoryStore(
  { max = 1000 }: { max?: number } = {},
): RapidCacheStore {
  const entries = new Map<string, { value: unknown; expires: number }>();
  return {
    read(key) {
      const hit = entries.get(key);
      if (hit === undefined) return undefined;
      if (hit.expires <= Date.now()) {
        entries.delete(key);
        return undefined;
      }
      return hit.value;
    },
    write(key, value, seconds) {
      entries.delete(key); // re-insert so insertion order is recency
      entries.set(key, { value, expires: Date.now() + seconds * 1000 });
      while (entries.size > max) {
        entries.delete(entries.keys().next().value!);
      }
    },
    invalidate(target) {
      if (typeof target === 'string') {
        entries.delete(target);
        return;
      }
      for (const key of entries.keys()) {
        if (key.startsWith(target.prefix)) entries.delete(key);
      }
    },
  };
}
