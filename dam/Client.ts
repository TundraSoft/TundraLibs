import { type OptionKeys, Options } from '../options/mod.ts';
import type {
  ClientEvents,
  ClientOptions,
  ClientStatus,
  Dialects,
  QueryResult,
  QueryTypes,
  RawQuery,
} from './types/mod.ts';

import { DAMBaseError, DAMClientError } from './errors/mod.ts';
import { DAMQueryError } from '../dam/errors/mod.ts';

export abstract class AbstractClient<O extends ClientOptions = ClientOptions>
  extends Options<O, ClientEvents> {
  public readonly dialect: Dialects;
  public readonly name: string;
  protected _status: ClientStatus = 'READY';

  constructor(name: string, options: OptionKeys<O, ClientEvents>) {
    const def: Partial<O> = {
      slowQueryThreshold: 5,
    } as Partial<O>;
    if (!['POSTGRES', 'MARIA', 'SQLITE', 'MONGO'].includes(options.dialect)) {
      throw new Error('Invalid dialect');
    }
    super(options, def);
    this.name = name.trim();
    this.dialect = options.dialect;
  }

  get status(): ClientStatus {
    return this._status;
  }

  async getVersion(): Promise<string> {
    return await '';
  }

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

  public async execute<
    R extends Record<string, unknown> = Record<string, unknown>,
  >(query: RawQuery): Promise<QueryResult<R>> {
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

  protected _standardizeQuery(query: RawQuery): RawQuery {
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
      type: 'RAW',
      sql: sql,
      params: query.params,
    };
  }

  protected abstract _connect(): Promise<void> | void;
  protected abstract _close(): Promise<void> | void;
  protected abstract _execute<
    R extends Record<string, unknown> = Record<string, unknown>,
  >(
    query: RawQuery,
  ): Promise<{ count: number; rows: R[] }> | { count: number; rows: R[] };
  protected abstract _isReallyConnected(): boolean;
}
