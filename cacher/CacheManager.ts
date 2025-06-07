// deno-lint-ignore-file no-explicit-any
import { Singleton } from '@tundralibs/utils';
import { AbstractCacher } from './AbstractCacher.ts';
import type { CacherOptions } from './types/mod.ts';
import { MemCacher, MemoryCacher, RedisCacher } from './engines/mod.ts';

@Singleton
class Manager {
  protected _cacheEngines: Map<
    string,
    new (
      name: string,
      options: Partial<CacherOptions>,
    ) => AbstractCacher<any>
  > = new Map();
  protected _instances: Map<string, AbstractCacher<any>> = new Map();
  constructor() {
    // Register default caching engines
    this.registerDefaultEngines();
  }

  private registerDefaultEngines(): void {
    this.addCacheEngine('MEMORY', MemoryCacher);
    this.addCacheEngine('MEMCACHE', MemCacher);
    this.addCacheEngine('REDIS', RedisCacher);
  }

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

  public async create(
    type: string,
    name: string,
    options: CacherOptions & Record<string, unknown>,
  ): Promise<AbstractCacher> {
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

  public async destroy(name: string): Promise<void> {
    name = name.trim().toLowerCase();
    if (!this._instances.has(name)) {
      return;
    }
    const instance = this._instances.get(name)!;
    await instance.finalize();
    this._instances.delete(name);
  }

  public async destroyAll(): Promise<void> {
    for (const name of this._instances.keys()) {
      await this.destroy(name);
    }
    this._instances.clear();
  }

  public get(name: string): AbstractCacher | undefined {
    name = name.trim().toLowerCase();
    return this._instances.get(name);
  }

  public has(name: string): boolean {
    name = name.trim().toLowerCase();
    return this._instances.has(name);
  }
}

export const CacherManager = new Manager();
