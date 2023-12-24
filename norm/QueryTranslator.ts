import type {
  BaseQuery,
  DeleteQuery,
  Dialects,
  InsertQuery,
  QueryFilters,
  SelectQuery,
  TableDefinition,
  UpdateQuery,
} from './types/mod.ts';
import {
  MariaQueryTranslatorConfig,
  PostgresQueryTranslatorConfig,
  SQLiteQueryTranslatorConfig,
} from './dialects/mod.ts';
import { QueryTranslatorConfig } from './const/mod.ts';

export class QueryTranslator {
  protected _dialect: Dialects;
  protected _config = QueryTranslatorConfig;

  constructor(dialect: Dialects) {
    this._dialect = dialect;
    switch (dialect) {
      case 'MARIA':
        Object.assign(this._config, MariaQueryTranslatorConfig);
        break;
      case 'POSTGRES':
        Object.assign(this._config, PostgresQueryTranslatorConfig);
        break;
      case 'SQLITE':
        Object.assign(this._config, SQLiteQueryTranslatorConfig);
        break;
    }
  }

  get dialect(): Dialects {
    return this._dialect;
  }

  public select(query: SelectQuery) {
    // Basic operation is same as everywhere, but we need to handle "with"
    // With is joins, if filters are present but no project, then do not select but do a join
    // If project is present, then do a join and select columns (irrespective of filters)
    // If no filter and project then do not join, just select columns from main table
    // Sorting and ordering is cascaded up to the parent
    // Add the name of the relationship as alias to all columns (special for filters)

    
    const tableName = [query.name, query.schema],
      filter: QueryFilters[] = [],
      columns: string[] = [],
      joins: string[] = [];
    //#region Rename column names
    Object.entries(query.columns).forEach(([key, value]) => {
      columns.push(`${value} AS ${key}`);
    });
    //#endregion
    if (query.filter) {
      filter.push(this._normaliseFilter(query.columns, query.filter));
    }
    if (query.with !== undefined) {
      Object.entries(query.with).forEach(([_key, value]) => {
        filter.push(
          this._normaliseFilter(
            (value as SelectQuery).columns,
            (value as SelectQuery).filter as QueryFilters,
          ),
        );
      });
    }
  }

  public count(query: SelectQuery) {
    const tableName = [query.name, query.schema],
      filter = query.filter
        ? this._normaliseFilter(query.columns, query.filter)
        : undefined;
    // Parse columns
    const columns = Object.entries(query.columns).map(([key, value]) => {
      return `${value} AS ${key}`;
    });
  }

  public insert(query: InsertQuery) {
    const tableName = [query.name, query.schema];
    // Get all unique keys from d
    const insertColumns = query.data.reduce((acc, val) => {
      Object.keys(val).forEach((key) => {
        if (!acc.includes(key)) acc.push(key);
      });
      return acc;
    }, [] as string[]);
    // Loop through values to be inserted, change the key to actual column name
    const values = query.data.map((d) => {
      const ret: Record<string, unknown> = {};
      for (const col of insertColumns) {
        if (query.columns[col]) {
          ret[query.columns[col]] = d[col] || null;
        }
      }
      return ret;
    });
    // Project
    const project: Record<string, string> = {};
    if (query.project) {
      // Loop through project and change the key to actual column name
      query.project.forEach((p) => {
        if (query.columns[p]) {
          project[query.columns[p]] = String(p);
        }
      });
    } else {
      // If no project is specified, then return all columns
      Object.entries(query.columns).forEach(([key, value]) => {
        project[value] = key;
      });
    }
    return this._config.insert(tableName, insertColumns, values, project);
  }

  public update(query: UpdateQuery) {
    const tableName = [query.name, query.schema];
    const set: Record<string, unknown> = {};
    Object.entries(query.data).forEach(([key, value]) => {
      if (query.columns[key]) {
        set[query.columns[key]] = value;
      }
    });
    // Project
    const project: Record<string, string> = {};
    if (query.project) {
      // Loop through project and change the key to actual column name
      query.project.forEach((p) => {
        if (query.columns[p]) {
          project[query.columns[p]] = String(p);
        }
      });
    } else {
      // If no project is specified, then return all columns
      Object.entries(query.columns).forEach(([key, value]) => {
        project[value] = key;
      });
    }
    const filter = query.filter
      ? this._normaliseFilter(query.columns, query.filter)
      : undefined;
    return this._config.update(tableName, query.data, project, filter);
  }

  public delete(query: DeleteQuery) {
    // const { model, where } = query;
    const tableName = [query.name, query.schema];
    const filter = query.filter
      ? this._normaliseFilter(query.columns, query.filter)
      : undefined;
    return this._config.delete(tableName, filter);
  }

  public truncate(table: string, schema?: string) {
    return this._config.truncate([table, schema]);
    // return `TRUNCATE TABLE ${this._escape(schema, table)};`;
  }

  public createSchema(schema: string) {
    return this._config.createSchema(schema);
    // return `CREATE SCHEMA IF NOT EXISTS ${this._escape(schema)};`;
  }

  public dropSchema(schema: string) {
    return this._config.dropSchema(schema);
  }

  public createTable(
    table: TableDefinition,
  ) {
    this._config.createTable(
      [table.name, table.schema],
      Object.values(table.columns),
      table.primaryKeys,
      table.uniqueKeys,
      table.foreignKeys,
    );
  }

  public dropTable(table: string, schema?: string) {
    return this._config.dropTable(table, schema);
    // return `DROP TABLE IF EXISTS ${this._escape(schema, table)};`;
  }

  public renameTable(
    newName: Array<string | undefined>,
    oldName: Array<string | undefined>,
  ) {
    return this._config.renameTable(newName, oldName);
  }

  public addColumn(_query: BaseQuery) {}

  public dropColumn(name: string, table: string, schema?: string) {
    return this._config.dropColumn(name, table, schema);
  }

  public renameColumn(
    newName: string,
    oldName: string,
    table: string,
    schema?: string,
  ) {
    return this._config.renameColumn(newName, oldName, table, schema);
  }

  public alterColumn(_query: BaseQuery) {}

  protected _normaliseFilter(
    columns: Record<string, string>,
    filter: QueryFilters, 
  ): QueryFilters {
    // Cycle through the filter object and replace the keys with the actual column name
    const newFilter: QueryFilters = {};
    Object.keys(filter).forEach((key) => {
      if (key === '$and' || key === '$or') {
        // newFilter[key] = this._normaliseFilter(columns, filter[key] as unknown as QueryFilters);
        newFilter[key] = filter[key]?.map((f) =>
          this._normaliseFilter(columns, f)
        );
      } else {
        if (columns[key] === undefined) {
          throw new Error(`Column name not found ${key}`);
        }
        newFilter[columns[key]] = filter[key];
      }
    });
    return newFilter;
  }

  public whereCondition(
    columns: Record<string, string>,
    filter: QueryFilters,
    joiner = 'AND',
  ) {
    return this._config.where(this._normaliseFilter(columns, filter), joiner);
  }

  protected _quoteValue(value: unknown): string {
    return this._config.quoteValue(value);
  }

  protected _escape(value: Array<string | undefined>): string {
    return this._config.escape(value);
  }
}

const a = new QueryTranslator('POSTGRES');
console.log(a.insert({
  name: 'test',
  schema: 'public',
  columns: {
    id: 'ID',
    name: 'NAME',
    age: 'AGE',
    email: 'EmAiL',
  },
  data: [{
    id: 1,
    name: 'John',
    age: 30,
    email: 'adf@gmail.com',
  }, {
    id: 1,
    email: 'adf@gmail.com',
  }],
  // project: ['name', 'age', 'email'],
}));
const where = a.whereCondition({
  asd: 'aa1',
  ds: 'aa2',
  sdf: 'aa3',
  sdfsdf: 'aa4',
  sdf2: 'aa5',
}, {
  'asd': '123',
  'ds': {
    $ne: '321',
  },
  $or: [{
    'sdf': 34,
    'sdfsdf': new Date(),
    'sdf2': {
      $in: ['123', '321'],
    },
  }],
});
console.log(where);
// const tableFQDN = '"Ji"';
// const columns = '"a", "b", "c"';
// const returning = '"a", "b", "c"';
// console.log(`${QueryTranslatorConfig.insertTemplate}`)

// function sqlInsert(strings: TemplateStringsArray, ...values: any[]): string {
//   let query = strings[0];
//   values.forEach((value, index) => {
//     query += Array.isArray(value) ? value.join(', ') : value;
//     query += strings[index + 1];
//   });
//   return query;
// }

// // Usage
// const tableName = 'users';
// const columns = ['name', 'age', 'email'];
// const values = ['Alice', 30, 'alice@example.com'];

// const query = sqlInsert`INSERT INTO ${tableName} (${columns}) VALUES (${
//   values.map(() => '?').join(', ')
// })`;
// console.log(query);
