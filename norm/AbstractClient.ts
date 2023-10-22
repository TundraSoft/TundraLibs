import { Options } from '../options/mod.ts';
import type { OptionKeys } from '../options/mod.ts';

import { Client } from 'https://deno.land/x/postgres@v0.17.0/mod.ts';

export type Dialects = 'POSTGRES' | 'MARIADB' | 'SQLITE' | 'MONGODB';

export type ClientOptions = {
  dialect: Dialects;
  host: string;
  encryptionKey?: string;
};

export type ConnectionStatus = 'CONNECTED' | 'DISCONNECTED' | 'ERROR';

export type ClientEvents = {
  connect: (name: string, dialect: Dialects) => void;
  disconnect: (name: string, dialect: Dialects) => void;
  error: (name: string, dialect: Dialects, err: Error) => void;
};


//// Query Generator
type QueryType = 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' | 'TRUNCATE';
type Filters<T extends string | number | boolean | bigint | Date> = {
  $eq?: T;
  $ne?: T;
  $gt?: T;
  $gte?: T;
  $lt?: T;
  $lte?: T;
  $in?: T[];
  $nin?: T[];
  $between?: [T, T];
  $like?: string;
  $nlike?: string;
  $ilike?: string;
  $nilike?: string;
  $regex?: string;
  $nregex?: string;
  $iregex?: string;
  $niregex?: string;
  $null?: boolean;
  $nnull?: boolean;
  $empty?: boolean;
  $nempty?: boolean;
  $any?: T[];
  $all?: T[];
  $contains?: T[];
  $ncontains?: T[];
  $contained?: T[];
  $ncontained?: T[];
  $overlap?: T[];
  $noverlap?: T[];
  $adjacent?: T[];
  $nadjacent?: T[];
}

type QueryOptions = {
  schema?: string;
  table: string;
  columns: {
    // alias: column
    [name: string]: string
  };
};

type SelectQueryOptions = QueryOptions & {
  where?: {
    // column: value
    [name: string]: string | number | boolean | bigint | Date | Filters<string | number | boolean | bigint | Date>
  };
  orderBy?: string[];
  groupBy?: string[];
  limit?: number;
  offset?: number;
};


export abstract class AbstractClient<O extends ClientOptions> extends Options<O, ClientEvents> {
  protected _name: string;
  protected _status: ConnectionStatus = 'DISCONNECTED';

  constructor(name: string, options: OptionKeys<O, ClientEvents>) {
    super(options);
    this._name = name.trim();
  }

  get name(): string {
    return this._name;
  }

  get dialect(): Dialects {
    return this._getOption('dialect');
  }

  //#region Public Methods
  public async connect(): Promise<void> {
    this.emit('connect', this.name, this.dialect);
  }

  public async disconnect(): Promise<void> {
    this.emit('disconnect', this.name, this.dialect);
  }

  public async test(): Promise<boolean> {
    return true;
  }

  public async query<T>(sql: string): Promise<T[]> {
    return [];
  }

  public async insert<T>(sql: string): Promise<T[]> {
    return this.query<T>(this._generateSelect<T>(sql));
  }

  public async update<T>(sql: string): Promise<T[]> {
    return this.query<T>(this._generateUpdate<T>(sql));
  }

  public async delete<T>(sql: string): Promise<T[]> {
    return [];
  }

  public async truncate<T>(sql: string): Promise<T[]> {
    return [];
  }

  //#region Query Generators
  public generateSelect<T>(sql: string): string {
    return '';
  }

  public generateInsert<T>(sql: string): string {
    return '';
  }

  public generateUpdate<T>(sql: string): string {
    return '';
  }

  public generateDelete<T>(sql: string): string {
    return '';
  }

  public generateTruncate<T>(sql: string): string {
    return '';
  }
  //#endregion Query Generators

  //#endregion Public Methods

  //#region abstract methods
  
  protected abstract _connect(): Promise<void>;
  protected abstract _disconnect(): Promise<void>;
  protected abstract _test(): Promise<boolean>;
  protected abstract _query<T>(sql: string): Promise<T[]>;

  //#region Query Generators
  protected abstract _generateSelect<T>(sql: string): string;
  protected abstract _generateInsert<T>(sql: string): string;
  protected abstract _generateUpdate<T>(sql: string): string;
  protected abstract _generateDelete<T>(sql: string): string;
  protected abstract _generateTruncate<T>(sql: string): string;
  //#endregion Query Generators

  //#endregion abstract methods
}

export type PostgresClientOptions = ClientOptions & {
  port: number;
  username: string;
  password: string;
  database: string;
  ssl?: boolean;
};

export class PostgresClient extends AbstractClient<PostgresClientOptions> {
  private _tableEscapeChar = '"';
  private _valueEscapeChar = "'";

  constructor(name: string, options: OptionKeys<PostgresClientOptions, ClientEvents>) {
    super(name, options);
  }

  protected async _connect(): Promise<void> {
    this._status = 'CONNECTED';
  }

  protected async _disconnect(): Promise<void> {
    this._status = 'DISCONNECTED';
  }

  protected async _test(): Promise<boolean> {
    return true;
  }

  protected async _query<T>(sql: string): Promise<T[]> {
    return [];
  }

  //#region Query Generators
  protected _generateSelect<T>(sql: string): string {
    return '';
  }

  protected _generateInsert<T>(sql: string): string {
    return '';
  }

  protected _generateUpdate<T>(sql: string): string {
    return '';
  }

  protected _generateDelete<T>(sql: string): string {
    return '';
  }

  protected _generateTruncate<T>(sql: string): string {
    return '';
  }

  //#endregion Query Generators

  protected _escapeValue(value: unknown): string {
    // Basis type, escape
    if (typeof value === 'string') {
      return `${this._valueEscapeChar}${value}${this._valueEscapeChar}`;
    }
    if (typeof value === 'number') {
      return `${value}`;
    }
    if (typeof value === 'boolean') {
      return `${value}`;
    }
    if (value instanceof Date) {
      return `${value.toISOString()}`;
    }
    if (value instanceof Uint8Array) {
      return `${value}`;
    }
    if (value === null) {
      return 'NULL';
    }
    if (value === undefined) {
      return 'NULL';
    }
    if (typeof value === 'object') {
      return `${JSON.stringify(value)}`;
    }
    return `${value}`;
  }

  protected _escapeTable(table: string): string {
    // Remove quotes if already present
    table = table.replace(/"/g, '');
    const tableParts = table.split('.');
    return tableParts.map((part) => `${this._tableEscapeChar}${part}${this._tableEscapeChar}`).join('.');
  }
}