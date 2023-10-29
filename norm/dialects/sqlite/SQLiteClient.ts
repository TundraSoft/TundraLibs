import type { OptionKeys } from '../../../options/mod.ts';
import { AbstractClient } from '../../AbstractClient.ts';
import { SQLiteDBClient } from '../../../dependencies.ts';
import type { SQLiteDBClientConfig } from '../../../dependencies.ts';

import type {
  ClientEvents,
  QueryResult,
  SQLiteClientOptions,
} from '../../types/mod.ts';

import {
  NormConfigError,
  NormNoActiveConnectionError,
} from '../../errors/mod.ts';

export class SQLiteClient extends AbstractClient<SQLiteClientOptions> {
  protected _client: SQLiteDBClient | undefined = undefined;

  constructor(
    name: string,
    options: OptionKeys<SQLiteClientOptions, ClientEvents>,
  ) {
    const opt = {
      ...{ mode: 'create', type: 'memory', path: ':MEMORY:' },
      ...options,
    };
    super(name, opt);
  }

  protected _verifyConfig() {
    if (
      this._getOption('type') === 'FILE' &&
      this._getOption('path') === ':MEMORY:'
    ) {
      throw new NormConfigError(
        'Invalid configuration. Cannot use FILE type with in-memory path.',
        { config: this.name, dialect: this.dialect },
      );
    }
    if (this._getOption('type') === 'FILE') {
      const readPerm = Deno.permissions.querySync({
          name: 'read',
          path: this._getOption('path'),
        }),
        writePerm = Deno.permissions.querySync({
          name: 'write',
          path: this._getOption('path'),
        });
      if (this._getOption('mode') === 'read' && readPerm.state === 'denied') {
        throw new NormConfigError(
          'Invalid configuration. Cannot use read mode with insufficient permissions.',
          { config: this.name, dialect: this.dialect },
        );
      }
      if (this._getOption('mode') === 'write' && writePerm.state === 'denied') {
        throw new NormConfigError(
          'Invalid configuration. Cannot use write mode with insufficient permissions.',
          { config: this.name, dialect: this.dialect },
        );
      }
    }
  }

  protected _connect(): void {
    if (this._client === undefined) {
      const opt: SQLiteDBClientConfig = {
          mode: this._getOption('mode'),
          memory: this._getOption('type') === 'MEMORY',
        },
        dbPath = (this._getOption('type') === 'MEMORY')
          ? ':MEMORY:'
          : this._getOption('path');
      this._client = new SQLiteDBClient(dbPath, opt);
    }
  }

  protected _disconnect(): void {
    if (this._client !== undefined) {
      this._client.close();
      this._client = undefined;
    }
  }

  protected _version(): string {
    const qry = 'SELECT sqlite_version() as VERSION;';
    const res = this._query<{ VERSION: string }>(qry);
    return res[0].VERSION;
  }

  protected _query<T extends Record<string, unknown>>(sql: string): T[] {
    if (this._client === undefined) {
      throw new NormNoActiveConnectionError({
        config: this.name,
        dialect: this.dialect,
      });
    }
    return this._client.queryEntries<T>(sql);
  }

  protected _execute(sql: string): void {
    if (this._client === undefined) {
      throw new NormNoActiveConnectionError({
        config: this.name,
        dialect: this.dialect,
      });
    }
    this._client.execute(sql);
  }
}

// Path: norm/dialects/sqlite/SQLiteClient.ts
