import { type OptionKeys } from '../../../options/mod.ts';

import { AbstractClient } from '../../Client.ts';
import { SQLiteTranslator } from './Translator.ts';
import {
  DAMConfigError,
  DAMConnectionError,
  DAMError,
  DAMQueryError,
} from '../../errors/mod.ts';
import type { ClientEvents, Query, SQLiteOptions } from '../../types/mod.ts';

import {
  fs,
  path,
  SQLiteDBClient,
  type SQLiteDBClientConfig,
  SQLiteDBError,
} from '../../../dependencies.ts';

// Schema REGEXP
const SchemaRegex =
  /(CREATE|DROP) SCHEMA (IF EXISTS |IF NOT EXISTS )?([^"]+)?"([a-zA-Z0-9_]+)";/i;

/**
 * Represents the type of parameters that can be used in SQLite queries.
 */
type SQLiteParamType = Record<
  string,
  boolean | number | bigint | string | null | undefined | Date | Uint8Array
>;

export class SQLiteClient extends AbstractClient<SQLiteOptions> {
  declare readonly dialect = 'SQLITE';
  public translator = new SQLiteTranslator();
  private _client: SQLiteDBClient | undefined = undefined;

  /**
   * Creates an instance of the SQLiteClient class.
   * @param name - The name of the client.
   * @param options - The options for the SQLite client.
   * @throws {NormConfigError} If the options are invalid.
   */
  constructor(name: string, options: OptionKeys<SQLiteOptions, ClientEvents>) {
    // Validate options
    if (options.mode === 'MEMORY') {
      delete options.path;
    }
    super(name, options);
  }

  protected _standardizeQuery(query: Query): Query {
    query = super._standardizeQuery(query);
    return {
      sql: query.sql.replace(
        /:([a-zA-Z0-9_]+):/g,
        (_, word) => `:${word}`,
      ),
      params: query.params,
    };
  }

  protected _validateConfig(options: SQLiteOptions): void {
    // Call super
    super._validateConfig(options);
    // Validate per this dialect
    if (options.dialect !== 'SQLITE') {
      throw new DAMConfigError('Invalid dialect provided for SQLite Client', {
        dialect: this.dialect,
        config: this.name,
        item: 'dialect',
        value: options.dialect,
      });
    }
    if (!['FILE', 'MEMORY'].includes(options.mode)) {
      throw new DAMConfigError(
        'Incorrect value provided for "Mode" option: ${value}',
        {
          dialect: this.dialect,
          config: this.name,
          item: 'mode',
          value: options.mode,
        },
      );
    }
    if (
      options.mode === 'FILE' &&
      (options.path === undefined || options.path?.trim().length === 0)
    ) {
      throw new DAMConfigError('Path must be provided for SQLite DB storage', {
        dialect: this.dialect,
        config: this.name,
        item: 'path',
        value: options.path,
      });
    }
    // Verify path
    try {
      const st = Deno.statSync(options.path as string);
      if (!st.isDirectory) {
        throw new DAMConfigError('Path must be a directory', {
          dialect: this.dialect,
          config: this.name,
          item: 'path',
          value: options.path,
        });
      }
      // Write dummy file
      fs.ensureFileSync(
        path.join(
          options.path as string,
          this.name.trim().toLowerCase(),
          'main.db',
        ),
      );
    } catch (e) {
      if (e instanceof DAMConfigError) {
        throw e;
      }
      if (e instanceof Deno.errors.PermissionDenied) {
        throw new DAMConfigError(
          'Read/Write permission required for path ${value}',
          {
            dialect: this.dialect,
            config: this.name,
            item: 'path',
            value: options.path,
          },
          e,
        );
      }
      if (e instanceof Deno.errors.NotFound) {
        throw new DAMConfigError('Path does not exist', {
          dialect: this.dialect,
          config: this.name,
          item: 'path',
          value: options.path,
        }, e);
      }
    }
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
      name = this.name.trim().toLowerCase(),
      file = this._getOption('mode') === 'MEMORY'
        ? ':memory:'
        : path.join(this._getOption('path') as string, name, `main.db`);
    try {
      this._client = new SQLiteDBClient(file, opt);
      if (this._getOption('mode') === 'FILE') {
        this._attachDatabases(
          path.join(this._getOption('path') as string, name),
        );
      }
    } catch (e) {
      if (e instanceof DAMError) {
        throw e;
      }
      if (e instanceof SQLiteDBError) {
        throw new DAMConnectionError(
          {
            dialect: this.dialect,
            config: this.name,
            errorCode: e.code?.toString() ?? '',
            errorMessage: e.message,
          },
          e,
        );
      }
      throw new DAMConnectionError(
        { dialect: this.dialect, config: this.name, errorMessage: e.message },
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
  >(query: Query): { count: number; rows: R[] } {
    if (this._status !== 'CONNECTED' || this._client === undefined) {
      throw new Error('Client not connected');
    }
    // Ok lets first build the queries if they are not raw query
    const rawQuery: Query = this._standardizeQuery(
      query,
    );
    try {
      if (SchemaRegex.test(rawQuery.sql)) {
        if (this._getOption('mode') === 'MEMORY') {
          throw new DAMQueryError({
            dialect: this.dialect,
            config: this.name,
            sql: rawQuery.sql,
          }, new Error('Cannot create schema in memory mode'));
        } else {
          this._handleSchema(rawQuery.sql);
          return {
            count: 0,
            rows: [],
          };
        }
      }
      // Ok its normal query
      const res = this._client.queryEntries<R>(
        rawQuery.sql,
        rawQuery.params as SQLiteParamType,
      );
      return {
        count: res.length,
        rows: res,
      };
    } catch (err) {
      throw new DAMQueryError({
        dialect: this.dialect,
        config: this.name,
        sql: rawQuery.sql,
        params: rawQuery.params,
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
  protected _attachDatabases(loc: string) {
    if (this._client === undefined) {
      return;
    }
    for (const file of Deno.readDirSync(loc)) {
      if (
        file.isFile && file.name.endsWith('.db') && file.name !== 'main.db'
      ) {
        this._client.execute(
          `ATTACH DATABASE '${
            path.join(this._getOption('path') as string, name, file.name)
          }' AS ${file.name.replace('.db', '')};`,
        );
      }
    }
  }

  /**
   * Special function to handle creation and deletion of schemas in SQLite
   * file mode.
   * *NOTE*: This function is only called when the client is in FILE mode.
   *
   * @param sql The SQL Statement
   * @throws {DAMQueryError} If an error occurs during schema handling.
   */
  protected _handleSchema(sql: string) {
    const match = SchemaRegex.exec(sql);
    if (match) {
      const schemaName = match[4].trim();
      const filename = path.join(
        this._getOption('path') as string,
        this.name.trim().toLowerCase(),
        `${schemaName.toLowerCase()}.db`,
      );
      if (match[1].toUpperCase() === 'CREATE') {
        if (
          schemaName === null && schemaName === 'main' && schemaName === 'temp'
        ) {
          throw new DAMQueryError({
            dialect: this.dialect,
            config: this.name,
            sql: sql,
          }, new Error('Invalid schema name'));
        }
        fs.ensureFileSync(
          path.join(
            this._getOption('path') as string,
            this.name.trim().toLowerCase(),
            `${schemaName}.db`,
          ),
        );
        // Attach it
        this.execute({
          sql: `ATTACH DATABASE '${filename}' AS ${schemaName};`,
        });
      } else if (match[1].toUpperCase() === 'DROP') {
        if (
          schemaName === null && schemaName === 'main' && schemaName === 'temp'
        ) {
          throw new DAMQueryError({
            dialect: this.dialect,
            config: this.name,
            sql: sql,
          }, new Error('Invalid schema name'));
        }
        this.execute({ sql: `DETACH DATABASE ${schemaName};` });
        Deno.removeSync(filename);
      }
    }
  }
}
