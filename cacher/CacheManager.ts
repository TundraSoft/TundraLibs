// deno-lint-ignore-file no-explicit-any
import { Singleton } from '@tundralibs/utils';
import { AbstractCacher } from './AbstractCacher.ts';
import type { CacherOptions } from './types/mod.ts';
import { MemCacher, MemoryCacher, RedisCacher } from './engines/mod.ts';

type CacherConstructor = new (
  name: string,
  options: Partial<CacherOptions>,
) => AbstractCacher<any>;

/**
 * Central manager for cache instances in the application.
 *
 * The Manager provides a registry of caching engines and maintains a collection of
 * initialized cache instances. It supports the following built-in engines:
 * - Memory caching (in-process, non-persistent)
 * - Memcached integration
 * - Redis integration
 *
 * @see {@link AbstractCacher} The base class for all cacher implementations
 * @see {@link MemoryCacher} In-memory caching implementation
 * @see {@link MemCacher} Memcached-based caching implementation
 * @see {@link RedisCacher} Redis-based caching implementation
 * @example
 * ```ts
 * // Create a Redis cache instance
 * const userCache = await CacherManager.create('REDIS', 'users', {
 *   host: 'localhost',
 *   port: 6379,
 *   defaultExpiry: 300 // 5 minutes
 * });
 *
 * // Use the cache
 * await userCache.set('user:123', userData);
 * ```
 */
@Singleton
class Manager {
  /**
   * Registry of available cache engine constructors
   * @private
   */
  protected _cacheEngines: Map<string, CacherConstructor> = new Map();

  /**
   * Map of initialized cache instances
   * @private
   */
  protected _instances: Map<string, AbstractCacher<any>> = new Map();

  /**
   * Creates a new cache manager and registers the default engines.
   */
  constructor() {
    // Register default caching engines
    this.registerDefaultEngines();
  }

  /**
   * Registers the built-in caching engines.
   *
   * @private
   */
  private registerDefaultEngines(): void {
    this.addCacheEngine('MEMORY', MemoryCacher);
    this.addCacheEngine('MEMCACHE', MemCacher);
    this.addCacheEngine('REDIS', RedisCacher);
  }

  /**
   * Adds a custom caching engine to the registry.
   *
   * @param name - Unique identifier for the engine (will be converted to uppercase)
   * @param handlerConstructor - Constructor for the cache engine
   * @throws Error if the name is invalid or if an engine with that name is already registered
   * @see {@link AbstractCacher} Required base class for all cacher implementations
   * @example
   * ```ts
   * class MyCustomCacher extends AbstractCacher<MyOptions> {
   *   // Implementation details
   * }
   *
   * CacherManager.addCacheEngine('CUSTOM', MyCustomCacher);
   * ```
   */
  public addCacheEngine<T extends CacherOptions>(
    name: string,
    handlerConstructor: new (
      name: string,
      options: Partial<T>,
    ) => AbstractCacher<T>,
  ): void {
    // Validate name
    if (!name || typeof name !== 'string' || name.trim() === '') {
      throw new Error('Cache engine name must be a non-empty string');
    }
    name = name.trim().toUpperCase();
    // Check for duplicates
    if (this._cacheEngines.has(name)) {
      throw new Error(`Cache Engine '${name}' is already registered`);
    }
    // Validate constructor
    if (typeof handlerConstructor !== 'function') {
      throw new Error(
        'Cache engine constructor must be a valid class constructor',
      );
    }
    // Register the handler
    this._cacheEngines.set(
      name,
      handlerConstructor as new (
        name: string,
        options: Partial<CacherOptions>,
      ) => AbstractCacher<any>,
    );
  }

  /**
   * Creates a new cache instance with the specified engine type.
   *
   * If a cache with the given name already exists, returns the existing instance.
   *
   * @param type - The type of caching engine to use (e.g., 'REDIS', 'MEMORY')
   * @param name - A unique name for this cache instance
   * @param options - Configuration options for the cache
   * @returns The initialized cache instance
   * @throws Error if the specified engine type is not found
   * @see {@link MemoryCacherOptions} Options for memory cacher
   * @see {@link MemCacherOptions} Options for Memcached cacher
   * @see {@link RedisCacherOptions} Options for Redis cacher
   * @example
   * ```ts
   * // Create a Redis cache
   * const sessionCache = await CacherManager.create('REDIS', 'sessions', {
   *   host: 'localhost',
   *   port: 6379,
   *   defaultExpiry: 3600 // 1 hour
   * });
   * ```
   */
  public async create<T extends CacherOptions & Record<string, unknown>>(
    type: string,
    name: string,
    options: Partial<T>,
  ): Promise<AbstractCacher<T>> {
    name = name.trim().toLowerCase();
    if (this._instances.has(name)) {
      return this._instances.get(name)!;
    }
    const handlerConstructor = this._cacheEngines.get(type);
    if (!handlerConstructor) {
      throw new Error(`Cache engine '${type}' not found`);
    }
    const handler = new handlerConstructor(name, options);
    this._instances.set(name, handler);
    await handler.init();
    return handler;
  }

  /**
   * Destroys a cache instance and releases its resources.
   *
   * @param name - The name of the cache instance to destroy
   * @returns A promise that resolves when the instance is destroyed
   * @see {@link AbstractCacher.finalize} Method called to clean up resources
   * @example
   * ```ts
   * // Cleanup when done
   * await CacherManager.destroy('sessions');
   * ```
   */
  public async destroy(name: string): Promise<void> {
    name = name.trim().toLowerCase();
    if (!this._instances.has(name)) {
      return;
    }
    const instance = this._instances.get(name)!;
    await instance.finalize();
    this._instances.delete(name);
  }

  /**
   * Destroys all managed cache instances.
   *
   * @returns A promise that resolves when all instances are destroyed
   * @see {@link destroy} Method used to destroy individual instances
   * @example
   * ```ts
   * // Application shutdown
   * await CacherManager.destroyAll();
   * ```
   */
  public async destroyAll(): Promise<void> {
    for (const name of this._instances.keys()) {
      await this.destroy(name);
    }
    this._instances.clear();
  }

  /**
   * Retrieves a cache instance by name.
   *
   * @param name - The name of the cache instance
   * @returns The cache instance, or undefined if not found
   * @example
   * ```ts
   * const userCache = CacherManager.get('users');
   * if (userCache) {
   *   const user = await userCache.get('user:123');
   * }
   * ```
   */
  public get<T extends CacherOptions = CacherOptions>(
    name: string,
  ): AbstractCacher<T> | undefined {
    name = name.trim().toLowerCase();
    return this._instances.get(name) as AbstractCacher<T> | undefined;
  }

  /**
   * Checks if a cache instance with the given name exists.
   *
   * @param name - The name of the cache instance to check
   * @returns True if the instance exists, false otherwise
   * @example
   * ```ts
   * if (CacherManager.has('users')) {
   *   // The users cache exists
   * }
   * ```
   */
  public has(name: string): boolean {
    name = name.trim().toLowerCase();
    return this._instances.has(name);
  }
}

/**
 * Singleton instance of the cache manager.
 *
 * @example
 * ```ts
 * // Create a memory cache
 * const cache = await CacherManager.create('MEMORY', 'app-cache', {
 *   defaultExpiry: 300
 * });
 * ```
 */
export const CacherManager: Manager = new Manager();
