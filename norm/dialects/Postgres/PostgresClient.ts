import {
  PGClient,
  PGPoolClient,
  PostgresError,
} from '../../../dependencies.ts';
import type { PGClientOptions } from '../../../dependencies.ts';

import type { OptionKeys } from '../../../options/mod.ts';
import { AbstractClient } from '../../AbstractClient.ts';
import type { ClientEvents, PostgresOptions } from '../../types/mod.ts';

import {
  NormClientError,
  NormConfigError,
  NormQueryError,
} from '../../errors/mod.ts';

/**
 * Represents a Postgres client for executing queries and managing connections.
 * @template T - The type of options for the Postgres client.
 */
export class PostgresClient extends AbstractClient<PostgresOptions> {
  private _client: PGClient | undefined = undefined;

  /**
   * Creates an instance of the PostgresClient class.
   * @param name - The name of the client.
   * @param options - The options for the SQLite client.
   * @throws {NormConfigError} If the options are invalid.
   */
  constructor(
    name: string,
    options: OptionKeys<PostgresOptions, ClientEvents>,
  ) {
    // Validate options
    const def: Partial<PostgresOptions> = {
      port: 5432,
      slowQueryThreshold: 5, // seconds
      poolSize: 10,
    } as Partial<PostgresOptions>;
    options = { ...def, ...options };
    if (options.dialect !== 'POSTGRES') {
      throw new NormConfigError(
        `Invalid/incorrect dialect '${options.dialect}'.`,
        { config: name, configItem: 'dialect' },
      );
    }
    if (options.host === undefined) {
      throw new NormConfigError(`Hostname is required`, {
        config: name,
        dialect: options.dialect,
        configItem: 'host',
      });
    }
    if (options.port === undefined) {
      throw new NormConfigError(`Port is required`, {
        config: name,
        dialect: options.dialect,
        configItem: 'port',
      });
    }
    if (options.port < 1 || options.port > 65535) {
      throw new NormConfigError(`Port value must be between 1 and 65535`, {
        config: name,
        dialect: options.dialect,
        configItem: 'port',
      });
    }
    if (options.username === undefined) {
      throw new NormConfigError(`Postgres user is required`, {
        config: name,
        dialect: options.dialect,
        configItem: 'user',
      });
    }
    if (options.password === undefined) {
      throw new NormConfigError(`Postgres password is required`, {
        config: name,
        dialect: options.dialect,
        configItem: 'password',
      });
    }
    if (options.database === undefined) {
      throw new NormConfigError(`Postgres database is required`, {
        config: name,
        dialect: options.dialect,
        configItem: 'database',
      });
    }
    if (options.poolSize === undefined) {
      throw new NormConfigError(`Postgres pool size is required`, {
        config: name,
        dialect: options.dialect,
        configItem: 'poolSize',
      });
    }
    if (options.poolSize < 1) {
      throw new NormConfigError(`Postgres pool size must be greater than 0`, {
        config: name,
        dialect: options.dialect,
        configItem: 'poolSize',
      });
    }
    super(name, options);
  }

  /**
   * Connects to the Postgres database.
   * If the client is already connected, this method does nothing.
   */
  protected async _connect() {
    if (this._status === 'CONNECTED' && this._client !== undefined) {
      return;
    }
    // Ok lets connect
    const opt: PGClientOptions = {
      applicationName: this._name,
      connection: {
        attempts: 1,
        interval: 500,
      },
      hostname: this._getOption('host'),
      port: this._getOption('port'),
      user: this._getOption('username'),
      password: this._getOption('password'),
      database: this._getOption('database'),
      host_type: 'tcp',
      tls: this._getOption('tls'),
    };
    this._client = new PGClient(opt, this._getOption('poolSize') || 10, true);
    let client: PGPoolClient | undefined = undefined;
    // Test connection
    try {
      client = await this._client.connect();
    } catch (err) {
      if (err instanceof PostgresError) {
        // 28P01: invalid password or user
        // 3D000: database does not exist
        //
        console.log(err.fields.code);
      } else if (err.name === 'ConnectionRefused') {
        console.log('Possibly invalid host or port');
      }
      console.log(err);
      throw err;
    } finally {
      if (client) {
        client.release();
      }
    }
    // if (e instanceof NormBaseError) {
    //   throw e;
    // }
    // if (e instanceof SQLiteDBError) {
    //   throw new NormClientError(e.message, {
    //     config: this.name,
    //     dialect: this.dialect,
    //     code: e.code.toString(),
    //   });
    // }
    // throw new NormClientError(e.message, {
    //   config: this.name,
    //   dialect: this.dialect,
    //   code: 'N/A',
    // });
  }

  /**
   * Closes the connection to the Postgres database.
   * If the client is not connected or the connection is already closed, this method does nothing.
   */
  protected async _close() {
    if (this._status !== 'CONNECTED' || this._client === undefined) {
      return;
    }
    await this._client.end();
    this._client = undefined;
  }

  /**
   * Executes a query against the Postgres database and returns the result.
   * @param sql - The SQL query to execute.
   * @param params - The parameters for the query.
   * @returns The result of the query.
   * @throws {NormClientError} If there is no active connection.
   * @throws {NormQueryError} If there is an error executing the query.
   */
  protected async _query<
    R extends Record<string, unknown> = Record<string, unknown>,
  >(sql: string, params?: Record<string, unknown>): Promise<R[]> {
    if (this._status !== 'CONNECTED' || this._client === undefined) {
      throw new NormClientError(`No active connection`, {
        config: this._name,
        dialect: this.dialect,
      });
    }
    const client = await this._client.connect();
    try {
      const res = await client.queryObject<R>(
        sql,
        params,
      );
      return res.rows;
    } catch (err) {
      if (err instanceof PostgresError) {
        throw new NormQueryError(err.message, { sql, params }, {
          config: this._name,
          dialect: this.dialect,
          code: err.cause?.toString(),
        });
      }
      throw new NormQueryError(err.message, { sql, params }, {
        config: this._name,
        dialect: this.dialect,
      });
    }
  }

  /**
   * Executes a SQL statement against the Postgres database.
   * @param sql - The SQL statement to execute.
   * @param params - The parameters for the statement.
   * @throws {NormClientError} If there is no active connection.
   * @throws {NormQueryError} If there is an error executing the statement.
   */
  protected async _execute(
    sql: string,
    params?: Record<string, unknown>,
  ): Promise<void> {
    if (this._status !== 'CONNECTED' || this._client === undefined) {
      throw new NormClientError(`No active connection`, {
        config: this._name,
        dialect: this.dialect,
      });
    }
    const client = await this._client.connect();
    try {
      client.queryObject(sql, params);
    } catch (err) {
      if (err instanceof PostgresError) {
        throw new NormQueryError(err.message, { sql, params }, {
          config: this._name,
          dialect: this.dialect,
          code: err.cause?.toString(),
        });
      }
      throw new NormQueryError(err.message, { sql, params }, {
        config: this._name,
        dialect: this.dialect,
      });
    }
  }

  /**
   * Sanitizes a SQL query by ensuring all params are present and also takes care of correct
   * parameter syntax.
   * @param sql - The SQL query to sanitize.
   * @param params - The parameters for the query.
   * @returns The sanitized SQL query.
   */
  protected override _sanitizeQuery(
    sql: string,
    params?: Record<string, unknown> | undefined,
  ): string {
    sql = super._sanitizeQuery(sql, params);
    return sql.replace(/:(\w+):/g, '\$$1');
  }
}
