import type {
  Aggregate,
  AlterTableQuery,
  AlterViewQuery,
  CountQuery,
  CreateSchemaQuery,
  CreateTableColumnDefinition,
  CreateTableQuery,
  CreateViewQuery,
  DeleteQuery,
  DropSchemaQuery,
  DropTableQuery,
  DropViewQuery,
  Expressions,
  InsertQuery,
  Operators,
  Query,
  RenameTableQuery,
  RenameViewQuery,
  SelectQuery,
  SQLDialects,
  TranslatorCapability,
  TranslatorProcessColumns,
  TruncateQuery,
  UpdateQuery,
} from './types/mod.ts';

import { DAMTranslatorError } from './errors/mod.ts';

import { Parameters } from './Parameters.ts';
import { DataTypes, QueryFilters } from './mod.ts';
import { AggregateNames, ExpressionNames, OperatorNames } from './const/mod.ts';

const keywords = new Set([
  'select',
  'from',
  'where',
  'limit',
  'inner join',
  'left join',
  'right join',
  'group by',
  'order by',
  'and',
  'or',
  'having',
  'union',
  'insert into',
  'values',
  'update',
  'set',
  'delete from',
  'truncate table',
  'create schema',
  'drop schema',
]);

export abstract class AbstractTranslator {
  public readonly dialect: SQLDialects;
  public readonly capability: TranslatorCapability;

  declare protected abstract _dataTypes: Record<DataTypes, string>;

  declare protected abstract _escapeChar: string;

  constructor(dialect: SQLDialects, capability: TranslatorCapability) {
    this.dialect = dialect;
    this.capability = capability;
  }

  /**
   * Creates an insert statement basis the data provided. It automatically replaces expressions for values.
   * Use project to define the return value of the query.
   * _NOTE_ Insert statement does not support column identifiers in expressions.
   *
   * @param obj - The insert query object.
   * @returns The generated SQL query and the corresponding parameters.
   * @throws {IncorrectType} If the query object type is not 'INSERT'.
   * @throws {MissingDefinition} If a column specified in the insert values is not defined.
   */
  public insert(obj: InsertQuery): Query {
    if (obj.type !== 'INSERT') {
      throw new DAMTranslatorError('Expected query type to be INSERT', {
        dialect: this.dialect,
      });
    }
    const [columns, params] = this._processColumns(obj);
    const source = obj.schema ? `${obj.schema}.${obj.source}` : obj.source;
    const insertColumns = new Set(obj.values.flatMap(Object.keys));
    const data: string[] = [];
    const project: Record<string, string> = {};

    for (const column of insertColumns) {
      if (!columns[`$${column}`]) {
        throw new DAMTranslatorError(`Column ${column} is not defined`, {
          dialect: this.dialect,
        });
      }
    }

    for (const row of obj.values) {
      const ins = Array.from(insertColumns, (column) => {
        const value = row[column];
        if (value === undefined) {
          return 'NULL';
        } else if (this._isExpression(value)) {
          // Do not allow column identifiers in expressions for insert
          const [sql, _] = this.buildExpression(
            value as Expressions,
            {},
            params,
          );
          return sql;
        } else {
          const paramName = params.create(value);
          return this._makeParam(paramName);
        }
      });
      data.push(`(${ins.join(', ')})`);
    }

    // Now project
    Object.entries(obj.project).forEach(([key, value]) => {
      key = this.escape(key);
      if (this._isColumnIdentifier(value)) {
        if (columns[value as `$${string}`]) {
          project[key] = columns[value as `$${string}`];
        }
      } else if (this._isExpression(value)) {
        const [sql, _] = this.buildExpression(
          value as Expressions,
          columns,
          params,
        );
        project[key] = sql;
      } else {
        const paramName = params.create(value);
        project[key] = this._makeParam(paramName);
      }
    });

    return {
      sql: `INSERT INTO ${this.escape(source)} (${
        Array.from(insertColumns).map(this.escape).join(', ')
      }) VALUES ${data.join(', ')} RETURNING ${
        Object.entries(project).map(([key, value]) => `${value} AS ${key}`)
          .join(', ')
      };`,
      params: params.asRecord(),
    };
  }

  /**
   * Generates an update statement basis the data provided. It automatically replaces expressions for values.
   *
   * @param obj - The update query object.
   * @returns The generated SQL query and the corresponding parameters.
   * @throws {IncorrectType} If the query type is not 'UPDATE'.
   * @throws {MissingDefinition} If a column definition is missing for a key in the data object.
   */
  public update(obj: UpdateQuery): Query {
    if (obj.type !== 'UPDATE') {
      throw new DAMTranslatorError('Expected query type to be UPDATE', {
        dialect: this.dialect,
      });
    }

    const [columns, params] = this._processColumns(obj);
    const source = obj.schema ? `${obj.schema}.${obj.source}` : obj.source;
    const filter = this.buildFilter(obj.filters || {}, columns, params)[0];
    const data = new Map<string, unknown>();

    for (const [key, value] of Object.entries(obj.data)) {
      if (!columns[`$${key}`]) {
        throw new DAMTranslatorError(`Column ${key} is not defined`, {
          dialect: this.dialect,
        });
      }

      const colName = columns[`$${key}`];
      if (value === null) {
        data.set(colName, 'NULL');
      } else if (this._isExpression(value)) {
        const [sql, _] = this.buildExpression(
          value as Expressions,
          columns,
          params,
        );
        data.set(colName, sql);
      } else {
        const paramName = params.create(value);
        data.set(colName, this._makeParam(paramName));
      }
    }
    const where = filter.length > 0 ? ` WHERE ${filter}` : '';

    const sql = `UPDATE ${this.escape(source)} SET ${
      Array.from(data, ([key, val]) => `${key} = ${val}`).join(', ')
    }${where};`;

    return {
      sql,
      params: params.asRecord(),
    };
  }

  /**
   * Deletes records from the specified source based on the provided delete query.
   * @param obj - The delete query object.
   * @returns The generated SQL query and its parameters.
   * @throws {IncorrectType} If the query object type is not 'DELETE'.
   */
  public delete(obj: DeleteQuery): Query {
    if (obj.type !== 'DELETE') {
      throw new DAMTranslatorError('Expected query type to be DELETE', {
        dialect: this.dialect,
      });
    }
    const [columns, params] = this._processColumns(obj);
    const source = obj.schema ? `${obj.schema}.${obj.source}` : obj.source;
    const filter = this.buildFilter(obj.filters || {}, columns, params)[0];

    return {
      sql: `DELETE FROM ${this.escape(source)}${
        filter.length > 0 ? ` WHERE ${filter}` : ``
      };`,
      params: params.asRecord(),
    };
  }

  /**
   * Generates a SELECT query based on the provided SelectQuery object.
   *
   * @param obj - The SelectQuery object representing the SELECT query.
   * @returns The Query object containing the SQL query and parameters.
   * @throws {IncorrectType} If the query type is not 'SELECT'.
   * @throws {MissingDefinition} If a required column or relation is missing.
   * @throws {InvalidDefinition} If a column, relation, or sort is invalid.
   */
  public select(obj: SelectQuery): Query {
    if (obj.type !== 'SELECT') {
      throw new DAMTranslatorError('Expected query type to be SELECT', {
        dialect: this.dialect,
      });
    }
    const [columns, params] = this._processColumns(obj);
    const source = obj.schema ? `${obj.schema}.${obj.source}` : obj.source;
    const filter = this.buildFilter(obj.filters || {}, columns, params)[0];
    const project: Record<string, string> = {};
    const aggregate: Record<string, string> = {};

    const groupBy: string[] = (obj.groupBy || []).map((key) => {
      if (!columns[`${key}`]) {
        throw new DAMTranslatorError(`Column ${key} is not defined`, {
          dialect: this.dialect,
        });
      }
      return columns[`${key}`];
    });

    const joins = Object.entries(obj.joins || {}).map(([key, value]) => {
      const source = value.schema
          ? `${value.schema}.${value.source}`
          : value.source,
        alias = key,
        relation = Object.entries(value.relation).map(([k, v]) => {
          // Check if both column exists
          // @TODO Add Support for QueryFilters
          let sourceColumn: string, targetColumn: string;
          if (columns[`$${k}`]) {
            sourceColumn = columns[`$${k}`];
          } else if (columns[`$${alias}.${k}`]) {
            sourceColumn = columns[`$${alias}.${k}`];
          } else {
            throw new DAMTranslatorError(
              `Column ${k} in relation ${key} is not defined.`,
              {
                dialect: this.dialect,
              },
            );
          }
          const dv = v.substring(1);
          if (columns[`$${dv}`]) {
            targetColumn = columns[`$${dv}`];
          } else if (columns[`$MAIN.${dv}`]) {
            targetColumn = columns[`$MAIN.${dv}`];
          } else {
            throw new DAMTranslatorError(
              `Column ${v} in relation ${key} is not defined.`,
              {
                dialect: this.dialect,
              },
            );
          }
          return `${sourceColumn} = ${targetColumn}`;
        }).join(' AND ');
      return ` LEFT JOIN ${this.escape(source)} AS ${
        this.escape(alias)
      } ON (${relation})`;
    });

    const limit = obj.limit ? ` LIMIT ${obj.limit}` : '';
    const offset = obj.offset ? ` OFFSET ${obj.offset}` : '';

    const orderBy = this._generateSortSQL(obj.orderBy || {}, columns);

    for (const [key, value] of Object.entries(obj.project)) {
      const escapedKey = this.escape(key);
      if (this._isColumnIdentifier(value)) {
        const column = value.toString().substring(1);
        if (columns[`$${column}`]) {
          project[escapedKey] = columns[`$${column}`];
        } else if (columns[`$MAIN.${column}`]) {
          project[escapedKey] = columns[`$MAIN.${column}`];
        } else {
          throw new DAMTranslatorError(`Unknown column ${column} in project`, {
            dialect: this.dialect,
          });
        }
      } else if (this._isExpression(value)) {
        const [sql, _] = this.buildExpression(
          value as Expressions,
          columns,
          params,
        );
        project[escapedKey] = sql;
      } else if (this._isAggregate(value)) {
        const [sql, _] = this.buildAggregate(
          value as Aggregate,
          columns,
          params,
        );
        aggregate[escapedKey] = sql;
      } else {
        const paramName = params.create(value);
        project[escapedKey] = this._makeParam(paramName);
      }
    }

    // Ok add GroupBy if aggregate is present
    if (Object.keys(aggregate).length > 0) {
      Object.entries(project).forEach(([_key, value]) => {
        if (!groupBy.includes(value)) {
          groupBy.push(value);
        }
      });
      // Move aggregate to project
      Object.assign(project, aggregate);
    }

    return {
      sql: `SELECT ${
        Object.entries(project).map(([key, value]) => `${value} AS ${key}`)
          .join(', ')
      } FROM ${this.escape(source)} AS ${this.escape('MAIN')}${
        joins.join(' ')
      }${filter.length > 0 ? ` WHERE ${filter}` : ``}${
        groupBy.length > 0 ? ` GROUP BY ${groupBy.join(', ')}` : ``
      }${orderBy}${limit}${offset};`,
      params: params.asRecord(),
    };
  }

  /**
   * Counts the number of rows in the database that match the given query.
   * Throws an error if the query type is not 'COUNT'.
   *
   * @param obj - The count query object.
   * @returns A query object with the count operation applied.
   * @throws {IncorrectType} If the query type is not 'COUNT'.
   */
  public count(obj: CountQuery): Query {
    if (obj.type !== 'COUNT') {
      throw new DAMTranslatorError('Expected query type to be COUNT', {
        dialect: this.dialect,
      });
    }
    return this.select({
      ...obj,
      ...{
        type: 'SELECT',
        project: { TotalRows: { $aggr: 'COUNT', $args: '*' } },
      },
    });
  }

  /**
   * Truncates a table in the database.
   *
   * @param obj - The truncate query object.
   * @returns The query object with the SQL statement and parameters.
   * @throws {IncorrectType} If the query object type is not 'TRUNCATE'.
   */
  public truncate(obj: TruncateQuery): Query {
    if (obj.type !== 'TRUNCATE') {
      throw new DAMTranslatorError('Expected query type to be TRUNCATE', {
        dialect: this.dialect,
      });
    }
    const source = obj.schema ? `${obj.schema}.${obj.source}` : obj.source;
    return {
      sql: `TRUNCATE TABLE ${this.escape(source)}${
        this.capability.cascade ? ` CASCADE` : ``
      };`,
      params: {},
    };
  }

  public createSchema(obj: CreateSchemaQuery): Query {
    if (obj.type !== 'CREATE_SCHEMA') {
      throw new DAMTranslatorError('Expected query type to be CREATE_SCHEMA', {
        dialect: this.dialect,
      });
    }
    return {
      sql: `CREATE SCHEMA IF NOT EXISTS ${this.escape(obj.schema)};`,
      params: {},
    };
  }

  public dropSchema(obj: DropSchemaQuery): Query {
    if (obj.type !== 'DROP_SCHEMA') {
      throw new DAMTranslatorError('Expected query type to be DROP_SCHEMA', {
        dialect: this.dialect,
      });
    }
    return {
      sql: `DROP SCHEMA IF EXISTS ${this.escape(obj.schema)}${
        this.capability.cascade ? ` CASCADE` : ``
      };`,
      params: {},
    };
  }

  public createView(obj: CreateViewQuery): Query {
    if (obj.type !== 'CREATE_VIEW') {
      throw new DAMTranslatorError('Expected query type to be CREATE_VIEW', {
        dialect: this.dialect,
      });
    }
    const q = this.select(obj.query);
    return {
      sql: `CREATE ${
        obj.materialized && this.capability.matview ? `MATERIALIZED ` : ``
      }VIEW ${this.escape(obj.source)} AS ${q.sql};`,
      params: q.params,
    };
  }

  public alterView(obj: AlterViewQuery): Query {
    if (obj.type !== 'ALTER_VIEW') {
      throw new DAMTranslatorError('Expected query type to be ALTER_VIEW', {
        dialect: this.dialect,
      });
    }
    const source = obj.schema ? `${obj.schema}.${obj.source}` : obj.source,
      q = this.select(obj.query);
    return {
      sql: `ALTER ${
        obj.materialized && this.capability.matview ? `MATERIALIZED ` : ``
      }VIEW ${this.escape(source)} AS ${q.sql};`,
      params: q.params,
    };
  }

  public renameView(obj: RenameViewQuery): Query {
    if (obj.type !== 'RENAME_VIEW') {
      throw new DAMTranslatorError('Expected query type to be RENAME_VIEW', {
        dialect: this.dialect,
      });
    }
    const source = obj.schema ? `${obj.schema}.${obj.source}` : obj.source,
      newSource = obj.newSchema
        ? `${obj.newSchema}.${obj.newSource}`
        : obj.newSource;
    return {
      sql: `ALTER VIEW ${this.escape(source)} RENAME TO ${
        this.escape(
          newSource,
        )
      };`,
      params: {},
    };
  }

  public dropView(obj: DropViewQuery): Query {
    if (obj.type !== 'DROP_VIEW') {
      throw new DAMTranslatorError('Expected query type to be DROP_VIEW', {
        dialect: this.dialect,
      });
    }
    return {
      sql: `DROP ${
        obj.materialized && this.capability.matview ? `MATERIALIZED ` : ``
      }VIEW IF EXISTS ${this.escape(obj.source)};`,
      params: {},
    };
  }

  public createTable(obj: CreateTableQuery): Array<Query> {
    if (obj.type !== 'CREATE_TABLE') {
      throw new DAMTranslatorError('Expected query type to be CREATE_TABLE', {
        dialect: this.dialect,
      });
    }
    const source = obj.schema ? `${obj.schema}.${obj.source}` : obj.source,
      columns = Object.entries(obj.columns).map(([name, defn]) => {
        return this._generateColumnDefinition(name, defn);
      }),
      primaryKeys = obj.primaryKeys
        ? `PRIMARY KEY (${
          obj.primaryKeys.map(this.escape.bind(this)).join(', ')
        })`
        : '',
      uniqueKeys = Object.entries(obj.uniqueKeys || {}).map(([key, value]) => {
        return `CONSTRAINT ${
          this.escape(`UK_${source.replace('.', '_')}_${key}`)
        } UNIQUE (${value.map(this.escape.bind(this)).join(', ')})`;
      }),
      foreignKeys = Object.entries(obj.foreignKeys || {}).map(
        ([key, value]) => {
          const relatedTable = value.schema
            ? `${value.schema}.${value.source}`
            : value.source;
          const sourceColumns = Object.keys(value.relation).map(
            this.escape.bind(this),
          )
            .join(', ');
          const relatedColumns = Object.values(value.relation).map(
            this.escape.bind(this),
          )
            .join(', ');
          return `ADD CONSTRAINT ${
            this.escape(`FK_${source.replace('.', '_')}_${key}`)
          } FOREIGN KEY (${sourceColumns}) REFERENCES ${
            this.escape(relatedTable)
          }(${relatedColumns})`;
        },
      );

    const sql: Query[] = [];
    sql.push({
      sql: `CREATE TABLE IF NOT EXISTS ${this.escape(source)} (${
        columns.join(', ')
      }${primaryKeys.length > 0 ? `, ${primaryKeys}` : ''}${
        uniqueKeys.length > 0 ? `, ${uniqueKeys.join(', ')}` : ''
      });`,
    });
    if (foreignKeys.length > 0) {
      sql.push({
        sql: `ALTER TABLE ${this.escape(source)} ${foreignKeys.join(', ')};`,
      });
    }
    return sql;
  }

  public alterTable(obj: AlterTableQuery): Query {
    if (obj.type !== 'ALTER_TABLE') {
      throw new DAMTranslatorError('Expected query type to be ALTER_TABLE', {
        dialect: this.dialect,
      });
    }
    const source = obj.schema ? `${obj.schema}.${obj.source}` : obj.source,
      alterItems: string[] = [];
    Object.entries(obj.addColumns || {}).forEach(([name, defn]) => {
      alterItems.push(
        `ADD COLUMN ${this._generateColumnDefinition(name, defn)}`,
      );
    });
    obj.dropColumns?.forEach((name) => {
      alterItems.push(`DROP COLUMN ${this.escape(name)}`);
    });
    Object.entries(obj.renameColumns || {}).forEach(([oldName, newName]) => {
      alterItems.push(
        `RENAME COLUMN ${this.escape(oldName)} TO ${this.escape(newName)}`,
      );
    });
    Object.entries(obj.alterColumns || {}).forEach(([name, defn]) => {
      alterItems.push(
        `ALTER COLUMN ${this.escape(name)} TYPE ${this._dataTypes[defn.type]}`,
      );
    });
    Object.entries(obj.alterColumns || {}).forEach(([name, defn]) => {
      alterItems.push(
        `ALTER COLUMN ${this.escape(name)} ${
          defn.nullable ? 'DROP' : 'SET'
        } NOT NULL`,
      );
    });
    return {
      sql: `ALTER TABLE ${this.escape(source)} ${alterItems.join(', ')}`,
    };
  }

  public renameTable(obj: RenameTableQuery): Query {
    if (obj.type !== 'RENAME_TABLE') {
      throw new DAMTranslatorError('Expected query type to be RENAME_TABLE', {
        dialect: this.dialect,
      });
    }
    const source = obj.schema ? `${obj.schema}.${obj.source}` : obj.source,
      newSource = obj.newSchema
        ? `${obj.newSchema}.${obj.newSource}`
        : obj.newSource;
    return {
      sql: `ALTER TABLE ${
        this.escape(
          source,
        )
      } RENAME TO ${
        this.escape(
          newSource,
        )
      };`,
      params: {},
    };
  }
  /**
   * Generates a Drop table statement.
   *
   * @param obj - The DropTableQuery object containing the details of the table to be dropped.
   * @returns A Query object representing the SQL query to drop the table.
   * @throws Error if the query object type is invalid.
   */
  public dropTable(obj: DropTableQuery): Query {
    if (obj.type !== 'DROP_TABLE') {
      throw new DAMTranslatorError('Expected query type to be DROP_TABLE', {
        dialect: this.dialect,
      });
    }
    const source = obj.schema ? `${obj.schema}.${obj.source}` : obj.source;
    return {
      sql: `DROP TABLE IF EXISTS ${this.escape(source)}${
        this.capability.cascade ? ` CASCADE` : ``
      };`,
      params: {},
    };
  }

  /**
   * Replaces any parameters with actual values. Useful for script generation.
   *
   * @param obj The Query object to be processed.
   * @returns SQL String with all parameters replaced
   */
  public substituteParams(obj: Query): string {
    if (!obj.params || Object.keys(obj.params).length === 0) {
      return obj.sql;
    }

    return obj.sql.replace(/:(\w+):/g, (_match, key) => {
      const value = obj.params?.[key];
      return this.quote(value);
    });
  }

  /**
   * Tries to "beautify" the SQL string by adding line breaks and indentation.
   *
   * @param value - The string to be escaped.
   * @returns The escaped string.
   */
  public beautify(query: string | Query): string {
    const sql = typeof query === 'string'
      ? query
      : this.substituteParams(query);
    const formattedSql = sql.split(/\s+/) // Split the SQL by whitespace
      .map((word, index, words) => {
        // Prefix line breaks and indentation for specific keywords
        if (keywords.has(word.toLowerCase())) {
          let breakLine = '\n';
          // For certain keywords, add an extra line break
          if (
            ['union', 'insert into', 'update', 'delete from'].includes(
              word.toLowerCase(),
            )
          ) {
            breakLine += '\n';
          }
          // Indentation for logical operators within WHERE, HAVING, etc.
          if (['and', 'or'].includes(word.toLowerCase()) && index > 0) {
            return `${breakLine}    ${word.toUpperCase()}`;
          }
          return `${breakLine}${word}`;
        }
        // Add spacing after commas, except when the next character is another comma or closing parenthesis
        if (
          word.endsWith(',') &&
          !(words[index + 1] &&
            (words[index + 1].startsWith(',') ||
              words[index + 1].startsWith(')')))
        ) {
          return `${word}\n  `;
        }
        return word;
      })
      .join(' '); // Rejoin the tokens into a single string
    return formattedSql.trim(); // Trim leading/trailing whitespace
  }

  /**
   * Builds an SQL expression based on the provided expression object, columns, and parameters.
   *
   * @param obj - The expression object.
   * @param columns - The columns mapping.
   * @param parameters - Optional parameters object.
   * @returns A tuple containing the generated SQL expression and the updated parameters object.
   * @throws Error if the expression object is invalid.
   */
  public buildExpression(
    obj: Expressions,
    columns: Record<string, string>,
    parameters?: Parameters,
  ): [string, Parameters] {
    if (!this._isExpression(obj)) {
      throw new DAMTranslatorError(`Invalid Expression definition`, {
        dialect: this.dialect,
      });
    }

    const params: Parameters = parameters || new Parameters();
    const expr = obj.$expr;
    const exprArgs: string[] = [];
    const rawArgs = (obj as { $expr: string; $args: unknown }).$args;

    const processArgs = (args: unknown) => {
      if (args === undefined) {
        return;
      }
      if (expr === 'JSON_VALUE') {
        const [column, path] = args as [string, string[]];
        exprArgs.push(column.substring(1));
        exprArgs.push(...path.map((part) => `${part}`));
        return;
      }

      if (Array.isArray(args)) {
        args.map(processArgs);
        return;
      }

      if (this._isExpression(args)) {
        const [sql, _] = this.buildExpression(
          args as Expressions,
          columns,
          params,
        );
        exprArgs.push(sql);
      } else if (this._isColumnIdentifier(args)) {
        const parts = (args as string).substring(1).split('.');
        if (columns[`$${parts[0]}`]) {
          if (columns[`$${parts[0]}`]) {
            if (parts.length > 1) {
              const [v, _] = this.buildExpression(
                {
                  $expr: 'JSON_VALUE',
                  $args: [columns[`$${parts[0]}`], parts.slice(1)],
                } as Expressions,
                columns,
                params,
              );
              exprArgs.push(v);
            } else {
              exprArgs.push(columns[`$${parts[0]}`]);
            }
          } else if (columns[`$MAIN.${parts[0]}`]) {
            if (parts.length > 1) {
              const [v, _] = this.buildExpression(
                {
                  $expr: 'JSON_VALUE',
                  $args: [columns[`$MAIN.${parts[0]}`], parts.slice(1)],
                } as Expressions,
                columns,
                params,
              );
              exprArgs.push(v);
            } else {
              exprArgs.push(columns[`$MAIN.${parts[0]}`]);
            }
          } else if (
            parts.length > 1 && columns[`$${parts[0]}.${parts[1]}`]
          ) {
            if (parts.length > 2) {
              const [v, _] = this.buildExpression(
                {
                  $expr: 'JSON_VALUE',
                  $args: [
                    columns[`$${parts[0]}.${parts[1]}`],
                    parts.slice(2),
                  ],
                } as Expressions,
                columns,
                params,
              );
              exprArgs.push(v);
            } else {
              exprArgs.push(columns[`$${parts[0]}.${parts[1]}`]);
            }
          } else {
            throw new DAMTranslatorError(
              `Unknown Expression argument ${args}`,
              {
                dialect: this.dialect,
              },
            );
          }
        }
      } else {
        const paramName = params?.create(args);
        exprArgs.push(this._makeParam(paramName));
      }
    };

    processArgs(rawArgs);

    return [this._generateExpressionSQL(expr, exprArgs), params];
  }

  /**
   * Builds an aggregate SQL expression based on the provided aggregate object, columns, and optional parameters.
   *
   * @param obj - The aggregate object.
   * @param columns - The columns mapping.
   * @param parameters - Optional parameters.
   * @returns A tuple containing the generated SQL expression and the updated parameters.
   * @throws Error if the aggregate object is invalid or if there is an invalid column identifier in the expression.
   */
  public buildAggregate(
    obj: Aggregate,
    columns: Record<string, string>,
    parameters?: Parameters,
  ): [string, Parameters] {
    if (!this._isAggregate(obj)) {
      throw new DAMTranslatorError(`Invalid / Unknown Aggregate definition`, {
        dialect: this.dialect,
      });
    }

    const params: Parameters = parameters || new Parameters();
    const expr = obj.$aggr;
    const exprArgs: string[] = [];
    const rawArgs = (obj as { $aggr: string; $args: unknown }).$args;

    const processArgs = (args: unknown) => {
      if (args === undefined) {
        return;
      }

      if (Array.isArray(args)) {
        args.map(processArgs);
        return;
      }

      if (this._isExpression(args)) {
        const [sql, _] = this.buildExpression(
          args as Expressions,
          columns,
          params,
        );
        exprArgs.push(sql);
      } else if (this._isColumnIdentifier(args)) {
        console.log('Column Identifier', args);
        const parts = (args as string).substring(1).split('.');
        if (columns[`$${parts[0]}`]) {
          if (parts.length > 1) {
            const [v, _] = this.buildExpression(
              {
                $expr: 'JSON_VALUE',
                $args: [columns[`$${parts[0]}`], parts.slice(1)],
              } as Expressions,
              columns,
              params,
            );
            exprArgs.push(v);
          } else {
            exprArgs.push(columns[`$${parts[0]}`]);
          }
        } else if (columns[`$MAIN.${parts[0]}`]) {
          if (parts.length > 1) {
            const [v, _] = this.buildExpression(
              {
                $expr: 'JSON_VALUE',
                $args: [columns[`$MAIN.${parts[0]}`], parts.slice(1)],
              } as Expressions,
              columns,
              params,
            );
            exprArgs.push(v);
          } else {
            exprArgs.push(columns[`$MAIN.${parts[0]}`]);
          }
        } else if (
          parts.length > 1 && columns[`$${parts[0]}.${parts[1]}`]
        ) {
          if (parts.length > 2) {
            const [v, _] = this.buildExpression(
              {
                $expr: 'JSON_VALUE',
                $args: [
                  columns[`$${parts[0]}.${parts[1]}`],
                  parts.slice(2),
                ],
              } as Expressions,
              columns,
              params,
            );
            exprArgs.push(v);
          } else {
            exprArgs.push(columns[`$${parts[0]}.${parts[1]}`]);
          }
        } else {
          throw new DAMTranslatorError(`Invalud Aggregate argument ${args}`, {
            dialect: this.dialect,
          });
        }
      } else if (args instanceof Object && expr === 'JSON_ROW') {
        // Parse each item and if there is an expression or aggregate, process it
        const jsonRow: string[] = [];
        Object.entries(args).forEach(([key, value]) => {
          if (this._isExpression(value)) {
            const [sql, _] = this.buildExpression(
              value as Expressions,
              columns,
              params,
            );
            jsonRow.push(`'${key}', ${sql}`);
          } else if (this._isAggregate(value)) {
            const [sql, _] = this.buildAggregate(
              value as Aggregate,
              columns,
              params,
            );
            jsonRow.push(`'${key}', ${sql}`);
          } else if (this._isColumnIdentifier(value)) {
            jsonRow.push(
              `'${key}', ${this.escape(value.substring(1))}`,
            );
          } else {
            const paramName = params.create(value);
            jsonRow.push(`'${key}', ${this._makeParam(paramName)}`);
          }
        });
        exprArgs.push(jsonRow.join(', '));
      } else if (args === '*') {
        exprArgs.push('*');
      } else {
        const paramName = params.create(args);
        exprArgs.push(this._makeParam(paramName));
      }
    };

    processArgs(rawArgs);
    return [this._generateAggregateSQL(expr, exprArgs), params];
  }

  /**
   * Builds a filter string and parameters based on the provided query filters, columns mapping, and optional parameters.
   *
   * @param obj - The query filters object.
   * @param columns - The mapping of column identifiers to their corresponding SQL column names.
   * @param parameters - Optional parameters object to store parameter values.
   * @returns A tuple containing the filter string and parameters.
   */
  public buildFilter(
    obj: QueryFilters,
    columns: Record<string, string>,
    parameters?: Parameters,
  ): [string, Parameters] {
    const params: Parameters = parameters || new Parameters(),
      filters: string[] = [],
      processValue = (value: unknown): string | Array<string> => {
        if (Array.isArray(value)) {
          return value.map(processValue) as string[];
        } else if (this._isColumnIdentifier(value)) {
          // Check for JSON Value
          const parts = (value as string).substring(1).split('.');
          let col: string;
          if (columns[`$${parts[0]}`]) {
            col = `$${parts.shift()}`;
          } else if (columns[`$${parts[0]}.${parts[1]}`]) {
            col = `$${parts.shift()}.${parts.shift()}`;
          } else if (parts[0] === 'MAIN' && columns[`$${parts[1]}`]) {
            parts.shift();
            col = `$${parts.shift()}`;
          } else {
            throw new DAMTranslatorError(
              `Unknown column ${value} in filter definition`,
              {
                dialect: this.dialect,
              },
            );
          }
          if (parts.length > 0) {
            const [v, _] = this.buildExpression(
              {
                $expr: 'JSON_VALUE',
                $args: [col, parts],
              } as Expressions,
              columns,
              params,
            );
            return v;
          } else {
            return columns[`${col}`];
          }
        } else if (this._isExpression(value)) {
          const [sql, _] = this.buildExpression(
            value as Expressions,
            columns,
            params,
          );
          return sql;
        } else {
          const paramName = params.create(value);
          return this._makeParam(paramName);
        }
      },
      build = (obj: QueryFilters, joiner: 'AND' | 'OR'): string => {
        Object.entries(obj).forEach(([key, value]) => {
          if (key === '$and') {
            filters.push(
              `(${(value as QueryFilters[]).map((f) => build(f, 'AND'))})`,
            );
          } else if (key === '$or') {
            filters.push(
              `(${(value as QueryFilters[]).map((f) => build(f, 'OR'))})`,
            );
          } else {
            // Process key column
            if (this._isColumnIdentifier(key)) {
              const parts = (key as string).substring(1).split('.');
              if (parts[0] === 'MAIN' && Object.keys(columns).length === 0) {
                parts.shift();
              }
              // First check against table.column
              if (parts.length > 1 && columns[`$${parts[0]}.${parts[1]}`]) {
                // Yes it exists
                key = `$${parts.join('.')}`;
              } else if (columns[`$${parts[0]}`]) {
                key = `$${parts.join('.')}`;
              } else {
                throw new DAMTranslatorError(
                  `Unknown column ${key} in filter definition`,
                  {
                    dialect: this.dialect,
                  },
                );
              }
            } else if (columns[`$${key}`]) {
              key = columns[`$${key}`];
            } else if (columns[`$MAIN.${key}`]) {
              key = columns[`$MAIN.${key}`];
            } else {
              throw new DAMTranslatorError(
                `Unknown column ${key} in filter definition.`,
                {
                  dialect: this.dialect,
                },
              );
            }
            // Process operator
            let operator: Operators = '$eq'; // Defaults to $eq
            // Lets handle some simple cases
            if (value === null || value === undefined) {
              operator = '$null';
              filters.push(this._generateFilterSQL(key, operator, ['true']));
            } else if (
              ['string', 'number', 'bigint', 'boolean'].includes(
                typeof value,
              ) || value instanceof Date
            ) {
              operator = '$eq';
              // Create parameter
              let val = processValue(value);
              if (!Array.isArray(val)) {
                val = [val];
              }
              filters.push(this._generateFilterSQL(key, operator, val));
            } else if (Array.isArray(value)) {
              operator = '$in';
              let val = processValue(value);
              if (!Array.isArray(val)) {
                val = [val];
              }
              filters.push(this._generateFilterSQL(key, operator, val));
            } else if (value instanceof Object && !(value instanceof Date)) {
              Object.entries(value).forEach(([op, val]) => {
                if (!OperatorNames.includes(op)) {
                  throw new DAMTranslatorError(`Unsupported operator ${op}`, {
                    dialect: this.dialect,
                  });
                }
                operator = op as Operators;
                if (operator === '$null') {
                  val = val as boolean;
                } else {
                  val = processValue(val);
                }
                if (!Array.isArray(val)) {
                  val = [val];
                }
                filters.push(this._generateFilterSQL(key, operator, val));
              });
            } else {
              throw new DAMTranslatorError(
                `Invalid value (${
                  JSON.stringify(value)
                }) passed for ${key}:${operator}`,
                {
                  dialect: this.dialect,
                },
              );
            }
          }
        });

        return filters.join(` ${joiner} `);
      };
    if (Object.keys(obj).length === 0) {
      return ['', params];
    }
    return [build(obj, 'AND'), params];
  }

  /**
   * Processes columns and expressions from the query object and returns a single mapping of all columns.
   * This will also generate the SQL for expressions.
   *
   * @param obj - The query object containing the columns and joins.
   * @returns An array containing the extracted columns and parameters.
   */
  protected _processColumns(
    obj: TranslatorProcessColumns & {
      joins?: Record<string, TranslatorProcessColumns>;
    },
  ): [Record<string, string>, Parameters] {
    const params: Parameters = new Parameters(),
      joinList = Object.keys(obj.joins || {}),
      hasJoins = joinList.length > 0,
      columns: Record<string, string> = {},
      normalizeArgs = (
        exp: { $expr: string; $args?: unknown },
        alias?: string,
      ): Expressions => {
        if (exp.$args === undefined) {
          return exp as Expressions;
        }
        const validate = (earg: unknown, alias?: string) => {
          if (this._isExpression(earg) || this._isAggregate(earg)) {
            earg = normalizeArgs(
              earg as { $expr: string; $args?: unknown },
              alias,
            );
          } else if (this._isColumnIdentifier(earg)) {
            const parts = (earg as string).substring(1).split('.');
            if (parts[0] === 'MAIN' && hasJoins === false) {
              parts.shift();
            }
            // First check against table.column
            if (parts.length > 1 && columns[`$${parts[0]}.${parts[1]}`]) {
              // Yes it exists
              earg = `$${parts.join('.')}`;
            } else if (columns[`$${alias}.${parts[0]}`]) {
              earg = `$${alias}.${parts.join('.')}`;
            } else if (columns[`$${parts[0]}`]) {
              earg = `$${parts.join('.')}`;
            } else if (columns[`$MAIN.${parts[0]}`]) {
              earg = `$MAIN.${parts.join('.')}`;
            } else {
              throw new DAMTranslatorError(
                `Invalid argument ${earg} for expression/aggregate.`,
                {
                  dialect: this.dialect,
                },
              );
            }
          }
          return earg;
        };
        if (Array.isArray(exp.$args)) {
          exp.$args = exp.$args.map((e) => validate(e, alias));
        } else {
          exp.$args = validate(exp.$args, alias);
        }
        return exp as Expressions;
      },
      extractColumns = (obj: TranslatorProcessColumns, alias?: string) => {
        obj.columns.forEach((column) => {
          if (alias) {
            columns[`$${alias}.${column}`] = `${this.escape(alias)}.${
              this.escape(column)
            }`;
          } else {
            columns[`$${column}`] = this.escape(column);
          }
        });
      },
      extractExpressions = (obj: TranslatorProcessColumns, alias?: string) => {
        if (obj.expressions) {
          Object.entries(obj.expressions).forEach(([key, value]) => {
            if (obj.columns.includes(key)) {
              throw new DAMTranslatorError(
                `There is already a column/expression with the name ${key}`,
                {
                  dialect: this.dialect,
                },
              );
            }
            // Normalize args if it exists
            value = normalizeArgs(value, alias);
            const [sql, _] = this.buildExpression(value, columns, params);
            if (alias) {
              columns[`$${alias}.${key}`] = sql;
            } else {
              columns[`$${key}`] = sql;
            }
          });
        }
      };
    const mainAlias: string | undefined = hasJoins ? 'MAIN' : undefined;
    extractColumns(obj, mainAlias);
    // loop through joins and extract columns
    Object.entries(obj.joins || {}).forEach(([key, value]) => {
      const alias = key;
      extractColumns(value, alias);
    });
    extractExpressions(obj, mainAlias);
    // loop through joins and extract expressions
    Object.entries(obj.joins || {}).forEach(([key, value]) => {
      const alias = key;
      extractExpressions(value, alias);
    });
    return [columns, params];
  }

  /**
   * Checks if the given value is an expression.
   * An expression is an object that has a '$expr' property and its value is included in the ExpressionNames array.
   *
   * @param value - The value to check.
   * @returns A boolean indicating whether the value is an expression.
   */
  protected _isExpression(value: unknown): boolean {
    return value instanceof Object && Object.keys(value).includes('$expr') &&
      ExpressionNames.includes((value as Expressions).$expr);
  }

  /**
   * Checks if the given value is an aggregate.
   * @param value - The value to check.
   * @returns `true` if the value is an aggregate, `false` otherwise.
   */
  protected _isAggregate(value: unknown): boolean {
    return value instanceof Object && Object.keys(value).includes('$aggr') &&
      AggregateNames.includes((value as Aggregate).$aggr);
  }

  /**
   * Checks if the given value is a column identifier.
   * A column identifier is a string that starts with a '$' symbol.
   *
   * @param value - The value to check.
   * @returns `true` if the value is a column identifier, `false` otherwise.
   */
  protected _isColumnIdentifier(value: unknown): boolean {
    return typeof value === 'string' && value.startsWith('$');
  }

  /**
   * Makes a parameter string for the given name.
   * @param name - The name of the parameter.
   * @returns The parameter string.
   */
  protected _makeParam(name: string): string {
    return `:${name}:`;
  }

  /**
   * Escapes or quotes DB object value as per the dialect. Example tables and columns
   * of Postgres would be quoted with " and MySQL with `.
   *
   * @param value string Escapes/Quotes DB object value.
   * @returns string The Quoted value
   */
  public escape(value: string) {
    return value.replaceAll(this._escapeChar, '').split('.').map((part) =>
      `${this._escapeChar}${part}${this._escapeChar}`
    ).join(
      '.',
    );
  }

  /**
   * Quotes values for SQL queries.
   *
   * @param value unknown The value to quote
   * @returns string The quoted value
   */
  public quote(value: unknown): string {
    if (value === undefined || value === null) {
      return 'NULL';
    } else if (typeof value === 'boolean') {
      return value === true ? 'TRUE' : 'FALSE';
    } else if (
      ['string', 'number', 'bigint'].includes(typeof value)
    ) {
      return `'${value}'`;
    } else if (value instanceof Date) {
      return `'${value.toISOString()}'`;
    } else if (Array.isArray(value)) {
      return `ARRAY[${value.map((v) => this.quote(v)).join(', ')}]`;
    } else {
      return `'${JSON.stringify(value)}'`;
    }
  }

  protected _generateAggregateSQL(
    name: string,
    args: string[],
  ): string {
    switch (name) {
      case 'SUM':
        return `SUM(${args.join(', ')})`;
      case 'MIN':
        return `MIN(${args.join(', ')})`;
      case 'MAX':
        return `MAX(${args.join(', ')})`;
      case 'AVG':
        return `AVG(${args.join(', ')})`;
      case 'COUNT':
        return `COUNT(${args.join(', ')})`;
      case 'DISTINCT':
        return `DISTINCT(${args.join(', ')})`;
      case 'JSON_ROW':
        return `JSON_AGG(JSONB_BUILD_OBJECT(${args.join(', ')}))`;
      default:
        throw new DAMTranslatorError(`Unsupported Aggregate function ${name}`, {
          dialect: this.dialect,
        });
    }
  }

  protected _generateExpressionSQL(
    name: string,
    args: string[],
  ): string {
    switch (name) {
      case 'NOW':
        return 'NOW()';
      case 'CURRENT_DATE':
        return 'CURRENT_DATE';
      case 'CURRENT_TIME':
        return 'CURRENT_TIME';
      case 'CURRENT_TIMESTAMP':
        return 'CURRENT_TIMESTAMP';
      case 'ADD':
        return `(${args.join(' + ')})`;
      case 'SUBTRACT':
        return `(${args.join(' - ')})`;
      case 'MULTIPLY':
        return `(${args.join(' * ')})`;
      case 'DIVIDE':
        return `(${args.join(' / ')})`;
      case 'MODULO':
        return `(${args.join(' % ')})`;
      case 'ABS':
        return `ABS(${args[0]})`;
      case 'CEIL':
        return `CEIL(${args[0]})`;
      case 'FLOOR':
        return `FLOOR(${args[0]})`;
      case 'CONCAT':
        return `(${args.join(' || ')})`;
      case 'LOWER':
        return `LOWER(${args[0]})`;
      case 'UPPER':
        return `UPPER(${args[0]})`;
      case 'TRIM':
        return `TRIM(${args[0]})`;
      case 'LENGTH':
        return `LENGTH(${args[0]})`;
      case 'SUBSTR':
        return `SUBSTRING(${args[0]}, ${args[1]}, ${args[2]})`;
      case 'REPLACE':
        return `REPLACE(${args[0]}, ${args[1]}, ${args[2]})`;
      case 'DATE_DIFF':
        return `DATE_DIFF(${args.join(', ')})`;
      case 'DATE_ADD':
        return `DATE_ADD(${args.join(', ')})`;
      case 'DATE_FORMAT':
        return `DATE_FORMAT(${args.join(', ')})`;
      case 'ENCRYPT':
        return `(${args[0]})`;
      case 'DECRYPT':
        return `(${args[0]})`;
      default:
        throw new DAMTranslatorError(`Unsupported Expression ${name}`, {
          dialect: this.dialect,
        });
    }
  }

  protected _generateFilterSQL(
    column: string,
    operator: Operators,
    value: string[],
  ): string {
    switch (operator) {
      case '$eq':
        return `${column} = ${value[0]}`;
      case '$ne':
        return `${column} != ${value[0]}`;
      case '$null':
        return value[0] === 'true'
          ? `${column} IS NULL`
          : `${column} IS NOT NULL`;
      case '$gt':
        return `${column} > ${value[0]}`;
      case '$gte':
        return `${column} >= ${value[0]}`;
      case '$lt':
        return `${column} < ${value[0]}`;
      case '$lte':
        return `${column} <= ${value[0]}`;
      case '$between':
        return `${column} BETWEEN ${value[0]} AND ${value[1]}`;
      case '$in':
        return `${column} IN (${value.join(', ')})`;
      case '$nin':
        return `${column} NOT IN (${value.join(', ')})`;
      case '$like':
        return `${column} LIKE ${value[0]}`;
      case '$ilike':
        return `${column} LIKE ${value[0]}`;
      case '$nlike':
        return `${column} NOT LIKE ${value[0]}`;
      case '$nilike':
        return `${column} NOT LIKE ${value[0]}`;
      case '$contains':
        return `${column} LIKE %${value[0]}%`;
      case '$ncontains':
        return `${column} NOT LIKE %${value[0]}%`;
      case '$startsWith':
        return `${column} LIKE ${value[0]}%`;
      case '$nstartsWith':
        return `${column} NOT LIKE ${value[0]}%`;
      case '$endsWith':
        return `${column} LIKE %${value[0]}`;
      case '$nendsWith':
        return `${column} NOT LIKE %${value[0]}`;
      default:
        throw new DAMTranslatorError(
          `Unsupported Filter Operator ${operator}`,
          {
            dialect: this.dialect,
          },
        );
    }
  }

  protected _generateColumnDefinition(
    name: string,
    defn: CreateTableColumnDefinition,
  ): string {
    const type = this._dataTypes[defn.type];
    if (type === undefined) {
      throw new DAMTranslatorError(`Unknown data type ${type}`, {
        dialect: this.dialect,
      });
    }
    let sql = `${this.escape(name)} ${type}`;
    if (['CHAR', 'VARCHAR'].includes(defn.type)) {
      if (defn.length) {
        sql += `(${defn.length[0]})`;
      }
    } else if (['NUMERIC', 'DECIMAL'].includes(defn.type)) {
      if (defn.length) {
        if (defn.length) {
          sql += `(${defn.length.join(', ')})`;
        }
      }
    }
    if (defn.nullable === false) {
      sql += ' NOT NULL';
    }
    // if(defn.autoIncrement) {
    //   sql += ' AUTO_INCREMENT';
    // }
    // if(defn.primaryKey) {
    //   sql += ' PRIMARY KEY';
    // }
    // if(defn.unique) {
    //   sql += ' UNIQUE';
    // }
    // if(defn.default !== undefined) {
    //   sql += ` DEFAULT ${this.quote(defn.default)}`;
    // }
    return sql;
  }

  protected _generateSortSQL(
    sort: Record<string, 'ASC' | 'DESC'>,
    columns: Record<string, string>,
  ): string {
    const orderBy = Object.entries(sort).map(([key, value]) => {
      const sort = value.trim().toUpperCase();
      if (sort !== 'ASC' && sort !== 'DESC') {
        throw new DAMTranslatorError(
          `Invalid SORT direction for ${key} (${value})`,
          {
            dialect: this.dialect,
          },
        );
      }
      key = key.substring(1);
      if (columns[`$${key}`]) {
        return `${columns[`$${key}`]} ${sort}`;
      } else if (columns[`$MAIN.${key}`]) {
        return `${columns[`$MAIN.${key}`]} ${sort}`;
      } else {
        throw new DAMTranslatorError(`Sort column ${key} not defined`, {
          dialect: this.dialect,
        });
      }
    }).join(', ');
    if (orderBy.length === 0) {
      return '';
    } else {
      return ` ORDER BY ${orderBy}`;
    }
  }
}
