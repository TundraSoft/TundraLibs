import { createPool, Pool, type PoolConfig } from '$maria';
import { EventOptionKeys } from '@tundralibs/utils';
import { AbstractEngine } from '../AbstractEngine.ts';
import { DAMEngineConfigError } from '../errors/mod.ts';
import {
  MariaEngineConnectError,
  MariaEngineQueryError,
} from './errors/mod.ts';
import type { EngineEvents } from '../types/mod.ts';
import type { MariaEngineOptions } from './types/mod.ts';
import type { Query } from '../../query/types/mod.ts';
import { QueryParameters } from '../../query/mod.ts';

/**
 * MariaDB database engine implementation
 *
 * Connects to MariaDB/MySQL databases and provides query execution capabilities.
 * Manages a connection pool for efficient query processing.
 *
 * @extends AbstractEngine<MariaEngineOptions>
 *
 * @example
 * ```typescript
 * const mariaDb = new MariaEngine('main', {
 *   host: 'localhost',
 *   port: 3306,
 *   username: 'root',
 *   password: 'password',
 *   database: 'mydb',
 *   poolSize: 5,
 *   idleTimeout: 180
 * });
 *
 * await mariaDb.init();
 * const result = await mariaDb.query({
 *   id: 'get_users',
 *   sql: 'SELECT * FROM users'
 * });
 * ```
 *
 * @throws {MariaEngineConnectError} When connection to MariaDB fails
 * @throws {MariaEngineQueryError} When query execution fails
 * @throws {DAMEngineConfigError} When configuration options are invalid
 */
export class MariaEngine extends AbstractEngine<MariaEngineOptions> {
  /** The database engine type identifier */
  public readonly Engine = 'MARIA';

  /** MariaDB connection pool */
  protected _client: Pool | undefined;

  /** SSL/TLS CA certificates for secure connections */
  protected _caCertificates: string[] = [];

  /**
   * Creates a new MariaDB engine instance
   *
   * @param name - Unique identifier for this engine instance
   * @param options - MariaDB-specific configuration options
   *
   * @throws {DAMEngineConfigError} When required options are missing or invalid
   *
   * @see {@link MariaEngineOptions} for available options
   */
  constructor(
    name: string,
    options: EventOptionKeys<MariaEngineOptions, EngineEvents>,
  ) {
    super(name, options, {
      poolSize: 1,
      engine: 'MARIA',
      port: 3306,
      idleTimeout: 180, // 3 minutes
      connectionTimeout: 30, // 30 seconds
    });
    // Dont allow more than poolSize concurrent queries
    if (this._maxConcurrent > (this.getOption('poolSize')! ?? 1)) {
      this._maxConcurrent = this.getOption('poolSize') ?? 1;
    }
  }

  /**
   * Initializes the MariaDB connection
   *
   * Creates a connection pool and verifies connectivity.
   *
   * @returns {Promise<void>} Promise that resolves when connected
   *
   * @throws {MariaEngineConnectError} When connection fails
   * @protected
   */
  protected async _init(): Promise<void> {
    try {
      const options: PoolConfig = {
        host: this.getOption('host'),
        port: this.getOption('port'),
        user: this.getOption('username'),
        password: this.getOption('password'),
        database: this.getOption('database'),
        connectionLimit: this.getOption('poolSize')!,
        namedPlaceholders: true,
        idleTimeout: this.getOption('idleTimeout')!,
      };
      if (this._caCertificates.length > 0) {
        options.ssl.caCertificates = this._caCertificates;
      }
      if (this.getOption('enforceTLS') === true) {
        options.ssl.enforceTLS = true;
      }
      this._client = createPool(options);
      const a = await this._client.getConnection();
      await a.ping();
      await a.release();
    } catch (e) {
      throw new MariaEngineConnectError(
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
   * Finalizes the MariaDB connection
   *
   * Closes the connection pool and releases all resources.
   *
   * @returns {Promise<void>} Promise that resolves when disconnected
   * @protected
   */
  protected async _finalize(): Promise<void> {
    if (this._client) {
      await this._client.end();
      this._client = undefined;
    }
  }

  /**
   * Standardizes a query object for MariaDB execution
   *
   * Extends the base standardization and performs MariaDB-specific conversions:
   * - Converts `:param:` style placeholders to `:param` format for MariaDB named parameters
   *
   * @param query - The query to standardize
   * @returns {Query} A MariaDB-compatible query object
   *
   * @throws {DAMEngineQueryError} When referenced parameters are missing
   * @protected
   * @override
   */
  protected override _standardizeQuery(query: Query): Query {
    const standardQuery = super._standardizeQuery(query);

    // Convert :param: syntax to :param for MariaDB named parameters using RegExp.exec
    let sql = standardQuery.sql;
    const paramRegex = /:(\w+):/g;
    let match;
    while ((match = paramRegex.exec(sql)) !== null) {
      const fullMatch = match[0];
      const paramName = match[1];
      sql = sql.replace(fullMatch, `:${paramName}`);
      // Reset lastIndex to account for string length changes
      paramRegex.lastIndex = 0;
    }

    return {
      ...standardQuery,
      sql,
    };
  }

  /**
   * Checks if the MariaDB connection is active
   *
   * Executes a ping command to verify connection status.
   * Uses a direct connection to avoid recursion.
   *
   * @returns {Promise<boolean>} True if connected, false otherwise
   * @protected
   */
  protected async _ping(): Promise<boolean> {
    if (!this._client) return false;

    try {
      // Use direct client connection instead of query method to avoid recursion
      const client = await this._client.getConnection();
      try {
        await client.ping();
        return true;
      } finally {
        client.release();
      }
    } catch {
      return false;
    }
  }

  /**
   * Gets the MariaDB server version
   *
   * Extracts the version number from the version string.
   *
   * @returns {Promise<string>} MariaDB version string (e.g., "10.6.12")
   * @throws {MariaEngineQueryError} When query fails
   * @protected
   */
  protected async _version(): Promise<string> {
    try {
      const res = await this.query<{ version: string }>({
        sql: 'SELECT VERSION() as version',
      });
      // Extract just the version number using RegExp.exec
      if (res.data[0]) {
        const v = res.data[0].version;
        const versionRegex = /\d+\.\d+(\.\d+)?/;
        const match = versionRegex.exec(v);
        return match ? match[0].trim() : 'N/A';
      }
      return 'N/A';
    } catch {
      return 'N/A';
    }
  }

  /**
   * Executes a SQL query on MariaDB
   *
   * Manages connection lifecycle, query execution, and result transformation.
   * Handles both query (SELECT) and modification (INSERT/UPDATE/DELETE) statements.
   *
   * @template T The expected result row type
   * @param query - Query to execute
   * @returns {Promise<{ count: number; data: T[] }>} Query results
   *          For SELECT queries, data contains the result rows
   *          For INSERT queries, data may contain the insertId
   *
   * @throws {MariaEngineQueryError} When query execution fails
   * @protected
   */
  protected async _query<
    T extends Record<string, unknown> = Record<string, unknown>,
  >(
    query: Query,
  ): Promise<{ count: number; data: T[] }> {
    // Ensure we have a client
    if (!this._client) {
      throw new MariaEngineQueryError({
        name: this.name,
        query: query,
      }, new Error('No database connection'));
    }

    const sql = query.sql;
    const params = (query.params instanceof QueryParameters)
      ? query.params.asRecord()
      : query.params;

    const conn = await this._client.getConnection();
    try {
      // Track running queries
      ++this._runningQueries;

      // Execute the query
      let res = await conn.query<Array<T>>(sql, params);
      let rowCount = 0;
      if (Array.isArray(res)) {
        rowCount = res.length;
      } else if (Object.keys(res).includes('affectedRows')) {
        rowCount = res['affectedRows'] as number;
        res = [];
      }
      return {
        count: rowCount,
        data: res,
      };
    } catch (e) {
      throw new MariaEngineQueryError(
        {
          name: this.name,
          query: query,
        },
        e as Error,
      );
    } finally {
      --this._runningQueries;
      conn.release();
    }
  }

  /**
   * Validates and processes MariaDB-specific options
   *
   * @template K Option key type
   * @param key - The option key to process
   * @param value - The option value to validate
   * @returns {MariaEngineOptions[K]} The processed option value
   *
   * @throws {DAMEngineConfigError} When an option is invalid
   * @protected
   * @override
   */
  protected override _processOption<K extends keyof MariaEngineOptions>(
    key: K,
    value: MariaEngineOptions[K],
  ): MariaEngineOptions[K] {
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
      case 'connectionTimeout':
        if (
          value === null || value === undefined || typeof value !== 'number' ||
          value < 1 || value > 300
        ) {
          throw new DAMEngineConfigError(
            'Connection timeout must be a number between 1 and 300 seconds.',
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
        value ??= 1 as MariaEngineOptions[K];
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
        value ??= 3306 as MariaEngineOptions[K];
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
            `${key} must be a non-empty string.`,
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
        value ??= false as MariaEngineOptions[K];
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
}
