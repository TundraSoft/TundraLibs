/// <reference types="npm:@types/node" />
import { createPool, type Pool, type PoolConnection } from '$maria';
import type { EventOptionKeys } from '@tundralibs/utils';
import {
  AbstractEngine,
  DAMEngineError,
  EngineCapabilities,
  EngineEvents,
  EngineQuery,
} from '../../engine/mod.ts';
import { MariaEngineOptions } from './types/mod.ts';

/**
 * Default configuration values for MariaDB connections.
 */
const MARIA_DEFAULTS: Partial<MariaEngineOptions> = {
  port: 3306,
};

/**
 * MariaDB database engine implementation using npm's mariadb driver.
 *
 * Features:
 * - Connection pooling with configurable pool size and idle timeout
 * - Transaction support with isolated clients
 * - Named placeholder support (:name:)
 * - Proper type casting for BIGINT, DECIMAL, and other numeric types
 * - Real-time pool status tracking (READY/WAITING states)
 * - Automatic connection validation
 * - Zero-configuration SSL support
 *
 * Driver: npm:mariadb@^3.4.0 (high-performance, TypeScript-ready)
 *
 * @example
 * ```typescript
 * const engine = new MariaEngine('mydb', {
 *   host: 'localhost',
 *   port: 3306,
 *   database: 'myapp',
 *   username: 'user',
 *   password: 'pass',
 *   pool: { max: 20, min: 2 }
 * });
 * await engine.connect();
 * const result = await engine.execute({
 *   sql: 'SELECT * FROM users WHERE id = :id:',
 *   params: { id: 1 }
 * });
 * ```
 */
export class MariaEngine extends AbstractEngine<MariaEngineOptions> {
  /** Engine type identifier */
  public readonly Engine = 'MARIA';

  /** Supported capabilities of this engine */
  public readonly Capabilities: EngineCapabilities = {
    transactions: true,
    pooledConnections: true,
    preparedStatements: true,
    parameterReplacement: {
      prefix: ':',
      suffix: '',
    },
  };

  /**
   * Map of transaction IDs to their dedicated pool connections.
   * Each transaction gets an isolated connection that persists until commit/rollback.
   */
  protected _clientMap: Map<string, PoolConnection> = new Map();

  /**
   * MariaDB connection pool instance from npm mariadb driver.
   * Manages a pool of reusable database connections.
   */
  private _client: Pool | null = null;

  /**
   * Create a new MariaDB engine instance.
   *
   * @param name - Unique name for this engine instance
   * @param options - Connection and configuration options
   * @throws {DAMEngineError} MISSING_CONFIG_VALUE if required options are missing
   */
  constructor(
    name: string,
    options: EventOptionKeys<MariaEngineOptions, EngineEvents>,
  ) {
    super(name, options, MARIA_DEFAULTS);

    // Validate required configuration
    if (this.hasOption('database') === false) {
      throw new DAMEngineError('MISSING_CONFIG_VALUE', {
        instanceId: this.instanceId,
        key: 'database',
      });
    }
    if (this.hasOption('username') === false) {
      throw new DAMEngineError('MISSING_CONFIG_VALUE', {
        instanceId: this.instanceId,
        key: 'username',
      });
    }
  }

  /**
   * Establish connection pool to MariaDB database.
   *
   * Creates a connection pool with the configured options and validates
   * connectivity by executing a test query.
   *
   * Pool Configuration:
   * - connectionLimit: Maximum pool size (default: 10)
   * - minDelayValidation: Minimum delay before revalidating idle connections (default: 500ms)
   * - connectionTimeout: Connection timeout (default: 10 seconds)
   * - idleTimeout: Idle timeout based on idleTimeoutSeconds option
   *
   * SSL/TLS Support (npm mariadb):
   * - ssl: boolean true enables SSL with default verification
   * - ssl: object allows custom CA, client cert/key, and rejectUnauthorized control
   * - Loaded certificate contents from file paths are used
   *
   * Named Placeholders:
   * - Enabled by default to support :name: syntax
   *
   * Type Casting:
   * - supportBigInt: true (returns BigInt for BIGINT columns with values > 2^53)
   * - decimalAsNumber: false (returns DECIMAL as string for precision)
   *
   * @throws {DAMEngineError} CONNECTION_FAILED if unable to connect
   * @protected
   */
  protected async _connect(): Promise<void> {
    try {
      // Build base connection configuration
      const config: Record<string, unknown> = {
        host: this.getOption('host'),
        port: this.getOption('port') || 3306,
        database: this.getOption('database'),
        user: this.getOption('username'),
        password: this.getOption('password'),
        connectionLimit: this.getOption('pool')?.max || 10,
        minDelayValidation: 500, // Validate idle connections after 500ms
        connectionTimeout: 10 * 1000,
        idleTimeout: ((this.getOption('idleTimeoutSeconds') as number) || 30) *
          1000,
        namedPlaceholders: true, // Enable :name: syntax
        supportBigInt: true, // Return BigInt for large integers
        decimalAsNumber: true, // Keep decimals as strings for precision
      };

      // Configure SSL/TLS if enabled
      const ssl = this.getOption('ssl');
      if (ssl) {
        if (typeof ssl === 'boolean' && ssl === true) {
          // Simple SSL mode - enable with default verification
          config.ssl = true;
        } else if (typeof ssl === 'object') {
          // Advanced SSL configuration with loaded certificates
          config.ssl = {
            rejectUnauthorized: ssl.rejectUnauthorized !== false, // Default to true
            ca: this._sslCaCertificate,
            cert: this._sslClientCertificate,
            key: this._sslClientKey,
          };
        }
      }

      // Create connection pool
      this._client = createPool(config as Parameters<typeof createPool>[0]);

      // Validate pool by acquiring and testing a connection
      const testClient = await this._client.getConnection();
      await testClient.query('SELECT 1');
      testClient.release();
    } catch (error) {
      this._client = null;
      throw new DAMEngineError('CONNECTION_FAILED', {
        instanceId: this.instanceId,
        reason: error instanceof Error ? error.message : String(error),
      }, error as Error);
    }
  }

  /**
   * Close all connections in the pool and cleanup resources.
   *
   * Terminates all active and idle connections in the pool.
   * Safe to call multiple times (idempotent).
   *
   * @protected
   */
  protected async _disconnect(): Promise<void> {
    if (this._client) {
      await this._client.end();
      this._client = null;
    }
  }

  /**
   * Execute a query against the MariaDB database.
   *
   * Handles both transactional and non-transactional queries:
   * - Transactional: Uses the dedicated connection from _clientMap
   * - Non-transactional: Acquires a connection from pool, then releases it
   *
   * Named Placeholders:
   * - MariaDB driver natively supports :name: syntax when namedPlaceholders is enabled
   * - Parameters are passed as an object matching placeholder names
   *
   * Note: AbstractEngine validates transaction existence before calling this method.
   *
   * @template R - The expected row structure
   * @param query - The query to execute with SQL and optional parameters
   * @returns Object containing result rows and row count
   * @throws {DAMEngineError} QUERY_EXECUTION_FAILED on execution error
   * @protected
   */
  protected async _execute<
    R extends Record<string, unknown> = Record<string, unknown>,
  >(
    query: EngineQuery,
  ): Promise<{ data: R[]; count: number }> {
    let conn: PoolConnection;

    if (query.transactionId) {
      // Use the dedicated transaction connection (validated by AbstractEngine)
      conn = this._clientMap.get(query.transactionId)!;
    } else {
      // Acquire a new connection from the pool for this query
      conn = await this._client!.getConnection();
    }
    try {
      // Execute the query with named placeholders
      // MariaDB driver expects parameters as object when namedPlaceholders is enabled
      const result = await conn.query<R[]>({
        namedPlaceholders: true,
        sql: query.sql,
      }, query.params || {});

      // Handle different result types
      if (Array.isArray(result)) {
        // SELECT query - returns array of rows
        return {
          data: result,
          count: result.length,
        };
      } else {
        // INSERT/UPDATE/DELETE - returns result object
        return {
          data: [],
          count: (result as { affectedRows?: number }).affectedRows || 0,
        };
      }
    } catch (e) {
      throw new DAMEngineError('QUERY_EXECUTION_FAILED', {
        engine: this.Engine,
        instanceId: this.instanceId,
        query: query,
      }, e as Error);
    } finally {
      if (conn && !query.transactionId) {
        // Ensure non-transaction connections are released on error
        conn.release();
      }
    }
  }

  /**
   * Begin a new database transaction.
   *
   * Acquires a dedicated connection from the pool and starts a transaction.
   * The connection is stored in _clientMap and will be reused for all queries
   * within this transaction until commit or rollback.
   *
   * Error Handling:
   * - If BEGIN fails, the connection is released back to the pool
   * - Exception is re-thrown for AbstractEngine to handle
   *
   * @param transactionId - Unique identifier for this transaction
   * @throws Error if BEGIN TRANSACTION fails
   * @protected
   */
  protected async _beginTransaction(transactionId: string): Promise<void> {
    const conn = await this._client!.getConnection();
    try {
      await conn.beginTransaction();
      // Store connection for subsequent transaction queries
      this._clientMap.set(transactionId, conn);
    } catch (e) {
      // Release connection if BEGIN fails (no transaction started)
      conn.release();
      throw e;
    }
  }

  /**
   * Commit a database transaction.
   *
   * Commits all changes made within the transaction and releases
   * the dedicated connection back to the pool.
   *
   * Cleanup Guarantee:
   * - Connection is always released (even if COMMIT fails)
   * - Transaction ID is always removed from _clientMap
   *
   * Note: AbstractEngine validates transaction existence before calling this.
   *
   * @param transactionId - Transaction identifier
   * @protected
   */
  protected async _commitTransaction(transactionId: string): Promise<void> {
    // Get the dedicated transaction connection (validated by AbstractEngine)
    const conn = this._clientMap.get(transactionId)!;

    try {
      await conn.commit();
    } finally {
      // Always cleanup, even if COMMIT fails
      conn.release();
      this._clientMap.delete(transactionId);
    }
  }

  /**
   * Rollback a database transaction.
   *
   * Discards all changes made within the transaction and releases
   * the dedicated connection back to the pool.
   *
   * Cleanup Guarantee:
   * - Connection is always released (even if ROLLBACK fails)
   * - Transaction ID is always removed from _clientMap
   *
   * Note: AbstractEngine validates transaction existence before calling this.
   *
   * @param transactionId - Transaction identifier
   * @protected
   */
  protected async _rollbackTransaction(transactionId: string): Promise<void> {
    // Get the dedicated transaction connection (validated by AbstractEngine)
    const conn = this._clientMap.get(transactionId)!;

    try {
      await conn.rollback();
    } finally {
      // Always cleanup, even if ROLLBACK fails
      conn.release();
      this._clientMap.delete(transactionId);
    }
  }

  /**
   * Check if the database connection is alive.
   *
   * Executes a simple query to verify connectivity.
   * Used by AbstractEngine for health checks and reconnection logic.
   *
   * @returns true if connection is alive, false otherwise
   * @protected
   */
  protected async _ping(): Promise<boolean> {
    try {
      await this.execute({ sql: 'SELECT 1' });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Update engine status and pool statistics based on real-time pool availability.
   *
   * Status Transitions:
   * - READY → WAITING: When pool is exhausted (idleConnections === 0) and status is READY
   * - WAITING → READY: When pool has capacity (idleConnections > 0)
   *
   * Pool Statistics Updated:
   * - total: Maximum pool size (totalConnections from mariadb)
   * - idle: Available connections (idleConnections from mariadb)
   * - active: Currently in-use connections (activeConnections from mariadb)
   * - waiting: Queries waiting for connections (taskQueueSize from mariadb)
   *
   * Guard Conditions:
   * - Skips update if pool is not initialized
   * - Skips update during CLOSED or CONNECTING states
   *
   * Called automatically by AbstractEngine after each operation.
   *
   * @protected
   */
  protected override _updatePoolStatus(): void {
    // Skip if pool not initialized or in transitional state
    if (
      !this._client || this._status === 'CLOSED' ||
      this._status === 'CONNECTING'
    ) {
      return;
    }

    // Update pool statistics from mariadb driver
    this._poolStats.total = this._client.totalConnections();
    this._poolStats.idle = this._client.idleConnections();
    this._poolStats.active = this._client.activeConnections();

    // Update status based on pool availability
    if (this._poolStats.idle === 0 && this._status === 'READY') {
      // Pool exhausted - transition to WAITING
      this._status = 'WAITING';
    } else {
      // Pool has capacity - ensure status is READY
      this._status = 'READY';
    }
  }
}
