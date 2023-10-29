import type { OptionKeys } from '../../../options/mod.ts';
import { AbstractClient } from '../../AbstractClient.ts';
import {
  PGClient,
  PGConnectionError,
  PGPool,
  PostgresError,
} from '../../../dependencies.ts';
import type { PGClientOptions } from '../../../dependencies.ts';

import type { ClientEvents, PostgresClientOptions } from '../../types/mod.ts';

import { NormConfigError, NormQueryError, NormNoActiveConnectionError } from '../../errors/mod.ts';
 
export class PostgresClient extends AbstractClient<PostgresClientOptions> {
  protected _client: PGPool | undefined = undefined;

  constructor(
    name: string,
    options: OptionKeys<PostgresClientOptions, ClientEvents>,
  ) {
    const opt = { ...{ port: 5432, ssl: false, poolSize: 10 }, ...options };
    super(name, opt);
  }

  protected _verifyConfig(): void {
    if(this._getOption<'poolSize'>('poolSize') as number <= 0 || this._getOption<'poolSize'>('poolSize') as number > 40) {
      throw new NormConfigError('Invalid configuration. Pool size must be between 1 and 40.', { config: this.name, dialect: this.dialect });
    }
  }

  protected _connect(): void {
    if (this._client === undefined) {
      const conf: PGClientOptions = {
        user: this._getOption('username'),
        password: this._getOption('password'),
        database: this._getOption('database'),
        hostname: this._getOption('host'),
        port: this._getOption('port') || 5432,
      };
      this._client = new PGPool(conf, this._getOption('poolSize') || 10, true);
    }
  }

  protected async _disconnect(): Promise<void> {
    if(this._client !== undefined) {
      await this._client.end();
      this._client = undefined;
    }
  }

  protected async _version(): Promise<string> {
    const query = 'SELECT VERSION() AS VERSION;';
    //SHOW SERVER_VERSION;
    return (await this._query<{VERSION: string}>(query))[0].VERSION;
  }

  protected async _query<T>(sql: string): Promise<T[]> {
    if(this._client === undefined) {
      // throw new PGConnectionError('Client is not connected.', { config: this.name, dialect: this.dialect });
      throw new NormNoActiveConnectionError({ config: this.name, dialect: this.dialect });
    }
    const client = await this._client.connect();
    try {
      const result = (await client.queryObject<T>(sql)).rows;
      return result;
    } catch (e) {
      if (e instanceof PostgresError) {
        throw new NormQueryError(e.message, sql, {
          config: this.name,
          dialect: this.dialect,
        });
      }
      throw e;
    } finally {
      client.release();
    }
  }

  protected async _execute(sql: string): Promise<void> {
    if(this._client === undefined) {
      // throw new PGConnectionError('Client is not connected.', { config: this.name, dialect: this.dialect });
      throw new NormNoActiveConnectionError({ config: this.name, dialect: this.dialect });
    }
    const client = await this._client.connect();
    try {
      const result = (await client.queryObject(sql)).rows;
    } catch (e) {
      if (e instanceof PostgresError) {
        throw new NormQueryError(e.message, sql, {
          config: this.name,
          dialect: this.dialect,
        });
      }
      throw e;
    } finally {
      client.release();
    }
  }
}

// Path: norm/dialects/postgres/PostgresClient.ts