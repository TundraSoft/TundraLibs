import { Options } from '../options/mod.ts';
import type { OptionKeys } from '../options/mod.ts';

import {
  ClientEvents,
  ClientOptions,
  ClientStatus,
  Dialects,
  QueryExecute,
  QueryResults,
  QueryTypes,
} from './types/mod.ts';

import {
  NormBaseError,
  NormClientError,
  NormConfigError,
  NormQueryError,
} from './errors/mod.ts';

export type BaseQuery = {
  source: string[];
  columns: Record<string, string>;
};

export type InsertQuery = BaseQuery & {
  values: Record<string, unknown> | Record<string, unknown>[];
};

export abstract class AbstractClient<O extends ClientOptions = ClientOptions>
  extends Options<O, ClientEvents> {
  protected _name: string;
  protected _status: ClientStatus = 'PENDING';

  /**
   * Constructs a new instance of the AbstractClient class.
   * @param name - The name of the client.
   * @param options - The options for the client.
   * @throws {NormConfigError} If the dialect is not specified or not supported.
   */
  constructor(name: string, options: OptionKeys<O, ClientEvents>) {
    if (options.dialect === undefined) {
      throw new NormConfigError('Dialect is required', {
        config: name,
        configItem: 'dialect',
      });
    }
    if (!['MARIA', 'MONGO', 'POSTGRES', 'SQLITE'].includes(options.dialect)) {
      throw new NormConfigError(
        `Dialect '${options.dialect}' is not supported`,
        { config: name, configItem: 'dialect' },
      );
    }
    const def: Partial<O> = {
      slowQueryThreshold: 5, // seconds
    } as Partial<O>;
    super(options, def);
    this._name = name;
  }

  get name(): string {
    return this._name;
  }

  get dialect(): Dialects {
    return this._getOption('dialect') as Dialects;
  }

  get status(): ClientStatus {
    return this._status;
  }

  //#region Public methods
  //#region Connection
  public async connect() {
    if (this.status === 'CONNECTED') {
      return;
    }
    try {
      await this._connect();
      this._status = 'CONNECTED';
      this.emit('connect', this.name);
    } catch (e) {
      this._status = 'ERROR';
      let nErr: NormBaseError;
      if (e instanceof NormBaseError) {
        nErr = e;
      } else {
        nErr = new NormClientError(e.message, {
          config: this.name,
          dialect: this.dialect,
        });
      }
      this.emit('error', this.name, nErr);
      throw nErr;
    }
  }

  public async close() {
    if (this.status !== 'CONNECTED') {
      return;
    }
    try {
      await this._close();
      this._status = 'CLOSED';
      this.emit('close', this.name);
    } catch (e) {
      this._status = 'ERROR';
      let nErr: NormBaseError;
      if (e instanceof NormBaseError) {
        nErr = e;
      } else {
        nErr = new NormClientError(e.message, {
          config: this.name,
          dialect: this.dialect,
        });
      }
      this.emit('error', this.name, nErr);
      throw nErr;
    }
  }
  //#endregion Connection
  //#region Query
  public async query<
    R extends Record<string, unknown> = Record<string, unknown>,
  >(sql: string, params?: Record<string, unknown>): Promise<QueryResults<R>> {
    // Connect if not connected
    await this.connect();
    try {
      const st = performance.now();
      sql = this._sanitizeQuery(sql, params);
      const slowQueryTime = (this._getOption('slowQueryThreshold') || 5) * 1000,
        slowThreshold = setTimeout(
          () =>
            this.emit(
              'slowQuery',
              this.name,
              slowQueryTime / 1000,
              sql,
              params,
            ),
          slowQueryTime,
        );
      const res: QueryResults<R> = {
        time: 0,
        count: 0,
        type: this._detectQuery(sql),
        sql: sql,
        params: params,
        data: await this._query(sql, params),
      };
      clearTimeout(slowThreshold);
      const et = performance.now();
      res.count = res.data.length;
      res.time = et - st;
      this.emit('query', this.name, res.time, sql, params, res.count);
      return res;
    } catch (err) {
      // Emit the error
      let nErr: NormBaseError;
      // this.emit('error', this.name, e, sql);
      if (err instanceof NormBaseError) {
        nErr = err;
      } else {
        nErr = new NormQueryError(err.message, { sql, params }, {
          config: this.name,
          dialect: this.dialect,
        });
      }
      this.emit('error', this.name, nErr);
      throw nErr;
    }
  }

  public async execute(
    sql: string,
    params?: Record<string, unknown>,
  ): Promise<QueryExecute> {
    // Connect if not connected
    await this.connect();
    try {
      const st = performance.now();
      sql = this._sanitizeQuery(sql, params);
      const slowQueryTime = (this._getOption('slowQueryThreshold') || 5) * 1000,
        slowThreshold = setTimeout(
          () =>
            this.emit(
              'slowQuery',
              this.name,
              slowQueryTime / 1000,
              sql,
              params,
            ),
          slowQueryTime,
        );
      const res: QueryExecute = {
        time: 0,
        type: this._detectQuery(sql),
        sql: sql,
        params: params,
      };
      await this._execute(sql, params);
      clearTimeout(slowThreshold);
      const et = performance.now();
      res.time = et - st;
      this.emit('query', this.name, res.time, sql, params, 0);
      return res;
    } catch (err) {
      // Emit the error
      // this.emit('error', this.name, e, sql);
      if (err instanceof NormBaseError) {
        throw err;
      }
      throw new NormQueryError(err.message, { sql, params }, {
        config: this.name,
        dialect: this.dialect,
      });
    }
  }
  //#endregion Query
  //#endregion Public methods
  public async insert(insert: InsertQuery) {
    // Connect if not connected
    await this.connect();
    // Use translator to translate to SQL query

    // Return the value
    return;
  }
  //#region Protected methods
  protected _detectQuery(sql: string): QueryTypes {
    // const regex = /^(SELECT|INSERT|UPDATE|DELETE|CREATE\s*TABLE|ALTER\s*TABLE|DROP\s*TABLE|CREATE\s*VIEW|CREATE\s*MATERIALIZED|ALTER\s*VIEW|DROP\s*VIEW|TRUNCATE|BEGIN|COMMIT|ROLLBACK|SAVEPOINT)\s*/i;
    const regex =
      /^(SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|TRUNCATE|BEGIN|COMMIT|ROLLBACK|SAVEPOINT)\s*/i;
    const matchedValue = sql.match(regex)?.[0].trim();
    return matchedValue?.toUpperCase() as QueryTypes || 'UNKNOWN';
  }

  protected _sanitizeQuery(
    sql: string,
    params?: Record<string, unknown>,
  ): string {
    // Remove trailing ; and add it
    sql = sql.trim().replace(/;+$/, '') + ';';
    // if (params === undefined) {
    //   return sql;
    // }
    const keys = Object.keys(params || {});
    const missing: string[] = [];
    const matches = sql.match(/:(\w+):/g);
    console.log(matches);
    if (matches !== null) {
      for (const match of matches) {
        const key = match.substr(1, match.length - 2);
        if (!keys.includes(key)) {
          missing.push(key);
        }
      }
    }
    if (missing.length > 0) {
      throw new NormQueryError(`Missing parameters: ${missing.join(', ')}`, {
        sql,
        params,
      }, {
        config: this._name,
        dialect: this.dialect,
      });
    }
    return sql;
  }

  //#region Abstract methods
  protected abstract _connect(): Promise<void> | void;
  protected abstract _close(): Promise<void> | void;
  protected abstract _query<R extends Record<string, unknown>>(
    sql: string,
    params?: Record<string, unknown>,
  ): Promise<R[]> | R[];
  protected abstract _execute(
    sql: string,
    params?: Record<string, unknown>,
  ): Promise<void> | void;
  //#endregion Abstract methods
  //#endregion Protected methods
}
