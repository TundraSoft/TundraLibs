/**
 * @fileoverview Redis driver engine speaking RESP3 (with RESP2 fallback) over TCP.
 *
 * Built from scratch on top of `@tundralibs/compat/net` — same code on
 * Deno, Bun, and Node.js, no external dependencies.
 *
 * Auth: tries `HELLO 3 [AUTH user pass]` first; if the server rejects HELLO
 * (Redis < 6), falls back to `AUTH` + RESP2.
 *
 * Pool integration: each pooled connection is a `RedisConnection` wrapper
 * holding the underlying TCP socket and the accumulating receive buffer.
 *
 * @module
 *
 * @example
 * ```typescript
 * import { RedisEngine } from '@tundralibs/drivers/redis';
 *
 * const redis = new RedisEngine('cache', {
 *   host: 'localhost',
 *   port: 6379,
 *   password: 'secret',
 *   pool: { min: 1, max: 8 },
 * });
 *
 * await redis.set('user:1', JSON.stringify({ name: 'Alice' }), { ex: 60 });
 * const raw = await redis.get('user:1');
 * await redis.disconnect();
 * ```
 */

import {
  connect,
  type TLSOptions as CompatTLSOptions,
} from '@tundralibs/compat';
import type { EventOptionKeys } from '@tundralibs/utils';
import {
  BaseEngine,
  type EngineCapabilities,
  EngineError,
  type EngineQueryResult,
  type RedisEngineEvents,
} from '../../mod.ts';
import { looksLikeTlsRuntimeError } from '../../tls.ts';
import type { RespValue } from './resp.ts';
import { RedisConnection } from './RedisConnection.ts';
import type { RedisEngineOptions } from './types/mod.ts';

const REDIS_DEFAULTS: Partial<RedisEngineOptions> = {
  port: 6379,
  database: 0,
  maxBufferSize: 16,
  slowQueryThreshold: 0.5,
};

/**
 * Redis driver engine.
 *
 * Speaks RESP3 (preferred) or RESP2 (fallback) over plain TCP. Operations
 * acquire a connection from the pool, run a single request/response cycle,
 * and release it back.
 */
export class RedisEngine
  extends BaseEngine<RedisConnection, RedisEngineOptions, RedisEngineEvents> {
  public readonly Engine = 'REDIS';
  public readonly Capabilities: EngineCapabilities = {
    pooledConnections: true,
    // Redis supports MULTI/EXEC, but this driver doesn't expose a
    // transaction surface today — declare false until it's wired up.
    transactions: false,
    preparedStatements: false,
  };

  /** Slow-command threshold in ms, resolved from `slowQueryThreshold`
   * (seconds). A command slower than this fires `slowQuery`. */
  private readonly __slowThresholdMs: number;

  /**
   * The logical database every pooled connection should converge on. Starts
   * at the configured `database` and follows {@link select}. Kept on the
   * engine (not per-connection) so a `select()` is pool-wide.
   */
  private __targetDb: number;

  /**
   * Logical database each live connection is currently `SELECT`ed into.
   * Absent entries are treated as already on {@link __targetDb} (so a freshly
   * handshaked connection needs no redundant re-`SELECT`).
   */
  private readonly __connDb: WeakMap<RedisConnection, number> = new WeakMap();

  /**
   * @param name - Connection name.
   * @param options - Engine options + event handlers.
   * @throws {EngineError} `MISSING_CONFIG_VALUE` if `host` is missing.
   */
  constructor(
    name: string,
    options: EventOptionKeys<RedisEngineOptions, RedisEngineEvents>,
  ) {
    super(name, options, REDIS_DEFAULTS);
    this.__slowThresholdMs = (this._getOption('slowQueryThreshold') ?? 0.5) *
      1000;
    this.__targetDb = (this._getOption('database') as number | undefined) ?? 0;
    this._requireOptions(['host']);
  }

  //#region BaseEngine hooks

  /**
   * Open one fresh TCP (or TLS) connection and run the auth handshake.
   *
   * Redis is **TLS-from-byte-1** (unlike Postgres' STARTTLS-style
   * `SSLRequest` flow). When `ssl` is configured we just hand
   * `compat.connect` a `tls` option and let it negotiate from the
   * first byte.
   *
   * `ssl.enforce` controls failure handling:
   * - `enforce: true` (default) — TLS failure throws.
   * - `enforce: false` — TLS failure (handshake error caught either
   *   sync at connect time or lazy on the first command on Deno) →
   *   fall back to a fresh plain-TCP connection. The downgrade emits
   *   a `notice` so it isn't silently invisible.
   */
  protected async _createResource(): Promise<RedisConnection> {
    const hostname = this._getOption('host');
    const port = this._getOption('port')!;
    const ssl = this._getOption('ssl');
    const enforceTls = _resolveEnforceTls(ssl);
    const bufferBytes = this._getOption('maxBufferSize')! * 1024 * 1024;

    let conn: RedisConnection;
    try {
      const tcp = await connect({
        hostname,
        port,
        ...(ssl ? { tls: this.__buildTlsOptions(ssl) } : {}),
      });
      conn = new RedisConnection(tcp, bufferBytes, this.instanceId);
    } catch (e) {
      if (!ssl || enforceTls) throw e;
      const reason = e instanceof Error ? e.message : String(e);
      this._emit(
        'notice',
        this.instanceId,
        `WARNING: TLS connect failed (${reason}); falling back to plaintext per ssl.enforce=false`,
      );
      const tcp = await connect({ hostname, port });
      conn = new RedisConnection(tcp, bufferBytes, this.instanceId);
    }

    try {
      await this.__handshake(conn);
      return conn;
    } catch (e) {
      try {
        conn.close();
      } catch {
        /* ignore */
      }
      // Deno's TLS handshake is lazy — cert errors surface on first
      // IO (the HELLO command in `__handshake`), not on `connect`.
      // Retry over plaintext if the failure looks like TLS and we
      // were on a TLS connection with `enforce: false`.
      if (ssl && !enforceTls && looksLikeTlsRuntimeError(e)) {
        const reason = e instanceof Error ? e.message : String(e);
        this._emit(
          'notice',
          this.instanceId,
          `WARNING: TLS handshake failed during auth (${reason}); falling back to plaintext per ssl.enforce=false`,
        );
        const tcp = await connect({ hostname, port });
        const plain = new RedisConnection(tcp, bufferBytes, this.instanceId);
        try {
          await this.__handshake(plain);
          return plain;
        } catch (retryErr) {
          try {
            plain.close();
          } catch {
            /* ignore */
          }
          throw retryErr;
        }
      }
      throw e;
    }
  }

  /**
   * Engine-level `ssl` is a `compat.TLSOptions` plus the engine-only
   * `enforce` flag. Compat reads files (`*File` paths) and validates
   * PEM content itself, so we just strip `enforce` and pass the rest
   * through unchanged.
   */
  private __buildTlsOptions(
    ssl: NonNullable<RedisEngineOptions['ssl']>,
  ): true | CompatTLSOptions {
    if (ssl === true || ssl === false) return true;
    const { enforce: _enforce, ...rest } = ssl;
    return rest;
  }

  protected _destroyResource(conn: RedisConnection): void {
    conn.close();
  }

  protected override _validateResource(conn: RedisConnection): boolean {
    return !conn.closed;
  }

  protected async _ping(conn: RedisConnection): Promise<boolean> {
    try {
      const reply = await conn.send(['PING']);
      return reply.kind === 'string' && reply.value === 'PONG';
    } catch {
      return false;
    }
  }

  //#endregion BaseEngine hooks

  //#region Auth handshake

  /**
   * Negotiate RESP3 + auth. Falls back to RESP2 if the server doesn't
   * support `HELLO`. Selects the configured logical database afterwards.
   */
  private async __handshake(conn: RedisConnection): Promise<void> {
    const username = this._getOption('username');
    const password = this._getOption('password');
    // A new (or reconnected) connection must adopt the engine's *current*
    // target database, which may have moved past the configured one via
    // `select()` — otherwise a pool refill would silently revert to the old
    // keyspace.
    const database = this.__targetDb;

    // Try HELLO 3 (RESP3 negotiation). If unsupported, server replies with
    // an error and we fall back to RESP2 + plain AUTH.
    const helloArgs: (string | number)[] = ['HELLO', '3'];
    if (password) {
      helloArgs.push('AUTH', username ?? 'default', password);
    }
    const helloReply = await conn.send(helloArgs);
    if (helloReply.kind === 'error') {
      // RESP2 path: HELLO unrecognized. Authenticate the old way.
      if (password) {
        const authArgs: (string | number)[] = ['AUTH'];
        if (username) authArgs.push(username);
        authArgs.push(password);
        const authReply = await conn.send(authArgs);
        if (authReply.kind === 'error') {
          throw new EngineError('INVALID_AUTH', {
            instanceId: this.instanceId,
            reason: authReply.value.message,
          });
        }
      }
    }

    // SELECT logical database.
    if (database !== 0) {
      const selectReply = await conn.send(['SELECT', database]);
      if (selectReply.kind === 'error') {
        throw new EngineError('OPERATION_FAILED', {
          instanceId: this.instanceId,
          operation: 'SELECT',
          reason: selectReply.value.message,
        });
      }
    }
    this.__connDb.set(conn, database);
  }

  /**
   * Ensure `conn` is on the engine's {@link __targetDb}, issuing a `SELECT`
   * if it is not. A connection with no recorded database is assumed to already
   * be on the target (the handshake put it there), so the common path costs
   * nothing; only a connection left behind by a `select()` pays one `SELECT`.
   */
  private async __ensureDb(conn: RedisConnection): Promise<void> {
    const current = this.__connDb.get(conn) ?? this.__targetDb;
    if (current === this.__targetDb) return;
    const reply = await conn.send(['SELECT', this.__targetDb]);
    if (reply.kind === 'error') {
      throw new EngineError('OPERATION_FAILED', {
        instanceId: this.instanceId,
        operation: 'SELECT',
        reason: reply.value.message,
      });
    }
    this.__connDb.set(conn, this.__targetDb);
  }

  //#endregion Auth handshake

  //#region Public command API — strings

  /**
   * Get the value at `key`. Returns `null` if the key does not exist.
   */
  public async get(key: string): Promise<string | null> {
    const reply = await this.__command(['GET', key]);
    return _expectBulkOrNull(reply);
  }

  /**
   * Set `key` to `value`.
   *
   * @param opts - Optional flags:
   *   - `ex`: expire in seconds
   *   - `px`: expire in milliseconds
   *   - `nx`: only set if key does NOT exist
   *   - `xx`: only set if key already exists
   *   - `keepTtl`: preserve existing TTL
   * @returns `'OK'` on success; `null` if `nx`/`xx` was set and the precondition failed.
   */
  public async set(
    key: string,
    value: string,
    opts: {
      ex?: number;
      px?: number;
      nx?: boolean;
      xx?: boolean;
      keepTtl?: boolean;
    } = {},
  ): Promise<string | null> {
    const args: (string | number)[] = ['SET', key, value];
    if (opts.ex !== undefined) args.push('EX', opts.ex);
    if (opts.px !== undefined) args.push('PX', opts.px);
    if (opts.nx) args.push('NX');
    if (opts.xx) args.push('XX');
    if (opts.keepTtl) args.push('KEEPTTL');
    const reply = await this.__command(args);
    if (reply.kind === 'string') return reply.value;
    if (reply.kind === 'bulk' && reply.value === null) return null;
    if (reply.kind === 'null') return null;
    throw _unexpected(reply, 'SET');
  }

  /** Delete one or more keys. Returns the number of keys actually removed. */
  public async del(...keys: string[]): Promise<number | bigint> {
    if (keys.length === 0) return 0;
    return _expectInteger(await this.__command(['DEL', ...keys]));
  }

  /** Count how many of the given keys exist. */
  public async exists(...keys: string[]): Promise<number | bigint> {
    if (keys.length === 0) return 0;
    return _expectInteger(await this.__command(['EXISTS', ...keys]));
  }

  /** Set the TTL on `key` to `seconds`. Returns `true` if the TTL was set. */
  public async expire(key: string, seconds: number): Promise<boolean> {
    return _expectInteger(await this.__command(['EXPIRE', key, seconds])) === 1;
  }

  /** Set the TTL on `key` in milliseconds. */
  public async pexpire(key: string, ms: number): Promise<boolean> {
    return _expectInteger(await this.__command(['PEXPIRE', key, ms])) === 1;
  }

  /**
   * TTL of `key` in seconds.
   *
   * Returns `-2` if the key does not exist, `-1` if the key has no TTL.
   */
  public async ttl(key: string): Promise<number | bigint> {
    return _expectInteger(await this.__command(['TTL', key]));
  }

  /** Remove the TTL from `key`. Returns `true` if a TTL was actually removed. */
  public async persist(key: string): Promise<boolean> {
    return _expectInteger(await this.__command(['PERSIST', key])) === 1;
  }

  /** Atomically increment the integer at `key` by 1. */
  public async incr(key: string): Promise<number | bigint> {
    return _expectInteger(await this.__command(['INCR', key]));
  }

  /** Atomically increment the integer at `key` by `delta`. */
  public async incrBy(key: string, delta: number): Promise<number | bigint> {
    return _expectInteger(await this.__command(['INCRBY', key, delta]));
  }

  /** Atomically decrement the integer at `key` by 1. */
  public async decr(key: string): Promise<number | bigint> {
    return _expectInteger(await this.__command(['DECR', key]));
  }

  /** Atomically decrement the integer at `key` by `delta`. */
  public async decrBy(key: string, delta: number): Promise<number | bigint> {
    return _expectInteger(await this.__command(['DECRBY', key, delta]));
  }

  /** Multi-get: returns an array of values, with `null` entries for missing keys. */
  public async mget(...keys: string[]): Promise<(string | null)[]> {
    if (keys.length === 0) return [];
    const reply = await this.__command(['MGET', ...keys]);
    if (reply.kind !== 'array' || reply.value === null) {
      throw _unexpected(reply, 'MGET');
    }
    return reply.value.map((v) => _expectBulkOrNull(v));
  }

  /** Multi-set: takes a `Record<key, value>` and stores all atomically. */
  public async mset(pairs: Record<string, string>): Promise<string> {
    const flat: string[] = [];
    for (const [k, v] of Object.entries(pairs)) flat.push(k, v);
    return _expectSimple(await this.__command(['MSET', ...flat]));
  }

  /** Append `value` to the existing string at `key`. Returns the new length. */
  public async append(key: string, value: string): Promise<number | bigint> {
    return _expectInteger(await this.__command(['APPEND', key, value]));
  }

  /** Length of the string at `key` (0 if missing). */
  public async strlen(key: string): Promise<number | bigint> {
    return _expectInteger(await this.__command(['STRLEN', key]));
  }

  //#endregion Public command API — strings

  //#region Public command API — keys

  /**
   * Find keys matching `pattern`.
   *
   * Avoid in production — `KEYS` blocks the server. Use `SCAN` for large databases.
   */
  public async keys(pattern: string): Promise<string[]> {
    const reply = await this.__command(['KEYS', pattern]);
    if (reply.kind !== 'array' || reply.value === null) {
      throw _unexpected(reply, 'KEYS');
    }
    return reply.value.map((v) => {
      if (v.kind === 'bulk' && v.value !== null) return v.value;
      throw _unexpected(v, 'KEYS');
    });
  }

  /**
   * Iteratively scan the keyspace.
   *
   * @returns `{ cursor, keys }`. Pass the returned cursor to the next call;
   * iteration is complete when cursor === '0'.
   */
  public async scan(
    cursor: string = '0',
    opts: { match?: string; count?: number } = {},
  ): Promise<{ cursor: string; keys: string[] }> {
    const args: (string | number)[] = ['SCAN', cursor];
    if (opts.match) args.push('MATCH', opts.match);
    if (opts.count !== undefined) args.push('COUNT', opts.count);
    const reply = await this.__command(args);
    if (
      reply.kind !== 'array' ||
      reply.value === null ||
      reply.value.length !== 2
    ) {
      throw _unexpected(reply, 'SCAN');
    }
    const [cursorReply, keysReply] = reply.value as [RespValue, RespValue];
    const nextCursor = cursorReply!.kind === 'bulk' && cursorReply!.value
      ? cursorReply!.value
      : '0';
    if (keysReply!.kind !== 'array' || keysReply!.value === null) {
      throw _unexpected(keysReply!, 'SCAN');
    }
    const keys = keysReply!.value.map((v) => {
      if (v.kind === 'bulk' && v.value !== null) return v.value;
      throw _unexpected(v, 'SCAN');
    });
    return { cursor: nextCursor, keys };
  }

  /** Type of the value at `key` (`'none'`/`'string'`/`'list'`/.../`'stream'`). */
  public async type(key: string): Promise<string> {
    return _expectSimple(await this.__command(['TYPE', key]));
  }

  /** Rename `key` to `newKey`. Throws if the source key does not exist. */
  public async rename(key: string, newKey: string): Promise<string> {
    return _expectSimple(await this.__command(['RENAME', key, newKey]));
  }

  //#endregion Public command API — keys

  //#region Public command API — hashes

  /** Get the value of a hash field. */
  public async hget(key: string, field: string): Promise<string | null> {
    return _expectBulkOrNull(await this.__command(['HGET', key, field]));
  }

  /**
   * Set a field in the hash. Returns the number of NEW fields created
   * (existing fields updated still return 0).
   */
  public async hset(
    key: string,
    field: string,
    value: string,
  ): Promise<number | bigint>;
  public async hset(
    key: string,
    fields: Record<string, string>,
  ): Promise<number | bigint>;
  public async hset(
    key: string,
    fieldOrFields: string | Record<string, string>,
    value?: string,
  ): Promise<number | bigint> {
    const args: string[] = ['HSET', key];
    if (typeof fieldOrFields === 'string') {
      args.push(fieldOrFields, value!);
    } else {
      for (const [f, v] of Object.entries(fieldOrFields)) args.push(f, v);
    }
    return _expectInteger(await this.__command(args));
  }

  /** Get multiple hash fields at once. Missing fields return `null`. */
  public async hmget(
    key: string,
    ...fields: string[]
  ): Promise<(string | null)[]> {
    if (fields.length === 0) return [];
    const reply = await this.__command(['HMGET', key, ...fields]);
    if (reply.kind !== 'array' || reply.value === null) {
      throw _unexpected(reply, 'HMGET');
    }
    return reply.value.map((v) => _expectBulkOrNull(v));
  }

  /** Get all fields and values of a hash. */
  public async hgetAll(key: string): Promise<Record<string, string>> {
    const reply = await this.__command(['HGETALL', key]);
    const out: Record<string, string> = {};
    if (reply.kind === 'map') {
      for (const [k, v] of reply.value) {
        const ks = k.kind === 'bulk' ? k.value : null;
        const vs = v.kind === 'bulk' ? v.value : null;
        if (ks !== null && vs !== null) out[ks] = vs;
      }
      return out;
    }
    if (reply.kind === 'array' && reply.value !== null) {
      for (let i = 0; i < reply.value.length; i += 2) {
        const k = reply.value[i];
        const v = reply.value[i + 1];
        if (
          k && k.kind === 'bulk' && k.value !== null &&
          v && v.kind === 'bulk' && v.value !== null
        ) {
          out[k.value] = v.value;
        }
      }
      return out;
    }
    throw _unexpected(reply, 'HGETALL');
  }

  /** Delete one or more hash fields. Returns the number deleted. */
  public async hdel(
    key: string,
    ...fields: string[]
  ): Promise<number | bigint> {
    if (fields.length === 0) return 0;
    return _expectInteger(await this.__command(['HDEL', key, ...fields]));
  }

  /** True if the field exists in the hash. */
  public async hexists(key: string, field: string): Promise<boolean> {
    return _expectInteger(await this.__command(['HEXISTS', key, field])) === 1;
  }

  /** Number of fields in the hash. */
  public async hlen(key: string): Promise<number | bigint> {
    return _expectInteger(await this.__command(['HLEN', key]));
  }

  /** All field names in the hash. */
  public async hkeys(key: string): Promise<string[]> {
    return _expectStringArray(await this.__command(['HKEYS', key]), 'HKEYS');
  }

  /** All values in the hash. */
  public async hvals(key: string): Promise<string[]> {
    return _expectStringArray(await this.__command(['HVALS', key]), 'HVALS');
  }

  /** Atomically increment a hash field by `delta`. */
  public async hincrBy(
    key: string,
    field: string,
    delta: number,
  ): Promise<number | bigint> {
    return _expectInteger(
      await this.__command(['HINCRBY', key, field, delta]),
    );
  }

  //#endregion Public command API — hashes

  //#region Public command API — lists

  /** Push values to the head of a list. Returns the new list length. */
  public async lpush(
    key: string,
    ...values: string[]
  ): Promise<number | bigint> {
    return _expectInteger(await this.__command(['LPUSH', key, ...values]));
  }

  /** Push values to the tail of a list. Returns the new list length. */
  public async rpush(
    key: string,
    ...values: string[]
  ): Promise<number | bigint> {
    return _expectInteger(await this.__command(['RPUSH', key, ...values]));
  }

  /** Pop one element from the head of the list. Returns `null` if empty. */
  public async lpop(key: string): Promise<string | null> {
    return _expectBulkOrNull(await this.__command(['LPOP', key]));
  }

  /** Pop one element from the tail of the list. Returns `null` if empty. */
  public async rpop(key: string): Promise<string | null> {
    return _expectBulkOrNull(await this.__command(['RPOP', key]));
  }

  /** Range of elements from the list. Use `-1` to refer to the last element. */
  public async lrange(
    key: string,
    start: number,
    stop: number,
  ): Promise<string[]> {
    return _expectStringArray(
      await this.__command(['LRANGE', key, start, stop]),
      'LRANGE',
    );
  }

  /** List length. */
  public async llen(key: string): Promise<number | bigint> {
    return _expectInteger(await this.__command(['LLEN', key]));
  }

  //#endregion Public command API — lists

  //#region Public command API — sets

  /** Add members to a set. Returns the number of new members. */
  public async sadd(
    key: string,
    ...members: string[]
  ): Promise<number | bigint> {
    if (members.length === 0) return 0;
    return _expectInteger(await this.__command(['SADD', key, ...members]));
  }

  /** Remove members from a set. Returns the number actually removed. */
  public async srem(
    key: string,
    ...members: string[]
  ): Promise<number | bigint> {
    if (members.length === 0) return 0;
    return _expectInteger(await this.__command(['SREM', key, ...members]));
  }

  /** Get all members of a set. */
  public async smembers(key: string): Promise<string[]> {
    const reply = await this.__command(['SMEMBERS', key]);
    if (reply.kind === 'set' || reply.kind === 'array') {
      const arr = reply.kind === 'set' ? reply.value : reply.value;
      if (arr === null) return [];
      return arr.map((v) => {
        if (v.kind === 'bulk' && v.value !== null) return v.value;
        throw _unexpected(v, 'SMEMBERS');
      });
    }
    throw _unexpected(reply, 'SMEMBERS');
  }

  /** True if `member` is in the set. */
  public async sismember(key: string, member: string): Promise<boolean> {
    return _expectInteger(
      await this.__command(['SISMEMBER', key, member]),
    ) === 1;
  }

  /** Number of members in the set. */
  public async scard(key: string): Promise<number | bigint> {
    return _expectInteger(await this.__command(['SCARD', key]));
  }

  //#endregion Public command API — sets

  //#region Public command API — sorted sets

  /**
   * Add `member` with `score` to the sorted set. Returns the number of NEW
   * elements added (existing members with updated scores still return 0).
   */
  public async zadd(
    key: string,
    score: number,
    member: string,
  ): Promise<number | bigint> {
    return _expectInteger(await this.__command(['ZADD', key, score, member]));
  }

  /** Remove members from the sorted set. Returns the number actually removed. */
  public async zrem(
    key: string,
    ...members: string[]
  ): Promise<number | bigint> {
    if (members.length === 0) return 0;
    return _expectInteger(await this.__command(['ZREM', key, ...members]));
  }

  /** Range of members ordered by score (ascending). */
  public async zrange(
    key: string,
    start: number,
    stop: number,
  ): Promise<string[]> {
    return _expectStringArray(
      await this.__command(['ZRANGE', key, start, stop]),
      'ZRANGE',
    );
  }

  /** Score of `member` in the sorted set, or `null` if absent. */
  public async zscore(key: string, member: string): Promise<number | null> {
    const reply = await this.__command(['ZSCORE', key, member]);
    if (reply.kind === 'bulk' && reply.value === null) return null;
    if (reply.kind === 'null') return null;
    if (reply.kind === 'bulk' && reply.value !== null) {
      return Number.parseFloat(reply.value);
    }
    if (reply.kind === 'double') return reply.value;
    throw _unexpected(reply, 'ZSCORE');
  }

  /** Number of members in the sorted set. */
  public async zcard(key: string): Promise<number | bigint> {
    return _expectInteger(await this.__command(['ZCARD', key]));
  }

  //#endregion Public command API — sorted sets

  //#region Public command API — pub/sub (publish only)

  /**
   * Publish `message` on `channel`. Returns the number of subscribers that
   * received it.
   *
   * Note: subscribing requires a dedicated, mode-locked connection. That
   * support will land in v1.x; for now this driver only publishes.
   */
  public async publish(
    channel: string,
    message: string,
  ): Promise<number | bigint> {
    return _expectInteger(await this.__command(['PUBLISH', channel, message]));
  }

  //#endregion Public command API — pub/sub

  //#region Public command API — transactions (MULTI/EXEC)

  /**
   * Run `commands` atomically inside a MULTI/EXEC block on a single connection.
   *
   * Connection health is tracked the same way {@link __command} tracks it: a
   * server *error reply* leaves the socket in a known state and the
   * connection is reusable, but an I/O or parse failure can leave the
   * connection mid-frame — and here it can additionally leave it inside an
   * open MULTI block. Either way it must not go back to the idle pool, where
   * `_validateResource` (which only rejects a fully-closed connection) would
   * happily hand the corrupted framing to the next acquirer.
   *
   * @returns The array of replies from the EXEC, one per queued command,
   * unwrapped to plain JS values.
   */
  public async multi(
    commands: ReadonlyArray<ReadonlyArray<string | number>>,
  ): Promise<RespValue[]> {
    await this.connect();
    const conn = await this._acquire();
    let healthy = true;
    try {
      await this.__ensureDb(conn);
      const startReply = await conn.send(['MULTI']);
      if (startReply.kind === 'error') {
        throw new EngineError('OPERATION_FAILED', {
          instanceId: this.instanceId,
          operation: 'MULTI',
          reason: startReply.value.message,
        });
      }
      for (const cmd of commands) {
        const queued = await conn.send(cmd);
        if (queued.kind === 'error') {
          // Abandon the transaction. If the DISCARD itself fails — or the
          // server rejects it — we can't confirm the MULTI block was closed,
          // so the connection is no longer safe to reuse.
          try {
            const discarded = await conn.send(['DISCARD']);
            if (discarded.kind === 'error') healthy = false;
          } catch {
            healthy = false;
          }
          throw new EngineError('OPERATION_FAILED', {
            instanceId: this.instanceId,
            operation: 'MULTI',
            reason: queued.value.message,
          });
        }
      }
      const exec = await conn.send(['EXEC']);
      if (exec.kind === 'error') {
        throw new EngineError('OPERATION_FAILED', {
          instanceId: this.instanceId,
          operation: 'EXEC',
          reason: exec.value.message,
        });
      }
      if (exec.kind !== 'array' || exec.value === null) {
        throw _unexpected(exec, 'EXEC');
      }
      return exec.value;
    } catch (e) {
      // Non-`EngineError` means the failure came from the transport or the
      // parser (a read timeout between MULTI and EXEC, a half-consumed
      // reply): the connection may be mid-frame and/or still in MULTI.
      // `conn.closed` additionally catches the EngineError-wrapped transport
      // failures that leave the socket dead/desynced — most importantly the
      // max-buffer overflow, which throws an EngineError yet closes the
      // connection mid-frame. Either way it must NOT go back to the pool.
      if (!(e instanceof EngineError) || conn.closed) healthy = false;
      throw e;
    } finally {
      if (healthy) {
        this._release(conn);
      } else {
        await this._destroy(conn);
      }
    }
  }

  //#endregion Public command API — transactions

  //#region Public command API — server

  /** Server `INFO` (full or section-scoped). */
  public async info(section?: string): Promise<string> {
    const reply = section
      ? await this.__command(['INFO', section])
      : await this.__command(['INFO']);
    if (reply.kind === 'bulk' && reply.value !== null) return reply.value;
    if (reply.kind === 'string') return reply.value;
    if (reply.kind === 'verbatim') return reply.value;
    throw _unexpected(reply, 'INFO');
  }

  /**
   * Switch the engine's logical database.
   *
   * This is **pool-wide**, not per-connection: it records the new target
   * database on the engine, applies it to one connection immediately, and
   * every other pooled connection converges onto it lazily (via a `SELECT`
   * issued the next time it is used). Without this, `select()` would switch a
   * single arbitrary pooled connection and leave the rest of the pool on the
   * old keyspace — so subsequent commands would land on a random database.
   * New/reconnected connections adopt the target during their handshake.
   *
   * The engine-wide target only moves once the **server** has accepted the
   * index. Only the server knows the `databases` limit (16 by default, and
   * cluster mode rejects `SELECT` outright), so advancing the target first and
   * letting the failure propagate would leave every later command, `multi`,
   * and new-connection handshake failing in `__ensureDb` against an index
   * nothing can reach — one bad index would wedge the engine.
   *
   * @throws {EngineError} `INVALID_CONFIG_VALUE` if `database` is not a
   *   non-negative integer; `OPERATION_FAILED` if the server rejects the
   *   index — in which case the engine is left on its previous database.
   */
  public async select(database: number): Promise<string> {
    if (!Number.isInteger(database) || database < 0) {
      throw new EngineError('INVALID_CONFIG_VALUE', {
        instanceId: this.instanceId,
        option: 'database',
        reason: 'must be a non-negative integer (database index)',
      });
    }
    await this.connect();
    const conn = await this._acquire();
    let healthy = true;
    try {
      const reply = await conn.send(['SELECT', database]);
      if (reply.kind === 'error') {
        throw new EngineError('OPERATION_FAILED', {
          instanceId: this.instanceId,
          operation: 'SELECT',
          reason: reply.value.message,
        });
      }
      // Accepted — commit it. This connection is already there; the rest of
      // the pool converges lazily through `__ensureDb`, and connections
      // created from here on adopt it in `__handshake`.
      this.__connDb.set(conn, database);
      this.__targetDb = database;
      return 'OK';
    } catch (e) {
      if (!(e instanceof EngineError) || conn.closed) healthy = false;
      throw e instanceof EngineError ? e : new EngineError(
        'OPERATION_FAILED',
        {
          instanceId: this.instanceId,
          operation: 'SELECT',
          reason: e instanceof Error ? e.message : String(e),
        },
        e as Error,
      );
    } finally {
      if (healthy) {
        this._release(conn);
      } else {
        await this._destroy(conn);
      }
    }
  }

  /** Flush the currently-selected database. */
  public async flushDb(): Promise<string> {
    return _expectSimple(await this.__command(['FLUSHDB']));
  }

  /** Flush ALL databases. Use with care. */
  public async flushAll(): Promise<string> {
    return _expectSimple(await this.__command(['FLUSHALL']));
  }

  /** Number of keys in the current database. */
  public async dbsize(): Promise<number | bigint> {
    return _expectInteger(await this.__command(['DBSIZE']));
  }

  /** Echo a message back. */
  public async echo(message: string): Promise<string> {
    const reply = await this.__command(['ECHO', message]);
    if (reply.kind === 'bulk' && reply.value !== null) return reply.value;
    throw _unexpected(reply, 'ECHO');
  }

  //#endregion Public command API — server

  //#region Internal command dispatch

  /**
   * Emit the `query` observability event (and `slowQuery` when over the
   * threshold) for a completed command. `command` is the verb + key
   * only — the query-event payload is treated as sensitive.
   */
  private __emitQuery(command: string, timeMs: number): void {
    const isSlow = timeMs > this.__slowThresholdMs;
    const result: EngineQueryResult = {
      id: this._idGenerator('query'),
      query: { sql: command },
      data: [],
      count: 0,
      time: timeMs,
      isSlow,
    };
    this._emitRaw('query', this.instanceId, result);
    if (isSlow) this._emitRaw('slowQuery', this.instanceId, result);
  }

  /**
   * Acquire a pooled connection, send `parts`, return the parsed reply.
   *
   * Errors:
   * - `RespError` from the server is wrapped in `EngineError` with code
   *   `OPERATION_FAILED` (or a more specific code if the prefix maps).
   * - I/O errors destroy the connection (it's likely in a bad state).
   */
  private async __command(
    parts: ReadonlyArray<string | number>,
  ): Promise<RespValue> {
    await this.connect();
    const conn = await this._acquire();
    let healthy = true;
    const start = performance.now();
    try {
      // Bring the pooled connection onto the engine's target logical database
      // before running the command, so a prior `select()` applies to every
      // connection — not just the one that call happened to acquire.
      await this.__ensureDb(conn);
      const reply = await conn.send(parts);
      if (reply.kind === 'error') {
        // Protocol error from server — connection is fine.
        const err = reply.value;
        const code = _redisErrorPrefixToCode(err.prefix);
        throw new EngineError(code, {
          instanceId: this.instanceId,
          operation: String(parts[0] ?? ''),
          reason: err.message,
        });
      }
      // command verb + key (never the value) — the query event payload
      // is sensitive, so keep it terse.
      this.__emitQuery(
        parts.slice(0, 2).map(String).join(' '),
        performance.now() - start,
      );
      return reply;
    } catch (e) {
      // I/O / parse error, or an EngineError-wrapped transport failure that
      // left the socket closed (e.g. max-buffer overflow) — either way the
      // connection is broken and must not be recycled.
      if (!(e instanceof EngineError) || conn.closed) {
        healthy = false;
      }
      throw e instanceof EngineError ? e : new EngineError(
        'OPERATION_FAILED',
        {
          instanceId: this.instanceId,
          operation: String(parts[0] ?? ''),
          reason: e instanceof Error ? e.message : String(e),
        },
        e as Error,
      );
    } finally {
      if (healthy) {
        this._release(conn);
      } else {
        await this._destroy(conn);
      }
    }
  }

  //#endregion Internal command dispatch
}

//#region Reply helpers

function _expectSimple(reply: RespValue): string {
  if (reply.kind === 'string') return reply.value;
  if (reply.kind === 'bulk' && reply.value !== null) return reply.value;
  throw _unexpected(reply, 'simple-string');
}

/**
 * Unwrap a RESP `:`-integer reply.
 *
 * RESP integers are signed 64-bit on the wire, so the value is a `number`
 * for the common in-range case and a `bigint` only when it exceeds
 * ±(2^53−1) — see {@link RespValue} / `resp.ts`. Every public command that
 * returns a plain integer therefore returns `number | bigint`; small
 * results (`INCR` → `1`, a `DEL` count) stay `number`.
 */
function _expectInteger(reply: RespValue): number | bigint {
  if (reply.kind === 'integer') return reply.value;
  if (reply.kind === 'boolean') return reply.value ? 1 : 0;
  throw _unexpected(reply, 'integer');
}

function _expectBulkOrNull(reply: RespValue): string | null {
  if (reply.kind === 'bulk') return reply.value;
  if (reply.kind === 'null') return null;
  if (reply.kind === 'string') return reply.value;
  if (reply.kind === 'verbatim') return reply.value;
  throw _unexpected(reply, 'bulk-or-null');
}

function _expectStringArray(reply: RespValue, op: string): string[] {
  if (reply.kind !== 'array' && reply.kind !== 'set') {
    throw _unexpected(reply, op);
  }
  const arr = reply.value;
  if (arr === null) return [];
  return arr.map((v) => {
    if (v.kind === 'bulk' && v.value !== null) return v.value;
    if (v.kind === 'string') return v.value;
    throw _unexpected(v, op);
  });
}

function _unexpected(reply: RespValue, op: string): Error {
  return new Error(
    `Unexpected reply kind "${reply.kind}" for ${op}`,
  );
}

/**
 * Map a Redis error prefix to one of our standardized engine error codes.
 *
 * Examples:
 * - `WRONGPASS` / `NOAUTH` → INVALID_AUTH
 * - `NOPERM`             → PERMISSION_DENIED
 * - `WRONGTYPE`          → OPERATION_FAILED (most idiomatic catch-all)
 * - `OOM`                → OPERATION_FAILED
 * - everything else      → OPERATION_FAILED
 */
function _redisErrorPrefixToCode(
  prefix: string,
):
  | 'INVALID_AUTH'
  | 'PERMISSION_DENIED'
  | 'OPERATION_FAILED' {
  switch (prefix) {
    case 'NOAUTH':
    case 'WRONGPASS':
      return 'INVALID_AUTH';
    case 'NOPERM':
      return 'PERMISSION_DENIED';
    default:
      return 'OPERATION_FAILED';
  }
}

/**
 * Resolve `ssl.enforce` to a concrete boolean.
 * - No `ssl` configured: `false` (no TLS demand at all).
 * - `ssl: true`: `true` (encryption required, no fallback knob).
 * - `ssl: { enforce }`: honour the field; default `true`.
 */
function _resolveEnforceTls(
  ssl: RedisEngineOptions['ssl'],
): boolean {
  if (!ssl) return false;
  if (typeof ssl === 'object') return ssl.enforce !== false;
  return true;
}

//#endregion Reply helpers
