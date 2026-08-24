/**
 * @module
 *
 * The read-query cache seam. OFF by default: a `Norm` caches nothing
 * unless constructed with a {@link NormCacheConfig}, and even then only
 * entities that declare a per-entity `cache` TTL (minutes) participate.
 *
 * The model is one `@tundralibs/cacher` instance PER `(connection,
 * entity)` — namespace `${connName}__${entityKey}` — because cacher can
 * only clear a WHOLE namespace, never a key prefix. That single fact
 * buys both requirements at once: a write to `TableA` prunes exactly
 * `conn__TableA` (per-table invalidation), and two `Norm`s pointed at
 * one cache engine never collide as long as their `name`s differ
 * (multi-connection isolation).
 *
 * What is cacheable is deliberately narrow — plain single-entity reads
 * with no joins and no aggregates — so every cached entry depends on
 * exactly ONE table and per-table pruning is provably correct. VIEW /
 * QUERY entities ARE cacheable: they derive from base tables, so
 * {@link buildCachePlan} statically resolves each one's source tables
 * (recursively, through composed views) and a write to any of those
 * tables prunes the view's namespace too.
 *
 * Values round-trip through {@link encodeForCache} / {@link
 * decodeFromCache}: cacher persists via `JSON.stringify`, which THROWS
 * on a `bigint` and silently degrades a `Date` to a string, so norm
 * tags those (and `Uint8Array`) into a JSON-safe carrier and revives
 * them on read.
 *
 * @since 1.4.0
 */

import { Cacher } from '@tundralibs/cacher';
import type { AbstractEngine, CacherOptions } from '@tundralibs/cacher';
import { digest } from '@tundralibs/crypt/digest';
import type { AnyDefinition } from './definition/mod.ts';
import { NormError } from './errors/mod.ts';

/** Namespace separator between the connection name and the entity key.
 * Distinct from cacher's reserved `:` (which separates namespace from
 * key), so `conn__TableA` and `conn__TableB` are never colon-prefixes
 * of one another and `clear()` can't cross namespaces. */
const NS_SEP = '__';

/** Cacher's hard ceiling on `expiry` (30 days, in seconds). Above it
 * Memcached would treat the value as an absolute timestamp and store it
 * already-expired, so cacher rejects it — norm rejects the equivalent
 * per-entity `cache` minutes up front instead. */
const MAX_TTL_SECONDS = 2592000;

/**
 * Enable read caching on a `Norm`. Passed as `cache` to the
 * constructor; individual entities opt in with their own `cache`
 * (minutes) TTL.
 */
export type NormCacheConfig = {
  /**
   * Cacher engine name — `'MEMORY'` (default, in-process),
   * `'REDIS'`, `'MEMCACHED'`, or any engine registered on the
   * `@tundralibs/cacher` singleton. Encrypted columns may only be
   * cached on `'MEMORY'` (see the compose-time guard in
   * `compileRuntime`): an external store would hold their plaintext.
   */
  readonly engine?: string;
  /**
   * Connection namespace — the isolation boundary. REQUIRED: two
   * `Norm`s sharing one cache engine must use different names or they
   * would share (and cross-prune) each other's entries. Must not
   * contain `':'` (cacher reserves it) or `'__'` (norm's entity
   * separator).
   */
  readonly name: string;
  /** Options forwarded verbatim to `Cacher.create` for every per-entity
   * instance (e.g. a Redis host/port/password). */
  readonly options?: CacherOptions & Record<string, unknown>;
};

/**
 * Static caching metadata derived once from the composed registry by
 * {@link buildCachePlan}.
 */
export type CachePlan = {
  /** Entity key → windowed TTL in SECONDS. Only entities with
   * `cache > 0` appear. */
  readonly ttlSeconds: ReadonlyMap<string, number>;
  /** Entity keys with caching enabled (`ttlSeconds` key set). */
  readonly cacheable: ReadonlySet<string>;
  /** Source entity key → the cacheable VIEW / QUERY keys that read from
   * it (directly or transitively through composed views). A write to
   * the source prunes each dependent's namespace. */
  readonly invalidates: ReadonlyMap<string, readonly string[]>;
};

const TAG = '$$normEnc';

/**
 * Encode a value into a JSON-safe carrier, tagging the types that a
 * plain `JSON.stringify` cannot round-trip: `bigint` (would throw),
 * `Date` (would degrade to a bare string), and `Uint8Array` (would
 * become an index-keyed object). Everything else — strings, numbers,
 * booleans, `null`, and already-JSON `json`-column payloads — passes
 * through, recursing into arrays and plain objects.
 */
export function encodeForCache(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  const t = typeof value;
  if (t === 'bigint') {
    return { [TAG]: 'bigint', v: (value as bigint).toString() };
  }
  if (t !== 'object') return value;
  if (value instanceof Date) return { [TAG]: 'date', v: value.toISOString() };
  if (value instanceof Uint8Array) {
    return { [TAG]: 'u8', v: Array.from(value) };
  }
  if (Array.isArray(value)) return value.map(encodeForCache);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = encodeForCache(v);
  }
  return out;
}

/** Inverse of {@link encodeForCache}: revive tagged `bigint` / `Date` /
 * `Uint8Array` carriers, recursing through arrays and plain objects. */
export function decodeFromCache(value: unknown): unknown {
  if (value === null || value === undefined || typeof value !== 'object') {
    return value;
  }
  if (Array.isArray(value)) return value.map(decodeFromCache);
  const obj = value as Record<string, unknown>;
  const tag = obj[TAG];
  if (typeof tag === 'string') {
    if (tag === 'bigint') return BigInt(obj.v as string);
    if (tag === 'date') return new Date(obj.v as string);
    if (tag === 'u8') return Uint8Array.from(obj.v as number[]);
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) out[k] = decodeFromCache(v);
  return out;
}

/** Stable-ish JSON of a query IR for hashing. `bigint` filter values
 * (e.g. a bigint pk) would make `JSON.stringify` throw, so tag them;
 * the IR's own keys are inserted in a fixed order by the read path, so
 * two identical calls hash identically (logically-equal filters written
 * with a different key order are a benign cache miss). */
function stringifyQuery(q: unknown): string {
  return JSON.stringify(
    q,
    (_k, v) => (typeof v === 'bigint' ? `${TAG}:bigint:${v.toString()}` : v),
  );
}

/**
 * The per-`Norm` cache facade. Owns one cacher instance per cached
 * entity (lazily via `Cacher.create`, which is get-or-create) and the
 * {@link CachePlan} that says what is cacheable and what a write
 * invalidates.
 */
export class QueryCache {
  /** Uppercased engine name (`'MEMORY'`, `'REDIS'`, …). */
  public readonly engineName: string;
  private readonly __conn: string;
  private readonly __options: CacherOptions & Record<string, unknown>;
  private readonly __plan: CachePlan;
  private readonly __warn: (entity: string, message: string) => void;

  public constructor(
    cfg: NormCacheConfig,
    plan: CachePlan,
    warn?: (entity: string, message: string) => void,
  ) {
    const name = (cfg.name ?? '').trim();
    if (name.length === 0) {
      throw new NormError(
        `new Norm({ cache }): 'name' is required — it is the isolation ` +
          `boundary between Norms sharing a cache engine.`,
        { code: 'INVALID_CACHE_CONFIG' },
      );
    }
    if (name.includes(':') || name.includes(NS_SEP)) {
      throw new NormError(
        `new Norm({ cache }): 'name' must not contain ':' (cacher reserves ` +
          `it) or '${NS_SEP}' (norm's entity separator); got ${
            JSON.stringify(name)
          }.`,
        { code: 'INVALID_CACHE_CONFIG' },
      );
    }
    this.__conn = name;
    this.engineName = (cfg.engine ?? 'MEMORY').trim().toUpperCase();
    this.__options = { ...(cfg.options ?? {}) };
    this.__plan = plan;
    this.__warn = warn ?? (() => {});
  }

  /** Whether reads on this entity are cached. */
  public enabledFor(entityKey: string): boolean {
    return this.__plan.cacheable.has(entityKey);
  }

  /** The cacher instance backing one entity's namespace (get-or-create). */
  private __engineFor(entityKey: string): AbstractEngine {
    return Cacher.create(
      this.engineName,
      `${this.__conn}${NS_SEP}${entityKey}`,
      this.__options,
    );
  }

  /** Hash a query IR (plus the read's `decrypt` mode, which changes the
   * cached shape) into a cache key. */
  public keyFor(
    entityKey: string,
    q: unknown,
    decrypt: boolean,
  ): Promise<string> {
    return digest(`${entityKey} ${decrypt ? 1 : 0} ${stringifyQuery(q)}`);
  }

  /**
   * Read + revive a cached value, or `undefined` on a miss. A cache
   * BACKEND failure (e.g. Redis unreachable) degrades to a miss — the
   * caller falls back to the database — rather than failing the read.
   */
  public async get<T>(entityKey: string, key: string): Promise<T | undefined> {
    try {
      const raw = await this.__engineFor(entityKey).get<unknown>(key);
      return raw === undefined ? undefined : (decodeFromCache(raw) as T);
    } catch (e) {
      this.__warn(
        entityKey,
        `cache read failed, serving from source: ${msg(e)}`,
      );
      return undefined;
    }
  }

  /** Store a value under this entity's windowed TTL (each read resets
   * the clock). No-op if the entity is not cacheable; a backend failure
   * is swallowed (the read already succeeded — it just was not cached). */
  public async set(
    entityKey: string,
    key: string,
    value: unknown,
  ): Promise<void> {
    const ttl = this.__plan.ttlSeconds.get(entityKey);
    if (ttl === undefined) return;
    try {
      await this.__engineFor(entityKey).set(key, encodeForCache(value), {
        expiry: ttl,
        window: true,
      });
    } catch (e) {
      this.__warn(entityKey, `cache write failed (not cached): ${msg(e)}`);
    }
  }

  /**
   * Prune everything that a write to `entityKey` could stale: the
   * entity's own namespace (if cacheable) plus every cacheable VIEW /
   * QUERY that reads from it.
   */
  public async invalidate(entityKey: string): Promise<void> {
    const jobs: Promise<void>[] = [];
    if (this.__plan.cacheable.has(entityKey)) {
      jobs.push(this.__clear(entityKey));
    }
    for (const dep of this.__plan.invalidates.get(entityKey) ?? []) {
      jobs.push(this.__clear(dep));
    }
    await Promise.all(jobs);
  }

  /** Clear every cacheable entity's namespace for this connection. */
  public async clearAll(): Promise<void> {
    await Promise.all(
      [...this.__plan.cacheable].map((k) => this.__clear(k)),
    );
  }

  private async __clear(entityKey: string): Promise<void> {
    try {
      await this.__engineFor(entityKey).clear();
    } catch (e) {
      this.__warn(entityKey, `cache prune failed (may be stale): ${msg(e)}`);
    }
  }
}

/** Best-effort error message for a cache-backend failure. */
function msg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** Read a validated, positive per-entity TTL in seconds from a
 * definition, or `undefined` when caching is off for it. */
function ttlSecondsOf(key: string, def: AnyDefinition): number | undefined {
  const minutes = (def as { cache?: number }).cache;
  if (minutes === undefined || minutes === 0) return undefined;
  if (
    typeof minutes !== 'number' || !Number.isFinite(minutes) || minutes < 0 ||
    !Number.isInteger(minutes)
  ) {
    throw new NormError(
      `Entity '${key}': cache must be a non-negative integer number of ` +
        `minutes; got ${JSON.stringify(minutes)}.`,
      { code: 'INVALID_CACHE_CONFIG' },
    );
  }
  const seconds = minutes * 60;
  if (seconds > MAX_TTL_SECONDS) {
    throw new NormError(
      `Entity '${key}': cache TTL ${minutes} minutes exceeds the cache ` +
        `ceiling of ${MAX_TTL_SECONDS / 60} minutes (30 days).`,
      { code: 'INVALID_CACHE_CONFIG' },
    );
  }
  return seconds;
}

/** Physical `${schema}\0${table}` and bare-`table` indices → entity
 * key, for resolving a stored query's source tables back to entities. */
function tableIndex(
  registry: Record<string, AnyDefinition>,
): { qualified: Map<string, string>; bare: Map<string, string> } {
  const qualified = new Map<string, string>();
  const bare = new Map<string, string>();
  for (const [key, def] of Object.entries(registry)) {
    const name = (def as { name?: string }).name;
    if (typeof name !== 'string') continue;
    const schema = (def as { dbSchema?: string }).dbSchema ?? '';
    qualified.set(`${schema} ${name}`, key);
    // First writer wins for the bare index — a schema-qualified source
    // still resolves exactly via `qualified`; the bare map is only the
    // fallback for a source that names no schema.
    if (!bare.has(name)) bare.set(name, key);
  }
  return { qualified, bare };
}

/** Collect every physical table/view name a SELECT IR reads — its base
 * `table` plus every join's `table`, recursing into nested joins. */
function collectSources(
  node: unknown,
  out: Array<{ schema: string; table: string }>,
): void {
  if (node === null || typeof node !== 'object') return;
  const n = node as {
    table?: unknown;
    schema?: unknown;
    joins?: Record<string, unknown>;
  };
  if (typeof n.table === 'string') {
    out.push({
      table: n.table,
      schema: typeof n.schema === 'string' ? n.schema : '',
    });
  }
  if (n.joins !== null && typeof n.joins === 'object') {
    for (const jd of Object.values(n.joins as Record<string, unknown>)) {
      collectSources(jd, out);
    }
  }
}

/**
 * Derive the {@link CachePlan} from a composed registry: per-entity
 * TTLs, the cacheable set, and the source→dependents invalidation map
 * for VIEW / QUERY entities (their stored query's tables resolved
 * transitively through composed views, with a cycle guard).
 *
 * @throws {NormError} `INVALID_CACHE_CONFIG` on a malformed or
 *   out-of-range per-entity `cache` value.
 */
export function buildCachePlan(
  registry: Record<string, AnyDefinition>,
): CachePlan {
  const ttlSeconds = new Map<string, number>();
  for (const [key, def] of Object.entries(registry)) {
    const seconds = ttlSecondsOf(key, def);
    if (seconds !== undefined) ttlSeconds.set(key, seconds);
  }
  const cacheable = new Set(ttlSeconds.keys());

  const { qualified, bare } = tableIndex(registry);
  const resolve = (s: { schema: string; table: string }): string | undefined =>
    qualified.get(`${s.schema} ${s.table}`) ?? bare.get(s.table);

  // Direct source entities for each VIEW / QUERY that has a stored query.
  const directSources = new Map<string, Set<string>>();
  for (const [key, def] of Object.entries(registry)) {
    const query = (def as { query?: unknown }).query;
    if (query === undefined) continue;
    const found: Array<{ schema: string; table: string }> = [];
    collectSources(query, found);
    const keys = new Set<string>();
    for (const s of found) {
      const rk = resolve(s);
      if (rk !== undefined && rk !== key) keys.add(rk);
    }
    if (keys.size > 0) directSources.set(key, keys);
  }

  // Transitive closure per derived entity (through composed views).
  const closureOf = (start: string): Set<string> => {
    const seen = new Set<string>();
    const stack = [...(directSources.get(start) ?? [])];
    while (stack.length > 0) {
      const s = stack.pop()!;
      if (seen.has(s)) continue;
      seen.add(s);
      for (const next of directSources.get(s) ?? []) {
        if (!seen.has(next)) stack.push(next);
      }
    }
    return seen;
  };

  // Reverse: source entity → cacheable dependents that read from it.
  const invalidates = new Map<string, string[]>();
  for (const key of cacheable) {
    if (!directSources.has(key)) continue; // only derived entities have sources
    for (const source of closureOf(key)) {
      const list = invalidates.get(source) ?? [];
      list.push(key);
      invalidates.set(source, list);
    }
  }

  return { ttlSeconds, cacheable, invalidates };
}
