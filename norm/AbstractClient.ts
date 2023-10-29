import { Options } from '../options/mod.ts';
import type { OptionKeys } from '../options/mod.ts';

import {
  ClientEvents,
  ClientOptions,
  ConnectionStatus,
  Dialects,
  ExecuteResult,
  QueryResult,
  QueryTypes,
} from './types/mod.ts';
import {
  NormConnectionError,
  NormError,
  NormQueryError,
} from './errors/mod.ts';

export abstract class AbstractClient<O extends ClientOptions>
  extends Options<O, ClientEvents> {
  protected _name: string;
  protected _status: ConnectionStatus = 'DISCONNECTED';

  constructor(name: string, options: OptionKeys<O, ClientEvents>) {
    super(options);
    this._name = name.trim();
    this._verifyConfig();
  }

  get name(): string {
    return this._name;
  }

  get dialect(): Dialects {
    return this._getOption('dialect');
  }

  get status(): ConnectionStatus {
    return this._status;
  }

  //#region Public Methods
  public async connect(): Promise<void> {
    if (this.status === 'CONNECTED') {
      return;
    }
    // Attempt connection
    try {
      await this._connect();
      this._status = 'CONNECTED';
      this.emit('connect', this.name, this.dialect);
    } catch (e) {
      if (e instanceof NormError) {
        throw e;
      }
      throw new NormConnectionError(e.message, {
        config: this.name,
        dialect: this.dialect,
      });
    }
  }

  public async disconnect(): Promise<void> {
    if (this.status === 'DISCONNECTED') {
      return;
    }
    try {
      await this._disconnect();
      this._status = 'DISCONNECTED';
      this.emit('disconnect', this.name, this.dialect);
    } catch (e) {
      if (e instanceof NormError) {
        throw e;
      }
      throw new NormConnectionError(e.message, {
        config: this.name,
        dialect: this.dialect,
      });
    }
  }

  public async version(): Promise<string> {
    await this.connect();
    try {
      const version = await this._version();
      return version;
    } catch (e) {
      if (e instanceof NormError) {
        throw e;
      }
      throw new NormConnectionError(e.message, {
        config: this.name,
        dialect: this.dialect,
      });
    }
  }

  public async query<T extends Record<string, unknown>>(
    sql: string,
  ): Promise<QueryResult<T>> {
    await this.connect();
    try {
      const results: QueryResult<T> = {
          type: this._queryType(sql),
          count: 0,
          rows: [],
          time: 0,
        },
        perfStart = performance.now();
      results.rows = await this._query<T>(sql);
      results.count = results.rows.length;
      const perfEnd = performance.now();
      results.time = perfEnd - perfStart;
      return results;
    } catch (e) {
      if (e instanceof NormError) {
        throw e;
      }
      throw new NormQueryError(e.message, sql, {
        config: this.name,
        dialect: this.dialect,
      });
    }
  }

  public async execute(sql: string): Promise<ExecuteResult> {
    await this.connect();
    try {
      const results: ExecuteResult = {
          type: this._queryType(sql),
          time: 0,
        },
        perfStart = performance.now();
      await this._execute(sql);
      const perfEnd = performance.now();
      results.time = perfEnd - perfStart;
      return results;
    } catch (e) {
      if (e instanceof NormError) {
        throw e;
      }
      throw new NormQueryError(e.message, sql, {
        config: this.name,
        dialect: this.dialect,
      });
    }
  }

  public async insert<T>(sql: string): Promise<T[]> {
    return [];
  }

  public async update<T>(sql: string): Promise<T[]> {
    return [];
  }

  public async delete<T>(sql: string): Promise<T[]> {
    return [];
  }

  public async truncate<T>(sql: string): Promise<T[]> {
    return [];
  }

  //#endregion Public Methods

  //#region Protected Methods
  protected _queryType(sql: string): QueryTypes {
    const qry = sql.trim().toUpperCase();
    if (qry.startsWith('SELECT')) {
      return 'SELECT';
    } else if (qry.startsWith('INSERT')) {
      return 'INSERT';
    } else if (qry.startsWith('UPDATE')) {
      return 'UPDATE';
    } else if (qry.startsWith('DELETE')) {
      return 'DELETE';
    } else if (qry.startsWith('TRUNCATE')) {
      return 'TRUNCATE';
    } else if (qry.startsWith('CREATE')) {
      return 'CREATE';
    } else if (qry.startsWith('DROP')) {
      return 'DROP';
    } else if (qry.startsWith('ALTER')) {
      return 'ALTER';
    } else if (qry.startsWith('BEGIN')) {
      return 'TRANSACTION';
    } else {
      return 'UNKNOWN';
    }
  }

  //#region abstract methods
  protected abstract _verifyConfig(): void;
  protected abstract _connect(): void | Promise<void>;
  protected abstract _disconnect(): void | Promise<void>;
  protected abstract _version(): string | Promise<string>;
  protected abstract _query<T extends Record<string, unknown>>(
    sql: string,
  ): T[] | Promise<T[]>;
  protected abstract _execute(sql: string): void | Promise<void>;
  //#endregion abstract methods

  //#endregion Protected Methods
}

class A extends AbstractClient<ClientOptions> {
  protected _verifyConfig(): void {
    throw new Error('Method not implemented.');
  }
  protected _connect(): void | Promise<void> {
    throw new Error('Method not implemented.');
  }
  protected _disconnect(): void | Promise<void> {
    throw new Error('Method not implemented.');
  }
  protected _version(): string | Promise<string> {
    throw new Error('Method not implemented.');
  }
  protected _query<T extends Record<string, unknown>>(
    sql: string,
  ): T[] | Promise<T[]> {
    throw new Error('Method not implemented.');
  }
  protected _execute(sql: string): void | Promise<void> {
    this._getOption('dialect');
    throw new Error('Method not implemented.');
  }
  constructor() {
    super('test', {} as ClientOptions);
  }
}
