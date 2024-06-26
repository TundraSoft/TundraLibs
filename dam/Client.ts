import { type OptionKeys, Options } from '../options/mod.ts';

import type {
  ClientEvents,
  ClientOptions,
  ClientResult,
  ClientStatus,
  Dialects,
  Query,
} from './types/mod.ts';

import {
  DAMClientConfigError,
  DAMClientConnectionError,
  DAMClientError,
  DAMClientMissingParamsError,
  DAMClientQueryError,
  DAMError,
} from './errors/mod.ts';
import { assertClientOptions } from './asserts/mod.ts';

export abstract class Client<O extends ClientOptions = ClientOptions>
  extends Options<O, ClientEvents> {
  public readonly name: string;
  public readonly dialect: Dialects;
  protected _status: ClientStatus = 'READY';
  protected _version: string | undefined;

  constructor(name: string, options: OptionKeys<O, ClientEvents>) {
    // Set defaults
    const def: Partial<O> = {
      slowQueryThreshold: 5,
    } as Partial<O>;
    options = { ...def, ...options };
    if (!assertClientOptions(options)) {
      throw new DAMClientConfigError({
        dialect: (options as ClientOptions).dialect || 'N/A',
        configName: name,
      });
    }
    super(options);
    this.name = name.trim().toLowerCase();
    this.dialect = options.dialect;
  }

  get status(): ClientStatus {
    return this._status;
  }

  public async connect(): Promise<void> {
    if (this.status === 'CONNECTED') return;
    let nErr: DAMError | undefined = undefined;
    try {
      await this._connect();
      this._status = 'CONNECTED';
    } catch (err) {
      this._status = 'ERROR';
      if (err instanceof DAMClientConnectionError) {
        nErr = err;
      } else {
        nErr = new DAMClientConnectionError({
          configName: this.name,
          dialect: this.dialect,
        }, err);
      }
      throw nErr;
    } finally {
      if (nErr) {
        this.emit('error', this.name, 'CONNECTION', nErr);
      } else {
        this.emit('connect', this.name);
      }
    }
  }

  public async close(): Promise<void> {
    if (this.status !== 'CONNECTED') return;
    try {
      await this._close();
      this._status = 'READY';
      this.emit('close', this.name);
    } catch (err) {
      this._status = 'ERROR';
      let nErr: DAMError;
      if (err instanceof DAMClientConnectionError) {
        nErr = err;
      } else {
        nErr = new DAMClientError(err.message, {
          configName: this.name,
          dialect: this.dialect,
        });
      }
      this.emit('error', this.name, 'CONNECTION', nErr);
      throw nErr;
    }
  }

  public async query<
    R extends Record<string, unknown> = Record<string, unknown>,
  >(query: Query): Promise<ClientResult<R>> {
    await this.connect();
    let error: DAMError | undefined;
    const result: ClientResult<R> = {
      time: 0,
      count: 0,
      data: [],
    };
    try {
      const st = performance.now();
      const res = await this._execute<R>(query);
      result.time = performance.now() - st;
      result.count = res.count;
      result.data = res.rows;
      return result;
    } catch (e) {
      if (
        e instanceof DAMClientQueryError ||
        e instanceof DAMClientMissingParamsError
      ) {
        error = e;
      } else {
        error = new DAMClientQueryError({
          dialect: this.dialect,
          configName: this.name,
          query,
        }, e);
      }
      throw error;
    } finally {
      const slowQueryThreshold = (this._getOption('slowQueryThreshold') || 5) *
        1000;
      this.emit(
        'query',
        this.name,
        result.time,
        query,
        result.time > slowQueryThreshold,
        result.count,
        error,
      );
    }
  }

  public async ping(): Promise<boolean> {
    try {
      await this.query({ sql: 'SELECT 1;' });
      return true;
    } catch (_e) {
      return false;
    }
  }

  public async version(): Promise<string> {
    if (this._version === undefined) {
      await this.connect();
      this._version = await this._getVersion();
    }
    return this._version;
  }

  //#region Protected Methods
  protected _standardizeQuery(
    query: Query,
  ): Query {
    const sql = query.sql.trim().replace(/;$/, '') + ';';
    const keys = Object.keys(query.params || {});
    const missing: string[] = [];
    const matches = sql.match(/:(\w+):/g);
    if (matches !== null) {
      for (const match of matches) {
        const key = match.substring(1, match.length - 1);
        if (!keys.includes(key)) {
          missing.push(key);
        }
      }
    }
    if (missing.length > 0) {
      throw new DAMClientMissingParamsError(missing, {
        dialect: this.dialect,
        configName: this.name,
        query,
      });
    }
    return {
      sql,
      params: query.params,
    };
  }

  //#region Abstract Methods
  protected abstract _connect(): Promise<void> | void;
  protected abstract _close(): Promise<void> | void;
  protected abstract _execute<R extends Record<string, unknown>>(
    query: Query,
  ): Promise<{ count: number; rows: R[] }> | { count: number; rows: R[] };
  protected abstract _getVersion(): Promise<string> | string;
  //#endregion Abstract Methods
  //#endregion Protected Methods
}
