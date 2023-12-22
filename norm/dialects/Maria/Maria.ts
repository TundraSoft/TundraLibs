import { OptionKeys } from '../../../options/mod.ts';
import { AbstractClient } from '../../AbstractConnection.ts';
import type { MariaConnectionOptions, NormEvents } from '../../types/mod.ts';
import {
  NormConfigError,
  NormNotConnectedError,
  NormQueryError,
  NormQueryMissingParamsError,
} from '../../errors/mod.ts';

import { MariaDBClient } from '../../../dependencies.ts';
import type {
  MariaDBClientConfig,
  MariaDBResultSet,
} from '../../../dependencies.ts';

export class MariaClient extends AbstractClient<MariaConnectionOptions> {
  private _client: MariaDBClient | undefined = undefined;

  constructor(
    name: string,
    options: OptionKeys<MariaConnectionOptions, NormEvents>,
  ) {
    const defaults: Partial<MariaConnectionOptions> = {
      poolSize: 10,
      port: 3306,
      connectionTimeout: 5000,
      idleTimeout: 10 * 60 * 1000,
    };
    if (options.dialect !== 'MARIA') {
      throw new NormConfigError('Invalid value for dialect passed', {
        name: name,
        dialect: 'MARIA',
        target: 'dialect',
        value: options.dialect,
      });
    }
    if (options.port && (options.port < 0 || options.port > 65535)) {
      throw new NormConfigError('Port value must be between 0 to 65535', {
        name: name,
        dialect: options.dialect,
        target: 'port',
        value: options.port,
      });
    }
    if (options.poolSize && (options.poolSize < 0 || options.poolSize > 100)) {
      throw new NormConfigError('PoolSize must be between 0 to 100', {
        name: name,
        dialect: options.dialect,
        target: 'poolSize',
        value: options.poolSize,
      });
    }
    if (options.database === undefined || options.database.trim() === '') {
      throw new NormConfigError('Invalid value for database', {
        name: name,
        dialect: options.dialect,
        target: 'database',
        value: options.database,
      });
    }
    // Must be valid host?
    if (options.host === undefined || options.host.trim() === '') {
      throw new NormConfigError('Invalid value for host', {
        name: name,
        dialect: options.dialect,
        target: 'host',
        value: options.host,
      });
    }
    super(name, options, defaults);
  }

  protected async _connect(): Promise<void> {
    if (this._status === 'CONNECTED' && this._client !== undefined) {
      return;
    }
    const conf: MariaDBClientConfig = {
      hostname: this._getOption('host'),
      username: this._getOption('username'),
      password: this._getOption('password'),
      db: this._getOption('database'),
      port: this._getOption('port'),
      timeout: this._getOption('connectionTimeout'),
      poolSize: this._getOption('poolSize'),
      idleTimeout: this._getOption('idleTimeout'),
      tls: this._getOption('tls') ? {} : undefined,
    };
    this._client = await new MariaDBClient().connect(conf);
  }

  protected async _close(): Promise<void> {
    if (this._status !== 'CONNECTED' || this._client === undefined) {
      return;
    }
    await this._client.close();
    this._client = undefined;
  }

  protected async _query<
    R extends Record<string, unknown> = Record<string, unknown>,
  >(sql: string, params?: Record<string, unknown>): Promise<R[]> {
    if (this._status !== 'CONNECTED' || this._client === undefined) {
      throw new NormNotConnectedError({
        name: this._name,
        dialect: this.dialect,
      });
    }
    try {
      const declare: Array<string> = [],
        qry = this._normaliseQuery(sql, params);
      if (Object.keys(params ?? {}).length > 0) {
        Object.keys(params ?? {}).forEach((key) => {
          declare.push(`@${key}=?`);
        });
      }
      let res: MariaDBResultSet;
      if (declare.length > 0) {
        console.log('In transaction');
        res = await this._client.transaction(async (conn) => {
          await conn.execute(
            `SET ${declare.join(', ')};`,
            Object.values(params ?? {}),
          );
          return await conn.execute(qry);
        });
      } else {
        res = await this._client.execute(qry);
      }
      return res.rows as R[];
    } catch (err) {
      throw new NormQueryError(err.message, {
        name: this._name,
        dialect: this.dialect,
        sql: sql,
      });
    }
  }

  protected async _execute(
    sql: string,
    params?: Record<string, unknown>,
  ): Promise<void> {
    if (this._status !== 'CONNECTED' || this._client === undefined) {
      throw new NormNotConnectedError({
        name: this._name,
        dialect: this.dialect,
      });
    }
    try {
      const paramsArray: Array<unknown> = Object.values(params ?? {});
      await this._client.execute(
        this._normaliseQuery(sql, params),
        paramsArray,
      );
    } catch (err) {
      throw new NormQueryError(err.message, {
        name: this._name,
        dialect: this.dialect,
        sql: sql,
      });
    }
  }

  protected _normaliseQuery(
    sql: string,
    params?: Record<string, unknown> | undefined,
  ): string {
    // Remove trailing ; and add it
    sql = sql.trim().replace(/;+$/, '') + ';';
    if (params === undefined) {
      return sql;
    }
    const keys = Object.keys(params);
    // Replace :key: with :key
    sql = sql.replace(/:(\w+):/g, '@$1');
    // Verify that any :key defined exists in params
    const missing: string[] = [];
    const matches = sql.match(/:(\w+)/g);
    if (matches !== null) {
      for (const match of matches) {
        const key = match.substr(1);
        if (!keys.includes(key)) {
          missing.push(key);
        }
      }
    }
    if (missing.length > 0) {
      throw new NormQueryMissingParamsError({
        name: this._name,
        dialect: this.dialect,
        sql: sql,
        missing: missing.join(','),
      });
    }
    return `${sql}`;
  }
}
