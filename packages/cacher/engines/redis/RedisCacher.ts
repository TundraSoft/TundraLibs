import { RedisEngine } from '@tundralibs/drivers/redis';
import { AbstractEngine } from '../../AbstractEngine.ts';
import type { CacheValue } from '../../types/mod.ts';
import { CacherEngineError } from '../../errors/mod.ts';
import type { RedisCacherOptions } from './types/mod.ts';

/**
 * Redis-based cacher implementation, backed by `RedisEngine` from
 * `@tundralibs/drivers`.
 *
 * @extends AbstractEngine<RedisCacherOptions>
 * @see {@link AbstractEngine} for details on the base implementation
 * @see {@link RedisCacherOptions} for configuration options
 *
 * @example
 * ```ts
 * const cache = new RedisCacher('user-cache', {
 *   host: 'localhost',
 *   port: 6379,
 *   username: 'default',
 *   password: 'secret',
 *   db: 0,
 * });
 *
 * await cache.init();
 * await cache.set('user:1', { name: 'John' }, { expiry: 300 });
 * const user = await cache.get('user:1');
 * ```
 */
export class RedisCacher extends AbstractEngine<RedisCacherOptions> {
  /**
   * The engine identifier for Redis cacher.
   */
  public override readonly Engine = 'REDIS';

  /**
   * Underlying Redis driver engine.
   * @protected
   */
  protected _client: RedisEngine | undefined = undefined;

  /**
   * Creates a new Redis cacher instance.
   *
   * @param name - A unique name for this cacher instance
   * @param options - Configuration options for this cacher
   * @throws {@link CacherEngineError} if required options are missing or invalid
   */
  constructor(name: string, options: RedisCacherOptions) {
    super(name, options, {
      port: 6379,
    });
    if (this.hasOption('host') === false) {
      throw new CacherEngineError('CONFIG_MISSING', {
        name: this.name,
        engine: this.Engine,
        configKey: 'host',
      });
    }
    // Username + password must come together (either both or neither).
    const hasUser = this.hasOption('username');
    const hasPass = this.hasOption('password');
    if (hasUser !== hasPass) {
      throw new CacherEngineError('CONFIG_MISSING', {
        name: this.name,
        engine: this.Engine,
        configKey: hasUser ? 'password' : 'username',
      });
    }
  }

  /**
   * Initializes the underlying `RedisEngine` connection.
   *
   * @throws {@link CacherEngineError} `CONNECTION_FAILED` on failure.
   * @override
   */
  public override async init(): Promise<void> {
    if (this._client !== undefined) return;
    try {
      const ssl = this._getOption('ssl');
      this._client = new RedisEngine(this.name, {
        host: this._getOption('host'),
        port: this._getOption('port'),
        username: this._getOption('username'),
        password: this._getOption('password'),
        database: this._getOption('db'),
        ...(ssl === undefined ? {} : { ssl }),
      });
      await this._client.connect();
    } catch (e) {
      this._client = undefined;
      throw new CacherEngineError('CONNECTION_FAILED', {
        name: this.name,
        engine: this.Engine,
        host: this._getOption('host'),
        port: this._getOption('port'),
        username: this._getOption('username'),
        db: this._getOption('db'),
        reason: (e as Error).message,
      }, e as Error);
    }
  }

  /**
   * Finalizes the connection.
   *
   * @returns A promise that resolves when the connection has been closed.
   * @override
   */
  public override async finalize(): Promise<void> {
    if (this._client !== undefined) {
      await this._client.disconnect();
      this._client = undefined;
    }
  }

  //#region Abstract method implementations

  /**
   * Retrieves a value from Redis.
   * Refreshes the TTL when window-mode is enabled.
   */
  protected async _get(key: string): Promise<CacheValue | undefined> {
    try {
      const res = await this._client!.get(key);
      if (res === null) return undefined;
      const data = JSON.parse(res) as CacheValue;
      if (data.window && data.expiry > 0) {
        // Redis EXPIRE takes whole seconds; round a fractional TTL up so
        // it stays a positive lifetime (see _set for the rationale).
        await this._client!.expire(key, Math.ceil(data.expiry));
      }
      return data;
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
   * Stores a value in Redis. Uses `SET ... EX <ttl>` so the TTL is applied
   * atomically with the value (one round trip instead of two).
   */
  protected async _set(key: string, value: CacheValue): Promise<void> {
    try {
      // Redis SET EX only accepts whole seconds; a fractional expiry
      // (which MemoryCacher honours at millisecond precision) would make
      // Redis reject the command at runtime. Round up so a sub-second TTL
      // still maps to a real, positive lifetime rather than 0 (which Redis
      // reads as "no expiry"). expiry 0 keeps its "never expire" meaning.
      const ex = Math.ceil(value.expiry);
      await this._client!.set(
        key,
        JSON.stringify(value),
        ex > 0 ? { ex } : {},
      );
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
   * Deletes a key from Redis.
   */
  protected async _delete(key: string): Promise<void> {
    try {
      await this._client!.del(key);
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
   * Clears all keys belonging to this cacher's namespace.
   *
   * Uses `KEYS` + a single bulk `DEL` — fine for development / small key
   * counts. For production-grade clearing of large namespaces, switch to
   * `SCAN` + `DEL` in batches.
   */
  protected async _clear(): Promise<void> {
    try {
      // Escape Redis glob metacharacters in the namespace before building the
      // KEYS pattern. Without this, a name containing `*?[]\` is interpreted as
      // a glob: e.g. a cacher named `user[1]` would run `KEYS user[1]:*`, whose
      // `[1]` is a character class — it matches a *different* namespace's
      // `user1:*` keys (deleting them) and never its own literal `user[1]:*`
      // keys (leaving them behind). Escaping makes the prefix match literally.
      const pattern = `${this.name.replace(/[\\*?[\]^]/g, '\\$&')}:*`;
      const keys = await this._client!.keys(pattern);
      if (keys.length > 0) {
        await this._client!.del(...keys);
      }
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
   * Checks whether a key exists in Redis.
   */
  protected async _has(key: string): Promise<boolean> {
    try {
      return (await this._client!.exists(key)) === 1;
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

  //#region Protected methods

  protected override _processOption<K extends keyof RedisCacherOptions>( //NOSONAR
    key: K,
    value: RedisCacherOptions[K],
  ): RedisCacherOptions[K] {
    switch (key) {
      case 'host':
        if (value === undefined || value === null) {
          throw new CacherEngineError('CONFIG_MISSING', {
            name: this.name,
            engine: this.Engine,
            configKey: key,
            reason: 'Host is required',
          });
        }
        break;
      case 'port':
        value ??= 6379 as RedisCacherOptions[K];
        if (typeof value !== 'number' || value <= 0 || value > 65535) {
          throw new CacherEngineError('CONFIG_INVALID', {
            name: this.name,
            engine: this.Engine,
            configKey: key,
            reason: 'must be a positive number between 0 and 65535',
          });
        }
        break;
      case 'db':
        if (value !== undefined && value !== null) {
          if (
            typeof value !== 'number' ||
            !Number.isInteger(value) ||
            value < 0
          ) {
            throw new CacherEngineError('CONFIG_INVALID', {
              name: this.name,
              engine: this.Engine,
              configKey: key,
              reason: 'must be a non-negative integer',
            });
          }
        }
        break;
      case 'username':
      case 'password':
        if (value !== undefined && value !== null) {
          if (typeof value !== 'string') {
            throw new CacherEngineError('CONFIG_INVALID', {
              name: this.name,
              engine: this.Engine,
              configKey: key,
              reason: 'must be a string',
            });
          }
          if (value.trim().length > 0) {
            value = value.trim() as RedisCacherOptions[K];
          } else {
            value = undefined as RedisCacherOptions[K];
          }
        }
        break;
    }
    // deno-lint-ignore no-explicit-any
    return super._processOption(key as any, value);
  }

  //#endregion Protected methods
}
