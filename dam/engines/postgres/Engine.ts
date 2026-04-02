import { type ClientOptions, Pool, PoolClient } from 'jsr:@db/postgres@^0.19.5';
import type { EventOptionKeys } from '@tundralibs/utils';
import {
  AbstractEngine,
  DAMEngineError,
  EngineCapabilities,
  EngineEvents,
  EngineQuery,
} from '../../engine/mod.ts';
import { PostgresEngineOptions } from './types/mod.ts';

/**
 * Default configuration values for PostgreSQL connections.
 */
const POSTGRES_DEFAULTS: Partial<PostgresEngineOptions> = {
  port: 5432,
};

/**
 * PostgreSQL database engine implementation using Deno's native @db/postgres driver.
 *
 * Features:
 * - Connection pooling with configurable pool size
 * - Transaction support with isolated clients
 * - Prepared statement support
 * - Real-time pool status tracking (READY/WAITING states)
 * - Automatic connection validation
 *
 * Driver: jsr:@db/postgres@^0.19.5 (Deno-native, optimized performance)
 *
 * @example
 * ```typescript
 * const engine = new PostgresEngine('mydb', {
 *   host: 'localhost',
 *   port: 5432,
 *   database: 'myapp',
 *   username: 'user',
 *   password: 'pass'
 * });
 * await engine.connect();
 * const result = await engine.execute({ sql: 'SELECT * FROM users' });
 * ```
 */
export class PostgresEngine extends AbstractEngine<PostgresEngineOptions> {
  /** Engine type identifier */
  public readonly Engine = 'POSTGRES';

  /** Supported capabilities of this engine */
  public readonly Capabilities: EngineCapabilities = {
    transactions: true,
    pooledConnections: true,
    preparedStatements: true,
    parameterReplacement: {
      prefix: '$',
      suffix: '',
    },
  };

  /**
   * Map of transaction IDs to their dedicated pool clients.
   * Each transaction gets an isolated client that persists until commit/rollback.
   */
  protected _clientMap: Map<string, PoolClient> = new Map();

  /**
   * PostgreSQL connection pool instance.
   * Manages a pool of reusable database connections.
   */
  private _client: Pool | null = null;

  /**
   * Create a new PostgreSQL engine instance.
   *
   * @param name - Unique name for this engine instance
   * @param options - Connection and configuration options
   * @throws {DAMEngineError} MISSING_CONFIG_VALUE if required options are missing
   */
  constructor(
    name: string,
    options: EventOptionKeys<PostgresEngineOptions, EngineEvents>,
  ) {
    super(name, options, POSTGRES_DEFAULTS);

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
   * Establish connection pool to PostgreSQL database.
   *
   * Creates a connection pool with the configured options and validates
   * connectivity by executing a test query.
   *
   * Pool Configuration:
   * - Size: 10 connections (fixed)
   * - Lazy: true (connections created on demand)
   * - Single connection attempt (no retries)
   *
   * TLS/SSL Support:
   * - enabled: true if ssl option is provided (boolean true or object)
   * - enforce: true if ssl is boolean true or ssl.rejectUnauthorized is not false
   * - caCertificates: Loaded from ssl.ca file path
   *
   * @throws {DAMEngineError} CONNECTION_FAILED if unable to connect
   * @protected
   */
  protected async _connect(): Promise<void> {
    try {
      // Build connection configuration
      const config: ClientOptions = {
        hostname: this.getOption('host'),
        port: this.getOption('port') || 5432,
        database: this.getOption('database'),
        user: this.getOption('username'),
        password: this.getOption('password'),
        applicationName: this.Name,
        connection: {
          attempts: 1, // Single attempt, fail fast
        },
      };

      // Configure TLS/SSL if enabled
      const ssl = this.getOption('ssl');
      if (ssl) {
        if (typeof ssl === 'boolean' && ssl === true) {
          // Simple SSL mode - enforce TLS
          config.tls = {
            enabled: true,
            enforce: true,
          };
        } else if (typeof ssl === 'object') {
          // Advanced SSL configuration
          config.tls = {
            enabled: true,
            enforce: ssl.rejectUnauthorized !== false, // Default to true unless explicitly false
            caCertificates: this._sslCaCertificate
              ? [this._sslCaCertificate]
              : undefined,
          };
        }
      }

      // Create connection pool with configurable size
      const poolSize = this.getOption('pool')?.max || 10;
      this._client = new Pool(config, poolSize, true);

      // Validate pool by acquiring and testing a connection
      const testClient = await this._client.connect();
      await testClient.queryArray('SELECT 1');
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
   * Execute a query against the PostgreSQL database.
   *
   * Handles both transactional and non-transactional queries:
   * - Transactional: Uses the dedicated client from _clientMap
   * - Non-transactional: Acquires a client from pool, then releases it
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
    let client: PoolClient | null = null;
    const isTransactional = !!query.transactionId;

    try {
      if (isTransactional && query.transactionId) {
        // Use the dedicated transaction client (validated by AbstractEngine)
        client = this._clientMap.get(query.transactionId)!;
      } else {
        // Acquire a new client from the pool for this query
        client = await this._client!.connect();
      }

      // Execute the query and return structured results
      const result = await client.queryObject<R>(query.sql, query.params);

      return {
        data: result.rows,
        count: result.rowCount || result.rows.length || 0,
      };
    } catch (e) {
      throw new DAMEngineError('QUERY_EXECUTION_FAILED', {
        engine: this.Engine,
        instanceId: this.instanceId,
        query: query,
      }, e as Error);
    } finally {
      // Release client back to pool (only for non-transaction queries)
      if (client && !isTransactional) {
        client.release();
      }
    }
  }

  /**
   * Begin a new database transaction.
   *
   * Acquires a dedicated client from the pool and starts a transaction.
   * The client is stored in _clientMap and will be reused for all queries
   * within this transaction until commit or rollback.
   *
   * Error Handling:
   * - If BEGIN fails, the client is released back to the pool
   * - Exception is re-thrown for AbstractEngine to handle
   *
   * @param transactionId - Unique identifier for this transaction
   * @throws Error if BEGIN TRANSACTION fails
   * @protected
   */
  protected async _beginTransaction(transactionId: string): Promise<void> {
    const client = await this._client!.connect();
    try {
      await client.queryArray('BEGIN TRANSACTION;');
      // Store client for subsequent transaction queries
      this._clientMap.set(transactionId, client);
    } catch (e) {
      // Release client if BEGIN fails (no transaction started)
      client.release();
      throw e;
    }
  }

  /**
   * Commit a database transaction.
   *
   * Commits all changes made within the transaction and releases
   * the dedicated client back to the pool.
   *
   * Cleanup Guarantee:
   * - Client is always released (even if COMMIT fails)
   * - Transaction ID is always removed from _clientMap
   *
   * Note: AbstractEngine validates transaction existence before calling this.
   *
   * @param transactionId - Transaction identifier
   * @protected
   */
  protected async _commitTransaction(transactionId: string): Promise<void> {
    // Get the dedicated transaction client (validated by AbstractEngine)
    const client = this._clientMap.get(transactionId)!;

    try {
      await client.queryArray('COMMIT;');
    } finally {
      // Always cleanup, even if COMMIT fails
      client.release();
      this._clientMap.delete(transactionId);
    }
  }

  /**
   * Rollback a database transaction.
   *
   * Discards all changes made within the transaction and releases
   * the dedicated client back to the pool.
   *
   * Cleanup Guarantee:
   * - Client is always released (even if ROLLBACK fails)
   * - Transaction ID is always removed from _clientMap
   *
   * Note: AbstractEngine validates transaction existence before calling this.
   *
   * @param transactionId - Transaction identifier
   * @protected
   */
  protected async _rollbackTransaction(transactionId: string): Promise<void> {
    // Get the dedicated transaction client (validated by AbstractEngine)
    const client = this._clientMap.get(transactionId)!;

    try {
      await client.queryArray('ROLLBACK;');
    } finally {
      // Always cleanup, even if ROLLBACK fails
      client.release();
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
   * - READY → WAITING: When pool is exhausted (idle === 0) and status is READY
   * - WAITING → READY: When pool has capacity (idle > 0)
   *
   * Pool Statistics Updated:
   * - total: Maximum pool size
   * - idle: Available connections
   * - active: Currently in-use connections (calculated)
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

    // Update pool statistics from driver
    this._poolStats.total = this._client.size;
    this._poolStats.idle = this._client.available;
    this._poolStats.active = this._poolStats.total - this._poolStats.idle;

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
