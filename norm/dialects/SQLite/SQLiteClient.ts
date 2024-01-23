import type { SQLiteDBClientConfig } from '../../../dependencies.ts';
import { path, SQLiteDBClient, SQLiteDBError } from '../../../dependencies.ts';

import type { OptionKeys } from '../../../options/mod.ts';
import { AbstractClient } from '../../AbstractClient.ts';
import type { ClientEvents, SQLiteOptions } from '../../types/mod.ts';

import {
  NormBaseError,
  NormClientError,
  NormConfigError,
  NormQueryError,
} from '../../errors/mod.ts';

/**
 * Represents the type of parameters that can be used in SQLite queries.
 */
type SQLiteParamType = Record<
  string,
  boolean | number | bigint | string | null | undefined | Date | Uint8Array
>;

/**
 * Represents a SQLite client for executing queries and managing connections.
 * @template T - The type of options for the SQLite client.
 */
export class SQLiteClient extends AbstractClient<SQLiteOptions> {
  private _client: SQLiteDBClient | undefined = undefined;

  /**
   * Creates an instance of the SQLiteClient class.
   * @param name - The name of the client.
   * @param options - The options for the SQLite client.
   * @throws {NormConfigError} If the options are invalid.
   */
  constructor(name: string, options: OptionKeys<SQLiteOptions, ClientEvents>) {
    // Validate options
    if (options.mode === undefined) {
      throw new NormConfigError(`SQLite mode is required`, {
        config: name,
        dialect: options.dialect,
        configItem: 'mode',
      });
    }
    if (!['MEMORY', 'FILE'].includes(options.mode)) {
      throw new NormConfigError(
        `SQLite mode: ${options.mode} is not supported`,
        { config: name, dialect: options.dialect, configItem: 'mode' },
      );
    }
    if (['FILE'].includes(options.mode)) {
      if (options.path === undefined) {
        throw new NormConfigError(`SQLite path is required`, {
          config: name,
          dialect: options.dialect,
          configItem: 'path',
        });
      }
      // Ok check if the path is writable
      const stat = Deno.statSync(options.path);
      if (!stat.isDirectory) {
        throw new NormConfigError(
          `SQLite path: ${options.path} is not a directory`,
          { config: name, dialect: options.dialect, configItem: 'path' },
        );
        // options.path = path.join(options.path, name + '.sqlite');
      }
      // Check permission
      const perm = Deno.permissions.querySync({
        name: 'write',
        path: options.path,
      });
      if (perm.state !== 'granted') {
        throw new NormConfigError(
          `SQLite path: ${options.path} is not writable`,
          { config: name, dialect: options.dialect, configItem: 'path' },
        );
      }
    }
    if (options.mode === 'MEMORY') {
      delete options.path;
    }
    super(name, options);
  }

  /**
   * Connects to the SQLite database.
   * If the client is already connected, this method does nothing.
   */
  protected _connect() {
    if (this.status === 'CONNECTED' && this._client !== undefined) {
      return;
    }
    const opt: SQLiteDBClientConfig = {
        mode: 'create',
        memory: (this._getOption('mode') === 'MEMORY'),
      },
      name = this.name,
      file = this._getOption('mode') === 'MEMORY'
        ? ':memory:'
        : path.join(this._getOption('path') as string, `${name}.db`);
    try {
      this._client = new SQLiteDBClient(file, opt);
    } catch (e) {
      if (e instanceof NormBaseError) {
        throw e;
      }
      if (e instanceof SQLiteDBError) {
        throw new NormClientError(e.message, {
          config: this.name,
          dialect: this.dialect,
          code: e.code.toString(),
        });
      }
      throw new NormClientError(e.message, {
        config: this.name,
        dialect: this.dialect,
        code: 'N/A',
      });
    }
  }

  /**
   * Closes the connection to the SQLite database.
   * If the client is not connected or the connection is already closed, this method does nothing.
   */
  protected _close() {
    if (this._status !== 'CONNECTED' || this._client === undefined) {
      return;
    }
    if (!this._client.isClosed) {
      this._client.close();
    }
    this._client = undefined;
  }

  /**
   * Executes a query against the SQLite database and returns the result.
   * @param sql - The SQL query to execute.
   * @param params - The parameters for the query.
   * @returns The result of the query.
   * @throws {NormClientError} If there is no active connection.
   * @throws {NormQueryError} If there is an error executing the query.
   */
  protected _query<
    R extends Record<string, unknown> = Record<string, unknown>,
  >(sql: string, params?: Record<string, unknown>): R[] {
    if (this._status !== 'CONNECTED' || this._client === undefined) {
      throw new NormClientError(`No active connection`, {
        config: this._name,
        dialect: this.dialect,
      });
    }
    try {
      const res = this._client.queryEntries<R>(
        sql,
        params as SQLiteParamType,
      );
      return res;
    } catch (err) {
      if (err instanceof SQLiteDBError) {
        throw new NormQueryError(err.message, { sql, params }, {
          config: this._name,
          dialect: this.dialect,
          code: err.code.toString(),
        });
      }
      throw new NormQueryError(err.message, { sql, params }, {
        config: this._name,
        dialect: this.dialect,
        code: 'N/A',
      });
    }
  }

  /**
   * Executes a SQL statement against the SQLite database.
   * @param sql - The SQL statement to execute.
   * @param params - The parameters for the statement.
   * @throws {NormClientError} If there is no active connection.
   * @throws {NormQueryError} If there is an error executing the statement.
   */
  protected _execute(sql: string, params?: Record<string, unknown>): void {
    if (this._status !== 'CONNECTED' || this._client === undefined) {
      throw new NormClientError(`No active connection`, {
        config: this._name,
        dialect: this.dialect,
      });
    }
    try {
      this._client.queryEntries(sql, params as SQLiteParamType);
    } catch (err) {
      if (err instanceof SQLiteDBError) {
        throw new NormQueryError(err.message, { sql, params }, {
          config: this._name,
          dialect: this.dialect,
          code: err.code.toString(),
        });
      }
      throw new NormQueryError(err.message, { sql, params }, {
        config: this._name,
        dialect: this.dialect,
        code: 'N/A',
        sql: sql,
        params:
          (typeof params === 'object' ? JSON.stringify(params) : undefined),
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
    return sql.replace(/:(\w+):/g, ':$1');
  }
}
