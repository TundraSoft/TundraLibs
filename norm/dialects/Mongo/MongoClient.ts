import type { MongoClientOptions } from '../../../dependencies.ts';
import {
  MongoCollection,
  MongoDB,
  MongoDBClient,
  MongoDriverError,
  MongoInvalidArgumentError,
  MongoRuntimeError,
  MongoServerError,
} from '../../../dependencies.ts';

import type { OptionKeys } from '../../../options/mod.ts';
import { AbstractClient } from '../../AbstractClient.ts';
import type { ClientEvents, MongoOptions } from '../../types/mod.ts';

import {
  NormBaseError,
  NormClientError,
  NormConfigError,
  NormQueryError,
} from '../../errors/mod.ts';

export type BaseQuery = {
  source: string[];
  columns: Record<string, string>;
};

export type InsertQuery = BaseQuery & {
  values: Record<string, unknown> | Record<string, unknown>[];
};

/**
 * Represents a MongoDB client for executing queries and managing connections.
 * @template T - The type of options for the SQLite client.
 */
export class MongoClient extends AbstractClient<MongoOptions> {
  private _client: MongoDBClient | undefined = undefined;

  /**
   * Creates an instance of the MongoClient class.
   * @param name - The name of the client.
   * @param options - The options for the SQLite client.
   * @throws {NormConfigError} If the options are invalid.
   */
  constructor(name: string, options: OptionKeys<MongoOptions, ClientEvents>) {
    // Validate options
    const opt: Partial<MongoOptions> = {
      port: 27017,
      slowQueryThreshold: 5,
    };
    options = { ...opt, ...options };
    if (options.dialect !== 'MONGO') {
      throw new NormConfigError(
        `Invalid/incorrect dialect '${options.dialect}'.`,
        { config: name, configItem: 'dialect' },
      );
    }
    if (options.host === undefined) {
      throw new NormConfigError(`Hostname is required`, {
        config: name,
        dialect: options.dialect,
        configItem: 'host',
      });
    }
    if (options.port === undefined) {
      throw new NormConfigError(`Port is required`, {
        config: name,
        dialect: options.dialect,
        configItem: 'port',
      });
    }
    if (options.port < 1 || options.port > 65535) {
      throw new NormConfigError(`Port value must be between 1 and 65535`, {
        config: name,
        dialect: options.dialect,
        configItem: 'port',
      });
    }
    if (options.database === undefined) {
      throw new NormConfigError(`Database name is required`, {
        config: name,
        dialect: options.dialect,
        configItem: 'database',
      });
    }
    if (
      options.authMechanism &&
      ['SCRAM-SHA-1', 'SCRAM-SHA-256', 'MONGODB-X509'].includes(
        options.authMechanism,
      )
    ) {
      throw new NormConfigError(
        `Invalid authentication mechanism '${options.authMechanism}'.`,
        {
          config: name,
          dialect: options.dialect,
          configItem: 'authMechanism',
        },
      );
    }
    super(name, options);
  }

  /**
   * Connects to the Mongo database.
   * If the client is already connected, this method does nothing.
   */
  protected async _connect() {
    if (this.status === 'CONNECTED' && this._client !== undefined) {
      return;
    }
    const conf: MongoClientOptions = {
      appname: this.name,
      servers: [{
        host: this._getOption('host') as string,
        port: this._getOption('port') as number,
      }],
      db: this._getOption('database') as string,
    };
    if (this._getOption('username')) {
      conf.credential = {
        username: this._getOption('username') as string,
        password: this._getOption('password') as string,
        mechanism: this._getOption('authMechanism') || 'SCRAM-SHA-1',
        db: (this._getOption('authDb') || 'admin') as string,
      };
    }
    console.log(conf);
    try {
      this._client = new MongoDBClient();
      await this._client.connect(conf);
    } catch (e) {
      if (this._client !== undefined) {
        this._client = undefined;
      }
      if (e instanceof MongoDriverError) {
        throw new NormClientError(e.message, {
          config: this.name,
          dialect: this.dialect,
        });
      }
      if (e instanceof MongoServerError) {
        throw new NormClientError(e.message, {
          config: this.name,
          dialect: this.dialect,
          code: e.code.toString(),
        });
      }
      if (e instanceof MongoRuntimeError) {
        throw new NormClientError(e.message, {
          config: this.name,
          dialect: this.dialect,
        });
      }
      throw new NormClientError(e.message, {
        config: this.name,
        dialect: this.dialect,
        code: 'N/A',
      });
    }
  }

  /**
   * Closes the connection to the Mongo database.
   * If the client is not connected or the connection is already closed, this method does nothing.
   */
  protected _close() {
    if (this._status !== 'CONNECTED' || this._client === undefined) {
      return;
    }
    this._client.close();
    this._client = undefined;
  }

  public override async insert(insert: InsertQuery) {
    if (this._status !== 'CONNECTED' || this._client === undefined) {
      throw new NormClientError(`No active connection`, {
        config: this._name,
        dialect: this.dialect,
      });
    }
    // Fetch the DB (either default or the first one in the source)
    console.log(
      insert.source.length > 0 ? insert.source[0] : this._getOption('database'),
    );
    console.log(insert.source.length > 1 ? insert.source[1] : insert.source[0]);
    const db = this._client.database(
      insert.source.length > 1
        ? insert.source[0]
        : this._getOption('database') as string,
    );
    const collection = db.collection(
      insert.source.length > 1 ? insert.source[1] : insert.source[0],
    );
    if (Array.isArray(insert.values)) {
      return await collection.insertMany(insert.values);
    } else {
      return await collection.insertOne(insert.values);
    }
  }

  /**
   * Executes a query against the Mongo database and returns the result.
   * @param sql - The SQL query to execute.
   * @param params - The parameters for the query.
   * @returns The result of the query.
   * @throws {NormClientError} If there is no active connection.
   * @throws {NormQueryError} If there is an error executing the query.
   */
  protected _query<
    R extends Record<string, unknown> = Record<string, unknown>,
  >(_sql: string, _params?: Record<string, unknown>): R[] {
    throw new NormClientError(
      `MongoDB does not support query. Please use appropriate DML/DDL methods instead.`,
      { config: this.name, dialect: this.dialect, code: 'N/A' },
    );
  }

  /**
   * Executes a SQL statement against the Mongo database.
   * @param sql - The SQL statement to execute.
   * @param params - The parameters for the statement.
   * @throws {NormClientError} If there is no active connection.
   * @throws {NormQueryError} If there is an error executing the statement.
   */
  protected _execute(_sql: string, _params?: Record<string, unknown>): void {
    throw new NormClientError(
      `MongoDB does not support execute. Please use appropriate DML/DDL methods instead.`,
      { config: this.name, dialect: this.dialect, code: 'N/A' },
    );
  }

  /**
   * Sanitizes a SQL query by ensuring all params are present and also takes care of correct
   * parameter syntax.
   * @param sql - The SQL query to sanitize.
   * @param params - The parameters for the query.
   * @returns The sanitized SQL query.
   */
  protected override _sanitizeQuery(
    sql: string,
    _params?: Record<string, unknown> | undefined,
  ): string {
    return sql;
  }
}

const mdb = new MongoClient('test', {
  dialect: 'MONGO',
  host: 'localhost',
  port: 27071,
  database: 'test',
  username: 'mongo',
  password: 'mongopw',
});

await mdb.connect();

const ret = await mdb.insert({
  source: ['test123'],
  columns: {
    _id: 'id',
    name: 'name',
    age: 'age',
  },
  values: {
    _id: '123',
    name: 'John',
    age: 30,
  },
});

console.log(ret);
