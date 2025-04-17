import { Memcached } from '$memcached';
import { AbstractCacher } from '../../AbstractCacher.ts';
import type { CacheValue } from '../../types/mod.ts';
import {
  MemCacherConnectError,
  MemCacherOperationError,
} from './errors/mod.ts';
import { CacherConfigError } from '../../errors/mod.ts';
import type { MemCacherOptions } from './types/mod.ts';

/**
 * Memcached-based cacher implementation.
 *
 * Uses a Memcached server for distributed caching. This implementation provides:
 * - Connection management to Memcached servers
 * - Automatic serialization/deserialization of values
 * - Support for expiry times and window mode
 *
 * @extends AbstractCacher<MemCacherOptions>
 * @see {@link AbstractCacher} for details on the base implementation
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
export class MemCacher extends AbstractCacher<MemCacherOptions> {
  /**
   * The engine identifier for Memcached cacher.
   */
  public override readonly Engine = 'MEMCACHED';

  /**
   * The Memcached client instance.
   * @protected
   */
  protected _client: Memcached | undefined = undefined;

  /**
   * Certificate authorities for TLS connections, if used.
   * @protected
   */
  protected _caCerts: string[] = [];

  /**
   * Creates a new Memcached cacher instance.
   *
   * @param name - A unique name for this cacher instance
   * @param options - Configuration options for this cacher
   * @throws {@link CacherConfigError} if required options are missing or invalid
   */
  constructor(name: string, options: Partial<MemCacherOptions>) {
    options = {
      ...{ engine: 'MEMCACHED', port: 11211 },
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
   * Initializes the Memcached connection.
   * Performs a test operation to verify connectivity.
   *
   * @throws {@link MemCacherConnectError} if connection fails
   * @override
   */
  public override async init(): Promise<void> {
    if (this._client === undefined) {
      try {
        this._client = new Memcached({
          host: this.getOption('host'),
          port: this.getOption('port'),
          poolSize: 1,
        });
        await this._client.set('__test__', 'test');
      } catch (e) {
        throw new MemCacherConnectError(
          {
            name: this.name,
            host: this.getOption('host'),
            port: this.getOption('port'),
          },
          e as Error,
        );
      }
    }
  }

  /**
   * Finalizes the Memcached connection, releasing resources.
   *
   * @returns A promise that resolves when the connection has been closed
   * @override
   */
  public override async finalize(): Promise<void> {
    if (this._client !== undefined) {
      await this._client.closeAll();
      this._client = undefined;
    }
  }

  //#region Abstract method implementations
  /**
   * Retrieves a value from the Memcached server.
   * Handles window mode by extending expiry if needed.
   *
   * @param key - The normalized key
   * @returns The cached value, or undefined if not found
   * @throws {@link MemCacherConnectError} if not connected
   * @throws {@link MemCacherOperationError} if the operation fails
   * @protected
   * @override
   */
  protected async _get(key: string): Promise<CacheValue | undefined> {
    if (!this._client) {
      throw new MemCacherConnectError(
        {
          name: this.name,
          host: this.getOption('host'),
          port: this.getOption('port'),
        },
      );
    }
    try {
      const res = await this._client!.get(key);
      // console.log(res);
      if (res === null || res === undefined) {
        return undefined;
      } else {
        const data = JSON.parse(res) as CacheValue;
        if (data.window && data.expiry) {
          await this._client.set(key, JSON.stringify(data), data.expiry);
        }
        return data;
      }
    } catch (e) {
      throw new MemCacherOperationError({
        name: this.name,
        operation: 'GET',
        key: key.split(':')[1],
      }, e as Error);
    }
  }

  /**
   * Stores a value in the Memcached server.
   *
   * @param key - The normalized key
   * @param value - The value to store
   * @returns A promise that resolves when the operation is complete
   * @throws {@link MemCacherConnectError} if not connected
   * @throws {@link MemCacherOperationError} if the operation fails
   * @protected
   * @override
   */
  protected async _set(key: string, value: CacheValue): Promise<void> {
    if (!this._client) {
      throw new MemCacherConnectError(
        {
          name: this.name,
          host: this.getOption('host'),
          port: this.getOption('port'),
        },
      );
    }
    try {
      if (value.expiry > 0) {
        await this._client.set(key, JSON.stringify(value), value.expiry, 500);
      } else {
        await this._client.set(key, JSON.stringify(value));
      }
      // Delay by 100ms to ensure the data is set
      // await new Promise((resolve) => setTimeout(resolve, 1));
    } catch (e) {
      throw new MemCacherOperationError({
        name: this.name,
        operation: 'SET',
        key: key.split(':')[1],
      }, e as Error);
    }
  }

  /**
   * Deletes a value from the Memcached server.
   *
   * @param key - The normalized key
   * @returns A promise that resolves when the operation is complete
   * @throws {@link MemCacherConnectError} if not connected
   * @throws {@link MemCacherOperationError} if the operation fails
   * @protected
   * @override
   */
  protected async _delete(key: string): Promise<void> {
    if (!this._client) {
      throw new MemCacherConnectError(
        {
          name: this.name,
          host: this.getOption('host'),
          port: this.getOption('port'),
        },
      );
    }
    try {
      await this._client.delete(key);
    } catch (e) {
      throw new MemCacherOperationError({
        name: this.name,
        operation: 'DELETE',
        key: key.split(':')[1],
      }, e as Error);
    }
  }

  /**
   * Clears all values from the Memcached server.
   *
   * @returns A promise that resolves when the operation is complete
   * @throws {@link MemCacherConnectError} if not connected
   * @throws {@link MemCacherOperationError} if the operation fails
   * @protected
   * @override
   */
  protected async _clear(): Promise<void> {
    if (!this._client) {
      throw new MemCacherConnectError(
        {
          name: this.name,
          host: this.getOption('host'),
          port: this.getOption('port'),
        },
      );
    }
    try {
      await this._client.flush();
    } catch (e) {
      throw new MemCacherOperationError({
        name: this.name,
        operation: 'CLEAR', // Fixed: was incorrectly 'DELETE'
      }, e as Error);
    }
  }

  /**
   * Checks if a key exists in the Memcached server.
   *
   * @param key - The normalized key
   * @returns True if the key exists, false otherwise
   * @throws {@link MemCacherConnectError} if not connected
   * @throws {@link MemCacherOperationError} if the operation fails
   * @protected
   * @override
   */
  protected async _has(key: string): Promise<boolean> {
    if (!this._client) {
      throw new MemCacherConnectError(
        {
          name: this.name,
          host: this.getOption('host'),
          port: this.getOption('port'),
        },
      );
    }
    try {
      const res = await this._client.get(key);
      if (res === null || res === undefined) {
        return false;
      }
      return true;
    } catch (e) {
      throw new MemCacherOperationError({
        name: this.name,
        operation: 'HAS', // Fixed: was incorrectly 'DELETE'
        key: key.split(':')[1],
      }, e as Error);
    }
  }

  //#endregion Abstract method implementations

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
        if (value === undefined || value === null) {
          throw new CacherConfigError('Host is required', {
            name: this.name || 'N/A', // Fallback when this.name isn't set yet
            engine: this.Engine || 'MEMCACHED', // Fallback when this.Engine isn't set yet
            configKey: key,
            configValue: value,
          });
        }
        break;
      case 'port':
        if (value === undefined || value === null) {
          value = 11211 as MemCacherOptions[K]; // Fixed: was incorrectly 6379
        }
        if (typeof value !== 'number' || value <= 0 || value > 65535) {
          throw new CacherConfigError(
            'Memcached port must be a positive number between 0 and 65535', // Fixed: was incorrectly 'Redis port'
            {
              name: this.name || 'N/A',
              engine: this.Engine || 'MEMCACHED',
              configKey: key,
              configValue: value,
            },
          );
        }
        break;
    }
    // deno-lint-ignore no-explicit-any
    return super._processOption(key as any, value);
  }
  //#endregion Protected methods
}
