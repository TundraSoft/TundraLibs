import { MemcachedEngine } from '@tundralibs/drivers/memcached';
import { AbstractEngine } from '../../AbstractEngine.ts';
import type { CacheValue } from '../../types/mod.ts';
import { CacherEngineError } from '../../errors/mod.ts';
import type { MemCacherOptions } from './types/mod.ts';

/**
 * Suffix of the per-namespace version counter key. The full key is
 * `${name}:${NS_VERSION_KEY_SUFFIX}` — it is namespaced (so two cachers on
 * one server keep independent counters) but deliberately *not* versioned,
 * so it survives a {@link MemCacher.clear} of its own namespace.
 *
 * Memcached exposes no key enumeration, so `clear()` cannot delete a
 * namespace's keys by prefix. Instead every data key embeds the current
 * version (`${name}:v${version}:${userKey}`) and `clear()` bumps this
 * counter — old keys become unreachable and are reclaimed by the server's
 * LRU over time, without a server-wide `flush_all` that would wipe every
 * other namespace and application on the same server.
 */
const NS_VERSION_KEY_SUFFIX = '__ns_version__';

/**
 * How long (ms) a locally-cached namespace version is trusted before it is
 * re-read from the server. The version counter is cached in-instance to keep
 * the fast path a single round trip, but caching it *forever* causes cache
 * split-brain across processes: after one instance's `clear()` bumps the
 * server counter, peers that never call `clear()`/`finalize()` would keep
 * reading and writing the dead version indefinitely — serving cleared data and
 * making their writes invisible to fresh instances. Re-reading the counter at
 * most once per this interval bounds that staleness to a small, predictable
 * window instead of "until the process restarts", while still avoiding a
 * counter round trip on every single operation.
 */
const NS_VERSION_TTL_MS = 1000;

/**
 * Maximum byte length of the *encoded* instance-name segment on the wire.
 *
 * The instance name is embedded in every Memcached key — the probe key
 * (`${name}:__cacher_probe__`), the version counter (`${name}:__ns_version__`)
 * and every data key (`${name}:v${version}:${userKey}`) — and the Memcached
 * text protocol caps a whole key at 250 bytes. Bounding the encoded name to
 * this many bytes guarantees the remaining key components always fit: the
 * version prefix (`:v${version}:`) plus the user-key segment's 64-byte SHA-256
 * fallback stay comfortably under 250 (160 + ~20 + 64 = 244). A name whose
 * encoded form would exceed this is replaced by a deterministic SHA-256 digest
 * of the raw name instead (see {@link MemCacher.__wireName}).
 */
const WIRE_NAME_MAX_BYTES = 160;

/**
 * Memcached-based cacher implementation.
 *
 * Uses a Memcached server for distributed caching. This implementation provides:
 * - Connection management to Memcached servers
 * - Automatic serialization/deserialization of values
 * - Support for expiry times and window mode
 * - Namespace-scoped {@link clear} via version keying (see below)
 *
 * ### Namespace-scoped clearing
 *
 * Memcached has no key enumeration, so a namespace's keys cannot be
 * deleted by prefix. Rather than issue a server-wide `flush_all` (which
 * would wipe every other namespace and application sharing the server),
 * this engine keys every entry with a per-namespace version:
 * `${name}:v${version}:${userKey}`. {@link clear} atomically increments
 * the version counter (`${name}:${NS_VERSION_KEY_SUFFIX}`), so all
 * previously-written keys become unreachable at once. They are not
 * deleted immediately — Memcached reclaims them through its normal LRU
 * eviction as space is needed.
 *
 * @extends AbstractEngine<MemCacherOptions>
 * @see {@link AbstractEngine} for details on the base implementation
 * @see {@link MemCacherOptions} for configuration options
 * @example
 * ```ts
 * // Create a Memcached cacher
 * const cache = new MemCacher('user-cache', {
 *   host: 'localhost',
 *   port: 11211
 * });
 *
 * // Initialize the connection
 * await cache.init();
 *
 * // Set a value
 * await cache.set('user:1', { name: 'John', role: 'admin' });
 *
 * // Get a value
 * const user = await cache.get('user:1');
 * ```
 */
export class MemCacher extends AbstractEngine<MemCacherOptions> {
  /**
   * The engine identifier for Memcached cacher.
   */
  public override readonly Engine = 'MEMCACHED';

  /**
   * The Memcached client instance.
   * @protected
   */
  protected _client: MemcachedEngine | undefined = undefined;

  /**
   * In-instance cache of this namespace's current version counter. Read from
   * the server on first use (absent → treated as `1`) and then re-read at most
   * once per {@link NS_VERSION_TTL_MS} (see {@link __currentVersion}), so a
   * peer's `clear()` is picked up within a bounded window instead of never.
   * It is also refreshed immediately after this instance's own {@link clear}.
   * @private
   */
  private __nsVersion: number | undefined = undefined;

  /**
   * Epoch-ms timestamp of the last {@link __nsVersion} read/refresh. Drives the
   * {@link NS_VERSION_TTL_MS} bounded re-read that prevents cross-instance
   * split-brain after a `clear()`.
   * @private
   */
  private __nsVersionReadAt = 0;

  /**
   * Memoized wire-safe form of {@link name}. Computed once (it is a pure,
   * deterministic function of the immutable instance name) and reused for every
   * key this engine builds. See {@link __wireName}.
   * @private
   */
  private __wireNameCache: string | undefined = undefined;

  /**
   * Creates a new Memcached cacher instance.
   *
   * @param name - A unique name for this cacher instance
   * @param options - Configuration options for this cacher
   * @throws {@link CacherConfigError} if required options are missing or invalid
   */
  constructor(name: string, options: MemCacherOptions) {
    super(name, options, {
      port: 11211,
      maxBufferSize: 10,
    });
    // Ensure mandatory items present
    if (this.hasOption('host') === false) {
      throw new CacherEngineError('CONFIG_MISSING', {
        name: this.name,
        engine: this.Engine,
        configKey: 'host',
      });
    }
  }

  /**
   * Initializes the Memcached connection.
   * Performs a test operation to verify connectivity.
   *
   * @throws {@link MemCacherConnectError} if connection fails
   * @override
   */
  public override async init(): Promise<void> {
    if (this._client === undefined) {
      try {
        this._client = this._createClient();
        // Connectivity probe: namespaced (so it never clobbers a real
        // '__test__' key in the shared server) and given a 1s TTL so it
        // cleans itself up instead of persisting forever. The name segment is
        // wire-encoded so a name with whitespace/control chars (legal on
        // Memory/Redis) does not make the probe itself a protocol-illegal key.
        await this._client.set(
          `${await this.__wireName()}:__cacher_probe__`,
          'ok',
          1,
        );
      } catch (e) {
        // Discard the client so a later operation's `init()` re-runs the
        // connectivity probe instead of trusting a half-open client. Without
        // this reset the failed client stays installed, `init()` becomes a
        // permanent no-op, and every subsequent operation surfaces
        // OPERATION_FAILED (a data-path error) rather than CONNECTION_FAILED —
        // misclassifying an ongoing outage. Mirrors RedisCacher.init().
        this._client = undefined;
        throw new CacherEngineError('CONNECTION_FAILED', {
          name: this.name,
          engine: this.Engine,
          host: this._getOption('host'),
          port: this._getOption('port'),
          reason: (e as Error).message,
        }, e as Error);
      }
    }
  }

  /**
   * Constructs the underlying Memcached driver client. Extracted so tests can
   * override client creation (e.g. inject a probe that fails) without opening a
   * real socket.
   *
   * @returns A configured {@link MemcachedEngine} instance.
   * @protected
   */
  protected _createClient(): MemcachedEngine {
    const ssl = this._getOption('ssl');
    return new MemcachedEngine(this.name, {
      host: this._getOption('host'),
      port: this._getOption('port'),
      maxBufferSize: this._getOption('maxBufferSize')! * 1024 * 1024,
      ...(ssl === undefined ? {} : { ssl }),
    });
  }

  /**
   * Finalizes the Memcached connection, releasing resources.
   *
   * @returns A promise that resolves when the connection has been closed
   * @override
   */
  public override finalize(): void {
    if (this._client !== undefined) {
      this._client.disconnect();
      this._client = undefined;
    }
    // Drop the cached version so a later re-init() re-reads it from the
    // server rather than trusting a possibly-stale in-memory counter.
    this.__nsVersion = undefined;
    this.__nsVersionReadAt = 0;
  }

  //#region Abstract method implementations
  /**
   * Retrieves a value from the Memcached server.
   * Handles window mode by extending expiry if needed.
   *
   * @param key - The normalized key
   * @returns The cached value, or undefined if not found
   * @throws {@link MemCacherOperationError} if the operation fails
   * @protected
   * @override
   */
  protected async _get(key: string): Promise<CacheValue | undefined> {
    try {
      const vKey = await this.__versionedKey(key);
      const res = await this._client!.get(vKey);
      if (res === null || res === undefined) {
        return undefined;
      } else {
        const data = JSON.parse(res) as CacheValue;
        if (data.window && data.expiry) {
          // Refresh the sliding-window TTL with `touch` (TTL-only) instead of
          // re-writing the whole value with `set`. A get-then-set refresh is a
          // non-atomic read-modify-write: a concurrent write landing between
          // this read and the refresh would be clobbered with the stale value
          // (silent lost update). `touch` updates only the expiry, so a
          // concurrent writer's value survives — matching how RedisCacher
          // refreshes window TTL with EXPIRE.
          await this._client!.touch(vKey, data.expiry);
        }
        return data;
      }
    } catch (e) {
      throw new CacherEngineError('OPERATION_FAILED', {
        name: this.name,
        engine: this.Engine,
        operation: 'GET',
        key: key.slice(this.name.length + 1),
        reason: (e as Error).message,
      }, e as Error);
    }
  }

  /**
   * Stores a value in the Memcached server.
   *
   * @param key - The normalized key
   * @param value - The value to store
   * @returns A promise that resolves when the operation is complete
   * @throws {@link MemCacherOperationError} if the operation fails
   * @protected
   * @override
   */
  protected async _set(key: string, value: CacheValue): Promise<void> {
    try {
      const vKey = await this.__versionedKey(key);
      // `value.expiry` is forwarded unchanged: the driver maps ttl=0 to
      // Memcached exptime 0 ("never expire"), so a permanent entry stays
      // permanent instead of being clamped to a 1-second TTL.
      await this._client!.set(vKey, JSON.stringify(value), value.expiry);
    } catch (e) {
      throw new CacherEngineError('OPERATION_FAILED', {
        name: this.name,
        engine: this.Engine,
        operation: 'SET',
        key: key.slice(this.name.length + 1),
        reason: (e as Error).message,
      }, e as Error);
    }
  }

  /**
   * Deletes a value from the Memcached server.
   *
   * @param key - The normalized key
   * @returns A promise that resolves when the operation is complete
   * @throws {@link MemCacherOperationError} if the operation fails
   * @protected
   * @override
   */
  protected async _delete(key: string): Promise<void> {
    try {
      const vKey = await this.__versionedKey(key);
      await this._client!.delete(vKey);
    } catch (e) {
      throw new CacherEngineError('OPERATION_FAILED', {
        name: this.name,
        engine: this.Engine,
        operation: 'DELETE',
        key: key.slice(this.name.length + 1),
        reason: (e as Error).message,
      }, e as Error);
    }
  }

  /**
   * Clears all values from this cacher's namespace only.
   *
   * Atomically increments the per-namespace version counter so every
   * key written under the previous version becomes unreachable at once.
   * The old entries are *not* deleted synchronously — Memcached reclaims
   * them via LRU eviction over time. Crucially, this touches no other
   * namespace and issues no server-wide `flush_all`, so cachers sharing
   * the same Memcached server are unaffected.
   *
   * @returns A promise that resolves when the operation is complete
   * @throws {@link CacherEngineError} `OPERATION_FAILED` if the operation fails
   * @protected
   * @override
   */
  protected async _clear(): Promise<void> {
    try {
      const versionKey = await this.__versionKey();
      let next: number;
      try {
        // Fast path: the counter already exists — bump it atomically.
        next = await this._client!.incr(versionKey, 1);
      } catch {
        // Counter absent (nothing has clear()ed this namespace yet, so
        // the effective version was 1). Advance to 2. `add` is atomic and
        // only initializes the counter if it is still missing; if a
        // concurrent clear() beat us to it, fall back to incr so this
        // call still moves the version forward.
        const added = await this._client!.add(versionKey, '2', 0);
        next = added ? 2 : await this._client!.incr(versionKey, 1);
      }
      // Refresh the in-instance cache so subsequent reads/writes target
      // the new version immediately, and reset the TTL clock so we don't
      // needlessly re-read the counter we just authored.
      this.__nsVersion = next;
      this.__nsVersionReadAt = Date.now();
    } catch (e) {
      throw new CacherEngineError('OPERATION_FAILED', {
        name: this.name,
        engine: this.Engine,
        operation: 'CLEAR',
        reason: (e as Error).message,
      }, e as Error);
    }
  }

  /**
   * Checks if a key exists in the Memcached server.
   *
   * @param key - The normalized key
   * @returns True if the key exists, false otherwise
   * @throws {@link MemCacherOperationError} if the operation fails
   * @protected
   * @override
   */
  protected async _has(key: string): Promise<boolean> {
    try {
      const vKey = await this.__versionedKey(key);
      const res = await this._client!.get(vKey);
      if (res === null || res === undefined) {
        return false;
      }
      return true;
    } catch (e) {
      throw new CacherEngineError('OPERATION_FAILED', {
        name: this.name,
        engine: this.Engine,
        operation: 'HAS',
        key: key.slice(this.name.length + 1),
        reason: (e as Error).message,
      }, e as Error);
    }
  }

  //#endregion Abstract method implementations

  //#region Version keying
  /**
   * The full key of this namespace's version counter:
   * `${wireName}:${NS_VERSION_KEY_SUFFIX}`.
   *
   * Uses the wire-safe name (not the raw one) so a namespace whose name carries
   * whitespace/control characters or is over-long still yields a protocol-legal,
   * <=250-byte counter key.
   *
   * @returns The version-counter key for this namespace.
   * @private
   */
  private async __versionKey(): Promise<string> {
    return `${await this.__wireName()}:${NS_VERSION_KEY_SUFFIX}`;
  }

  /**
   * Resolve this namespace's current version. The counter is cached in-instance
   * to keep the hot path a single round trip, but the cache is re-validated
   * against the server once it is older than {@link NS_VERSION_TTL_MS}. That
   * bounded re-read is what stops cross-instance split-brain: without it a
   * long-lived peer that never calls `clear()`/`finalize()` would trust its
   * cached version forever and keep reading/writing a namespace version that
   * another instance already cleared. A missing or unparseable counter is
   * treated as version `1` (first use — nothing has been cleared yet).
   *
   * @returns The current namespace version.
   * @private
   */
  private async __currentVersion(): Promise<number> {
    if (
      this.__nsVersion !== undefined &&
      (Date.now() - this.__nsVersionReadAt) < NS_VERSION_TTL_MS
    ) {
      return this.__nsVersion;
    }
    const raw = await this._client!.get(await this.__versionKey());
    if (raw === null || raw === undefined) {
      this.__nsVersion = 1;
    } else {
      const parsed = Number.parseInt(raw, 10);
      this.__nsVersion = Number.isNaN(parsed) ? 1 : parsed;
    }
    this.__nsVersionReadAt = Date.now();
    return this.__nsVersion;
  }

  /**
   * Turn an {@link AbstractEngine}-normalized key (`${name}:${userKey}`)
   * into a version-scoped Memcached key (`${name}:v${version}:${userKey}`),
   * so that a {@link clear} — which bumps the version — makes every prior
   * key unreachable without touching any other namespace.
   *
   * @param normalizedKey - The `${name}:${userKey}` key from AbstractEngine.
   * @returns The version-scoped key to use on the wire.
   * @private
   */
  private async __versionedKey(normalizedKey: string): Promise<string> {
    const version = await this.__currentVersion();
    // Strip AbstractEngine's `${this.name}:` normalization prefix using the RAW
    // name (that is what _normalizeKey prepended), then rebuild the wire prefix
    // from the wire-SAFE name so whitespace/control chars or an over-long name
    // in the namespace can never produce a protocol-illegal key.
    const rawPrefix = `${this.name}:`;
    const userKey = normalizedKey.startsWith(rawPrefix)
      ? normalizedKey.slice(rawPrefix.length)
      : normalizedKey;
    const wirePrefix = `${await this.__wireName()}:v${version}:`;
    const safeUserKey = await this.__toWireKeySegment(userKey, wirePrefix);
    return `${wirePrefix}${safeUserKey}`;
  }

  /**
   * The wire-safe form of {@link name}, used as the key prefix on every
   * Memcached key (probe, version counter, and data keys). The raw instance
   * name may contain whitespace/control characters (which Memory/Redis accept
   * but the Memcached text protocol forbids) or exceed the protocol's limits;
   * this transform makes it protocol-legal and length-bounded.
   *
   * Strategy (mirrors {@link __toWireKeySegment} for user keys):
   *  - Percent-encode `%` and every forbidden byte (`0x00`–`0x20`, `0x7f`),
   *    leaving ordinary names byte-identical so they stay readable on the wire.
   *  - If the encoded name still exceeds {@link WIRE_NAME_MAX_BYTES}, replace it
   *    with a SHA-256 hex digest of the raw name (a fixed 64 safe bytes) so the
   *    full wire key can never overflow the 250-byte cap.
   *
   * The result is deterministic (a pure function of the immutable name), so
   * independent processes/instances sharing a name address the very same keys,
   * and it is memoized in {@link __wireNameCache}.
   *
   * @returns The protocol-safe, length-bounded namespace prefix segment.
   * @private
   */
  private async __wireName(): Promise<string> {
    if (this.__wireNameCache !== undefined) {
      return this.__wireNameCache;
    }
    const encoded = MemCacher.__encodeKeySegment(this.name);
    this.__wireNameCache =
      MemCacher.__byteLength(encoded) <= WIRE_NAME_MAX_BYTES
        ? encoded
        : await MemCacher.__sha256Hex(this.name);
    return this.__wireNameCache;
  }

  /**
   * Make a user key safe for the Memcached text protocol so the engine honours
   * the same key contract as the Memory/Redis engines (which accept whitespace,
   * control characters, and keys longer than 250 bytes). The driver otherwise
   * rejects any key containing whitespace/control characters or exceeding 250
   * bytes, turning an engine-agnostic key into a MEMCACHED-only runtime error.
   *
   * Strategy:
   *  - Percent-encode `%` (for injectivity) and every byte the protocol forbids
   *    (`0x00`–`0x20` and `0x7f`), leaving ordinary keys byte-identical so they
   *    stay readable on the wire and existing entries keep the same key.
   *  - If the encoded key still overflows the 250-byte key budget (prefix
   *    included), fall back to a SHA-256 hex digest of the original key, which
   *    is a fixed 64 safe bytes.
   *
   * @param userKey - The user-supplied key (namespace prefix already stripped).
   * @param wirePrefix - The `${name}:v${version}:` prefix the segment follows.
   * @returns A segment guaranteed to be whitespace/control-free and to fit.
   * @private
   */
  private async __toWireKeySegment(
    userKey: string,
    wirePrefix: string,
  ): Promise<string> {
    const encoded = MemCacher.__encodeKeySegment(userKey);
    const budget = 250 - MemCacher.__byteLength(wirePrefix);
    if (MemCacher.__byteLength(encoded) <= budget) {
      return encoded;
    }
    // Fall back to a fixed 64-byte SHA-256 hex digest. The name segment inside
    // `wirePrefix` is bounded to WIRE_NAME_MAX_BYTES (=160) specifically so that
    // `budget` here is always >= 64 — the digest therefore always fits and the
    // full wire key can never exceed the 250-byte cap (the pre-fix code could
    // return this 64-byte digest even when `budget` was < 64, still overflowing).
    return await MemCacher.__sha256Hex(userKey);
  }

  /**
   * Percent-encode a key segment so it carries no bytes the Memcached text
   * protocol forbids. `%` is escaped first so the encoding is injective (two
   * distinct user keys never collapse to the same segment).
   * @private
   */
  private static __encodeKeySegment(userKey: string): string {
    // Every byte the memcached text protocol forbids in a key: 0x00–0x20
    // (controls + space) and 0x7f (DEL). The control chars are deliberate.
    // deno-lint-ignore no-control-regex
    const forbidden = /[\x00-\x20\x7f]/g;
    // Percent-encode '%' first (for injectivity), then the forbidden bytes.
    return userKey
      .replace(/%/g, '%25')
      .replace(
        forbidden,
        (c) =>
          '%' + c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0'),
      );
  }

  /** UTF-8 byte length of `s` (the protocol's 250-byte cap counts bytes). */
  private static __byteLength(s: string): number {
    return new TextEncoder().encode(s).length;
  }

  /** Lower-case hex SHA-256 of `input` (64 chars, all Memcached-safe). */
  private static async __sha256Hex(input: string): Promise<string> {
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
   * Processes and validates Memcached-specific options.
   *
   * @param key - The option key
   * @param value - The option value
   * @returns The processed option value
   * @throws {@link CacherConfigError} if the option value is invalid
   * @protected
   * @override
   */
  protected override _processOption<K extends keyof MemCacherOptions>(
    key: K,
    value: MemCacherOptions[K],
  ): MemCacherOptions[K] {
    switch (key) {
      case 'host':
        if (typeof value !== 'string' || value.trim() === '') {
          throw new CacherEngineError('CONFIG_MISSING', {
            name: this.name,
            engine: this.Engine,
            configKey: key,
            reason: 'Host is required and must be a non-empty string',
          });
        }
        break;
      case 'port':
        value ??= 11211 as MemCacherOptions[K]; // default Memcached port
        if (typeof value !== 'number' || value <= 0 || value > 65535) {
          throw new CacherEngineError('CONFIG_INVALID', {
            name: this.name,
            engine: this.Engine,
            configKey: key,
            reason: 'must be a positive number between 0 and 65535',
          });
        }
        break;
      case 'maxBufferSize':
        value ??= 10 as MemCacherOptions[K]; // default maxBufferSize (MB)
        if (typeof value !== 'number' || value <= 0) {
          throw new CacherEngineError('CONFIG_INVALID', {
            name: this.name,
            engine: this.Engine,
            configKey: key,
            reason: 'must be a positive number',
          });
        }
        break;
    }
    // deno-lint-ignore no-explicit-any
    return super._processOption(key as any, value);
  }
  //#endregion Protected methods
}
