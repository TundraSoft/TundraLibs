import type {
  Aggregate,
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
  SelectQuery,
  SQLDialects,
  TruncateQuery,
  UpdateQuery,
} from './types/mod.ts';
import { DAMTranslatorBaseError } from './errors/mod.ts';
import { Parameters } from './Parameters.ts';
import { DataTypes, QueryFilters } from './mod.ts';
import { AggregateNames, ExpressionNames } from './const/mod.ts';

const OperatorsNames = [
  '$eq',
  '$ne',
  '$null',
  '$in',
  '$nin',
  '$lt',
  '$lte',
  '$gt',
  '$gte',
  '$like',
  '$ilike',
  '$nlike',
  '$nilike',
  '$contains',
  '$ncontains',
  '$startsWith',
  '$nstartsWith',
  '$endsWith',
  '$nendsWith',
];

type ProcessQueryColumns = {
  columns: string[];
  expressions?: Record<string, Expressions>;
};

export abstract class AbstractTranslator {
  public readonly dialect: SQLDialects;
  declare public readonly capability: {
    cascade: boolean;
    matview: boolean;
    distributed: boolean;
  };
  declare protected abstract _dataTypes: Record<DataTypes, string>;

  constructor(dialect: SQLDialects) {
    this.dialect = dialect;
  }

  public insert(obj: InsertQuery): Query {
    if (obj.type !== 'INSERT') {
      throw new DAMTranslatorBaseError(`Invalid query type: ${obj.type}`, {
        dialect: this.dialect,
      });
    }
    const [columns, params] = this._processColumns(obj),
      source = obj.schema ? `${obj.schema}.${obj.source}` : obj.source,
      // columns = obj.columns,
      insertColumns = Array.from(
        new Set(obj.values.flatMap(Object.keys)),
      ),
      data: string[] = [],
      project: Record<string, string> = {};

    insertColumns.forEach((column) => {
      if (!columns[`$${column}`]) {
        throw new DAMTranslatorBaseError(
          `Column name: ${column} is not defined.`,
          { dialect: this.dialect },
        );
      }
    });

    obj.values.forEach((row) => {
      const ins = insertColumns.map((column) => {
        if (row[column] === undefined) {
          return 'NULL';
        } else {
          if (this._isExpression(row[column])) {
            const [sql, _] = this.buildExpression(
              row[column] as Expressions,
              columns,
              params,
            );
            return sql;
          } else {
            const paramName = params.create(row[column]);
            return this._makeParam(paramName);
          }
        }
      });
      data.push(`(${ins.join(', ')})`);
    });

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
        insertColumns.map(this.escape).join(', ')
      }) VALUES ${data.join(', ')} RETURNING ${
        Object.entries(project).map(([key, value]) => `${value} AS ${key}`)
          .join(', ')
      };`,
      params: params.asRecord(),
    };
  }

  public update(obj: UpdateQuery): Query {
    if (obj.type !== 'UPDATE') {
      throw new DAMTranslatorBaseError(`Invalid query type: ${obj.type}`, {
        dialect: this.dialect,
      });
    }
    const [columns, params] = this._processColumns(obj),
      source = obj.schema ? `${obj.schema}.${obj.source}` : obj.source,
      filter = this.buildFilter(obj.filters || {}, columns, params)[0],
      data: Record<string, unknown> = {};

    Object.entries(obj.data).forEach(([key, value]) => {
      if (!columns[`$${key}`]) {
        throw new DAMTranslatorBaseError(
          `Column name: ${key} is not defined.`,
          { dialect: this.dialect },
        );
      }
      const colName = columns[`$${key}`];
      if (value === null) {
        data[colName] = 'NULL';
      } else if (this._isExpression(value)) {
        const [sql, _] = this.buildExpression(
          value as Expressions,
          columns,
          params,
        );
        data[colName] = sql;
      } else {
        const paramName = params.create(value);
        data[colName] = this._makeParam(paramName);
      }
    });

    return {
      sql: `UPDATE ${this.escape(source)} SET ${
        Object.entries(data).map(([key, val]) => `${key} = ${val}`).join(', ')
      }${filter.length > 0 ? ` WHERE ${filter}` : ``};`,
      params: params.asRecord(),
    };
  }

  public delete(obj: DeleteQuery): Query {
    if (obj.type !== 'DELETE') {
      throw new DAMTranslatorBaseError(`Invalid query type: ${obj.type}`, {
        dialect: this.dialect,
      });
    }
    const [columns, params] = this._processColumns(obj),
      source = obj.schema ? `${obj.schema}.${obj.source}` : obj.source,
      filter = this.buildFilter(obj.filters || {}, columns, params)[0];

    return {
      sql: `DELETE FROM ${this.escape(source)}${
        filter.length > 0 ? ` WHERE ${filter}` : ``
      };`,
      params: params.asRecord(),
    };
  }

  public select(obj: SelectQuery): Query {
    if (obj.type !== 'SELECT') {
      throw new DAMTranslatorBaseError(`Invalid query type: ${obj.type}`, {
        dialect: this.dialect,
      });
    }
    const [columns, params] = this._processColumns(obj),
      source = obj.schema ? `${obj.schema}.${obj.source}` : obj.source,
      filter = this.buildFilter(obj.filters || {}, columns, params)[0],
      joins = Object.entries(obj.joins || {}).map(([key, value]) => {
        const source = value.schema
            ? `${value.schema}.${value.source}`
            : value.source,
          alias = key,
          relation = Object.entries(value.relation).map(([k, v]) => {
            // Check if both column exists
            // @TODO Maybe support JSON column here???
            // @TODO Add Support for QueryFilters
            let sourceColumn: string, targetColumn: string;
            if (columns[`$${k}`]) {
              sourceColumn = columns[`$${k}`];
            } else if (columns[`$${alias}.${k}`]) {
              sourceColumn = columns[`$${alias}.${k}`];
            } else {
              console.log(columns);
              throw new DAMTranslatorBaseError(
                `Column ${k} in relation for ${alias} does not exist.`,
                { dialect: this.dialect },
              );
            }
            const dv = v.substring(1);
            if (columns[`$${dv}`]) {
              targetColumn = columns[`$${dv}`];
            } else if (columns[`$MAIN.${dv}`]) {
              targetColumn = columns[`$MAIN.${dv}`];
            } else {
              throw new DAMTranslatorBaseError(
                `Column ${dv} in relation for ${alias} does not exist.`,
                { dialect: this.dialect },
              );
            }
            return `${sourceColumn} = ${targetColumn}`;
          }).join(' AND ');
        return ` LEFT JOIN ${this.escape(source)} AS ${
          this.escape(alias)
        } ON (${relation})`;
      }),
      project: Record<string, string> = {},
      aggregate: Record<string, string> = {},
      groupBy: string[] = [],
      limit = obj.limit ? ` LIMIT ${obj.limit}` : '',
      offset = obj.offset ? ` OFFSET ${obj.offset}` : '',
      orderBy = Object.entries(obj.orderBy || {}).map(([key, value]) => {
        const sort = value.trim().toUpperCase();
        if (sort !== 'ASC' && sort !== 'DESC') {
          throw new DAMTranslatorBaseError(
            `Invalid sort order: ${value} for ${key}.`,
            { dialect: this.dialect },
          );
        }
        if (columns[`${key}`]) {
          return `${columns[`${key}`]} ${sort}`;
        } else if (columns[`$MAIN.${key}`]) {
          return `${columns[`$MAIN.${key}`]} ${sort}`;
        } else {
          throw new DAMTranslatorBaseError(
            `Column name: ${key} is not defined.`,
            { dialect: this.dialect },
          );
        }
      }).join(', ');

    if (obj.groupBy) {
      obj.groupBy.forEach((column) => {
        if (!columns[`${column}`]) {
          throw new DAMTranslatorBaseError(
            `Column name: ${column} is not defined.`,
            { dialect: this.dialect },
          );
        }
        groupBy.push(columns[`${column}`]);
      });
    }

    Object.entries(obj.project).forEach(([key, value]) => {
      key = this.escape(key);
      if (this._isColumnIdentifier(value)) {
        value = value.toString().substring(1);
        if (columns[`$${value}`]) {
          project[key] = columns[value as `$${string}`];
        } else if (columns[`$MAIN.${value}`]) {
          project[key] = columns[`$MAIN.${value}`];
        } else {
          throw new DAMTranslatorBaseError(
            `Column name: ${value} is not defined.`,
            { dialect: this.dialect },
          );
        }
      } else if (this._isExpression(value)) {
        const [sql, _] = this.buildExpression(
          value as Expressions,
          columns,
          params,
        );
        project[key] = sql;
      } else if (this._isAggregate(value)) {
        const [sql, _] = this.buildAggregate(
          value as Aggregate,
          columns,
          params,
        );
        aggregate[key] = sql;
      } else {
        const paramName = params.create(value);
        project[key] = this._makeParam(paramName);
      }
    });

    // Ok add GroupBy if aggregate is present
    if (Object.keys(aggregate).length > 0) {
      Object.entries(project).forEach(([_key, value]) => {
        // console.log(`Checking ${value}`);
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

  public count(obj: CountQuery): Query {
    if (obj.type !== 'COUNT') {
      throw new DAMTranslatorBaseError(`Invalid query type: ${obj.type}`, {
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

  public truncate(obj: TruncateQuery): Query {
    if (obj.type !== 'TRUNCATE') {
      throw new DAMTranslatorBaseError(`Invalid query type: ${obj.type}`, {
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
      throw new DAMTranslatorBaseError(`Invalid query type: ${obj.type}`, {
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
      throw new DAMTranslatorBaseError(`Invalid query type: ${obj.type}`, {
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
      throw new DAMTranslatorBaseError(`Invalid query type: ${obj.type}`, {
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

  public dropView(obj: DropViewQuery): Query {
    if (obj.type !== 'DROP_VIEW') {
      throw new DAMTranslatorBaseError(`Invalid query type: ${obj.type}`, {
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
      throw new DAMTranslatorBaseError(`Invalid query type: ${obj.type}`, {
        dialect: this.dialect,
      });
    }
    const source = obj.schema ? `${obj.schema}.${obj.source}` : obj.source,
      columns = Object.entries(obj.columns).map(([name, defn]) => {
        return this._generateColumnDefinition(name, defn);
      }),
      primaryKeys = obj.primaryKeys
        ? `PRIMARY KEY (${obj.primaryKeys.map(this.escape).join(', ')})`
        : '',
      uniqueKeys = Object.entries(obj.uniqueKeys || {}).map(([key, value]) => {
        return `CONSTRAINT ${
          this.escape(`UK_${source.replace('.', '_')}_${key}`)
        } UNIQUE (${value.map(this.escape).join(', ')})`;
      }),
      foreignKeys = Object.entries(obj.foreignKeys || {}).map(
        ([key, value]) => {
          const relatedTable = value.schema
            ? `${value.schema}.${value.source}`
            : value.source;
          const sourceColumns = Object.keys(value.relation).map(this.escape)
            .join(', ');
          const relatedColumns = Object.values(value.relation).map(this.escape)
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

  /**
   * Generates a Drop table statement.
   *
   * @param obj - The DropTableQuery object containing the details of the table to be dropped.
   * @returns A Query object representing the SQL query to drop the table.
   * @throws Error if the query object type is invalid.
   */
  public dropTable(obj: DropTableQuery): Query {
    if (obj.type !== 'DROP_TABLE') {
      throw new DAMTranslatorBaseError(`Invalid query type: ${obj.type}`, {
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
    Object.entries(obj.params).forEach(([key, value]) => {
      const qval = this.quote(value);
      obj.sql = obj.sql.replace(new RegExp(`:${key}:`, 'g'), qval);
    });
    return obj.sql;
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
    const keywords = [
      'SELECT',
      'FROM',
      'WHERE',
      'LIMIT',
      'INNER JOIN',
      'LEFT JOIN',
      'RIGHT JOIN',
      'GROUP BY',
      'ORDER BY',
      'AND',
      'OR',
      'HAVING',
      'UNION',
      'INSERT INTO',
      'VALUES',
      'UPDATE',
      'SET',
      'DELETE FROM',
      'TRUNCATE TABLE',
      'CREATE SCHEMA',
      'DROP SCHEMA',
    ];
    const formattedSql = sql.split(/\s+/) // Split the SQL by whitespace
      .map((word, index, words) => {
        // Prefix line breaks and indentation for specific keywords
        if (keywords.includes(word.toUpperCase())) {
          let breakLine = '\n';

          // For certain keywords, add an extra line break
          if (
            ['UNION', 'INSERT INTO', 'UPDATE', 'DELETE FROM'].includes(
              word.toUpperCase(),
            )
          ) {
            breakLine += '\n';
          }

          // Indentation for logical operators within WHERE, HAVING, etc.
          if (['AND', 'OR'].includes(word.toUpperCase()) && index > 0) {
            return `${breakLine}    ${word}`;
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
    if (this._isExpression(obj) === false) {
      throw new DAMTranslatorBaseError(
        `Invalid expression object: ${JSON.stringify(obj)}`,
        { dialect: this.dialect },
      );
    }
    const params: Parameters = parameters || new Parameters();
    // Ok lets process it
    const expr = obj.$expr,
      exprArgs: string[] = [],
      rawArgs = (obj as { $expr: string; $args: unknown | unknown[] }).$args,
      processArgs = (args: unknown | unknown[]) => {
        if (args === undefined) {
          return;
        } else if (expr === 'JSON_VALUE') {
          // JSON_VALUE is a special case
          const [column, path] = args as [string, string[]];
          // exprArgs.push(this.escape(column.substring(1)));
          // exprArgs.push(...path.map((part) => `${part}`));
          exprArgs.push(column.substring(1));
          exprArgs.push(...path.map((part) => `${part}`));
        } else if (Array.isArray(args)) {
          args.forEach((arg) => {
            processArgs(arg);
          });
          return;
        } else {
          if (this._isExpression(args)) {
            const [sql, _] = this.buildExpression(
              args as Expressions,
              columns,
              params,
            );
            exprArgs.push(sql);
          } else if (this._isColumnIdentifier(args)) {
            // @TODO JSON Value
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
              // console.log(columns);
              throw new DAMTranslatorBaseError(
                `Invalid column identifier: ${args} in expression ${expr}.`,
                { dialect: this.dialect },
              );
            }
            // exprArgs.push(this.escape((args as string).substring(1) as string));
          } else {
            const paramName = params?.create(args);
            exprArgs.push(this._makeParam(paramName));
          }
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
    if (this._isAggregate(obj) === false) {
      throw new DAMTranslatorBaseError(
        `Invalid aggregate object: ${JSON.stringify(obj)}`,
        { dialect: this.dialect },
      );
    }
    const expr = obj.$aggr,
      exprArgs: string[] = [],
      rawArgs = (obj as { $aggr: string; $args: unknown | unknown[] }).$args,
      params: Parameters = parameters || new Parameters(),
      processArgs = (args: unknown | unknown[]) => {
        if (Array.isArray(args)) {
          args.forEach((arg) => {
            processArgs(arg);
          });
          return;
        } else {
          if (this._isExpression(args)) {
            const [sql, _] = this.buildExpression(
              args as Expressions,
              columns,
              params,
            );
            // Object.assign(params, p);
            exprArgs.push(sql);
          } else if (this._isColumnIdentifier(args)) {
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
              throw new DAMTranslatorBaseError(
                `Invalid column identifier: ${args} in expression ${expr}.`,
                { dialect: this.dialect },
              );
            }
            // exprArgs.push(this.escape((args as string).substring(1) as string));
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
                // Object.assign(params, p);
                jsonRow.push(`'${key}', ${sql}`);
              } else if (this._isAggregate(value)) {
                const [sql, _] = this.buildAggregate(
                  value as Aggregate,
                  columns,
                  params,
                );
                // Object.assign(params, p);
                jsonRow.push(`'${key}', ${sql}`);
              } else if (this._isColumnIdentifier(value)) {
                // @TODO JSON Value

                jsonRow.push(
                  `'${key}', ${
                    this.escape((value as string).substring(1) as string)
                  }`,
                );
              } else {
                // const paramName = `expr_${nanoId(5, alphaNumeric)}`;
                // params[paramName] = value;
                const paramName = params.create(value);
                jsonRow.push(`'${key}', ${this._makeParam(paramName)}`);
              }
            });
            exprArgs.push(jsonRow.join(', '));
          } else {
            if (args === '*') {
              exprArgs.push('*');
            } else {
              // const paramName = `expr_${nanoId(5, alphaNumeric)}`;
              // params[paramName] = args;
              const paramName = params.create(args);
              exprArgs.push(this._makeParam(paramName));
            }
          }
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
      processValue = (value: unknown | unknown[]): string | Array<string> => {
        if (Array.isArray(value)) {
          return value.map(processValue) as string[];
        } else {
          if (this._isColumnIdentifier(value)) {
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
              throw new DAMTranslatorBaseError(
                `Could not find column: ${value} in expression/aggregate.`,
                { dialect: this.dialect },
              );
            }
            if (parts.length > 0) {
              const [v, _] = this.buildExpression(
                {
                  $expr: 'JSON_VALUE',
                  $args: [col as string, parts],
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
                // console.log('Stupid if condition');
                parts.shift();
              }
              // First check against table.column
              if (parts.length > 1 && columns[`$${parts[0]}.${parts[1]}`]) {
                // Yes it exists
                key = `$${parts.join('.')}`;
              } else if (columns[`$${parts[0]}`]) {
                key = `$${parts.join('.')}`;
              } else {
                // console.log(columns);
                throw new DAMTranslatorBaseError(
                  `Could not find column: ${key} in filter.`,
                  { dialect: this.dialect },
                );
              }
            } else {
              if (columns[`$${key}`]) {
                key = columns[`$${key}`];
              } else if (columns[`$MAIN.${key}`]) {
                key = columns[`$MAIN.${key}`];
              } else {
                throw new DAMTranslatorBaseError(
                  `Could not find column: ${key} in filter.`,
                  { dialect: this.dialect },
                );
              }
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
                if (!OperatorsNames.includes(op)) {
                  throw new DAMTranslatorBaseError(
                    `Invalid operator: ${op} for ${key}`,
                    { dialect: this.dialect },
                  );
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
              // console.log(typeof value);
              throw new DAMTranslatorBaseError(
                `Invalid value for filter: ${value}`,
                { dialect: this.dialect },
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
    obj: ProcessQueryColumns & { joins?: Record<string, ProcessQueryColumns> },
  ): [Record<string, string>, Parameters] {
    const params: Parameters = new Parameters(),
      joinList = Object.keys(obj.joins || {}),
      hasJoins = joinList.length > 0,
      columns: Record<string, string> = {},
      normalizeArgs = (
        exp: { $expr: string; $args?: unknown | unknown[] },
        alias?: string,
      ): Expressions => {
        if (exp.$args === undefined) {
          return exp as Expressions;
        }
        const validate = (earg: unknown, alias?: string) => {
          if (this._isExpression(earg) || this._isAggregate(earg)) {
            earg = normalizeArgs(
              earg as { $expr: string; $args?: unknown | unknown[] },
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
              throw new DAMTranslatorBaseError(
                `Could not find column: ${earg} in expression/aggregate.`,
                { dialect: this.dialect },
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
      extractColumns = (obj: ProcessQueryColumns, alias?: string) => {
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
      extractExpressions = (obj: ProcessQueryColumns, alias?: string) => {
        if (obj.expressions) {
          Object.entries(obj.expressions).forEach(([key, value]) => {
            if (obj.columns.includes(key)) {
              throw new DAMTranslatorBaseError(
                `Expression name: ${key} is already defined as a column.`,
                { dialect: this.dialect },
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

  abstract escape(name: string): string;
  abstract quote(value: unknown): string;
  protected abstract _generateAggregateSQL(
    name: string,
    args: string[],
  ): string;
  protected abstract _generateExpressionSQL(
    name: string,
    args: string[],
  ): string;
  protected abstract _generateFilterSQL(
    column: string,
    operator: Operators,
    value: string[],
  ): string;
  protected abstract _generateColumnDefinition(
    name: string,
    defn: CreateTableColumnDefinition,
  ): string;
}
