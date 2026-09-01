/**
 * @fileoverview `rateLimit` — fixed-window rate limiting with
 * transport-aware keying: client address on HTTP, connection id on
 * sockets, and jobs pass through untouched (schedulers don't get rate
 * limited). Counting runs over an injected {@link Store} (`{ get, set }`)
 * — the default is per-process memory; hand over redis/cacher-backed
 * closures for a shared window across replicas.
 *
 * @module
 */

import { RapidError } from '../errors/mod.ts';
import type { RapidContext, RapidMiddleware } from '../types/mod.ts';
import { memoryStore, type Store } from './store.ts';
import { isThenable } from '../utils/isThenable.ts';

/** One fixed-window counter for a key. */
type Window = { count: number; resetAt: number };

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
  /**
   * Counting backend — a {@link Store} of window counters. Hand over
   * redis/cacher `{ get, set }` closures to share the window across
   * replicas.
   * @default an in-process {@link memoryStore}
   */
  store?: Store<Window>;
  /**
   * Stamp `x-ratelimit-limit/-remaining/-reset` (and `retry-after` on
   * rejection) on HTTP responses.
   * @default true
   */
  headers?: boolean;
};

/**
 * One fixed-window hit: read the current window, increment (or start a
 * fresh one), write it back. With a SYNCHRONOUS store the whole
 * read-modify-write runs without an await gap, so the in-memory default
 * stays race-free. With an async store there is a small window between
 * read and write (best-effort — acceptable for a fixed-window limiter;
 * a store with atomic increment removes it).
 */
function hitWindow(
  store: Store<Window>,
  key: string,
  windowMs: number,
): Window | Promise<Window> {
  const write = (current: Window | undefined): Window | Promise<Window> => {
    const now = Date.now();
    const next: Window = current === undefined || current.resetAt <= now
      ? { count: 1, resetAt: now + windowMs }
      : { count: current.count + 1, resetAt: current.resetAt };
    const set = store.set(key, next, next.resetAt - now);
    return isThenable(set) ? set.then(() => next) : next;
  };
  const got = store.get(key);
  return isThenable(got) ? got.then(write) : write(got);
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
  const store = options.store ?? memoryStore<Window>();
  const key = options.key ?? defaultKey;
  const headers = options.headers ?? true;

  return async (ctx, next) => {
    const bucket = key(ctx);
    if (bucket === null) return await next();
    const { count, resetAt } = await hitWindow(store, bucket, windowMs);
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
