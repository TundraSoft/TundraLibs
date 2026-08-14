import { Singleton } from '@tundralibs/utils';
import type { CacherOptions } from './types/mod.ts';
import { AbstractEngine } from './AbstractEngine.ts';
import { MemCacher, MemoryCacher, RedisCacher } from './engines/mod.ts';
import { CacherError } from './errors/mod.ts';

/**
 * Option keys whose values are secrets and must be redacted before options
 * are placed into an error's structured context (which gets serialised to
 * logs). Matches `password`/`passphrase`/`secret`/`token`/`credential`/`apiKey`,
 * plus a bare `key` — the field name TLS options use for an inline PEM private
 * key (`ssl.key`), which is at least as sensitive as a password.
 */
const SECRET_OPTION_KEY =
  /pass(word|phrase)|secret|token|credential|api[-_]?key|^key$/i;

/**
 * Recursively copy `value`, replacing any property whose key matches
 * {@link SECRET_OPTION_KEY} with `'[REDACTED]'`. Redaction must be recursive
 * because secrets can be nested — e.g. an inline TLS private key lives at
 * `options.ssl.key`, not at the top level — and a shallow key-name test would
 * serialise that private key verbatim into the error context (which
 * `BaseError.toJSON()` emits to logs/monitoring).
 *
 * @param value - The value to redact (any depth of plain objects / arrays).
 * @param seen - The set of ancestors on the *current* recursion path. It is
 *   used to detect a genuine cycle (a self-referential options object) so
 *   redaction can't recurse forever — without mistaking a shared, non-cyclic
 *   reference (the same object reachable via two sibling paths) for one.
 * @returns A redacted deep copy; scalars are returned unchanged.
 */
function redactSecrets(
  value: unknown,
  seen: WeakSet<object> = new WeakSet(),
): unknown {
  if (value === null || typeof value !== 'object') {
    return value;
  }
  if (seen.has(value)) {
    return '[Circular]';
  }
  // Track only the current ancestor path: add on the way down, remove on the
  // way back up. A value reachable by two sibling paths is a shared reference,
  // not a cycle, and must be redacted in full each time — so `seen` may only
  // ever hold this node's ancestors, never its already-finished siblings.
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      return value.map((v) => redactSecrets(v, seen));
    }
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SECRET_OPTION_KEY.test(k)
        ? '[REDACTED]'
        : redactSecrets(v, seen);
    }
    return out;
  } finally {
    seen.delete(value);
  }
}

/**
 * Constructor of a cache engine, as seen by a REGISTERING caller.
 *
 * Generic in the engine's own options type so a concrete engine is
 * assignable: construct-signature parameters are contravariant, so a
 * fixed `options: unknown` here would make every concrete engine
 * (whose constructor takes its OWN options type) unassignable — the
 * registry could then only be fed through a cast.
 *
 * @typeParam O - The engine's options type.
 */
export type EngineConstructor<O extends CacherOptions = CacherOptions> = new (
  name: string,
  options: O,
) => AbstractEngine<O>;

/**
 * Options-erased constructor used for STORAGE only.
 *
 * The registry is heterogeneous — engines with different options types
 * share one map — so the stored form drops the options type. Reads go
 * through {@link Manager.create}, which re-applies the caller's options
 * type at the call site.
 *
 * @internal
 */
type StoredEngineConstructor = new (
  name: string,
  // deno-lint-ignore no-explicit-any -- heterogeneous registry: see doc comment
  options: any,
  // deno-lint-ignore no-explicit-any -- ditto for the engine's own options type
) => AbstractEngine<any>;

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
 * ```typescript ignore
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
  protected _engines: Map<string, StoredEngineConstructor> = new Map();

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
   * ```typescript ignore
   * // Register a custom engine
   * Cacher.addEngine('CUSTOM', MyCustomEngine);
   * ```
   */
  addEngine<O extends CacherOptions = CacherOptions>(
    name: string,
    engine: EngineConstructor<O>,
  ): void {
    // Validate input parameters
    if (!name || typeof name !== 'string') {
      throw new CacherError(
        'Engine name must be a non-empty string',
        {
          operation: 'addEngine',
          providedName: name,
          context: 'Manager',
        },
      );
    }

    if (!engine || typeof engine !== 'function') {
      throw new CacherError(
        'Engine must be a constructor function',
        {
          operation: 'addEngine',
          engineName: name,
          providedEngine: typeof engine,
          context: 'Manager',
        },
      );
    }

    const engineName = name.trim().toUpperCase();

    if (this._engines.has(engineName)) {
      throw new CacherError(
        `Engine "${engineName}" is already registered`,
        {
          operation: 'addEngine',
          engineName: engineName,
          registeredEngines: Array.from(this._engines.keys()),
          context: 'Manager',
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
    this.__validateCreateParameters(engine, name, options);

    const engineType = engine.trim().toUpperCase();
    const instanceName = name.trim();

    this.__validateEngineExists(engineType);
    this.__handleInstanceCreation(engineType, instanceName, options);

    return this._instances.get(instanceName)!; //NOSONAR
  }

  /**
   * Validate parameters for create method.
   * @private
   */
  private __validateCreateParameters(
    engine: unknown,
    name: unknown,
    options: unknown,
  ): void {
    if (!engine || typeof engine !== 'string') {
      throw new CacherError(
        'Engine type must be a non-empty string',
        {
          operation: 'create',
          providedEngine: engine,
          context: 'Manager',
        },
      );
    }

    if (!name || typeof name !== 'string') {
      throw new CacherError(
        'Instance name must be a non-empty string',
        {
          operation: 'create',
          engineType: engine,
          providedName: name,
          context: 'Manager',
        },
      );
    }

    // The ':' is the reserved namespace separator: every engine stores keys as
    // `${name}:${key}`. Allowing it inside an instance name lets one namespace
    // become a colon-prefix of another (e.g. 'app' and 'app:sessions'), which
    // makes RedisCacher.clear()'s `${name}:*` glob delete the sibling
    // namespace's keys — silent cross-namespace data loss. Reject it so the
    // documented "namespace isolation" guarantee actually holds.
    //
    // AbstractEngine's constructor enforces the same rule (so direct engine
    // construction can't bypass it); this manager-level check is kept because it
    // surfaces a clean, un-wrapped error for the primary `Cacher.create` path.
    if (name.includes(':')) {
      throw new CacherError(
        'Instance name must not contain ":" (reserved namespace separator)',
        {
          operation: 'create',
          engineType: engine,
          providedName: name,
          context: 'Manager',
        },
      );
    }

    if (
      !options || typeof options !== 'object' || Array.isArray(options) ||
      options === null
    ) {
      throw new CacherError(
        'Options must be a valid object',
        {
          operation: 'create',
          engineType: engine,
          instanceName: name,
          providedOptions: typeof options,
          isArray: Array.isArray(options),
          isNull: options === null,
          context: 'Manager',
        },
      );
    }
  }

  /**
   * Validate that the requested engine exists.
   * @private
   */
  private __validateEngineExists(engineType: string): void {
    if (!this._engines.has(engineType)) {
      throw new CacherError(
        `Engine "${engineType}" is not registered`,
        {
          operation: 'create',
          requestedEngine: engineType,
          availableEngines: Array.from(this._engines.keys()),
          context: 'Manager',
        },
      );
    }
  }

  /**
   * Handle instance creation or validation.
   * @private
   */
  private __handleInstanceCreation<
    T extends CacherOptions & Record<string, unknown>,
  >(
    engineType: string,
    instanceName: string,
    options: T,
  ): void {
    if (this._instances.has(instanceName)) {
      this.__validateExistingInstance(engineType, instanceName);
    } else {
      this.__createNewInstance(engineType, instanceName, options);
    }
  }

  /**
   * Create a new cache instance.
   * @private
   */
  private __createNewInstance<
    T extends CacherOptions & Record<string, unknown>,
  >(
    engineType: string,
    instanceName: string,
    options: T,
  ): void {
    const EngineClass = this._engines.get(engineType)!; //NOSONAR
    try {
      this._instances.set(
        instanceName,
        new EngineClass(instanceName, options),
      );
      this._instanceEngines.set(instanceName, engineType);
    } catch (error) {
      // Redact secret-bearing option keys before they enter the error
      // context — BaseError serialises `context` via toJSON, which would
      // otherwise leak a Redis/Memcached password (or an inline TLS private
      // key at `ssl.key`) into logs/monitoring. Redaction is recursive so
      // nested secrets are caught, not just top-level key names.
      const safeOptions = redactSecrets(options) as Record<string, unknown>;
      throw new CacherError(
        `Failed to create instance "${instanceName}": ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
        {
          operation: 'create',
          engineType: engineType,
          instanceName: instanceName,
          options: safeOptions,
          context: 'Manager',
        },
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Validate that an existing instance uses the same engine type.
   * @private
   */
  private __validateExistingInstance(
    engineType: string,
    instanceName: string,
  ): void {
    const existingEngineType = this._instanceEngines.get(instanceName);

    // If we have tracking data for this instance, validate engine type match
    if (existingEngineType !== undefined && existingEngineType !== engineType) {
      throw new CacherError(
        `Instance "${instanceName}" already exists with engine type "${existingEngineType}", cannot create with "${engineType}"`,
        {
          operation: 'create',
          instanceName: instanceName,
          requestedEngine: engineType,
          existingEngine: existingEngineType,
          context: 'Manager',
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
    if (!name || typeof name !== 'string') {
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
    if (!name || typeof name !== 'string') {
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
    if (!name || typeof name !== 'string') {
      return false;
    }

    const instanceName = name.trim();
    const instance = this._instances.get(instanceName);

    if (!instance) {
      return false;
    }

    // Finalize the instance if possible
    try {
      if ('finalize' in instance && typeof instance.finalize === 'function') {
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
    if (!name || typeof name !== 'string') {
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
    return Array.from(this._engines.keys()).sort((a, b) => a.localeCompare(b));
  }

  /**
   * Get list of active cache instance names.
   *
   * @returns Array of active instance names
   */
  getActiveInstances(): string[] {
    return Array.from(this._instances.keys()).sort((a, b) =>
      a.localeCompare(b)
    );
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
            'finalize' in instance && typeof instance.finalize === 'function'
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
      'MEMORY',
      MemoryCacher,
    );
    this.addEngine(
      'REDIS',
      RedisCacher,
    );
    this.addEngine(
      'MEMCACHED',
      MemCacher,
    );
  }
}

/**
 * The process-wide cache manager: registry of engine types plus the named
 * instances built from them.
 *
 * `MEMORY`, `REDIS` and `MEMCACHED` are registered on first import. Reach for
 * this instead of constructing engines directly when different parts of an
 * application need to share one cache by name — {@link Manager.create} returns
 * the existing instance for a name it has already built.
 *
 * @example
 * ```ts
 * const cache = Cacher.create('MEMORY', 'sessions', { defaultExpiry: 300 });
 * await cache.set('user:1', { name: 'Alice' });
 *
 * // Anywhere else in the process, the same instance:
 * const same = Cacher.getInstance('sessions');
 * ```
 */
export const Cacher: Manager = new Manager();
