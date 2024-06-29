import {
  fs,
  path,
  SQLiteDBClient,
  type SQLiteDBClientConfig,
  SQLiteDBError,
} from '../../../dependencies.ts';

import { OptionKeys } from '../../../options/mod.ts';
import type { ClientEvents, Query, SQLiteOptions } from '../../types/mod.ts';
import { Client } from '../../Client.ts';
import { assertSQLiteOptions } from '../../asserts/Options.ts';
import {
  DAMClientConfigError,
  DAMClientConnectionError,
} from '../../errors/mod.ts';

/**
 * Represents the type of parameters that can be used in SQLite queries.
 */
type SQLiteParamType = Record<
  string,
  boolean | number | bigint | string | null | undefined | Date | Uint8Array
>;

export class SQLiteClient extends Client<SQLiteOptions> {
  declare readonly dialect = 'MARIA';
  private _client: SQLiteDBClient | undefined = undefined;

  constructor(name: string, options: OptionKeys<SQLiteOptions, ClientEvents>) {
    if (!assertSQLiteOptions(options)) {
      throw new DAMClientConfigError({ dialect: 'SQLITE', configName: name });
    }
    super(name, options);
  }

  public async ping(): Promise<boolean> {
    try {
      await this.query({ sql: 'SELECT 1;' });
      return true;
    } catch (_e) {
      return false;
    }
  }

  protected _standardizeQuery(query: Query): Query {
    const sQuery = super._standardizeQuery(query);
    return {
      sql: sQuery.sql.replace(
        /:(\w+):/g,
        (_, word) => `:${word}`,
      ),
      params: sQuery.params,
    };
  }

  protected _connect(): void {
    if (this._client !== undefined) {
      return;
    }
    const opt: SQLiteDBClientConfig = {
      mode: 'create',
      memory: (this._getOption('mode') === 'MEMORY'),
    };
    // Ensure directory exists and is writable
    try {
      this._client = new SQLiteDBClient(this._initializeDB(), opt);
    } catch (err) {
      this._client = undefined;
      if (err instanceof SQLiteDBError) {
        throw new DAMClientConnectionError(
          {
            dialect: this.dialect,
            configName: this.name,
            errorCode: err.code?.toString() ?? '',
          },
          err,
        );
      }
      throw new DAMClientConnectionError({
        dialect: this.dialect,
        configName: this.name,
      }, err);
    }
  }

  protected _close(): void {
    if (this._status !== 'CONNECTED' || this._client === undefined) {
      return;
    }
    if (!this._client.isClosed) {
      this._client.close();
    }
    this._client = undefined;
  }

  protected _execute<R extends Record<string, unknown>>(
    query: Query,
  ): { count: number; rows: R[] } {
    const sQuery = this._standardizeQuery(query);
    const res = this._client!.queryEntries<R>(
      sQuery.sql,
      sQuery.params as SQLiteParamType,
    );
    return {
      count: res.length,
      rows: res,
    };
  }

  protected async _getVersion(): Promise<string> {
    const res = await this.query<{ Version: string }>(
      { sql: 'SELECT sqlite_version() as "Version";' },
    );
    return res.data[0].Version;
  }

  protected _initializeDB(): string {
    if (this._getOption('mode') === 'MEMORY') {
      return ':memory:';
    }
    const loc = path.join(
        this._getOption('path') || '',
        this.name.toLowerCase(),
      ),
      db = 'main.db';
    fs.ensureDirSync(loc);
    return path.join(loc, db);
  }
}
