/**
 * SQLite Database Engine Implementation
 *
 * This module provides a concrete implementation of the AbstractEngine for SQLite databases.
 * It uses the jsr:@db/sqlite library with comprehensive error handling, transaction support,
 * and SQLite-specific optimizations like WAL mode and pragma configurations.
 *
 * @example
 * ```typescript
 * import { SQLiteEngine } from './Engine.ts';
 *
 * const engine = new SQLiteEngine('local-db', {
 *   database: './data/app.db',
 *   cacheSize: -128000,
 *   synchronous: 'NORMAL'
 * });
 *
 * await engine.connect();
 * const result = await engine.execute({
 *   sql: 'SELECT * FROM users WHERE status = :status:',
 *   params: { status: 'active' }
 * });
 * console.log(`Found ${result.count} active users`);
 * ```
 */

import { Database } from '$sqlite';
import { type EventOptionKeys } from '@tundralibs/utils';
import { AbstractEngine } from '../../engine/AbstractEngine.ts';
import { DAMEngineError } from '../../engine/errors/mod.ts';
import type {
  EngineEvents,
  EngineQuery,
  EngineTransactionOptions,
} from '../../engine/types/mod.ts';
import type { SQLiteEngineOptions } from './types/mod.ts';

/**
 * Default options for SQLite engine
 */
const DEFAULT_OPTIONS: Partial<SQLiteEngineOptions> = {
  synchronous: 'NORMAL',
  cacheSize: -64000, // 64MB
};

/**
 * SQLite Database Engine
 *
 * Provides a robust SQLite database interface with transaction support,
 * WAL mode optimization, and comprehensive error handling.
 */
export class SQLiteEngine extends AbstractEngine<SQLiteEngineOptions> {
  public readonly Engine = 'SQLite';

  private _db: Database | null = null;
  private _activeTransactions = new Map<string, number>();
  private _transactionTimeouts = new Map<string, number>();

  constructor(
    id: string,
    options: EventOptionKeys<SQLiteEngineOptions, EngineEvents>,
  ) {
    super(id, options, DEFAULT_OPTIONS);
  }

  /**
   * SQLite doesn't use connection pooling in the traditional sense
   * It's a file-based database with built-in locking
   */
  override get poolEnabled(): boolean {
    return false;
  }

  /**
   * Override query standardization to convert :param: format to SQLite :param format
   */
  protected override _standardizeQuery(query: EngineQuery): EngineQuery {
    const sql = query.sql.trim().replace(/;$/, '') + ';';

    // Convert :param: format to SQLite :param format (remove trailing colon)
    const sqliteSQL = sql.replace(/:(\w+):/g, ':$1');

    // Return the SQL with converted params for SQLite
    return {
      sql: sqliteSQL,
      params: query.params,
      transactionId: query.transactionId,
    } as EngineQuery;
  }

  /**
   * Override option processing for SQLite-specific validation
   */
  protected override _processOption<K extends keyof SQLiteEngineOptions>(
    key: K,
    value: SQLiteEngineOptions[K],
  ): SQLiteEngineOptions[K] {
    switch (key) {
      case 'database':
        if (!value || (typeof value === 'string' && !value.trim())) {
          throw new DAMEngineError('CONFIG_INVALID', {
            instanceId: this.instanceId,
            name: this.name,
            engine: this.Engine,
            configKey: 'database',
            reason: 'Database path is required and cannot be empty',
          });
        }
        break;

      case 'cacheSize':
        if (value !== undefined && typeof value !== 'number') {
          throw new DAMEngineError('CONFIG_INVALID', {
            instanceId: this.instanceId,
            name: this.name,
            engine: this.Engine,
            configKey: 'cacheSize',
            reason: `Cache size must be a number, got ${typeof value}`,
          });
        }
        break;
    }

    return value;
  }

  /**
   * Connect to SQLite database
   * Opens the database file and configures SQLite pragmas
   */
  protected override async _connect(): Promise<void> {
    try {
      const dbPath = this.getOption('database');

      // Open the database in readwrite mode with create option
      this._db = new Database(dbPath, {
        create: true,
        readonly: false,
      });

      // Configure SQLite pragmas for optimal performance and behavior
      await this._configurePragmas();

      // Test the connection
      const result = this._db.prepare('SELECT 1 as test').get();
      if (!result || (result as { test: number }).test !== 1) {
        throw new Error('Connection test failed');
      }
    } catch (error) {
      // Clean up on failure
      if (this._db) {
        try {
          this._db.close();
        } catch {
          // Ignore close errors
        } finally {
          this._db = null;
        }
      }

      throw new DAMEngineError('CONNECTION_FAILED', {
        instanceId: this.instanceId,
        name: this.name,
        engine: this.Engine,
        originalError: error,
        reason: `Failed to connect to SQLite database: ${
          error instanceof Error ? error.message : String(error)
        }`,
      });
    }
  }

  /**
   * Configure SQLite pragmas for optimal performance and behavior
   */
  private _configurePragmas(): void {
    if (!this._db) return;

    const pragmas: Array<[string, string | number]> = [];

    // Synchronous mode
    const synchronous = this.getOption('synchronous') || 'NORMAL';
    pragmas.push(['synchronous', synchronous]);

    // Cache size
    const cacheSize = this.getOption('cacheSize') || -64000;
    pragmas.push(['cache_size', cacheSize]);

    // Use queryTimeout from base options for busy timeout
    const queryTimeout = this.getOption('queryTimeout') || 30;
    pragmas.push(['busy_timeout', queryTimeout * 1000]); // Convert seconds to milliseconds

    // Apply all pragmas
    for (const [pragma, value] of pragmas) {
      try {
        this._db.exec(`PRAGMA ${pragma} = ${value};`);
      } catch (error) {
        // Log but don't fail on pragma errors (some may be read-only)
        console.warn(`SQLite pragma warning: ${pragma} = ${value} - ${error}`);
      }
    }
  }

  /**
   * Close SQLite database connection
   */
  protected override _close(): void {
    try {
      // Rollback any active transactions
      this._rollbackAllTransactions();

      if (this._db) {
        this._db.close();
        this._db = null;
      }
    } catch (error) {
      throw new DAMEngineError('ENGINE_CLEANUP_FAILED', {
        instanceId: this.instanceId,
        name: this.name,
        engine: this.Engine,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Execute a single query
   */
  protected override _executeQuery<
    R extends Record<string, unknown> = Record<string, unknown>,
  >(query: EngineQuery): { data: R[]; count: number } {
    if (!this._db) {
      throw new DAMEngineError('ENGINE_NOT_CONNECTED', {
        instanceId: this.instanceId,
        name: this.name,
        engine: this.Engine,
        reason: 'Database not connected',
      });
    }

    try {
      const stmt = this._db.prepare(query.sql);

      // Determine if this is a SELECT query or a modification query
      const isSelect = query.sql.trim().toUpperCase().startsWith('SELECT');
      const isInsert = query.sql.trim().toUpperCase().startsWith('INSERT');

      let data: R[] = [];
      let count = 0;

      if (isSelect) {
        // For SELECT queries, get all rows
        if (query.params && Object.keys(query.params).length > 0) {
          // @ts-ignore SQLite parameter binding
          data = stmt.all(query.params) as R[];
        } else {
          data = stmt.all() as R[];
        }
        count = data.length;
      } else {
        // For INSERT/UPDATE/DELETE, execute and get changes
        let result: unknown;
        if (query.params && Object.keys(query.params).length > 0) {
          // @ts-ignore SQLite parameter binding
          result = stmt.run(query.params);
        } else {
          result = stmt.run();
        }

        // SQLite run() can return changes in different formats
        if (
          typeof result === 'object' && result !== null && 'changes' in result
        ) {
          count = (result as { changes: number }).changes;
        } else if (typeof result === 'number') {
          count = result;
        } else {
          // Fallback: get the total changes from the database
          count = this._db.changes;
        }

        // For INSERT statements, get the last insert row ID
        if (isInsert && this._db) {
          const lastInsertRowid = this._db.lastInsertRowId;
          data = [{ lastInsertRowid } as unknown as R];
        }
      }

      return { data, count };
    } catch (error) {
      throw new DAMEngineError('QUERY_EXECUTION_FAILED', {
        instanceId: this.instanceId,
        name: this.name,
        engine: this.Engine,
        sql: query.sql,
        params: query.params,
        transactionId: query.transactionId,
        originalError: error,
        reason: `Query failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      });
    }
  }

  /**
   * Begin a database transaction
   */
  protected override _beginTransaction(
    options?: EngineTransactionOptions,
  ): void {
    if (!this._db) {
      throw new DAMEngineError('ENGINE_NOT_CONNECTED', {
        instanceId: this.instanceId,
        name: this.name,
        engine: this.Engine,
        reason: 'Database not connected',
      });
    }

    // Get transaction ID from options (should be set by AbstractEngine.begin())
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

    // Check if there's already an active transaction (SQLite limitation)
    if (this._activeTransactions.size > 0) {
      throw new DAMEngineError('TRANSACTION_ALREADY_STARTED', {
        instanceId: this.instanceId,
        name: this.name,
        engine: this.Engine,
        transactionId: Array.from(this._activeTransactions.keys())[0] ||
          'unknown',
        reason: 'SQLite does not support concurrent transactions',
      });
    }

    try {
      // Start a new transaction
      this._db.exec('BEGIN TRANSACTION;');

      // Store active transaction
      this._activeTransactions.set(transactionId, 1);

      // Set up transaction timeout if specified
      if (options?.timeout && options.timeout > 0) {
        const timeoutMs = options.timeout * 1000;
        const timeoutId = setTimeout(() => {
          // Auto-rollback transaction on timeout
          try {
            this._rollbackTransaction(transactionId);
          } catch {
            // Ignore rollback errors during timeout
          }
        }, timeoutMs);

        this._transactionTimeouts.set(transactionId, timeoutId);
      }
    } catch (error) {
      throw new DAMEngineError('TRANSACTION_NOT_ACTIVE', {
        instanceId: this.instanceId,
        name: this.name,
        engine: this.Engine,
        transactionId,
        originalError: error,
        reason: `Failed to begin transaction: ${
          error instanceof Error ? error.message : String(error)
        }`,
      });
    }
  }

  /**
   * Commit a database transaction
   */
  protected override _commitTransaction(
    transactionId?: string,
  ): void {
    if (!transactionId) {
      throw new DAMEngineError('TRANSACTION_NOT_FOUND', {
        instanceId: this.instanceId,
        name: this.name,
        engine: this.Engine,
        reason: 'Transaction ID is required',
      });
    }

    const transactionLevel = this._activeTransactions.get(transactionId);
    if (transactionLevel === undefined) {
      throw new DAMEngineError('TRANSACTION_NOT_FOUND', {
        instanceId: this.instanceId,
        name: this.name,
        engine: this.Engine,
        transactionId,
        reason: `Transaction ${transactionId} not found`,
      });
    }

    if (!this._db) {
      throw new DAMEngineError('ENGINE_NOT_CONNECTED', {
        instanceId: this.instanceId,
        name: this.name,
        engine: this.Engine,
        reason: 'Database not connected',
      });
    }

    try {
      // Clear transaction timeout if it exists
      const timeoutId = this._transactionTimeouts.get(transactionId);
      if (timeoutId) {
        clearTimeout(timeoutId);
        this._transactionTimeouts.delete(transactionId);
      }

      // Commit the transaction
      this._db.exec('COMMIT;');
      this._activeTransactions.delete(transactionId);
    } catch (error) {
      throw new DAMEngineError('TRANSACTION_COMMIT_FAILED', {
        instanceId: this.instanceId,
        name: this.name,
        engine: this.Engine,
        transactionId,
        originalError: error,
        reason: `Failed to commit transaction: ${
          error instanceof Error ? error.message : String(error)
        }`,
      });
    }
  }

  /**
   * Rollback a database transaction
   */
  protected override _rollbackTransaction(
    transactionId?: string,
  ): void {
    if (!transactionId) {
      throw new DAMEngineError('TRANSACTION_NOT_FOUND', {
        instanceId: this.instanceId,
        name: this.name,
        engine: this.Engine,
        reason: 'Transaction ID is required',
      });
    }

    const transactionLevel = this._activeTransactions.get(transactionId);
    if (transactionLevel === undefined) {
      throw new DAMEngineError('TRANSACTION_NOT_FOUND', {
        instanceId: this.instanceId,
        name: this.name,
        engine: this.Engine,
        transactionId,
        reason: `Transaction ${transactionId} not found`,
      });
    }

    if (!this._db) {
      throw new DAMEngineError('ENGINE_NOT_CONNECTED', {
        instanceId: this.instanceId,
        name: this.name,
        engine: this.Engine,
        reason: 'Database not connected',
      });
    }

    try {
      // Clear transaction timeout if it exists
      const timeoutId = this._transactionTimeouts.get(transactionId);
      if (timeoutId) {
        clearTimeout(timeoutId);
        this._transactionTimeouts.delete(transactionId);
      }

      // Rollback the transaction
      this._db.exec('ROLLBACK;');
      this._activeTransactions.delete(transactionId);
    } catch (error) {
      // Even if rollback fails, clean up our state
      this._activeTransactions.delete(transactionId);

      throw new DAMEngineError('TRANSACTION_ROLLBACK_FAILED', {
        instanceId: this.instanceId,
        name: this.name,
        engine: this.Engine,
        transactionId,
        originalError: error,
        reason: `Failed to rollback transaction: ${
          error instanceof Error ? error.message : String(error)
        }`,
      });
    }
  }

  /**
   * Rollback all active transactions
   */
  protected override _rollbackAllTransactions(): void {
    // Clear all transaction timeouts
    for (const timeoutId of this._transactionTimeouts.values()) {
      clearTimeout(timeoutId);
    }
    this._transactionTimeouts.clear();

    if (this._db && this._activeTransactions.size > 0) {
      try {
        this._db.exec('ROLLBACK;');
      } catch {
        // Ignore rollback errors during cleanup
      }
    }

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
  protected override _healthCheck(): void {
    if (!this._db) {
      throw new DAMEngineError('ENGINE_NOT_CONNECTED', {
        instanceId: this.instanceId,
        name: this.name,
        engine: this.Engine,
        reason: 'Database not connected',
      });
    }

    try {
      const result = this._db.prepare('SELECT 1 as health_check').get();
      if (!result || (result as { health_check: number }).health_check !== 1) {
        throw new Error('Health check query returned unexpected result');
      }
    } catch (error) {
      throw new DAMEngineError('HEALTH_CHECK_FAILED', {
        instanceId: this.instanceId,
        name: this.name,
        engine: this.Engine,
        originalError: error,
        reason: `Health check failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      });
    }
  }

  /**
   * Get SQLite-specific information and statistics
   */
  public getDatabaseInfo() {
    if (!this._db) {
      return null;
    }

    try {
      const info = {
        // Database file information
        databasePath: this.getOption('database'),

        // SQLite version and compile options
        version: this._db.prepare('SELECT sqlite_version() as version')
          .get() as { version: string },

        // Database settings
        pragmas: {
          synchronous: this._db.prepare('PRAGMA synchronous').get() as {
            synchronous: number;
          },
          cacheSize: this._db.prepare('PRAGMA cache_size').get() as {
            cache_size: number;
          },
        },

        // Database statistics
        pageCount: this._db.prepare('PRAGMA page_count').get() as {
          page_count: number;
        },
        freelistCount: this._db.prepare('PRAGMA freelist_count').get() as {
          freelist_count: number;
        },

        // Transaction state
        activeTransactions: this._activeTransactions.size,
      };

      return info;
    } catch {
      return null;
    }
  }

  /**
   * SQLite doesn't use traditional connection pooling
   * Returns basic database state information instead
   */
  public getPoolStats() {
    return {
      totalConnections: this._db ? 1 : 0,
      activeConnections: this._db ? 1 : 0,
      idleConnections: 0,
      waitingRequests: 0,
    };
  }

  /**
   * Execute VACUUM command to optimize database
   */
  public vacuum(): void {
    if (!this._db) {
      throw new DAMEngineError('ENGINE_NOT_CONNECTED', {
        instanceId: this.instanceId,
        name: this.name,
        engine: this.Engine,
        reason: 'Database not connected',
      });
    }

    try {
      this._db.exec('VACUUM;');
    } catch (error) {
      throw new DAMEngineError('QUERY_EXECUTION_FAILED', {
        instanceId: this.instanceId,
        name: this.name,
        engine: this.Engine,
        sql: 'VACUUM;',
        originalError: error,
        reason: `VACUUM failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      });
    }
  }

  /**
   * Execute ANALYZE command to update query planner statistics
   */
  public analyze(): void {
    if (!this._db) {
      throw new DAMEngineError('ENGINE_NOT_CONNECTED', {
        instanceId: this.instanceId,
        name: this.name,
        engine: this.Engine,
        reason: 'Database not connected',
      });
    }

    try {
      this._db.exec('ANALYZE;');
    } catch (error) {
      throw new DAMEngineError('QUERY_EXECUTION_FAILED', {
        instanceId: this.instanceId,
        name: this.name,
        engine: this.Engine,
        sql: 'ANALYZE;',
        originalError: error,
        reason: `ANALYZE failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      });
    }
  }
}
