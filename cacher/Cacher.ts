// Instance manager
import { Singleton } from '@tundralibs/utils';
import { AbstractCacher } from './AbstractCacher.ts';
import { CacherOptions } from './types/mod.ts';
import { CacherConfigError } from './errors/mod.ts';

import {
  MemCacher,
  type MemCacherOptions,
  MemoryCacher,
  type MemoryCacherOptions,
  RedisCacher,
  type RedisCacherOptions,
} from './engines/mod.ts';

/**
 * Type guard for Memory Cacher options
 */
function isMemoryCacherOptions(
  options: CacherOptions,
): options is MemoryCacherOptions {
  return options.engine === 'MEMORY';
}

/**
 * Type guard for Memcached Cacher options
 */
function isMemCacherOptions(
  options: CacherOptions,
): options is MemCacherOptions {
  return options.engine === 'MEMCACHED' && 'host' in options;
}

/**
 * Type guard for Redis Cacher options
 */
function isRedisCacherOptions(
  options: CacherOptions,
): options is RedisCacherOptions {
  return options.engine === 'REDIS' && 'host' in options;
}

@Singleton
class InstanceManager {
  // deno-lint-ignore no-explicit-any
  protected _instances: Map<string, AbstractCacher<any>> = new Map();

  async create<T extends CacherOptions>(
    name: string,
    options: T,
  ): Promise<AbstractCacher<T>> {
    // Check if it is already present, if so return else create and return
    name = name.trim();
    if (!this._instances.has(name)) {
      switch (options.engine) {
        case 'MEMORY':
          if (isMemoryCacherOptions(options)) {
            this._instances.set(
              name,
              new MemoryCacher(name, options),
            );
          } else {
            throw new CacherConfigError('Invalid options for Memory cacher', {
              name,
              engine: 'MEMORY',
              configKey: 'engine',
              configValue: options,
            });
          }
          break;
        case 'MEMCACHED':
          if (isMemCacherOptions(options)) {
            this._instances.set(
              name,
              new MemCacher(name, options),
            );
          } else {
            throw new CacherConfigError(
              'Invalid options for Memcached cacher. Missing required property: host',
              {
                name,
                engine: 'MEMCACHED',
                configKey: 'host',
                configValue: options,
              },
            );
          }
          break;
        case 'REDIS':
          if (isRedisCacherOptions(options)) {
            this._instances.set(
              name,
              new RedisCacher(name, options),
            );
          } else {
            throw new CacherConfigError(
              'Invalid options for Redis cacher. Missing required property: host',
              {
                name,
                engine: 'REDIS',
                configKey: 'host',
                configValue: options,
              },
            );
          }
          break;
        default:
          throw new Error(`Unsupported engine: ${options.engine}`);
      }
      await this._instances.get(name)?.init();
    }

    return this._instances.get(name) as AbstractCacher<T>;
  }

  get<T extends CacherOptions>(
    name: string,
  ): AbstractCacher<T> | undefined {
    // Check if instance exists and return it
    name = name.trim();
    return this._instances.get(name) as AbstractCacher<T> | undefined;
  }

  /**
   * Checks if a cacher instance with the given name exists.
   *
   * @param name - The name of the cacher instance to check
   * @returns True if the instance exists, false otherwise
   */
  has(name: string): boolean {
    return this._instances.has(name.trim());
  }

  /**
   * Destroys a specific cacher instance, finalizing it and removing it from the manager.
   *
   * @param name - The name of the cacher instance to destroy
   * @returns A promise that resolves when the instance is destroyed, or undefined if not found
   */
  async destroy(name: string): Promise<void | undefined> {
    name = name.trim();
    const instance = this._instances.get(name);
    if (instance) {
      await instance.finalize();
      this._instances.delete(name);
      return;
    }
    return undefined;
  }

  /**
   * Destroys all cacher instances, finalizing them and removing them from the manager.
   *
   * @returns A promise that resolves when all instances are destroyed
   */
  async destroyAll(): Promise<void> {
    // Finalize all instances first
    const finalizePromises = Array.from(this._instances.values()).map(
      (instance) => instance.finalize(),
    );
    await Promise.all(finalizePromises);

    // Clear the instances map
    this._instances.clear();
  }
}

export const Cacher = new InstanceManager();
