import { Options } from '../options/mod.ts';
import type { OptionKeys } from '../options/mod.ts';

import type {
  ConnectionOptions,
  ConnectionStatus,
  Dialects,
  NormEvents,
  QueryExecute,
  QueryResults,
  QueryTypes,
} from './types/mod.ts';
import {
  NormBaseError,
  NormConfigError,
  NormMalformedQueryError,
  NormQueryError,
} from './errors/mod.ts';

export abstract class AbstractClient<O extends ConnectionOptions>
  extends Options<O, NormEvents> {
  protected _name: string;
  protected _status: ConnectionStatus = 'PENDING';

  constructor(
    name: string,
    options: OptionKeys<O, NormEvents>,
    defaults?: Partial<O>,
  ) {
    if (
      options.dialect === undefined ||
      !['POSTGRES', 'MONGO', 'MARIA', 'SQLITE'].includes(options.dialect)
    ) {
      throw new NormConfigError('Missing or invalid value for dialect', {
        name: name,
        target: 'dialect',
        value: options.dialect || 'N/A',
      });
    }
    // Anyother config validation

    super(options, defaults);
    this._name = name;
  }

  get name(): string {
    return this._name;
  }

  get dialect(): Dialects {
    return this._getOption('dialect') as Dialects;
  }

  get status(): ConnectionStatus {
    return this._status;
  }

  //#region Connection
  public async connect(): Promise<void> {
    if (this.status === 'CONNECTED') {
      return;
    }
    try {
      await this._connect();
      this._status = 'CONNECTED';
      this.emit('connect', this.name, this.dialect);
    } catch (err) {
      this._status = 'ERROR';

      if (!(err instanceof NormBaseError)) {
        // Create instance of NORM error
      }
      this.emit('error', this.name, this.dialect, err);
    }
  }

  public async close(): Promise<void> {
    if (this.status !== 'CONNECTED') {
      return;
    }
    try {
      await this._close();
      this._status = 'DISCONNECTED';
      this.emit('close', this.name, this.dialect);
    } catch (err) {
      this._status = 'ERROR';

      if (!(err instanceof NormBaseError)) {
        // Create instance of NORM error
      }
      this.emit('error', this.name, this.dialect, err);
    }
  }
  //#endregion Connection

  //#region Query
  public async query<
    R extends Record<string, unknown> = Record<string, unknown>,
  >(sql: string, params?: Record<string, unknown>): Promise<QueryResults<R>> {
    await this.connect();
    try {
      const st = performance.now();
      const res: QueryResults<R> = {
        time: 0,
        count: 0,
        type: this._detectQuery(sql),
        sql: sql,
        data: await this._query(sql, params),
      };
      const et = performance.now();
      res.count = res.data.length;
      res.time = et - st;
      this.emit('query', this.name, this.dialect, sql);
      return res;
    } catch (err) {
      // Handle error
      let e: NormQueryError;
      if (err instanceof NormQueryError) {
        e = err;
      } else {
        e = new NormQueryError(err.message, {
          name: this.name,
          dialect: this.dialect,
          sql: sql,
        });
      }
      this.emit('error', this.name, this.dialect, e, sql);
      throw e;
    }
  }

  public async execute(
    sql: string,
    params?: Record<string, unknown>,
  ): Promise<QueryExecute> {
    await this.connect();
    try {
      const st = performance.now();
      const res: QueryExecute = {
        time: 0,
        type: this._detectQuery(sql),
        sql: sql,
      };
      await this._execute(sql, params);
      const et = performance.now();
      res.time = et - st;
      this.emit('query', this.name, this.dialect, sql);
      return res;
    } catch (err) {
      // Handle error
      let e: NormQueryError;
      if (err instanceof NormQueryError) {
        e = err;
      } else {
        e = new NormQueryError(err.message, {
          name: this.name,
          dialect: this.dialect,
          sql: sql,
        });
      }
      this.emit('error', this.name, this.dialect, e, sql);
      throw e;
    }
  }
  //#endregion Query

  //#region Protected Methods
  protected _detectQuery(sql: string): QueryTypes {
    // const regex = /^(SELECT|INSERT|UPDATE|DELETE|CREATE\s*TABLE|ALTER\s*TABLE|DROP\s*TABLE|CREATE\s*VIEW|CREATE\s*MATERIALIZED|ALTER\s*VIEW|DROP\s*VIEW|TRUNCATE|BEGIN|COMMIT|ROLLBACK|SAVEPOINT)\s*/i;
    const regex =
      /^(SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|TRUNCATE|BEGIN|COMMIT|ROLLBACK|SAVEPOINT)\s*/i;
    const matchedValue = sql.match(regex)?.[0].trim();
    return matchedValue?.toUpperCase() as QueryTypes;
  }
  //#endregion Protected Methods

  //#region Abstract Methods
  protected abstract _connect(): void | Promise<void>;
  protected abstract _close(): void | Promise<void>;
  protected abstract _query<
    R extends Record<string, unknown> = Record<string, unknown>,
  >(query: string, params?: Record<string, unknown>): R[] | Promise<R[]>;
  protected abstract _execute(
    sql: string,
    params?: Record<string, unknown>,
  ): void | Promise<void>;
  //#endregion Abstract Methods
}
