import { type OptionKeys } from '../../../options/mod.ts';

import { AbstractClient } from '../../Client.ts';
import { SQLiteTranslator } from './Translator.ts';
import {
  DAMConfigError,
  DAMConnectionError,
  DAMError,
  DAMNotSupported,
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
  /(CREATE|DROP) (SCHEMA|DATABASE) (IF EXISTS |IF NOT EXISTS )?(\w+);$/i;

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
    if (options.mode === 'MEMORY') {
      delete options.path;
    }
    super(name, options);
  }

  protected _standardizeQuery(query: Query): Query {
    query = super._standardizeQuery(query);
    return {
      sql: query.sql.replace(
        /:(\w+):/g,
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
      throw new DAMConfigError(
        'Invalid dialect provided for ${dialect} Client',
        {
          dialect: this.dialect,
          config: this.name,
          item: 'dialect',
          value: options.dialect,
        },
      );
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
    if (options.mode === 'FILE') {
      if (options.path === undefined || options.path?.trim().length === 0) {
        throw new DAMConfigError(
          'Path must be provided for SQLite DB storage',
          {
            dialect: this.dialect,
            config: this.name,
            item: 'path',
            value: options.path,
          },
        );
      }
      this.__verifyPath(options.path);
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
    };
    let file = ':memory:';
    let basePath = '';
    let databases: string[] | undefined = undefined;
    if (this._getOption('mode') === 'FILE') {
      basePath = path.join(
        this._getOption('path') as string,
        this.name.trim().toLowerCase(),
      );
      file = path.join(basePath, 'main.db');
      // Get all files from the path
      databases = this.__getDatabases(basePath);
    }
    try {
      this._client = new SQLiteDBClient(file, opt);
      if (this._getOption('mode') === 'FILE' && databases !== undefined) {
        databases.map((db) => {
          this._client?.execute(
            `ATTACH DATABASE '${path.join(basePath, `${db}.db`)}' AS ${db};`,
          );
        });
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
          throw new DAMNotSupported({
            dialect: this.dialect,
            config: this.name,
            method: 'DATABASE/SCHEMA manipulation',
          });
        } else {
          this.__handleSchema(rawQuery.sql);
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

  //#region Private methods

  /**
   * Helper function to load multiple database found in the base path in
   * SQLite file mode. The main.db is loaded by default, rest is loaded
   * as attached databases.
   *
   * @param basePath string Loads all files in the given path as databases.
   * @returns void
   */
  private __getDatabases(basePath: string) {
    // Do not load databases in memory mode
    if (this._getOption('mode') === 'MEMORY') {
      return;
    }
    const databases: string[] = [];
    for (const file of Deno.readDirSync(basePath)) {
      if (
        file.isFile && file.name.endsWith('.db') && file.name !== 'main.db'
      ) {
        console.log(`Found database: ${file.name}`);
        databases.push(file.name.replace('.db', ''));
      }
    }
    return databases;
  }

  /**
   * Helper function to create a database in SQLite file mode.
   *
   * @param name string The name of the database to create
   */
  private __createDatabase(name: string) {
    name = name.trim();
    if (this._client === undefined || this._client.isClosed) {
      return;
    }
    if (this._getOption('mode') === 'MEMORY') {
      throw new DAMNotSupported({
        dialect: this.dialect,
        config: this.name,
        method: 'DATABASE/SCHEMA manipulation',
      });
    }
    if (name === null || ['main', 'temp'].includes(name)) {
      throw new DAMNotSupported({
        dialect: this.dialect,
        config: this.name,
        method: `CREATE ${name} database`,
      });
    }
    const basePath = path.join(
      this._getOption('path')!,
      this.name.trim().toLowerCase(),
    );
    fs.ensureFileSync(
      path.join(
        basePath,
        `${name}.db`,
      ),
    );
    this._client.execute(
      `ATTACH DATABASE '${path.join(basePath, `${name}.db`)}' AS ${name};`,
    );
  }

  /**
   * Helper function to drop a database in SQLite file mode.
   *
   * @param name string The name of the database to drop
   */
  private __dropDatabase(name: string) {
    if (this._client === undefined || this._client.isClosed) {
      return;
    }
    name = name.trim();
    if (this._getOption('mode') === 'MEMORY') {
      throw new DAMNotSupported({
        dialect: this.dialect,
        config: this.name,
        method: 'DATABASE/SCHEMA manipulation',
      });
    }
    if (name === null || ['main', 'temp'].includes(name)) {
      throw new DAMNotSupported({
        dialect: this.dialect,
        config: this.name,
        method: `DROP ${name} database`,
      });
    }
    const basePath = path.join(
      this._getOption('path')!,
      this.name.trim().toLowerCase(),
    );
    this._client.execute(`DETACH DATABASE ${name};`);
    this.execute({
      sql: `DETACH DATABASE ${name};`,
    });
    Deno.removeSync(path.join(basePath, `${name}.db`));
  }

  /**
   * Special function to handle creation and deletion of schemas in SQLite
   * file mode.
   * *NOTE*: This function is only called when the client is in FILE mode.
   *
   * @param sql The SQL Statement
   * @throws {DAMQueryError} If an error occurs during schema handling.
   */
  private __handleSchema(sql: string) {
    const match = SchemaRegex.exec(sql);
    if (match) {
      const schemaName = match[4].trim();
      if (match[1].toUpperCase() === 'CREATE') {
        this.__createDatabase(schemaName);
      } else if (match[1].toUpperCase() === 'DROP') {
        this.__dropDatabase(schemaName);
      }
    }
  }

  /**
   * Checks if the storage path exists and can be used to store SQLite DB files.
   *
   * @param basePath string The path where the SQLite DB files are stored
   * @throws {DAMConfigError} If the path is invalid or does not exist.
   * @returns void
   */
  private __verifyPath(basePath: string) {
    // Verify path
    try {
      const st = Deno.statSync(basePath);
      if (!st.isDirectory) {
        throw new DAMConfigError('Path must be a directory', {
          dialect: this.dialect,
          config: this.name,
          item: 'path',
          value: basePath,
        });
      }
      // create main.db file
      fs.ensureFileSync(
        path.join(
          basePath,
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
            value: basePath,
          },
          e,
        );
      }
      if (e instanceof Deno.errors.NotFound) {
        throw new DAMConfigError('Path does not exist', {
          dialect: this.dialect,
          config: this.name,
          item: 'path',
          value: basePath,
        }, e);
      }
    }
  }
  //#endregion Private methods
}
