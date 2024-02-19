import { TruncateQuery } from './mod.ts';
import { ColumnIdentifier } from './types/ColumnIdentifier.ts';
import { DMLQueries } from './types/mod.ts';
import {
  CountQuery,
  DeleteQuery,
  Expressions,
  InsertQuery,
  ProjectColumns,
  Query,
  QueryFilters,
  SelectQuery,
  SQLDialects,
  UpdateQuery,
} from './types/mod.ts';

export abstract class AbstractTranslator {
  dialect: SQLDialects;
  declare protected _schemaSupported: boolean;

  constructor(dialect: SQLDialects) {
    this.dialect = dialect;
  }

  count(query: CountQuery): Query {
    return this._processDML(query);
  }

  select(query: SelectQuery): Query {
    return this._processDML(query);
  }

  insert(query: InsertQuery): Query {
    return this._processDML(query);
  }

  update(query: UpdateQuery): Query {
    return this._processDML(query);
  }

  delete(query: DeleteQuery): Query {
    return this._processDML(query);
  }

  truncate(query: TruncateQuery): Query {
    return {
      sql: `TRUNCATE TABLE ${
        this._quote(this._makeSource(query.source, query.schema))
      };`,
      params: {},
    };
  }

  public beautify(sql: string): string {
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

  protected _makeSource(source: string, schema?: string) {
    if (this._schemaSupported === false) {
      schema = undefined;
    }
    return [schema, source].filter((v) => v !== undefined && v.length > 0).join(
      '.',
    );
  }

  protected _makeParam(name: string): string {
    return `:${name}:`;
  }

  protected _processDML(query: DMLQueries): Query {
    if (
      !['INSERT', 'UPDATE', 'DELETE', 'SELECT', 'COUNT'].includes(query.type)
    ) {
      throw new Error(
        `Process can only be invoked for INSERT, UPDATE, DELETE, SELECT, and COUNT queries`,
      );
    }

    const { project, filters, join } = {
      ...{ project: {}, filters: {}, join: {} },
      ...query,
    };

    const params: Record<string, unknown> = {};
    const expressions: Record<string, string> = {};
    const joins: Record<string, { source: string; on: string }> = {};
    const joinKeys = Object.keys(join);

    const getNextParamPlaceholder = (
      prefix: string,
      counter: number,
    ): string => {
      return `${prefix}_${counter}_param`;
    };

    /**
     * Processes a project and returns a record of translated values.
     *
     * @param project - The project to process.
     * @param alias - The alias for the project. Default is 'MAIN'.
     * @param joins - The joins to apply. Default is an empty array.
     * @returns A record of translated values.
     */
    const processProject = (
      project: ProjectColumns,
      alias = 'MAIN',
      joins: string[] = [],
    ): Record<string, string> => {
      const projectReturn: Record<string, string> = {};

      for (const [key, value] of Object.entries(project)) {
        if (value === false) {
          continue;
        }

        if (typeof value === 'object' && !(value instanceof Date)) {
          const [expr, exprparams] = processExpression(value, alias, joins);
          expressions[key] = expr;
          Object.entries(exprparams).forEach(([k, v]) => {
            params[k] = v;
          });
        } else {
          const col = processColumn(key, alias, joins);
          // console.log(col.value, col.type);

          if (col.type === 'TABLE') {
            if (typeof value !== 'boolean') {
              throw new Error(
                `Alias value must be boolean for ${key} as it represents a row in Table`,
              );
            }
            projectReturn[col.value] = 'TABLE';
          }

          if (col.type === 'JSON') {
            if (typeof value !== 'string') {
              throw new Error(`Alias value for ${key} must be string`);
            }
            projectReturn[value] = col.value;
          }

          if (col.type === 'COLUMN') {
            if (typeof value === 'boolean' && value === true) {
              projectReturn[key.replace('$', '')] = this._quote(col.value);
            } else if (typeof value === 'string') {
              projectReturn[value] = this._quote(col.value);
            }
          }
        }
      }

      return projectReturn;
    };

    /**
     * Processes a column and returns its type and value.
     *
     * @param column - The column to process.
     * @param alias - The alias of the column.
     * @param joins - The list of joins.
     * @returns An object containing the type and value of the processed column.
     */
    const processColumn = (
      column: string,
      alias: string,
      joins: string[],
    ): { type: 'COLUMN' | 'JSON' | 'TABLE'; value: string } => {
      const col: string[] = [];
      if (joins.length > 0) {
        col.push(alias);
      }
      if (column.startsWith('$')) {
        const parts = column.substring(1).split('.');
        let index = 0;
        if (
          joins.includes(parts[index]) || parts[index] === alias ||
          parts[index] === 'MAIN'
        ) {
          col[0] = parts[index];
          index++;
        }
        if (index === parts.length) {
          return { type: 'TABLE', value: col[0] };
        } else {
          col.push(parts[index]);
          index++;
          if (index < parts.length) {
            return {
              type: 'JSON',
              value: this._JSONValue(col.join('.'), parts.slice(index)),
            };
          } else {
            const colJoined = col.join('.');
            return { type: 'COLUMN', value: colJoined };
          }
        }
      } else {
        col.push(column);
        const colJoined = col.join('.');
        return { type: 'COLUMN', value: colJoined };
      }
    };

    /**
     * Processes an expression and returns the statement and parameters.
     *
     * @param expr - The expression to process.
     * @param alias - The alias for the expression.
     * @param joins - The joins for the expression.
     * @returns A tuple containing the statement and parameters.
     */
    const processExpression = (
      expr: string | Expressions,
      alias: string,
      joins: string[],
    ): [string, Record<string, unknown>] => {
      let paramCounter = 0;
      const params: Record<string, unknown> = {};

      const processExpr = (
        expr: ColumnIdentifier | string | number | bigint | Expressions,
      ): string => {
        if (['string', 'bigint', 'number'].includes(typeof expr)) {
          // console.log(`!!!!!!!!!!!`, expr);
          if (typeof expr === 'string') {
            if (!expr.startsWith('$')) {
              const placeholder = getNextParamPlaceholder('e', ++paramCounter);
              params[placeholder] = expr;
              return this._makeParam(placeholder);
            }
            const col = processColumn(expr, alias, joins);
            if (col.type === 'TABLE') {
              throw new Error(`Cannot set table as value in expression`);
            } else if (col.type === 'JSON') {
              return col.value;
            } else {
              return this._quote(col.value); // Remove the $ for direct column usage
            }
          } else {
            const placeholder = getNextParamPlaceholder('e', ++paramCounter);
            params[placeholder] = expr;
            return this._makeParam(placeholder);
          }
        } else {
          return this._processExpressionType(expr as Expressions, processExpr);
        }
      };
      const stmt = processExpr(expr);
      return [stmt, params];
    };

    /**
     * Processes the query filters and generates the corresponding SQL statement.
     *
     * @param filters - The query filters.
     * @param joins - The array of join statements.
     * @returns The SQL statement representing the filters.
     */
    const processFilters = (
      filters: QueryFilters,
      joins: string[] = [],
    ): string => {
      // const params: Record<string, unknown> = {};
      let paramCounter = 0;

      const filter = (
        filters: QueryFilters,
        join: 'AND' | 'OR' = 'AND',
      ): string => {
        const stmts: string[] = [];
        for (const [key, val] of Object.entries(filters)) {
          if (key === '$and' || key === '$or') {
            if (Array.isArray(val)) {
              const inner = val.map((filter) =>
                filter(filter, key === '$and' ? 'AND' : 'OR')
              );
              stmts.push(
                `(${inner.join(` ${key === '$and' ? 'AND' : 'OR'} `)})`,
              );
            } else {
              stmts.push(
                `(${
                  filter(
                    val as QueryFilters,
                    key.toUpperCase().substring(1) as 'AND' | 'OR',
                  )
                })`,
              );
            }
            continue;
          } else {
            let colName: string;
            if (Object.keys(expressions).includes(key)) {
              // Inject expressions
              colName = `(${expressions[key]})`;
            } else {
              const column = processColumn(key, 'MAIN', joins);
              colName = column.type === 'JSON'
                ? column.value
                : this._quote(column.value);
            }
            if (val === null || val === undefined) {
              stmts.push(`${colName} IS NULL`);
            } else if (
              ['string', 'number', 'boolean', 'bigint'].includes(typeof val) ||
              val instanceof Date
            ) {
              const p = getNextParamPlaceholder('f_eq', ++paramCounter);
              stmts.push(`${colName} = ${this._makeParam(p)}`);
              params[p] = val;
            } else if (typeof val === 'object' && !(val instanceof Date)) {
              Object.entries(val).forEach(([op, v]) => {
                // const paramName = newParam(op.substring(1));
                // stmts.push(`${colName} ${op === '$eq' ? '=' : op === '$ne' ? '<>' : op === '$gt' ? '>' : op === '$gte' ? '>=' : op === '$lt' ? '<' : op === '$lte' ? '<=' : op === '$startsWith' ? 'LIKE' : op === '$endsWith' ? 'LIKE' : op === '$contains' ? 'LIKE' : op === '$in' ? 'IN' : 'NOT IN'} ${this._makeParam(param)}`);
                // if(op === '$in' || op === '$nin') {
                //   params[param] = val;
                // } else {
                //   params[param] = val;
                // }
                const paramName = getNextParamPlaceholder(
                  `f_${op.substring(1)}`,
                  ++paramCounter,
                );
                switch (op) {
                  case '$eq':
                    stmts.push(`${colName} = ${this._makeParam(paramName)}`);
                    params[paramName] = v;
                    break;
                  case '$ne':
                    stmts.push(`${colName} != ${this._makeParam(paramName)}`);
                    params[paramName] = v;
                    break;
                  case '$null':
                    stmts.push(
                      `${colName} IS ${v === true ? 'NULL' : 'NOT NULL'}`,
                    );
                    break;
                  case '$nin':
                  case '$in':
                    {
                      // Make param for each value
                      const inP: string[] = [];
                      (v as Array<unknown>).forEach((vi, i) => {
                        const inpN = `${paramName}_${i}`;
                        inP.push(this._makeParam(inpN));
                        params[inpN] = vi;
                      });
                      stmts.push(
                        `${colName} ${op == '$in' ? 'IN' : 'NOT IN'} (${
                          inP.join(', ')
                        })`,
                      );
                      // params[paramName] = v;
                    }
                    break;
                  case '$gt':
                    stmts.push(`${colName} > ${this._makeParam(paramName)}`);
                    params[paramName] = v;
                    break;
                  case '$gte':
                    stmts.push(`${colName} >= ${this._makeParam(paramName)}`);
                    params[paramName] = v;
                    break;
                  case '$lt':
                    stmts.push(`${colName} < ${this._makeParam(paramName)}`);
                    params[paramName] = v;
                    break;
                  case '$lte':
                    stmts.push(`${colName} <= ${this._makeParam(paramName)}`);
                    params[paramName] = v;
                    break;
                  // case '$between':
                  case '$like':
                    stmts.push(`${colName} LIKE ${this._makeParam(paramName)}`);
                    params[paramName] = v;
                    break;
                  case '$nlike':
                    stmts.push(
                      `${colName} NOT LIKE ${this._makeParam(paramName)}`,
                    );
                    params[paramName] = v;
                    break;
                  case '$ilike':
                    stmts.push(
                      `${colName} ILIKE ${this._makeParam(paramName)}`,
                    );
                    params[paramName] = v;
                    break;
                  case '$nilike':
                    stmts.push(
                      `${colName} NOT ILIKE ${this._makeParam(paramName)}`,
                    );
                    params[paramName] = v;
                    break;
                  case '$contains':
                    stmts.push(`${colName} LIKE ${this._makeParam(paramName)}`);
                    params[paramName] = `%${v}%`;
                    break;
                  case '$ncontains':
                    stmts.push(
                      `${colName} NOT LIKE ${this._makeParam(paramName)}`,
                    );
                    params[paramName] = `%${v}%`;
                    break;
                  case '$startsWith':
                    stmts.push(`${colName} LIKE ${this._makeParam(paramName)}`);
                    params[paramName] = `${v}%`;
                    break;
                  case '$nstartsWith':
                    stmts.push(
                      `${colName} NOT LIKE ${this._makeParam(paramName)}`,
                    );
                    params[paramName] = `${v}%`;
                    break;
                  case '$endsWith':
                    stmts.push(`${colName} LIKE ${this._makeParam(paramName)}`);
                    params[paramName] = `%${v}`;
                    break;
                  case '$nendsWith':
                    stmts.push(
                      `${colName} NOT LIKE ${this._makeParam(paramName)}`,
                    );
                    params[paramName] = `%${v}`;
                    break;
                  default:
                    throw new Error(`Unknown operator ${op}`);
                }
              });
            }
          }
        }
        return stmts.join(` ${join} `);
      };

      return filter(filters);
    };

    // Generate project (the main project, all project inside join will be ignored for now)
    const finalProject = processProject(project, 'MAIN', joinKeys);
    // Process join statements
    if (Object.keys(join).length > 0) {
      // Ok we have join, extract them
      Object.entries(join).forEach(([key, value]) => {
        const alias = key.trim();
        const { source, project, relation } = value;
        if (Object.keys(relation).length === 0) {
          throw new Error(`Join condition for ${alias} is missing`);
        }
        // Replace the table project if it exists
        const joinRow = this._JSONRow(
          processProject(project, alias, Object.keys(join)),
        );
        if (finalProject[alias]) {
          finalProject[alias] = joinRow;
        }
        joins[alias] = {
          source: this._quote(this._makeSource(source, value.schema)),
          on: Object.entries(relation).map(([k, v]) =>
            `${this._quote(alias)}.${this._quote(v as string)} = ${
              this._quote(`MAIN.${k}`)
            }`
          ).join(' AND '),
        };
      });
    }
    // Process filters
    const finalFilters = processFilters(filters, joinKeys);

    const source = this._quote(this._makeSource(query.source, query.schema));
    let stmt: string;

    if (query.type === 'SELECT') {
      // Final select columns
      const selectColumns = Object.entries(
        Object.assign({}, finalProject, expressions),
      ).map(([k, v]) => `${v} AS ${this._quote(k)}`).join(', ');
      // Since we still dont support aggregation, add columns which are not table (if table exists)
      // Basically get all columns from finalProjet where key is not in joins
      const groupBy = Object.entries(finalProject).filter(([k]) =>
        !Object.keys(joins).includes(k)
      ).map(([_k, v]) => `${v}`).join(', ');
      stmt = `SELECT ${selectColumns} FROM ${source} AS ${this._quote('MAIN')}${
        Object.entries(joins).map(([k, v]) =>
          ` LEFT JOIN ${v.source} AS ${this._quote(k)} ON (${v.on})`
        ).join(' ')
      }${finalFilters.length > 0 ? ` WHERE ${finalFilters}` : ''}${
        groupBy.length > 0 ? ` GROUP BY ${groupBy}` : ''
      };`;
    } else if (query.type === 'COUNT') {
      // Only aggregate group by columns
      stmt = `SELECT COUNT(1) AS ${this._quote('count')} FROM ${source} AS ${
        this._quote('MAIN')
      }${
        Object.entries(joins).map(([k, v]) =>
          ` LEFT JOIN ${v.source} AS ${this._quote(k)} ON (${v.on})`
        ).join(' ')
      }${finalFilters.length > 0 ? ` WHERE ${finalFilters}` : ''};`;
    } else if (query.type === 'INSERT') {
      const insertColumns = Array.from(
          new Set(query.data.flatMap(Object.keys)),
        ),
        insertValues = query.data.map((row, i) => {
          const newRow: Record<string, unknown> = {};
          for (const key of insertColumns) {
            if (row[key] !== undefined && row[key] !== null) {
              const paramName = `i_${key}_${i}`;
              // If value is object, then it could be expression
              const val = row[key];
              if (
                val !== null &&
                (typeof val === 'object' && !(val instanceof Date) &&
                  Object.keys(val).includes('$expr'))
              ) {
                // console.log('-----', val, '-------');
                const [expr, exprparams] = processExpression(
                  val as Expressions,
                  'MAIN',
                  [],
                );
                // console.log('-----', expr, exprparams, '-------');
                newRow[key] = expr;
                Object.entries(exprparams).forEach(([k, v]) => {
                  params[k] = v;
                });
              } else {
                params[paramName] = val;
                newRow[key] = this._makeParam(paramName);
              }
            } else {
              newRow[key] = 'NULL';
            }
          }
          return newRow;
        });
      const returnCols = Object.entries(
        Object.assign({}, finalProject, expressions),
      ).map(([k, v]) => `${v} AS ${this._quote(k)}`).join(', ');
      stmt = `INSERT INTO ${source} (${
        insertColumns.map(this._quote).join(', ')
      }) VALUES ${
        insertValues.map((row) => `(${Object.values(row).join(', ')})`).join(
          ', ',
        )
      }${returnCols.length > 0 ? ` RETURNING ${returnCols}` : ``};`;
    } else if (query.type === 'UPDATE') {
      const updateData: Record<string, unknown> = {};
      Object.entries(query.data).forEach(([key, value]) => {
        if (value === undefined || value === null) {
          updateData[key] = 'NULL';
        } else {
          const paramName = `u_${key}`;
          if (
            typeof value === 'object' && !(value instanceof Date) &&
            Object.keys(value).includes('$expr')
          ) {
            const [expr, exprparams] = processExpression(
              value as Expressions,
              'MAIN',
              [],
            );
            updateData[key] = expr;
            Object.entries(exprparams).forEach(([k, v]) => {
              params[k] = v;
            });
          } else {
            params[paramName] = value;
            updateData[key] = this._makeParam(paramName);
          }
        }
      });
      stmt = `UPDATE ${source} SET ${
        Object.entries(updateData).map(([k, v]) => `${this._quote(k)} = ${v}`)
          .join(', ')
      }${finalFilters.length > 0 ? ` WHERE ${finalFilters}` : ''};`;
    } else if (query.type === 'DELETE') {
      stmt = `DELETE FROM ${source} AS ${this._quote('MAIN')}${
        finalFilters.length > 0 ? ` WHERE ${finalFilters}` : ''
      };`;
    } else {
      throw new Error('Unknown query type');
    }

    return {
      sql: stmt,
      params: params,
    };
  }

  protected abstract _quote(name: string): string;
  protected abstract _JSONValue(column: string, path: string[]): string;
  protected abstract _JSONRow(data: Record<string, string>): string;
  protected abstract _processExpressionType(
    expr: Expressions,
    processExpression: (
      expr: ColumnIdentifier | string | number | bigint | Expressions,
    ) => string,
  ): string;
}
