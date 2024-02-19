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
  DAMQueryError,
} from '../../errors/mod.ts';

import {
  type Collection,
  // type MongoDBClientOptions,
  type Db,
  MongoDBClient,
  MongoDBServerError,
} from '../../../dependencies.ts';

// import type { QueryExpressions } from '../../types/mod.ts';

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

  async insert<R extends Record<string, unknown> = Record<string, unknown>>(
    query: InsertQuery,
  ): Promise<QueryResult<R>> {
    await this.connect();
    if (this._status !== 'CONNECTED' || this._client === undefined) {
      throw new DAMQueryError('Client not connected', {
        dialect: this.dialect,
        name: this.name,
        query: 'insert',
        params: query,
      });
    }
    const client = await this._client.connect();
    try {
      const slowQueryThreshold = (this._getOption('slowQueryThreshold') || 5) *
          1000,
        slowTimer = setTimeout(() => {
          this.emit(
            'slowQuery',
            this.name,
            slowQueryThreshold,
            'insert',
            query,
          );
        }, slowQueryThreshold),
        st = performance.now(),
        // collection = (query.source.length > 1 && query.source[1] !== undefined) ? client.db(query.source[0]).collection(query.source[1]) : client.db().collection(query.source[0]),
        collection = client.db().collection(query.source),
        insertRes = await collection.insertMany(query.data),
        insertIds = Array.from(Object.entries(insertRes.insertedIds)).map((
          [_k, v],
        ) => v),
        ret = await collection.find({ _id: { $in: insertIds } }).toArray(),
        time = performance.now() - st;
      clearInterval(slowTimer);
      if (time > ((this._getOption('slowQueryThreshold') || 5) * 1000)) {
        this.emit('slowQuery', this.name, time, 'insert', query);
      }
      return {
        type: 'INSERT',
        time: time,
        count: BigInt(ret.length),
        data: ret as unknown as Array<R>,
      } as QueryResult<R>;
    } catch (e) {
      if (e instanceof MongoDBServerError) {
        throw new DAMQueryError(e.message, {
          dialect: this.dialect,
          name: this.name,
          query: 'insert',
          params: query,
          code: e.code,
        }, e);
      }
      throw new DAMQueryError(e.message, {
        dialect: this.dialect,
        name: this.name,
        query: 'insert',
        params: query,
      }, e);
    } finally {
      client.close();
    }
  }

  async update<R extends Record<string, unknown> = Record<string, unknown>>(
    query: UpdateQuery,
  ): Promise<QueryResult<R>> {
    await this.connect();
    if (this._status !== 'CONNECTED' || this._client === undefined) {
      throw new DAMQueryError('Client not connected', {
        dialect: this.dialect,
        name: this.name,
        query: 'update',
        params: query,
      });
    }
    const client = await this._client.connect();
    try {
      const slowQueryThreshold = (this._getOption('slowQueryThreshold') || 5) *
          1000,
        slowTimer = setTimeout(() => {
          this.emit(
            'slowQuery',
            this.name,
            slowQueryThreshold,
            'update',
            query,
          );
        }, slowQueryThreshold),
        st = performance.now(),
        // collection = (query.source.length > 1 && query.source[1] !== undefined) ? client.db(query.source[0]).collection(query.source[1]) : client.db().collection(query.source[0]),
        collection = client.db().collection(query.source),
        res = await collection.updateMany(this._processFilters(query.filters), {
          $set: query.data,
        }),
        time = performance.now() - st;
      clearInterval(slowTimer);
      return {
        type: 'UPDATE',
        time: time,
        count: BigInt(res.modifiedCount),
      } as QueryResult<R>;
    } catch (e) {
      if (e instanceof MongoDBServerError) {
        throw new DAMQueryError(e.message, {
          dialect: this.dialect,
          name: this.name,
          query: 'update',
          params: query,
          code: e.code,
        }, e);
      }
      throw new DAMQueryError(e.message, {
        dialect: this.dialect,
        name: this.name,
        query: 'update',
        params: query,
      }, e);
    } finally {
      client.close();
    }
  }

  async delete<R extends Record<string, unknown> = Record<string, unknown>>(
    query: DeleteQuery,
  ): Promise<QueryResult<R>> {
    await this.connect();
    if (this._status !== 'CONNECTED' || this._client === undefined) {
      throw new DAMQueryError('Client not connected', {
        dialect: this.dialect,
        name: this.name,
        query: 'delete',
        params: query,
      });
    }
    const client = await this._client.connect();
    try {
      const slowQueryThreshold = (this._getOption('slowQueryThreshold') || 5) *
          1000,
        slowTimer = setTimeout(() => {
          this.emit(
            'slowQuery',
            this.name,
            slowQueryThreshold,
            'delete',
            query,
          );
        }, slowQueryThreshold),
        st = performance.now(),
        // collection = (query.source.length > 1 && query.source[1] !== undefined) ? client.db(query.source[0]).collection(query.source[1]) : client.db().collection(query.source[0]),
        collection = client.db().collection(query.source),
        res = await collection.deleteMany(this._processFilters(query.filters)),
        time = performance.now() - st;
      clearInterval(slowTimer);
      return {
        type: 'DELETE',
        time: time,
        count: BigInt(res.deletedCount),
      } as QueryResult<R>;
    } catch (e) {
      if (e instanceof MongoDBServerError) {
        throw new DAMQueryError(e.message, {
          dialect: this.dialect,
          name: this.name,
          query: 'delete',
          params: query,
          code: e.code,
        }, e);
      }
      throw new DAMQueryError(e.message, {
        dialect: this.dialect,
        name: this.name,
        query: 'delete',
        params: query,
      }, e);
    } finally {
      client.close();
    }
  }

  async select<R extends Record<string, unknown> = Record<string, unknown>>(
    query: SelectQuery,
  ): Promise<QueryResult<R>> {
    await this.connect();
    if (this._status !== 'CONNECTED' || this._client === undefined) {
      throw new DAMQueryError('Client not connected', {
        dialect: this.dialect,
        name: this.name,
        query: 'select',
        params: query,
      });
    }
    const client = await this._client.connect();
    try {
      const slowQueryThreshold = (this._getOption('slowQueryThreshold') || 5) *
          1000,
        slowTimer = setTimeout(() => {
          this.emit(
            'slowQuery',
            this.name,
            slowQueryThreshold,
            'select',
            query,
          );
        }, slowQueryThreshold),
        st = performance.now(),
        // collection = (query.source.length > 1 && query.source[1] !== undefined) ? client.db(query.source[0]).collection(query.source[1]) : client.db().collection(query.source[0]),
        collection = client.db().collection(query.source),
        res = await collection.find(this._processFilters(query.filters), {
          projection: query.project,
        }).toArray(),
        time = performance.now() - st;
      clearTimeout(slowTimer);
      return {
        type: 'SELECT',
        time: time,
        count: BigInt(res.length),
        data: res as unknown as Array<R>,
      } as QueryResult<R>;
    } catch (e) {
      if (e instanceof MongoDBServerError) {
        throw new DAMQueryError(e.message, {
          dialect: this.dialect,
          name: this.name,
          query: 'select',
          params: query,
          code: e.code,
        }, e);
      }
      throw new DAMQueryError(e.message, {
        dialect: this.dialect,
        name: this.name,
        query: 'select',
        params: query,
      }, e);
    } finally {
      client.close();
    }
  }

  async count<R extends Record<string, unknown> = Record<string, unknown>>(
    query: CountQuery,
  ): Promise<QueryResult<R>> {
    await this.connect();
    if (this._status !== 'CONNECTED' || this._client === undefined) {
      throw new DAMQueryError('Client not connected', {
        dialect: this.dialect,
        name: this.name,
        query: 'delete',
        params: query,
      });
    }
    const client = await this._client.connect();
    try {
      const slowQueryThreshold = (this._getOption('slowQueryThreshold') || 5) *
          1000,
        slowTimer = setTimeout(() => {
          this.emit('slowQuery', this.name, slowQueryThreshold, 'count', query);
        }, slowQueryThreshold),
        st = performance.now(),
        // collection = (query.source.length > 1 && query.source[1] !== undefined) ? client.db(query.source[0]).collection(query.source[1]) : client.db().collection(query.source[0]),
        collection = client.db().collection(query.source),
        res = await collection.countDocuments(
          this._processFilters(query.filters),
        ),
        time = performance.now() - st;
      clearTimeout(slowTimer);
      return {
        type: 'COUNT',
        time: time,
        count: BigInt(res),
      } as QueryResult<R>;
    } catch (e) {
      if (e instanceof MongoDBServerError) {
        throw new DAMQueryError(e.message, {
          dialect: this.dialect,
          name: this.name,
          query: 'COUNT',
          params: query,
          code: e.code,
        }, e);
      }
      throw new DAMQueryError(e.message, {
        dialect: this.dialect,
        name: this.name,
        query: 'COUNT',
        params: query,
      }, e);
    } finally {
      client.close();
    }
  }

  async truncate<R extends Record<string, unknown> = Record<string, unknown>>(
    query: TruncateQuery,
  ): Promise<QueryResult<R>> {
    await this.connect();
    if (this._status !== 'CONNECTED' || this._client === undefined) {
      throw new DAMQueryError('Client not connected', {
        dialect: this.dialect,
        name: this.name,
        query: 'truncate',
        params: query,
      });
    }
    const client = await this._client.connect();
    try {
      const slowQueryThreshold = (this._getOption('slowQueryThreshold') || 5) *
          1000,
        slowTimer = setTimeout(() => {
          this.emit(
            'slowQuery',
            this.name,
            slowQueryThreshold,
            'truncate',
            query,
          );
        }, slowQueryThreshold),
        st = performance.now(),
        // collection = (query.source.length > 1 && query.source[1] !== undefined) ? client.db(query.source[0]).collection(query.source[1]) : client.db().collection(query.source[0]),
        collection = client.db().collection(query.source),
        res = await collection.deleteMany({}),
        time = performance.now() - st;
      clearTimeout(slowTimer);
      return {
        type: 'TRUNCATE',
        time: time,
        count: BigInt(res.deletedCount),
      } as QueryResult<R>;
    } catch (e) {
      if (e instanceof MongoDBServerError) {
        throw new DAMQueryError(e.message, {
          dialect: this.dialect,
          name: this.name,
          query: 'truncate',
          params: query,
          code: e.code,
        }, e);
      }
      throw new DAMQueryError(e.message, {
        dialect: this.dialect,
        name: this.name,
        query: 'truncate',
        params: query,
      }, e);
    } finally {
      client.close();
    }
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
  protected _processFilters(
    filters: Record<string, unknown> = {},
  ): Record<string, unknown> {
    if (Object.keys(filters).length === 0) {
      return {};
    }
    // Ok we have to clean up the filters
    const ret: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(filters)) {
      if (k.startsWith('$and') || k.startsWith('$or')) {
        ret[k] = this._processFilters(v as Record<string, unknown>);
      } else {
        if (typeof v === 'object' && !(v instanceof Date)) {
          for (
            const [key, val] of Object.entries(v as Record<string, unknown>)
          ) {
            if (key === '$between') {
              if (Array.isArray(val) && val.length === 2) {
                ret[k] = { $gte: val[0], $lte: val[1] };
              } else {
                throw new DAMQueryError('Invalid value for $between filter', {
                  dialect: this.dialect,
                  name: this.name,
                  query: 'processFilters',
                  params: filters,
                });
              }
            } else if (['$like', '$nlike', '$ilike', '$nilike'].includes(key)) {
              // @TODO: convert like to regex
              const regexPattern = (val as string)
                .replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&') // escape special characters
                .replace(/%/g, '.*') // replace % with .*
                .replace(/_/g, '.'); // replace _ with .
              if (key === '$like') {
                ret[k] = { $regex: `^${regexPattern}$` };
              } else if (key === '$nlike') {
                ret[k] = { $not: { $regex: `^${regexPattern}$` } };
              } else if (key === '$ilike') {
                ret[k] = { $regex: `^${regexPattern}$`, $options: 'i' };
              } else if (key === '$nilike') {
                ret[k] = {
                  $not: { $regex: `^${regexPattern}$`, $options: 'i' },
                };
              }
            } else if (
              [
                '$contains',
                '$ncontains',
                '$startswith',
                '$nstartswith',
                '$endswith',
                '$nendswith',
              ].includes(key)
            ) {
              if (key === '$contains') {
                ret[k] = { $regex: `.*${val}.*`, $options: 'i' };
              } else if (key === '$ncontains') {
                ret[k] = { $not: { $regex: `.*${val}.*`, $options: 'i' } };
              } else if (key === '$startswith') {
                ret[k] = { $regex: `^${val}.*`, $options: 'i' };
              } else if (key === '$nstartswith') {
                ret[k] = { $not: { $regex: `^${val}.*`, $options: 'i' } };
              } else if (key === '$endswith') {
                ret[k] = { $regex: `.*${val}$`, $options: 'i' };
              } else if (key === '$nendswith') {
                ret[k] = { $not: { $regex: `.*${val}$`, $options: 'i' } };
              }
            } else if (key === '$null') {
              if (val === true) {
                ret[k] = { $eq: null };
              } else {
                ret[k] = { $$ne: null };
              }
            } else {
              // Rest all are supported
              ret[k] = val;
            }
          }
        } else {
          ret[k] = v;
        }
      }
    }
    return ret;
  }

  //#region Abstract methods
  protected async _connect(): Promise<void> {
    if (this._status === 'CONNECTED' && this._client !== undefined) {
      return;
    }
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
  >(query: Query): { count: bigint; rows: R[] } {
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

  protected _standardizeQuery(query: Query): Query {
    return query;
  }

  protected _getVersion(): string {
    return 'N/A';
  }
  //#endregion Abstract methods
}

// const ins: InsertQuery = {
//   type: 'INSERT',
//   source: 'test',
//   data: [{ a: 1, b: 2 }, { a: 3, b: 4 }],
//   project: { a: true, b: true },
// };

// const upd: UpdateQuery = {
//   type: 'UPDATE',
//   source: 'test',
//   data: { a: 4, b: 5 },
//   filters: { a: 1 },
// };

// const del: DeleteQuery = {
//   type: 'DELETE',
//   source: 'test',
//   filters: { a: 3 },
// };

// const cnt: CountQuery = {
//   type: 'COUNT',
//   source: 'test',
//   filters: { a: 4 },
// };

// const sel: SelectQuery = {
//   type: 'SELECT',
//   source: 'test',
//   filters: { a: 4 },
//   project: { a: true, b: true, _id: false },
// };

// const m = new MongoClient('test', {
//   dialect: 'MONGO',
//   host: '10.1.10.3',
//   database: 'test',
//   username: 'mongo',
//   password: 'mongopw',
// });

// await m.connect();
// const res = await m.insert(ins);
// console.log(res);

// const upres = await m.update(upd);
// console.log(upres);

// const cntres = await m.count(cnt);
// console.log(cntres);

// const selres = await m.select(sel);
// console.log(selres);

// const delres = await m.delete(del);
// console.log(delres);
