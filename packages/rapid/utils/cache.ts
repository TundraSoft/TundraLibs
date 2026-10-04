/**
 * @fileoverview The route cache: one lookup-run-store cycle (`cached`)
 * that the HTTP transport wraps a cached route's handler in and the
 * composer wraps a cached part in, so a direct visit and a composed tile
 * share one entry. rapid builds the key — route · surface · path params
 * plus the declared `key` binders — and the bound {@link RapidCacheStore}
 * holds the value. Runs AFTER `access`: a denied caller never reaches it.
 *
 * @module
 */

import type { Slogger } from '@tundralibs/slogger';
import { CTX_READ } from '../context/Context.ts';
import type { HTTPContext } from '../context/HTTPContext.ts';
import { RapidError } from '../errors/mod.ts';
import type {
  RapidBinder,
  RapidCacheStore,
  RapidContextState,
  RapidRouteCache,
} from '../types/mod.ts';

/** What the cycle needs from the application — structural, no import cycle. */
export type CacheHost = {
  readonly cacheStore: RapidCacheStore | undefined;
  readonly log: Slogger;
  readonly mode: 'DEVELOPMENT' | 'PRODUCTION';
};

/** The binder sources a `cache.key` may carry (each a read channel the handler may then use). */
const KEY_SOURCES: ReadonlyMap<RapidBinder['source'], number> = new Map([
  ['config', 0],
  ['query', CTX_READ.QUERY],
  ['paging', CTX_READ.PAGING],
  ['header', CTX_READ.HEADERS],
  ['cookie', CTX_READ.COOKIES],
  ['auth', CTX_READ.AUTH],
]);

/** The channel a route's own binder reads (`session` loads from the cookie; `param` is in the default key). */
const BIND_CHANNEL: ReadonlyMap<RapidBinder['source'], number> = new Map([
  ...KEY_SOURCES,
  ['param', 0],
  ['session', CTX_READ.COOKIES],
]);

const NAMES: readonly [number, string][] = [
  [CTX_READ.AUTH, 'auth'],
  [CTX_READ.QUERY, 'query'],
  [CTX_READ.PAGING, 'paging'],
  [CTX_READ.HEADERS, 'header'],
  [CTX_READ.COOKIES, 'cookie'],
];

const nameOf = (channels: number): string =>
  NAMES.filter(([bit]) => (channels & bit) !== 0).map(([, n]) => n).join(', ');

/** The channels a key covers. */
const covered = (key: readonly RapidBinder[]): number =>
  key.reduce((mask, b) => mask | (KEY_SOURCES.get(b.source) ?? 0), 0);

/**
 * Validate a route's `cache` declaration at registration.
 *
 * @throws {RapidError} RAPID_CONFIG — a non-GET route, `seconds` not a
 *   positive number, a `key` that is not an array of binders, or a key
 *   binder whose source cannot key a reply (`payload`, `session`,
 *   `connection`); with `binds` (a decorated route's own binders), one
 *   that reads a channel the key does not carry.
 */
export function assertRouteCache(
  label: string,
  method: string,
  cache: RapidRouteCache,
  binds: readonly RapidBinder[] = [],
): void {
  const fail = (message: string, details: Record<string, unknown> = {}) => {
    throw new RapidError('RAPID_CONFIG', {
      message: `${label}: ${message}`,
      details,
    });
  };
  if (method !== 'GET') {
    fail('cache is for GET routes — only a read is replayable');
  }
  if (
    cache === null || typeof cache !== 'object' ||
    typeof cache.seconds !== 'number' || !(cache.seconds > 0) ||
    !Number.isFinite(cache.seconds)
  ) {
    fail('cache.seconds must be a positive number of seconds');
  }
  const key = cache.key ?? [];
  if (!Array.isArray(key)) fail('cache.key must be an array of binders');
  for (const binder of key) {
    if (
      binder === null || typeof binder !== 'object' ||
      !KEY_SOURCES.has(binder.source)
    ) {
      fail(
        `cache.key takes query(), paging(), header(), cookie(), auth() or config() binders`,
        { source: (binder as { source?: unknown })?.source },
      );
    }
  }
  const missing = binds.reduce(
    (mask, b) => mask | (BIND_CHANNEL.get(b.source) ?? 0),
    0,
  ) & ~covered(key);
  if (missing !== 0) {
    fail(
      `cache.key must carry what the route binds — add ${
        nameOf(missing)
      }() to key, or the cached reply would serve one caller's ${
        nameOf(missing)
      } to the next`,
      { missing: nameOf(missing) },
    );
  }
}

/** The audit's one-line description of a route's cache. */
export const describeCache = (cache: RapidRouteCache): string =>
  `${cache.seconds}s${(cache.key ?? []).map((b) => ` +${b.source}`).join('')}`;

/** Key prefix for every entry of one action — what `invalidate({ prefix })` takes. */
export const cachePrefix = (source: string): string => `rapid:${source}:`;

/** Routes whose uncovered reads were already reported — one warning per route per process. */
const warned = new Set<string>();

/**
 * Run `work` through the cache: a stored value serves as is; otherwise
 * `work` runs, `storable` projects what to keep (`undefined` = not
 * cacheable: an error, a redirect, a reply with cookies), and the
 * projection is written for `cache.seconds`. The key is
 * `rapid:<source>:<surface>:<params>:<key binder values>`. A handler
 * that read a channel the key does not carry (`ctx.auth` with no
 * `auth()` key binder, …) is served uncached — a warning in PRODUCTION,
 * a `RAPID_CONFIG` throw in DEVELOPMENT, so the mistake surfaces where
 * it is made. Store failures are logged and never fail the request.
 *
 * @throws {RapidError} RAPID_CACHE_UNBOUND when no store is bound (the
 *   boot check makes this unreachable in a started app).
 */
export async function cached<T>(
  ctx: HTTPContext<RapidContextState>,
  host: CacheHost,
  spec: {
    source: string;
    cache: RapidRouteCache;
    params: Readonly<Record<string, unknown>>;
    bind: (binder: RapidBinder) => unknown | Promise<unknown>;
    /** Whether `work` itself reads through `ctx` (a plain handler) — then its reads are checked. */
    checkReads: boolean;
  },
  work: () => Promise<T>,
  storable: (value: T) => unknown,
  fromStore: (stored: unknown) => T,
): Promise<T> {
  const store = host.cacheStore;
  if (store === undefined) {
    throw new RapidError('RAPID_CACHE_UNBOUND', {
      message:
        `${spec.source} declares cache but no cache store is bound — call app.cache(store)`,
      details: { action: spec.source },
    });
  }
  const key = spec.cache.key ?? [];
  const extras = await Promise.all(key.map((b) => spec.bind(b)));
  const id = `${cachePrefix(spec.source)}${ctx.surface}:${
    JSON.stringify([
      Object.entries(spec.params).sort(([a], [b]) => a.localeCompare(b)),
      extras,
    ])
  }`;
  let hit: unknown;
  try {
    hit = await store.read(id);
  } catch (error) {
    host.log.warn(`cache read failed for ${spec.source} — serving uncached`, {
      requestId: ctx.requestId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
  if (hit !== undefined) return fromStore(hit);
  ctx._resetReads();
  const value = await work();
  const projection = storable(value);
  if (projection === undefined) return value;
  const uncovered = spec.checkReads ? ctx._readChannels & ~covered(key) : 0;
  if (uncovered !== 0) {
    const message = `${spec.source} is cached but its handler read ctx ${
      nameOf(uncovered)
    } with no matching cache.key binder — served uncached; add the binder to the key`;
    if (host.mode === 'DEVELOPMENT') {
      throw new RapidError('RAPID_CONFIG', {
        message,
        details: { action: spec.source, read: nameOf(uncovered) },
      });
    }
    if (!warned.has(spec.source)) {
      warned.add(spec.source);
      host.log.warn(message, { action: spec.source });
    }
    return value;
  }
  try {
    await store.write(id, projection, spec.cache.seconds);
  } catch (error) {
    host.log.warn(`cache write failed for ${spec.source}`, {
      requestId: ctx.requestId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
  return value;
}
