import { OptionKeys } from '../../options/mod.ts';
import { AbstractClient } from '../AbstractConnection.ts';
import type { NormEvents, SQLiteConnectionOptions } from '../types/mod.ts';
import {
  NormBaseError,
  NormConfigError,
  NormConnectionError,
  NormNotConnectedError,
  NormQueryError,
  NormSQLiteWritePermissionError,
  NormQueryMissingParamsError
} from '../errors/mod.ts';

import type { SQLiteDBClientConfig } from '../../dependencies.ts';
import { path, SQLiteDBClient } from '../../dependencies.ts';

type SQLiteParamType = Record<string, boolean | number | bigint | string | null | undefined | Date | Uint8Array>

export class SQLiteClient extends AbstractClient<SQLiteConnectionOptions> {
  private _client: SQLiteDBClient | undefined = undefined;

  constructor(
    name: string,
    options: OptionKeys<SQLiteConnectionOptions, NormEvents>,
  ) {
    const defaults: Partial<SQLiteConnectionOptions> = {
      mode: 'MEMORY',
    };
    if (options.dialect !== 'SQLITE') {
      throw new NormConfigError('Invalid value for dialect passed', {
        name: name,
        dialect: 'SQLITE',
        target: 'dialect',
        value: options.dialect,
      });
    }
    if (options.mode && !['MEMORY', 'FILE'].includes(options.mode)) {
      throw new NormConfigError('Invalid value for mode', {
        name: name,
        dialect: options.dialect,
        target: 'mode',
        value: options.mode,
      });
    }
    if (options.mode === 'FILE') {
      if (!options.filePath) {
        throw new NormConfigError('SQLite DB file must be set in FILE mode', {
          name: name,
          dialect: options.dialect,
          target: 'file',
          value: options.filePath,
        });
      }
      // Append DB name to the path
      const stat = Deno.statSync(options.filePath);
      if (stat.isDirectory) {
        options.filePath = path.join(options.filePath, name + '.sqlite');
      }
      // Check permission
      const dir = path.parse(options.filePath);
      if (
        Deno.permissions.querySync({ name: 'write', path: dir.dir }).state !==
          'granted'
      ) {
        throw new NormSQLiteWritePermissionError({
          name: name,
          dialect: options.dialect,
          path: dir.dir,
        });
      }
    }
    if (options.mode !== 'FILE') {
      options.filePath = undefined;
    }
    super(name, options, defaults);
  }

  protected _connect(): void {
    if (this._status === 'CONNECTED' && this._client !== undefined) {
      return;
    }
    // Ok lets connect
    const opt: SQLiteDBClientConfig = {
      mode: 'create',
      memory: this._getOption('mode') === 'MEMORY' ? true : false,
    };
    // Test connection
    try {
      this._client = new SQLiteDBClient(
        this._getOption('mode') === 'MEMORY'
          ? ':memory:'
          : this._getOption('filePath'),
        opt,
      );
    } catch (err) {
      throw new NormConnectionError(err.message, {
        name: this._name,
        dialect: this.dialect,
      });
    }
  }

  protected _close(): void {
    if (this._status !== 'CONNECTED' || this._client === undefined) {
      return;
    }
    this._client.close();
    this._client = undefined;
  }

  protected _query<
    R extends Record<string, unknown> = Record<string, unknown>,
  >(sql: string, params?: Record<string, unknown>): R[] {
    if (this._status !== 'CONNECTED' || this._client === undefined) {
      throw new NormNotConnectedError({
        name: this._name,
        dialect: this.dialect,
      });
    }
    try {
      sql = this._normaliseQuery(sql, params);
      const res = this._client.queryEntries<R>(
        sql,
        params as SQLiteParamType,
      );
      return res;
    } catch (err) {
      throw new NormQueryError(err.message, {
        name: this._name,
        dialect: this.dialect,
        sql: sql,
      });
    }
  }

  protected _execute(sql: string, params?: Record<string, unknown>): void {
    if (this._status !== 'CONNECTED' || this._client === undefined) {
      throw new NormNotConnectedError({
        name: this._name,
        dialect: this.dialect,
      });
    }
    try {
      sql = this._normaliseQuery(sql, params);
      const res = this._client.queryEntries(sql, params as SQLiteParamType);
    } catch (err) {
      throw new NormQueryError(err.message, {
        name: this._name,
        dialect: this.dialect,
        sql: sql,
      });
    }
  }

  protected _normaliseQuery(sql: string,params?: Record<string,unknown>|undefined): string {
    if(params === undefined) {
      return sql;
    }
    const keys = Object.keys(params);
    // Replace :key: with :key
    sql = sql.replace(/:(\w+):/g, ':$1');
    // Verify that any :key defined exists in params
    const missing: string[] = [];
    const matches = sql.match(/:(\w+)/g);
    if(matches !== null) {
      for(const match of matches) {
        const key = match.substr(1);
        if(!keys.includes(key)) {
          missing.push(key);
        }
      }
    }
    if(missing.length > 0) {
      throw new NormQueryMissingParamsError({ name: this._name, dialect: this.dialect, sql: sql, missing: missing.join(',') });
    }
    return sql;
    // for(const key of keys) {
    //   const value = params[key];
    //   if(typeof value === 'string') {
    //     params[key] = `'${value}'`;
    //   }
    // }
    // return sql.replace(/\?/g, (match) => {
    //   const key = keys.shift();
    //   if(key === undefined) {
    //     return match;
    //   }
    //   return params[key] as string;
    // });
  }
}
