/**
 * PostgreSQL Database Engine Implementation
 *
 * This module provides a concrete implementation of the AbstractEngine for PostgreSQL databases.
 * It uses the npm:pg library with built-in connection pooling and comprehensive error handling.
 *
 * @example
 * ```typescript
 * import { PostgreSQLEngine } from './PostgreSQLEngine.ts';
 *
 * const engine = new PostgreSQLEngine('postgres-main', {
 *   host: 'localhost',
 *   port: 5432,
 *   database: 'myapp',
 *   username: 'postgres',
 *   password: 'password',
 *   pool: { max: 20, min: 5 }
 * });
 *
 * await engine.connect();
 * const result = await engine.execute({ sql: 'SELECT NOW() as current_time' });
 * console.log(result.data[0].current_time);
 * ```
 */

import { Pool, types } from '$pg';
import type { PoolClient, QueryResult } from '$pg_types';
import { type EventOptionKeys } from '@tundralibs/utils';
import { AbstractEngine } from '../../engine/AbstractEngine.ts';
import { DAMEngineError } from '../../engine/errors/mod.ts';
import type {
  EngineEvents,
  EngineQuery,
  EngineTransactionOptions,
} from '../../engine/types/mod.ts';
import type { PostgreSQLEngineOptions } from './types/mod.ts';

/**
 * Configure PostgreSQL type parsing to return proper JavaScript types
 */
// Integer types (return as number, except for BIGINT which returns BigInt if > MAX_SAFE_INTEGER)
types.setTypeParser(types.builtins.INT2, (val: string) => parseInt(val, 10)); // smallint -> number
types.setTypeParser(types.builtins.INT4, (val: string) => parseInt(val, 10)); // integer -> number
types.setTypeParser(types.builtins.INT8, (val: string) => { // bigint -> number or BigInt
  const num = parseInt(val, 10);
  return num > Number.MAX_SAFE_INTEGER || num < Number.MIN_SAFE_INTEGER
    ? BigInt(val)
    : num;
});

// Floating point types (return as number)
types.setTypeParser(types.builtins.FLOAT4, (val: string) => parseFloat(val)); // real -> number
types.setTypeParser(types.builtins.FLOAT8, (val: string) => parseFloat(val)); // double precision -> number
types.setTypeParser(types.builtins.NUMERIC, (val: string) => parseFloat(val)); // numeric/decimal -> number

// Boolean type (return as boolean)
types.setTypeParser(types.builtins.BOOL, (val: string) => val === 't'); // boolean -> boolean

// JSON types (already handled by pg library by default, but ensure proper parsing)
// JSONB and JSON are parsed automatically by pg library

/**
 * Default options for PostgreSQL engine
 * Note: Don't include pool-related options to avoid automatic pooling
 */
const DEFAULT_OPTIONS: Partial<PostgreSQLEngineOptions> = {
  port: 5432,
  ssl: false,
  connectionTimeout: 30,
  queryTimeout: 30,
};

/**
 * PostgreSQL Database Engine
 *
 * Provides a robust PostgreSQL database interface with connection pooling,
 * transaction management, and comprehensive error handling.
 */
export class PostgreSQLEngine extends AbstractEngine<PostgreSQLEngineOptions> {
  public readonly Engine = 'PostgreSQL';

  private _pool: Pool | null = null;
  private _activeTransactions = new Map<string, PoolClient>();
  private _transactionTimeouts = new Map<string, number>();

  constructor(
    id: string,
    options: EventOptionKeys<PostgreSQLEngineOptions, EngineEvents>,
  ) {
    super(id, options, DEFAULT_OPTIONS);
  }

  /**
   * Override query standardization to convert :param: format to PostgreSQL $1,$2 format
   */
  protected override _standardizeQuery(query: EngineQuery): EngineQuery {
    const sql = query.sql.trim().replace(/;$/, '') + ';';

    // Convert :param: format to PostgreSQL $1, $2 format
    const paramNames: string[] = [];
    const pgSql = sql.replace(/:(\w+):/g, (_match, paramName) => {
      let index = paramNames.indexOf(paramName);
      if (index === -1) {
        paramNames.push(paramName);
        index = paramNames.length - 1;
      }
      return `$${index + 1}`;
    });

    // Convert params object to array in the correct order
    const pgParams = paramNames.map((name) => {
      if (query.params && typeof query.params === 'object') {
        // Extract from object by parameter name (only Record format supported)
        return query.params[name];
      }
      return undefined;
    });

    // Return the SQL with indexed params for PostgreSQL
    return {
      sql: pgSql,
      params: pgParams.length > 0 ? pgParams : undefined,
      transactionId: query.transactionId,
    } as EngineQuery;
  }

  /**
   * Override option processing for PostgreSQL-specific validation
   */
  protected override _processOption<K extends keyof PostgreSQLEngineOptions>(
    key: K,
    value: PostgreSQLEngineOptions[K],
  ): PostgreSQLEngineOptions[K] {
    switch (key) {
      case 'host':
        if (!value || (typeof value === 'string' && !value.trim())) {
          throw new DAMEngineError('CONFIG_INVALID', {
            instanceId: this.instanceId,
            name: this.name,
            engine: this.Engine,
            configKey: 'host',
            reason: 'Host is required and cannot be empty',
          });
        }
        break;
      case 'database':
        if (!value || (typeof value === 'string' && !value.trim())) {
          throw new DAMEngineError('CONFIG_INVALID', {
            instanceId: this.instanceId,
            name: this.name,
            engine: this.Engine,
            configKey: 'database',
            reason: 'Database name is required and cannot be empty',
          });
        }
        break;
      case 'username':
        if (!value || (typeof value === 'string' && !value.trim())) {
          throw new DAMEngineError('CONFIG_INVALID', {
            instanceId: this.instanceId,
            name: this.name,
            engine: this.Engine,
            configKey: 'username',
            reason: 'Username is required and cannot be empty',
          });
        }
        break;
      case 'port':
        if (
          value && (typeof value !== 'number' || value < 1 || value > 65535)
        ) {
          throw new DAMEngineError('CONFIG_INVALID', {
            instanceId: this.instanceId,
            name: this.name,
            engine: this.Engine,
            configKey: 'port',
            reason: `Port must be between 1 and 65535, got ${value}`,
          });
        }
        break;
      case 'pool':
        if (value && typeof value === 'object') {
          const poolOptions = value as { max?: number; min?: number };
          if (poolOptions.max && poolOptions.max > 500) {
            throw new DAMEngineError('CONFIG_INVALID', {
              instanceId: this.instanceId,
              name: this.name,
              engine: this.Engine,
              configKey: 'pool.max',
              reason:
                `PostgreSQL pool max connections ${poolOptions.max} exceeds PostgreSQL recommended maximum of 500`,
            });
          }
        }
        break;
    }

    // Call super for engine options that have base validation
    try {
      // deno-lint-ignore no-explicit-any
      return super._processOption(key as any, value);
    } catch {
      // If parent doesn't recognize the key, just return the value
      return value;
    }
  }

  /**
   * Establish connection to PostgreSQL database
   */
  protected async _connect(): Promise<void> {
    try {
      const config = {
        host: this.getOption('host'),
        port: this.getOption('port') || 5432,
        database: this.getOption('database'),
        user: this.getOption('username'),
        password: this.getOption('password'),
        ssl: this.getOption('ssl') || false,
        application_name: this.getOption('applicationName') ||
          `DAM-${this.name}`,

        connectionTimeoutMillis: (this.getOption('connectionTimeout') || 30) *
          1000,
      };

      const poolOptions = this.getOption('pool');
      this._pool = new Pool({
        ...config,
        max: poolOptions?.max || this.getOption('maxConnections') || 10,
        min: poolOptions?.min || this.getOption('minConnections') || 0,
        idleTimeoutMillis:
          ((poolOptions?.idleTimeoutSeconds || this.getOption('idleTimeout')) ||
            30) * 1000,
        connectionTimeoutMillis: ((poolOptions?.maxLifetimeSeconds ||
          this.getOption('acquireTimeout')) || 10) * 1000,
        allowExitOnIdle: poolOptions?.allowExitOnIdle || false,
      });

      // Test the pool connection
      const testClient = await this._pool.connect();
      await testClient.query('SELECT 1');
      testClient.release();

      // Update pool stats
      this._updatePoolStats({
        totalConnections: this._pool.totalCount,
        activeConnections: this._pool.totalCount - this._pool.idleCount,
        idleConnections: this._pool.idleCount,
        waitingRequests: this._pool.waitingCount,
      });
    } catch (error) {
      throw new DAMEngineError('CONNECTION_FAILED', {
        instanceId: this.instanceId,
        name: this.name,
        engine: this.Engine,
        reason: error instanceof Error ? error.message : String(error),
      }, error as Error);
    }
  }

  /**
   * Close PostgreSQL connection(s) and cleanup resources
   */
  protected async _close(): Promise<void> {
    try {
      // Close all active transactions
      for (const [, client] of this._activeTransactions) {
        try {
          await client.query('ROLLBACK');
          client.release();
        } catch {
          // Ignore rollback errors during disconnect
        }
      }
      this._activeTransactions.clear();

      // Close pool
      if (this._pool) {
        await this._pool.end();
        this._pool = null;
      }
    } catch (error) {
      throw new DAMEngineError('ENGINE_CLEANUP_FAILED', {
        instanceId: this.instanceId,
        name: this.name,
        engine: this.Engine,
        reason: error instanceof Error ? error.message : String(error),
      }, error as Error);
    }
  }

  /**
   * Execute a query against the PostgreSQL database
   */
  protected async _executeQuery<R extends Record<string, unknown>>(
    query: EngineQuery,
  ): Promise<{ data: R[]; count: number }> {
    if (!this._pool) {
      throw new DAMEngineError('CONNECTION_NOT_AVAILABLE', {
        instanceId: this.instanceId,
        name: this.name,
        engine: this.Engine,
        status: 'not_initialized',
      });
    }

    try {
      // Validate query (note: AbstractEngine automatically adds semicolon to empty queries)
      if (!query.sql?.trim() || query.sql.trim() === ';') {
        throw new DAMEngineError('QUERY_INVALID_SQL', {
          instanceId: this.instanceId,
          name: this.name,
          engine: this.Engine,
          reason: 'SQL query cannot be empty or whitespace',
        });
      }

      let client: PoolClient;
      const isInTransaction = query.transactionId &&
        this._activeTransactions.has(query.transactionId);

      if (isInTransaction && query.transactionId) {
        client = this._activeTransactions.get(query.transactionId)!;
      } else {
        client = await this._pool.connect();
      }

      try {
        // Parameters are already in PostgreSQL array format from _standardizeQuery
        const pgParams = Array.isArray(query.params)
          ? query.params
          : (query.params && typeof query.params === 'object'
            ? Object.values(query.params)
            : undefined);

        // Execute query
        const result: QueryResult = await client.query<R>(query.sql, pgParams);

        // Update pool stats
        this._updatePoolStats({
          totalConnections: this._pool.totalCount,
          activeConnections: this._pool.totalCount - this._pool.idleCount,
          idleConnections: this._pool.idleCount,
          waitingRequests: this._pool.waitingCount,
        });

        return {
          data: result.rows,
          count: result.rowCount || 0,
        };
      } finally {
        // Release client if not in transaction
        if (!isInTransaction) {
          client.release();
        }
      }
    } catch (error) {
      // Re-throw DAMEngineError as-is (like validation errors)
      if (error instanceof DAMEngineError) {
        throw error;
      }

      // Wrap unexpected errors as QUERY_EXECUTION_FAILED
      throw new DAMEngineError('QUERY_EXECUTION_FAILED', {
        instanceId: this.instanceId,
        name: this.name,
        engine: this.Engine,
        reason: error instanceof Error ? error.message : String(error),
      }, error as Error);
    }
  }

  /**
   * Begin a new transaction
   */
  protected async _beginTransaction(
    options?: EngineTransactionOptions,
  ): Promise<void> {
    if (!this._pool) {
      throw new DAMEngineError('CONNECTION_NOT_AVAILABLE', {
        instanceId: this.instanceId,
        name: this.name,
        engine: this.Engine,
        status: 'not_initialized',
      });
    }

    const transactionId = options?.name;
    if (!transactionId) {
      throw new DAMEngineError('TRANSACTION_NOT_FOUND', {
        instanceId: this.instanceId,
        name: this.name,
        engine: this.Engine,
        reason: 'Transaction ID is required',
      });
    }

    // Check if transaction with this ID already exists
    if (this._activeTransactions.has(transactionId)) {
      throw new DAMEngineError('TRANSACTION_ALREADY_STARTED', {
        instanceId: this.instanceId,
        name: this.name,
        engine: this.Engine,
        transactionId,
        reason: 'Transaction with this ID already exists',
      });
    }

    try {
      const client = await this._pool.connect();
      await client.query('BEGIN');

      // Set up transaction timeout if specified - applies to entire transaction
      if (options?.timeout && options.timeout > 0) {
        const timeoutMs = options.timeout * 1000;
        const timeoutId = setTimeout(async () => {
          // Auto-rollback transaction on timeout
          try {
            await this._rollbackTransaction(transactionId);
          } catch {
            // Ignore rollback errors during timeout
          }
        }, timeoutMs);

        this._transactionTimeouts.set(transactionId, timeoutId);
      }

      // Store transaction client with the provided transaction ID
      this._activeTransactions.set(transactionId, client);
    } catch (error) {
      throw new DAMEngineError('QUERY_EXECUTION_FAILED', {
        instanceId: this.instanceId,
        name: this.name,
        engine: this.Engine,
        operation: 'begin_transaction',
        transactionId,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Commit the current transaction
   */
  protected async _commitTransaction(transactionId?: string): Promise<void> {
    if (!transactionId) {
      throw new DAMEngineError('TRANSACTION_NOT_FOUND', {
        instanceId: this.instanceId,
        name: this.name,
        engine: this.Engine,
        reason: 'Transaction ID is required for pooled PostgreSQL engine',
      });
    }

    const client = this._activeTransactions.get(transactionId);
    if (!client) {
      throw new DAMEngineError('TRANSACTION_NOT_FOUND', {
        instanceId: this.instanceId,
        name: this.name,
        engine: this.Engine,
        transactionId,
      });
    }

    try {
      // Clear transaction timeout if it exists
      const timeoutId = this._transactionTimeouts.get(transactionId);
      if (timeoutId) {
        clearTimeout(timeoutId);
        this._transactionTimeouts.delete(transactionId);
      }

      await client.query('COMMIT');
      client.release();
      this._activeTransactions.delete(transactionId);
    } catch (error) {
      throw new DAMEngineError('TRANSACTION_COMMIT_FAILED', {
        instanceId: this.instanceId,
        name: this.name,
        engine: this.Engine,
        transactionId,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Rollback the current transaction
   */
  protected async _rollbackTransaction(transactionId?: string): Promise<void> {
    if (!transactionId) {
      throw new DAMEngineError('TRANSACTION_NOT_FOUND', {
        instanceId: this.instanceId,
        name: this.name,
        engine: this.Engine,
        reason: 'Transaction ID is required for pooled PostgreSQL engine',
      });
    }

    const client = this._activeTransactions.get(transactionId);
    if (!client) {
      throw new DAMEngineError('TRANSACTION_NOT_FOUND', {
        instanceId: this.instanceId,
        name: this.name,
        engine: this.Engine,
        transactionId,
      });
    }

    try {
      // Clear transaction timeout if it exists
      const timeoutId = this._transactionTimeouts.get(transactionId);
      if (timeoutId) {
        clearTimeout(timeoutId);
        this._transactionTimeouts.delete(transactionId);
      }

      await client.query('ROLLBACK');
      client.release();
      this._activeTransactions.delete(transactionId);
    } catch (error) {
      throw new DAMEngineError('TRANSACTION_ROLLBACK_FAILED', {
        instanceId: this.instanceId,
        name: this.name,
        engine: this.Engine,
        transactionId,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Rollback all active transactions (used during engine shutdown)
   */
  protected async _rollbackAllTransactions(): Promise<void> {
    const errors: Error[] = [];

    // Clear all transaction timeouts
    for (const timeoutId of this._transactionTimeouts.values()) {
      clearTimeout(timeoutId);
    }
    this._transactionTimeouts.clear();

    for (const [_transactionId, client] of this._activeTransactions) {
      try {
        await client.query('ROLLBACK');
        client.release();
      } catch (error) {
        errors.push(error instanceof Error ? error : new Error(String(error)));
      }
    }

    this._activeTransactions.clear();

    if (errors.length > 0) {
      throw new DAMEngineError('TRANSACTION_ROLLBACK_FAILED', {
        instanceId: this.instanceId,
        name: this.name,
        engine: this.Engine,
        reason:
          `Failed to rollback ${errors.length} transactions during shutdown`,
      });
    }
  }

  /**
   * Check if there are any active transactions
   */
  protected _hasActiveTransactions(): boolean {
    return this._activeTransactions.size > 0;
  }

  /**
   * Perform health check on the PostgreSQL connection
   */
  protected async _healthCheck(): Promise<void> {
    if (!this._pool) {
      throw new DAMEngineError('CONNECTION_NOT_AVAILABLE', {
        instanceId: this.instanceId,
        name: this.name,
        engine: this.Engine,
        status: 'not_initialized',
      });
    }

    const client = await this._pool.connect();
    try {
      const result = await client.query('SELECT 1 as health_check');
      if (result.rowCount !== 1) {
        throw new DAMEngineError('HEALTH_CHECK_FAILED', {
          instanceId: this.instanceId,
          name: this.name,
          engine: this.Engine,
        });
      }
    } finally {
      client.release();
    }
  }
}
