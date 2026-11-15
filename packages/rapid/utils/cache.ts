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
import { isStreamBody } from './streams.ts';
import type {
  RapidBinder,
  RapidCacheStore,
  RapidContextResponse,
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
  ['state', 0], // per key — matched by name, see assertRouteCache
  ['query', CTX_READ.QUERY],
  ['paging', CTX_READ.PAGING],
  ['header', CTX_READ.HEADERS],
  ['cookie', CTX_READ.COOKIES],
  ['auth', CTX_READ.AUTH],
  ['clientAddress', CTX_READ.ADDRESS],
]);

/** The channel a route's own binder reads (`session` loads from the cookie; `param` and `surface` are in the default key). */
const BIND_CHANNEL: ReadonlyMap<RapidBinder['source'], number> = new Map([
  ...KEY_SOURCES,
  ['param', 0],
  ['surface', 0],
  ['session', CTX_READ.COOKIES],
]);

const NAMES: readonly [number, string][] = [
  [CTX_READ.AUTH, 'auth'],
  [CTX_READ.QUERY, 'query'],
  [CTX_READ.PAGING, 'paging'],
  [CTX_READ.HEADERS, 'header'],
  [CTX_READ.COOKIES, 'cookie'],
  [CTX_READ.ADDRESS, 'clientAddress'],
];

const nameOf = (channels: number): string =>
  NAMES.filter(([bit]) => (channels & bit) !== 0).map(([, n]) => n).join(', ');

/** A header name compares case-insensitively; a cookie name does not. */
const nameIn = (source: 'header' | 'cookie', name: string | undefined) =>
  source === 'header' ? String(name).toLowerCase() : String(name);

/** The header or cookie names a key carries. */
const namesOf = (
  key: readonly RapidBinder[],
  source: 'header' | 'cookie',
): Set<string> =>
  new Set(
    key.filter((b) => b.source === source).map((b) => nameIn(source, b.name)),
  );

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
  // A bound state key is per request too — it must appear in the key by
  // NAME (the channel mask cannot tell one key from another).
  const keyed = new Set(
    key.filter((b) => b.source === 'state').map((b) => b.name),
  );
  const unkeyed = binds.find((b) => b.source === 'state' && !keyed.has(b.name));
  if (unkeyed !== undefined) {
    fail(
      `cache.key must carry state('${unkeyed.name}') — the route binds it, so the cached reply would serve one request's value to the next`,
      { missing: `state('${unkeyed.name}')` },
    );
  }
  // A header or cookie is one value of many on its channel: like state,
  // it must be in the key by NAME, or `header('accept-language')` would
  // pass for a route that binds `header('authorization')`.
  for (const source of ['header', 'cookie'] as const) {
    const names = namesOf(key, source);
    const loose = binds.find((b) =>
      b.source === source && !names.has(nameIn(source, b.name))
    );
    if (loose !== undefined) {
      fail(
        `cache.key must carry ${source}('${loose.name}') — the route binds it, so the cached reply would serve one caller's value to the next`,
        { missing: `${source}('${loose.name}')` },
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

/** The misses being filled right now, per store: key → what gets stored. */
const FLIGHTS = new WeakMap<RapidCacheStore, Map<string, Promise<unknown>>>();

const flightsOf = (store: RapidCacheStore): Map<string, Promise<unknown>> => {
  let flights = FLIGHTS.get(store);
  if (flights === undefined) FLIGHTS.set(store, flights = new Map());
  return flights;
};

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
 * Requests that miss one key at the same moment share one run of `work`,
 * per store and per process: the others answer from what that run stored.
 *
 * @throws {RapidError} RAPID_CACHE_UNBOUND when no store is bound (the
 *   boot check makes this unreachable in a started app).
 */
export async function cached<T>(
  ctx: HTTPContext<RapidContextState>,
  host: CacheHost,
  spec: {
    source: string;
    /** The route's version: two versions of one path never share an entry. */
    version?: string;
    cache: RapidRouteCache;
    params: Readonly<Record<string, unknown>>;
    bind: (binder: RapidBinder) => unknown | Promise<unknown>;
    /** Whether `work` reads through `ctx` (a route's handler) — then its reads are checked against the key. */
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
  // A BigInt (pact's grant masks, in an `auth()` key) has no JSON form.
  const id = `${cachePrefix(spec.source)}${ctx.surface}:${
    JSON.stringify(
      [
        Object.entries(spec.params).sort(([a], [b]) => a.localeCompare(b)),
        extras,
        ...(spec.version !== undefined ? [spec.version] : []),
      ],
      (_, value) => typeof value === 'bigint' ? `${value}n` : value,
    )
  }`;
  const write = async (projection: unknown): Promise<void> => {
    try {
      await store.write(id, projection, spec.cache.seconds);
    } catch (error) {
      host.log.warn(`cache write failed for ${spec.source}`, {
        requestId: ctx.requestId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };
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
  // A miss another request is already filling: wait for what that one
  // stores and answer from it, exactly as a hit a moment later would.
  // When it stores nothing (it failed, or its reply is not one to keep),
  // run our own — a reply that was never stored is never shared.
  const flights = flightsOf(store);
  const flying = flights.get(id);
  if (flying !== undefined) {
    const stored = await flying;
    return stored !== undefined ? fromStore(stored) : (await fill()).value;
  }
  const filling = fill();
  const flight = filling.then((filled) => filled.stored, () => undefined);
  flights.set(id, flight);
  try {
    return (await filling).value;
  } finally {
    flights.delete(id);
  }

  /** Run `work`; `stored` is what was written under the key, if anything. */
  async function fill(): Promise<{ value: T; stored?: unknown }> {
    if (!spec.checkReads) {
      const value = await work();
      const projection = storable(value);
      if (projection !== undefined) await write(projection);
      return { value, stored: projection };
    }
    ctx._resetReads();
    let value: T;
    let stateReads: string[];
    let named: { headers: string[]; cookies: string[] };
    try {
      value = await work();
    } finally {
      stateReads = ctx._takeStateReads();
      named = ctx._takeNamedReads();
    }
    const projection = storable(value);
    if (projection === undefined) return { value };
    // Headers and cookies are judged by name below; every other channel by
    // whether the key carries it at all.
    const uncovered = ctx._readChannels & ~covered(key) &
      ~(CTX_READ.HEADERS | CTX_READ.COOKIES);
    const keyedHeaders = namesOf(key, 'header');
    const keyedCookies = namesOf(key, 'cookie');
    const unkeyedNames = [
      ...named.headers.filter((n) => !keyedHeaders.has(n)).map((n) =>
        n === '*' ? 'every header' : `header('${n}')`
      ),
      ...named.cookies.filter((n) => !keyedCookies.has(n)).map((n) =>
        n === '*' ? 'every cookie' : `cookie('${n}')`
      ),
    ];
    // A request-scoped state key (one this request's middleware set — a
    // tenant, the rows it loaded) is per caller like ctx.auth: read raw, it
    // must be in the key by NAME, or one caller's reply serves the next.
    const keyedState = new Set(
      key.filter((b) => b.source === 'state').map((b) => b.name),
    );
    const unkeyedState = stateReads.filter((k) => !keyedState.has(k));
    if (
      uncovered !== 0 || unkeyedState.length > 0 || unkeyedNames.length > 0
    ) {
      const read = [
        ...(uncovered !== 0 ? [nameOf(uncovered)] : []),
        ...unkeyedNames,
        ...unkeyedState.map((k) => `state('${k}')`),
      ].join(', ');
      const message =
        `${spec.source} is cached but its handler read ctx ${read} with no matching cache.key binder — served uncached; add the binder to the key`;
      if (host.mode === 'DEVELOPMENT') {
        throw new RapidError('RAPID_CONFIG', {
          message,
          details: { action: spec.source, read },
        });
      }
      if (!warned.has(spec.source)) {
        warned.add(spec.source);
        host.log.warn(message, { action: spec.source });
      }
      return { value };
    }
    await write(projection);
    return { value, stored: projection };
  }
}

/**
 * What a reply keeps in the store, or `undefined` when it is not one to
 * replay: only a 2xx data reply without cookies or a redirect. `extra`
 * headers (set on the context while the handler ran) are kept under the
 * reply's own.
 */
export function storableReply(
  reply: RapidContextResponse | void | null,
  extra: readonly [string, string][] = [],
): RapidContextResponse | undefined {
  if (
    reply === undefined || reply === null || reply.redirect !== undefined ||
    reply.cookies !== undefined ||
    (reply.status !== undefined &&
      (reply.status < 200 || reply.status >= 300)) ||
    reply.content instanceof Uint8Array || isStreamBody(reply.content)
  ) return undefined;
  const headers = Object.fromEntries([
    ...extra,
    ...(reply.headers instanceof Headers
      ? reply.headers
      : Object.entries(reply.headers ?? {})),
  ]);
  return {
    content: reply.content,
    ...(reply.status !== undefined ? { status: reply.status } : {}),
    ...(reply.paging !== undefined ? { paging: reply.paging } : {}),
    ...(Object.keys(headers).length > 0 ? { headers } : {}),
    // A cached page keeps its handler's choice of parts.
    ...(reply.compose !== undefined ? { compose: reply.compose } : {}),
  };
}
