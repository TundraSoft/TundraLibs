import { Singleton } from '@tundralibs/utils';
import type { EngineOptions } from './engine/types/mod.ts';
import { AbstractEngine } from './engine/AbstractEngine.ts';
import {
  MariaDBEngine,
  MongoDBEngine,
  PostgreSQLEngine,
  SQLiteEngine,
} from './engines/mod.ts';
import { DAMError } from './errors/mod.ts';

/**
 * Type definition for engine constructor.
 * Used for type-safe engine registration with flexible options.
 */
type EngineConstructor = new (
  id: string,
  options: unknown,
) => AbstractEngine;

/**
 * Database Access Manager (DAM) class that handles engine registration and instance creation.
 *
 * This singleton class provides a centralized way to:
 * - Register database engines (PostgreSQL, MariaDB, SQLite, MongoDB, etc.)
 * - Create and manage database connection instances
 * - Ensure proper lifecycle management of database connections
 * - Provide transaction and query execution capabilities
 *
 * The DAM class uses {@link DAMError} for its own operation errors,
 * while individual database engines use {@link DAMEngineError} for their errors.
 *
 * @example
 * ```typescript
 * // Basic usage
 * const db = DAM.create('POSTGRESQL', 'main-db', {
 *   host: 'localhost',
 *   port: 5432,
 *   database: 'myapp',
 *   username: 'user',
 *   password: 'pass'
 * });
 *
 * await db.connect();
 * const result = await db.execute({
 *   sql: 'SELECT * FROM users WHERE active = $1',
 *   params: { 0: true }
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
   * Map of created database instances keyed by instance ID.
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
    this._registerDefaultEngines();
  }

  /**
   * Add a new database engine to the registry.
   *
   * @param name - Unique identifier for the engine (e.g., 'POSTGRESQL', 'MONGODB')
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
   * @param engine - The engine type to use (e.g., 'POSTGRESQL', 'MONGODB', 'MARIADB', 'SQLITE')
   * @param id - Unique identifier for the database instance (format: 'name' or 'name::instanceId')
   * @param options - Configuration options for the database engine
   * @returns Database engine instance
   * @throws {DAMError} When engine is not registered or parameters are invalid
   *
   * @example
   * ```typescript
   * // Create a PostgreSQL connection
   * const pgDb = DAM.create('POSTGRESQL', 'main-db', {
   *   host: 'localhost',
   *   port: 5432,
   *   database: 'myapp',
   *   username: 'user',
   *   password: 'pass'
   * });
   *
   * // Create a MongoDB connection
   * const mongoDb = DAM.create('MONGODB', 'docs-db', {
   *   host: 'localhost',
   *   port: 27017,
   *   database: 'documents',
   *   username: 'mongo',
   *   password: 'secret'
   * });
   * ```
   */
  create<
    T extends EngineOptions & Record<string, unknown> =
      & EngineOptions
      & Record<string, unknown>,
  >(engine: string, id: string, options: T): AbstractEngine {
    this._validateCreateParameters(engine, id, options);

    const engineType = engine.trim().toUpperCase();
    const instanceId = id.trim();

    this._validateEngineExists(engineType);
    this._handleInstanceCreation(engineType, instanceId, options);

    return this._instances.get(instanceId) as AbstractEngine;
  }

  /**
   * Validate parameters for create method.
   * @private
   */
  private _validateCreateParameters(
    engine: unknown,
    id: unknown,
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

    if (!id || typeof id !== 'string') {
      throw new DAMError(
        'Instance ID must be a non-empty string',
        {
          operation: 'create',
          engineType: engine,
          providedId: id,
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
          instanceId: id,
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
    instanceId: string,
    options: T,
  ): void {
    if (!this._instances.has(instanceId)) {
      this._createNewInstance(engineType, instanceId, options);
    } else {
      this._validateExistingInstance(engineType, instanceId);
    }
  }

  /**
   * Create a new database instance.
   * @private
   */
  private _createNewInstance<T extends EngineOptions & Record<string, unknown>>(
    engineType: string,
    instanceId: string,
    options: T,
  ): void {
    const EngineClass = this._engines.get(engineType)!;
    try {
      this._instances.set(
        instanceId,
        new EngineClass(instanceId, options),
      );
      this._instanceEngines.set(instanceId, engineType);
    } catch (error) {
      throw new DAMError(
        `Failed to create instance "${instanceId}": ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
        {
          operation: 'create',
          engineType: engineType,
          instanceId: instanceId,
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
    instanceId: string,
  ): void {
    const existingEngineType = this._instanceEngines.get(instanceId);

    // If we have tracking data for this instance, validate engine type match
    if (existingEngineType !== undefined && existingEngineType !== engineType) {
      throw new DAMError(
        `Instance "${instanceId}" already exists with engine type "${existingEngineType}", cannot create with "${engineType}"`,
        {
          operation: 'create',
          instanceId: instanceId,
          requestedEngine: engineType,
          existingEngine: existingEngineType,
          context: 'Manager',
        },
      );
    }

    // If no tracking data exists but instance exists, update tracking
    // This handles cases where instances were created before tracking was implemented
    if (existingEngineType === undefined && this._instances.has(instanceId)) {
      this._instanceEngines.set(instanceId, engineType);
    }
  }

  /**
   * Get an existing database instance by ID.
   *
   * @param id - ID of the database instance
   * @returns Database instance if found, undefined otherwise
   *
   * @example
   * ```typescript
   * const db = DAM.getInstance('main-db');
   * if (db) {
   *   // Use database connection
   *   await db.execute({ sql: 'SELECT 1' });
   * }
   * ```
   */
  getInstance(id: string): AbstractEngine | undefined {
    if (!id || typeof id !== 'string') {
      return undefined;
    }
    return this._instances.get(id.trim());
  }

  /**
   * Check if a database instance exists.
   *
   * @param id - ID of the database instance
   * @returns True if instance exists, false otherwise
   */
  hasInstance(id: string): boolean {
    if (!id || typeof id !== 'string') {
      return false;
    }
    return this._instances.has(id.trim());
  }

  /**
   * Remove a database instance from the manager.
   * This will close the connection and clean up resources.
   *
   * @param id - ID of the database instance to remove
   * @returns True if instance was removed, false if it didn't exist
   *
   * @example
   * ```typescript
   * await DAM.removeInstance('main-db');
   * ```
   */
  async removeInstance(id: string): Promise<boolean> {
    if (!id || typeof id !== 'string') {
      return false;
    }

    const instanceId = id.trim();
    const instance = this._instances.get(instanceId);

    if (!instance) {
      return false;
    }

    // Close the database connection
    try {
      await instance.close();
    } catch (error) {
      // Log error but continue with removal
      console.warn(
        `Warning: Failed to close instance "${instanceId}":`,
        error,
      );
    }

    const deleted = this._instances.delete(instanceId);
    if (deleted) {
      this._instanceEngines.delete(instanceId);
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
    return Array.from(this._engines.keys()).sort();
  }

  /**
   * Get list of active database instance IDs.
   *
   * @returns Array of active instance IDs
   */
  getActiveInstances(): string[] {
    return Array.from(this._instances.keys()).sort();
  }

  /**
   * Remove all database instances and clean up resources.
   * This will close all connections and clean up all instances.
   *
   * @example
   * ```typescript
   * await DAM.clear();
   * ```
   */
  async clear(): Promise<void> {
    const instances = Array.from(this._instances.entries());

    // Close all instances in parallel
    await Promise.allSettled(
      instances.map(async ([id, instance]) => {
        try {
          await instance.close();
        } catch (error) {
          console.warn(
            `Warning: Failed to close instance "${id}":`,
            error,
          );
        }
      }),
    );

    this._instances.clear();
    this._instanceEngines.clear();
  }

  /**
   * Register the default database engines.
   * @private
   */
  private _registerDefaultEngines(): void {
    // Register built-in database engines with proper type casting
    this.addEngine(
      'POSTGRESQL',
      PostgreSQLEngine as unknown as EngineConstructor,
    );
    this.addEngine('MARIADB', MariaDBEngine as unknown as EngineConstructor);
    this.addEngine('SQLITE', SQLiteEngine as unknown as EngineConstructor);
    this.addEngine('MONGODB', MongoDBEngine as unknown as EngineConstructor);
  }
}

export const DAM: Manager = new Manager();
