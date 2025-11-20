import { Singleton } from "@tundralibs/utils";
import type { CacherOptions } from "./types/mod.ts";
import { AbstractEngine } from "./AbstractEngine.ts";
import { MemCacher, MemoryCacher, RedisCacher } from "./engines/mod.ts";
import { CacherError } from "./errors/mod.ts";

/**
 * Type definition for engine constructor.
 * Used for type-safe engine registration with flexible options.
 */
type EngineConstructor = new (
  name: string,
  options: unknown,
) => AbstractEngine;

/**
 * Cache Manager class that handles engine registration and instance creation.
 *
 * This singleton class provides a centralized way to:
 * - Register cache engines (Memory, Redis, Memcached, etc.)
 * - Create and manage cache instances
 * - Ensure proper lifecycle management of cache instances
 *
 * The Manager class uses {@link CacherError} for its own operation errors,
 * while individual cache engines use {@link CacherEngineError} for their errors.
 *
 * @example
 * ```typescript
 * // Basic usage
 * const cache = Cacher.create('MEMORY', 'my-cache', {
 *   defaultExpiry: 300
 * });
 *
 * // Custom engine registration
 * Cacher.addEngine('CUSTOM', MyCustomEngine);
 * const customCache = Cacher.create('CUSTOM', 'custom-cache', options);
 * ```
 *
 * @see {@link AbstractEngine} Base class for cache engines
 * @see {@link CacherOptions} Configuration options for cache engines
 * @see {@link CacherError} Error class for Manager operations
 * @see {@link CacherEngineError} Error class for Engine operations
 */
@Singleton
class Manager {
  /**
   * Map of registered engine constructors keyed by engine name.
   * @private
   */
  protected _engines: Map<string, EngineConstructor> = new Map();

  /**
   * Map of created cache instances keyed by instance name.
   * @private
   */
  protected _instances: Map<string, AbstractEngine> = new Map();

  /**
   * Map tracking which engine type each instance uses.
   * @private
   */
  protected _instanceEngines: Map<string, string> = new Map();

  constructor() {
    // Register built-in cache engines
    this.__registeredDefaultEngines();
  }

  /**
   * Add a new cache engine to the registry.
   *
   * @param name - Unique identifier for the engine (e.g., 'REDIS', 'MEMORY')
   * @param engine - Constructor function for the engine
   * @throws {CacherError} When an engine with the same name is already registered
   *
   * @example
   * ```typescript
   * // Register a custom engine
   * Cacher.addEngine('CUSTOM', MyCustomEngine);
   * ```
   */
  addEngine(
    name: string,
    engine: EngineConstructor,
  ): void {
    // Validate input parameters
    if (!name || typeof name !== "string") {
      throw new CacherError(
        "Engine name must be a non-empty string",
        {
          operation: "addEngine",
          providedName: name,
          context: "Manager",
        },
      );
    }

    if (!engine || typeof engine !== "function") {
      throw new CacherError(
        "Engine must be a constructor function",
        {
          operation: "addEngine",
          engineName: name,
          providedEngine: typeof engine,
          context: "Manager",
        },
      );
    }

    const engineName = name.trim().toUpperCase();

    if (this._engines.has(engineName)) {
      throw new CacherError(
        `Engine "${engineName}" is already registered`,
        {
          operation: "addEngine",
          engineName: engineName,
          registeredEngines: Array.from(this._engines.keys()),
          context: "Manager",
        },
      );
    }

    this._engines.set(engineName, engine);
  }

  /**
   * Create or retrieve a cache instance.
   *
   * @param engine - The engine type to use (e.g., 'MEMORY', 'REDIS', 'MEMCACHED')
   * @param name - Unique name for the cache instance
   * @param options - Configuration options for the cache engine
   * @returns Cache instance
   * @throws {CacherError} When engine is not registered or parameters are invalid
   *
   * @example
   * ```typescript
   * // Create a memory cache
   * const memCache = Cacher.create('MEMORY', 'session-cache', {
   *   defaultExpiry: 300
   * });
   *
   * // Create a Redis cache
   * const redisCache = Cacher.create('REDIS', 'user-cache', {
   *   host: 'localhost',
   *   port: 6379,
   *   defaultExpiry: 600
   * });
   * ```
   */
  create<
    T extends CacherOptions & Record<string, unknown> =
      & CacherOptions
      & Record<string, unknown>,
  >(engine: string, name: string, options: T): AbstractEngine {
    this._validateCreateParameters(engine, name, options);

    const engineType = engine.trim().toUpperCase();
    const instanceName = name.trim();

    this._validateEngineExists(engineType);
    this._handleInstanceCreation(engineType, instanceName, options);

    return this._instances.get(instanceName) as AbstractEngine;
  }

  /**
   * Validate parameters for create method.
   * @private
   */
  private _validateCreateParameters(
    engine: unknown,
    name: unknown,
    options: unknown,
  ): void {
    if (!engine || typeof engine !== "string") {
      throw new CacherError(
        "Engine type must be a non-empty string",
        {
          operation: "create",
          providedEngine: engine,
          context: "Manager",
        },
      );
    }

    if (!name || typeof name !== "string") {
      throw new CacherError(
        "Instance name must be a non-empty string",
        {
          operation: "create",
          engineType: engine,
          providedName: name,
          context: "Manager",
        },
      );
    }

    if (
      !options || typeof options !== "object" || Array.isArray(options) ||
      options === null
    ) {
      throw new CacherError(
        "Options must be a valid object",
        {
          operation: "create",
          engineType: engine,
          instanceName: name,
          providedOptions: typeof options,
          isArray: Array.isArray(options),
          isNull: options === null,
          context: "Manager",
        },
      );
    }
  }

  /**
   * Validate that the requested engine exists.
   * @private
   */
  private _validateEngineExists(engineType: string): void {
    if (!this._engines.has(engineType)) {
      throw new CacherError(
        `Engine "${engineType}" is not registered`,
        {
          operation: "create",
          requestedEngine: engineType,
          availableEngines: Array.from(this._engines.keys()),
          context: "Manager",
        },
      );
    }
  }

  /**
   * Handle instance creation or validation.
   * @private
   */
  private _handleInstanceCreation<
    T extends CacherOptions & Record<string, unknown>,
  >(
    engineType: string,
    instanceName: string,
    options: T,
  ): void {
    if (!this._instances.has(instanceName)) {
      this._createNewInstance(engineType, instanceName, options);
    } else {
      this._validateExistingInstance(engineType, instanceName);
    }
  }

  /**
   * Create a new cache instance.
   * @private
   */
  private _createNewInstance<T extends CacherOptions & Record<string, unknown>>(
    engineType: string,
    instanceName: string,
    options: T,
  ): void {
    const EngineClass = this._engines.get(engineType)!;
    try {
      this._instances.set(
        instanceName,
        new EngineClass(instanceName, options),
      );
      this._instanceEngines.set(instanceName, engineType);
    } catch (error) {
      throw new CacherError(
        `Failed to create instance "${instanceName}": ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
        {
          operation: "create",
          engineType: engineType,
          instanceName: instanceName,
          options: options,
          context: "Manager",
        },
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Validate that an existing instance uses the same engine type.
   * @private
   */
  private _validateExistingInstance(
    engineType: string,
    instanceName: string,
  ): void {
    const existingEngineType = this._instanceEngines.get(instanceName);

    // If we have tracking data for this instance, validate engine type match
    if (existingEngineType !== undefined && existingEngineType !== engineType) {
      throw new CacherError(
        `Instance "${instanceName}" already exists with engine type "${existingEngineType}", cannot create with "${engineType}"`,
        {
          operation: "create",
          instanceName: instanceName,
          requestedEngine: engineType,
          existingEngine: existingEngineType,
          context: "Manager",
        },
      );
    }

    // If no tracking data exists but instance exists, update tracking
    // This handles cases where instances were created before tracking was implemented
    if (existingEngineType === undefined && this._instances.has(instanceName)) {
      this._instanceEngines.set(instanceName, engineType);
    }
  }

  /**
   * Get an existing cache instance by name.
   *
   * @param name - Name of the cache instance
   * @returns Cache instance if found, undefined otherwise
   *
   * @example
   * ```typescript
   * const cache = Cacher.getInstance('session-cache');
   * if (cache) {
   *   // Use cache
   * }
   * ```
   */
  getInstance(name: string): AbstractEngine | undefined {
    if (!name || typeof name !== "string") {
      return undefined;
    }
    return this._instances.get(name.trim());
  }

  /**
   * Check if a cache instance exists.
   *
   * @param name - Name of the cache instance
   * @returns True if instance exists, false otherwise
   */
  hasInstance(name: string): boolean {
    if (!name || typeof name !== "string") {
      return false;
    }
    return this._instances.has(name.trim());
  }

  /**
   * Remove a cache instance from the manager.
   * This will finalize the instance if it has a finalize method.
   *
   * @param name - Name of the cache instance to remove
   * @returns True if instance was removed, false if it didn't exist
   *
   * @example
   * ```typescript
   * await Cacher.removeInstance('session-cache');
   * ```
   */
  async removeInstance(name: string): Promise<boolean> {
    if (!name || typeof name !== "string") {
      return false;
    }

    const instanceName = name.trim();
    const instance = this._instances.get(instanceName);

    if (!instance) {
      return false;
    }

    // Finalize the instance if possible
    try {
      if ("finalize" in instance && typeof instance.finalize === "function") {
        await instance.finalize();
      }
    } catch (error) {
      // Log error but continue with removal
      console.warn(
        `Warning: Failed to finalize instance "${instanceName}":`,
        error,
      );
    }

    const deleted = this._instances.delete(instanceName);
    if (deleted) {
      this._instanceEngines.delete(instanceName);
    }
    return deleted;
  }

  /**
   * Remove a registered engine (used primarily for testing).
   *
   * @param name - Name of the engine to remove
   * @returns True if engine was removed, false if it didn't exist
   * @internal
   */
  removeEngine(name: string): boolean {
    if (!name || typeof name !== "string") {
      return false;
    }

    const engineName = name.trim().toUpperCase();
    return this._engines.delete(engineName);
  }

  /**
   * Get list of registered engine types.
   *
   * @returns Array of registered engine names
   */
  getRegisteredEngines(): string[] {
    return Array.from(this._engines.keys()).sort();
  }

  /**
   * Get list of active cache instance names.
   *
   * @returns Array of active instance names
   */
  getActiveInstances(): string[] {
    return Array.from(this._instances.keys()).sort();
  }

  /**
   * Remove all cache instances and clean up resources.
   * This will finalize all instances that support it.
   *
   * @example
   * ```typescript
   * await Cacher.clear();
   * ```
   */
  async clear(): Promise<void> {
    const instances = Array.from(this._instances.entries());

    // Finalize all instances in parallel
    await Promise.allSettled(
      instances.map(async ([name, instance]) => {
        try {
          if (
            "finalize" in instance && typeof instance.finalize === "function"
          ) {
            await instance.finalize();
          }
        } catch (error) {
          console.warn(
            `Warning: Failed to finalize instance "${name}":`,
            error,
          );
        }
      }),
    );

    this._instances.clear();
    this._instanceEngines.clear();
  }

  private __registeredDefaultEngines(): void {
    this.addEngine(
      "MEMORY",
      MemoryCacher as unknown as EngineConstructor,
    );
    this.addEngine(
      "REDIS",
      RedisCacher as unknown as EngineConstructor,
    );
    this.addEngine(
      "MEMCACHED",
      MemCacher as unknown as EngineConstructor,
    );
  }
}

export const Cacher: Manager = new Manager();
