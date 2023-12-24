import { OptionKeys } from '../../../options/mod.ts';
import { AbstractClient } from '../../AbstractConnection.ts';
import type { NormEvents, PostgresConnectionOptions } from '../../types/mod.ts';
import {
  NormConfigError,
  NormNotConnectedError,
  NormQueryError,
  NormQueryMissingParamsError,
} from '../../errors/mod.ts';

import {
  PGClient,
  PGPoolClient,
  PostgresError,
} from '../../../dependencies.ts';
import type { PGClientOptions } from '../../../dependencies.ts';

export class PostgresClient extends AbstractClient<PostgresConnectionOptions> {
  private _client: PGClient | undefined = undefined;

  constructor(
    name: string,
    options: OptionKeys<PostgresConnectionOptions, NormEvents>,
  ) {
    const defaults: Partial<PostgresConnectionOptions> = {
      poolSize: 10,
      port: 5432,
      tlsOptions: {
        enabled: true,
        enforce: false,
      },
    };
    if (options.dialect !== 'POSTGRES') {
      throw new NormConfigError('Invalid value for dialect passed', {
        name: name,
        dialect: 'POSTGRES',
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
      tls: this._getOption('tlsOptions'),
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
  }

  protected async _close(): Promise<void> {
    if (this._status !== 'CONNECTED' || this._client === undefined) {
      return;
    }
    await this._client.end();
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
    let client: PGPoolClient | undefined = undefined;
    try {
      client = await this._client.connect();
      const res = await client.queryObject<R>(
        this._normaliseQuery(sql, params),
        params,
      );
      return res.rows;
    } catch (err) {
      if (err instanceof PostgresError) {
        throw new NormQueryError(err.message, {
          name: this._name,
          dialect: this.dialect,
          sql: sql,
          code: err.fields.code,
        });
      }
      throw new NormQueryError(err.message, {
        name: this._name,
        dialect: this.dialect,
        sql: sql,
      });
    } finally {
      if (client) {
        client.release();
      }
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
    let client: PGPoolClient | undefined = undefined;
    try {
      client = await this._client.connect();
      await client.queryArray(this._normaliseQuery(sql, params), params);
    } catch (err) {
      if (err instanceof PostgresError) {
        throw new NormQueryError(err.message, {
          name: this._name,
          dialect: this.dialect,
          sql: sql,
          code: err.fields.code,
        });
      }
      throw new NormQueryError(err.message, {
        name: this._name,
        dialect: this.dialect,
        sql: sql,
      });
    } finally {
      if (client) {
        client.release();
      }
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
    sql = sql.replace(/:(\w+):/g, '\$$1');
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
