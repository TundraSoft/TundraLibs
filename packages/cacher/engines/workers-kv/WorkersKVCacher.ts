import { AbstractEngine } from '../../AbstractEngine.ts';
import type { CacheValue } from '../../types/mod.ts';
import { CacherEngineError } from '../../errors/mod.ts';
import type { WorkersKVCacherOptions } from './types/mod.ts';

/**
 * Suffix of the namespace version key, `${name}:${NS_VERSION_KEY_SUFFIX}`.
 * Data keys are `${name}:v${version}:${userKey}`, so the two never collide.
 */
const NS_VERSION_KEY_SUFFIX = '__ns_version__';

/**
 * How long (ms) an instance trusts its cached namespace version before
 * re-reading it. Keeps most operations to one KV call while still picking up
 * another isolate's `clear()` promptly.
 */
const NS_VERSION_TTL_MS = 1000;

/** Workers KV rejects keys longer than this many bytes. */
const KV_KEY_MAX_BYTES = 512;

/**
 * Longest instance name used verbatim in a key. A longer name is replaced by
 * its 64-character SHA-256 digest, which leaves room for the version segment
 * and a hashed user key inside {@link KV_KEY_MAX_BYTES}.
 */
const WIRE_NAME_MAX_BYTES = 300;

/** Workers KV rejects an `expirationTtl` below this many seconds. */
const KV_MIN_EXPIRY_SECONDS = 60;

/**
 * Cacher engine backed by a Cloudflare Workers KV namespace binding.
 *
 * KV is eventually consistent. A write or delete is visible at once in the
 * data centre that made it, and can take 60 seconds or more to reach others.
 * Use it for data that tolerates that window, such as read-through caches.
 * State that must be revoked everywhere at once belongs elsewhere.
 *
 * KV's limits shape the engine's contract:
 *
 * - `expiry` must be `0` (no expiry) or at least 60 seconds.
 * - `window` mode is rejected. KV cannot extend a TTL without rewriting the
 *   value, and a key accepts at most one write per second.
 * - `clear()` writes a new namespace version, so earlier keys become
 *   unreachable. They stay stored until their own TTL expires, and entries
 *   written with `expiry: 0` stay until deleted by other means.
 * - Writing the same key more than once per second fails with
 *   `OPERATION_FAILED`, carrying KV's rate-limit error as `cause`.
 *
 * The engine only calls the binding it is given, so it runs wherever a
 * binding exists: in a Worker, or under Miniflare in tests.
 *
 * @extends AbstractEngine<WorkersKVCacherOptions>
 * @example
 * ```ts ignore
 * export default {
 *   async fetch(_req: Request, env: { CACHE: WorkersKVNamespace }) {
 *     const cache = new WorkersKVCacher('pages', { binding: env.CACHE });
 *     await cache.set('home', { title: 'Home' }, { expiry: 600 });
 *     return Response.json(await cache.get('home'));
 *   },
 * };
 * ```
 */
export class WorkersKVCacher extends AbstractEngine<WorkersKVCacherOptions> {
  /** The engine identifier for the Workers KV cacher. */
  public override readonly Engine = 'WORKERS_KV';

  /** Cached namespace version; see {@link NS_VERSION_TTL_MS}. */
  private __nsVersion: string | undefined = undefined;

  /** Epoch ms of the last {@link __nsVersion} read or write. */
  private __nsVersionReadAt = 0;

  /** Memoized key prefix derived from {@link name}; see {@link __wireName}. */
  private __wireNameCache: string | undefined = undefined;

  /**
   * Creates a Workers KV cacher.
   *
   * @param name - A unique name for this cacher instance.
   * @param options - Configuration, including the KV `binding`.
   * @throws {@link CacherEngineError} `CONFIG_MISSING` without a `binding`;
   *   `CONFIG_INVALID` if `binding` lacks `get`/`put`/`delete` or
   *   `defaultExpiry` is between 1 and 59.
   */
  constructor(name: string, options: WorkersKVCacherOptions) {
    super(name, options);
    if (this._hasOption('binding') === false) {
      throw new CacherEngineError('CONFIG_MISSING', {
        name: this.name,
        engine: this.Engine,
        configKey: 'binding',
      });
    }
  }

  /**
   * Drops the cached namespace version, so the next operation re-reads it.
   * @override
   */
  public override finalize(): void {
    this.__nsVersion = undefined;
    this.__nsVersionReadAt = 0;
  }

  //#region Abstract method implementations
  /**
   * Reads and parses an entry.
   *
   * @param key - The normalized key.
   * @returns The cached value, or undefined if absent or expired.
   * @throws {@link CacherEngineError} `OPERATION_FAILED` if KV fails.
   * @protected
   * @override
   */
  protected async _get(key: string): Promise<CacheValue | undefined> {
    try {
      const raw = await this.__binding().get(await this.__versionedKey(key));
      return raw === null ? undefined : JSON.parse(raw) as CacheValue;
    } catch (e) {
      throw this.__operationError('GET', e, key);
    }
  }

  /**
   * Writes an entry, passing `expiry` to KV as `expirationTtl`.
   *
   * @param key - The normalized key.
   * @param value - The value to store.
   * @throws {@link CacherEngineError} `OPERATION_INVALID_PARAMS` for `window`
   *   mode or an `expiry` between 1 and 59; `OPERATION_FAILED` if KV fails.
   * @protected
   * @override
   */
  protected async _set(key: string, value: CacheValue): Promise<void> {
    let reason: string | undefined;
    if (value.window) {
      reason =
        'window mode is not supported: Workers KV cannot extend a TTL without rewriting the value';
    } else if (value.expiry > 0 && value.expiry < KV_MIN_EXPIRY_SECONDS) {
      reason =
        `expiry must be 0 or at least ${KV_MIN_EXPIRY_SECONDS} seconds on Workers KV`;
    }
    if (reason !== undefined) {
      throw new CacherEngineError('OPERATION_INVALID_PARAMS', {
        name: this.name,
        engine: this.Engine,
        operation: 'SET',
        key: this.__userKey(key),
        reason,
      });
    }
    try {
      await this.__binding().put(
        await this.__versionedKey(key),
        JSON.stringify(value),
        value.expiry > 0 ? { expirationTtl: value.expiry } : undefined,
      );
    } catch (e) {
      throw this.__operationError('SET', e, key);
    }
  }

  /**
   * Deletes an entry.
   *
   * @param key - The normalized key.
   * @throws {@link CacherEngineError} `OPERATION_FAILED` if KV fails.
   * @protected
   * @override
   */
  protected async _delete(key: string): Promise<void> {
    try {
      await this.__binding().delete(await this.__versionedKey(key));
    } catch (e) {
      throw this.__operationError('DELETE', e, key);
    }
  }

  /**
   * Checks whether an entry exists. KV has no existence check, so this reads
   * the value.
   *
   * @param key - The normalized key.
   * @returns True if the key exists.
   * @throws {@link CacherEngineError} `OPERATION_FAILED` if KV fails.
   * @protected
   * @override
   */
  protected async _has(key: string): Promise<boolean> {
    try {
      return await this.__binding().get(await this.__versionedKey(key)) !==
        null;
    } catch (e) {
      throw this.__operationError('HAS', e, key);
    }
  }

  /**
   * Clears this namespace by writing a new random version.
   *
   * A random version rather than an incremented one: KV has no atomic
   * increment, and two isolates reading a stale counter would otherwise
   * write the same "new" version and share keys.
   *
   * @throws {@link CacherEngineError} `OPERATION_FAILED` if KV fails.
   * @protected
   * @override
   */
  protected async _clear(): Promise<void> {
    try {
      const next = crypto.randomUUID();
      await this.__binding().put(await this.__versionKey(), next);
      this.__nsVersion = next;
      this.__nsVersionReadAt = Date.now();
    } catch (e) {
      throw this.__operationError('CLEAR', e);
    }
  }
  //#endregion Abstract method implementations

  //#region Version keying
  /** The configured binding. */
  private __binding() {
    return this._getOption('binding');
  }

  /** The namespace's version key. */
  private async __versionKey(): Promise<string> {
    return `${await this.__wireName()}:${NS_VERSION_KEY_SUFFIX}`;
  }

  /**
   * The namespace's current version, re-read at most once per
   * {@link NS_VERSION_TTL_MS}. A namespace never cleared is version `0`.
   */
  private async __currentVersion(): Promise<string> {
    if (
      this.__nsVersion !== undefined &&
      Date.now() - this.__nsVersionReadAt < NS_VERSION_TTL_MS
    ) {
      return this.__nsVersion;
    }
    this.__nsVersion = await this.__binding().get(await this.__versionKey()) ??
      '0';
    this.__nsVersionReadAt = Date.now();
    return this.__nsVersion;
  }

  /**
   * Turns a normalized key (`${name}:${userKey}`) into the stored key
   * (`${wireName}:v${version}:${userKey}`). A user key that would push the
   * whole key past {@link KV_KEY_MAX_BYTES} is replaced by its SHA-256 digest.
   */
  private async __versionedKey(normalizedKey: string): Promise<string> {
    const prefix = `${await this.__wireName()}:v${await this
      .__currentVersion()}:`;
    const userKey = this.__userKey(normalizedKey);
    const fits = WorkersKVCacher.__byteLength(prefix + userKey) <=
      KV_KEY_MAX_BYTES;
    return prefix + (fits ? userKey : await WorkersKVCacher.__sha256(userKey));
  }

  /**
   * {@link name} if it fits {@link WIRE_NAME_MAX_BYTES}, otherwise its
   * SHA-256 digest. Deterministic, so every isolate sharing a name shares keys.
   */
  private async __wireName(): Promise<string> {
    this.__wireNameCache ??=
      WorkersKVCacher.__byteLength(this.name) <= WIRE_NAME_MAX_BYTES
        ? this.name
        : await WorkersKVCacher.__sha256(this.name);
    return this.__wireNameCache;
  }

  /** Strips the `${name}:` prefix that `_normalizeKey` added. */
  private __userKey(normalizedKey: string): string {
    return normalizedKey.slice(this.name.length + 1);
  }

  /** Wraps a KV failure as `OPERATION_FAILED`. */
  private __operationError(
    operation: string,
    e: unknown,
    key?: string,
  ): CacherEngineError {
    return new CacherEngineError('OPERATION_FAILED', {
      name: this.name,
      engine: this.Engine,
      operation,
      ...(key === undefined ? {} : { key: this.__userKey(key) }),
      reason: (e as Error).message,
    }, e as Error);
  }

  /** UTF-8 byte length of `s`. */
  private static __byteLength(s: string): number {
    return new TextEncoder().encode(s).length;
  }

  /** Lower-case hex SHA-256 of `input`. */
  private static async __sha256(input: string): Promise<string> {
    const digest = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(input),
    );
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  //#endregion Version keying

  //#region Protected methods
  /**
   * Validates the `binding` and KV's expiry floor on `defaultExpiry`.
   *
   * @param key - The option key.
   * @param value - The option value.
   * @returns The processed option value.
   * @throws {@link CacherEngineError} `CONFIG_INVALID` if a value is invalid.
   * @protected
   * @override
   */
  protected override _processOption<K extends keyof WorkersKVCacherOptions>(
    key: K,
    value: WorkersKVCacherOptions[K],
  ): WorkersKVCacherOptions[K] {
    const invalid = (reason: string) =>
      new CacherEngineError('CONFIG_INVALID', {
        name: this.name,
        engine: this.Engine,
        configKey: key,
        reason,
      });
    if (key === 'binding') {
      const b = value as Record<string, unknown> | null | undefined;
      if (
        typeof b?.get !== 'function' || typeof b.put !== 'function' ||
        typeof b.delete !== 'function'
      ) {
        throw invalid(
          'must be a Workers KV namespace binding with get, put and delete',
        );
      }
    }
    if (
      key === 'defaultExpiry' && typeof value === 'number' && value > 0 &&
      value < KV_MIN_EXPIRY_SECONDS
    ) {
      throw invalid(
        `must be 0 or at least ${KV_MIN_EXPIRY_SECONDS} seconds on Workers KV`,
      );
    }
    // deno-lint-ignore no-explicit-any
    return super._processOption(key as any, value);
  }
  //#endregion Protected methods
}
