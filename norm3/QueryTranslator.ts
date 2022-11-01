import { QueryTypes, RawQuery } from "./types/mod.ts";
import type {
  DeleteQuery,
  Dialects,
  InsertQuery,
  QueryFilter,
  QueryOption,
  SelectQuery,
  UpdateQuery,
} from "./types/mod.ts";
import { CountQuery } from "./types/Query/QueryOptions.ts";

const POSTGRES_CONFIG = {
  quote: {
    column: '"',
    value: "'",
  },
};
export class QueryTranslator {
  protected _dialect: Dialects;
  protected _valueQuote = "'";
  protected _columnQuote = '"';

  constructor(dialect: Dialects) {
    this._dialect = dialect;
    // Load few defaults of the dialects
  }

  public get dialect(): Dialects {
    return this._dialect;
  }

  // deno-lint-ignore no-explicit-any
  public quoteValue(value: any): string {
    if (
      typeof value === null || typeof (value) === "function" ||
      typeof (value) === "symbol" || typeof (value) === "undefined"
    ) {
      return "NULL";
    }
    if (value === false) {
      return "FALSE";
    }
    if (value === true) {
      return "TRUE";
    }
    if (typeof value === "number" || typeof value === "bigint") {
      return value + "";
    }
    if (value instanceof Date) {
      return `'${value.toISOString()}'`;
    }
    if (value instanceof Array || Array.isArray(value)) {
      return "(" + value.map((v) => this.quoteValue(v)).join(",") + ")";
    }
    if (typeof value === "object") {
      value = JSON.stringify(value);
    } else {
      value += "";
    }
    // This handles DB Function calls
    if (value.substr(0, 2) === "${") {
      return value.substr(2, value.length - 3);
    }
    // Escape quotes already present
    const findRegEx = new RegExp(this._valueQuote, "g"),
      replace = this._valueQuote + this._valueQuote;
    // return `'${value.replace(/'/g, "''")}'`;
    return `'${value.replace(findRegEx, replace)}'`;
  }

  public quoteColumn(value: string): string {
    const split = value.split(".");
    return `${this._columnQuote}${
      split.join(this._columnQuote + "." + this._columnQuote)
    }${this._columnQuote}`;
  }

  public translate<
    Entity extends Record<string, unknown> = Record<string, unknown>,
  >(query: QueryOption<Entity>): string {
    if (query.type === "RAW") {
      // Mayhaps replace the params?
      return (query as RawQuery).sql;
    }

    switch (query.type) {
      case QueryTypes.SELECT:
        return this.select(query as SelectQuery<Entity>);
      case QueryTypes.COUNT:
        return this.count(query as CountQuery<Entity>);
      case QueryTypes.INSERT:
        return this.insert(query as InsertQuery<Entity>);
      case QueryTypes.UPDATE:
        return this.update(query as UpdateQuery<Entity>);
      case QueryTypes.DELETE:
        return this.delete(query as DeleteQuery<Entity>);
      case QueryTypes.TRUNCATE:
        return this.truncate(query.table, query.schema);
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
        (query.schema ? query.schema + "." : "") + query.table,
      ),
      columns = Object.keys(query.columns).map((alias) => {
        if (
          !query.project || (query.project && query.project.includes(alias))
        ) {
          return `${this.quoteColumn(query.columns[alias])} AS ${
            this.quoteColumn(alias)
          }`;
        }
        return "";
      }),
      paging = (query.pagination && query.pagination.limit > 0)
        ? `LIMIT ${query.pagination.limit} OFFSET ${
          (query.pagination.page - 1) * query.pagination.limit
        } `
        : "",
      sort = (query.sorting && Object.keys(query.sorting).length > 0)
        ? ` ORDER BY ${
          Object.entries(query.sorting).map((value) => {
            return `${this.quoteColumn(query.columns[value[0]])} ${value[1]} `;
          }).join(", ")
        }`
        : "",
      filter = (query.filters)
        ? ` WHERE ${this._processFilters(query.columns, query.filters)}`
        : "";
    return `SELECT ${
      columns.join(", ")
    } FROM ${tableName}${filter}${sort}${paging};`;
  }

  public count<
    Entity extends Record<string, unknown> = Record<string, unknown>,
  >(query: CountQuery<Entity>): string {
    const tableName = this.quoteColumn(
        (query.schema ? query.schema + "." : "") + query.table,
      ),
      filter = (query.filters)
        ? ` WHERE ${this._processFilters(query.columns, query.filters)}`
        : "";
    return `SELECT COUNT(1) AS TotalRows FROM ${tableName}${filter};`;
  }

  public insert<
    Entity extends Record<string, unknown> = Record<string, unknown>,
  >(query: InsertQuery<Entity>): string {
    const tableName = this.quoteColumn(
        (query.schema ? query.schema + "." : "") + query.table,
      ),
      project = (query.project && query.project.length > 0) ? query.project : Object.keys(query.columns), 
      columns = Object.keys(query.columns).map((alias) => {
        return `${this.quoteColumn(query.columns[alias])}`;
      }),
      values = query.data.map((row) => {
        return Object.keys(query.columns).map((key) => {
          return this.quoteValue(row[key]);
        });
      }),
      returning = " \nRETURNING " + project.map((alias) => {
          return `${this.quoteColumn(query.columns[alias])} AS ${
            this.quoteColumn(alias as string)
          }`;
        }).join(", \n");
    return `INSERT INTO ${tableName} \n(${columns.join(", ")}) \nVALUES (${
      values.join("), \n(")
    });`;
  }

  public update<
    Entity extends Record<string, unknown> = Record<string, unknown>,
  >(query: UpdateQuery<Entity>): string {
    const tableName = this.quoteColumn(
        (query.schema ? query.schema + "." : "") + query.table,
      ),
      project = (query.project && query.project.length > 0) ? query.project : Object.keys(query.columns), 
      columns = Object.keys(query.data).map((columnName) => {
        return `${this.quoteColumn(query.columns[columnName])} = ${
          this.quoteValue(query.data[columnName])
        }`;
      }),
      filter = (query.filters)
        ? ` WHERE ${this._processFilters(query.columns, query.filters)}`
        : "",
      returning = " \nRETURNING " + project.map((alias) => {
        return `${this.quoteColumn(query.columns[alias])} AS ${
          this.quoteColumn(alias as string)
        }`;
        }).join(", \n");
    return `UPDATE ${tableName} \nSET ${
      columns.join(", \n")
    }${filter}${returning};`;
  }

  public delete<
    Entity extends Record<string, unknown> = Record<string, unknown>,
  >(query: DeleteQuery<Entity>): string {
    const tableName = this.quoteColumn(
        (query.schema ? query.schema + "." : "") + query.table,
      ),
      filter = (query.filters)
        ? ` WHERE ${this._processFilters(query.columns, query.filters)}`
        : "";
    return `DELETE FROM ${tableName}${filter}};`;
  }

  public truncate<
    Entity extends Record<string, unknown> = Record<string, unknown>,
  >(table: string, schema?: string): string {
    return `TRUNCATE TABLE ${
      this.quoteColumn((schema ? schema + "." : "") + table)
    };`;
  }

  protected _processFilters<
    Entity extends Record<string, unknown> = Record<string, unknown>,
  >(
    columns: Record<keyof Entity, string>,
    filter: QueryFilter<Entity>,
    joiner = "AND",
  ): string {
    const ret: Array<string> = [];
    if (Array.isArray(filter)) {
      filter.forEach((value) => {
        ret.push(this._processFilters(columns, value, "AND"));
      });
    } else if (typeof filter === "object") {
      // Parse through the object
      for (const [columnName, operation] of Object.entries(filter)) {
        if (columnName === "$and" || columnName === "$or") {
          ret.push(
            this._processFilters(
              columns,
              operation as QueryFilter<Entity>,
              (columnName === "$or") ? "OR" : "AND",
            ),
          );
          // } else if (!columns[columnName]) {
          //   throw new Error(`[module=norm] Column ${columnName} is not part of column list for filtering`)
        } else {
          // No its a variable
          if (typeof operation === "object") {
            // Parse the operator
            for (
              const [operator, operatorValue] of Object.entries(
                operation as QueryFilter<Entity>,
              )
            ) {
              // Hack for boolean
              switch (operator) {
                case "$eq":
                  ret.push(
                    `${this.quoteColumn(columns[columnName])} = ${
                      this.quoteValue(operatorValue)
                    }`,
                  );
                  break;
                case "$neq":
                  ret.push(
                    `${this.quoteColumn(columns[columnName])} != ${
                      this.quoteValue(operatorValue)
                    }`,
                  );
                  break;
                case "$in":
                  ret.push(
                    `${this.quoteColumn(columns[columnName])} IN ${
                      this.quoteValue(operatorValue)
                    }`,
                  );
                  break;
                case "$nin":
                  ret.push(
                    `${this.quoteColumn(columns[columnName])} NOT IN ${
                      this.quoteValue(operatorValue)
                    }`,
                  );
                  break;
                case "$lt":
                  ret.push(
                    `${this.quoteColumn(columns[columnName])} < ${
                      this.quoteValue(operatorValue)
                    }`,
                  );
                  break;
                case "$lte":
                  ret.push(
                    `${this.quoteColumn(columns[columnName])} <= ${
                      this.quoteValue(operatorValue)
                    }`,
                  );
                  break;
                case "$gt":
                  ret.push(
                    `${this.quoteColumn(columns[columnName])} > ${
                      this.quoteValue(operatorValue)
                    }`,
                  );
                  break;
                case "$gte":
                  ret.push(
                    `${this.quoteColumn(columns[columnName])} >= ${
                      this.quoteValue(operatorValue)
                    }`,
                  );
                  break;
                // deno-lint-ignore no-case-declarations
                case "$between":
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
                case "$null":
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
                case "$like":
                  ret.push(
                    `${this.quoteColumn(columns[columnName])} LIKE ${
                      this.quoteValue(operatorValue)
                    }`,
                  );
                  break;
                case "$nlike":
                  ret.push(
                    `${this.quoteColumn(columns[columnName])} NOT LIKE ${
                      this.quoteValue(operatorValue)
                    }`,
                  );
                  break;
                case "$ilike":
                  ret.push(
                    `${this.quoteColumn(columns[columnName])} ILIKE ${
                      this.quoteValue(operatorValue)
                    }`,
                  );
                  break;
                case "$nilike":
                  ret.push(
                    `${this.quoteColumn(columns[columnName])} NOT ILIKE ${
                      this.quoteValue(operatorValue)
                    }`,
                  );
                  break;
                default:
                  // TODO - Handle this
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
      return "";
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
