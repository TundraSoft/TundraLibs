import { type OptionKeys, Options } from '../options/mod.ts';
import { AbstractTranslator } from './Translator.ts';
import { DAM } from './DAM.ts';

import type {
  ClientEvents,
  ClientOptions,
  ClientStatus,
  CountQuery,
  DeleteQuery,
  Dialects,
  InsertQuery,
  Query,
  QueryResult,
  QueryTypes,
  SelectQuery,
  // TruncateQuery,
  UpdateQuery,
} from './types/mod.ts';

import { DAMBaseError, DAMClientError } from './errors/mod.ts';
import { DAMQueryError } from '../dam/errors/mod.ts';

export abstract class AbstractClient<O extends ClientOptions = ClientOptions>
  extends Options<O, ClientEvents> {
  public readonly dialect: Dialects;
  public readonly name: string;
  declare public translator: AbstractTranslator;
  protected _status: ClientStatus = 'READY';
  protected _version: string | undefined = undefined;

  constructor(name: string, options: OptionKeys<O, ClientEvents>) {
    const def: Partial<O> = {
      slowQueryThreshold: 5,
    } as Partial<O>;
    if (!['POSTGRES', 'MARIA', 'SQLITE', 'MONGO'].includes(options.dialect)) {
      throw new Error('Invalid dialect');
    }
    super(options, def);
    this.name = name.trim().toLowerCase();
    this.dialect = options.dialect;
    if (!DAM.hasConfig(this.name)) {
      DAM.addConfig(this.name, options);
    }
    DAM.register(this as unknown as AbstractClient);
  }

  get status(): ClientStatus {
    return this._status;
  }

  async getVersion(): Promise<string> {
    if (this._version === undefined) {
      await this.connect();
      this._version = await this._getVersion();
    }
    return this._version;
  }

  /**
   * Establishes a connection to the server.
   * If already connected, this method does nothing.
   *
   * Emits a 'connect' event upon successful connection.
   * Emits an 'error' event if an error occurs during the connection process.
   *
   * @throws {DAMBaseError} If an error occurs during the connection process.
   */
  public async connect() {
    if (this._isReallyConnected()) return;
    try {
      await this._connect();
      this._status = 'CONNECTED';
      this.emit('connect', this.name);
    } catch (err) {
      this._status = 'ERROR';
      let nErr: DAMBaseError;
      if (err instanceof DAMBaseError) {
        nErr = err;
      } else {
        nErr = new DAMClientError(err.message, {
          name: this.name,
          dialect: this.dialect,
        }, err);
      }
      this.emit('error', this.name, nErr);
      throw nErr;
    }
  }

  /**
   * Closes the client connection.
   * If the client is not in the 'CONNECTED' state, the method returns immediately.
   * If an error occurs during the close operation, the client's status is set to 'ERROR'
   * and an 'error' event is emitted with the client's name and the error object.
   *
   * @throws {DAMBaseError} If an error occurs during the close operation.
   */
  public async close() {
    if (this.status !== 'CONNECTED') return;
    try {
      await this._close();
      this._status = 'READY';
      this.emit('close', this.name);
    } catch (err) {
      this._status = 'ERROR';
      let nErr: DAMBaseError;
      if (err instanceof DAMBaseError) {
        nErr = err;
      } else {
        nErr = new DAMClientError(err.message, {
          name: this.name,
          dialect: this.dialect,
        });
      }
      this.emit('error', this.name, nErr);
      throw nErr;
    }
  }

  /**
   * Executes a query and returns the result.
   *
   * @template R - The type of the result data.
   * @param query - The query to execute.
   * @returns A promise that resolves to the query result.
   * @throws {DAMBaseError} If an error occurs during query execution.
   */
  public async execute<
    R extends Record<string, unknown> = Record<string, unknown>,
  >(query: Query): Promise<QueryResult<R>> {
    await this.connect();
    try {
      const st = performance.now(),
        slowQueryThreshold = (this._getOption('slowQueryThreshold') || 5) *
          1000,
        result: QueryResult<R> = {
          type: this._detectQuery(query.sql),
          time: 0,
          count: 0,
          data: [],
        };
      const res = await this._execute<R>(query);
      result.time = performance.now() - st;
      result.count = res.count;
      result.data = res.rows;
      if (result.time > slowQueryThreshold) {
        this.emit('slowQuery', this.name, result.time, query.sql, query.params);
      }
      return result;
    } catch (err) {
      let fErr: DAMBaseError;
      if (err instanceof DAMBaseError) {
        fErr = err;
      } else {
        fErr = new DAMQueryError(err.message, {
          dialect: this.dialect,
          name: this.name,
          query: query.sql,
          params: query.params,
        }, err);
      }
      this.emit('error', this.name, fErr);
      throw fErr;
    }
  }

  /**
   * Inserts a record into the database.
   *
   * @param query The insert query object.
   * @returns A promise that resolves to the query result.
   */
  public async insert<
    R extends Record<string, unknown> = Record<string, unknown>,
  >(query: InsertQuery): Promise<QueryResult<R>> {
    return await this.execute(this.translator.insert(query));
  }

  /**
   * Updates records in the database based on the provided query.
   *
   * @param query The update query specifying the records to update.
   * @returns A promise that resolves to the result of the update operation.
   */
  public async update<
    R extends Record<string, unknown> = Record<string, unknown>,
  >(query: UpdateQuery): Promise<QueryResult<R>> {
    return await this.execute(this.translator.update(query));
  }

  /**
   * Deletes records based on the provided query.
   *
   * @param query The delete query.
   * @returns A promise that resolves to the query result.
   */
  public async delete<
    R extends Record<string, unknown> = Record<string, unknown>,
  >(query: DeleteQuery): Promise<QueryResult<R>> {
    return await this.execute(this.translator.delete(query));
  }

  /**
   * Counts the number of records that match the given query.
   *
   * @template R - The type of the record.
   * @param query - The query to count records.
   * @returns A promise that resolves to a QueryResult object containing the count of matching records.
   */
  public async count<
    R extends Record<string, unknown> = Record<string, unknown>,
  >(query: CountQuery): Promise<QueryResult<R>> {
    const res = await this.execute<{ count: number }>(
      this.translator.count(query),
    );
    return {
      type: 'COUNT',
      time: res.time,
      count: (res.data && res.data.length > 0) ? res.data[0].count : 0,
      data: [],
    };
  }

  /**
   * Executes a select query and returns the result.
   *
   * @param query The select query to execute.
   * @returns A promise that resolves to the query result.
   */
  public async select<
    R extends Record<string, unknown> = Record<string, unknown>,
  >(query: SelectQuery): Promise<QueryResult<R>> {
    return await this.execute(this.translator.select(query));
  }

  protected _detectQuery(sql: string): QueryTypes | 'UNKNOWN' {
    const regex =
      /^(SELECT|INSERT|UPDATE|DELETE|CREATE\s+TABLE|ALTER\s+TABLE|DROP\s+TABLE|CREATE\s+SCHEMA|DROP\s+SCHEMA|CREATE\s+(MATERIALISED)?\s+VIEW|ALTER\s+(MATERIALISED)?\s+VIEW|DROP\s+(MATERIALISED)?\s+VIEW||TRUNCATE|BEGIN|COMMIT|ROLLBACK|SAVEPOINT)\s+/i;
    const matchedValue = sql.match(regex)?.[0].trim().replace(
      /MATERIALISED/i,
      '',
    );
    return matchedValue?.toUpperCase().replace(/\s+/, '_') as QueryTypes ||
      'UNKNOWN';
  }

  protected _standardizeQuery(query: Query): Query {
    // Remove trailing ; and add it
    const sql = query.sql.trim().replace(/;+$/, '') + ';';
    const keys = Object.keys(query.params || {});
    const missing: string[] = [];
    const matches = sql.match(/:([a-zA-Z0-9_]+):/g);
    if (matches !== null) {
      for (const match of matches) {
        const key = match.substring(1, match.length - 1);
        if (!keys.includes(key)) {
          missing.push(key);
        }
      }
    }
    if (missing.length > 0) {
      // throw new Error(`Missing parameters: ${missing.join(', ')}`);
      throw new DAMQueryError(`Missing parameter(s) ${missing.join(', ')}`, {
        dialect: this.dialect,
        name: this.name,
        query: query.sql,
        params: query.params,
      });
    }
    return {
      sql: sql,
      params: query.params,
    };
  }

  protected abstract _connect(): Promise<void> | void;
  protected abstract _close(): Promise<void> | void;
  protected abstract _execute<
    R extends Record<string, unknown> = Record<string, unknown>,
  >(
    query: Query,
  ): Promise<{ count: number; rows: R[] }> | { count: number; rows: R[] };
  protected abstract _getVersion(): Promise<string> | string;
  protected abstract _isReallyConnected(): boolean;
}
