import { Pool, types as PostgresTypes } from 'npm:pg@^8.16.3';
import type { PoolClient } from 'npm:@types/pg@^8.6.6';
import type { EventOptionKeys } from '../../../utils/mod.ts';
import {
  AbstractEngine,
  DAMEngineError,
  EngineCapabilities,
  EngineEvents,
  EngineQuery,
} from '../../engine/mod.ts';
import { Postgres2EngineOptions } from './types/mod.ts';

/**
 * Default configuration values for PostgreSQL connections.
 */
const POSTGRES_DEFAULTS: Partial<Postgres2EngineOptions> = {
  port: 5432,
};

/**
 * Configure PostgreSQL type parsing to return proper JavaScript types.
 *
 * Type mappings:
 * - INT2, INT4 → number
 * - INT8 → number (or BigInt if exceeds MAX_SAFE_INTEGER)
 * - FLOAT4, FLOAT8, NUMERIC → number
 * - BOOL → boolean
 */
// Integer types (return as number, except for BIGINT which returns BigInt if > MAX_SAFE_INTEGER)
PostgresTypes.setTypeParser(
  PostgresTypes.builtins.INT2,
  (val: string) => Number.parseInt(val, 10),
); // smallint -> number
PostgresTypes.setTypeParser(
  PostgresTypes.builtins.INT4,
  (val: string) => Number.parseInt(val, 10),
); // integer -> number
PostgresTypes.setTypeParser(PostgresTypes.builtins.INT8, (val: string) => { // bigint -> number or BigInt
  const num = Number.parseInt(val, 10);
  return num > Number.MAX_SAFE_INTEGER || num < Number.MIN_SAFE_INTEGER
    ? BigInt(val)
    : num;
});

// Floating point types (return as number)
PostgresTypes.setTypeParser(
  PostgresTypes.builtins.FLOAT4,
  (val: string) => Number.parseFloat(val),
); // real -> number
PostgresTypes.setTypeParser(
  PostgresTypes.builtins.FLOAT8,
  (val: string) => Number.parseFloat(val),
); // double precision -> number
PostgresTypes.setTypeParser(
  PostgresTypes.builtins.NUMERIC,
  (val: string) => Number.parseFloat(val),
); // numeric/decimal -> number

// Boolean type (return as boolean)
PostgresTypes.setTypeParser(
  PostgresTypes.builtins.BOOL,
  (val: string) => val === 't',
); // boolean -> boolean

/**
 * PostgreSQL database engine implementation using npm's pg driver.
 *
 * Features:
 * - Connection pooling with configurable pool size and idle timeout
 * - Transaction support with isolated clients
 * - Prepared statement support with parameter replacement (:name:)
 * - Custom type parsing (integers, floats, booleans)
 * - Real-time pool status tracking (READY/WAITING states)
 * - Automatic connection validation
 *
 * Driver: npm:pg (battle-tested, Node.js compatible via npm specifiers)
 *
 * @example
 * ```typescript
 * const engine = new PostgresEngine('mydb', {
 *   host: 'localhost',
 *   port: 5432,
 *   database: 'myapp',
 *   username: 'user',
 *   password: 'pass',
 *   pool: { max: 20, min: 2 }
 * });
 * await engine.connect();
 * const result = await engine.execute({ sql: 'SELECT * FROM users WHERE id = :id:', params: { id: 1 } });
 * ```
 */
export class PostgresEngine2 extends AbstractEngine<Postgres2EngineOptions> {
  /** Engine type identifier */
  public readonly Engine = 'POSTGRES2';

  /** Supported capabilities of this engine */
  public readonly Capabilities: EngineCapabilities = {
    transactions: true,
    pooledConnections: true,
    preparedStatements: true,
    parameterReplacement: {
      prefix: ':',
      suffix: ':',
    },
  };

  /**
   * Map of transaction IDs to their dedicated pool clients.
   * Each transaction gets an isolated client that persists until commit/rollback.
   */
  protected _clientMap: Map<string, PoolClient> = new Map();

  /**
   * PostgreSQL connection pool instance from npm pg driver.
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
    options: EventOptionKeys<Postgres2EngineOptions, EngineEvents>,
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
   * - max: Maximum pool size (default: 10)
   * - min: Minimum pool size (default: 1)
   * - idleTimeoutMillis: Idle timeout (default: 30 seconds)
   * - connectionTimeoutMillis: Connection timeout (default: 10 seconds)
   * - allowExitOnIdle: true (allows process to exit when all connections idle)
   *
   * SSL/TLS Support (npm pg):
   * - ssl: boolean true enables SSL with default verification
   * - ssl: object allows custom CA, client cert/key, and rejectUnauthorized control
   * - Loaded certificate contents from file paths are used
   *
   * @throws {DAMEngineError} CONNECTION_FAILED if unable to connect
   * @protected
   */
  protected async _connect(): Promise<void> {
    try {
      // Build base connection configuration
      const config: Record<string, unknown> = {
        host: this.getOption('host'),
        port: this.getOption('port') || 5432,
        database: this.getOption('database'),
        user: this.getOption('username'),
        password: this.getOption('password'),
        application_name: this.Name,
        connectionTimeoutMillis: 10 * 1000,
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
      } else {
        config.ssl = false;
      }

      // Merge with pool options
      const poolOptions = this.getOption('pool');
      this._client = new Pool({
        ...config,
        max: poolOptions?.max || 10,
        min: poolOptions?.min || 1,
        idleTimeoutMillis: ((this.getOption('idleTimeoutSeconds') as number) ||
          30) * 1000,
        allowExitOnIdle: true,
      });

      // Validate pool by acquiring and testing a connection
      const testClient = await this._client.connect();
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

  protected async _execute<
    R extends Record<string, unknown> = Record<string, unknown>,
  >(
    query: EngineQuery,
  ): Promise<{ data: R[]; count: number }> {
    let client: PoolClient | undefined;
    try {
      // Get transaction client or acquire new one from pool
      // AbstractEngine validates transaction exists if transactionId is provided
      client = (query.transactionId
        ? this._clientMap.get(query.transactionId)!
        : await this._client?.connect()) as PoolClient;
      // Map parameters
      let sql = query.sql;
      const params: unknown[] = [];
      if (query.params && Object.keys(query.params).length > 0) {
        Object.entries(query.params).forEach(([key, value], index) => {
          const paramPlaceholder = `:${key}:`;
          const pgPlaceholder = `$${index + 1}`;
          sql = sql.replaceAll(paramPlaceholder, pgPlaceholder);
          params.push(value);
        });
      }
      const result = await client.query<R>(sql, params);
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
      // Always release non-transaction clients
      if (client && !query.transactionId) {
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
      await client.query('BEGIN TRANSACTION;');
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
      await client.query('COMMIT;');
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
      await client.query('ROLLBACK;');
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
   * - READY → WAITING: When pool is exhausted (idleCount === 0) and status is READY
   * - WAITING → READY: When pool has capacity (idleCount > 0)
   *
   * Pool Statistics Updated:
   * - total: Maximum pool size (totalCount from npm pg)
   * - idle: Available connections (idleCount from npm pg)
   * - active: Currently in-use connections (calculated)
   * - waiting: Queries waiting for connections (waitingCount from npm pg)
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

    // Update pool statistics from npm pg driver
    this._poolStats.total = this._client.totalCount;
    this._poolStats.idle = this._client.idleCount;
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
