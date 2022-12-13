import { GeneratorOutput, QueryTypes, RawQuery } from './types/mod.ts';
import type {
  BaseColumnDefinition,
  CountQuery,
  CreateSchemaQuery,
  CreateTableQuery,
  DeleteQuery,
  Dialects,
  DropSchemaQuery,
  DropTableQuery,
  InsertQuery,
  QueryFilter,
  QueryOption,
  SelectQuery,
  TranslatorConfig,
  TruncateTableQuery,
  UpdateQuery,
} from './types/mod.ts';

import {
  Generator,
  MariaTranslatorConfig,
  PostgresTranslatorConfig,
  SQLiteTranslatorConfig,
} from './types/mod.ts';
// import { QueryError } from "./errors/mod.ts";

export class QueryTranslator {
  protected _dialect: Dialects;
  // protected _valueQuote = "'";
  // protected _columnQuote = '`';
  protected _config: TranslatorConfig;

  constructor(dialect: Dialects) {
    this._dialect = dialect;
    // Load few defaults of the dialects
    switch (dialect) {
      case 'POSTGRES':
        this._config = PostgresTranslatorConfig;
        break;
      case 'MARIADB':
      case 'MYSQL':
        this._config = MariaTranslatorConfig;
        break;
      case 'SQLITE':
        this._config = SQLiteTranslatorConfig;
        break;
      default:
        throw new Error(`Unknown dialect: ${dialect}`);
    }
  }

  public get dialect(): Dialects {
    return this._dialect;
  }

  public hasGenerator(name: string): boolean {
    return (Object.keys(this._config.generators).includes(name));
  }

  public async getGenerator(
    name: keyof typeof Generator,
  ): Promise<GeneratorOutput> {
    const retval = this._config.generators[name];
    return (retval instanceof Function) ? await retval() : retval;
  }

  // deno-lint-ignore no-explicit-any
  public quoteValue(value: any): string {
    // Replace Generator
    if (this.hasGenerator(value)) {
      value = this.getGenerator(value);
    }
    if (
      typeof value === null || typeof (value) === 'function' ||
      typeof (value) === 'symbol' || typeof (value) === 'undefined' ||
      String(value).toUpperCase() === 'NULL'
    ) {
      return 'NULL';
    }
    if (value === false) {
      return 'FALSE';
    }
    if (value === true) {
      return 'TRUE';
    }
    if (typeof value === 'number' || typeof value === 'bigint') {
      return value + '';
    }
    if (value instanceof Date) {
      return this.quoteValue(`${value.toISOString()}`);
    }
    if (value instanceof Array || Array.isArray(value)) {
      return '(' + value.map((v) => this.quoteValue(v)).join(',') + ')';
    }
    if (typeof value === 'object') {
      value = JSON.stringify(value);
    } else {
      value += '';
    }
    // This handles DB Function calls
    if (value.substr(0, 2) === '${') {
      return value.substr(2, value.length - 3);
    }
    // Escape quotes already present
    const findRegEx = new RegExp(this._config.quote.value, 'g'),
      replace = this._config.quote.value + this._config.quote.value;
    // return `'${value.replace(/'/g, "''")}'`;
    return `${this._config.quote.value}${
      value.replace(findRegEx, replace)
    }${this._config.quote.value}`;
  }

  public quoteColumn(value: string): string {
    const split = value.split('.');
    return `${this._config.quote.column}${
      split.join(this._config.quote.column + '.' + this._config.quote.column)
    }${this._config.quote.column}`;
  }

  public translate<
    Entity extends Record<string, unknown> = Record<string, unknown>,
  >(query: QueryOption<Entity>): string {
    if (query.type === 'RAW') {
      // Mayhaps replace the params?
      return (query as RawQuery).sql;
    }

    switch (query.type) {
      case QueryTypes.SELECT:
        return this.select<Entity>(query as SelectQuery<Entity>);
      case QueryTypes.COUNT:
        return this.count<Entity>(query as CountQuery<Entity>);
      case QueryTypes.INSERT:
        return this.insert<Entity>(query as InsertQuery<Entity>);
      case QueryTypes.UPDATE:
        return this.update<Entity>(query as UpdateQuery<Entity>);
      case QueryTypes.DELETE:
        return this.delete<Entity>(query as DeleteQuery<Entity>);
      //#region DDL
      case QueryTypes.CREATE_SCHEMA:
        return this.createSchema(query as CreateSchemaQuery);
      case QueryTypes.DROP_SCHEMA:
        return this.dropSchema(query as DropSchemaQuery);
      case QueryTypes.CREATE_TABLE:
        return this.createTable<Entity>(query as CreateTableQuery<Entity>);
      case QueryTypes.DROP_TABLE:
        return this.dropTable(query as DropTableQuery);
      case QueryTypes.TRUNCATE:
        return this.truncate(query as TruncateTableQuery);
      //#endregion DDL
      default:
        throw new Error(`Unknown query type: ${query.type}`);
    }
  }

  public select<
    Entity extends Record<string, unknown> = Record<string, unknown>,
  >(query: SelectQuery<Entity>): string {
    if (query.pagination && query.pagination.limit < 1) {
      delete query.pagination;
    }
    if (query.pagination && query.pagination.page < 1) {
      query.pagination.page = 1;
    }
    const tableName = this.quoteColumn(
        (query.schema ? query.schema + '.' : '') + query.table,
      ),
      columns = Object.keys(query.columns).map((alias) => {
        if (
          !query.project || (query.project && query.project.includes(alias))
        ) {
          return `${this.quoteColumn(query.columns[alias])} AS ${
            this.quoteColumn(alias)
          }`;
        }
        return '';
      }),
      paging = (query.pagination && query.pagination.limit > 0)
        ? `LIMIT ${query.pagination.limit} OFFSET ${
          (query.pagination.page - 1) * query.pagination.limit
        } `
        : '',
      sort = (query.sorting && Object.keys(query.sorting).length > 0)
        ? ` ORDER BY ${
          Object.entries(query.sorting).map((value) => {
            return `${this.quoteColumn(query.columns[value[0]])} ${value[1]} `;
          }).join(', ')
        }`
        : '',
      filter = (query.filters)
        ? ` WHERE ${this._processFilters(query.columns, query.filters)}`
        : '';
    return `SELECT ${
      columns.join(', ')
    } FROM ${tableName}${filter}${sort}${paging};`;
  }

  public count<
    Entity extends Record<string, unknown> = Record<string, unknown>,
  >(query: CountQuery<Entity>): string {
    const tableName = this.quoteColumn(
        (query.schema ? query.schema + '.' : '') + query.table,
      ),
      filter = (query.filters)
        ? ` WHERE ${this._processFilters(query.columns, query.filters)}`
        : '';
    return `SELECT COUNT(1) AS TotalRows FROM ${tableName}${filter};`;
  }

  public insert<
    Entity extends Record<string, unknown> = Record<string, unknown>,
  >(query: InsertQuery<Entity>): string {
    const tableName = this.quoteColumn(
        (query.schema ? query.schema + '.' : '') + query.table,
      ),
      project = (query.project && query.project.length > 0)
        ? query.project
        : Object.keys(query.columns),
      insertColumns = (query.insertColumns)
        ? query.insertColumns
        : Object.keys(query.columns),
      columns = insertColumns.map((alias) => {
        return `${this.quoteColumn(query.columns[alias])}`;
      }),
      values = query.data.map((row) => {
        return Object.keys(query.columns).map((key) => {
          return this.quoteValue((row[key] === undefined) ? 'NULL' : row[key]);
        });
      }),
      returning = ' \nRETURNING ' + project.map((alias) => {
        return `${this.quoteColumn(query.columns[alias])} AS ${
          this.quoteColumn(alias as string)
        }`;
      }).join(', \n');
    return `INSERT INTO ${tableName} \n(${columns.join(', ')}) \nVALUES (${
      values.join('), \n(')
    })${returning};`;
  }

  public update<
    Entity extends Record<string, unknown> = Record<string, unknown>,
  >(query: UpdateQuery<Entity>): string {
    const tableName = this.quoteColumn(
        (query.schema ? query.schema + '.' : '') + query.table,
      ),
      project = (query.project && query.project.length > 0)
        ? query.project
        : Object.keys(query.columns),
      columns = Object.keys(query.data).map((columnName) => {
        return `${this.quoteColumn(query.columns[columnName])} = ${
          this.quoteValue(query.data[columnName])
        }`;
      }),
      filter = (query.filters)
        ? ` WHERE ${this._processFilters(query.columns, query.filters)}`
        : '',
      returning = ' \nRETURNING ' + project.map((alias) => {
        return `${this.quoteColumn(query.columns[alias])} AS ${
          this.quoteColumn(alias as string)
        }`;
      }).join(', \n');
    return `UPDATE ${tableName} \nSET ${
      columns.join(', \n')
    }${filter}${returning};`;
  }

  public delete<
    Entity extends Record<string, unknown> = Record<string, unknown>,
  >(query: DeleteQuery<Entity>): string {
    const tableName = this.quoteColumn(
        (query.schema ? query.schema + '.' : '') + query.table,
      ),
      filter = (query.filters)
        ? ` WHERE ${this._processFilters(query.columns, query.filters)}`
        : '';
    return `DELETE FROM ${tableName}${filter};`;
  }

  public createSchema(query: CreateSchemaQuery): string {
    return `CREATE SCHEMA IF NOT EXISTS ${this.quoteColumn(query.schema)};`;
  }

  public dropSchema(query: DropSchemaQuery): string {
    return `DROP SCHEMA IF EXISTS ${this.quoteColumn(query.schema)}${
      query.cascade === true ? ` CASCADE` : ''
    };`;
  }

  public createTable<
    Entity extends Record<string, unknown> = Record<string, unknown>,
  >(query: CreateTableQuery<Entity>): string {
    const table = `${query.schema ? query.schema + '.' : ''}${query.table}`,
      body = Object.keys(query.columns).map((columnName) => {
        return `${this.quoteColumn(columnName)} ${
          this._processColumnType(
            query.columns[columnName],
          )
        }`;
      });
    if (query.primaryKey) {
      body.push(
        `PRIMARY KEY (${
          query.primaryKey.map((columnName) => {
            return this.quoteColumn(columnName as string);
          }).join(', ')
        })`,
      );
    }
    if (query.uniqueKeys) {
      Object.entries(query.uniqueKeys).forEach(([name, columns]) => {
        body.push(
          `CONSTRAINT ${
            this.quoteColumn(`UK_${table.replace('.', '_')}_${name}`)
          } UNIQUE (${
            columns.map((columnName) => {
              return this.quoteColumn(columnName as string);
            }).join(', ')
          })`,
        );
      });
    }
    if (query.foreignKeys) {
      Object.entries(query.foreignKeys).forEach(([name, foreignKey]) => {
        const onDelete = foreignKey.onDelete || 'RESTRICT',
          onUpdate = foreignKey.onUpdate || 'RESTRICT';
        body.push(
          `CONSTRAINT ${
            this.quoteColumn(`FK_${table.replace('.', '_')}_${name}`)
          } FOREIGN KEY (${
            Object.keys(foreignKey.columnMap).map((col) =>
              this.quoteColumn(col)
            ).join(', ')
          }) REFERENCES ${
            this.quoteColumn(
              `${
                foreignKey.schema ? foreignKey.schema + '.' : ''
              }${foreignKey.table}`,
            )
          } (${
            Object.values(foreignKey.columnMap).map((col) =>
              this.quoteColumn(col)
            ).join(', ')
          }) ON UPDATE ${onUpdate} ON DELETE ${onDelete}`,
        );
      });
    }
    return `CREATE TABLE IF NOT EXISTS ${this.quoteColumn(table)}\n(\n    ${
      body.join(', \n    ')
    }\n);`;
  }

  public dropTable<
    Entyty extends Record<string, unknown> = Record<string, unknown>,
  >(query: DropTableQuery): string {
    return `DROP TABLE IF EXISTS ${
      this.quoteColumn(query.schema ? query.schema + '.' : '') + query.table
    }${query.cascade === true ? ` CASCADE` : ''};`;
  }

  public truncate<
    Entity extends Record<string, unknown> = Record<string, unknown>,
  >(query: TruncateTableQuery): string {
    return `TRUNCATE TABLE ${
      this.quoteColumn((query.schema ? query.schema + '.' : '') + query.table)
    };`;
  }

  protected _processColumnType(column: BaseColumnDefinition): string {
    const type = this._config.dataTypes[column.type];
    let length = (column.length) ? `(${column.length})` : '';
    const nullable = (column.isNullable === true) ? '' : ' NOT NULL',
      noLengthTypes = [
        'INT',
        'INTEGER',
        'SMALLINT',
        'TINYINT',
        'SERIAL',
        'SMALLSERIAL',
        'BIGSERIAL',
        'BIGINT',
        'BIT',
        'BOOLEAN',
        'BINARY',
        'REAL',
        'FLOAT',
        'DATE',
        'TIME',
        'DATETIME',
        'TIMESTAMP',
        'BYTEA',
        'TEXT',
        'UUID',
        'JSON',
        'ARRAY',
        'ARRAY_STRING',
        'ARRAY_INTEGER',
        'ARRAY_BIGINT',
        'ARRAY_DECIMAL',
        'ARRAY_BOOLEAN',
        'ARRAY_DATE',
        'AUTO_INCREMENT',
      ],
      dataLengthTypes = [
        'DOUBLE PRECISION',
        'DOUBLE',
        'NUMERIC',
        'NUMBER',
        'DECIMAL',
        'MONEY',
      ];
    // Do not define data length even if it is defined
    if (noLengthTypes.includes(column.type)) {
      length = '';
    } else if (dataLengthTypes.includes(column.type)) {
      // Ok these can have precision and scale
      if (column.length) {
        if (column.length instanceof Object) {
          length = `(${column.length.precision}, ${column.length.scale || 0})`;
        } else {
          length = `(${column.length})`;
        }
      }
    } else {
      // Normal length
      if (column.length) {
        if (column.length instanceof Object) {
          length = `(${column.length.precision})`;
        } else {
          length = `(${column.length})`;
        }
      }
    }
    // defaultValue = (column.defaults?.insert !== undefined) ? ` DEFAULT ${this.quoteValue(column.defaults?.insert)}` : "";
    return `${type}${length}${nullable}`;
  }

  protected _processFilters<
    Entity extends Record<string, unknown> = Record<string, unknown>,
  >(
    columns: Record<keyof Entity, string>,
    filter: QueryFilter<Entity>,
    joiner = 'AND',
  ): string {
    const ret: Array<string> = [];
    if (Array.isArray(filter)) {
      filter.forEach((value) => {
        ret.push(this._processFilters(columns, value, 'AND'));
      });
    } else if (typeof filter === 'object') {
      // Parse through the object
      for (const [columnName, operation] of Object.entries(filter)) {
        if (columnName === '$and' || columnName === '$or') {
          ret.push(
            this._processFilters(
              columns,
              operation as QueryFilter<Entity>,
              (columnName === '$or') ? 'OR' : 'AND',
            ),
          );
        } else if (!columns[columnName]) {
          // TODO(@abhai2k): Handle this error correctly
          throw new Error(
            `[module=norm] Column ${columnName} is not part of column list for filtering`,
          );
          // throw new QueryError(`Column ${columnName} is not part of column list for filtering`);
        } else {
          // No its a variable
          if (typeof operation === 'object') {
            // Parse the operator
            for (
              const [operator, operatorValue] of Object.entries(
                operation as QueryFilter<Entity>,
              )
            ) {
              // Hack for boolean
              switch (operator) {
                case '$eq':
                  ret.push(
                    `${this.quoteColumn(columns[columnName])} = ${
                      this.quoteValue(operatorValue)
                    }`,
                  );
                  break;
                case '$neq':
                  ret.push(
                    `${this.quoteColumn(columns[columnName])} != ${
                      this.quoteValue(operatorValue)
                    }`,
                  );
                  break;
                case '$in':
                  ret.push(
                    `${this.quoteColumn(columns[columnName])} IN ${
                      this.quoteValue(operatorValue)
                    }`,
                  );
                  break;
                case '$nin':
                  ret.push(
                    `${this.quoteColumn(columns[columnName])} NOT IN ${
                      this.quoteValue(operatorValue)
                    }`,
                  );
                  break;
                case '$lt':
                  ret.push(
                    `${this.quoteColumn(columns[columnName])} < ${
                      this.quoteValue(operatorValue)
                    }`,
                  );
                  break;
                case '$lte':
                  ret.push(
                    `${this.quoteColumn(columns[columnName])} <= ${
                      this.quoteValue(operatorValue)
                    }`,
                  );
                  break;
                case '$gt':
                  ret.push(
                    `${this.quoteColumn(columns[columnName])} > ${
                      this.quoteValue(operatorValue)
                    }`,
                  );
                  break;
                case '$gte':
                  ret.push(
                    `${this.quoteColumn(columns[columnName])} >= ${
                      this.quoteValue(operatorValue)
                    }`,
                  );
                  break;
                // deno-lint-ignore no-case-declarations
                case '$between':
                  const opval = operatorValue as {
                    $from: unknown;
                    $to: unknown;
                  };
                  ret.push(
                    `${this.quoteColumn(columns[columnName])} BETWEEN '${
                      this.quoteValue(opval.$from)
                    }' AND '${this.quoteValue(opval.$to)}'`,
                  );
                  break;
                case '$null':
                  if (operatorValue === true) {
                    ret.push(
                      `${this.quoteColumn(columns[columnName])} IS NULL`,
                    );
                  } else {
                    ret.push(
                      `${this.quoteColumn(columns[columnName])} IS NOT NULL`,
                    );
                  }
                  break;
                case '$like':
                  ret.push(
                    `${this.quoteColumn(columns[columnName])} LIKE ${
                      this.quoteValue(operatorValue)
                    }`,
                  );
                  break;
                case '$nlike':
                  ret.push(
                    `${this.quoteColumn(columns[columnName])} NOT LIKE ${
                      this.quoteValue(operatorValue)
                    }`,
                  );
                  break;
                case '$ilike':
                  ret.push(
                    `${this.quoteColumn(columns[columnName])} ILIKE ${
                      this.quoteValue(operatorValue)
                    }`,
                  );
                  break;
                case '$nilike':
                  ret.push(
                    `${this.quoteColumn(columns[columnName])} NOT ILIKE ${
                      this.quoteValue(operatorValue)
                    }`,
                  );
                  break;
                default:
                  // TODO(@abhinav) - Handle this
                  throw new Error(`Unknown operator ${operator}`);
              }
            }
          } else {
            // No operator means it is equal to
            // @TODO, even this will be an argument.
            ret.push(
              `${this.quoteColumn(columns[columnName])} = ${
                this.quoteValue(operation)
              }`,
            );
          }
        }
      }
    }
    // return "(" + ret.join(` ${joiner} `) + ")";
    // Ensure we have processed a filter
    if (ret.length === 0) {
      return '';
    }
    let retVal = `( `;
    retVal += ret.reduce((prev, curr, index) => {
      // console.log(curr.toString());
      if (index === 0) {
        return curr;
      } else {
        prev += ` ${joiner} ` + curr;
        return prev;
      }
    });
    retVal += ` )`;
    return retVal;
  }
}
