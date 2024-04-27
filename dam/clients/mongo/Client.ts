import { type OptionKeys } from '../../../options/mod.ts';
import { AbstractClient } from '../../Client.ts';
import type {
  ClientEvents,
  CountQuery,
  DeleteQuery,
  InsertQuery,
  MongoOptions,
  Query,
  QueryResult,
  SelectQuery,
  TruncateQuery,
  UpdateQuery,
} from '../../types/mod.ts';
import {
  DAMClientError,
  DAMConfigError,
  DAMConnectionError,
  DAMError,
  DAMNotSupported,
  DAMQueryError,
} from '../../errors/mod.ts';

import {
  type Collection,
  // type MongoDBClientOptions,
  type Db,
  MongoDBClient,
  MongoDBServerError,
} from '../../../dependencies.ts';
import { QueryFilters } from '../../mod.ts';

export class MongoClient extends AbstractClient<MongoOptions> {
  // protected _helper = new MariaHelper();
  private _client: MongoDBClient | undefined = undefined;

  constructor(name: string, options: OptionKeys<MongoOptions, ClientEvents>) {
    const defaults: Partial<MongoOptions> = {
      port: 27017,
      authDb: 'admin',
    };
    super(name, { ...defaults, ...options });
  }

  async getDatabase(name: string): Promise<Db> {
    await this.connect();
    if (this._status !== 'CONNECTED' || this._client === undefined) {
      throw new DAMClientError('Client not connected', {
        dialect: this.dialect,
        config: this.name,
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
      throw new DAMClientError('Client not connected', {
        dialect: this.dialect,
        config: this.name,
      });
    }
    return this._client.db(database).collection<R>(name);
  }

  async insert<R extends Record<string, unknown> = Record<string, unknown>>(
    query: InsertQuery,
  ): Promise<QueryResult<R>> {
    await this.connect();
    try {
      const st = performance.now(),
        slowQueryThreshold = (this._getOption('slowQueryThreshold') || 5) *
          1000,
        result: QueryResult<R> = {
          time: 0,
          count: 0,
          data: [],
        };
      const res = await this.__insert<R>(query);
      result.time = performance.now() - st;
      result.count = res.count;
      result.data = res.rows;
      if (result.time > slowQueryThreshold) {
        this.emit(
          'slowQuery',
          this.name,
          result.time,
          `INSERT INTO ${query.source}`,
        );
      }
      return result;
    } catch (err) {
      let fErr: DAMError;
      if (err instanceof DAMError) {
        fErr = err;
      } else {
        fErr = new DAMQueryError({
          dialect: this.dialect,
          config: this.name,
          sql: `INSERT INTO ${query.source}`,
          params: query,
        }, err);
      }
      this.emit('error', this.name, fErr);
      throw fErr;
    }
  }

  async update<R extends Record<string, unknown> = Record<string, unknown>>(
    query: UpdateQuery,
  ): Promise<QueryResult<R>> {
    await this.connect();
    try {
      const st = performance.now(),
        slowQueryThreshold = (this._getOption('slowQueryThreshold') || 5) *
          1000,
        result: QueryResult<R> = {
          time: 0,
          count: 0,
          data: [],
        };
      const res = await this.__update<R>(query);
      result.time = performance.now() - st;
      result.count = res.count;
      if (result.time > slowQueryThreshold) {
        this.emit(
          'slowQuery',
          this.name,
          result.time,
          `UPDATE ${query.source}`,
        );
      }
      return result;
    } catch (err) {
      let fErr: DAMError;
      if (err instanceof DAMError) {
        fErr = err;
      } else {
        fErr = new DAMQueryError({
          dialect: this.dialect,
          config: this.name,
          sql: `UPDATE ${query.source}`,
          params: query,
        }, err);
      }
      this.emit('error', this.name, fErr);
      throw fErr;
    }
  }

  async delete<R extends Record<string, unknown> = Record<string, unknown>>(
    query: DeleteQuery,
  ): Promise<QueryResult<R>> {
    await this.connect();
    try {
      const st = performance.now(),
        slowQueryThreshold = (this._getOption('slowQueryThreshold') || 5) *
          1000,
        result: QueryResult<R> = {
          time: 0,
          count: 0,
          data: [],
        };
      const res = await this.__delete<R>(query);
      result.time = performance.now() - st;
      result.count = res.count;
      if (result.time > slowQueryThreshold) {
        this.emit(
          'slowQuery',
          this.name,
          result.time,
          `DELETE FROM ${query.source}`,
        );
      }
      return result;
    } catch (err) {
      let fErr: DAMError;
      if (err instanceof DAMError) {
        fErr = err;
      } else {
        fErr = new DAMQueryError({
          dialect: this.dialect,
          config: this.name,
          sql: `DELETE FROM ${query.source}`,
          params: query,
        }, err);
      }
      this.emit('error', this.name, fErr);
      throw fErr;
    }
  }

  async select<R extends Record<string, unknown> = Record<string, unknown>>(
    query: SelectQuery,
  ): Promise<QueryResult<R>> {
    await this.connect();
    try {
      const st = performance.now(),
        slowQueryThreshold = (this._getOption('slowQueryThreshold') || 5) *
          1000,
        result: QueryResult<R> = {
          time: 0,
          count: 0,
          data: [],
        };
      const res = await this.__select<R>(query);
      result.time = performance.now() - st;
      result.count = res.count;
      if (result.time > slowQueryThreshold) {
        this.emit(
          'slowQuery',
          this.name,
          result.time,
          `SELECT FROM ${query.source}`,
        );
      }
      return result;
    } catch (err) {
      let fErr: DAMError;
      if (err instanceof DAMError) {
        fErr = err;
      } else {
        fErr = new DAMQueryError({
          dialect: this.dialect,
          config: this.name,
          sql: `SELECT FROM ${query.source}`,
          params: query,
        }, err);
      }
      this.emit('error', this.name, fErr);
      throw fErr;
    }
  }

  async count<R extends Record<string, unknown> = Record<string, unknown>>(
    query: CountQuery,
  ): Promise<QueryResult<R>> {
    await this.connect();
    try {
      const st = performance.now(),
        slowQueryThreshold = (this._getOption('slowQueryThreshold') || 5) *
          1000,
        result: QueryResult<R> = {
          time: 0,
          count: 0,
          data: [],
        };
      const res = await this.__count<R>(query);
      result.time = performance.now() - st;
      result.count = res.count;
      if (result.time > slowQueryThreshold) {
        this.emit('slowQuery', this.name, result.time, `COUNT ${query.source}`);
      }
      return result;
    } catch (err) {
      let fErr: DAMError;
      if (err instanceof DAMError) {
        fErr = err;
      } else {
        fErr = new DAMQueryError({
          dialect: this.dialect,
          config: this.name,
          sql: `COUNT ${query.source}`,
          params: query,
        }, err);
      }
      this.emit('error', this.name, fErr);
      throw fErr;
    }
  }

  async truncate<R extends Record<string, unknown> = Record<string, unknown>>(
    query: TruncateQuery,
  ): Promise<QueryResult<R>> {
    await this.connect();
    try {
      const st = performance.now(),
        slowQueryThreshold = (this._getOption('slowQueryThreshold') || 5) *
          1000,
        result: QueryResult<R> = {
          time: 0,
          count: 0,
          data: [],
        };
      const res = await this.__truncate<R>(query);
      result.time = performance.now() - st;
      result.count = res.count;
      if (result.time > slowQueryThreshold) {
        this.emit(
          'slowQuery',
          this.name,
          result.time,
          `TRUNCATE ${query.source}`,
        );
      }
      return result;
    } catch (err) {
      let fErr: DAMError;
      if (err instanceof DAMError) {
        fErr = err;
      } else {
        fErr = new DAMQueryError({
          dialect: this.dialect,
          config: this.name,
          sql: `TRUNCATE ${query.source}`,
          params: query,
        }, err);
      }
      this.emit('error', this.name, fErr);
      throw fErr;
    }
  }

  //https://www.mongodb.com/docs/upcoming/reference/operator/aggregation/lookup/#perform-a-concise-correlated-subquery-with--lookup
  // protected _process<
  //   R extends Record<string, unknown> = Record<string, unknown>,
  // >(query: SelectQuery<R> | CountQuery<R> | InsertQuery<R>): void {
  //   const { joins, project, filters } = {
  //     ...{ joins: {}, project: {}, filters: {} },
  //     ...query,
  //   };
  //   const finalJoins: Record<
  //     string,
  //     { from: string; localField: string; foreignField: string; as: string }
  //   > = {};
  //   // if(Object.keys(joins).length > 0) {
  //   //   // Extract the condition for ON clause and add the columns for projection
  //   //   Object.entries(joins).forEach(([key, value]) => {
  //   //     const alias = key.trim();
  //   //     const { source, relation, project } = value;
  //   //   });
  //   // }
  // }

  // Implement https://stackoverflow.com/questions/51533234/mongodb-find-with-calculated-field
  protected _validateConfig(options: MongoOptions): void { // NOSONAR
    // Call super
    super._validateConfig(options);
    // Validate per this dialect
    if (options.dialect !== 'MONGO') {
      throw new DAMConfigError(
        'Invalid dialect provided for ${dialect} Client',
        {
          dialect: this.dialect,
          config: this.name,
          item: 'dialect',
          value: options.dialect,
        },
      );
    }
    if (options.host === undefined || options.host.trim() === '') {
      throw new DAMConfigError('Hostname of ${dialect} server is required', {
        config: this.name,
        dialect: this.dialect,
        item: 'host',
      });
    }
    if (options.port && (options.port < 1024 || options.port > 65535)) {
      throw new DAMConfigError(
        'Port of ${dialect} server is required and must be between 1024 and 65535',
        {
          config: this.name,
          dialect: this.dialect,
          item: 'port',
        },
      );
    }
    if (options.username !== undefined || options.password !== undefined) {
      // Authdb must be specified
      if (options.authDb === undefined || options.authDb.trim() === '') {
        throw new DAMConfigError('Auth database must be specified', {
          config: this.name,
          dialect: this.dialect,
          item: 'authDb',
        });
      }
      if (options.username === undefined || options.username.trim() === '') {
        throw new DAMConfigError(
          'Username for authenticating with ${dialect} server is required',
          {
            config: this.name,
            dialect: this.dialect,
            item: 'username',
          },
        );
      }
      if (options.password === undefined || options.password.trim() === '') {
        throw new DAMConfigError(
          'Password for authenticating with ${dialect} server is required',
          {
            config: this.name,
            dialect: this.dialect,
            item: 'password',
          },
        );
      }
    }
    if (options.database === undefined || options.database.trim() === '') {
      throw new DAMConfigError(
        'Database name in ${dialect} server is required',
        {
          config: this.name,
          dialect: this.dialect,
          item: 'database',
        },
      );
    }
  }

  protected _makeConfig(): string {
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

  //#region Abstract methods
  protected async _connect(): Promise<void> {
    if (this._status === 'CONNECTED' && this._client !== undefined) {
      return;
    }
    this._client = new MongoDBClient(this._makeConfig());
    let inst: MongoDBClient | undefined = undefined;
    try {
      inst = await this._client.connect();
    } catch (e) {
      if (e instanceof MongoDBServerError) {
        throw new DAMConnectionError({
          config: this.name,
          dialect: this.dialect,
          errorCode: e.code?.toString(),
          errorMessage: e.message,
        }, e);
      }
      throw new DAMConnectionError({
        config: this.name,
        dialect: this.dialect,
        errorMessage: e.message,
      }, e);
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
  >(_query: Query): { count: number; rows: R[] } {
    throw new DAMNotSupported({
      dialect: this.dialect,
      config: this.name,
      method: 'execute',
    });
  }

  protected _isReallyConnected(): boolean {
    return (this.status === 'CONNECTED' && this._client !== undefined);
  }

  protected _standardizeQuery(query: Query): Query {
    return query;
  }

  protected _getVersion(): string {
    return 'N/A';
  }
  //#endregion Abstract methods

  private __processFilters(filters: QueryFilters): Record<string, unknown> { // NOSONAR
    if (Object.keys(filters).length === 0) {
      return {};
    }
    const ret: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(filters)) {
      if (k.startsWith('$and') || k.startsWith('$or')) {
        if (Array.isArray(v)) {
          ret[k] = v.map((f) => this.__processFilters(f as QueryFilters));
        } else {
          ret[k] = this.__processFilters(v as QueryFilters);
        }
      } else if (typeof v === 'object' && !(v instanceof Date)) {
        for (
          const [operator, value] of Object.entries(
            v as Record<string, unknown>,
          )
        ) {
          switch (operator) {
            case '$between':
              if (Array.isArray(value) && value.length === 2) {
                ret[k] = { $gte: value[0], $lte: value[1] };
              } else {
                throw new DAMQueryError({
                  dialect: this.dialect,
                  config: this.name,
                  sql: `${k} $between ${JSON.stringify(value)}`,
                }, new Error('Invalid value for $between filter'));
              }
              break;
            case '$like':
              ret[k] = { $regex: `^${this.__likeToRegexp(value as string)}$` };
              break;
            case '$nlike':
              ret[k] = {
                $not: { $regex: `^${this.__likeToRegexp(value as string)}$` },
              };
              break;
            case '$ilike':
              ret[k] = {
                $regex: `^${this.__likeToRegexp(value as string)}$`,
                $options: 'i',
              };
              break;
            case '$nilike':
              ret[k] = {
                $not: {
                  $regex: `^${this.__likeToRegexp(value as string)}$`,
                  $options: 'i',
                },
              };
              break;
            case '$contains':
              ret[k] = { $regex: `.*${value as string}.*`, $options: 'i' };
              break;
            case '$ncontains':
              ret[k] = {
                $not: { $regex: `.*${value as string}.*`, $options: 'i' },
              };
              break;
            case '$startswith':
              ret[k] = { $regex: `${value as string}.*`, $options: 'i' };
              break;
            case '$nstartswith':
              ret[k] = {
                $not: { $regex: `${value as string}.*`, $options: 'i' },
              };
              break;
            case '$endswith':
              ret[k] = { $regex: `.*${value as string}`, $options: 'i' };
              break;
            case '$nendswith':
              ret[k] = {
                $not: { $regex: `.*${value as string}`, $options: 'i' },
              };
              break;
            case '$null':
              if (value === true) {
                ret[k] = { $eq: null };
              } else {
                ret[k] = { $ne: null };
              }
              break;
            case '$eq':
            case '$ne':
            case '$lt':
            case '$lte':
            case '$gt':
            case '$gte':
            case '$in':
            case '$nin':
              ret[k] = { [operator]: value };
              break;
            default:
              throw new DAMNotSupported({
                dialect: this.dialect,
                config: this.name,
                method: `filter operator ${operator}`,
              });
          }
        }
      } else {
        ret[k] = v;
      }
    }
    return ret;
  }

  /**
   * Converts a LIKE expression to regexp expression
   *
   * @param value string The like expression to convert
   * @returns string The converted regular expression
   */
  private __likeToRegexp(value: string): string {
    return value.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&') // escape special characters
      .replace(/%/g, '.*') // replace % with .*
      .replace(/_/g, '.'); // replace _ with .
  }

  private async __insert<
    R extends Record<string, unknown> = Record<string, unknown>,
  >(query: InsertQuery): Promise<{ count: number; rows: R[] }> {
    if (this._status !== 'CONNECTED' || this._client === undefined) {
      throw new DAMClientError('Client not connected', {
        dialect: this.dialect,
        config: this.name,
      });
    }
    const client = await this._client.connect();
    try {
      const collection = client.db().collection(query.source),
        insertRes = await collection.insertMany(query.values),
        insertIds = Array.from(Object.entries(insertRes.insertedIds)).map((
          [_k, v],
        ) => v),
        ret = await collection.find<R>({ _id: { $in: insertIds } }).toArray();
      return { count: ret.length, rows: ret };
    } catch (e) {
      if (e instanceof MongoDBServerError) {
        throw new DAMQueryError({
          dialect: this.dialect,
          config: this.name,
          sql: `INSERT INTO ${query.source}`,
          params: query,
        }, e);
      }
      throw new DAMQueryError({
        dialect: this.dialect,
        config: this.name,
        sql: `INSERT INTO ${query.source}`,
        params: query,
      }, e);
    } finally {
      client.close();
    }
  }

  private async __update<
    R extends Record<string, unknown> = Record<string, unknown>,
  >(query: UpdateQuery): Promise<{ count: number; rows: R[] }> {
    if (this._status !== 'CONNECTED' || this._client === undefined) {
      throw new DAMClientError('Client not connected', {
        dialect: this.dialect,
        config: this.name,
      });
    }
    const client = await this._client.connect();
    try {
      const collection = client.db().collection(query.source),
        res = await collection.updateMany(
          this.__processFilters(query.filters || {}),
          {
            $set: query.data,
          },
        );
      return { count: res.modifiedCount, rows: [] };
    } catch (e) {
      if (e instanceof MongoDBServerError) {
        throw new DAMQueryError({
          dialect: this.dialect,
          config: this.name,
          sql: `UPDATE ${query.source}`,
          params: query,
        }, e);
      }
      throw new DAMQueryError({
        dialect: this.dialect,
        config: this.name,
        sql: `UPDATE ${query.source}`,
        params: query,
      }, e);
    } finally {
      client.close();
    }
  }

  private async __delete<
    R extends Record<string, unknown> = Record<string, unknown>,
  >(query: DeleteQuery): Promise<{ count: number; rows: R[] }> {
    if (this._status !== 'CONNECTED' || this._client === undefined) {
      throw new DAMClientError('Client not connected', {
        dialect: this.dialect,
        config: this.name,
      });
    }
    const client = await this._client.connect();
    try {
      const collection = client.db().collection(query.source),
        res = await collection.deleteMany(
          this.__processFilters(query.filters || {}),
        );
      return { count: res.deletedCount, rows: [] };
    } catch (e) {
      if (e instanceof MongoDBServerError) {
        throw new DAMQueryError({
          dialect: this.dialect,
          config: this.name,
          sql: `DELETE FROM ${query.source}`,
          params: query,
        }, e);
      }
      throw new DAMQueryError({
        dialect: this.dialect,
        config: this.name,
        sql: `DELETE FROM ${query.source}`,
        params: query,
      }, e);
    } finally {
      client.close();
    }
  }

  private async __select<
    R extends Record<string, unknown> = Record<string, unknown>,
  >(query: SelectQuery): Promise<{ count: number; rows: R[] }> {
    if (this._status !== 'CONNECTED' || this._client === undefined) {
      throw new DAMClientError('Client not connected', {
        dialect: this.dialect,
        config: this.name,
      });
    }
    const client = await this._client.connect();
    try {
      // @TODO(@abhai2k) - Add support for Project and sorting
      const collection = client.db().collection(query.source),
        res = await collection.find<R>(
          this.__processFilters(query.filters || {}),
          {
            projection: query.project,
            limit: query.limit,
            skip: query.offset,
          },
        ).toArray();
      return { count: res.length, rows: res };
    } catch (e) {
      if (e instanceof MongoDBServerError) {
        throw new DAMQueryError({
          dialect: this.dialect,
          config: this.name,
          sql: `SELECT FROM ${query.source}`,
          params: query,
        }, e);
      }
      throw new DAMQueryError({
        dialect: this.dialect,
        config: this.name,
        sql: `SELECT FROM ${query.source}`,
        params: query,
      }, e);
    } finally {
      client.close();
    }
  }

  private async __count<
    R extends Record<string, unknown> = Record<string, unknown>,
  >(query: CountQuery): Promise<{ count: number; rows: R[] }> {
    if (this._status !== 'CONNECTED' || this._client === undefined) {
      throw new DAMClientError('Client not connected', {
        dialect: this.dialect,
        config: this.name,
      });
    }
    const client = await this._client.connect();
    try {
      const collection = client.db().collection(query.source),
        res = await collection.countDocuments(
          this.__processFilters(query.filters || {}),
        );
      return { count: res, rows: [] as R[] };
    } catch (e) {
      if (e instanceof MongoDBServerError) {
        throw new DAMQueryError({
          dialect: this.dialect,
          config: this.name,
          sql: `COUNT ${query.source}`,
          params: query,
        }, e);
      }
      throw new DAMQueryError({
        dialect: this.dialect,
        config: this.name,
        sql: `COUNT ${query.source}`,
        params: query,
      }, e);
    } finally {
      client.close();
    }
  }

  private async __truncate<
    R extends Record<string, unknown> = Record<string, unknown>,
  >(query: TruncateQuery): Promise<{ count: number; rows: R[] }> {
    if (this._status !== 'CONNECTED' || this._client === undefined) {
      throw new DAMClientError('Client not connected', {
        dialect: this.dialect,
        config: this.name,
      });
    }
    const client = await this._client.connect();
    try {
      const collection = client.db().collection(query.source),
        res = await collection.deleteMany({});
      return { count: res.deletedCount, rows: [] as R[] };
    } catch (e) {
      if (e instanceof MongoDBServerError) {
        throw new DAMQueryError({
          dialect: this.dialect,
          config: this.name,
          sql: `TRUNCATE ${query.source}`,
          params: query,
        }, e);
      }
      throw new DAMQueryError({
        dialect: this.dialect,
        config: this.name,
        sql: `TRUNCATE ${query.source}`,
        params: query,
      }, e);
    } finally {
      client.close();
    }
  }
}
