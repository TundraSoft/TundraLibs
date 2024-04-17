import { AbstractCache } from './AbstractCache.ts';
import { MemoryCacher, RedisCacher } from './clients/mod.ts';
import type { AbstractCacherOptions, RedisCacherOptions } from './types/mod.ts';

import { CacherConfigError, DuplicateCacher } from './errors/mod.ts';
/**
 * The Cacher class is used to manage multiple cache instances.
 */
export class Cacher {
  private static __instances: Map<string, AbstractCache> = new Map();

  /**
   * Registers a cache instance. Do not call this, it is called by AbstractCacher on instantiation.
   * If you need to initialize an instance, use create instead
   *
   * @param name - The name of the cache.
   * @param instance - The cache instance.
   */
  static register(name: string, instance: AbstractCache) {
    name = name.trim().toLowerCase();
    Cacher.__instances.set(name, instance);
  }

  /**
   * Retrieves a cache instance.
   *
   * @param name - The name of the cache.
   * @returns The cache instance if it exists, undefined otherwise.
   */
  static get(name: string): AbstractCache | undefined {
    name = name.trim().toLowerCase();
    return Cacher.__instances.get(name);
  }

  /**
   * Checks if a cache instance exists.
   *
   * @param name - The name of the cache.
   * @returns True if the cache exists, false otherwise.
   */
  static has(name: string): boolean {
    name = name.trim().toLowerCase();
    return Cacher.__instances.has(name);
  }

  /**
   * Creates a new cache instance.
   *
   * @param name - The name of the cache.
   * @param options - The cache settings.
   * @returns The created cache instance.
   */
  static create(name: string, options: AbstractCacherOptions): AbstractCache {
    name = name.trim().toLowerCase();
    if (Cacher.has(name)) {
      throw new DuplicateCacher(name);
    }

    let instance: AbstractCache;
    switch (options.engine) {
      case 'MEMORY':
        instance = new MemoryCacher(
          name,
          options,
        ) as AbstractCache;
        break;
      case 'REDIS':
        instance = new RedisCacher(
          name,
          options as RedisCacherOptions,
        ) as unknown as AbstractCache;
        break;
      default:
        throw new CacherConfigError(
          `Unsupported cache engine '${options.engine}'.`,
        );
    }
    return instance;
  }
}
