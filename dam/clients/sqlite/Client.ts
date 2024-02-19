import { type OptionKeys } from '../../../options/mod.ts';

import { AbstractClient } from '../../Client.ts';
import { SQLiteTranslator } from './Translator.ts';
import {
  DAMBaseError,
  DAMClientError,
  DAMConfigError,
} from '../../errors/mod.ts';
import type { ClientEvents, Query, SQLiteOptions } from '../../types/mod.ts';

import {
  path,
  SQLiteDBClient,
  type SQLiteDBClientConfig,
  SQLiteDBError,
} from '../../../dependencies.ts';

/**
 * Represents the type of parameters that can be used in SQLite queries.
 */
type SQLiteParamType = Record<
  string,
  boolean | number | bigint | string | null | undefined | Date | Uint8Array
>;

export class SQLiteClient extends AbstractClient<SQLiteOptions> {
  protected _translator = new SQLiteTranslator();
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
      throw new DAMConfigError(`SQLite mode is required`, {
        name: name,
        dialect: options.dialect,
        item: 'mode',
      });
    }
    if (!['MEMORY', 'FILE'].includes(options.mode)) {
      throw new DAMConfigError(
        `SQLite mode: ${options.mode} is not supported`,
        { name: name, dialect: options.dialect, item: 'mode' },
      );
    }
    if (['FILE'].includes(options.mode)) {
      if (options.path === undefined) {
        throw new DAMConfigError(`SQLite path is required`, {
          name: name,
          dialect: options.dialect,
          item: 'path',
        });
      }
      // Ok check if the path is writable
      const stat = Deno.statSync(options.path);
      if (!stat.isDirectory) {
        throw new DAMConfigError(
          `SQLite path: ${options.path} is not a directory`,
          { name: name, dialect: options.dialect, item: 'path' },
        );
        // options.path = path.join(options.path, name + '.sqlite');
      }
      // Check permission
      const perm = Deno.permissions.querySync({
        name: 'write',
        path: options.path,
      });
      if (perm.state !== 'granted') {
        throw new DAMConfigError(
          `SQLite path: ${options.path} is not writable`,
          { name: name, dialect: options.dialect, item: 'path' },
        );
      }
    }
    if (options.mode === 'MEMORY') {
      delete options.path;
    }
    super(name, options);
  }

  protected _standardizeQuery(query: Query): Query {
    query = super._standardizeQuery(query);
    return {
      sql: query.sql.replace(
        /:([a-zA-Z0-9\_]+):/g,
        (_, word) => `:${word}`,
      ),
      params: query.params,
    };
  }

  //#region Abstract methods
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
      if (e instanceof DAMBaseError) {
        throw e;
      }
      if (e instanceof SQLiteDBError) {
        throw new DAMClientError(
          'Unable to connect to database. Please check config',
          {
            dialect: this.dialect,
            name: this.name,
            code: e.code,
            message: e.message,
          },
          e,
        );
      }
      throw new DAMClientError(
        'Unable to connect to database. Please check config',
        { dialect: this.dialect, name: this.name, message: e.message },
        e,
      );
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

  protected _execute<
    R extends Record<string, unknown> = Record<string, unknown>,
  >(query: Query): { count: bigint; rows: R[] } {
    if (this._status !== 'CONNECTED' || this._client === undefined) {
      throw new Error('Client not connected');
    }
    // Ok lets first build the queries if they are not raw query
    const rawQuery: Query = this._standardizeQuery(
      query,
    );
    try {
      const res = this._client.queryEntries<R>(
        rawQuery.sql,
        rawQuery.params as SQLiteParamType,
      );
      return {
        count: BigInt(res.length),
        rows: res,
      };
    } catch (err) {
      if (err instanceof SQLiteDBError) {
        throw new DAMClientError(err.message, {
          dialect: this.dialect,
          name: this.name,
          code: err.code,
          codeName: err.codeName,
        }, err);
      }
      throw new DAMClientError(err.message, {
        dialect: this.dialect,
        name: this.name,
      }, err);
    }
  }

  protected _isReallyConnected(): boolean {
    return (this.status === 'CONNECTED' && this._client?.isClosed === false);
  }

  protected async _getVersion(): Promise<string> {
    const res = await this.execute<{ Version: string }>({
      sql: 'SELECT sqlite_version() as "Version";',
    });
    return res.data[0].Version;
  }
  //#endregion Abstract methods
}
