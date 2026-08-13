/**
 * @fileoverview Memcached driver engine.
 *
 * Cross-runtime Memcached client built on the text protocol over plain TCP.
 * Connections are pooled by `BaseEngine`; this module supplies the protocol
 * factory + parser. Works on Deno, Bun, and Node.js with no external
 * dependencies (uses `@tundralibs/compat/net` for the TCP transport).
 *
 * Supported commands:
 * - **Retrieval**: `get`, `gets` (with CAS token)
 * - **Storage**: `set`, `add`, `replace`, `cas`, `append`, `prepend`
 * - **Mutation**: `delete`, `incr`, `decr`, `touch`
 * - **Admin**: `flush` (with optional delay), `stats`, `version`
 *
 * Both TCP (`host` + `port`) and Unix sockets (`host` ending in `.sock`) are
 * supported.
 *
 * @module
 *
 * @example
 * ```typescript
 * import { MemcachedEngine } from '@tundralibs/drivers/memcached';
 *
 * const cache = new MemcachedEngine('cache', {
 *   host: 'localhost',
 *   port: 11211,
 *   pool: { min: 1, max: 8 },
 * });
 *
 * await cache.set('user:1', JSON.stringify({ name: 'Alice' }), 60);
 * const raw = await cache.get('user:1');
 * await cache.disconnect();
 * ```
 */

import type { TLSOptions as CompatTLSOptions } from '@tundralibs/compat/common';
import { connect, type Connection } from '@tundralibs/compat/net';
import type { EventOptionKeys } from '@tundralibs/utils';
import { BaseEngine } from '../../BaseEngine.ts';
import { EngineError } from '../../errors/mod.ts';
import type {
  EngineCapabilities,
  EngineQueryResult,
  MemcachedEngineEvents,
} from '../../types/mod.ts';
import { looksLikeTlsRuntimeError } from '../../tls.ts';
import type { MemcachedEngineOptions } from './types/mod.ts';

/**
 * Default configuration values for Memcached connections.
 */
const MEMCACHED_DEFAULTS: Partial<MemcachedEngineOptions> = {
  port: 11211,
  maxBufferSize: 2,
  slowQueryThreshold: 0.5,
};

/**
 * Memcached driver engine.
 *
 * Implements the Memcached text protocol over plain TCP using
 * `@tundralibs/compat/net`, so the same code works on Deno, Bun, and Node.js.
 * Connections are managed by `BaseEngine`'s pool — each operation acquires a
 * connection, runs one request/response cycle, and releases it back.
 *
 * Connection health: an operation that leaves a connection unusable — a
 * transport failure (a rejected read/write: ECONNRESET, EPIPE, aborted TLS), a
 * socket closed mid-reply, or a mid-reply desync (buffer overflow,
 * malformed/partial `VALUE` frame with unconsumed bytes) — **destroys** the
 * connection instead of returning it to the pool (via {@link _validateResource}
 * + a destroy-on-poison release), so a poisoned socket is never re-served. A
 * complete server-error reply keeps the connection.
 *
 * Supported commands: `get`, `set`, `add`, `replace`, `append`, `prepend`,
 * `delete`, `incr`, `decr`, `flush`, `stats`, `version`.
 *
 * @example
 * ```typescript
 * const engine = new MemcachedEngine('cache', {
 *   host: 'localhost',
 *   port: 11211,
 *   pool: { min: 1, max: 5 },
 * });
 * await engine.connect();
 *
 * await engine.set('user:1', JSON.stringify({ name: 'Alice' }), 60);
 * const raw = await engine.get('user:1');
 *
 * await engine.disconnect();
 * ```
 */
export class MemcachedEngine extends BaseEngine<
  Connection,
  MemcachedEngineOptions,
  MemcachedEngineEvents
> {
  /** Engine identifier. */
  public readonly Engine = 'MEMCACHED';

  /** Capabilities declaration. */
  public readonly Capabilities: EngineCapabilities = {
    pooledConnections: true,
    transactions: false,
    preparedStatements: false,
  };

  /**
   * Lines that signal the end of a Memcached server response.
   * `VALUE` and numeric (incr/decr) responses are handled separately.
   */
  private static readonly ENDING_LINES = new Set([
    'END',
    'STORED',
    'NOT_STORED',
    'EXISTS',
    'NOT_FOUND',
    'DELETED',
    'OK',
    'TOUCHED',
  ]);

  /** Slow-command threshold in ms, resolved from `slowQueryThreshold`
   * (seconds). A command slower than this fires `slowQuery`. */
  private readonly __slowThresholdMs: number;

  /**
   * Connections a failed operation left unusable — a dead socket (clean EOF or
   * a rejected read/write) or a mid-reply desync (buffer overflow,
   * malformed/partial VALUE frame) with unconsumed bytes still in flight.
   * Such a connection must never be reused:
   * the next command would read the leftover bytes as its own response
   * (silently wrong data) or fail. Tracked so {@link __release} destroys it
   * instead of returning it to the pool, and {@link _validateResource} rejects
   * it should it slip back into the idle list.
   */
  private readonly __broken: WeakSet<Connection> = new WeakSet();

  /**
   * @param name - Unique connection name.
   * @param options - Engine options + event handlers.
   * @throws {EngineError} `MISSING_CONFIG_VALUE` if `host` is not provided.
   */
  constructor(
    name: string,
    options: EventOptionKeys<MemcachedEngineOptions, MemcachedEngineEvents>,
  ) {
    super(name, options, MEMCACHED_DEFAULTS);
    this.__slowThresholdMs = (this._getOption('slowQueryThreshold') ?? 0.5) *
      1000;
    this._requireOptions(['host']);
  }

  //#region BaseEngine hooks

  /**
   * Open a fresh connection to the Memcached server.
   *
   * - Unix socket path (`host` ending in `.sock`): direct TCP, TLS not
   *   meaningful and `ssl` is silently ignored.
   * - TCP host: optional TLS via `ssl` (TLS-from-byte-1, like Redis;
   *   memcached has no STARTTLS handshake).
   *
   * `ssl.enforce` controls failure handling on the TCP path:
   * - `enforce: true` (default) — TLS failure throws.
   * - `enforce: false` — TLS failure (handshake error sync at
   *   connect time, or lazy on the first `version` ping on Deno) →
   *   reconnect plain. Loud `notice` emit on every downgrade.
   *
   * Standard memcached doesn't natively speak TLS; the relevant cases
   * are `--enable-tls` builds and managed offerings (e.g. AWS
   * ElastiCache for Memcached).
   */
  protected async _createResource(): Promise<Connection> {
    const host = this._getOption('host')!;
    if (host.endsWith('.sock')) {
      return await connect({ path: host });
    }

    const port = this._getOption('port')!;
    const ssl = this._getOption('ssl');
    const enforceTls = _resolveEnforceTls(ssl);

    let conn: Connection;
    try {
      conn = await connect({
        hostname: host,
        port,
        ...(ssl ? { tls: this.__buildTlsOptions(ssl) } : {}),
      });
    } catch (e) {
      if (!ssl || enforceTls) throw e;
      const reason = e instanceof Error ? e.message : String(e);
      this._emit(
        'notice',
        this.instanceId,
        `WARNING: TLS connect failed (${reason}); falling back to plaintext per ssl.enforce=false`,
      );
      conn = await connect({ hostname: host, port });
    }

    // Lazy-handshake probe: send `version` and read the reply. On
    // Deno, cert-validation errors surface here, not on `connect`.
    if (ssl) {
      try {
        await this.__versionProbe(conn);
      } catch (e) {
        try {
          conn.close();
        } catch {
          /* ignore */
        }
        if (!enforceTls && looksLikeTlsRuntimeError(e)) {
          const reason = e instanceof Error ? e.message : String(e);
          this._emit(
            'notice',
            this.instanceId,
            `WARNING: TLS handshake failed during probe (${reason}); falling back to plaintext per ssl.enforce=false`,
          );
          conn = await connect({ hostname: host, port });
        } else {
          throw e;
        }
      }
    }

    return conn;
  }

  /**
   * Map the engine-level `ssl` option to a `compat.TLSOptions`. Compat
   * reads files (`*File` paths) and validates PEM content itself, so
   * we just strip the engine-only `enforce` flag and pass the rest
   * through.
   */
  private __buildTlsOptions(
    ssl: NonNullable<MemcachedEngineOptions['ssl']>,
  ): true | CompatTLSOptions {
    if (ssl === true || ssl === false) return true;
    const { enforce: _enforce, ...rest } = ssl;
    return rest;
  }

  /**
   * Send a `version\r\n` and read until we see a `VERSION ...` line —
   * forces Deno's lazy TLS handshake to actually run before the pool
   * hands the connection to the first caller.
   */
  private async __versionProbe(conn: Connection): Promise<void> {
    await this.__write(conn, new TextEncoder().encode('version\r\n'));
    // One read should be enough — `VERSION x.y.z\r\n` fits in a
    // single packet. We don't parse it; surfacing TLS errors is the
    // only reason we're here.
    await this.__read(conn);
  }

  /**
   * Close a TCP connection.
   * Called by the pool when a resource is destroyed (idle eviction or drain).
   */
  protected _destroyResource(conn: Connection): void {
    try {
      conn.close();
    } catch {
      // Already closed — nothing to do.
    }
  }

  /**
   * Verify a pooled connection is still alive by sending a `version` request.
   */
  protected async _ping(conn: Connection): Promise<boolean> {
    try {
      const response = await this.__request(conn, 'version\r\n');
      return response.startsWith('VERSION');
    } catch {
      return false;
    }
  }

  /**
   * Reject a connection a failed operation flagged as broken. Memcached uses
   * the raw compat {@link Connection} (no `closed` flag of its own), so a dead
   * or mid-reply socket would otherwise pass the base `_validateResource`
   * (always `true`) and be re-served with zero checks. Every socket call goes
   * through {@link __write} / {@link __read}, so a transport rejection flags
   * the connection just like a clean EOF or a desynced frame does.
   */
  protected override _validateResource(conn: Connection): boolean {
    return !this.__broken.has(conn);
  }

  //#endregion BaseEngine hooks

  //#region Public API

  /**
   * Retrieve the value stored at `key`.
   *
   * @returns The raw stored value, or `null` if the key is missing / expired.
   */
  public async get(key: string): Promise<string | null> {
    this.__validateKey(key);
    await this.connect();
    const conn = await this._acquire();
    try {
      const hit = await this.__readValue(conn, `get ${key}\r\n`, false);
      return hit ? hit.value : null;
    } finally {
      await this.__release(conn);
    }
  }

  /**
   * Retrieve the value stored at `key` along with its CAS token.
   *
   * Use this with {@link cas} for optimistic concurrency control: read with
   * `gets`, do your computation, then `cas` with the same token. If the value
   * changed in between, `cas` returns `false` and you can retry.
   *
   * @returns `{ value, cas }` on hit, `null` if the key is missing / expired.
   */
  public async gets(
    key: string,
  ): Promise<{ value: string; cas: string } | null> {
    this.__validateKey(key);
    await this.connect();
    const conn = await this._acquire();
    try {
      const hit = await this.__readValue(conn, `gets ${key}\r\n`, true);
      if (!hit?.cas) return null;
      return { value: hit.value, cas: hit.cas };
    } finally {
      await this.__release(conn);
    }
  }

  /**
   * Unconditionally store `value` under `key`. Replaces any existing entry.
   *
   * @param ttl - Time-to-live in seconds (default 30). `0` means **never
   *   expire** (permanent); values over 2592000 are treated by Memcached as
   *   an absolute Unix timestamp; negative/invalid values clamp to 1 second.
   */
  public async set(
    key: string,
    value: string,
    ttl: number = 30,
  ): Promise<boolean> {
    this.__validateKey(key);
    return await this.__runStore('set', key, value, ttl);
  }

  /**
   * Store `value` under `key` only if the key does not already exist.
   *
   * @returns `true` on successful store; `false` if the key already
   *   exists (server returned `NOT_STORED`).
   */
  public async add(
    key: string,
    value: string,
    ttl: number = 30,
  ): Promise<boolean> {
    this.__validateKey(key);
    return await this.__runStore('add', key, value, ttl);
  }

  /**
   * Store `value` under `key` only if the key already exists.
   *
   * @returns `true` on successful store; `false` if the key does not
   *   exist (server returned `NOT_STORED`).
   */
  public async replace(
    key: string,
    value: string,
    ttl: number = 30,
  ): Promise<boolean> {
    this.__validateKey(key);
    return await this.__runStore('replace', key, value, ttl);
  }

  /**
   * Conditionally store `value` under `key` only if the server-side CAS token
   * still matches `casToken`. Used together with {@link gets} for optimistic
   * concurrency control.
   *
   * @returns `true` on successful store; `false` if another writer beat us
   *   (server returned `EXISTS`) or the key has since been removed
   *   (`NOT_FOUND`). Callers can re-`gets` and retry on `false`.
   * @throws {EngineError} `INVALID_CONFIG_VALUE` if `key` or `casToken` is
   *   not protocol-safe.
   * @throws {EngineError} `OPERATION_FAILED` for any other server response.
   */
  public async cas(
    key: string,
    value: string,
    casToken: string,
    ttl: number = 30,
  ): Promise<boolean> {
    this.__validateKey(key);
    this.__validateCasToken(casToken);
    await this.connect();
    const exptime = this.__exptime(ttl);
    const bytes = new TextEncoder().encode(value).length;
    const command =
      `cas ${key} 0 ${exptime} ${bytes} ${casToken}\r\n${value}\r\n`;
    const conn = await this._acquire();
    try {
      const response = await this.__request(conn, command);
      if (response.startsWith('STORED')) return true;
      if (response.startsWith('EXISTS')) return false;
      if (response.startsWith('NOT_FOUND')) return false;
      throw new EngineError('OPERATION_FAILED', {
        instanceId: this.instanceId,
        operation: 'cas',
        reason: response,
      });
    } finally {
      await this.__release(conn);
    }
  }

  /**
   * Append `value` to the existing value for `key`.
   *
   * @throws {EngineError} `OPERATION_FAILED` if the key does not exist.
   */
  public async append(key: string, value: string): Promise<boolean> {
    this.__validateKey(key);
    return await this.__runStore('append', key, value, 0);
  }

  /**
   * Prepend `value` to the existing value for `key`.
   *
   * @throws {EngineError} `OPERATION_FAILED` if the key does not exist.
   */
  public async prepend(key: string, value: string): Promise<boolean> {
    this.__validateKey(key);
    return await this.__runStore('prepend', key, value, 0);
  }

  /**
   * Update the expiry of an existing key without re-sending its value.
   *
   * @param ttl - New time-to-live in seconds. `0` means **never expire**
   *   (permanent); negative/invalid values clamp to 1 second.
   * @returns `true` if the key existed and its TTL was updated; `false` if
   *   the key did not exist.
   */
  public async touch(key: string, ttl: number): Promise<boolean> {
    this.__validateKey(key);
    await this.connect();
    const exptime = this.__exptime(ttl);
    const conn = await this._acquire();
    try {
      const response = await this.__request(
        conn,
        `touch ${key} ${exptime}\r\n`,
      );
      if (response.startsWith('TOUCHED')) return true;
      if (response.startsWith('NOT_FOUND')) return false;
      throw new EngineError('OPERATION_FAILED', {
        instanceId: this.instanceId,
        operation: 'touch',
        reason: response,
      });
    } finally {
      await this.__release(conn);
    }
  }

  /**
   * Delete `key` from the cache.
   *
   * @returns `true` if the key was deleted, `false` if it did not exist.
   */
  public async delete(key: string): Promise<boolean> {
    this.__validateKey(key);
    await this.connect();
    const conn = await this._acquire();
    try {
      const response = await this.__request(conn, `delete ${key}\r\n`);
      if (response.startsWith('DELETED')) return true;
      if (response.startsWith('NOT_FOUND')) return false;
      throw new EngineError('OPERATION_FAILED', {
        instanceId: this.instanceId,
        operation: 'delete',
        reason: response,
      });
    } finally {
      await this.__release(conn);
    }
  }

  /**
   * Atomically increment the numeric value stored at `key` by `delta`.
   *
   * @returns The new value after incrementing.
   * @throws {EngineError} `OPERATION_FAILED` if the key does not exist or
   *   does not contain a numeric value.
   */
  public async incr(key: string, delta: number = 1): Promise<number> {
    this.__validateKey(key);
    return await this.__runCounter('incr', key, delta);
  }

  /**
   * Atomically decrement the numeric value stored at `key` by `delta`.
   *
   * @returns The new value after decrementing.
   * @throws {EngineError} `OPERATION_FAILED` if the key does not exist or
   *   does not contain a numeric value.
   */
  public async decr(key: string, delta: number = 1): Promise<number> {
    this.__validateKey(key);
    return await this.__runCounter('decr', key, delta);
  }

  /**
   * Flush all data from the server.
   *
   * @param delaySeconds - Optional delay in seconds before the flush takes
   *   effect on the server. The command returns `OK` immediately; existing
   *   entries are then expired after the delay. Useful for staggered
   *   invalidation across a fleet of clients.
   */
  public async flush(delaySeconds?: number): Promise<boolean> {
    await this.connect();
    const command = delaySeconds && delaySeconds > 0
      ? `flush_all ${Math.floor(delaySeconds)}\r\n`
      : 'flush_all\r\n';
    const conn = await this._acquire();
    try {
      const response = await this.__request(conn, command);
      if (response.startsWith('OK')) return true;
      throw new EngineError('OPERATION_FAILED', {
        instanceId: this.instanceId,
        operation: 'flush',
        reason: response,
      });
    } finally {
      await this.__release(conn);
    }
  }

  /**
   * Retrieve server statistics as raw lines (excluding the trailing `END`).
   */
  public async stats(): Promise<string[]> {
    await this.connect();
    const conn = await this._acquire();
    try {
      const response = await this.__request(conn, 'stats\r\n');
      return response
        .split('\r\n')
        .filter((line) => line.length > 0 && line !== 'END');
    } finally {
      await this.__release(conn);
    }
  }

  /**
   * Retrieve the server version string.
   */
  public async version(): Promise<string> {
    await this.connect();
    const conn = await this._acquire();
    try {
      const response = await this.__request(conn, 'version\r\n');
      if (!response.startsWith('VERSION')) {
        throw new EngineError('OPERATION_FAILED', {
          instanceId: this.instanceId,
          operation: 'version',
          reason: response,
        });
      }
      return response.slice('VERSION '.length).trim();
    } finally {
      await this.__release(conn);
    }
  }

  //#endregion Public API

  //#region Internal helpers

  /**
   * Validate a user-supplied `key` against the Memcached text-protocol rules
   * before it is interpolated into a command line.
   *
   * The text protocol separates a command's arguments with spaces and
   * terminates each line with `\r\n`, while capping keys at 250 bytes. A key
   * containing whitespace, control characters, or a CRLF would therefore let a
   * caller smuggle extra arguments — or whole additional commands — into the
   * wire stream (command injection). For example a key of
   * `"foo 0 0 5\r\nset evil 0 0 5\r\npwned"` would inject a second `set`.
   * We reject anything outside the printable, whitespace-free, ≤250-byte range.
   *
   * @param key - The key to validate.
   * @throws {EngineError} `INVALID_CONFIG_VALUE` if the key is empty, exceeds
   *   250 bytes, or contains whitespace / control characters.
   */
  private __validateKey(key: string): void {
    if (typeof key !== 'string' || key.length === 0) {
      throw new EngineError('INVALID_CONFIG_VALUE', {
        instanceId: this.instanceId,
        option: 'key',
        reason: 'must be a non-empty string',
      });
    }
    // 0x00-0x20 covers all C0 control chars *and* the space (0x20); 0x7f is
    // DEL. Any of these — most dangerously `\r` (0x0d) / `\n` (0x0a) — would
    // break out of the intended argument/line and enable command injection.
    // The control chars in this class are deliberate (that's what we reject).
    // deno-lint-ignore no-control-regex
    if (/[\x00-\x20\x7f]/.test(key)) {
      throw new EngineError('INVALID_CONFIG_VALUE', {
        instanceId: this.instanceId,
        option: 'key',
        reason: 'must not contain whitespace or control characters',
      });
    }
    // The protocol limits keys to 250 *bytes*, not characters — a multi-byte
    // UTF-8 key can exceed 250 bytes while being shorter in `.length`.
    if (new TextEncoder().encode(key).length > 250) {
      throw new EngineError('INVALID_CONFIG_VALUE', {
        instanceId: this.instanceId,
        option: 'key',
        reason: 'must not exceed 250 bytes',
      });
    }
  }

  /**
   * Validate a caller-supplied `casToken` before it is interpolated into a
   * `cas` command line.
   *
   * A CAS token is a 64-bit unsigned counter minted by the server and handed
   * to the caller by {@link gets}, so the only legitimate value is a run of
   * decimal digits. The public {@link cas} signature types it as a plain
   * `string` though, and it lands at the tail of the command line — the same
   * position a key occupies, and with the same consequence. A token carrying
   * whitespace or a CRLF smuggles extra arguments (or a whole second command)
   * onto the wire: `'12345\r\ndelete victim'` appends a `delete`. This is the
   * {@link __validateKey} hazard on the other argument, so it gets the same
   * treatment.
   *
   * @param casToken - The CAS token to validate.
   * @throws {EngineError} `INVALID_CONFIG_VALUE` if the token is not a
   *   non-empty run of decimal digits.
   */
  private __validateCasToken(casToken: string): void {
    // Digits-only is stricter than "no control chars" and needs no
    // line-terminator caveats: `$` anchors at end-of-input in JS (no `m`
    // flag), so a trailing `\n` fails the test.
    if (typeof casToken !== 'string' || !/^[0-9]+$/.test(casToken)) {
      throw new EngineError('INVALID_CONFIG_VALUE', {
        instanceId: this.instanceId,
        option: 'casToken',
        reason: 'must be a non-empty string of digits',
      });
    }
  }

  /**
   * Normalize a caller-supplied TTL into a Memcached `exptime` field.
   *
   * `exptime` is not a plain seconds value — its ranges carry distinct
   * meaning in the protocol:
   *
   * - `0`              → **never expire** (the item is permanent).
   * - `1`..`2592000`   → relative lifetime in seconds (up to 30 days).
   * - `> 2592000`      → an absolute Unix timestamp.
   *
   * So `0` must pass through untouched: clamping it up to `1` (the previous
   * `Math.max(1, ttl)`) silently turned a caller's "store forever" into
   * "expire in one second" — the root cause of a downstream cacher bug where
   * a `ttl: 0` entry vanished after a second. A negative or non-finite TTL
   * has no legal meaning here (a negative exptime evicts immediately), so it
   * is clamped to a 1-second minimum rather than poisoning the cache. Values
   * above the 30-day boundary are left as-is so the absolute-timestamp form
   * keeps working. The result is truncated to an integer — `exptime` is a
   * whole-second field on the wire.
   *
   * @param ttl - Caller-supplied time-to-live in seconds.
   * @returns The Memcached `exptime` value to place on the command line.
   */
  private __exptime(ttl: number): number {
    if (ttl === 0) return 0;
    if (!Number.isFinite(ttl) || ttl < 1) return 1;
    return Math.trunc(ttl);
  }

  /**
   * Run a `set`/`add`/`replace`/`append`/`prepend` storage command and assert
   * the server returned `STORED`.
   */
  private async __runStore(
    op: 'set' | 'add' | 'replace' | 'append' | 'prepend',
    key: string,
    value: string,
    ttl: number,
  ): Promise<boolean> {
    // `append`/`prepend` never carry a lifetime — the Memcached protocol
    // ignores their exptime field, so pin it to 0. Everything else goes
    // through `__exptime`, which preserves ttl=0 as "never expire".
    const exptime = op === 'append' || op === 'prepend'
      ? 0
      : this.__exptime(ttl);
    const bytes = new TextEncoder().encode(value).length;
    const command = `${op} ${key} 0 ${exptime} ${bytes}\r\n${value}\r\n`;

    await this.connect();
    const conn = await this._acquire();
    try {
      const response = await this.__request(conn, command);
      if (response.startsWith('STORED')) return true;
      // NOT_STORED is the documented "precondition not met" reply for
      // `add` (key already exists) and `replace` (key doesn't exist).
      // Treat it as a soft `false` for those ops; for `set` /`append` /
      // `prepend` it's unusual and we surface it as an error.
      if (
        response.startsWith('NOT_STORED') &&
        (op === 'add' || op === 'replace')
      ) {
        return false;
      }
      throw new EngineError('OPERATION_FAILED', {
        instanceId: this.instanceId,
        operation: op,
        reason: response,
      });
    } finally {
      await this.__release(conn);
    }
  }

  /**
   * Run an `incr` / `decr` command and parse the numeric response.
   */
  private async __runCounter(
    op: 'incr' | 'decr',
    key: string,
    delta: number,
  ): Promise<number> {
    await this.connect();
    const conn = await this._acquire();
    try {
      const response = await this.__request(conn, `${op} ${key} ${delta}\r\n`);
      const result = Number.parseInt(response.trim(), 10);
      if (Number.isNaN(result)) {
        throw new EngineError('OPERATION_FAILED', {
          instanceId: this.instanceId,
          operation: op,
          reason: response,
        });
      }
      return result;
    } finally {
      await this.__release(conn);
    }
  }

  /**
   * Return a healthy connection to the pool, or destroy one a failed
   * operation left broken (dead socket / mid-reply desync). Mirrors
   * RedisEngine's healthy/destroy split so a poisoned connection is never
   * handed to the next acquirer. Every public op runs this in its `finally`.
   */
  private async __release(conn: Connection): Promise<void> {
    if (this.__broken.has(conn)) {
      this.__broken.delete(conn);
      await this._destroy(conn);
      return;
    }
    this._release(conn);
  }

  /**
   * Flag `conn` as unusable (mid-reply desync or dead socket) so
   * {@link __release} destroys it rather than returning it to the pool.
   */
  private __poison(conn: Connection): void {
    this.__broken.add(conn);
  }

  /**
   * `conn.write` with poison-on-failure.
   *
   * A rejected write (ECONNRESET, EPIPE, broken TLS) leaves the socket
   * unusable — and on Node/Bun permanently so: compat's `wrapNodeSocket`
   * stores the socket error and rejects every later read *and* write. The
   * raw error would otherwise escape {@link __request} / {@link __readValue}
   * with the connection un-flagged, so {@link __release} would push the
   * corpse straight back to the idle list, where {@link _validateResource}
   * (`!__broken.has`) waves it through forever. Poisoning covers the whole
   * failure surface, not just the clean-EOF (`read()` → `null`) half.
   */
  private async __write(conn: Connection, bytes: Uint8Array): Promise<void> {
    try {
      await conn.write(bytes);
    } catch (e) {
      this.__poison(conn);
      throw e;
    }
  }

  /**
   * `conn.read` with poison-on-failure — the read counterpart of
   * {@link __write}. A *rejected* read (transport reset, aborted timeout) is
   * distinct from a read that resolves `null` (clean EOF, handled by the
   * callers); both leave the connection unusable and must poison it.
   */
  private async __read(conn: Connection): Promise<Uint8Array | null> {
    try {
      return await conn.read();
    } catch (e) {
      this.__poison(conn);
      throw e;
    }
  }

  /**
   * Send `command` over `conn` and read the complete server response.
   *
   * The response is collected line-by-line until either:
   * - a known terminating line is seen (e.g. `END`, `STORED`),
   * - an error line is seen (`ERROR`, `CLIENT_ERROR`, `SERVER_ERROR`),
   * - or the response exceeds `maxBufferSize`.
   */
  private async __request(
    conn: Connection,
    command: string,
  ): Promise<string> {
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    const maxBytes = this._getOption('maxBufferSize')! * 1024 * 1024;
    const isCounter = command.startsWith('incr ') ||
      command.startsWith('decr ');

    const start = performance.now();
    await this.__write(conn, encoder.encode(command));

    const lines: string[] = [];
    let buffer = '';
    let bytesRead = 0;

    while (true) {
      const chunk = await this.__read(conn);
      if (chunk === null) {
        // Server closed mid-reply. Returning a partial response would
        // let the caller mis-parse it (e.g. accept an "ok"-looking
        // prefix). Surface as a transport error so the caller can
        // tear down the connection. Mirrors `RedisConnection.readReply`.
        this.__poison(conn);
        throw new EngineError('CONNECTION_LOST', {
          instanceId: this.instanceId,
          reason: `connection closed mid-reply during "${
            command.split(' ')[0]
          }"`,
        });
      }

      bytesRead += chunk.length;
      if (bytesRead > maxBytes) {
        // Unread bytes are still arriving; this socket is mid-reply and
        // desynced. Poison it so it is destroyed, not recycled.
        this.__poison(conn);
        throw new EngineError('OPERATION_FAILED', {
          instanceId: this.instanceId,
          operation: command.split(' ')[0]!,
          reason: `Response exceeds maximum buffer size (${maxBytes} bytes)`,
        });
      }

      buffer += decoder.decode(chunk, { stream: true });

      let idx;
      while ((idx = buffer.indexOf('\r\n')) >= 0) {
        const line = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        lines.push(line);

        if (this.__isTerminalLine(line, isCounter)) {
          this.__emitQuery(command, performance.now() - start);
          return lines.join('\r\n');
        }
      }
    }
  }

  /**
   * Emit the `query` observability event (and `slowQuery` when over the
   * threshold) for a completed command. `commandLine` is reduced to the
   * verb + key only — the query-event payload is treated as sensitive.
   */
  private __emitQuery(commandLine: string, timeMs: number): void {
    const isSlow = timeMs > this.__slowThresholdMs;
    const result: EngineQueryResult = {
      id: this._idGenerator('query'),
      query: {
        sql: commandLine.trimStart().split(/\s+/).slice(0, 2).join(' '),
      },
      data: [],
      count: 0,
      time: timeMs,
      isSlow,
    };
    this._emitRaw('query', this.instanceId, result);
    if (isSlow) this._emitRaw('slowQuery', this.instanceId, result);
  }

  /**
   * Binary-safe read of a `get` / `gets` response.
   *
   * The text-line-based `__request` cannot be used for VALUE replies:
   * `<data>` is delivered as exactly `<bytes>` raw bytes per the
   * Memcached protocol, and values containing `\r\nEND` would
   * otherwise be truncated by line-based splitting. This reader:
   *
   * 1. Reads bytes from the socket into a growing buffer.
   * 2. Parses the first CRLF-terminated header line.
   * 3. On `END`: cache miss → `null`.
   * 4. On `VALUE <key> <flags> <bytes> [<cas>]`: reads exactly
   *    `<bytes>` bytes of data, then asserts `\r\nEND\r\n`.
   * 5. On `ERROR` / `CLIENT_ERROR` / `SERVER_ERROR`: throws.
   *
   * @returns `{ value, cas? }` on hit, `null` on miss.
   */
  private async __readValue(
    conn: Connection,
    command: string,
    withCas: boolean,
  ): Promise<{ value: string; cas?: string } | null> {
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    const maxBytes = this._getOption('maxBufferSize')! * 1024 * 1024;
    const op = command.split(' ')[0]!;

    const start = performance.now();
    await this.__write(conn, encoder.encode(command));

    // Growing byte buffer. We keep raw bytes throughout — only the
    // header line and the trailing `END` get decoded as text.
    let buf = new Uint8Array(0);
    const readMore = async (): Promise<void> => {
      const chunk = await this.__read(conn);
      if (chunk === null) {
        this.__poison(conn);
        throw new EngineError('OPERATION_FAILED', {
          instanceId: this.instanceId,
          operation: op,
          reason: 'Connection closed mid-reply',
        });
      }
      if (buf.length + chunk.length > maxBytes) {
        // Mid-value overflow: the rest of the value is still streaming in, so
        // the socket is desynced. Poison it so it is destroyed, not recycled.
        this.__poison(conn);
        throw new EngineError('OPERATION_FAILED', {
          instanceId: this.instanceId,
          operation: op,
          reason: `Response exceeds maximum buffer size (${maxBytes} bytes)`,
        });
      }
      const merged = new Uint8Array(buf.length + chunk.length);
      merged.set(buf);
      merged.set(chunk, buf.length);
      buf = merged;
    };

    const findCrlf = (from: number): number => {
      for (let i = from; i + 1 < buf.length; i++) {
        if (buf[i] === 0x0d && buf[i + 1] === 0x0a) return i;
      }
      return -1;
    };

    // 1. Read the header line.
    let headerEnd = findCrlf(0);
    while (headerEnd < 0) {
      await readMore();
      headerEnd = findCrlf(0);
    }
    const header = decoder.decode(buf.subarray(0, headerEnd));

    // Error replies surface here too — they're terminal on their own
    // line, no value follows.
    if (header === 'ERROR') {
      throw new EngineError('OPERATION_FAILED', {
        instanceId: this.instanceId,
        operation: op,
        reason: header,
      });
    }
    if (
      header.startsWith('CLIENT_ERROR ') || header.startsWith('SERVER_ERROR ')
    ) {
      throw new EngineError('OPERATION_FAILED', {
        instanceId: this.instanceId,
        operation: op,
        reason: header,
      });
    }

    // Cache miss — single-line `END\r\n` response.
    if (header === 'END') {
      this.__emitQuery(command, performance.now() - start);
      return null;
    }

    if (!header.startsWith('VALUE ')) {
      // Unrecognized header — we can't know how many bytes (if any) follow,
      // so the framing is now uncertain. Don't hand this socket back.
      this.__poison(conn);
      throw new EngineError('OPERATION_FAILED', {
        instanceId: this.instanceId,
        operation: op,
        reason: `Unexpected reply: ${header}`,
      });
    }

    // 2. Parse the header: `VALUE <key> <flags> <bytes> [<cas>]`
    const parts = header.split(' ');
    const bytesLen = Number.parseInt(parts[3] ?? '', 10);
    if (!Number.isFinite(bytesLen) || bytesLen < 0) {
      // Can't determine the data length — the value bytes that follow desync
      // the stream. Poison the connection.
      this.__poison(conn);
      throw new EngineError('OPERATION_FAILED', {
        instanceId: this.instanceId,
        operation: op,
        reason: `Malformed VALUE header: ${header}`,
      });
    }
    const cas = withCas ? parts[4] : undefined;

    // 3. Read exactly `bytesLen` bytes of data, then `\r\nEND\r\n` (7 bytes).
    const dataStart = headerEnd + 2;
    const dataEnd = dataStart + bytesLen;
    const trailerEnd = dataEnd + 7; // length of "\r\nEND\r\n"
    while (buf.length < trailerEnd) {
      await readMore();
    }
    const value = decoder.decode(buf.subarray(dataStart, dataEnd));
    const trailer = decoder.decode(buf.subarray(dataEnd, trailerEnd));
    if (trailer !== '\r\nEND\r\n') {
      // The declared byte count didn't line up with the framing — the stream
      // is desynced. Poison the connection rather than reuse it.
      this.__poison(conn);
      throw new EngineError('OPERATION_FAILED', {
        instanceId: this.instanceId,
        operation: op,
        reason:
          `Malformed VALUE trailer (expected '\\r\\nEND\\r\\n', got '${trailer}')`,
      });
    }
    this.__emitQuery(command, performance.now() - start);
    return { value, cas };
  }

  /**
   * Decide whether `line` ends a Memcached response.
   */
  private __isTerminalLine(line: string, isCounter: boolean): boolean {
    if (MemcachedEngine.ENDING_LINES.has(line)) return true;
    if (line === '' && isCounter) return false;
    if (isCounter && /^-?\d+$/.test(line)) return true;
    if (line === 'ERROR') return true;
    if (line.startsWith('CLIENT_ERROR ')) return true;
    if (line.startsWith('SERVER_ERROR ')) return true;
    // VERSION is a single-line response; first word is the marker.
    if (line.startsWith('VERSION ')) return true;
    return false;
  }

  //#endregion Internal helpers

  //#region Option processing

  protected override _processOption<K extends keyof MemcachedEngineOptions>(
    key: K,
    value: MemcachedEngineOptions[K],
  ): MemcachedEngineOptions[K] {
    switch (key) {
      case 'maxBufferSize':
        if (
          typeof value !== 'number' || Number.isNaN(value) ||
          value <= 0 || !Number.isFinite(value)
        ) {
          throw new EngineError('INVALID_CONFIG_VALUE', {
            instanceId: this.instanceId,
            option: key,
            reason: 'must be a positive number (megabytes)',
          });
        }
        break;
    }
    // deno-lint-ignore no-explicit-any
    return super._processOption(key as any, value);
  }

  //#endregion Option processing
}

/**
 * Resolve `ssl.enforce` to a concrete boolean.
 * - No `ssl` configured: `false` (no TLS demand at all).
 * - `ssl: true`: `true` (encryption required, no fallback knob).
 * - `ssl: { enforce }`: honour the field; default `true`.
 */
function _resolveEnforceTls(
  ssl: MemcachedEngineOptions['ssl'],
): boolean {
  if (!ssl) return false;
  if (typeof ssl === 'object') return ssl.enforce !== false;
  return true;
}
