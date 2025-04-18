import { EventOptionKeys, Memoize, Options } from '@tundralibs/utils';
import type { EngineEvents, EngineOptions, EngineStatus } from './types/mod.ts';
import { assertEngine, type Engine } from './Engines.ts';
import { type Query, QueryParameters, type QueryResult } from '../query/mod.ts';
import {
  DAMEngineConfigError,
  DAMEngineError,
  DAMEngineQueryError,
} from './errors/mod.ts';

/**
 * Abstract base class for database engine implementations.
 *
 * Provides common functionality for all database engines including:
 * - Connection lifecycle management
 * - Query execution
 * - Error handling
 * - Status tracking
 * - Batch and chained query support
 *
 * @template O The engine-specific options type extending {@link EngineOptions}
 *
 * @example
 * ```typescript
 * class PostgresEngine extends AbstractEngine<PostgresEngineOptions> {
 *   public readonly Engine = 'POSTGRES';
 *   // ... implementation
 * }
 * ```
 *
 * @throws {DAMEngineConfigError} When configuration options are invalid
 */
export abstract class AbstractEngine<
  O extends EngineOptions,
> extends Options<O, EngineEvents> {
  /** The database engine type identifier */
  public abstract readonly Engine: Engine;

  /**
   * The name of this engine instance
   * Used for logging and identification
   */
  public readonly name: string;

  /** Number of connection attempts made since last successful connection */
  protected _connectAttempts: number = 0;

  /**
   * Current status of the engine
   * @see {@link EngineStatus} for possible values
   */
  protected _status: EngineStatus = 'WAITING';

  /** Maximum number of concurrent queries to execute in a batch */
  protected _maxConcurrent: number = 1;

  /** Number of currently executing queries */
  protected _runningQueries: number = 0;

  /**
   * Creates a new database engine instance
   *
   * @param name - Unique identifier for this engine instance
   * @param options - Configuration options for the engine
   * @param defaults - Default values for options
   *
   * @throws {DAMEngineConfigError} When required options are missing or invalid
   */
  constructor(
    name: string,
    options: EventOptionKeys<O, EngineEvents>,
    defaults: Partial<O>,
  ) {
    super(options, {
      ...{ slowQueryThreshold: 1, maxConnectAttempts: 3, maxConcurrent: 1 },
      ...defaults,
    });
    this.name = name.trim();
    this._maxConcurrent = this.getOption('maxConcurrent') || 1;
  }

  /**
   * Gets the current engine status
   *
   * @returns {EngineStatus} Current status of the engine
   * - WAITING: Not connected, will connect on first query
   * - CONNECTED: Connected and ready for queries
   * - IDLE: Connection finalized due to inactivity
   * - UNABLE: Failed to connect after multiple attempts
   */
  public get status(): EngineStatus {
    return this._status;
  }

  /**
   * Initializes the database connection
   *
   * Will attempt to connect to the database and set status to CONNECTED on success.
   * If connection fails repeatedly, status will be set to UNABLE.
   *
   * @returns {Promise<void>} Promise that resolves when connection is established
   *
   * @throws {DAMEngineError} When connection fails
   * @see {@link DAMEngineError} for error details
   *
   * @example
   * ```typescript
   * const engine = new PostgresEngine('main', options);
   * await engine.init();
   * console.log(engine.status); // 'CONNECTED'
   * ```
   */
  public async init(): Promise<void> {
    try {
      if (this.status === 'WAITING' || this.status === 'IDLE') {
        await this._init();
        this._status = 'CONNECTED';
        this._connectAttempts = 0;
      }
    } catch (error) {
      ++this._connectAttempts;
      if (this._connectAttempts > this.getOption('maxConnectAttempts')!) {
        this._status = 'UNABLE';
      }
      if (error instanceof DAMEngineError) {
        throw error;
      } else {
        throw new DAMEngineError('Failed to initialize engine.', {
          name: this.name,
          engine: this.Engine,
          cause: error,
        });
      }
    }
  }

  /**
   * Finalizes the database connection
   *
   * Closes the connection and releases all resources.
   * Sets status to IDLE after completion.
   *
   * @returns {Promise<void>} Promise that resolves when connection is closed
   */
  public async finalize(): Promise<void> {
    try {
      if (this.status === 'CONNECTED') {
        await this._finalize();
      }
    } finally {
      // Set to IDLE after finalization
      this._status = 'IDLE';
    }
  }

  /**
   * Checks if the database connection is active
   *
   * @returns {Promise<boolean>} True if the connection is active, false otherwise
   *
   * @example
   * ```typescript
   * if (await engine.ping()) {
   *   console.log('Database is reachable');
   * }
   * ```
   */
  public async ping(): Promise<boolean> {
    try {
      if (this.status === 'UNABLE') {
        return false;
      } else if (this.status === 'WAITING') {
        await this.init();
      }
      return this._ping();
    } catch {
      return false;
    }
  }

  /**
   * Gets the database server version
   *
   * The version is cached for 5 minutes (300 seconds) to reduce database load.
   *
   * @returns {Promise<string>} Database server version string
   *
   * @example
   * ```typescript
   * const version = await engine.version();
   * console.log(`Connected to database version ${version}`);
   * ```
   */
  @Memoize(300)
  public async version(): Promise<string> {
    try {
      if (this.status === 'UNABLE') {
        return 'N/A';
      } else if (this.status === 'WAITING' || this.status === 'IDLE') {
        await this.init();
      }
      // _version should return just the version string without additional queries
      return await this._version();
    } catch (error) {
      console.error('Failed to get version:', error);
      return 'N/A';
    }
  }

  /**
   * Executes a single SQL query
   *
   * @template T The expected result row type
   * @param query - Query object containing SQL and parameters
   * @returns {Promise<QueryResult<T>>} Query execution result
   *
   * @throws {DAMEngineQueryError} When query execution fails
   * @see {@link DAMEngineQueryError} for error details
   * @see {@link QueryResult} for result structure
   *
   * @example
   * ```typescript
   * const result = await engine.query<{ id: number, name: string }>({
   *   id: 'get_users',
   *   sql: 'SELECT id, name FROM users WHERE active = $active',
   *   params: { active: true }
   * });
   *
   * console.log(`Found ${result.count} users`);
   * console.log(`First user: ${result.data[0]?.name}`);
   * ```
   */
  public async query<
    T extends Record<string, unknown> = Record<string, unknown>,
  >(query: Pick<Query, 'id' | 'sql' | 'params'>): Promise<QueryResult<T>> {
    await this.init();
    const result: QueryResult<T> = {
      id: query.id || this._generateQueryId(),
      time: 0,
      count: 0,
      data: [],
    };
    const start = performance.now();
    const processedQuery = this._standardizeQuery(query);
    const params = (query.params instanceof QueryParameters)
      ? query.params.asRecord()
      : query.params;
    let error: DAMEngineError | undefined;
    try {
      ++this._runningQueries;
      const sql = query.sql.trim();
      if (params) {
        // Process parameters
      }
      if (sql.length === 0) {
        throw new DAMEngineQueryError('Empty SQL statement.', {
          name: this.name,
          engine: this.Engine,
          query: processedQuery,
        });
      }
      // Execute the query
      const res = await this._query<T>(processedQuery);
      result.count = res.count ?? 0;
      result.data = res.data ?? [];
      result.time = performance.now() - start;
      return result;
    } catch (e) {
      if (e instanceof DAMEngineQueryError) {
        error = e;
      } else {
        error = new DAMEngineQueryError('Failed to execute query.', {
          name: this.name,
          engine: this.Engine,
          query: query,
        }, e as Error);
      }
      throw error;
    } finally {
      this.emit('query', this.name, query, result, error);
      --this._runningQueries;
    }
  }

  /**
   * Executes a chain of queries where each query can trigger the next one
   *
   * This provides a pseudo-transaction capability, where successful queries can
   * lead to follow-up queries, and failed queries can trigger error handling queries.
   *
   * @template TResults The expected result row types for each query in the chain
   * @param query - Initial query to execute
   * @returns {Promise<{count: number, time: number, results: Array<QueryResult<TResults[number]>>, error?: DAMEngineError}>}
   *          Object containing all query results and any error that occurred
   *
   * @throws {DAMEngineError} Only throws if uncaught errors occur within callbacks
   * @see {@link Query} for query structure including callbacks
   *
   * @example
   * ```typescript
   * const result = await engine.chainedQuery<[
   *   { id: number, name: string },  // First query result type
   *   { affected: number }           // Second query result type
   * ]>({
   *   id: 'find_and_update',
   *   sql: 'SELECT id, name FROM users WHERE email = $email',
   *   params: { email: 'user@example.com' },
   *   onSuccess: (result) => {
   *     const userId = result.data[0]?.id;
   *     if (userId) {
   *       return {
   *         id: 'update_last_login',
   *         sql: 'UPDATE users SET last_login = NOW() WHERE id = $id RETURNING COUNT(*) as affected',
   *         params: { id: userId }
   *       };
   *     }
   *   },
   *   onError: (error) => {
   *     return {
   *       id: 'log_error',
   *       sql: 'INSERT INTO error_log (message) VALUES ($message)',
   *       params: { message: error.message }
   *     };
   *   }
   * });
   * ```
   */
  public async chainedQuery<
    TResults extends readonly Record<string, unknown>[] = [
      Record<string, unknown>,
    ],
  >(query: Query): Promise<{
    count: number;
    time: number;
    results: Array<QueryResult<TResults[number]>>;
    error?: DAMEngineError;
  }> {
    const start = performance.now();
    const results: Array<QueryResult<TResults[number]>> = [];

    try {
      // Ensure the query has an ID
      const queryWithId = {
        ...query,
        id: query.id || this._generateQueryId(),
      };

      // Execute the initial query
      const result = await this.query<TResults[number]>(queryWithId);
      results.push(result);

      // If there's an onSuccess callback, call it with the result
      if (queryWithId.onSuccess) {
        const nextQuery = await queryWithId.onSuccess(result);
        if (nextQuery) {
          // Make sure next query has an ID
          const nextQueryWithId = {
            ...nextQuery,
            id: nextQuery.id || this._generateQueryId(`${queryWithId.id}_next`),
          };

          // Execute the next query in the chain
          const chainResult = await this.chainedQuery<TResults>(
            nextQueryWithId,
          );

          // Add results from the chain
          results.push(...chainResult.results);

          // If a downstream query failed, call onError with all successful results
          if (chainResult.error) {
            if (queryWithId.onError) {
              const fallbackQuery = await queryWithId.onError(
                chainResult.error,
                results,
              );
              if (fallbackQuery) {
                // Make sure fallback query has an ID
                const fallbackQueryWithId = {
                  ...fallbackQuery,
                  id: fallbackQuery.id ||
                    this._generateQueryId(`${queryWithId.id}_fallback`),
                };

                // Execute the fallback query as a new chain
                const fallbackResult = await this.chainedQuery<TResults>(
                  fallbackQueryWithId,
                );

                // Return the final chain result (success or failure)
                return {
                  count: fallbackResult.count,
                  time: performance.now() - start,
                  results: fallbackResult.results,
                  error: fallbackResult.error,
                };
              }
            }

            // No fallback provided, return the error with all successful results
            return {
              count: results.length,
              time: performance.now() - start,
              results,
              error: chainResult.error,
            };
          }
        }
      }

      // Successfully completed the chain
      return {
        count: results.length,
        time: performance.now() - start,
        results,
      };
    } catch (error) {
      // Convert to DAMEngineError if needed
      const queryError = error instanceof DAMEngineError
        ? error
        : new DAMEngineQueryError('Query failed', {
          name: this.name,
          engine: this.Engine,
          query: query,
        }, error as Error);

      // If there's an onError callback, call it with all successful results
      if (query.onError) {
        try {
          const fallbackQuery = await query.onError(queryError, results);
          if (fallbackQuery) {
            // Make sure fallback query has an ID
            const fallbackQueryWithId = {
              ...fallbackQuery,
              id: fallbackQuery.id ||
                this._generateQueryId(`${query.id || 'error'}`),
            };

            // Execute the fallback query as a new chain
            const fallbackResult = await this.chainedQuery<TResults>(
              fallbackQueryWithId,
            );
            return fallbackResult;
          }
        } catch (fallbackError) {
          console.error('Error in fallback handler:', fallbackError);
        }
      }

      // Return the error with any successful results
      return {
        count: results.length,
        time: performance.now() - start,
        results,
        error: queryError,
      };
    }
  }

  /**
   * Executes multiple queries in parallel batches
   *
   * Queries are executed in batches of up to `maxConcurrent` queries at a time.
   * The maximum concurrency is limited by the connection pool size.
   *
   * @template TResults Tuple of result types corresponding to each query
   * @param queries Array of queries to execute
   * @param options Batch execution options
   */
  public async batchQuery<
    TResults extends readonly Record<string, unknown>[] = Record<
      string,
      unknown
    >[],
  >(
    queries: Query[],
    options: {
      /** Whether to continue execution if a query fails */
      continueOnError?: boolean;
    } = {},
  ): Promise<{
    count: number;
    time: number;
    results: {
      [K in keyof TResults]: QueryResult<TResults[K]> | DAMEngineQueryError;
    };
  }> {
    await this.init();
    const { continueOnError = false } = options;
    const start = performance.now();

    // Initialize result array with same length as queries
    const results: Array<QueryResult | DAMEngineQueryError> = new Array(
      queries.length,
    );
    let executedCount = 0;

    for (let i = 0; i < queries.length; i += this._maxConcurrent) {
      const batch = queries.slice(i, i + this._maxConcurrent);
      const batchPromises = batch.map((query, batchIndex) => {
        // Ensure query has an ID
        const queryWithId = {
          ...query,
          id: query.id || this._generateQueryId(`batch_${i}_${batchIndex}`),
        };

        return this.query<TResults[number]>(queryWithId)
          .then((result) => {
            // Store successful result with query metadata
            results[i + batchIndex] = result;
            executedCount++;
            return result;
          })
          .catch((error) => {
            // Store error in results
            const queryError = error instanceof DAMEngineQueryError
              ? error
              : new DAMEngineQueryError('Query failed', {
                name: this.name,
                engine: this.Engine,
                query: { sql: queryWithId.sql, params: queryWithId.params },
                queryId: queryWithId.id,
              }, error as Error);

            results[i + batchIndex] = queryError;
            executedCount++;

            // Re-throw if not continuing on error
            if (!continueOnError) {
              throw queryError;
            }

            return queryError;
          });
      });

      try {
        await Promise.all(batchPromises);
      } catch (_error) {
        if (!continueOnError) {
          // Stop execution and return what we have so far
          break;
        }
        // If continueOnError is true, we already handled individual errors
      }
    }

    return {
      count: executedCount,
      time: performance.now() - start,
      results: results as {
        [K in keyof TResults]: QueryResult<TResults[K]> | DAMEngineQueryError;
      },
    };
  }

  //#region Protected Methods

  //#region Abstract Methods
  /**
   * Initializes the database connection
   * Must be implemented by concrete engine classes
   *
   * @returns {void | Promise<void>} Nothing, or a Promise that resolves when connected
   *
   * @throws {DAMEngineError} When connection fails
   * @protected
   */
  protected abstract _init(): void | Promise<void>;

  /**
   * Finalizes the database connection
   * Must be implemented by concrete engine classes
   *
   * @returns {void | Promise<void>} Nothing, or a Promise that resolves when disconnected
   * @protected
   */
  protected abstract _finalize(): void | Promise<void>;

  /**
   * Checks if the database connection is active
   * Must be implemented by concrete engine classes
   *
   * @returns {boolean | Promise<boolean>} True if connected, false otherwise
   * @protected
   */
  protected abstract _ping(): boolean | Promise<boolean>;

  /**
   * Gets the database server version
   * Must be implemented by concrete engine classes
   *
   * @returns {string | Promise<string>} Database version string
   * @protected
   */
  protected abstract _version(): string | Promise<string>;

  /**
   * Executes a SQL query on the database
   * Must be implemented by concrete engine classes
   *
   * @template T The expected result row type
   * @param sql - SQL statement to execute
   * @param params - Parameters for the SQL statement
   * @returns {{ count: number; data: T[] } | Promise<{ count: number; data: T[] }>}
   *          Object containing count of rows and data array
   *
   * @throws {DAMEngineQueryError} When query execution fails
   * @protected
   */
  protected abstract _query<
    T extends Record<string, unknown> = Record<string, unknown>,
  >(
    query: Query,
  ): { count: number; data: T[] } | Promise<{ count: number; data: T[] }>;
  //#endregion Abstract Methods

  /**
   * Generates a unique query ID
   *
   * @param prefix - Optional prefix to add to the ID
   * @returns {string} A unique ID string
   *
   * @private
   */
  protected _generateQueryId(prefix: string = ''): string {
    const uuid = crypto.randomUUID().replace(/-/g, '').substring(0, 12);
    return prefix ? `${prefix}_${uuid}` : uuid;
  }

  /**
   * Standardizes a query object for execution
   *
   * This method performs several important transformations:
   * 1. Normalizes SQL statements (removing/adding trailing semicolons)
   * 2. Converts QueryParameters instances to plain objects
   * 3. Validates that all parameters referenced in the query are provided
   *
   * @param query - The query to standardize
   * @returns {Query} A standardized query object ready for execution
   *
   * @throws {DAMEngineQueryError} When referenced parameters are missing
   * @protected
   */
  protected _standardizeQuery(query: Query): Query {
    // Remove trailing ; and add it
    const sql = query.sql.trim().replace(/;$/, '') + ';';

    // Always convert params to Record<string, unknown>
    const params = query.params instanceof QueryParameters
      ? query.params.asRecord()
      : query.params || {};

    // Check for missing parameters
    const keys = Object.keys(params);
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
      throw new DAMEngineQueryError('Missing query parameters.', {
        engine: this.Engine,
        name: this.name,
        query: query,
        missing: missing,
      });
    }

    return {
      id: query.id,
      sql: sql,
      params: params,
      onSuccess: query.onSuccess,
      onError: query.onError,
    };
  }

  /**
   * Processes and validates engine options
   *
   * @template K The key of the option being processed
   * @param key - The option key
   * @param value - The option value
   * @returns {O[K]} The processed option value
   *
   * @throws {DAMEngineConfigError} When an option value is invalid
   * @protected
   */
  protected override _processOption<K extends keyof EngineOptions>(
    key: K,
    value: O[K],
  ): O[K] {
    switch (key) {
      case 'slowQueryThreshold':
        // If value is null/undefined, set to 5 seconds
        if (value === null || value === undefined) {
          value = 5 as O[K];
        }
        if (typeof value !== 'number' || value < 0 || value > 60) {
          throw new DAMEngineConfigError(
            'Slow query threshold must be a number between 0 (disable) and 60 seconds.',
            {
              name: this.name || 'N/A',
              engine: this.Engine || 'N/A',
              configKey: key,
              configValue: value,
            },
          );
        }
        break;
      case 'maxConnectAttempts':
        // If value is null/undefined, set to 3 attempts
        if (value === null || value === undefined) {
          value = 3 as O[K];
        }
        if (typeof value !== 'number' || value < 1 || value > 10) {
          throw new DAMEngineConfigError(
            'Max connect attempts must be a number between 1 and 10.',
            {
              name: this.name || 'N/A',
              engine: this.Engine || 'N/A',
              configKey: key,
              configValue: value,
            },
          );
        }
        break;
      case 'engine':
        if (!assertEngine(value)) {
          throw new DAMEngineConfigError(
            'Invalid/unsupported engine.',
            {
              name: this.name || 'N/A',
              engine: this.Engine || 'N/A',
              configKey: key,
              configValue: value,
            },
          );
        }
        break;
      case 'maxConcurrent':
        if (value === null || value === undefined) {
          value = 1 as O[K];
        }
        if (typeof value !== 'number' || value < 1) {
          throw new DAMEngineConfigError(
            'Max concurrent queries must be a positive number.',
            {
              name: this.name || 'N/A',
              engine: this.Engine || 'N/A',
              configKey: key,
              configValue: value,
            },
          );
        }
        break;
    }
    return super._processOption(key, value) as O[K];
  }
  //#endregion Protected Methods
}
