import { type OptionKeys } from '../../../options/mod.ts';
import { AbstractClient } from '../../Client.ts';
import type { ClientEvents, MongoOptions, RawQuery } from '../../types/mod.ts';
import {
  DAMClientError,
  DAMConfigError,
  DAMQueryError,
} from '../../errors/mod.ts';

import {
  type Collection,
  // type MongoDBClientOptions,
  type Db,
  MongoDBClient,
  MongoDBServerError,
} from '../../../dependencies.ts';

export class MongoClient extends AbstractClient<MongoOptions> {
  // protected _helper = new MariaHelper();
  private _client: MongoDBClient | undefined = undefined;

  constructor(name: string, options: OptionKeys<MongoOptions, ClientEvents>) {
    const defaults: Partial<MongoOptions> = {
      port: 27017,
      authDb: 'admin',
      // connectionTimeout: 30 * 1000,
      // connectionTimeout: 10,
      // idleTimeout: 10 * 60 * 1000,
    };
    if (options.dialect !== 'MONGO') {
      throw new DAMConfigError('Invalid value for dialect passed', {
        name: name,
        dialect: options.dialect,
        item: 'dialect',
      });
    }
    if (options.port && (options.port < 0 || options.port > 65535)) {
      throw new DAMConfigError('Port value must be between 0 to 65535', {
        name: name,
        dialect: options.dialect,
        item: 'port',
      });
    }
    super(name, { ...defaults, ...options });
  }

  async getDatabase(name: string): Promise<Db> {
    await this.connect();
    if (this._status !== 'CONNECTED' || this._client === undefined) {
      throw new DAMQueryError('Client not connected', {
        dialect: this.dialect,
        name: this.name,
        query: 'db()',
        params: { database: name },
      });
    }
    return this._client.db(name);
  }

  async collection<R extends Record<string, unknown> = Record<string, unknown>>(
    name: string,
    database?: string,
  ): Promise<Collection<R>> {
    await this.connect();
    if (this._status !== 'CONNECTED' || this._client === undefined) {
      throw new DAMQueryError('Client not connected', {
        dialect: this.dialect,
        name: this.name,
        query: 'db.collection',
        params: { collection: name, database: database },
      });
    }
    return this._client.db(database).collection<R>(name);
  }

  protected async _connect(): Promise<void> {
    if (this._status === 'CONNECTED' && this._client !== undefined) {
      return;
    }
    console.log(this._makeMongoDBURL());
    this._client = new MongoDBClient(this._makeMongoDBURL());
    let inst: MongoDBClient | undefined = undefined;
    try {
      inst = await this._client.connect();
    } catch (e) {
      console.log(JSON.stringify(e));
      if (e instanceof MongoDBServerError) {
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
    } finally {
      inst?.close();
    }
  }

  protected async _close(): Promise<void> {
    if (this._status !== 'CONNECTED' || this._client === undefined) {
      return;
    }
    await this._client.close();
    this._client = undefined;
  }

  protected _execute<
    R extends Record<string, unknown> = Record<string, unknown>,
  >(query: RawQuery): { count: number; rows: R[] } {
    throw new DAMQueryError('MongoDB does not support execute method', {
      dialect: this.dialect,
      name: this.name,
      query: query.sql,
      params: query.params,
    });
  }

  protected _isReallyConnected(): boolean {
    return (this.status === 'CONNECTED' && this._client !== undefined);
  }

  protected _standardizeQuery(query: RawQuery): RawQuery {
    return query;
  }

  protected _makeMongoDBURL() {
    const host = this._getOption('host'),
      username = this._getOption('username'),
      password = this._getOption('password'),
      cred = (username !== undefined) ? `${username}:${password}@` : ``,
      port = this._getOption('port') || 27017,
      authDB = this._getOption('authDb'),
      database = this._getOption('database'),
      appName = this.name;
    return `mongodb://${cred}${host}:${port}/${database}?appName=${appName}&authSource=${authDB}`;
  }
}
