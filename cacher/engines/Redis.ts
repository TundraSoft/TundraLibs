import { type Redis, RedisConnect } from '../../dependencies.ts';

import type { OptionKeys } from '../../options/mod.ts';
import type { CacheValue, RedisOptions } from '../types/mod.ts';
import { AbstractCache } from '../AbstractCache.ts';

import { CacherConfigError, CacherInitError } from '../errors/mod.ts';

export class RedisCache extends AbstractCache<RedisOptions> {
  private _client: Redis | undefined = undefined;

  /**
   * Constructs a new instance of the MemoryCacher class.
   *
   * @param name - The name of the cache. This is used to namespace the cache.
   * @param options - The options to initialize the cache with.
   */
  constructor(name: string, options: OptionKeys<RedisOptions>) {
    if (options.engine !== 'REDIS') {
      throw new CacherConfigError({
        engine: 'REDIS',
        key: 'engine',
        config: name,
        value: options.engine,
      });
    }
    super(name, options);
  }

  /**
   * Checks if a key exists in the cache.
   *
   * @param key - The key to check.
   * @returns A Promise that resolves to true if the key exists, or false otherwise.
   */
  protected async _has(key: string): Promise<boolean> {
    await this._init();
    const exists = await this._client?.exists(key);
    return exists === 1;
  }

  /**
   * Sets a value in the cache.
   *
   * @param key - The key to set.
   * @param value - The value to set.
   * @returns A Promise that resolves when the value is set in the cache.
   */
  protected async _set(key: string, value: CacheValue): Promise<void> {
    await this._init();
    const expiry = value.expiry;
    if (expiry > 0) {
      await this._client?.set(key, JSON.stringify(value), { ex: expiry });
    } else {
      await this._client?.set(key, JSON.stringify(value));
    }
  }

  /**
   * Retrieves a value from the cache.
   *
   * @typeparam T - The type of the value to retrieve.
   * @param key - The key to retrieve the value for.
   * @returns A Promise that resolves to the retrieved value, or undefined if the key does not exist in the cache.
   */
  protected async _get<T = unknown>(
    key: string,
  ): Promise<CacheValue<T> | undefined> {
    await this._init();
    const value = await this._client?.get(key);
    if (!value) {
      return undefined;
    }
    const fv = JSON.parse(value) as CacheValue<T>;
    if (fv.window) {
      this._client?.expire(key, fv.expiry);
    }
    return fv;
  }

  /**
   * Deletes a value from the cache.
   *
   * @param key - The key to delete.
   * @returns A Promise that resolves when the value is deleted from the cache.
   */
  protected async _delete(key: string): Promise<void> {
    await this._init();
    await this._client?.del(key);
  }

  /**
   * Clears the cache by deleting all keys.
   *
   * @returns A Promise that resolves when all keys are deleted from the cache.
   */
  protected async _clear(): Promise<void> {
    await this._init();
    // Get all keys belonging to this cache
    const keys = await this._client?.keys(`${this.name}:*`);
    if (keys && keys.length > 0) {
      await this._client?.del(...keys);
    }
  }

  /**
   * Initializes the Redis client if it is not already initialized.
   *
   * @returns A Promise that resolves when the Redis client is initialized.
   */
  protected async _init(): Promise<void> {
    if (this._client) {
      return;
    }
    try {
      this._client = await RedisConnect({
        hostname: this._getOption('host'),
        port: this._getOption('port'),
        password: this._getOption('password'),
        db: this._getOption('db'),
        tls: this._getOption('tls'),
        maxRetryCount: 1,
      });
      this._status = 'READY';
    } catch (error) {
      throw new CacherInitError({ engine: 'REDIS', config: this.name }, error);
    }
  }

  /**
   * Helper function to close active redis connection
   */
  public async close(): Promise<void> {
    if (this._client) {
      await this._client?.close();
      this._client = undefined;
      this._status = 'INIT';
    }
  }
}
