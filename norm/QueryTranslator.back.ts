import type { Dialects } from './types/mod.ts';
import type { DataType } from './const/mod.ts';
import { DataTypeMap } from './const/mod.ts';

type ColumnValidations = {
  required?: boolean;
  nullable?: boolean;
  regex: {
    pattern: RegExp;
    message: string;
  };
  minLength: {
    length: number;
    message: string;
  };
  maxLength: {
    length: number;
    message: string;
  };
};

type ColumnDefinition = {
  name: string;
  type: DataType;
  length?: number;
  default: {
    insert: string;
    update: string;
  };
  nullable: boolean;
  validations?: ColumnValidations;
};

type TableDefinition = {
  name: string;
  schema?: string;
  columns: {
    [name: string]: ColumnDefinition;
  };
};

type Schema = {
  [name: string]: TableDefinition;
};

type QueryExpressions = {
  add: {};
  subtract: {};
  multiply: {};
  divide: {};
  concat: {};
  mod: {};
  tomorrow: {};
};
type QueryType =
  | 'SELECT'
  | 'INSERT'
  | 'UPDATE'
  | 'DELETE'
  | 'TRUNCATE'
  | 'CREATE_TABLE'
  | 'DROP_TABLE'
  | 'CREATE_VIEW'
  | 'DROP_VIEW';

type QueryDefaults<
  T extends Schema = Record<string, TableDefinition>,
  K extends keyof T = keyof T,
> = {
  schema?: T[K]['schema'];
  table: T[K]['name'];
  // Column will be record of alias: column name. From Schema[K]['columns']
  columns: {
    [C in keyof T[K]['columns']]: T[K]['columns'][C]['name'];
  };
  project?: {
    [alias: string]: boolean; // Add support for computed columns
  };
};

type SelectQuery<
  S extends Schema = Record<string, TableDefinition>,
  K extends keyof S = keyof S,
> = QueryDefaults<S, K> & {
  filter?: Record<string, unknown>;
  orderBy?: {
    [C in keyof S[K]['columns']]?: 'ASC' | 'DESC';
  };
  groupBy?: Array<keyof S[K]['columns']>;
  limit?: number;
  offset?: number;
  with?: {
    [X in keyof S]: SelectQuery<S, X>;
  };
};

type InsertQuery<
  T extends Schema = Record<string, TableDefinition>,
  K extends keyof T = keyof T,
> = QueryDefaults<T, K> & {
  values: {
    [C in keyof T[K]['columns']]?: T[K]['columns'][C] extends { type: unknown }
      ? ReturnType<typeof DataTypeMap[T[K]['columns'][C]['type']]>
      : unknown;
  }[];
};

type UpdateQuery<
  T extends Schema = Record<string, TableDefinition>,
  K extends keyof T = keyof T,
> = QueryDefaults<T, K> & {
  values: {
    [C in keyof T[K]['columns']]?: T[K]['columns'][C] extends { type: DataType }
      ? ReturnType<typeof DataTypeMap[T[K]['columns'][C]['type']]>
      : unknown;
  };
  filter?: Record<string, unknown>;
};

type DeleteQuery<
  T extends Schema = Record<string, TableDefinition>,
  K extends keyof T = keyof T,
> = QueryDefaults<T, K> & {
  filter?: Record<string, unknown>;
};

// Base Translator Config
const QueryConfig = {
  escapeIdentifier: '"',
  escape: (value: string): string => {
    console.log(value);
    return value.replace(/"/g, '').split('.').map((v) => `"${v}"`).join('.');
  },
};

// Specific for Postgres
const PostgresQueryConfig = {
  escapeIdentifier: '"',
};

// Specific for MariaDB
const MariaDBQueryConfig = {
  escapeIdentifier: '`',
};

// Specific for SQLite
const SQLiteQueryConfig = {
  escapeIdentifier: '"',
};

export class QueryTranslator {
  protected _dialect: Dialects;
  protected _config = QueryConfig;

  constructor(dialect: Dialects) {
    this._dialect = dialect;
    // Load config for the dialect
    Object.assign(this._config, PostgresQueryConfig);
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

  public select(options: SelectQuery): string {
    return '';
  }

  public update(options: UpdateQuery): string {
    // First check the keys in values. They must all be present in columns
    const columnAlias = Object.keys(options.columns),
      columnNames = Object.values(options.columns),
      keys = Object.keys(options.values),
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
      valueRow = Object.entries(options.values).map(([key, value]) =>
        `${this._escape(key)} = ${
          (value === undefined) ? `NULL` : `'${value}'`
        }`
      ).join(', '),
      filter = options.filter ? ` WHERE ${this._filter(options.filter)}` : '';
    return `UPDATE ${table} SET ${valueRow}${filter} RETURNING ${returning};`;
  }

  public delete(options: DeleteQuery): string {
    const table = this._fqdn(options.table, options.schema),
      returning = Object.entries(options.columns).map(([alias, column]) =>
        `${this._fqdn(column, options.table, options.schema)} AS ${
          this._escape(alias)
        }`
      ).join(', '),
      filter = options.filter ? ` WHERE ${this._filter(options.filter)}` : '';
    return `DELETE FROM ${table}${filter} RETURNING ${returning};`;
  }

  public truncate(options: QueryDefaults): string {
    const table = this._fqdn(options.table, options.schema);
    return `TRUNCATE TABLE ${table};`;
  }

  //#region Protected Methods
  protected _fqdn(...value: Array<string | undefined>): string {
    // remove undefined
    return this._escape(
      value.filter((v) => v !== undefined).reverse().join('.'),
    );
  }

  protected _escape(value: string): string {
    return this._config.escape(value);
  }

  protected _filter(filter: Record<string, unknown>): string {
    return '';
  }
  //#endregion Protected Methods
}

const pg = new QueryTranslator('POSTGRES');

const insQuery = pg.insert({
  table: 'test',
  columns: {
    Id: 'id',
    name: 'name',
    age: 'age',
  },
  values: [
    { Id: 1, name: 'test' },
  ],
});

const insQuery2 = pg.insert({
  table: 'test',
  columns: {
    Id: 'id',
    name: 'name',
    age: 'age',
  },
  values: [
    { Id: 1, name: 'test' },
    { Id: 2, name: 'test2', age: 22 },
  ],
});

const updQuery = pg.update({
  table: 'test',
  columns: {
    Id: 'id',
    name: 'name',
    age: 'age',
  },
  values: {
    name: 'dzfd',
  },
});

console.log(insQuery);
console.log(insQuery2);
console.log(updQuery);
