import type { Dialects, QueryTypes } from './types/mod.ts';
import type { DataType } from './const/mod.ts';
import { DataTypeMap, QueryConfig } from './const/mod.ts';
import {
  MariaQueryConfig,
  PostgresQueryConfig,
  SQLiteQueryConfig,
} from './dialects/mod.ts';

type BaseQuery = {
  type: QueryTypes;
  table: string;
  schema?: string;
  columns: {
    [alias: string]: string;
  };
};

type InsertQuery = BaseQuery & {
  values: [{
    [alias: string]: string;
  }];
};

export class SQLGenerator {
  protected _dialect: Dialects;
  protected _config = QueryConfig;

  constructor(dialect: Dialects) {
    this._dialect = dialect;
    switch (dialect) {
      case 'POSTGRES':
        Object.assign(this._config, PostgresQueryConfig);
        break;
      case 'MARIADB':
        Object.assign(this._config, MariaQueryConfig);
        break;
      case 'SQLITE':
        Object.assign(this._config, SQLiteQueryConfig);
        break;
      default:
        Object.assign(this._config, QueryConfig);
        break;
    }
  }

  public get dialect(): Dialects {
    return this._dialect;
  }

  public createDatabase(name: string) {
    return `CREATE DATABASE IF NOT EXISTS ${this._escape(name)};`;
  }

  public dropDatabase(name: string, cascade = true) {
    cascade = cascade && this._config.cascade.database;
    return `DROP DATABASE IF EXISTS ${this._escape(name)}${
      cascade ? ' CASCADE;' : ';'
    }`;
  }

  public createSchema(name: string) {
    return `CREATE SCHEMA IF NOT EXISTS ${this._escape(name)};`;
  }

  public dropSchema(name: string, cascade = true) {
    cascade = cascade && this._config.cascade.schema;
    return `DROP SCHEMA IF EXISTS ${this._escape(name)}${
      cascade ? ' CASCADE;' : ';'
    }`;
  }

  public insert(options: InsertQuery): string {
    // First check the keys in values. They must all be present in columns
    const columnAlias = Object.keys(options.columns),
      columnNames = Object.values(options.columns),
      keys = options.values.map((row) => Object.keys(row)).flat().filter((
        value,
        index,
        self,
      ) => self.indexOf(value) === index),
      missingKeys = keys.filter((key) => !columnAlias.includes(key));
    if (missingKeys.length > 0) {
      throw new Error(`Missing columns: ${missingKeys.join(', ')}`);
    }
    // Ok now we can build the query
    const table = this._fqdn(options.table, options.schema),
      columns = keys.map((column) => this._escape(column)).join(', '),
      returning = Object.entries(options.columns).map(([alias, column]) =>
        `${this._fqdn(column, options.table, options.schema)} AS ${
          this._escape(alias)
        }`
      ).join(', '),
      valueRow = `(${
        options.values.map((row) =>
          keys.map((key) => (row[key] === undefined) ? `NULL` : `'${row[key]}'`)
            .join(', ')
        ).join('), (')
      })`;
    return `INSERT INTO ${table} (${columns}) VALUES ${valueRow} RETURNING ${returning};`;
  }

  //#region Protected methods
  protected _fqdn(...value: Array<string | undefined>): string {
    // remove undefined
    return this._escape(
      value.filter((v) => v !== undefined).reverse().join('.'),
    );
  }

  protected _escape(value: string): string {
    return this._config.escape(value);
  }

  protected _getDataType(type: DataType): string {
    return this._config.dataTypes[type];
  }
  //#endregion Protected methods
}

const a = new SQLGenerator('POSTGRES');
console.log(`Create Database: ${a.createDatabase('test')}`);
console.log(`Drop Database: ${a.dropDatabase('test')}`);

console.log(`Create Database: ${a.createSchema('test')}`);
console.log(`Drop Database: ${a.createSchema('test')}`);
