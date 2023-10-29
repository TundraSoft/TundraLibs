import type { OptionKeys } from '../../../options/mod.ts';
import { AbstractClient } from '../../AbstractClient.ts';
import { MySQL } from '../../../dependencies.ts';
import type { MySQLClientConfig } from '../../../dependencies.ts';

import type { ClientEvents, MariaClientOptions } from '../../types/mod.ts';

import { NormConfigError } from '../../errors/mod.ts';

export class MariaClient extends AbstractClient<MariaClientOptions> {
  protected _client: MySQL | undefined = undefined;

  constructor(
    name: string,
    options: OptionKeys<MariaClientOptions, ClientEvents>,
  ) {
    const opt = {
      ...{
        port: 3306,
        ssl: false,
        poolSize: 5,
        connectionTimeout: 30,
        idleTimeout: 20,
      },
      ...options,
    };
    super(name, opt);
  }

  protected _verifyConfig(): void {
    if(this._getOption<'poolSize'>('poolSize') as number <= 0 || this._getOption<'poolSize'>('poolSize') as number > 40) {
      throw new NormConfigError('Invalid configuration. Pool size must be between 1 and 40.', { config: this.name, dialect: this.dialect });
    }
    // If connectionTimeout > 1min throw error
    if(this._getOption<'connectionTimeout'>('connectionTimeout') as number > 60) {
      throw new NormConfigError('Invalid configuration. Connection timeout must be less than 60 seconds.', { config: this.name, dialect: this.dialect });
    }
    // If idleTimeout > 1hr throw error
    if(this._getOption<'idleTimeout'>('idleTimeout') as number > 60) {
      throw new NormConfigError('Invalid configuration. Idle timeout must be less than 60 minutes.', { config: this.name, dialect: this.dialect });
    }    
  }

  protected async _connect(): Promise<void> {
    if (this._client === undefined) {
      const conf: MySQLClientConfig = {
        username: this._getOption('username'),
        password: this._getOption('password'),
        db: this._getOption('database'),
        hostname: this._getOption('host'),
        port: this._getOption('port') || 3306,
        timeout: (this._getOption('connectionTimeout') || 0) * 60 * 1000,
        poolSize: this._getOption('poolSize') || 3,
        idleTimeout: (this._getOption('idleTimeout') || 20) * 60 * 1000,
      };
      this._client = await new MySQL().connect(conf);
    }
  }

  protected async _disconnect(): Promise<void> {
    if (this._client !== undefined) {
      await this._client.close();
      this._client = undefined;
    }
  }

  protected async _version(): Promise<string> {
    const qry = 'SELECT VERSION() as VERSION;';
    const res = await this._query<{ VERSION: string }>(qry);
    return res[0].VERSION;
  }

  protected async _query<T>(sql: string): Promise<T[]> {
    if (this._client === undefined) {
      throw new Error('Client is not connected.');
    }
    try {
      return await this._client.execute(sql) as Promise<T[]>;
    } catch (e) {
      console.log('In catch');
      throw e;
    } finally {
      console.log('In finally');
    }
    
  }

  protected async _execute(sql: string): Promise<void> {
    if (this._client === undefined) {
      throw new Error('Client is not connected.');
    }
    await this._client.execute(sql);
  }  
}

// Path: norm/dialects/mariadb/MariaClient.ts

const a = new MariaClient('test', {
  dialect: 'MARIADB',
  host: 'localhost',
  username: 'root',
  password: 'mariapw',
  database: 'mysql',
});
await a.connect();
try {
  a.query('SELECTS 1 as A;');
} catch(e) {
  console.log('Here')
  console.log(e.message)
  console.log(e.stack)
}

