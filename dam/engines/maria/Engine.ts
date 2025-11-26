/**
 * MariaDB Database Engine Implementation
 *
 * This module provides a concrete implementation of the AbstractEngine for MariaDB databases.
 * It uses the npm:mariadb library with built-in connection pooling and comprehensive error handling.
 *
 * @example
 * ```typescript
 * import { MariaDBEngine } from './Engine.ts';
 *
 * const engine = new MariaDBEngine('maria-main', {
 *   host: 'localhost',
 *   port: 3306,
 *   database: 'myapp',
 *   username: 'root',
 *   password: 'password',
 *   pool: { max: 20, min: 5 }
 * });
 *
 * await engine.connect();
 * const result = await engine.execute({ sql: 'SELECT NOW() as current_time' });
 * console.log(result.data[0].current_time);
 * ```
 */

import {
  createPool,
  type Pool,
  type PoolConnection,
  type SqlError,
} from '$maria';
import { type EventOptionKeys } from '@tundralibs/utils';
import { AbstractEngine } from '../../engine/AbstractEngine.ts';
import { DAMEngineError } from '../../engine/errors/mod.ts';
import type {
  EngineEvents,
  EngineQuery,
  EngineTransactionOptions,
} from '../../engine/types/mod.ts';
import type { MariaDBEngineOptions } from './types/mod.ts';

/**
 * Default options for MariaDB engine
 * Note: Don't include pool-related options to avoid automatic pooling
 */
const DEFAULT_OPTIONS: Partial<MariaDBEngineOptions> = {
  port: 3306,
  ssl: false,
  connectionTimeout: 30,
  queryTimeout: 30,
};

/**
 * MariaDB Database Engine
 *
 * Provides a robust MariaDB database interface with connection pooling,
 * transaction management, and comprehensive error handling.
 */
export class MariaDBEngine extends AbstractEngine<MariaDBEngineOptions> {
  public readonly Engine = 'mariadb';

  private _pool: Pool | null = null;
  private _activeTransactions = new Map<string, PoolConnection>();
  private _transactionTimeouts = new Map<string, number>();

  constructor(
    id: string,
    options: EventOptionKeys<MariaDBEngineOptions, EngineEvents>,
  ) {
    super(id, options, DEFAULT_OPTIONS);
  }

  /**
   * Override option processing for MariaDB-specific validation
   */
  protected override _processOption<K extends keyof MariaDBEngineOptions>(
    key: K,
    value: MariaDBEngineOptions[K],
  ): MariaDBEngineOptions[K] {
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
          value !== undefined &&
          (typeof value !== 'number' || value < 1 || value > 65535)
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
          if (
            poolOptions.max && (poolOptions.max < 1 || poolOptions.max > 500)
          ) {
            throw new DAMEngineError('CONFIG_INVALID', {
              instanceId: this.instanceId,
              name: this.name,
              engine: this.Engine,
              configKey: 'pool.max',
              reason:
                `Pool max connections must be between 1 and 500, got ${poolOptions.max}`,
            });
          }
          if (poolOptions.min && poolOptions.min < 0) {
            throw new DAMEngineError('CONFIG_INVALID', {
              instanceId: this.instanceId,
              name: this.name,
              engine: this.Engine,
              configKey: 'pool.min',
              reason:
                `Pool min connections cannot be negative, got ${poolOptions.min}`,
            });
          }
          if (
            poolOptions.max && poolOptions.min &&
            poolOptions.min > poolOptions.max
          ) {
            throw new DAMEngineError('CONFIG_INVALID', {
              instanceId: this.instanceId,
              name: this.name,
              engine: this.Engine,
              configKey: 'pool',
              reason:
                `Pool min (${poolOptions.min}) cannot be greater than max (${poolOptions.max})`,
            });
          }
        }
        break;
    }

    // Return value as-is for unhandled keys
    return value;
  }

  /**
   * Override query standardization to support MariaDB named parameters with namedPlaceholders
   */
  protected override _standardizeQuery(query: EngineQuery): EngineQuery {
    const sql = query.sql.trim().replace(/;$/, '') + ';';

    // With namedPlaceholders enabled, we can pass params object directly
    // Just need to convert :param: format to MariaDB :param format (no colons)
    const mariaSql = sql.replace(/:(\w+):/g, (_match, paramName) => {
      return `:${paramName}`;
    });

    // Return the SQL with named params for MariaDB (namedPlaceholders handles the object)
    return {
      sql: mariaSql,
      params: query.params,
      transactionId: query.transactionId,
    } as EngineQuery;
  }

  /**
   * Connect to MariaDB database
   * Creates a connection pool for efficient resource management
   */
  protected override async _connect(): Promise<void> {
    // Build connection configuration
    const config = {
      host: this.getOption('host'),
      port: this.getOption('port'),
      database: this.getOption('database'),
      user: this.getOption('username'),
      password: this.getOption('password'),
      connectTimeout: (this.getOption('connectionTimeout') ?? 30) * 1000,
      socketTimeout: (this.getOption('queryTimeout') ?? 30) * 1000,
      queryTimeout: (this.getOption('queryTimeout') ?? 30) * 1000,
      ssl: this.getOption('ssl')
        ? (typeof this.getOption('ssl') === 'object'
          ? this.getOption('ssl')
          : {})
        : false,
      // Pool options
      connectionLimit: this.getOption('pool')?.max ?? 10,
      minimumIdle: this.getOption('pool')?.min ?? 2,
      acquireTimeout: (this.getOption('connectionTimeout') ?? 30) * 1000,
      timeout: 30000,
      // MariaDB-specific options
      bigIntAsNumber: true,
      autoJsonMap: false,
      arrayParenthesis: true,
      permitSetMultiParamEntries: true,
      namedPlaceholders: true, // Enable named parameter support (:paramName:)
    };
    try {
      this._pool = await createPool(config);
      // Test the connection
      let testConnection: PoolConnection | null = null;
      try {
        testConnection = await this._pool.getConnection();
        await testConnection.query('SELECT 1');
      } finally {
        if (testConnection) {
          await testConnection.release();
        }
      }
    } catch (error) {
      // Clean up the pool if connection failed
      if (this._pool) {
        try {
          // Force close all connections immediately
          await this._pool.end();
        } catch {
          // Ignore cleanup errors
        } finally {
          this._pool = null;
        }
      }

      const mariaError = error as SqlError;

      throw new DAMEngineError('CONNECTION_FAILED', {
        instanceId: this.instanceId,
        name: this.name,
        engine: this.Engine,
        originalError: error,
        reason: `Failed to connect to MariaDB: ${mariaError.message}`,
        code: mariaError.code,
      });
    }
  }

  /**
   * Close MariaDB database connection
   * Closes all connections in the pool
   */
  protected override async _close(): Promise<void> {
    if (this._pool) {
      try {
        // Close active transactions first
        await this._rollbackAllTransactions();
      } catch {
        // Ignore rollback errors during close
      }

      try {
        // Close the pool
        await this._pool.end();
      } catch {
        // Ignore pool close errors
      } finally {
        this._pool = null;
      }
    }
  }

  /**
   * Execute a single query
   */
  protected override async _executeQuery<
    R extends Record<string, unknown> = Record<string, unknown>,
  >(query: EngineQuery): Promise<{ data: R[]; count: number }> {
    if (!this._pool) {
      throw new DAMEngineError('ENGINE_NOT_CONNECTED', {
        instanceId: this.instanceId,
        name: this.name,
        engine: this.Engine,
        reason: 'Database not connected',
      });
    }

    try {
      let connection: PoolConnection;
      let shouldRelease = true;

      // Use transaction connection if available
      if (
        query.transactionId && this._activeTransactions.has(query.transactionId)
      ) {
        connection = this._activeTransactions.get(query.transactionId)!;
        shouldRelease = false;
      } else {
        connection = await this._pool.getConnection();
      }

      try {
        const result = await connection.query(query.sql, query.params);

        // Handle different result types
        let data: R[] = [];
        let count = 0;

        if (Array.isArray(result)) {
          data = result as R[];
          count = result.length;
        } else if (result && typeof result === 'object') {
          // Handle insert/update/delete results
          const meta = result as { affectedRows?: number };
          count = meta.affectedRows ?? 0;

          if ('length' in result) {
            data = Array.from(result as ArrayLike<R>);
            count = data.length;
          }
        }

        return { data, count };
      } finally {
        if (shouldRelease) {
          await connection.release();
        }
      }
    } catch (error) {
      const mariaError = error as SqlError;

      throw new DAMEngineError('QUERY_EXECUTION_FAILED', {
        instanceId: this.instanceId,
        name: this.name,
        engine: this.Engine,
        sql: query.sql,
        params: query.params,
        transactionId: query.transactionId,
        originalError: error,
        reason: `Query failed: ${mariaError.message}`,
        code: mariaError.code,
      });
    }
  }

  /**
   * Begin a database transaction
   */
  protected override async _beginTransaction(
    options?: EngineTransactionOptions,
  ): Promise<void> {
    if (!this._pool) {
      throw new DAMEngineError('ENGINE_NOT_CONNECTED', {
        instanceId: this.instanceId,
        name: this.name,
        engine: this.Engine,
        reason: 'Database not connected',
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
      const connection = await this._pool.getConnection();

      // Begin transaction
      await connection.beginTransaction();

      // Set up transaction timeout if specified
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

      this._activeTransactions.set(transactionId, connection);
    } catch (error) {
      const mariaError = error as SqlError;

      throw new DAMEngineError('TRANSACTION_ROLLBACK_FAILED', {
        instanceId: this.instanceId,
        name: this.name,
        engine: this.Engine,
        transactionId,
        originalError: error,
        reason: `Failed to begin transaction: ${mariaError.message}`,
        code: mariaError.code,
      });
    }
  }

  /**
   * Commit a database transaction
   */
  protected override async _commitTransaction(
    transactionId?: string,
  ): Promise<void> {
    if (!transactionId) {
      throw new DAMEngineError('TRANSACTION_NOT_FOUND', {
        instanceId: this.instanceId,
        name: this.name,
        engine: this.Engine,
        reason: 'Transaction ID is required',
      });
    }

    const connection = this._activeTransactions.get(transactionId);
    if (!connection) {
      throw new DAMEngineError('TRANSACTION_NOT_FOUND', {
        instanceId: this.instanceId,
        name: this.name,
        engine: this.Engine,
        transactionId,
        reason: `Transaction ${transactionId} not found`,
      });
    }

    try {
      // Clear transaction timeout if it exists
      const timeoutId = this._transactionTimeouts.get(transactionId);
      if (timeoutId) {
        clearTimeout(timeoutId);
        this._transactionTimeouts.delete(transactionId);
      }

      await connection.commit();
    } catch (error) {
      const mariaError = error as SqlError;

      throw new DAMEngineError('TRANSACTION_COMMIT_FAILED', {
        instanceId: this.instanceId,
        name: this.name,
        engine: this.Engine,
        transactionId,
        originalError: error,
        reason: `Failed to commit transaction: ${mariaError.message}`,
        code: mariaError.code,
      });
    } finally {
      // Always cleanup the transaction
      try {
        await connection.release();
      } catch {
        // Ignore release errors
      }
      this._activeTransactions.delete(transactionId);
    }
  }

  /**
   * Rollback a database transaction
   */
  protected override async _rollbackTransaction(
    transactionId?: string,
  ): Promise<void> {
    if (!transactionId) {
      throw new DAMEngineError('TRANSACTION_NOT_FOUND', {
        instanceId: this.instanceId,
        name: this.name,
        engine: this.Engine,
        reason: 'Transaction ID is required',
      });
    }

    const connection = this._activeTransactions.get(transactionId);
    if (!connection) {
      throw new DAMEngineError('TRANSACTION_NOT_FOUND', {
        instanceId: this.instanceId,
        name: this.name,
        engine: this.Engine,
        transactionId,
        reason: `Transaction ${transactionId} not found`,
      });
    }

    try {
      // Clear transaction timeout if it exists
      const timeoutId = this._transactionTimeouts.get(transactionId);
      if (timeoutId) {
        clearTimeout(timeoutId);
        this._transactionTimeouts.delete(transactionId);
      }

      await connection.rollback();
    } catch (error) {
      const mariaError = error as SqlError;

      throw new DAMEngineError('TRANSACTION_ROLLBACK_FAILED', {
        instanceId: this.instanceId,
        name: this.name,
        engine: this.Engine,
        transactionId,
        originalError: error,
        reason: `Failed to rollback transaction: ${mariaError.message}`,
        code: mariaError.code,
      });
    } finally {
      // Always cleanup the transaction, even if rollback fails
      try {
        await connection.release();
      } catch {
        // Ignore release errors
      }
      this._activeTransactions.delete(transactionId);
    }
  }

  /**
   * Rollback all active transactions
   */
  protected override async _rollbackAllTransactions(): Promise<void> {
    // Clear all transaction timeouts
    for (const timeoutId of this._transactionTimeouts.values()) {
      clearTimeout(timeoutId);
    }
    this._transactionTimeouts.clear();

    const transactionPromises = Array.from(this._activeTransactions.entries())
      .map(async ([_transactionId, conn]) => {
        try {
          await conn.rollback();
          await conn.release();
        } catch {
          // Ignore errors during cleanup
        }
      });

    await Promise.all(transactionPromises);
    this._activeTransactions.clear();
  }

  /**
   * Check if there are active transactions
   */
  protected override _hasActiveTransactions(): boolean {
    return this._activeTransactions.size > 0;
  }

  /**
   * Perform health check
   */
  protected override async _healthCheck(): Promise<void> {
    if (!this._pool) {
      throw new DAMEngineError('ENGINE_NOT_CONNECTED', {
        instanceId: this.instanceId,
        name: this.name,
        engine: this.Engine,
        reason: 'Database not connected',
      });
    }

    try {
      const connection = await this._pool.getConnection();
      await connection.query('SELECT 1');
      await connection.release();
    } catch (error) {
      const mariaError = error as SqlError;

      throw new DAMEngineError('HEALTH_CHECK_FAILED', {
        instanceId: this.instanceId,
        name: this.name,
        engine: this.Engine,
        originalError: error,
        reason: `Health check failed: ${mariaError.message}`,
        code: mariaError.code,
      });
    }
  }

  /**
   * Get current pool statistics
   */
  public getPoolStats() {
    if (!this._pool) {
      return null;
    }

    return {
      totalConnections: this._pool.totalConnections(),
      idleConnections: this._pool.idleConnections(),
      activeConnections: this._pool.activeConnections(),
      taskQueueSize: this._pool.taskQueueSize(),
    };
  }
}
