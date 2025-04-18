import { ClientOptions, Pool } from '$postgres2';
import { EventOptionKeys } from '@tundralibs/utils';
import { AbstractEngine } from '../AbstractEngine.ts';
import { DAMEngineConfigError } from '../errors/mod.ts';
import {
  PostgresEngineConnectError,
  PostgresEngineQueryError,
} from './errors/mod.ts';
import type { EngineEvents } from '../types/mod.ts';
import type { PostgresEngineOptions } from './types/mod.ts';
import type { Query } from '../../query/types/mod.ts';
import { QueryParameters } from '../../query/mod.ts';

/**
 * PostgreSQL database engine implementation
 *
 * Connects to PostgreSQL databases and provides query execution capabilities.
 * Manages a connection pool for efficient query processing.
 *
 * @extends AbstractEngine<PostgresEngineOptions>
 *
 * @example
 * ```typescript
 * const postgres = new PostgresEngine('main', {
 *   host: 'localhost',
 *   port: 5432,
 *   username: 'postgres',
 *   password: 'password',
 *   database: 'mydb',
 *   poolSize: 5,
 *   idleTimeout: 300
 * });
 *
 * await postgres.init();
 * const result = await postgres.query({
 *   id: 'get_users',
 *   sql: 'SELECT * FROM users'
 * });
 * ```
 *
 * @throws {PostgresEngineConnectError} When connection to PostgreSQL fails
 * @throws {PostgresEngineQueryError} When query execution fails
 * @throws {DAMEngineConfigError} When configuration options are invalid
 */
export class PostgresEngine extends AbstractEngine<PostgresEngineOptions> {
  /** The database engine type identifier */
  public readonly Engine = 'POSTGRES';

  /** PostgreSQL connection pool */
  protected _client: Pool | undefined;

  /** SSL/TLS CA certificates for secure connections */
  protected _caCertificates: string[] = [];

  /** Timer for closing idle connections */
  protected _idleTimer: number | undefined;

  /**
   * Creates a new PostgreSQL engine instance
   *
   * @param name - Unique identifier for this engine instance
   * @param options - PostgreSQL-specific configuration options
   *
   * @throws {DAMEngineConfigError} When required options are missing or invalid
   *
   * @see {@link PostgresEngineOptions} for available options
   */
  constructor(
    name: string,
    options: EventOptionKeys<PostgresEngineOptions, EngineEvents>,
  ) {
    super(name, options, {
      poolSize: 1,
      engine: 'POSTGRES',
      port: 5432,
      idleTimeout: 180, // 3 minutes
    });
    // Dont allow more than poolSize concurrent queries
    if (this._maxConcurrent > (this.getOption('poolSize')! || 1)) {
      this._maxConcurrent = this.getOption('poolSize') || 1;
    }
  }

  //#region Protected Methods
  //#region Abstract Methods
  /**
   * Initializes the PostgreSQL connection
   *
   * Creates a connection pool and verifies connectivity.
   * Sets up idle connection management.
   *
   * @returns {Promise<void>} Promise that resolves when connected
   *
   * @throws {PostgresEngineConnectError} When connection fails
   * @protected
   */
  protected async _init(): Promise<void> {
    try {
      const options: ClientOptions = {
        hostname: this.getOption('host'),
        port: this.getOption('port'),
        user: this.getOption('username'),
        password: this.getOption('password'),
        database: this.getOption('database'),
        applicationName: `DAM-${this.name}`,
        tls: {},
      };
      if (this._caCertificates.length > 0) {
        options.tls!.caCertificates = this._caCertificates;
        options.tls!.enabled = true;
      }
      if (this.getOption('enforceTLS')) {
        options.tls!.enforce = true;
      }
      this._client = new Pool(options, this.getOption('poolSize')!);
      // Connect to the database to check if the connection is valid
      const a = await this._client.connect();
      // release it
      a.release();
      // Start idle watcher to transition to IDLE if no queries run
      this._initIdleWatcher();
    } catch (e) {
      throw new PostgresEngineConnectError(
        {
          name: this.name,
          host: this.getOption('host'),
          port: this.getOption('port'),
          username: this.getOption('username'),
        },
        e as Error,
      );
    }
  }

  /**
   * Finalizes the PostgreSQL connection
   *
   * Closes the connection pool and stops idle timers.
   *
   * @returns {Promise<void>} Promise that resolves when disconnected
   * @protected
   */
  protected async _finalize(): Promise<void> {
    if (this._client) {
      await this._client.end();
      this._stopIdleWatcher();
      this._client = undefined;
    }
  }

  /**
   * Standardizes a query object for PostgreSQL execution
   *
   * Extends the base standardization and performs PostgreSQL-specific conversions:
   * - Converts `:param:` style placeholders to `$param` format for PostgreSQL
   *
   * @param query - The query to standardize
   * @returns {Query} A PostgreSQL-compatible query object
   *
   * @throws {DAMEngineQueryError} When referenced parameters are missing
   * @protected
   * @override
   */
  protected override _standardizeQuery(query: Query): Query {
    const standardQuery = super._standardizeQuery(query);

    // Convert :param: syntax to $param for PostgreSQL
    return {
      ...standardQuery,
      sql: standardQuery.sql.replace(
        /:(\w+):/g,
        (_, word) => `$${word}`,
      ),
    };
  }

  /**
   * Checks if the PostgreSQL connection is active
   *
   * Executes a simple query to verify connection.
   * Uses direct client connection to avoid recursion.
   *
   * @returns {Promise<boolean>} True if connected, false otherwise
   * @protected
   */
  protected async _ping(): Promise<boolean> {
    if (!this._client) return false;

    try {
      // Use direct client connection instead of query method to avoid recursion
      const client = await this._client.connect();
      try {
        await client.queryObject('SELECT 1');
        return true;
      } finally {
        client.release();
      }
    } catch {
      return false;
    }
  }

  /**
   * Gets the PostgreSQL server version
   *
   * Extracts the version number from the version string.
   *
   * @returns {Promise<string>} PostgreSQL version string (e.g., "14.5")
   * @throws {PostgresEngineQueryError} When query fails
   * @protected
   */
  protected async _version(): Promise<string> {
    try {
      const res = await this.query<{ version: string }>({
        sql: 'SELECT version() as version',
      });
      // Extract just the version number using regex
      if (res.data[0]) {
        const v = res.data[0].version;
        // Match the version number using regex
        const match = v.match(/PostgreSQL ([\d.]+)/);
        if (match && match[1]) {
          return match[1];
        }
      }
      return 'N/A';
    } catch {
      return 'N/A';
    }
  }

  /**
   * Executes a SQL query on PostgreSQL
   *
   * Manages connection lifecycle, query execution, and result transformation.
   * Properly handles idle connection management.
   *
   * @template T The expected result row type
   * @param sql - SQL statement to execute
   * @param params - Parameters for the SQL statement
   * @returns {Promise<{ count: number; data: T[] }>} Query results
   *
   * @throws {PostgresEngineQueryError} When query execution fails
   * @protected
   */
  protected async _query<
    T extends Record<string, unknown> = Record<string, unknown>,
  >(
    query: Query,
  ): Promise<{ count: number; data: T[] }> {
    // Ensure we have a client
    if (!this._client) {
      throw new PostgresEngineQueryError({
        name: this.name,
        query: query,
      }, new Error('No database connection'));
    }
    const sql = query.sql;
    const params = (query.params instanceof QueryParameters)
      ? query.params.asRecord()
      : query.params;
    const client = await this._client.connect();
    try {
      // Stop idle timer when a query starts
      this._stopIdleWatcher();
      // Track running queries atomically
      ++this._runningQueries;

      const res = await client.queryObject<T>(sql, params);
      return {
        count: res.rows.length || res.rowCount || 0,
        data: res.rows,
      };
    } catch (e) {
      throw new PostgresEngineQueryError(
        {
          name: this.name,
          query: query,
        },
        e as Error,
      );
    } finally {
      // Decrement running queries counter
      --this._runningQueries;
      client.release(); // Release the client back to the pool

      // Reset the idle timer after query completes,
      // but only if there are no running queries
      this._initIdleWatcher();
    }
  }

  //#endregion Abstract Methods

  /**
   * Initializes the idle connection watcher
   *
   * Sets a timer to finalize the connection after a period of inactivity.
   * Only activates when there are no running queries.
   *
   * @protected
   */
  protected _initIdleWatcher(): void {
    // Clear any existing timer first
    this._stopIdleWatcher();

    // Only set a new timer if we're CONNECTED and have no running queries
    if (this.status === 'CONNECTED' && this._runningQueries === 0) {
      const idleTimeout = this.getOption('idleTimeout')!;
      const idleFunction = () => {
        // Double-check that we still have no running queries
        if (this._runningQueries === 0) {
          // If no queries running, finalize the connection
          this.finalize(); // This will set status to IDLE
        } else {
          // If queries started during timeout, reschedule the timer
          this._initIdleWatcher();
        }
      };
      this._idleTimer = setTimeout(idleFunction.bind(this), idleTimeout * 1000);
    }
  }

  /**
   * Stops the idle connection watcher
   *
   * Clears the timeout to prevent automatic finalization.
   *
   * @protected
   */
  protected _stopIdleWatcher(): void {
    if (this._idleTimer) {
      clearTimeout(this._idleTimer);
      this._idleTimer = undefined;
    }
  }

  /**
   * Validates and processes PostgreSQL-specific options
   *
   * @template K Option key type
   * @param key - The option key to process
   * @param value - The option value to validate
   * @returns {PostgresEngineOptions[K]} The processed option value
   *
   * @throws {DAMEngineConfigError} When an option is invalid
   * @protected
   * @override
   */
  protected override _processOption<K extends keyof PostgresEngineOptions>(
    key: K,
    value: PostgresEngineOptions[K],
  ): PostgresEngineOptions[K] {
    switch (key) {
      case 'idleTimeout':
        if (
          value === null || value === undefined || typeof value !== 'number' ||
          value < 1 || value > 3600
        ) {
          throw new DAMEngineConfigError(
            'Idle timeout must be a number between 1 and 3600 seconds.',
            {
              name: this.name || 'N/A',
              engine: this.Engine || 'N/A',
              configKey: key,
              configValue: value,
            },
          );
        }
        break;
      case 'poolSize':
        if (value === null || value === undefined) {
          value = 1 as PostgresEngineOptions[K];
        }
        if (typeof value !== 'number' || value < 1) {
          throw new DAMEngineConfigError(
            'Pool size must be a positive number.',
            {
              name: this.name || 'N/A',
              engine: this.Engine || 'N/A',
              configKey: key,
              configValue: value,
            },
          );
        }
        break;
      case 'port':
        if (value === null || value === undefined) {
          value = 5432 as PostgresEngineOptions[K];
        }
        if (typeof value !== 'number' || value < 1 || value > 65535) {
          throw new DAMEngineConfigError(
            'Port must be a number between 1 and 65535.',
            {
              name: this.name || 'N/A',
              engine: this.Engine || 'N/A',
              configKey: key,
              configValue: value,
            },
          );
        }
        break;
      case 'username':
      case 'password':
      case 'database':
      case 'host':
        if (!value || typeof value !== 'string' || value.trim().length === 0) {
          throw new DAMEngineConfigError(
            '${configKey} must be a non-empty string.',
            {
              name: this.name || 'N/A',
              engine: this.Engine || 'N/A',
              configKey: key,
              configValue: value,
            },
          );
        }
        break;
      case 'CACertPath':
        if (value && typeof value === 'string' && value.trim().length > 0) {
          try {
            this._caCertificates = [
              Deno.readTextFileSync(value),
            ];
          } catch (error) {
            if (error instanceof Deno.errors.NotFound) {
              throw new DAMEngineConfigError(
                'CACertPath file not found.',
                {
                  name: this.name || 'N/A',
                  engine: this.Engine || 'N/A',
                  configKey: key,
                  configValue: value,
                },
              );
            } else if (
              error instanceof Deno.errors.PermissionDenied ||
              error instanceof Deno.errors.NotCapable
            ) {
              throw new DAMEngineConfigError(
                'Permission denied to read CACertPath file.',
                {
                  name: this.name || 'N/A',
                  engine: this.Engine || 'N/A',
                  configKey: key,
                  configValue: value,
                },
              );
            } else {
              throw new DAMEngineConfigError(
                'Error reading CACertPath file.',
                {
                  name: this.name || 'N/A',
                  engine: this.Engine || 'N/A',
                  configKey: key,
                  configValue: value,
                },
                error as Error,
              );
            }
          }
        }
        break;
      case 'enforceTLS':
        if (value === null || value === undefined) {
          value = false as PostgresEngineOptions[K];
        }
        if (typeof value !== 'boolean') {
          throw new DAMEngineConfigError(
            'Enforce TLS must be a boolean.',
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
    // deno-lint-ignore no-explicit-any
    return super._processOption(key as any, value);
  }
  //#endregion Protected Methods
}
