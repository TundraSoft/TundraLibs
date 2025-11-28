import { type EventOptionKeys, Options } from '@tundralibs/utils';
import { ulid } from '@tundralibs/id';
import {
  EngineCapabilities,
  EngineEvents,
  EngineOptions,
  EnginePoolStats,
  EngineQuery,
  EngineQueryResult,
  EngineQueryStats,
  EngineStats,
  EngineStatus,
  EngineTransactionOptions,
  EngineTransactionStatus,
} from './types/mod.ts';
import { DAMEngineError } from './errors/mod.ts';

/**
 * Default ID generator using ULID with optional prefix.
 *
 * @param prefix - Optional prefix to prepend to the generated ID
 * @returns A unique identifier string
 */
const defaultIdGenerator = (prefix?: string): string => {
  if (prefix && prefix.length > 0) {
    return `${prefix.trim()}-${ulid()}`;
  }
  return ulid();
};

/**
 * Abstract base class for all database engine implementations.
 *
 * Provides:
 * - Connection management with status tracking
 * - Query execution with timing and stats
 * - Transaction support with idempotence and timeout handling
 * - Parameter validation and standardization
 * - Event emission for monitoring
 * - Pool and query statistics
 *
 * Implementations must provide:
 * - Engine name and capabilities
 * - Connection/disconnection logic
 * - Query execution logic
 * - Transaction operations
 * - Client mapping for transaction tracking
 *
 * @template O - Engine-specific options extending EngineOptions
 * @extends Options<O, EngineEvents>
 */
export abstract class AbstractEngine<O extends EngineOptions = EngineOptions>
  extends Options<O, EngineEvents> {
  /**
   * Engine name (e.g., 'PostgreSQL', 'MySQL', 'MongoDB').
   * Used for identification and logging.
   */
  public abstract readonly Engine: string;

  /**
   * Engine capabilities defining supported features.
   * Includes transaction support, parameter replacement format, etc.
   */
  public abstract readonly Capabilities: EngineCapabilities;

  /**
   * Connection name for this engine instance.
   * Combined with Engine to form unique instanceId.
   */
  public readonly Name: string;

  /**
   * Function to generate unique IDs for queries, transactions, etc.
   * Defaults to ULID-based generator.
   */
  protected _idGenerator: (prefix?: string) => string;

  /**
   * Unique instance identifier in format "Engine::name".
   * Used throughout for logging and error reporting.
   */
  public get instanceId() {
    return `${this.Engine}::${this.Name}`;
  }

  //#region Connection
  /**
   * Current connection status.
   * States: CLOSED → CONNECTING → IDLE ⇄ BUSY → CLOSED
   */
  protected _status: EngineStatus = 'CLOSED';

  /**
   * Loaded CA certificate content (if ssl.ca path was provided).
   * Loaded during construction via processOption.
   */
  protected _sslCaCertificate?: string;

  /**
   * Loaded client certificate content (if ssl.cert path was provided).
   * Loaded during construction via processOption.
   */
  protected _sslClientCertificate?: string;

  /**
   * Loaded client key content (if ssl.key path was provided).
   * Loaded during construction via processOption.
   */
  protected _sslClientKey?: string;

  /**
   * Connection timeout handle (internal use).
   */
  protected _connectionTimeout: number | null = null;

  /**
   * Get the current connection status.
   * Calls _updatePoolStatus() to sync status with pool state.
   * @returns Current engine status
   */
  public get status(): EngineStatus {
    this._updatePoolStatus();
    return this._status;
  }

  /**
   * Establish connection to the database.
   * Idempotent - returns early if already connected.
   * Updates status and emits connect/connectionFailed events.
   *
   * @throws {DAMEngineError} CONNECTION_FAILED if connection fails
   * @emits connect - On successful connection
   * @emits connectionFailed - On connection failure
   */
  public async connect(): Promise<void> {
    if (this.status !== 'CLOSED') {
      return;
    }
    try {
      this._status = 'CONNECTING';
      await this._connect();
      this._status = 'READY';
      this.emit('connect', this.instanceId);
      // init healthcheck etc
    } catch (e) {
      this._status = 'CLOSED';
      let error: DAMEngineError;
      if (e instanceof DAMEngineError) {
        error = e;
      } else {
        error = new DAMEngineError('CONNECTION_FAILED', {
          instanceId: this.instanceId,
        }, e as Error);
      }
      this.emit('connectionFailed', this.instanceId, error);
      throw error;
    }
  }

  /**
   * Disconnect from the database.
   * Idempotent - returns early if already closed.
   * Emits warning if disconnecting while BUSY.
   * Updates status and emits disconnect/error events.
   *
   * @throws {DAMEngineError} DISCONNECTION_FAILED if disconnect fails
   * @emits warn - If disconnecting while engine is BUSY
   * @emits disconnect - On successful disconnection
   * @emits error - On disconnection failure
   */
  public async disconnect(): Promise<void> {
    if (this.status === 'CLOSED') {
      return;
    }
    if (this.status === 'WAITING') {
      this.emit(
        'warn',
        this.instanceId,
        'Disconnect called while engine is BUSY',
      );
    }
    try {
      await this._disconnect();
      this._status = 'CLOSED';
      this.emit('disconnect', this.instanceId);
    } catch (e) {
      let error: DAMEngineError;
      if (e instanceof DAMEngineError) {
        error = e;
      } else {
        error = new DAMEngineError('DISCONNECTION_FAILED', {
          instanceId: this.instanceId,
        }, e as Error);
      }
      this.emit('error', this.instanceId, error);
      throw error;
    }
  }
  //#region Abstract Methods
  /**
   * Abstract method - Connect to the database.
   * Implementations should establish connection and initialize pools.
   *
   * @abstract
   * @returns Promise that resolves when connection is established
   * @throws {Error} Implementation-specific connection errors
   */
  protected abstract _connect(): Promise<void> | void;

  /**
   * Abstract method - Disconnect from the database.
   * Implementations should close connections and clean up pools.
   *
   * @abstract
   * @returns Promise that resolves when disconnection is complete
   * @throws {Error} Implementation-specific disconnection errors
   */
  protected abstract _disconnect(): Promise<void> | void;

  /**
   * Abstract method - Update engine status based on pool state.
   * Implementations must check pool availability and update _status accordingly.
   * Should transition between READY and WAITING states based on pool exhaustion.
   * May emit warn events when entering WAITING state.
   *
   * @abstract
   * @returns void
   */
  protected abstract _updatePoolStatus(): void;
  //#endregion Abstract Methods
  //#endregion Connection

  //#region Query Execution

  /**
   * Maps transaction/query IDs to database clients.
   * Used for transaction isolation and client tracking.
   * Implementations must define the concrete client type.
   */
  protected abstract _clientMap: Map<string, unknown>;

  /**
   * Tracks transaction state for idempotence.
   * States: 'ACTIVE' | 'COMMITTED' | 'ROLLBACK' | 'TIMEOUT'
   * Cleaned up (deleted) when transaction ends.
   */
  protected _transactionState: Map<
    string,
    EngineTransactionStatus
  > = new Map();

  /**
   * Stores timeout handles for active transactions.
   * Used to implement automatic rollback after timeout.
   * Maps transactionId → setTimeout handle.
   */
  protected _transactionTimeoutMap: Map<string, number> = new Map();

  /**
   * Standardizes a query by:
   * 1. Trimming whitespace and ensuring semicolon termination
   * 2. Validating all required parameters are provided
   * 3. Converting :param: placeholders to engine-specific format
   *
   * @param query - The query to standardize
   * @returns The standardized query with engine-specific placeholder format
   * @throws {DAMEngineError} MISSING_PARAMETERS if required parameters are missing
   */
  protected _standardizeQuery(query: EngineQuery): EngineQuery {
    const sql = query.sql.trim().replace(/;$/, '') + ';';
    const keys = Object.keys(query.params || {});
    const missing: string[] = [];
    const matches = sql.match(/:(\w+):/g);
    if (matches !== null) {
      for (const match of matches) {
        const key = match.substring(1, match.length - 1);
        if (!keys.includes(key)) {
          missing.push(key);
        }
      }
    }
    if (missing.length > 0) {
      throw new DAMEngineError('MISSING_PARAMETERS', {
        instanceId: this.instanceId,
        missing: missing.join(', '),
      });
    }
    // Replace :param: with actual param placeholder depending on engine
    query.sql = sql.replaceAll(/:(\w+):/g, (_full, key) => {
      if (this.Capabilities.parameterReplacement) {
        return `${this.Capabilities.parameterReplacement.prefix}${key}${this.Capabilities.parameterReplacement.suffix}`;
      }
      return key;
    });
    return query;
  }

  /**
   * Execute a single query with comprehensive tracking.
   *
   * Features:
   * - Automatic connection establishment
   * - Query standardization and validation
   * - Timing measurement and slow query detection
   * - Statistics tracking
   * - Auto-rollback on failure (if in transaction and autoRollbackOnFailure enabled)
   * - Event emission for monitoring
   *
   * @template R - The result row type (defaults to generic Record)
   * @param query - The query to execute
   * @returns Query result with data, count, timing, and metadata
   * @throws {DAMEngineError} NO_CONNECTION if connection unavailable
   * @throws {DAMEngineError} QUERY_EXECUTION_FAILED on execution error
   * @emits query - Emitted for every query execution
   * @emits slowQuery - Emitted if query exceeds slowQueryThreshold
   */
  public async execute<
    R extends Record<string, unknown> = Record<string, unknown>,
  >(
    query: EngineQuery,
  ): Promise<EngineQueryResult<R>> {
    await this.connect();
    if (this.status === 'CLOSED') {
      throw new DAMEngineError('NO_CONNECTION', {
        instanceId: this.instanceId,
      });
    }
    query = this._standardizeQuery(query);

    // Validate transaction exists if transactionId is provided
    if (query.transactionId && !this._clientMap.has(query.transactionId)) {
      throw new DAMEngineError('TRANSACTION_NOT_FOUND', {
        instanceId: this.instanceId,
        transactionId: query.transactionId,
      });
    }

    let waiting: boolean = false;
    if (this.status === 'WAITING') {
      this._poolStats.waiting += 1;
      waiting = true;
      this.emit(
        'warn',
        this.instanceId,
        'Executing query while engine is in WAITING state',
      );
    }
    const startTime = performance.now();
    const queryResult: EngineQueryResult<R> = {
      id: this._idGenerator('query'),
      count: 0,
      data: [],
      isSlow: false,
      time: 0,
      query: query,
      transactionId: query.transactionId,
    };
    try {
      const result = await this._execute<R>(query);
      const endTime = performance.now();
      queryResult.data = result.data;
      queryResult.count = result.count;
      queryResult.time = endTime - startTime;
      queryResult.isSlow = queryResult.time / 1000 >
        (this.getOption('slowQueryThreshold') || 0);
      this._logQuery(queryResult);
      this.emit('query', this.instanceId, queryResult);
      if (queryResult.isSlow) {
        this.emit('slowQuery', this.instanceId, queryResult);
      }
      this._updatePoolStatus();
      return queryResult;
    } catch (e) {
      let error: DAMEngineError;
      if (e instanceof DAMEngineError) {
        error = e;
      } else {
        error = new DAMEngineError('QUERY_EXECUTION_FAILED', {
          instanceId: this.instanceId,
          query: query,
        }, e as Error);
      }
      // If it is in transaction, rollback the transaction
      if (
        query.transactionId && this.getOption('autoRollbackOnFailure') === true
      ) {
        try {
          await this.rollbackTransaction(query.transactionId);
        } catch {
          // Ignore rollback errors
        }
      }
      this._logFailedQuery();
      throw error;
    } finally {
      if (waiting) {
        this._poolStats.waiting -= 1;
      }
    }
  }

  /**
   * Execute multiple queries
   *
   * Behavior:
   * - Executes queries sequentially
   * - Halts on first error
   * - Set transaction id to run in transaction and use commit/rollback post execution
   *
   * @param queries - Array of queries to execute sequentially
   * @throws {DAMEngineError} NO_CONNECTION if connection unavailable
   * @throws {DAMEngineError} QUERY_EXECUTION_FAILED if any query fails
   * @emits query, slowQuery - Same emissions as execute() for each query
   */
  public async batchExecute(queries: EngineQuery[]): Promise<void> {
    await this.connect();
    if (this.status === 'CLOSED') {
      throw new DAMEngineError('NO_CONNECTION', {
        instanceId: this.instanceId,
      });
    }
    for (const query of queries) {
      try {
        await this.execute(query);
      } catch (e) {
        if (e instanceof DAMEngineError) {
          throw e;
        } else {
          throw new DAMEngineError('QUERY_EXECUTION_FAILED', {
            instanceId: this.instanceId,
            query: query,
          }, e as Error);
        }
      }
    }
  }

  //#region Transactions

  /**
   * Begin a new transaction and return a unique transaction ID.
   *
   * Behavior:
   * - Checks engine supports transactions
   * - Establishes connection if needed
   * - Delegates to implementation's _beginTransaction()
   * - Sets transaction state to 'ACTIVE'
   * - Sets up automatic timeout with rollback
   * - Emits transactionBegin event
   *
   * @param options - Transaction options (timeout, isolation level, etc.)
   * @returns Unique transaction identifier string
   * @throws {DAMEngineError} UNSUPPORTED_OPERATION if engine doesn't support transactions
   * @throws {DAMEngineError} NO_CONNECTION if connection unavailable
   * @throws {DAMEngineError} TRANSACTION_OPERATION_ERROR on begin failure
   * @emits transactionBegin - On successful transaction start
   */
  public async beginTransaction(
    options?: EngineTransactionOptions,
  ): Promise<string> {
    if (this.Capabilities.transactions === false) {
      throw new DAMEngineError('UNSUPPORTED_OPERATION', {
        instanceId: this.instanceId,
        operation: 'Transactions',
      });
    }
    await this.connect();
    if (this.status === 'CLOSED') {
      throw new DAMEngineError('NO_CONNECTION', {
        instanceId: this.instanceId,
      });
    }
    try {
      const transactionId = options?.name ?? this._idGenerator('tx');
      await this._beginTransaction(transactionId);
      this._transactionState.set(transactionId, 'ACTIVE');
      this._setTransactionTimeout(transactionId, options?.timeout);
      this.emit('transactionBegin', this.instanceId, transactionId);
      this._updatePoolStatus();
      return transactionId;
    } catch (e) {
      let error: DAMEngineError;
      if (e instanceof DAMEngineError) {
        error = e;
      } else {
        error = new DAMEngineError('TRANSACTION_OPERATION_ERROR', {
          instanceId: this.instanceId,
          operation: 'beginTransaction',
        }, e as Error);
      }
      throw error;
    }
  }

  /**
   * Commit a transaction with idempotence handled by AbstractEngine.
   *
   * Idempotence guarantees:
   * - Returns silently if transaction already ended (COMMITTED/ROLLBACK/TIMEOUT)
   * - Returns silently if transaction never existed
   * - Safe to call multiple times
   * - Safe to call after timeout
   *
   * Behavior:
   * - Checks idempotence conditions first
   * - Clears transaction timeout
   * - Delegates to implementation's _commitTransaction()
   * - Sets state to 'COMMITTED' then deletes state (cleanup)
   * - Emits transactionCommit event
   *
   * Implementations only need to execute COMMIT and release client.
   *
   * @param transactionId - The transaction to commit
   * @throws {DAMEngineError} UNSUPPORTED_OPERATION if engine doesn't support transactions
   * @throws {DAMEngineError} NO_CONNECTION if connection unavailable
   * @throws {DAMEngineError} TRANSACTION_OPERATION_ERROR on commit failure
   * @emits transactionCommit - On successful commit
   */
  public async commitTransaction(transactionId: string): Promise<void> {
    if (this.Capabilities.transactions === false) {
      throw new DAMEngineError('UNSUPPORTED_OPERATION', {
        instanceId: this.instanceId,
        operation: 'Transactions',
      });
    }

    // IDEMPOTENCE CHECK 1: Already ended?
    const state = this._transactionState.get(transactionId);
    if (state === 'ROLLBACK' || state === 'COMMITTED' || state === 'TIMEOUT') {
      return; // Already ended - idempotent success
    }

    // IDEMPOTENCE CHECK 2: Transaction never existed?
    if (!this._clientMap.has(transactionId)) {
      return; // Never existed - idempotent success
    }

    await this.connect();
    if (this.status === 'CLOSED') {
      throw new DAMEngineError('NO_CONNECTION', {
        instanceId: this.instanceId,
      });
    }

    this._clearTransactionTimeout(transactionId);
    try {
      await this._commitTransaction(transactionId);
      this._transactionState.set(transactionId, 'COMMITTED');
      this.emit('transactionCommit', this.instanceId, transactionId);
      this._updatePoolStatus();
    } catch (e) {
      let error: DAMEngineError;
      if (e instanceof DAMEngineError) {
        error = e;
      } else {
        error = new DAMEngineError('TRANSACTION_OPERATION_ERROR', {
          instanceId: this.instanceId,
          transactionId: transactionId,
          operation: 'commitTransaction',
        }, e as Error);
      }
      throw error;
    } finally {
      this._transactionState.delete(transactionId);
    }
  }

  /**
   * Rollback a transaction with idempotence handled by AbstractEngine.
   *
   * Idempotence guarantees:
   * - Returns silently if transaction already ended (COMMITTED/ROLLBACK/TIMEOUT)
   * - Returns silently if transaction never existed
   * - Safe to call multiple times
   * - Safe to call after timeout or commit
   *
   * Behavior:
   * - Checks idempotence conditions first
   * - Clears transaction timeout
   * - Delegates to implementation's _rollbackTransaction()
   * - Sets state to 'ROLLBACK' then deletes state (cleanup)
   * - Emits transactionRollback event
   *
   * Implementations only need to execute ROLLBACK and release client.
   *
   * @param transactionId - The transaction to rollback
   * @throws {DAMEngineError} UNSUPPORTED_OPERATION if engine doesn't support transactions
   * @throws {DAMEngineError} NO_CONNECTION if connection unavailable
   * @throws {DAMEngineError} TRANSACTION_OPERATION_ERROR on rollback failure
   * @emits transactionRollback - On successful rollback
   */
  public async rollbackTransaction(transactionId: string): Promise<void> {
    if (this.Capabilities.transactions === false) {
      throw new DAMEngineError('UNSUPPORTED_OPERATION', {
        instanceId: this.instanceId,
        operation: 'Transactions',
      });
    }

    // IDEMPOTENCE CHECK 1: Already ended?
    const state = this._transactionState.get(transactionId);
    if (state === 'ROLLBACK' || state === 'COMMITTED' || state === 'TIMEOUT') {
      return; // Already ended - idempotent success
    }

    // IDEMPOTENCE CHECK 2: Transaction never existed?
    if (!this._clientMap.has(transactionId)) {
      return; // Never existed - idempotent success
    }

    await this.connect();
    if (this.status === 'CLOSED') {
      throw new DAMEngineError('NO_CONNECTION', {
        instanceId: this.instanceId,
      });
    }

    this._clearTransactionTimeout(transactionId);
    try {
      await this._rollbackTransaction(transactionId);
      this._transactionState.set(transactionId, 'ROLLBACK');
      this.emit('transactionRollback', this.instanceId, transactionId);
      this._updatePoolStatus();
    } catch (e) {
      let error: DAMEngineError;
      if (e instanceof DAMEngineError) {
        error = e;
      } else {
        error = new DAMEngineError('TRANSACTION_OPERATION_ERROR', {
          instanceId: this.instanceId,
          transactionId: transactionId,
          operation: 'rollbackTransaction',
        }, e as Error);
      }
      throw error;
    } finally {
      this._transactionState.delete(transactionId);
    }
  }

  /**
   * Rollback all active transactions.
   *
   * Behavior:
   * - Iterates through all active transactions in _clientMap
   * - Calls rollbackTransaction() for each (idempotent)
   * - Silently ignores any rollback errors
   * - Useful for graceful shutdown or cleanup
   *
   * @returns Promise that resolves when all rollbacks attempted
   */
  public async rollbackAllTransactions(): Promise<void> {
    const transactionIds = Array.from(this._clientMap.keys());
    for (const transactionId of transactionIds) {
      try {
        await this.rollbackTransaction(transactionId);
      } catch {
        // Ignore rollback errors
      }
    }
  }

  /**
   * Create a transaction helper object with convenient methods.
   *
   * Provides:
   * - id: Transaction identifier
   * - commit(): Commit the transaction
   * - rollback(): Rollback the transaction
   * - execute(query): Execute query within this transaction
   *
   * Simplifies transaction usage by eliminating need to manually track transaction ID.
   *
   * @returns Transaction helper object
   * @throws {DAMEngineError} Same errors as beginTransaction()
   * @example
   * const tx = await engine.transaction();
   * try {
   *   await tx.execute({sql: "UPDATE users SET ...", params: {}});
   *   await tx.commit();
   * } catch (e) {
   *   await tx.rollback();
   *   throw e;
   * }
   */
  public async transaction() {
    const id = await this.beginTransaction();
    return {
      id: id,
      commit: async () => {
        await this.commitTransaction(id);
      },
      rollback: async () => {
        await this.rollbackTransaction(id);
      },
      execute: <
        R extends Record<string, unknown> = Record<string, unknown>,
      >(
        query: EngineQuery,
      ): Promise<EngineQueryResult<R>> => {
        query.transactionId = id;
        return this.execute<R>(query);
      },
    };
  }

  /**
   * Set up automatic transaction timeout with auto-rollback.
   *
   * Behavior:
   * - Uses provided timeout or falls back to transactionTimeout option (default 120s)
   * - Clears any existing timeout first
   * - Creates setTimeout handler that:
   *   1. Sets transaction state to 'TIMEOUT'
   *   2. Calls rollbackTransaction() (idempotent, succeeds silently)
   *   3. Emits 'transactionTimeout' event
   * - Rollback errors are ignored (transaction may already be ended)
   *
   * @param transactionId - The transaction to set timeout for
   * @param timeout - Timeout in seconds (optional, uses option default if not provided)
   * @throws {DAMEngineError} TRANSACTION_NOT_FOUND if transaction not in _clientMap
   * @emits transactionTimeout - When timeout triggers and rollback initiated
   */
  protected _setTransactionTimeout(
    transactionId: string,
    timeout?: number,
  ): void {
    if (this._clientMap.has(transactionId)) {
      timeout = timeout ?? this.getOption('transactionTimeout') ?? 120;
      this._clearTransactionTimeout(transactionId);
      this._transactionTimeoutMap.set(
        transactionId,
        setTimeout(async () => {
          try {
            this._transactionState.set(transactionId, 'TIMEOUT');
            await this.rollbackTransaction(transactionId);
            this.emit(
              'transactionTimeout',
              this.instanceId,
              transactionId,
            );
          } catch {
            // Ignore rollback errors - idempotent success
          }
        }, timeout * 1000),
      );
    } else {
      throw new DAMEngineError('TRANSACTION_NOT_FOUND', {
        instanceId: this.instanceId,
        transactionId: transactionId,
      });
    }
  }

  /**
   * Clear any active timeout for a transaction.
   * Called before commit/rollback to prevent timeout handler from firing after transaction ends.
   *
   * @param transactionId - The transaction to clear timeout for
   */
  protected _clearTransactionTimeout(transactionId: string): void {
    if (this._transactionTimeoutMap.has(transactionId)) {
      clearTimeout(
        this._transactionTimeoutMap.get(transactionId),
      );
      this._transactionTimeoutMap.delete(transactionId);
    }
  }

  //#region Abstract Methods
  /**
   * Abstract method - Begin a transaction.
   *
   * Called by AbstractEngine.beginTransaction() after validation.
   * Implementations should:
   * - Reserve a client from the pool
   * - Execute BEGIN/START TRANSACTION
   * - Store client in _clientMap with generated transaction ID
   *
   * AbstractEngine handles state tracking and timeout setup.
   *
   * @abstract
   * @param options - Transaction options (timeout, isolation level, etc.)
   * @throws {Error} Implementation-specific transaction errors
   */
  protected abstract _beginTransaction(
    transactionId: string,
  ): Promise<void> | void;

  /**
   * Abstract method - Commit a transaction.
   *
   * Called by AbstractEngine.commitTransaction() after idempotence checks.
   * Implementations should:
   * - Execute COMMIT
   * - Release the client back to pool
   * - Remove transaction ID from _clientMap
   *
   * AbstractEngine handles:
   * - Idempotence (won't call if already ended)
   * - State updates and cleanup
   * - Timeout clearing
   *
   * @abstract
   * @param transactionId - The transaction to commit
   * @throws {Error} Implementation-specific commit errors
   */
  protected abstract _commitTransaction(
    transactionId: string,
  ): Promise<void> | void;

  /**
   * Abstract method - Rollback a transaction.
   *
   * Called by AbstractEngine.rollbackTransaction() after idempotence checks.
   * Implementations should:
   * - Execute ROLLBACK
   * - Release the client back to pool
   * - Remove transaction ID from _clientMap
   *
   * AbstractEngine handles:
   * - Idempotence (won't call if already ended)
   * - State updates and cleanup
   * - Timeout clearing
   *
   * @abstract
   * @param transactionId - The transaction to rollback
   * @throws {Error} Implementation-specific rollback errors
   */
  protected abstract _rollbackTransaction(
    transactionId: string,
  ): Promise<void> | void;
  //#endregion Abstract Methods

  //#endregion Transactions

  /**
   * Check if engine is connected and responsive.
   * Performs lightweight connectivity check.
   *
   * @returns True if connected and responsive, false otherwise
   */
  public async ping(): Promise<boolean> {
    await this.connect();
    if (this.status === 'CLOSED') {
      return false;
    }
    try {
      return await this._ping();
    } catch {
      return false;
    }
  }

  //#region Abstract Methods
  /**
   * Abstract method - Execute query against database.
   *
   * Called by AbstractEngine.execute() after connection, validation, and standardization.
   * Implementations should:
   * - Execute the query using appropriate client
   * - Handle transactionId if present (use transaction-specific client)
   * - Return results with data array and row count
   *
   * AbstractEngine handles:
   * - Connection establishment
   * - Query standardization
   * - Timing measurement
   * - Statistics tracking
   * - Event emission
   *
   * @abstract
   * @template R - The result row type
   * @param query - The standardized query to execute
   * @returns Query result with data array and count
   * @throws {Error} Implementation-specific execution errors
   */
  protected abstract _execute<
    R extends Record<string, unknown> = Record<string, unknown>,
  >(
    query: EngineQuery,
  ): Promise<{ data: R[]; count: number }> | { data: R[]; count: number };

  /**
   * Abstract method - Check database connectivity.
   *
   * Implementations should perform lightweight health check:
   * - Execute simple query (e.g., SELECT 1, PING, etc.)
   * - Return true if responsive, false otherwise
   * - Should NOT throw errors - return false instead
   *
   * Used for health monitoring and readiness checks.
   *
   * @abstract
   * @returns True if database is responsive, false otherwise
   */
  protected abstract _ping(): Promise<boolean> | boolean;

  //#endregion Abstract Methods

  //#endregion Query Execution

  //#region Stats
  /**
   * Query statistics tracking.
   * Automatically updated by _logQuery() and _logFailedQuery().
   */
  protected _queryStats: EngineQueryStats = {
    averageExecutionTimeMs: 0,
    totalQueries: 0,
    slowQueries: 0,
    failedQueries: 0,
    successfulQueries: 0,
  };

  /**
   * Connection pool statistics.
   * Should be updated by implementations when pool state changes.
   */
  protected _poolStats: EnginePoolStats = {
    total: 0,
    idle: 0,
    active: 0,
    waiting: 0,
  };

  /**
   * Get a copy of current connection pool statistics.
   * Returns snapshot to prevent external mutation.
   *
   * @returns Pool stats including total, idle, active connections and waiting requests
   */
  public get poolStats(): EnginePoolStats {
    this._updatePoolStatus();
    return { ...this._poolStats };
  }

  /**
   * Get a copy of current query statistics.
   * Returns snapshot to prevent external mutation.
   *
   * @returns Query stats including totals, averages, slow queries, and failures
   */
  public get queryStats(): EngineQueryStats {
    return { ...this._queryStats };
  }

  /**
   * Get combined pool and query statistics.
   *
   * @returns Object containing both pool and query stats
   */
  public get stats(): EngineStats {
    return {
      pool: this.poolStats,
      query: this.queryStats,
    };
  }

  /**
   * Log successful query statistics.
   *
   * Updates:
   * - totalQueries counter
   * - successfulQueries counter
   * - averageExecutionTimeMs (rolling average)
   * - slowQueries counter (if query exceeded threshold)
   *
   * @param result - The successful query result with timing information
   */
  protected _logQuery(result: EngineQueryResult) {
    const prevTotal = this._queryStats.totalQueries;
    this._queryStats.totalQueries += 1;
    this._queryStats.averageExecutionTimeMs =
      (this._queryStats.averageExecutionTimeMs * prevTotal +
        result.time) /
      this._queryStats.totalQueries;
    if (result.isSlow) {
      this._queryStats.slowQueries += 1;
    }
    this._queryStats.successfulQueries += 1;
  }

  /**
   * Log failed query statistics.
   *
   * Updates:
   * - failedQueries counter
   * - totalQueries counter
   *
   * Called when query execution throws an error.
   */
  protected _logFailedQuery() {
    this._queryStats.failedQueries += 1;
    this._queryStats.totalQueries += 1;
  }
  //#endregion Stats

  /**
   * Construct a new database engine instance.
   *
   * Sets up:
   * - Connection name
   * - Option defaults and overrides
   * - ID generator function
   * - Option validation
   *
   * Default options:
   * - slowQueryThreshold: 0.5 seconds
   * - idGenerator: ULID-based generator
   * - transactionTimeout: 120 seconds
   * - idleTimeoutSeconds: 180 seconds
   *
   * @param name - Connection name for this engine instance
   * @param options - Engine-specific options and event handlers
   * @param defaults - Default option values (merged with built-in defaults)
   * @throws {DAMEngineError} INVALID_CONFIG_VALUE if option validation fails
   */
  constructor(
    name: string,
    options?: EventOptionKeys<O, EngineEvents>,
    defaults?: Partial<O>,
  ) {
    super();
    this.Name = name;
    this._setOptions({
      slowQueryThreshold: 0.5,
      idGenerator: defaultIdGenerator,
      transactionTimeout: 120,
      idleTimeoutSeconds: 180,
      autoRollbackOnFailure: true,
      ...defaults,
      ...options,
    } as EventOptionKeys<O, EngineEvents>);
    this._idGenerator = this.getOption('idGenerator')!;

    // Process SSL certificate paths to load file contents
    this._loadSslCertificates();
  }

  /**
   * Load SSL certificate files into memory.
   * Called automatically during construction if SSL options are provided.
   *
   * For SSL configuration:
   * - If ssl.ca is a file path, loads the certificate content into _sslCaCertificate
   * - If ssl.cert is a file path, loads the certificate content into _sslClientCertificate
   * - If ssl.key is a file path, loads the key content into _sslClientKey
   *
   * @throws {DAMEngineError} FILE_READ_ERROR if certificate files cannot be read
   * @protected
   */
  protected _loadSslCertificates(): void {
    const ssl = this.getOption('ssl');
    if (ssl && typeof ssl === 'object' && ssl !== null) {
      // Load CA certificate if path provided
      if (ssl.ca && typeof ssl.ca === 'string') {
        try {
          this._sslCaCertificate = Deno.readTextFileSync(ssl.ca);
        } catch (e) {
          if (e instanceof Deno.errors.NotFound) {
            throw new DAMEngineError('INVALID_CONFIG_VALUE', {
              instanceId: this.instanceId,
              filePath: ssl.ca,
              reason: 'Could not find CA certificate file',
            }, e as Error);
          } else if (
            e instanceof Deno.errors.PermissionDenied ||
            e instanceof Deno.errors.NotCapable
          ) {
            throw new DAMEngineError('INVALID_CONFIG_VALUE', {
              instanceId: this.instanceId,
              filePath: ssl.ca,
              reason: 'Permission denied to read CA certificate file',
            }, e as Error);
          } else {
            throw new DAMEngineError('INVALID_CONFIG_VALUE', {
              instanceId: this.instanceId,
              filePath: ssl.ca,
              reason: e instanceof Error ? e.message : String(e),
            }, e as Error);
          }
        }
      }

      // Load client certificate if path provided
      if (ssl.cert && typeof ssl.cert === 'string') {
        try {
          this._sslClientCertificate = Deno.readTextFileSync(ssl.cert);
        } catch (e) {
          if (e instanceof Deno.errors.NotFound) {
            throw new DAMEngineError('INVALID_CONFIG_VALUE', {
              instanceId: this.instanceId,
              filePath: ssl.cert,
              reason: 'Could not find client certificate file',
            }, e as Error);
          } else if (
            e instanceof Deno.errors.PermissionDenied ||
            e instanceof Deno.errors.NotCapable
          ) {
            throw new DAMEngineError('INVALID_CONFIG_VALUE', {
              instanceId: this.instanceId,
              filePath: ssl.cert,
              reason: 'Permission denied to read client certificate file',
            }, e as Error);
          } else {
            throw new DAMEngineError('INVALID_CONFIG_VALUE', {
              instanceId: this.instanceId,
              filePath: ssl.cert,
              reason: e instanceof Error ? e.message : String(e),
            }, e as Error);
          }
        }
      }

      // Load client key if path provided
      if (ssl.key && typeof ssl.key === 'string') {
        try {
          this._sslClientKey = Deno.readTextFileSync(ssl.key);
        } catch (e) {
          if (e instanceof Deno.errors.NotFound) {
            throw new DAMEngineError('INVALID_CONFIG_VALUE', {
              instanceId: this.instanceId,
              filePath: ssl.key,
              reason: 'Could not find certificate key',
            }, e as Error);
          } else if (
            e instanceof Deno.errors.PermissionDenied ||
            e instanceof Deno.errors.NotCapable
          ) {
            throw new DAMEngineError('INVALID_CONFIG_VALUE', {
              instanceId: this.instanceId,
              filePath: ssl.key,
              reason: 'Permission denied to read certificate key',
            }, e as Error);
          } else {
            throw new DAMEngineError('INVALID_CONFIG_VALUE', {
              instanceId: this.instanceId,
              filePath: ssl.key,
              reason: e instanceof Error ? e.message : String(e),
            }, e as Error);
          }
        }
      }
    }
  }

  /**
   * Override to validate engine options during set/update.
   *
   * Validates:
   * - idGenerator: Must be function returning string
   * - slowQueryThreshold: 0-600 seconds
   * - idleTimeoutSeconds: 0-1800 seconds
   * - transactionTimeout: 0-120 seconds
   * - autoRollbackOnFailure: Must be boolean
   * - port: Must be positive integer
   * - username/password/host/database: Must be non-empty strings
   * - pool: Must have valid min/max with min ≤ max
   * - ssl: Must be boolean or valid SSL config object
   *
   * @param key - The option key being validated
   * @param value - The option value to validate
   * @returns The validated value (unchanged)
   * @throws {DAMEngineError} INVALID_CONFIG_VALUE if validation fails
   */
  protected override _processOption<K extends keyof EngineOptions>(
    key: K,
    value: O[K],
  ): O[K] {
    switch (key) {
      case 'idGenerator':
        if (!this._validateIdGenerator(value)) {
          throw new DAMEngineError('INVALID_CONFIG_VALUE', {
            instanceId: this.instanceId,
            option: key,
            reason: 'must be a function that returns a string',
          });
        }
        break;
      case 'slowQueryThreshold':
        if (!this._validateSlowQueryThreshold(value)) {
          throw new DAMEngineError('INVALID_CONFIG_VALUE', {
            instanceId: this.instanceId,
            option: key,
            reason:
              'must be a non-negative number less than or equal to 600 seconds',
          });
        }
        break;
      case 'idleTimeoutSeconds':
        if (!this._validateIdleTimeoutSeconds(value)) {
          throw new DAMEngineError('INVALID_CONFIG_VALUE', {
            instanceId: this.instanceId,
            option: key,
            reason:
              'must be a non-negative number less than or equal to 1800 seconds',
          });
        }
        break;
      case 'transactionTimeout':
        if (!this._validateTransactionTimeout(value)) {
          throw new DAMEngineError('INVALID_CONFIG_VALUE', {
            instanceId: this.instanceId,
            option: key,
            reason:
              'must be a non-negative number less than or equal to 120 seconds',
          });
        }
        break;
      case 'autoRollbackOnFailure':
        if (typeof value !== 'boolean') {
          throw new DAMEngineError('INVALID_CONFIG_VALUE', {
            instanceId: this.instanceId,
            option: key,
            reason: 'must be a boolean value',
          });
        }
        break;
      case 'port':
        if (
          typeof value !== 'number' || Number.isNaN(value) ||
          value <= 0 || !Number.isInteger(value) || value > 65535
        ) {
          throw new DAMEngineError('INVALID_CONFIG_VALUE', {
            instanceId: this.instanceId,
            option: key,
            reason: 'must be a positive integer between 1 and 65535',
          });
        }
        break;
      case 'username':
      case 'password':
      case 'host':
      case 'database':
        if (typeof value !== 'string' || value.trim().length === 0) {
          throw new DAMEngineError('INVALID_CONFIG_VALUE', {
            instanceId: this.instanceId,
            option: key,
            reason: 'must be a non-empty string',
          });
        }
        break;
      case 'pool':
        if (!this._validatePoolOptions(value)) {
          throw new DAMEngineError('INVALID_CONFIG_VALUE', {
            instanceId: this.instanceId,
            option: key,
            reason:
              'must be an object with optional positive integer "max" and non-negative integer "min" greater than 1',
          });
        }
        break;
      case 'ssl':
        if (!this._validateSecurityOptions(value)) {
          throw new DAMEngineError('INVALID_CONFIG_VALUE', {
            instanceId: this.instanceId,
            option: key,
            reason:
              'value must be a boolean or an object with optional string properties "ca", "cert", "key" and boolean "rejectUnauthorized"',
          });
        }
        break;
    }
    return super._processOption(key, value) as O[K];
  }

  /**
   * Type guard - Validate idGenerator option.
   *
   * Requirements:
   * - Must be a function
   * - Must return a string when called
   *
   * @param x - Value to validate
   * @returns True if x is a valid idGenerator function
   */
  protected _validateIdGenerator(x: unknown): x is (prefix?: string) => string {
    return typeof x === 'function' && typeof x() === 'string';
  }

  /**
   * Type guard - Validate slowQueryThreshold option.
   *
   * Requirements:
   * - Must be non-negative number
   * - Must be ≤ 600 seconds (10 minutes)
   *
   * @param value - Value to validate
   * @returns True if value is valid slowQueryThreshold
   */
  protected _validateSlowQueryThreshold(
    value: unknown,
  ): value is number {
    if (this._validateTimeouts(value) !== true) {
      return false;
    }
    // Cannot have value more than 10 minutes
    if (value > 10 * 60) {
      return false;
    }
    return true;
  }

  /**
   * Type guard - Validate idleTimeoutSeconds option.
   *
   * Requirements:
   * - Must be non-negative number
   * - Must be ≤ 1800 seconds (30 minutes)
   *
   * @param value - Value to validate
   * @returns True if value is valid idleTimeoutSeconds
   */
  protected _validateIdleTimeoutSeconds(
    value: unknown,
  ): value is number {
    if (this._validateTimeouts(value) !== true) {
      return false;
    }
    // Cannot have value more than 30 minutes
    if (value > 30 * 60) {
      return false;
    }
    return true;
  }

  /**
   * Type guard - Validate transactionTimeout option.
   *
   * Requirements:
   * - Must be non-negative number
   * - Must be ≤ 120 seconds (2 minutes)
   *
   * @param value - Value to validate
   * @returns True if value is valid transactionTimeout
   */
  protected _validateTransactionTimeout(
    value: unknown,
  ): value is number {
    if (this._validateTimeouts(value) !== true) {
      return false;
    }
    // Cannot have value more than 2 minutes
    if (value > 2 * 60) {
      return false;
    }
    return true;
  }

  /**
   * Type guard - Validate generic timeout value.
   *
   * Requirements:
   * - Must be a number
   * - Must not be NaN
   * - Must be non-negative (≥ 0)
   *
   * @param value - Value to validate
   * @returns True if value is a valid timeout
   */
  protected _validateTimeouts(
    value: unknown,
  ): value is number {
    if (typeof value !== 'number' || Number.isNaN(value)) {
      return false;
    }
    if (value < 0) {
      return false;
    }
    return true;
  }

  /**
   * Type guard - Validate pool option.
   *
   * Requirements:
   * - If provided, must be object (not null)
   * - max: optional positive integer
   * - min: optional positive integer ≥ 1
   * - If both provided: min ≤ max
   *
   * @param value - Value to validate
   * @returns True if value is valid pool option
   */
  protected _validatePoolOptions(
    value: unknown,
  ): value is EngineOptions['pool'] {
    if (typeof value !== 'object' || value === null) {
      return false;
    }
    const pool = value as EngineOptions['pool'];
    if (pool === undefined) {
      return true;
    }
    if (pool.max !== undefined) {
      if (
        typeof pool.max !== 'number' || Number.isNaN(pool.max) ||
        pool.max <= 0 || !Number.isInteger(pool.max)
      ) {
        return false;
      }
    }
    if (pool.min !== undefined) {
      if (
        typeof pool.min !== 'number' || Number.isNaN(pool.min) ||
        pool.min < 1 || !Number.isInteger(pool.min)
      ) {
        return false;
      }
    }
    // Ensure min <= max if both provided (BUG FIX)
    if (
      pool.min !== undefined && pool.max !== undefined && pool.min > pool.max
    ) {
      return false;
    }
    return true;
  }

  /**
   * Type guard - Validate ssl security option.
   *
   * Accepted formats:
   * - boolean: true/false to enable/disable SSL
   * - object with optional properties:
   *   - ca: string (certificate authority cert path)
   *   - cert: string (client certificate path)
   *   - key: string (client key path)
   *   - rejectUnauthorized: boolean (reject unauthorized certs)
   * - null is rejected
   * - undefined is accepted (no SSL config)
   *
   * @param value - Value to validate
   * @returns True if value is valid ssl option
   */
  protected _validateSecurityOptions(
    value: unknown,
  ): value is EngineOptions['ssl'] {
    if (typeof value !== 'boolean' && typeof value !== 'object') {
      return false;
    }
    if (typeof value === 'boolean') {
      return true;
    }
    if (value === null) {
      return false; // BUG FIX: reject null objects
    }
    const ssl = value as Exclude<EngineOptions['ssl'], boolean>;
    if (ssl === undefined) {
      return true;
    }
    if (ssl.ca !== undefined && typeof ssl.ca !== 'string') {
      return false;
    }
    if (ssl.cert !== undefined && typeof ssl.cert !== 'string') {
      return false;
    }
    if (ssl.key !== undefined && typeof ssl.key !== 'string') {
      return false;
    }
    if (
      ssl.rejectUnauthorized !== undefined &&
      typeof ssl.rejectUnauthorized !== 'boolean'
    ) {
      return false;
    }
    return true;
  }
}
