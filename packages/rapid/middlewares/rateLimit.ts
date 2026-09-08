/**
 * @fileoverview `rateLimit` — fixed-window rate limiting with
 * transport-aware keying: client address on HTTP, connection id on
 * sockets, and jobs pass through untouched (schedulers don't get rate
 * limited). Counting is ONE hook, {@link RateLimitHooks.increment},
 * atomic by contract — a redis `INCR` + `EXPIRE NX`, a cacher increment
 * — so a shared window across replicas has no read-modify-write race.
 * The bundled {@link memoryRateLimitHooks} is the per-process default.
 *
 * @module
 */

import { RapidError } from '../errors/mod.ts';
import type { RapidContext, RapidMiddleware } from '../types/mod.ts';
import { expiringMap } from '../utils/expiringMap.ts';
import { meterAction } from '../utils/Meter.ts';

/** One fixed-window counter for a key. */
export type RateLimitWindow = {
  /** Hits counted in the current window, this one included. */
  count: number;
  /** Epoch milliseconds at which the window resets. */
  resetAt: number;
};

/**
 * The counting hook `rateLimit()` calls once per counted invocation.
 * Increment `key`'s counter for the current window and return it; when
 * no live window exists, start one that resets `window` seconds from
 * now with `count: 1`. Must be atomic per key across replicas for the
 * limit to hold — the in-memory default is atomic by being synchronous.
 */
export type RateLimitHooks = {
  increment(
    key: string,
    window: number,
  ): RateLimitWindow | Promise<RateLimitWindow>;
};

/** Options for {@link rateLimit}. */
export type RateLimitOptions = {
  /**
   * Hits allowed per window per key.
   * @default 60
   */
  max?: number;
  /**
   * Window length in SECONDS (fixed window). A positive integer.
   * @default 60
   */
  window?: number;
  /**
   * Key extractor — return `null` to EXEMPT the invocation.
   *
   * ⚠ `ctx.remoteAddress` is the socket peer unless `server.trustProxy`
   * names the proxy hop count, and it is `''` for private/loopback
   * addresses — so behind a reverse proxy without `trustProxy`, and for
   * all in-network traffic, every client shares the single `'unknown'`
   * bucket. Set `trustProxy`, or key on an identity of your own.
   * @default `remoteAddress` on HTTP ('unknown' when unresolvable), the
   *   connection id on SOCKET (a per-connection budget), `null` on JOB
   */
  key?: (ctx: RapidContext) => string | null;
  /**
   * The counting backend. Inject a redis/cacher-backed `increment` to
   * share the window across replicas.
   * @default {@link memoryRateLimitHooks} bounded by {@link maxKeys}
   */
  hooks?: RateLimitHooks;
  /**
   * Bound on distinct keys the default memory hooks keep; ignored when
   * `hooks` are injected.
   * @default 100000
   */
  maxKeys?: number;
  /**
   * Stamp the rate headers on HTTP responses — on every counted
   * response, before `next()`, so they survive an error override.
   * `true` for the common `x-ratelimit-limit` / `-remaining` / `-reset`
   * names plus `retry-after` on rejection; an object to rename any of
   * them (the IETF draft's `RateLimit-Limit` / `RateLimit-Remaining` /
   * `RateLimit-Reset`, say); `false` to send none. Values: `limit` =
   * `max`; `remaining` = hits left (never below 0); `reset` = the
   * window's end as an absolute epoch time in SECONDS; `retryAfter` =
   * seconds until then, at least 1.
   * @default true
   */
  headers?: boolean | {
    /** @default 'x-ratelimit-limit' */
    limit?: string;
    /** @default 'x-ratelimit-remaining' */
    remaining?: string;
    /** @default 'x-ratelimit-reset' */
    reset?: string;
    /** Sent on rejection, seconds until the window resets. @default 'retry-after' */
    retryAfter?: string;
  };
};

/** RFC 9110 header-name token. */
const TOKEN = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;

/** Default bound on distinct keys the memory hooks keep. */
const DEFAULT_MAX_KEYS = 100_000;

/**
 * Per-process {@link RateLimitHooks} — synchronous, so race-free. Holds
 * at most `maxKeys` live windows (expired ones are evicted first, then
 * the oldest), so a client-derived `key` cannot grow memory without
 * bound.
 *
 * @throws {RapidError} RAPID_CONFIG when `maxKeys` is not a positive
 *   integer.
 */
export function memoryRateLimitHooks(
  options: { maxKeys?: number } = {},
): RateLimitHooks {
  const maxKeys = options.maxKeys ?? DEFAULT_MAX_KEYS;
  if (!Number.isInteger(maxKeys) || maxKeys < 1) {
    throw new RapidError('RAPID_CONFIG', {
      message: 'memoryRateLimitHooks maxKeys must be a positive integer',
      details: { maxKeys },
    });
  }
  const windows = expiringMap<RateLimitWindow>({ maxEntries: maxKeys });
  return {
    increment(key, window) {
      const now = Date.now();
      const current = windows.get(key);
      const next: RateLimitWindow =
        current === undefined || current.resetAt <= now
          ? { count: 1, resetAt: now + window * 1000 }
          : { count: current.count + 1, resetAt: current.resetAt };
      windows.set(key, next, (next.resetAt - now) / 1000);
      return next;
    },
  };
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
 * @throws {RapidError} RAPID_CONFIG when `max`/`window` (or `maxKeys`,
 *   when the memory hooks are in use) are not positive integers, or a
 *   header name is not a token (factory time).
 * @throws {RapidError} RAPID_RATE_LIMITED (429) as a rejection of the
 *   middleware's promise when the key's window is over budget — on
 *   HTTP the rate headers (and `retry-after`) are already stamped and
 *   survive the error override.
 */
export function rateLimit(options: RateLimitOptions = {}): RapidMiddleware {
  const max = options.max ?? 60;
  const window = options.window ?? 60;
  for (const [name, value] of [['max', max], ['window', window]] as const) {
    if (!Number.isInteger(value) || value < 1) {
      throw new RapidError('RAPID_CONFIG', {
        message: `rateLimit ${name} must be a positive integer`,
        details: { [name]: value },
      });
    }
  }
  const hooks = options.hooks ??
    memoryRateLimitHooks({ maxKeys: options.maxKeys });
  const key = options.key ?? defaultKey;
  const names = options.headers === false ? undefined : {
    limit: 'x-ratelimit-limit',
    remaining: 'x-ratelimit-remaining',
    reset: 'x-ratelimit-reset',
    retryAfter: 'retry-after',
    ...(typeof options.headers === 'object' ? options.headers : {}),
  };
  for (const [option, value] of Object.entries(names ?? {})) {
    if (!TOKEN.test(value)) {
      throw new RapidError('RAPID_CONFIG', {
        message:
          `rateLimit headers.${option} '${value}' is not a valid header name`,
        details: { [option]: value },
      });
    }
  }

  return async (ctx, next) => {
    const bucket = key(ctx);
    if (bucket === null) return await next();
    const { count, resetAt } = await hooks.increment(bucket, window);
    if (ctx.type === 'HTTP' && names !== undefined) {
      ctx.setHeader(names.limit, String(max));
      ctx.setHeader(names.remaining, String(Math.max(0, max - count)));
      ctx.setHeader(names.reset, String(Math.ceil(resetAt / 1000)));
    }
    if (count > max) {
      if (ctx.type === 'HTTP' && names !== undefined) {
        ctx.setHeader(
          names.retryAfter,
          String(Math.max(1, Math.ceil((resetAt - Date.now()) / 1000))),
        );
      }
      ctx.meter?.middleware('rateLimit', 'rejected', meterAction(ctx));
      throw new RapidError('RAPID_RATE_LIMITED', {
        details: { max, window },
      });
    }
    await next();
  };
}
