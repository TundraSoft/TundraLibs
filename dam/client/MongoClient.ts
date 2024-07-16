import {
  MongoDBClient,
  type MongoDBClientOptions,
  MongoDBDatabase,
  type MongoDBDocument,
  MongoDBObjectId,
} from '../../dependencies.ts';

import { OptionKeys } from '../../options/mod.ts';
import { Client } from '../Client.ts';
import { assertMongoOptions } from '../asserts/Options.ts';
import type {
  ClientEvents,
  // InsertQuery,
  MongoOptions,
  Query,
} from '../types/mod.ts';

import {
  DAMClientConfigError,
  // DAMClientConnectionError,
  // DAMClientError,
  DAMClientQueryError,
} from '../errors/mod.ts';
import { DAMClientConnectionError } from '../mod.ts';

export class MongoClient extends Client<MongoOptions> {
  declare readonly dialect = 'MONGO';
  private _client: MongoDBClient | undefined = undefined;
  public _db: MongoDBDatabase | undefined = undefined;

  constructor(name: string, options: OptionKeys<MongoOptions, ClientEvents>) {
    const def: Partial<MongoOptions> = {
      port: 27017,
      authDb: 'admin',
      // connectionTimeout: 5, // seconds
      // idleTimeout: 600, // seconds
      // poolSize: 10, // Pool size
    };
    options = { ...def, ...options };
    if (!assertMongoOptions(options)) {
      throw new DAMClientConfigError({ dialect: 'MONGO', configName: name });
    }
    super(name, options);
  }

  protected _makeConfig(): MongoDBClientOptions {
    const conf: MongoDBClientOptions = {
      appname: this.name,
      servers: [
        {
          host: this._getOption('host'),
          port: this._getOption('port') || 27017,
        },
      ],
      db: this._getOption('database'),
    };
    if (this._getOption('username')) {
      conf.credential = {
        username: this._getOption('username'),
        password: this._getOption('password'),
        db: this._getOption('authDb') || 'admin',
        mechanism: this._getOption('authMechanism') || 'SCRAM-SHA-256',
      };
    }
    const tls = this._getOption('tls');
    if (tls) {
      conf.tls = true;
      conf.certFile = tls.certificate;
      conf.keyFile = tls.key;
    }
    return conf;
  }

  public async ping(): Promise<boolean> {
    try {
      await this.query({ sql: JSON.stringify({ ping: 1 }) });
      return true;
    } catch (_e) {
      return false;
    }
  }

  // This is useless in mongodb
  protected _standardizeQuery(
    query: Query,
  ): Query {
    return query;
  }

  protected async _connect(): Promise<void> {
    if (this._client !== undefined) return;
    try {
      this._client = new MongoDBClient();
      this._db = await this._client.connect(this._makeConfig());
      await this._client.runCommand('admin', { listDatabases: 1 });
    } catch (e) {
      this._db = undefined;
      this._client = undefined;
      throw new DAMClientConnectionError({
        dialect: this.dialect,
        configName: this.name,
        errorCode: e.code?.toString() ?? '',
      }, e);
    }
  }

  protected async _close(): Promise<void> {
    if (this._client !== undefined) {
      await this._client.close();
      this._client = undefined;
      this._db = undefined;
    }
  }

  protected async _execute<R extends Record<string, unknown>>(
    query: Query,
  ): Promise<{ count: number; rows: R[] }> {
    let sql: MongoDBDocument;
    try {
      sql = JSON.parse(query.sql);
    } catch (_e) {
      throw new DAMClientQueryError({
        dialect: this.dialect,
        configName: this.name,
        query: query,
        errorCode: 'Invalid query passed',
      });
    }
    try {
      // If it is insert, generate the id
      if (sql.insert) {
        sql.documents = sql.documents.map((d: Record<string, unknown>) => {
          if (!d._id) {
            d._id = new MongoDBObjectId();
          }
          return d;
        });
      }
      const db = (sql._admin) ? this._client!.database('admin') : this._db;
      delete sql._admin;
      const res = await db!.runCommand(sql);
      const { writeErrors } = res;
      if (writeErrors && writeErrors.length > 0) {
        const err = new Error(writeErrors);
        throw new DAMClientQueryError({
          dialect: this.dialect,
          configName: this.name,
          query: query,
        }, err);
      }
      // If it is find etc get the rows
      if (res.cursor) {
        return {
          count: res.cursor.firstBatch.length,
          rows: res.cursor.firstBatch,
        };
      } else if (sql.insert) {
        return {
          count: res.n,
          rows: [], //sql.documents.map((d: Record<string, unknown>) => d._id),
        };
      } else {
        return {
          count: res.n,
          rows: [],
        };
      }
    } catch (e) {
      if (e instanceof DAMClientQueryError) {
        throw e;
      } else {
        throw new DAMClientQueryError({
          dialect: this.dialect,
          configName: this.name,
          query: query,
          errorCode: e.code?.toString() ?? '',
        }, e);
      }
    }
  }

  protected async _getVersion(): Promise<string> {
    const res = await this._db!.runCommand<{ version: string }>({
      buildInfo: 1,
    });
    return res.version;
  }
}
