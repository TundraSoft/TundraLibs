/**
 * @fileoverview `rateLimit` — fixed-window rate limiting with
 * transport-aware keying: client address on HTTP, connection id on
 * sockets, and jobs pass through untouched (schedulers don't get rate
 * limited). Ships an in-memory store; the {@link RateLimitStore}
 * interface is the seam for a shared store (cacher) in clustered
 * deployments.
 *
 * @module
 */

import { RapidError } from '../errors/mod.ts';
import type { RapidContext, RapidMiddleware } from '../types/mod.ts';

/** Prune the in-memory store's expired windows every N hits. */
const PRUNE_EVERY = 256;

/**
 * The counting seam — implement over a shared backend (cacher/redis)
 * for multi-replica deployments; the default is per-process memory.
 */
export type RateLimitStore = {
  /**
   * Record one hit for `key` and return the hit count of the CURRENT
   * window plus the window's reset time (epoch ms). Implementations
   * own window bookkeeping.
   */
  hit(
    key: string,
    windowMs: number,
  ): Promise<{ count: number; resetAt: number }> | {
    count: number;
    resetAt: number;
  };
};

/** Options for {@link rateLimit}. */
export type RateLimitOptions = {
  /**
   * Hits allowed per window per key.
   * @default 60
   */
  max?: number;
  /**
   * Window length in milliseconds (fixed window).
   * @default 60000
   */
  windowMs?: number;
  /**
   * Key extractor — return `null` to EXEMPT the invocation. Default:
   * `remoteAddress` on HTTP ('unknown' when unresolvable), the
   * connection id on SOCKET (per-connection budget), `null` on JOB.
   */
  key?: (ctx: RapidContext) => string | null;
  /** Counting backend. @default in-process {@link MemoryRateStore} */
  store?: RateLimitStore;
  /**
   * Stamp `x-ratelimit-limit/-remaining/-reset` (and `retry-after` on
   * rejection) on HTTP responses.
   * @default true
   */
  headers?: boolean;
};

/** The default per-process fixed-window store. */
export class MemoryRateStore implements RateLimitStore {
  private readonly __windows = new Map<
    string,
    { count: number; resetAt: number }
  >();
  private __hits = 0;

  public hit(
    key: string,
    windowMs: number,
  ): { count: number; resetAt: number } {
    const now = Date.now();
    // Amortised cleanup — expired windows would otherwise accumulate
    // one entry per distinct key forever.
    if (++this.__hits % PRUNE_EVERY === 0) {
      for (const [k, w] of this.__windows) {
        if (w.resetAt <= now) this.__windows.delete(k);
      }
    }
    const current = this.__windows.get(key);
    if (current === undefined || current.resetAt <= now) {
      const fresh = { count: 1, resetAt: now + windowMs };
      this.__windows.set(key, fresh);
      return fresh;
    }
    current.count += 1;
    return current;
  }
}

/** The default transport-aware key (see {@link RateLimitOptions.key}). */
function defaultKey(ctx: RapidContext): string | null {
  if (ctx.type === 'HTTP') return ctx.remoteAddress || 'unknown';
  if (ctx.type === 'SOCKET') return ctx.connectionId;
  return null; // JOB — schedulers don't get rate limited
}

/**
 * Build the limiter.
 *
 * @throws {RapidError} RAPID_CONFIG when `max`/`windowMs` are not
 *   positive integers (factory time).
 * @throws {RapidError} RAPID_RATE_LIMITED (429) as a rejection of the
 *   middleware's promise when the key's window is over budget — on
 *   HTTP the rate headers (and `retry-after`) are already stamped and
 *   survive the error override.
 */
export function rateLimit(options: RateLimitOptions = {}): RapidMiddleware {
  const max = options.max ?? 60;
  const windowMs = options.windowMs ?? 60_000;
  for (const [name, value] of [['max', max], ['windowMs', windowMs]] as const) {
    if (!Number.isInteger(value) || value < 1) {
      throw new RapidError('RAPID_CONFIG', {
        message: `rateLimit ${name} must be a positive integer`,
        details: { [name]: value },
      });
    }
  }
  const store = options.store ?? new MemoryRateStore();
  const key = options.key ?? defaultKey;
  const headers = options.headers ?? true;

  return async (ctx, next) => {
    const bucket = key(ctx);
    if (bucket === null) return await next();
    const { count, resetAt } = await store.hit(bucket, windowMs);
    if (ctx.type === 'HTTP' && headers) {
      ctx.setHeader('x-ratelimit-limit', String(max));
      ctx.setHeader('x-ratelimit-remaining', String(Math.max(0, max - count)));
      ctx.setHeader('x-ratelimit-reset', String(Math.ceil(resetAt / 1000)));
    }
    if (count > max) {
      if (ctx.type === 'HTTP' && headers) {
        ctx.setHeader(
          'retry-after',
          String(Math.max(1, Math.ceil((resetAt - Date.now()) / 1000))),
        );
      }
      throw new RapidError('RAPID_RATE_LIMITED', {
        details: { max, windowMs },
      });
    }
    await next();
  };
}
