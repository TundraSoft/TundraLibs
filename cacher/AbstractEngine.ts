import { Options } from '@tundralibs/utils';
import { CacherOptions, CacheValue, CacheValueOptions } from './types/mod.ts';

import { CacherEngineError } from './errors/mod.ts';

/**
 * Base class for all cacher engine implementations.
 *
 * This class provides the foundation for different caching engines by implementing
 * common functionality and defining the interface that all cachers must implement.
 *
 * @template O - The options type for the specific cacher implementation, extending {@link CacherOptions}
 * @see {@link CacherOptions} for common options available to all cachers
 * @example
 * ```ts
 * // Custom implementation example
 * class MyCacher extends AbstractCacher<MyOptions> {
 *   // Implementation details
 * }
 * ```
 */
export abstract class AbstractEngine<
  O extends CacherOptions = CacherOptions,
> extends Options<O> {
  public abstract readonly Engine: string;

  public readonly name: string;

  constructor(name: string, options: Partial<O>) {
    super();
    this.name = name.trim();
    // Set the options using the protected method
    super._setOptions(options, {
      defaultExpiry: 300,
    } as Partial<O>);
  }

  //#region Public methods
  /**
   * Initializes the cacher.
   * Should be called before any cache operations.
   *
   * Subclasses should override this method to perform engine-specific initialization.
   *
   * @returns A promise that resolves when initialization is complete, or void
   */
  public init(): void | Promise<void> {
    // No-op
  }

  /**
   * Finalizes the cacher, releasing any resources.
   * Should be called when the cacher is no longer needed.
   *
   * Subclasses should override this method to perform engine-specific cleanup.
   *
   * @returns A promise that resolves when finalization is complete, or void
   */
  public finalize(): void | Promise<void> {
    // No-op
  }

  /**
   * Sets a value in the cache.
   *
   * @template T - The type of the value being cached
   * @param key - The key under which to store the value
   * @param value - The value to store
   * @param opt - Optional configuration for this specific cache entry
   * @param [opt.expiry] - Custom expiry time in seconds (defaults to the cacher's defaultExpiry)
   * @param [opt.window] - Whether to use window mode, which extends expiry on each access
   * @returns A promise that resolves when the value has been cached
   * @throws {@link CacherEngineError} if the expiry value is invalid
   * @example
   * ```ts
   * // Set a value with default options
   * await cacher.set('user:1', user);
   *
   * // Set a value with custom expiry (5 minutes)
   * await cacher.set('session:123', session, { expiry: 300 });
   *
   * // Set a value with window mode (extends expiry on each access)
   * await cacher.set('user:activity:1', activity, { window: true });
   * ```
   */
  public async set<T>(
    key: string,
    value: T,
    opt: CacheValueOptions = {},
  ): Promise<void> {
    await this.init();
    const expiry = opt.expiry ?? this.getOption('defaultExpiry')!;
    const cacheValue: CacheValue = {
      data: JSON.stringify(value),
      expiry: expiry,
      window: opt.window ?? false,
    };
    if (this._validateExpiry(expiry) === false) {
      throw new CacherEngineError('OPERATION_INVALID_PARAMS', {
        name: this.name,
        engine: this.Engine,
        operation: 'SET',
        key: key,
        reason: 'expiry must be a positive number greater than or equal to 0',
      });
    }
    await this._set(this._normalizeKey(key), cacheValue);
  }

  /**
   * Retrieves a value from the cache.
   *
   * @template T - The expected type of the cached value
   * @param key - The key of the value to retrieve
   * @returns A promise that resolves to the cached value, or undefined if not found or expired
   * @example
   * ```ts
   * // Get a string value
   * const username = await cacher.get<string>('user:1:username');
   *
   * // Get a complex object
   * const user = await cacher.get<User>('user:1');
   * if (user) {
   *   // Use the user object
   * }
   * ```
   */
  public async get<T>(key: string): Promise<T | undefined> {
    await this.init();
    const res = await this._get(this._normalizeKey(key));
    if (res === undefined) {
      return undefined;
    } else {
      return JSON.parse(res.data) as T;
    }
  }

  /**
   * Checks if a key exists in the cache.
   *
   * @param key - The key to check
   * @returns A promise that resolves to true if the key exists, false otherwise
   * @example
   * ```ts
   * if (await cacher.has('user:1')) {
   *   // Key exists in cache
   * }
   * ```
   */
  public async has(key: string): Promise<boolean> {
    await this.init();
    return this._has(this._normalizeKey(key));
  }

  /**
   * Deletes a value from the cache.
   *
   * @param key - The key to delete
   * @returns A promise that resolves when the key has been deleted
   * @example
   * ```ts
   * // Remove user from cache
   * await cacher.delete('user:1');
   * ```
   */
  public async delete(key: string): Promise<void> {
    await this.init();
    return this._delete(this._normalizeKey(key));
  }

  /**
   * Clears all values from this cacher's namespace.
   *
   * @returns A promise that resolves when the cache has been cleared
   * @example
   * ```ts
   * // Clear all cache entries for this cacher
   * await userCacher.clear();
   * ```
   */
  public async clear(): Promise<void> {
    await this.init();
    return this._clear();
  }
  //#endregion Public methods

  //#region Protected methods
  /**
   * Normalizes a key by adding the cacher's namespace prefix.
   *
   * @param key - The key to normalize
   * @returns The normalized key
   * @protected
   */
  protected _normalizeKey(key: string): string {
    return `${this.name}:${key.trim().toLowerCase()}`;
  }

  /**
   * Processes and validates options before they are set.
   *
   * @param key - The option key
   * @param value - The option value
   * @returns The processed option value
   * @throws {@link CacherEngineError} if the option value is invalid
   * @protected
   * @override
   */
  protected override _processOption<K extends keyof CacherOptions>(
    key: K,
    value: O[K],
  ): O[K] {
    if (key === 'defaultExpiry') {
      value ??= 300 as O[K];
      if (this._validateExpiry(value) === false) {
        throw new CacherEngineError('CONFIG_INVALID', {
          name: this.name,
          engine: this.Engine,
          configKey: 'defaultExpiry',
          reason: 'must be a positive number greater than or equal to 0',
        });
      }
    }
    return super._processOption(key, value) as O[K];
  }

  protected _validateExpiry(expiry: unknown): expiry is number {
    if (
      typeof expiry !== 'number' || isNaN(expiry) || expiry < 0
    ) {
      return false;
    }
    return true;
  }
  //#endregion Protected methods

  //#region Abstract methods
  /**
   * Implementation-specific method to store a value in the cache.
   * Must be implemented by subclasses.
   *
   * @param key - The normalized key
   * @param value - The value to store
   * @returns A promise that resolves when the operation is complete, or void
   * @protected
   */
  protected abstract _set(
    key: string,
    value: CacheValue,
  ): void | Promise<void>;

  /**
   * Implementation-specific method to retrieve a value from the cache.
   * Must be implemented by subclasses.
   *
   * @param key - The normalized key
   * @returns The cached value, or undefined if not found
   * @protected
   */
  protected abstract _get(
    key: string,
  ): Promise<CacheValue | undefined> | (CacheValue | undefined);

  /**
   * Implementation-specific method to check if a key exists in the cache.
   * Must be implemented by subclasses.
   *
   * @param key - The normalized key
   * @returns True if the key exists, false otherwise
   * @protected
   */
  protected abstract _has(key: string): boolean | Promise<boolean>;

  /**
   * Implementation-specific method to delete a value from the cache.
   * Must be implemented by subclasses.
   *
   * @param key - The normalized key
   * @returns A promise that resolves when the operation is complete, or void
   * @protected
   */
  protected abstract _delete(key: string): void | Promise<void>;

  /**
   * Implementation-specific method to clear all values from this cacher's namespace.
   * Must be implemented by subclasses.
   *
   * @returns A promise that resolves when the operation is complete, or void
   * @protected
   */
  protected abstract _clear(): void | Promise<void>;
  //#endregion Abstract methods
}
