import { Singleton } from '../utils/mod.ts';
import { AbstractEngine, type EngineOptions } from './engine/mod.ts';
import {
  MariaEngine,
  MongoEngine,
  PostgresEngine,
  PostgresEngine2,
  SQLiteEngine,
} from './engines/mod.ts';
import { DAMError } from './errors/mod.ts';

/**
 * Type definition for engine constructor.
 * Used for type-safe engine registration with flexible options.
 */
type EngineConstructor = new (
  name: string,
  options: unknown,
) => AbstractEngine;

/**
 * Database Access Manager (DAM) class that handles engine registration and instance creation.
 *
 * This singleton class provides a centralized way to:
 * - Register database engines (SQLite, MongoDB, PostgreSQL, MariaDB, etc.)
 * - Create and manage database connection instances
 * - Ensure proper lifecycle management of database instances
 *
 * The Manager class uses {@link DAMError} for its own operation errors,
 * while individual database engines use {@link DAMEngineError} for their errors.
 *
 * @example
 * ```typescript
 * // Basic usage
 * const db = DAM.create('SQLITE', 'my-db', {
 *   filename: './data.db'
 * });
 *
 * // Custom engine registration
 * DAM.addEngine('CUSTOM', MyCustomEngine);
 * const customDb = DAM.create('CUSTOM', 'custom-db', options);
 * ```
 *
 * @see {@link AbstractEngine} Base class for database engines
 * @see {@link EngineOptions} Configuration options for database engines
 * @see {@link DAMError} Error class for Manager operations
 * @see {@link DAMEngineError} Error class for Engine operations
 */
@Singleton
class Manager {
  /**
   * Map of registered engine constructors keyed by engine name.
   * @private
   */
  protected _engines: Map<string, EngineConstructor> = new Map();

  /**
   * Map of created database instances keyed by instance name.
   * @private
   */
  protected _instances: Map<string, AbstractEngine> = new Map();

  /**
   * Map tracking which engine type each instance uses.
   * @private
   */
  protected _instanceEngines: Map<string, string> = new Map();

  constructor() {
    // Register built-in database engines
    this.__registerDefaultEngines();
  }

  /**
   * Add a new database engine to the registry.
   *
   * @param name - Unique identifier for the engine (e.g., 'SQLITE', 'MONGODB', 'POSTGRES')
   * @param engine - Constructor function for the engine
   * @throws {DAMError} When an engine with the same name is already registered
   *
   * @example
   * ```typescript
   * // Register a custom engine
   * DAM.addEngine('CUSTOM', MyCustomEngine);
   * ```
   */
  addEngine(
    name: string,
    engine: EngineConstructor,
  ): void {
    // Validate input parameters
    if (!name || typeof name !== 'string') {
      throw new DAMError(
        'Engine name must be a non-empty string',
        {
          operation: 'addEngine',
          providedName: name,
          context: 'Manager',
        },
      );
    }

    if (!engine || typeof engine !== 'function') {
      throw new DAMError(
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
      throw new DAMError(
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
   * Create or retrieve a database instance.
   *
   * @param engine - The engine type to use (e.g., 'SQLITE', 'MONGODB', 'POSTGRES', 'POSTGRES2', 'MARIA')
   * @param name - Unique name for the database instance
   * @param options - Configuration options for the database engine
   * @returns Database instance
   * @throws {DAMError} When engine is not registered or parameters are invalid
   *
   * @example
   * ```typescript
   * // Create a SQLite database
   * const sqliteDb = DAM.create('SQLITE', 'app-db', {
   *   filename: './data.db'
   * });
   *
   * // Create a MongoDB connection
   * const mongoDb = DAM.create('MONGODB', 'user-db', {
   *   host: 'localhost',
   *   port: 27017,
   *   database: 'users'
   * });
   *
   * // Create a PostgreSQL connection
   * const pgDb = DAM.create('POSTGRES', 'analytics-db', {
   *   host: 'localhost',
   *   port: 5432,
   *   database: 'analytics',
   *   username: 'user',
   *   password: 'pass'
   * });
   * ```
   */
  create<
    T extends EngineOptions & Record<string, unknown> =
      & EngineOptions
      & Record<string, unknown>,
  >(engine: string, name: string, options: T): AbstractEngine {
    this._validateCreateParameters(engine, name, options);

    const engineType = engine.trim().toUpperCase();
    const instanceName = name.trim();

    this._validateEngineExists(engineType);
    this._handleInstanceCreation(engineType, instanceName, options);

    return this._instances.get(instanceName)!; //NOSONAR
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
    if (!engine || typeof engine !== 'string') {
      throw new DAMError(
        'Engine type must be a non-empty string',
        {
          operation: 'create',
          providedEngine: engine,
          context: 'Manager',
        },
      );
    }

    if (!name || typeof name !== 'string') {
      throw new DAMError(
        'Instance name must be a non-empty string',
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
      throw new DAMError(
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
  private _validateEngineExists(engineType: string): void {
    if (!this._engines.has(engineType)) {
      throw new DAMError(
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
  private _handleInstanceCreation<
    T extends EngineOptions & Record<string, unknown>,
  >(
    engineType: string,
    instanceName: string,
    options: T,
  ): void {
    if (this._instances.has(instanceName)) {
      this._validateExistingInstance(engineType, instanceName);
    } else {
      this._createNewInstance(engineType, instanceName, options);
    }
  }

  /**
   * Create a new database instance.
   * @private
   */
  private _createNewInstance<T extends EngineOptions & Record<string, unknown>>(
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
      throw new DAMError(
        `Failed to create instance "${instanceName}": ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
        {
          operation: 'create',
          engineType: engineType,
          instanceName: instanceName,
          options: options,
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
  private _validateExistingInstance(
    engineType: string,
    instanceName: string,
  ): void {
    const existingEngineType = this._instanceEngines.get(instanceName);

    // If we have tracking data for this instance, validate engine type match
    if (existingEngineType !== undefined && existingEngineType !== engineType) {
      throw new DAMError(
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
   * Get an existing database instance by name.
   *
   * @param name - Name of the database instance
   * @returns Database instance if found, undefined otherwise
   *
   * @example
   * ```typescript
   * const db = DAM.getInstance('app-db');
   * if (db) {
   *   // Use database
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
   * Check if a database instance exists.
   *
   * @param name - Name of the database instance
   * @returns True if instance exists, false otherwise
   */
  hasInstance(name: string): boolean {
    if (!name || typeof name !== 'string') {
      return false;
    }
    return this._instances.has(name.trim());
  }

  /**
   * Remove a database instance from the manager.
   * This will disconnect the instance if it has a disconnect method.
   *
   * @param name - Name of the database instance to remove
   * @returns True if instance was removed, false if it didn't exist
   *
   * @example
   * ```typescript
   * await DAM.removeInstance('app-db');
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

    // Disconnect the instance if possible
    try {
      if (
        'disconnect' in instance && typeof instance.disconnect === 'function'
      ) {
        await instance.disconnect();
      }
    } catch (error) {
      // Log error but continue with removal
      console.warn(
        `Warning: Failed to disconnect instance "${instanceName}":`,
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
   * Get list of active database instance names.
   *
   * @returns Array of active instance names
   */
  getActiveInstances(): string[] {
    return Array.from(this._instances.keys()).sort((a, b) =>
      a.localeCompare(b)
    );
  }

  /**
   * Remove all database instances and clean up resources.
   * This will disconnect all instances that support it.
   *
   * @example
   * ```typescript
   * await DAM.clear();
   * ```
   */
  async clear(): Promise<void> {
    const instances = Array.from(this._instances.entries());

    // Disconnect all instances in parallel
    await Promise.allSettled(
      instances.map(async ([name, instance]) => {
        try {
          if (
            'disconnect' in instance &&
            typeof instance.disconnect === 'function'
          ) {
            await instance.disconnect();
          }
        } catch (error) {
          console.warn(
            `Warning: Failed to disconnect instance "${name}":`,
            error,
          );
        }
      }),
    );

    this._instances.clear();
    this._instanceEngines.clear();
  }

  /**
   * Register default database engines.
   * @private
   */
  private __registerDefaultEngines(): void {
    this.addEngine(
      'SQLITE',
      SQLiteEngine as unknown as EngineConstructor,
    );
    this.addEngine(
      'MONGODB',
      MongoEngine as unknown as EngineConstructor,
    );
    this.addEngine(
      'POSTGRES',
      PostgresEngine as unknown as EngineConstructor,
    );
    this.addEngine(
      'POSTGRES2',
      PostgresEngine2 as unknown as EngineConstructor,
    );
    this.addEngine(
      'MARIA',
      MariaEngine as unknown as EngineConstructor,
    );
  }
}

export const DAM: Manager = new Manager();
