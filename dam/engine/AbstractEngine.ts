/**
 * @fileoverview Abstract base class for DAM (Database Access Manager) engines.
 *
 * This module provides the foundational AbstractEngine class that all concrete
 * database engines must extend. It implements common functionality including:
 *
 * - Connection lifecycle management (connect/close)
 * - Transaction support with nested savepoints
 * - Connection pooling abstraction
 * - Health monitoring with configurable thresholds
 * - Query execution with parameter validation
 * - Performance tracking and slow query detection
 * - Event-driven architecture for monitoring
 * - Comprehensive error handling with contextual error codes
 *
 * @example PostgreSQL Engine Implementation
 * ```typescript
 * import { AbstractEngine } from './AbstractEngine.ts';
 * import { Client } from 'npm:pg';
 *
 * class PostgreSQLEngine extends AbstractEngine<PostgreSQLOptions> {
 *   public readonly Engine = 'postgresql';
 *   private client?: Client;
 *
 *   protected async _connect(): Promise<void> {
 *     this.client = new Client(this.getConnectionConfig());
 *     await this.client.connect();
 *   }
 *
 *   protected async _executeQuery<R>(query: EngineQuery): Promise<{data: R[], count: number}> {
 *     const result = await this.client!.query(query.sql, Object.values(query.params || {}));
 *     return { data: result.rows, count: result.rowCount || 0 };
 *   }
 *
 *   // ... implement other abstract methods
 * }
 * ```
 *
 * @module DAM/Engine/AbstractEngine
 * @version 1.0.0
 * @author TundraLibs
 */

import { type EventOptionKeys, Options } from '@tundralibs/utils';
import { ulid } from '@tundralibs/id';
import type {
  EngineEvents,
  EngineOptions,
  EnginePoolStats,
  EngineQuery,
  EngineQueryResult,
  EngineStatus,
  EngineTransactionOptions,
} from './types/mod.ts';
import { DAMEngineError } from './errors/mod.ts';

const defaultQueryId = (prefix?: string): string => {
  if (prefix && prefix.length > 0) {
    return `${prefix.trim()}-${ulid()}`;
  }
  return ulid();
};

/**
 * Abstract base class for all DAM (Database Access Manager) engines.
 *
 * Provides comprehensive functionality for database operations including:
 * - Connection management with automatic reconnection
 * - Transaction support with nested savepoints
 * - Connection pooling abstraction
 * - Health monitoring with configurable thresholds
 * - Query execution with performance tracking
 * - Event-driven architecture for monitoring
 * - Context-rich error handling with proper error codes
 *
 * @template O - Engine-specific options type extending {@link EngineOptions}
 *
 * @see {@link EngineOptions} - Base configuration options
 * @see {@link EngineEvents} - Available event types
 * @see {@link DAMEngineError} - Error class with comprehensive error codes
 * @see {@link DAMEngineErrorCodes} - All available error codes
 *
 * @example Basic engine implementation
 * ```typescript
 * class PostgreSQLEngine extends AbstractEngine<PostgreSQLOptions> {
 *   public readonly Engine = 'postgresql';
 *
 *   protected async _connect(): Promise<void> {
 *     // Implementation-specific connection logic
 *   }
 *
 *   protected async _executeQuery<R>(query: EngineQuery): Promise<{data: R[], count: number}> {
 *     // Implementation-specific query execution
 *   }
 * }
 * ```
 *
 * @example Engine usage with events
 * ```typescript
 * const engine = new MyEngine('db::instance1', {
 *   connectionTimeout: 30,
 *   slowQueryThreshold: 1.0,
 *   healthCheckInterval: 60
 * });
 *
 * engine.on('connect', (instanceId) => console.log(`Connected: ${instanceId}`));
 * engine.on('error', (instanceId, error) => console.error(`Error: ${error.message}`));
 *
 * await engine.connect();
 * const result = await engine.execute({ sql: 'SELECT * FROM users', params: {} });
 * ```
 */
export abstract class AbstractEngine<O extends EngineOptions = EngineOptions>
  extends Options<O, EngineEvents> {
  /**
   * Engine type identifier (e.g., 'postgresql', 'mongodb', 'sqlite').
   * Must be implemented by concrete engine classes.
   * Used in error messages and instance identification.
   */
  public abstract readonly Engine: string;
  protected _name: string;
  protected _instanceId: string;

  protected _status: EngineStatus = 'CLOSED';
  protected _inTransaction: boolean = false;
  protected _generateQueryId: (prefix?: string) => string = defaultQueryId;

  // Connection pool management
  protected _poolEnabled: boolean = false;
  protected _poolStats: EnginePoolStats = {
    totalConnections: 0,
    activeConnections: 0,
    idleConnections: 0,
    waitingRequests: 0,
  };

  // Health monitoring
  protected _healthCheckInterval?: number;
  protected _lastHealthCheck?: Date;
  protected _consecutiveErrors: number = 0;

  //#region Getters
  /** Engine instance name (without instanceId suffix) */
  get name(): string {
    return this._name;
  }

  /**
   * Full instance identifier in format 'engine::name::instanceId'
   * Used for logging, monitoring, and event identification
   */
  get instanceId(): string {
    return `${this.Engine}::${this.name}::${this._instanceId}`;
  }

  /**
   * Current engine connection status
   * @see {@link EngineStatus} for possible values
   */
  get status(): EngineStatus {
    return this._status;
  }

  /** Whether engine is currently in a transaction */
  get inTransaction(): boolean {
    return this._inTransaction;
  }

  /** Whether connection pooling is enabled for this engine */
  get poolEnabled(): boolean {
    return this._poolEnabled;
  }

  /**
   * Current connection pool statistics
   * @see {@link EnginePoolStats} for available metrics
   */
  get poolStats(): EnginePoolStats {
    return { ...this._poolStats };
  } /**
   * Engine health status information
   * Includes health state, error count, and last check time
   */

  get healthStatus(): {
    isHealthy: boolean;
    consecutiveErrors: number;
    lastCheckTime?: Date;
  } {
    const maxErrors = this.getOption('maxConsecutiveErrors');
    const threshold = typeof maxErrors === 'number' ? maxErrors : 5;
    return {
      isHealthy: this._consecutiveErrors < threshold,
      consecutiveErrors: this._consecutiveErrors,
      lastCheckTime: this._lastHealthCheck,
    };
  }
  //#endregion Getters

  /**
   * Creates a new AbstractEngine instance.
   *
   * @param id - Engine identifier in format 'name::instanceId' or just 'name'
   * @param options - Engine configuration options and event handlers
   * @param defaults - Default option values to merge with provided options
   *
   * @throws {@link DAMEngineError} CONFIG_INVALID - When configuration validation fails
   *
   * @example
   * ```typescript
   * const engine = new MyEngine('userdb::primary', {
   *   connectionTimeout: 30,
   *   on: {
   *     connect: (id) => console.log(`Connected: ${id}`),
   *     error: (id, error) => console.error(`Error: ${error.message}`)
   *   }
   * });
   * ```
   */
  constructor(
    id: string,
    options: EventOptionKeys<O, EngineEvents>,
    defaults?: Partial<O>,
  ) {
    super();
    // Parse id - format: name::instanceId or just name
    const [name, instanceId] = id.split('::');
    this._name = (name ?? '').trim();
    this._instanceId = instanceId ?? ulid();

    // Set default options
    super._setOptions(
      options,
      {
        ...defaults,
        slowQueryThreshold: 0.5, // 500ms
        connectionTimeout: 30, // 30 seconds
        queryTimeout: 30, // 30 seconds
        maxConsecutiveErrors: 5,
        healthCheckInterval: 60, // 60 seconds
        transactionTimeout: 30, // 30 seconds
        acquireTimeout: 10, // 10 seconds
        idleTimeout: 300, // 5 minutes
      } as Partial<O>,
    );

    // Set custom query ID generator if provided
    if (this.hasOption('generateQueryId')) {
      this._generateQueryId = this.getOption('generateQueryId')!;
    }

    // Initialize pool if pool options are provided
    this._initializePool();
  }

  /**
   * Establishes connection to the database.
   *
   * Automatically initializes connection pool if pool options are configured,
   * starts health monitoring if enabled, and emits 'connect' event on success.
   *
   * @throws {@link DAMEngineError} ENGINE_ALREADY_CONNECTED - When already connected
   * @throws {@link DAMEngineError} CONNECTION_FAILED - When connection establishment fails
   *
   * @fires connect - Emitted when connection is successfully established
   * @fires error - Emitted when connection fails
   *
   * @example
   * ```typescript
   * try {
   *   await engine.connect();
   *   console.log('Database connected successfully');
   * } catch (error) {
   *   if (error.code === 'CONNECTION_FAILED') {
   *     console.error('Failed to connect:', error.context.reason);
   *   }
   * }
   * ```
   */
  async connect(): Promise<void> {
    if (this._status === 'IDLE') {
      throw new DAMEngineError('ENGINE_ALREADY_CONNECTED', {
        instanceId: this.instanceId,
        engine: this.Engine,
        name: this.name,
      });
    }

    try {
      await this._connect();
      this._status = 'IDLE';
      this._consecutiveErrors = 0;

      // Setup health monitoring after successful connection
      this._setupHealthMonitoring();

      this.emit('connect', this.instanceId);
    } catch (error) {
      this._status = 'CLOSED';
      this._consecutiveErrors++;

      // Cleanup health monitoring on connection failure
      if (this._healthCheckInterval) {
        clearInterval(this._healthCheckInterval);
        this._healthCheckInterval = undefined;
      }
      const damError = error instanceof DAMEngineError
        ? error
        : new DAMEngineError(
          'CONNECTION_FAILED',
          {
            instanceId: this.instanceId,
            engine: this.Engine,
            name: this.name,
            reason: error instanceof Error ? error.message : String(error),
          },
          error as Error,
        );
      this.emit('error', this.instanceId, damError);
      throw damError;
    }
  }

  /**
   * Closes the database connection and cleans up resources.
   *
   * Automatically rolls back any active transactions, stops health monitoring,
   * closes connection pools, and emits 'disconnect' event on success.
   *
   * @throws {@link DAMEngineError} ENGINE_CLEANUP_FAILED - When cleanup operations fail
   *
   * @fires disconnect - Emitted when disconnection is successful
   * @fires error - Emitted when cleanup fails
   *
   * @example
   * ```typescript
   * await engine.close();
   * console.log('Database connection closed');
   * ```
   */
  async close(): Promise<void> {
    // Always cleanup health monitoring interval regardless of connection state
    if (this._healthCheckInterval) {
      clearInterval(this._healthCheckInterval);
      this._healthCheckInterval = undefined;
    }

    if (this.status !== 'CLOSED') {
      try {
        // If in transaction, rollback all active transactions
        if (this._inTransaction) {
          await this._rollbackAllTransactions();
        }

        // Close engine-specific resources
        await this._close();

        this._status = 'CLOSED';
        this.emit('disconnect', this.instanceId);
      } catch (error) {
        const damError = error instanceof DAMEngineError
          ? error
          : new DAMEngineError(
            'ENGINE_CLEANUP_FAILED',
            {
              instanceId: this.instanceId,
              engine: this.Engine,
              name: this.name,
              reason: error instanceof Error ? error.message : String(error),
            },
            error as Error,
          );
        this.emit('error', this.instanceId, damError);
        throw damError;
      }
    }
  }

  /**
   * Begins a new database transaction or creates a savepoint for nested transactions.
   *
   * Supports nested transactions through savepoints. Each nested begin() creates
   * a new savepoint that can be independently committed or rolled back.
   *
   * @param options - Transaction configuration options
   * @param options.timeout - Transaction timeout in seconds
   * @param options.name - Optional transaction name/id for async-safe transactions
   *
   * @returns The transaction ID that should be used for commit, rollback, and query operations
   *
   * @throws {@link DAMEngineError} QUERY_EXECUTION_FAILED - When transaction start fails
   * @throws {@link DAMEngineError} TRANSACTION_SAVEPOINT_FAILED - When savepoint creation fails
   *
   * @fires query - Emitted with BEGIN or SAVEPOINT query details
   * @fires error - Emitted when transaction start fails
   *
   * @example Basic transaction
   * ```typescript
   * await engine.begin();
   * try {
   *   await engine.execute({ sql: 'INSERT INTO users ...', params: {} });
   *   await engine.commit();
   * } catch (error) {
   *   await engine.rollback();
   *   throw error;
   * }
   * ```
   *
   * @example Nested transactions
   * ```typescript
   * await engine.begin(); // Transaction level 1
   * try {
   *   await engine.execute({ sql: 'INSERT INTO users ...', params: {} });
   *
   *   await engine.begin(); // Savepoint level 2
   *   try {
   *     await engine.execute({ sql: 'INSERT INTO orders ...', params: {} });
   *     await engine.commit(); // Release savepoint
   *   } catch (error) {
   *     await engine.rollback(); // Rollback to savepoint
   *   }
   *
   *   await engine.commit(); // Commit main transaction
   * } catch (error) {
   *   await engine.rollback();
   * }
   * ```
   */
  async begin(options?: EngineTransactionOptions): Promise<string> {
    if (this.status === 'CLOSED') {
      await this.connect();
    }

    // Use provided name as transaction ID, or generate one if not provided
    const transactionId = options?.name || this._generateQueryId('tx');

    try {
      // Start new transaction
      await this._beginTransaction(options, transactionId);
      this._inTransaction = true;
      this.emit('query', this.instanceId, {
        id: transactionId,
        query: { sql: 'BEGIN', params: {}, transactionId },
        data: [],
        count: 0,
        time: 0,
        isSlow: false,
      });
    } catch (error) {
      const damError = error instanceof DAMEngineError
        ? error
        : new DAMEngineError(
          'QUERY_EXECUTION_FAILED',
          {
            instanceId: this.instanceId,
            engine: this.Engine,
            name: this.name,
            operation: 'begin',
            transactionId,
            reason: error instanceof Error ? error.message : String(error),
          },
          error as Error,
        );
      this.emit('error', this.instanceId, damError);
      throw damError;
    }

    return transactionId;
  }

  /**
   * Commits the current transaction or releases a savepoint.
   *
   * For main transactions (level 1), commits all changes to the database.
   * For nested transactions (level > 1), releases the current savepoint.
   *
   * @param transactionId - The transaction ID to commit (required for pooled engines)
   * @throws {@link DAMEngineError} TRANSACTION_NOT_ACTIVE - When no transaction is active
   * @throws {@link DAMEngineError} TRANSACTION_COMMIT_FAILED - When commit operation fails
   *
   * @fires query - Emitted with COMMIT or RELEASE SAVEPOINT query details
   * @fires error - Emitted when commit fails
   *
   * @example
   * ```typescript
   * await engine.begin();
   * await engine.execute({ sql: 'INSERT INTO users ...', params: {} });
   * await engine.commit(); // Commits the transaction
   * ```
   */
  async commit(transactionId?: string): Promise<void> {
    if (!this._inTransaction) {
      throw new DAMEngineError('TRANSACTION_NOT_ACTIVE', {
        instanceId: this.instanceId,
        engine: this.Engine,
        name: this.name,
        operation: 'commit',
      });
    }

    try {
      // Commit transaction
      await this._commitTransaction(transactionId);
      // Only set inTransaction to false if no active transactions remain
      this._inTransaction = this._hasActiveTransactions();
      this.emit('query', this.instanceId, {
        id: transactionId || this._generateQueryId('tx'),
        query: { sql: 'COMMIT', params: {}, transactionId },
        data: [],
        count: 0,
        time: 0,
        isSlow: false,
      });
    } catch (error) {
      const damError = error instanceof DAMEngineError
        ? error
        : new DAMEngineError(
          'TRANSACTION_COMMIT_FAILED',
          {
            instanceId: this.instanceId,
            engine: this.Engine,
            name: this.name,
            reason: error instanceof Error ? error.message : String(error),
          },
          error as Error,
        );
      this.emit('error', this.instanceId, damError);
      throw damError;
    }
  }

  /**
   * Rolls back the current transaction or reverts to a savepoint.
   *
   * For main transactions (level 1), rolls back all changes since transaction start.
   * For nested transactions (level > 1), rolls back to the previous savepoint.
   * Safe to call even when no transaction is active (no-op).
   *
   * @throws {@link DAMEngineError} TRANSACTION_ROLLBACK_FAILED - When rollback operation fails
   *
   * @fires query - Emitted with ROLLBACK or ROLLBACK TO SAVEPOINT query details
   * @fires error - Emitted when rollback fails
   *
   * @example
   * ```typescript
   * await engine.begin();
   * try {
   *   await engine.execute({ sql: 'INSERT INTO users ...', params: {} });
   *   // Some error occurs
   *   throw new Error('Business logic error');
   * } catch (error) {
   *   await engine.rollback(); // Safely rolls back changes
   *   throw error;
   * }
   * ```
   */
  async rollback(transactionId?: string): Promise<void> {
    if (!this._inTransaction) {
      return; // Nothing to rollback
    }

    try {
      // Rollback transaction
      await this._rollbackTransaction(transactionId);
      // Only set inTransaction to false if no active transactions remain
      this._inTransaction = this._hasActiveTransactions();
      this.emit('query', this.instanceId, {
        id: transactionId || this._generateQueryId('tx'),
        query: { sql: 'ROLLBACK', params: {}, transactionId },
        data: [],
        count: 0,
        time: 0,
        isSlow: false,
      });
    } catch (error) {
      // Force reset transaction state on rollback error
      this._inTransaction = this._hasActiveTransactions();
      const damError = error instanceof DAMEngineError
        ? error
        : new DAMEngineError(
          'TRANSACTION_ROLLBACK_FAILED',
          {
            instanceId: this.instanceId,
            engine: this.Engine,
            name: this.name,
            reason: error instanceof Error ? error.message : String(error),
          },
          error as Error,
        );
      this.emit('error', this.instanceId, damError);
      throw damError;
    }
  }

  /**
   * Executes a database query and returns the results.
   *
   * Automatically connects if not already connected, validates query parameters,
   * tracks execution time, and determines if query is slow based on threshold.
   *
   * @template R - Type of the result records, defaults to Record<string, unknown>
   * @param query - Query object with SQL and parameters
   * @param query.sql - SQL query string with :param: placeholders
   * @param query.params - Parameters to bind to the query
   *
   * @returns Promise resolving to query results with metadata
   *
   * @throws {@link DAMEngineError} QUERY_MISSING_PARAMETERS - When required parameters are missing
   * @throws {@link DAMEngineError} QUERY_EXECUTION_FAILED - When query execution fails
   *
   * @fires query - Emitted with query details and performance metrics
   * @fires error - Emitted when query execution fails
   *
   * @example Basic query
   * ```typescript
   * const result = await engine.execute<User>({
   *   sql: 'SELECT * FROM users WHERE id = :userId:',
   *   params: { userId: 123 }
   * });
   *
   * console.log(`Found ${result.count} users in ${result.time}s`);
   * if (result.isSlow) {
   *   console.warn('Query was slow!');
   * }
   * ```
   *
   * @example Parameterized query
   * ```typescript
   * interface OrderResult {
   *   id: number;
   *   total: number;
   *   status: string;
   * }
   *
   * const orders = await engine.execute<OrderResult>({
   *   sql: 'SELECT * FROM orders WHERE user_id = :userId: AND status = :status:',
   *   params: { userId: 123, status: 'pending' }
   * });
   * ```
   */
  async execute<R extends Record<string, unknown> = Record<string, unknown>>(
    query: EngineQuery,
  ): Promise<EngineQueryResult<R>> {
    if (this.status === 'CLOSED') {
      await this.connect();
    }

    query = this._processQuery(query);
    const result: EngineQueryResult<R> = {
      id: this._generateQueryId(this.instanceId),
      query: query,
      data: [],
      count: 0,
      time: 0,
      isSlow: false,
    };

    const startTime = performance.now();
    let error: DAMEngineError | undefined;

    try {
      this._status = 'RUNNING';
      const executionResult = await this._executeQuery<R>(query);
      result.data = executionResult.data;
      result.count = executionResult.count;
      this._status = 'IDLE';
    } catch (e) {
      this._status = 'IDLE';
      error = e instanceof DAMEngineError
        ? e
        : new DAMEngineError('QUERY_EXECUTION_FAILED', {
          instanceId: this.instanceId,
          engine: this.Engine,
          name: this.name,
          query: query.sql,
          params: query.params,
          reason: e instanceof Error ? e.message : String(e),
        }, e as Error);
    }

    const endTime = performance.now();
    result.time = (endTime - startTime) / 1000; // Convert to seconds
    const threshold = this.getOption('slowQueryThreshold');
    result.isSlow =
      result.time > (typeof threshold === 'number' ? threshold : 0.5);

    this.emit('query', this.instanceId, result, error);

    if (error) {
      throw error;
    }

    return result;
  }

  //#region Protected Methods
  protected override _processOption<
    K extends keyof EngineOptions = keyof EngineOptions,
  >(
    key: K,
    value: O[K],
  ): O[K] {
    switch (key) {
      case 'generateQueryId':
        if (typeof value !== 'function') {
          throw new DAMEngineError('CONFIG_INVALID', {
            instanceId: this.instanceId,
            engine: this.Engine,
            name: this.name,
            configKey: 'generateQueryId',
            reason: 'Must be a function which returns a string',
          });
        }
        break;
      case 'slowQueryThreshold':
        if (typeof value !== 'number' || value < 0) {
          throw new DAMEngineError('CONFIG_INVALID', {
            instanceId: this.instanceId,
            engine: this.Engine,
            name: this.name,
            configKey: 'slowQueryThreshold',
            reason: 'Must be a non-negative number',
          });
        }
        break;
      case 'connectionTimeout':
        if (value !== undefined && (typeof value !== 'number' || value <= 0)) {
          throw new DAMEngineError('CONFIG_INVALID', {
            instanceId: this.instanceId,
            engine: this.Engine,
            name: this.name,
            configKey: 'connectionTimeout',
            reason: 'Must be a positive number',
          });
        }
        break;
      case 'queryTimeout':
        if (value !== undefined && (typeof value !== 'number' || value <= 0)) {
          throw new DAMEngineError('CONFIG_INVALID', {
            instanceId: this.instanceId,
            engine: this.Engine,
            name: this.name,
            configKey: 'queryTimeout',
            reason: 'Must be a positive number',
          });
        }
        break;
      case 'transactionTimeout':
        if (value !== undefined && (typeof value !== 'number' || value <= 0)) {
          throw new DAMEngineError('CONFIG_INVALID', {
            instanceId: this.instanceId,
            engine: this.Engine,
            name: this.name,
            configKey: 'transactionTimeout',
            reason: 'Must be a positive number',
          });
        }
        break;
      case 'healthCheckInterval':
        if (value !== undefined && (typeof value !== 'number' || value <= 0)) {
          throw new DAMEngineError('CONFIG_INVALID', {
            instanceId: this.instanceId,
            engine: this.Engine,
            name: this.name,
            configKey: 'healthCheckInterval',
            reason: 'Must be a positive number',
          });
        }
        break;
      case 'maxConsecutiveErrors':
        if (
          value !== undefined &&
          (typeof value !== 'number' || value < 1 || !Number.isInteger(value))
        ) {
          throw new DAMEngineError('CONFIG_INVALID', {
            instanceId: this.instanceId,
            engine: this.Engine,
            name: this.name,
            configKey: 'maxConsecutiveErrors',
            reason: 'Must be a positive integer',
          });
        }
        break;
      case 'minConnections':
        if (
          value !== undefined &&
          (typeof value !== 'number' || value < 0 || !Number.isInteger(value))
        ) {
          throw new DAMEngineError('CONFIG_INVALID', {
            instanceId: this.instanceId,
            engine: this.Engine,
            name: this.name,
            configKey: 'minConnections',
            reason: 'Must be a non-negative integer',
          });
        }
        break;
      case 'maxConnections':
        if (
          value !== undefined &&
          (typeof value !== 'number' || value < 1 || !Number.isInteger(value))
        ) {
          throw new DAMEngineError('CONFIG_INVALID', {
            instanceId: this.instanceId,
            engine: this.Engine,
            name: this.name,
            configKey: 'maxConnections',
            reason: 'Must be a positive integer',
          });
        }
        break;
      case 'acquireTimeout':
        if (value !== undefined && (typeof value !== 'number' || value <= 0)) {
          throw new DAMEngineError('CONFIG_INVALID', {
            instanceId: this.instanceId,
            engine: this.Engine,
            name: this.name,
            configKey: 'acquireTimeout',
            reason: 'Must be a positive number',
          });
        }
        break;
      case 'idleTimeout':
        if (value !== undefined && (typeof value !== 'number' || value <= 0)) {
          throw new DAMEngineError('CONFIG_INVALID', {
            instanceId: this.instanceId,
            engine: this.Engine,
            name: this.name,
            configKey: 'idleTimeout',
            reason: 'Must be a positive number',
          });
        }
        break;
    }
    return super._processOption(key, value) as O[K];
  }

  /**
   * Processes and validates a query before execution.
   *
   * First standardizes the query format (can be overridden by engines),
   * then validates parameter bindings and ensures all required parameters
   * are provided for :param: placeholders.
   *
   * @param query - Raw query object to process
   * @returns Processed query with validated parameters
   *
   * @throws {@link DAMEngineError} QUERY_MISSING_PARAMETERS - When required parameters are missing
   *
   * @example
   * ```typescript
   * const processed = this._processQuery({
   *   sql: 'SELECT * FROM users WHERE id = :userId:',
   *   params: { userId: 123 }
   * });
   * // Result: { sql: 'SELECT * FROM users WHERE id = :userId:;', params: { userId: 123 } }
   * ```
   */
  protected _processQuery(query: EngineQuery): EngineQuery {
    // First standardize the query (can be overridden by engines)
    const standardized = this._standardizeQuery(query);

    // Then validate parameters using the original SQL format
    this._validateQueryParameters(query);

    return standardized;
  }

  /**
   * Standardizes query format for the specific database engine.
   *
   * Base implementation normalizes SQL and keeps :param: format.
   * Engines should override this to convert to their specific parameter format
   * (e.g., PostgreSQL uses $1, $2; MySQL uses ?).
   *
   * @param query - Query to standardize
   * @returns Query in engine-specific format
   * @protected
   */
  protected _standardizeQuery(query: EngineQuery): EngineQuery {
    const sql = query.sql.trim().replace(/;$/, '') + ';';
    return { sql, params: query.params, transactionId: query.transactionId };
  }

  /**
   * Validates that all required parameters are provided for :param: placeholders.
   *
   * @param query - Query to validate
   * @throws {@link DAMEngineError} QUERY_MISSING_PARAMETERS - When required parameters are missing
   * @private
   */
  private _validateQueryParameters(query: EngineQuery): void {
    const keys = Object.keys(query.params || {});
    const missing: string[] = [];
    const matches = query.sql.match(/:(\w+):/g);

    if (matches !== null) {
      for (const match of matches) {
        const key = match.substring(1, match.length - 1);
        if (!keys.includes(key)) {
          missing.push(key);
        }
      }
    }

    if (missing.length > 0) {
      throw new DAMEngineError('QUERY_MISSING_PARAMETERS', {
        instanceId: this.instanceId,
        engine: this.Engine,
        name: this.name,
        query,
        missing: missing.join(', '),
      });
    }
  }

  /**
   * Initializes connection pool if pool-related options are configured.
   *
   * Sets the _poolEnabled flag if any pool options are present:
   * - minConnections
   * - maxConnections
   * - acquireTimeout
   * - idleTimeout
   */
  protected _initializePool(): void {
    // Pool is enabled if any pool-related options are set
    if (
      this.hasOption('minConnections') ||
      this.hasOption('maxConnections') ||
      this.hasOption('acquireTimeout') ||
      this.hasOption('idleTimeout')
    ) {
      this._poolEnabled = true;
    }
  }

  /**
   * Sets up periodic health check monitoring if configured.
   *
   * Creates an interval timer that calls _performHealthCheck() at the
   * specified healthCheckInterval. Emits error events when health checks fail.
   */
  protected _setupHealthMonitoring(): void {
    const intervalSeconds = this.getOption('healthCheckInterval');
    if (
      intervalSeconds && typeof intervalSeconds === 'number' &&
      intervalSeconds > 0
    ) {
      this._healthCheckInterval = setInterval(() => {
        this._performHealthCheck().catch((error) => {
          this.emit(
            'error',
            this.instanceId,
            error instanceof DAMEngineError ? error : new DAMEngineError(
              'HEALTH_CHECK_FAILED',
              {
                instanceId: this.instanceId,
                engine: this.Engine,
                name: this.name,
                reason: error instanceof Error ? error.message : String(error),
              },
              error as Error,
            ),
          );
        });
      }, intervalSeconds * 1000) as unknown as number;
    }
  }

  /**
   * Performs a health check and tracks consecutive errors.
   *
   * Calls the abstract _healthCheck() method and manages error counting.
   * Throws ENGINE_UNHEALTHY error when consecutive errors exceed threshold.
   *
   * @throws {@link DAMEngineError} ENGINE_UNHEALTHY - When consecutive errors exceed maxConsecutiveErrors
   * @throws {@link DAMEngineError} HEALTH_CHECK_FAILED - When health check implementation fails
   */
  protected async _performHealthCheck(): Promise<void> {
    try {
      await this._healthCheck();
      this._consecutiveErrors = 0;
      this._lastHealthCheck = new Date();
    } catch (error) {
      this._consecutiveErrors++;

      // Check if engine is unhealthy after multiple failures
      const maxErrors = this.getOption('maxConsecutiveErrors');
      const unhealthyThreshold = typeof maxErrors === 'number' ? maxErrors : 5;
      if (this._consecutiveErrors >= unhealthyThreshold) {
        throw new DAMEngineError('ENGINE_UNHEALTHY', {
          instanceId: this.instanceId,
          engine: this.Engine,
          name: this.name,
          consecutiveErrors: this._consecutiveErrors,
        }, error as Error);
      }

      throw error instanceof DAMEngineError ? error : new DAMEngineError(
        'HEALTH_CHECK_FAILED',
        {
          instanceId: this.instanceId,
          engine: this.Engine,
          name: this.name,
          reason: error instanceof Error ? error.message : String(error),
        },
        error as Error,
      );
    }
  }

  /**
   * Updates connection pool statistics.
   *
   * Merges provided statistics with current pool stats. Used by concrete
   * implementations to report pool metrics for monitoring.
   *
   * @param stats - Partial pool statistics to update
   */
  protected _updatePoolStats(stats: Partial<EnginePoolStats>): void {
    this._poolStats = { ...this._poolStats, ...stats };
  }
  //#endregion Protected Methods

  //#region Abstract Methods
  /**
   * Establishes the actual database connection.
   * Must be implemented by concrete engine classes.
   *
   * @throws Should throw appropriate errors for connection failures
   */
  protected abstract _connect(): void | Promise<void>;

  /**
   * Closes the database connection and cleanup resources.
   * Must be implemented by concrete engine classes.
   *
   * @throws Should throw appropriate errors for cleanup failures
   */
  protected abstract _close(): void | Promise<void>;

  /**
   * Executes the actual database query.
   * Must be implemented by concrete engine classes.
   *
   * @template R - Result record type
   * @param query - Processed query with validated parameters
   * @returns Promise with query results and count
   *
   * @throws Should throw appropriate errors for query execution failures
   */
  protected abstract _executeQuery<
    R extends Record<string, unknown> = Record<string, unknown>,
  >(
    query: EngineQuery,
  ): Promise<{ data: R[]; count: number }>;

  /**
   * Begins a new database transaction.
   * Must be implemented by concrete engine classes.
   *
   * @param options - Transaction options (timeout, isolation level, etc.)
   * @param transactionId - The transaction ID to use for this transaction
   * @throws Should throw appropriate errors for transaction start failures
   */
  protected abstract _beginTransaction(
    options?: EngineTransactionOptions,
    transactionId?: string,
  ): Promise<void>;

  /**
   * Commits the current transaction.
   * Must be implemented by concrete engine classes.
   *
   * @param transactionId - The transaction ID to commit (optional for non-pooled engines)
   * @throws Should throw appropriate errors for commit failures
   */
  protected abstract _commitTransaction(transactionId?: string): Promise<void>;

  /**
   * Rolls back the current transaction.
   * Must be implemented by concrete engine classes.
   *
   * @param transactionId - The transaction ID to rollback (optional for non-pooled engines)
   * @throws Should throw appropriate errors for rollback failures
   */
  protected abstract _rollbackTransaction(
    transactionId?: string,
  ): Promise<void>;

  /**
   * Rolls back all active transactions.
   * Must be implemented by concrete engine classes.
   * Used when closing the engine to clean up any active transactions.
   *
   * @throws Should throw appropriate errors for rollback failures
   */
  protected abstract _rollbackAllTransactions(): Promise<void>;

  /**
   * Check if there are any active transactions.
   * Must be implemented by concrete engine classes.
   *
   * @returns true if there are active transactions, false otherwise
   */
  protected abstract _hasActiveTransactions(): boolean;

  /**
   * Performs engine-specific health check.
   * Must be implemented by concrete engine classes.
   * Should test basic connectivity and functionality.
   *
   * @throws Should throw appropriate errors when health check fails
   *
   * @example Simple health check
   * ```typescript
   * protected async _healthCheck(): Promise<void> {
   *   await this.client.query('SELECT 1');
   * }
   * ```
   */
  protected abstract _healthCheck(): Promise<void>;
  //#endregion Abstract Methods
}
