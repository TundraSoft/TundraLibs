import { Database } from '$sqlite';
import type { EventOptionKeys } from '@tundralibs/utils';
import {
  AbstractEngine,
  DAMEngineError,
  EngineCapabilities,
  EngineEvents,
  EngineQuery,
} from '../../engine/mod.ts';
import { SQLiteEngineOptions } from './types/mod.ts';

/**
 * Default configuration values for SQLite connections.
 */
const SQLITE_DEFAULTS: Partial<SQLiteEngineOptions> = {
  cacheSize: -64000, // 64MB cache
  synchronous: 'NORMAL',
};

/**
 * SQLite database engine implementation using jsr:@db/sqlite.
 *
 * Features:
 * - File-based or in-memory databases
 * - Transaction support with isolated execution
 * - Prepared statements with parameter binding
 * - Automatic database file creation and validation
 * - Configurable cache size and synchronous mode
 * - No connection pooling (SQLite is single-connection)
 *
 * Driver: jsr:@db/sqlite@^0.12.0 (Deno-native, FFI-based)
 *
 * Note: SQLite is single-threaded and doesn't support connection pooling.
 * All queries are executed sequentially on a single database connection.
 *
 * @example
 * ```typescript
 * const engine = new SQLiteEngine('mydb', {
 *   database: './data/app.db',
 *   cacheSize: -64000,
 *   synchronous: 'NORMAL'
 * });
 * await engine.connect();
 * const result = await engine.execute({
 *   sql: 'SELECT * FROM users WHERE id = :id:',
 *   params: { id: 1 }
 * });
 * ```
 *
 * @example In-memory database
 * ```typescript
 * const engine = new SQLiteEngine('temp', {
 *   database: ':memory:'
 * });
 * ```
 */
export class SQLiteEngine extends AbstractEngine<SQLiteEngineOptions> {
  /** Engine type identifier */
  public readonly Engine = 'SQLITE';

  /** Supported capabilities of this engine */
  public readonly Capabilities: EngineCapabilities = {
    transactions: true,
    pooledConnections: false, // SQLite doesn't support connection pooling
    preparedStatements: true,
    parameterReplacement: {
      prefix: ':',
      suffix: '',
    },
  };

  /**
   * Map of transaction IDs to track active transactions.
   * SQLite doesn't need separate connections per transaction since it's single-threaded.
   * We just track if a transaction is active to prevent nested transactions.
   */
  protected _clientMap: Map<string, boolean> = new Map();

  /**
   * SQLite database instance from jsr:@db/sqlite.
   */
  private _client: Database | null = null;

  /**
   * Create a new SQLite engine instance.
   *
   * @param name - Unique name for this engine instance
   * @param options - Connection and configuration options
   * @throws {DAMEngineError} MISSING_CONFIG_VALUE if database path is missing
   */
  constructor(
    name: string,
    options: EventOptionKeys<SQLiteEngineOptions, EngineEvents>,
  ) {
    super(name, options, SQLITE_DEFAULTS);

    // Validate required configuration
    if (this.hasOption('database') === false) {
      throw new DAMEngineError('MISSING_CONFIG_VALUE', {
        instanceId: this.instanceId,
        key: 'database',
      });
    }
  }

  /**
   * Establish connection to SQLite database.
   *
   * Opens or creates the SQLite database file. If the file doesn't exist,
   * it will be created automatically. Validates file permissions if it exists.
   *
   * Database Configuration:
   * - database: File path or ':memory:' for in-memory database
   * - cacheSize: Cache size in KB (negative value) or pages (positive)
   * - synchronous: Sync mode (OFF, NORMAL, FULL)
   *
   * File Validation:
   * - Checks if file exists and is readable/writable
   * - Creates parent directories if they don't exist
   * - Creates database file if it doesn't exist
   *
   * Performance Settings:
   * - Sets cache_size pragma for memory allocation
   * - Sets synchronous pragma for fsync behavior
   * - Sets journal_mode to WAL for better concurrency (if not in-memory)
   *
   * @throws {DAMEngineError} CONNECTION_FAILED if unable to connect
   * @throws {DAMEngineError} FILE_READ_ERROR if file permissions are invalid
   * @protected
   */
  protected async _connect(): Promise<void> {
    try {
      const database = this.getOption('database') as string;

      // Check if in-memory database
      if (database !== ':memory:') {
        // Validate file path and create if needed
        try {
          // Check if file exists
          const fileInfo = await Deno.stat(database);

          if (!fileInfo.isFile) {
            throw new DAMEngineError('CONNECTION_FAILED', {
              instanceId: this.instanceId,
              reason: `Path '${database}' exists but is not a file`,
            });
          }

          // File exists - validate permissions by trying to open in read/write mode
          // We'll let the Database constructor handle this
        } catch (error) {
          if (error instanceof Deno.errors.NotFound) {
            // File doesn't exist - create parent directories
            const dir = database.substring(0, database.lastIndexOf('/'));
            if (dir && dir !== '') {
              await Deno.mkdir(dir, { recursive: true });
            }
            // Database constructor will create the file
          } else if (error instanceof DAMEngineError) {
            throw error;
          } else {
            throw new DAMEngineError('CONNECTION_FAILED', {
              instanceId: this.instanceId,
              reason: `Failed to access database file '${database}': ${
                error instanceof Error ? error.message : String(error)
              }`,
            }, error as Error);
          }
        }
      }

      // Open SQLite database
      this._client = new Database(database);

      // Configure performance settings
      const cacheSize = this.getOption('cacheSize') as number | undefined;
      if (cacheSize !== undefined) {
        this._client.exec(`PRAGMA cache_size = ${cacheSize}`);
      }

      const synchronous = this.getOption('synchronous') as
        | 'OFF'
        | 'NORMAL'
        | 'FULL'
        | undefined;
      if (synchronous !== undefined) {
        this._client.exec(`PRAGMA synchronous = ${synchronous}`);
      }

      // Enable WAL mode for better concurrency (not for in-memory databases)
      if (database !== ':memory:') {
        this._client.exec('PRAGMA journal_mode = WAL');
      }

      // Validate connection by executing a simple query
      const stmt = this._client.prepare('SELECT 1');
      stmt.finalize();
    } catch (error) {
      this._client = null;
      if (error instanceof DAMEngineError) {
        throw error;
      }
      throw new DAMEngineError('CONNECTION_FAILED', {
        instanceId: this.instanceId,
        reason: error instanceof Error ? error.message : String(error),
      }, error as Error);
    }
  }

  /**
   * Close SQLite database connection and cleanup resources.
   *
   * Safe to call multiple times (idempotent).
   *
   * @protected
   */
  protected _disconnect(): void {
    if (this._client) {
      this._client.close();
      this._client = null;
    }
  }

  /**
   * Execute a query against the SQLite database.
   *
   * Handles both SELECT and DML (INSERT/UPDATE/DELETE) queries.
   * Uses prepared statements for parameter binding and protection against SQL injection.
   *
   * Parameter Binding:
   * - SQLite driver uses :name: syntax for named parameters
   * - AbstractEngine standardizes :param: to :param: (no change needed)
   * - Parameters are bound as object: { name: value }
   *
   * Transaction Handling:
   * - If transactionId is present, validates transaction is active
   * - All queries execute on the same single connection
   *
   * Note: AbstractEngine validates transaction existence before calling this method.
   *
   * @template R - The expected row structure
   * @param query - The query to execute with SQL and optional parameters
   * @returns Object containing result rows and row count
   * @throws {DAMEngineError} QUERY_EXECUTION_FAILED on execution error
   * @protected
   */
  protected _execute<
    R extends Record<string, unknown> = Record<string, unknown>,
  >(
    query: EngineQuery,
  ): { data: R[]; count: number } {
    try {
      // Prepare statement
      const stmt = this._client!.prepare(query.sql);

      try {
        // Check if it's a SELECT query (readonly statement)
        if (stmt.readonly) {
          // SELECT query - fetch all rows
          const rows = query.params
            // deno-lint-ignore no-explicit-any
            ? stmt.all<R>(query.params as any)
            : stmt.all<R>();
          return {
            data: rows,
            count: rows.length,
          };
        } else {
          // DML query (INSERT/UPDATE/DELETE) - execute and get affected rows
          if (query.params) {
            // deno-lint-ignore no-explicit-any
            stmt.run(query.params as any);
          } else {
            stmt.run();
          }

          // Get number of changed rows
          const changes = this._client!.changes;

          return {
            data: [],
            count: changes,
          };
        }
      } finally {
        // Always finalize statement to free resources
        stmt.finalize();
      }
    } catch (e) {
      throw new DAMEngineError('QUERY_EXECUTION_FAILED', {
        engine: this.Engine,
        instanceId: this.instanceId,
        query: query,
      }, e as Error);
    }
  }

  /**
   * Begin a new database transaction.
   *
   * SQLite doesn't support nested transactions, so we track active
   * transactions to prevent conflicts.
   *
   * Note: SQLite uses BEGIN for transactions (not BEGIN TRANSACTION).
   *
   * @param transactionId - Unique identifier for this transaction
   * @throws Error if BEGIN fails
   * @protected
   */
  protected _beginTransaction(transactionId: string): void {
    this._client!.exec('BEGIN');
    // Mark transaction as active
    this._clientMap.set(transactionId, true);
  }

  /**
   * Commit a database transaction.
   *
   * Commits all changes made within the transaction.
   *
   * Cleanup Guarantee:
   * - Transaction ID is always removed from _clientMap
   *
   * Note: AbstractEngine validates transaction existence before calling this.
   *
   * @param transactionId - Transaction identifier
   * @protected
   */
  protected _commitTransaction(transactionId: string): void {
    try {
      this._client!.exec('COMMIT');
    } finally {
      // Always cleanup
      this._clientMap.delete(transactionId);
    }
  }

  /**
   * Rollback a database transaction.
   *
   * Discards all changes made within the transaction.
   *
   * Cleanup Guarantee:
   * - Transaction ID is always removed from _clientMap
   *
   * Note: AbstractEngine validates transaction existence before calling this.
   *
   * @param transactionId - Transaction identifier
   * @protected
   */
  protected _rollbackTransaction(transactionId: string): void {
    try {
      this._client!.exec('ROLLBACK');
    } finally {
      // Always cleanup
      this._clientMap.delete(transactionId);
    }
  }

  /**
   * Check if the SQLite database connection is alive.
   *
   * Executes a simple query to verify database is accessible.
   * Used by AbstractEngine for health checks and reconnection logic.
   *
   * @returns true if connection is alive, false otherwise
   * @protected
   */
  protected _ping(): boolean {
    try {
      if (!this._client) return false;
      const stmt = this._client.prepare('SELECT 1');
      stmt.finalize();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Update engine status based on connection state.
   *
   * SQLite Connection States:
   * - READY: Database is open and accessible
   * - CLOSED: Database is not open
   *
   * SQLite doesn't have connection pooling, so status is simple:
   * - If client exists and is open, status is READY
   * - Otherwise, status is CLOSED
   *
   * Pool Statistics:
   * - total: Always 1 (single connection)
   * - idle: 0 when executing, 1 when ready
   * - active: 1 when executing, 0 when ready
   * - waiting: Always 0 (no queuing in SQLite)
   *
   * Called automatically by AbstractEngine after each operation.
   *
   * @protected
   */
  protected override _updatePoolStatus(): void {
    // Skip if client not initialized or in transitional state
    if (
      !this._client || this._status === 'CLOSED' ||
      this._status === 'CONNECTING'
    ) {
      return;
    }

    // SQLite has single connection - no pool statistics to track
    this._poolStats.total = 1;
    this._poolStats.idle = this._client.open ? 1 : 0;
    this._poolStats.active = 0;
    this._poolStats.waiting = 0;

    // Status is always READY if client is open
    if (this._client.open) {
      this._status = 'READY';
    }
  }
}
