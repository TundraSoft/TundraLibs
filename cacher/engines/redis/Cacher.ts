import {
  connect as redisConnect,
  type Redis,
  type RedisConnectOptions,
} from '$redis';
import { AbstractCacher } from '../../AbstractCacher.ts';
import type { CacheValue } from '../../types/mod.ts';
import {
  RedisCacherConnectError,
  RedisCacherOperationError,
} from './errors/mod.ts';
import { CacherConfigError } from '../../errors/mod.ts';
import type { RedisCacherOptions } from './types/mod.ts';

/**
 * Redis-based cacher implementation.
 *
 * Uses a Redis server for distributed caching. This implementation provides:
 * - Connection management to Redis servers
 * - Support for Redis authentication and database selection
 * - TLS/SSL connection support
 * - Automatic serialization/deserialization of values
 * - Support for expiry times and window mode
 *
 * @extends AbstractCacher<RedisCacherOptions>
 * @see {@link AbstractCacher} for details on the base implementation
 * @see {@link RedisCacherOptions} for configuration options
 * @example
 * ```ts
 * // Create a Redis cacher
 * const cache = new RedisCacher('user-cache', {
 *   host: 'localhost',
 *   port: 6379,
 *   password: 'secret',
 *   db: 0
 * });
 *
 * // Initialize the connection
 * await cache.init();
 *
 * // Set a value with 5 minute expiry
 * await cache.set('user:1', { name: 'John', role: 'admin' }, { expiry: 300 });
 *
 * // Get a value
 * const user = await cache.get('user:1');
 * ```
 */
export class RedisCacher extends AbstractCacher<RedisCacherOptions> {
  /**
   * The engine identifier for Redis cacher.
   */
  public override readonly Engine = 'REDIS';

  /**
   * The Redis client instance.
   * @protected
   */
  protected _client: Redis | undefined = undefined;

  /**
   * Certificate authorities for TLS connections.
   * @protected
   */
  protected _caCerts: string[] = [];

  /**
   * Creates a new Redis cacher instance.
   *
   * @param name - A unique name for this cacher instance
   * @param options - Configuration options for this cacher
   * @throws {@link CacherConfigError} if required options are missing or invalid
   */
  constructor(name: string, options: Partial<RedisCacherOptions>) {
    options = {
      ...{ engine: 'REDIS', port: 6379 },
      ...options,
    };
    super(name, options);
    // Ensure mandatory items present
    if (this.hasOption('host') === false) {
      throw new CacherConfigError('Host is required', {
        name: this.name,
        engine: this.Engine,
        configKey: 'host',
      });
    }
  }

  /**
   * Initializes the Redis connection.
   *
   * @throws {@link RedisCacherConnectError} if connection fails
   * @override
   */
  public override async init(): Promise<void> {
    if (this._client === undefined) {
      try {
        const opt: RedisConnectOptions = {
          hostname: this.getOption('host'),
          port: this.getOption('port'),
          username: this.getOption('username'),
          password: this.getOption('password'),
          db: this.getOption('db'),
          name: this.name,
          maxRetryCount: 1,
        };
        if (this._caCerts.length > 0) {
          opt.tls = true;
          opt.caCerts = this._caCerts;
        }
        this._client = await redisConnect(opt);
      } catch (e) {
        throw new RedisCacherConnectError(
          {
            name: this.name,
            host: this.getOption('host'),
            port: this.getOption('port'),
            username: this.getOption('username'),
            password: this.getOption('password'),
            db: this.getOption('db'),
          },
          e as Error,
        );
      }
    }
  }

  /**
   * Finalizes the Redis connection, releasing resources.
   *
   * @returns A promise that resolves when the connection has been closed
   * @override
   */
  public override async finalize(): Promise<void> {
    if (this._client !== undefined) {
      await this._client.quit();
      this._client = undefined;
    }
  }

  //#region Abstract method implementations
  /**
   * Retrieves a value from the Redis server.
   * Handles window mode by extending expiry if needed.
   *
   * @param key - The normalized key
   * @returns The cached value, or undefined if not found
   * @throws {@link RedisCacherOperationError} if the operation fails
   * @protected
   * @override
   */
  protected async _get(key: string): Promise<CacheValue | undefined> {
    try {
      const res = await this._client!.get(key);
      if (res === null || res === undefined) {
        return undefined;
      } else {
        const data = JSON.parse(res) as CacheValue;
        if (data.window && data.expiry) {
          await this._client!.expire(key, data.expiry); // Fixed: removed unnecessary non-null assertion
        }
        return data;
      }
    } catch (e) {
      throw new RedisCacherOperationError({
        name: this.name,
        operation: 'GET',
        key: key.split(':')[1],
      }, e as Error);
    }
  }

  /**
   * Stores a value in the Redis server.
   *
   * @param key - The normalized key
   * @param value - The value to store
   * @returns A promise that resolves when the operation is complete
   * @throws {@link RedisCacherOperationError} if the operation fails
   * @protected
   * @override
   */
  protected async _set(key: string, value: CacheValue): Promise<void> {
    try {
      await this._client!.set(key, JSON.stringify(value));
      if (value.expiry > 0) {
        await this._client!.expire(key, value.expiry);
      }
    } catch (e) {
      throw new RedisCacherOperationError({
        name: this.name,
        operation: 'SET',
        key: key.split(':')[1],
      }, e as Error);
    }
  }

  /**
   * Deletes a value from the Redis server.
   *
   * @param key - The normalized key
   * @returns A promise that resolves when the operation is complete
   * @throws {@link RedisCacherOperationError} if the operation fails
   * @protected
   * @override
   */
  protected async _delete(key: string): Promise<void> {
    try {
      await this._client!.del(key);
    } catch (e) {
      throw new RedisCacherOperationError({
        name: this.name,
        operation: 'DELETE',
        key: key.split(':')[1],
      }, e as Error);
    }
  }

  /**
   * Clears all values for this cacher's namespace from the Redis server.
   *
   * @returns A promise that resolves when the operation is complete
   * @throws {@link RedisCacherOperationError} if the operation fails
   * @protected
   * @override
   */
  protected async _clear(): Promise<void> {
    try {
      const keys = await this._client!.keys(`${this.name}:*`);
      for (const key of keys) {
        await this._client!.del(key);
      }
    } catch (e) {
      throw new RedisCacherOperationError({
        name: this.name,
        operation: 'CLEAR', // Fixed: was incorrectly 'DELETE'
      }, e as Error);
    }
  }

  /**
   * Checks if a key exists in the Redis server.
   *
   * @param key - The normalized key
   * @returns True if the key exists, false otherwise
   * @throws {@link RedisCacherOperationError} if the operation fails
   * @protected
   * @override
   */
  protected async _has(key: string): Promise<boolean> {
    try {
      const res = await this._client!.exists(key);
      return res === 1;
    } catch (e) {
      throw new RedisCacherOperationError({
        name: this.name,
        operation: 'HAS', // Fixed: was incorrectly 'DELETE'
        key: key.split(':')[1],
      }, e as Error);
    }
  }

  //#endregion Abstract method implementations

  //#region Protected methods
  /**
   * Processes and validates Redis-specific options.
   *
   * @param key - The option key
   * @param value - The option value
   * @returns The processed option value
   * @throws {@link CacherConfigError} if the option value is invalid
   * @protected
   * @override
   */
  protected override _processOption<K extends keyof RedisCacherOptions>(
    key: K,
    value: RedisCacherOptions[K],
  ): RedisCacherOptions[K] {
    switch (key) {
      case 'host':
        if (value === undefined || value === null) {
          throw new CacherConfigError('Host is required', {
            name: this.name || 'N/A', // Fallback to 'N/A' if name is undefined
            engine: this.Engine || 'REDIS', // Fallback to 'REDIS' if Engine is undefined
            configKey: key,
            configValue: value,
          });
        }
        break;
      case 'port':
        value ??= 6379 as RedisCacherOptions[K]; // Fixed: was incorrectly 6379
        if (typeof value !== 'number' || value <= 0 || value > 65535) {
          throw new CacherConfigError(
            'Redis port must be a positive number between 0 and 65535',
            {
              name: this.name || 'N/A', // Fallback to 'N/A' if name is undefined
              engine: this.Engine || 'REDIS', // Fallback to 'REDIS' if Engine is undefined',
              configKey: key,
              configValue: value,
            },
          );
        }
        break;
      case 'db':
        if (value !== undefined || value !== null) {
          if (typeof value !== 'number' || value < 0) {
            throw new CacherConfigError(
              'Redis db must be a positive number',
              {
                name: this.name || 'N/A', // Fallback to 'N/A' if name is undefined
                engine: this.Engine || 'REDIS', // Fallback to 'REDIS' if Engine is undefined',
                configKey: key,
                configValue: value,
              },
            );
          }
        }
        break;
      case 'username':
        if (value !== undefined && value !== null) {
          if (typeof value === 'string' && value.length === 0) {
            value = undefined as RedisCacherOptions[K];
          } else {
            throw new CacherConfigError('Username must be a string', {
              name: this.name || 'N/A', // Fallback to 'N/A' if name is undefined
              engine: this.Engine || 'REDIS', // Fallback to 'REDIS' if Engine is undefined',
              configKey: key,
              configValue: value,
            });
          }
        }
        break;
      case 'password':
        if (value !== undefined && value !== null) {
          if (typeof value === 'string' && value.length === 0) {
            value = undefined as RedisCacherOptions[K];
          } else {
            throw new CacherConfigError('Password must be a string', {
              name: this.name || 'N/A', // Fallback to 'N/A' if name is undefined
              engine: this.Engine || 'REDIS', // Fallback to 'REDIS' if Engine is undefined',
              configKey: key,
              configValue: value,
            });
          }
        }
        break;
      case 'certPath':
        if (value !== undefined && value !== null) {
          if (typeof value === 'string' && value.length > 0) {
            try {
              this._caCerts = [Deno.readTextFileSync(value)];
            } catch (e) {
              throw new CacherConfigError(
                'Could not load Certificates. Ensure file exists and read permission is provided',
                {
                  name: this.name || 'N/A', // Fallback to 'N/A' if name is undefined
                  engine: this.Engine || 'REDIS', // Fallback to 'REDIS' if Engine is undefined',
                  configKey: key,
                  configValue: value,
                },
                e as Error,
              );
            }
          }
        }
        break;
    }
    // deno-lint-ignore no-explicit-any
    return super._processOption(key as any, value);
  }
  //#endregion Protected methods
}
