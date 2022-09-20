import { ModelFilterError } from "./Errors.ts";
import {
  CountQueryOptions,
  CreateTableOptions,
  DecimalLengthSpec,
  DeleteQueryOptions,
  Dialect,
  Filters,
  Generators,
  InsertQueryOptions,
  MySQLDataMap,
  MySQLGenerators,
  PostgresDataMap,
  PostgresGenerators,
  QueryOptions,
  SelectQueryOptions,
  SqliteDataMap,
  SqliteGenerators,
  UpdateQueryOptions,
} from "./types/mod.ts";

export class DialectHelper {
  protected _dialect: Dialect;
  protected COL_QUOTE: string;
  protected VALUE_QUOTE = "'";
  protected _generators: Generators;

  constructor(dialect: Dialect) {
    this._dialect = dialect;
    switch (this._dialect) {
      default:
      case "POSTGRES":
        this.COL_QUOTE = '"';
        this._generators = PostgresGenerators;
        break;
      case "SQLITE":
        this.COL_QUOTE = '"';
        this._generators = SqliteGenerators;
        break;
      case "MYSQL":
        this.COL_QUOTE = "`";
        this._generators = MySQLGenerators;
        break;
    }
  }

  getGenerator(value: keyof Generators): unknown | undefined {
    return this._generators[value] || undefined;
  }

  select<T>(options: SelectQueryOptions<T>): string {
    const project = (options.project !== undefined)
        ? options.project
        : Object.keys(options.columns),
      columns = project.map((value) => {
        const colName = options.columns[value as keyof T];
        return `${this._quoteColumn(colName)} AS ${this._quoteColumn(value)}`;
      }),
      paging = (options.paging && options.paging.limit > 0)
        ? ` ` +
          this.limit(
            options.paging.limit,
            (options.paging.page - 1 || 0) * options.paging.limit,
          )
        : "",
      sort = (options.sort && Object.keys(options.sort).length > 0)
        ? ` ORDER BY ${
          Object.entries(options.sort).map((value) => {
            return `${
              this._quoteColumn(options.columns[value[0] as keyof T])
            } ${value[1]} `;
          }).join(", ")
        } `
        : "",
      filter = (options.filters && Object.keys(options.filters).length > 0)
        ? ` WHERE ${this._processFilters(options.columns, options.filters)}`
        : "",
      qry = `SELECT ${columns}
                   FROM ${
        this._makeTable(options.table, options.schema)
      } ${filter}${sort}${paging}`;
    return qry;
  }

  count<T>(options: CountQueryOptions<T>): string {
    const filter = (options.filters && Object.keys(options.filters).length > 0)
        ? ` WHERE ${this._processFilters(options.columns, options.filters)}`
        : "",
      qry = `SELECT COUNT(1) as cnt
                   FROM ${
        this._makeTable(options.table, options.schema)
      } ${filter}`;
    return qry;
  }

  insert<T>(options: InsertQueryOptions<T>): string {
    const columns: Array<string> = options.insertColumns.map((value) => {
        return this._quoteColumn(options.columns[value as keyof T]);
      }),
      values: Array<string> = options.data.map((insertRow) => {
        return "(" + options.insertColumns.map((value) => {
          return this._quoteValue(insertRow[value as keyof T]);
        }).join(", ") + ")";
      }),
      returning = Object.entries(options.columns).map((value) => {
        return `${this._quoteColumn(value[1] as string)} AS ${
          this._quoteColumn(value[0])
        }`;
      }),
      qry = `INSERT INTO ${this._makeTable(options.table, options.schema)} (${
        columns.join(",")
      })
                   VALUES ${values.join(",\n")} RETURNING ${
        returning.join(",\n")
      };`;
    return qry;
  }

  update<T>(options: UpdateQueryOptions<T>): string {
    // console.log(options)
    const filter = (options.filters && Object.keys(options.filters).length > 0)
        ? ` WHERE ${this._processFilters(options.columns, options.filters)}`
        : "",
      keyVal = Object.entries(options.data).map((value) => {
        return `${this._quoteColumn(options.columns[value[0] as keyof T])} = ${
          this._quoteValue(value[1])
        }`;
      }),
      returning = Object.entries(options.columns).map((value) => {
        return `${this._quoteColumn(value[1] as string)} AS ${
          this._quoteColumn(value[0])
        }`;
      }),
      qry = `UPDATE ${this._makeTable(options.table, options.schema)}
                   SET ${keyVal}${filter} RETURNING ${returning}`;
    // console.log(qry);
    return qry;
  }

  delete<T>(options: DeleteQueryOptions<T>): string {
    const filter = (options.filters && Object.keys(options.filters).length > 0)
        ? ` WHERE ${this._processFilters(options.columns, options.filters)}`
        : "",
      qry = `DELETE
                   FROM ${
        this._makeTable(options.table, options.schema)
      } ${filter}`;
    return qry;
  }

  truncate<T>(options: QueryOptions<T>): string {
    if (this._dialect === "SQLITE") {
      return `DELETE
                    FROM ${this._makeTable(options.table, options.schema)}`;
    }
    const qry = `TRUNCATE TABLE ${
      this._makeTable(options.table, options.schema)
    }`;
    return qry;
  }

  limit(limit: number, offset?: number): string {
    return `LIMIT ${limit}${offset ? ` OFFSET ${offset}` : ""}`;
  }

  createDatabase(name: string, ifNotExists = true): string {
    return `CREATE DATABASE ${ifNotExists ? "IF NOT EXISTS " : ""}${name}`;
  }

  dropDatabase(name: string, ifExists = true, cascase = true): string {
    return `DROP DATABASE ${ifExists ? "IF EXISTS " : ""}${name}${
      cascase ? " CASCADE" : ""
    }`;
  }

  createSchema(name: string, ifNotExists?: boolean): string {
    return `CREATE SCHEMA ${ifNotExists ? "IF NOT EXISTS" : ""} ${
      this._quoteColumn(name)
    }`;
  }

  dropSchema(name: string, cascade = true, ifExists?: boolean): string {
    return `DROP SCHEMA ${ifExists ? "IF EXISTS " : ""}${
      this._quoteColumn(name)
    }${cascade ? " CASCADE" : ""}`;
  }

  createTable(options: CreateTableOptions): string {
    let type = PostgresDataMap;
    switch (this._dialect) {
      case "POSTGRES":
        type = PostgresDataMap;
        break;
      case "SQLITE":
        type = SqliteDataMap;
        break;
      case "MYSQL":
        type = MySQLDataMap;
        break;
    }
    const columns = Object.keys(options.columns).map((value) => {
        const colName = value;
        const colType = type[options.columns[value].type];
        const nullSpec = options.columns[value].isNullable
          ? "NULL"
          : "NOT NULL";
        const colTypeArgsRaw = options.columns[value].length;
        let colTypeArgs = "";
        if (colTypeArgsRaw) {
          if (colType == "DECIMAL" || colType == "NUMERIC") { // TODO: handle this better
            const decSpec = colTypeArgsRaw as DecimalLengthSpec;
            colTypeArgs = `(${decSpec.scale},${decSpec.precision})`;
          } else if (
            colType == "VARCHAR" || colType == "NVARCHAR" ||
            colType == "CHARACTER VARYING"
          ) {
            const vcSpec = colTypeArgsRaw as number;
            colTypeArgs = `(${vcSpec})`;
          }
        }
        return `${
          this._quoteColumn(colName)
        } ${colType}${colTypeArgs} ${nullSpec}`;
      }),
      constraints: Array<string> = [],
      sql: Array<string> = [];
    if (options.primaryKeys) {
      constraints.push(`PRIMARY KEY (${
        options.primaryKeys.map((value) => {
          return this._quoteColumn(value);
        }).join(", ")
      })`);
    }
    if (options.uniqueKeys) {
      // console.log(options.uniqueKeys);
      Object.entries(options.uniqueKeys).forEach((name) => {
        constraints.push(
          `CONSTRAINT ${options.table + "_" + name[0] + "_unique"} UNIQUE (${
            name[1].map((value) => {
              return this._quoteColumn(value);
            }).join(", ")
          })`,
        );
      });
    }
    // FK we will see later
    sql.push(...columns);
    sql.push(...constraints);
    const qry = `CREATE TABLE IF NOT EXISTS ${
      this._makeTable(options.table, options.schema)
    }
                     (
                         ${sql.join(", \n")}
                     );`;
    return qry;
  }

  dropTable(
    table: string,
    schema?: string,
    ifExists?: boolean,
    cascade?: boolean,
  ): string {
    return `DROP TABLE ${ifExists ? "IF EXISTS " : ""}${
      this._makeTable(table, schema)
    }${cascade ? " CASCADE" : ""}`;
  }

  // addColumn(): string {}
  // dropColumn(): string {}
  // renameColumn(): string {}
  // addIndex(): string {}
  // dropIndex(): string {}
  // addForeignKey(): string {}
  // dropForeignKey(): string {}

  enableForeignKeyConstraints(): string {
    let qry: string;
    switch (this._dialect) {
      case "POSTGRES":
        qry = "SET session_replication_role = 'origin'";
        break;
      case "MYSQL":
        qry = "SET FOREIGN_KEY_CHECKS = 1";
        break;
      case "SQLITE":
        qry = "PRAGMA foreign_keys = ON";
        break;
      default:
        throw new Error(`Unsupported dialect: ${this._dialect}`);
    }
    return qry;
    // PG - SET session_replication_role = 'origin';
  }

  disableForeignKeyConstraints(): string {
    let qry: string;
    switch (this._dialect) {
      case "POSTGRES":
        qry = "SET session_replication_role = 'replica'";
        break;
      case "MYSQL":
        qry = "SET FOREIGN_KEY_CHECKS = 0";
        break;
      case "SQLITE":
        qry = "PRAGMA foreign_keys = OFF";
        break;
      default:
        throw new Error(`Unsupported dialect: ${this._dialect}`);
    }
    return qry;
    // PG - SET session_replication_role = 'replica';
  }

  // createView(): string {}
  // dropView(): string {}

  getTableDefinition(table: string, schema?: string): string {
    return `SELECT column_name,
                       ordinal_position,
                       data_type,
                       character_maximum_length,
                       numeric_precision,
                       numeric_scale,
                       is_nullable
                FROM information_schema.columns C
                WHERE C.table_name = '${table}'
                    ${schema ? `AND C.table_schema = '${schema}'` : ""}
                ORDER BY ordinal_position`;
  }

  getTableConstraints(table: string, schema?: string): string {
    return `SELECT C.column_name,
                       C.ordinal_position,
                       C.constraint_name,
                       U.constraint_type
                FROM information_schema.key_column_usage C
                         INNER JOIN
                     information_schema.table_constraints U
                     ON
                         C.constraint_name = U.constraint_name
                WHERE C.table_name = '${table}'
                    ${schema ? `AND C.table_schema = '${schema}'` : ""}
                ORDER BY U.constraint_type, C.constraint_name, C.ordinal_position`;
  }

  protected _makeTable(name: string, schema?: string): string {
    return this._quoteColumn(schema ? `${schema}.${name}` : name);
  }

  protected _processFilters<T>(
    columns: Record<string, string>,
    filter: Filters<T>,
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
              operation,
              (columnName === "$or") ? "OR" : "AND",
            ),
          );
          // } else if (!columns[columnName]) {
          //   throw new Error(`[module=norm] Column ${columnName} is not part of column list for filtering`)
        } else {
          // No its a variable
          if (typeof operation === "object") {
            // Parse the operator
            for (const [operator, operatorValue] of Object.entries(operation)) {
              // Hack for boolean
              switch (operator) {
                case "$eq":
                  ret.push(
                    `${this._quoteColumn(columns[columnName])} = ${
                      this._quoteValue(operatorValue)
                    }`,
                  );
                  break;
                case "$neq":
                  ret.push(
                    `${this._quoteColumn(columns[columnName])} != ${
                      this._quoteValue(operatorValue)
                    }`,
                  );
                  break;
                case "$in":
                  ret.push(
                    `${this._quoteColumn(columns[columnName])} IN ${
                      this._quoteValue(operatorValue)
                    }`,
                  );
                  break;
                case "$nin":
                  ret.push(
                    `${this._quoteColumn(columns[columnName])} NOT IN ${
                      this._quoteValue(operatorValue)
                    }`,
                  );
                  break;
                case "$lt":
                  ret.push(
                    `${this._quoteColumn(columns[columnName])} < ${
                      this._quoteValue(operatorValue)
                    }`,
                  );
                  break;
                case "$lte":
                  ret.push(
                    `${this._quoteColumn(columns[columnName])} <= ${
                      this._quoteValue(operatorValue)
                    }`,
                  );
                  break;
                case "$gt":
                  ret.push(
                    `${this._quoteColumn(columns[columnName])} > ${
                      this._quoteValue(operatorValue)
                    }`,
                  );
                  break;
                case "$gte":
                  ret.push(
                    `${this._quoteColumn(columns[columnName])} >= ${
                      this._quoteValue(operatorValue)
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
                    `${this._quoteColumn(columns[columnName])} BETWEEN '${
                      this._quoteValue(opval.$from)
                    }' AND '${this._quoteValue(opval.$to)}'`,
                  );
                  break;
                case "$null":
                  if (operatorValue === true) {
                    ret.push(
                      `${this._quoteColumn(columns[columnName])} IS NULL`,
                    );
                  } else {
                    ret.push(
                      `${this._quoteColumn(columns[columnName])} IS NOT NULL`,
                    );
                  }
                  break;
                case "$like":
                  ret.push(
                    `${this._quoteColumn(columns[columnName])} LIKE ${
                      this._quoteValue(operatorValue)
                    }`,
                  );
                  break;
                case "$nlike":
                  ret.push(
                    `${this._quoteColumn(columns[columnName])} NOT LIKE ${
                      this._quoteValue(operatorValue)
                    }`,
                  );
                  break;
                case "$ilike":
                  ret.push(
                    `${this._quoteColumn(columns[columnName])} ILIKE ${
                      this._quoteValue(operatorValue)
                    }`,
                  );
                  break;
                case "$nilike":
                  ret.push(
                    `${this._quoteColumn(columns[columnName])} NOT ILIKE ${
                      this._quoteValue(operatorValue)
                    }`,
                  );
                  break;
                default:
                  throw new ModelFilterError(`Unknown operator ${operator}`);
              }
            }
          } else {
            // No operator means it is equal to
            // @TODO, even this will be an argument.
            ret.push(
              `${this._quoteColumn(columns[columnName])} = ${
                this._quoteValue(operation)
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

  // deno-lint-ignore no-explicit-any
  protected _quoteValue(value: any): string {
    // We check if it is a Generator, If so replace value then quote it (if required to)
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
      return "(" + value.map((v) => this._quoteValue(v)).join(",") + ")";
    }
    if (typeof value === "object") {
      value = JSON.stringify(value);
    } else {
      value += "";
    }
    if (value.substr(0, 2) === "${") {
      return value.substr(2, value.length - 3);
    }
    return `'${value.replace(/'/g, "''")}'`;
  }

  protected _quoteColumn(column: string) {
    // console.log(column.replace(/\./g, `${this.COL_QUOTE}.${this.COL_QUOTE}`))
    return `${this.COL_QUOTE}${
      column.replace(/\./g, `${this.COL_QUOTE}.${this.COL_QUOTE}`)
    }${this.COL_QUOTE}`;
  }
}
