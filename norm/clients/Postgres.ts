import { AbstractClient } from "../AbstractClient.ts";
import type {
  CountQueryOptions,
  CreateTableOptions,
  DeleteQueryOptions,
  Filters,
  InsertQueryOptions,
  PostgresConfig,
  QueryOptions,
  QueryType,
  SelectQueryOptions,
  UpdateQueryOptions,
} from "../types/mod.ts";

import { PGPool } from "../../dependencies.ts";
import type { PGClientOptions } from "../../dependencies.ts";

export class Postgres<T extends PostgresConfig> extends AbstractClient<T> {
  declare protected _client: PGPool;

  constructor(name: string, config: Partial<T>) {
    const configDefault: Partial<PostgresConfig> = {
      dialect: "POSTGRES",
      port: 5432,
      poolSize: 10,
    };
    super(name, config, configDefault as Partial<T>);
    // Ensure we have atleast > 1 connection available
    if (this._getOption("poolSize") < 1) {
      this._setOption("poolSize", 10);
    }
  }

  protected async _connect() {
    if (this._client === undefined) {
      const pgProps: PGClientOptions = {
        database: this._getOption("database"),
        password: this._getOption("password"),
        user: this._getOption("user"),
        port: this._getOption("port"),
        hostname: this._getOption("host"),
        tls: {
          enabled: this._getOption("tls").enabled,
          enforce: this._getOption("tls").enforce,
          caCertificates: this._getOption("tls").ca,
        },
      };
      this._client = new PGPool(pgProps, this._getOption("poolSize"), true);
      // Hack to test the connection, if there is something wrong it will throw immediately
      await (await this._client.connect()).release();
    }
  }

  protected async _close() {
    if (this._client && this._client.available > 0) {
      await this._client.end();
    }
  }

  protected _getQueryType(sql: string): QueryType {
    const regEx = new RegExp(
        /^(CREATE|ALTER|DROP|TRUNCATE|SHOW|SELECT|INSERT|UPDATE|DELETE|DESC|DESCRIBE|EXPLAIN|BEGIN|COMMIT|ROLLBACK)?/i,
      ),
      match = sql.match(regEx);
    let qt: QueryType = "UNKNOWN";
    if (match && match.length > 0) {
      qt = match[0].trim().toUpperCase() as QueryType;
    }
    return qt;
  }

  protected async _query<T>(
    sql: string,
    queryArgs?: Record<string, unknown>,
  ): Promise<Array<T>> {
    const client = await this._client.connect();
    // Parse arguments only
    const res = await client.queryObject<T>({
      args: queryArgs,
      text: sql,
    });
    client.release();
    return res.rows;
  }

  protected async _select<T>(
    options: SelectQueryOptions<T>,
  ): Promise<Array<T>> {

    const project = (options.project !== undefined) ? options.project : Object.keys(options.columns), 
        columns = project.map((value) => {
          const colName = options.columns[value as keyof T];
          return `${this._quoteColumn(colName)} AS ${this._quoteColumn(value)}`;
        }), 
      table = (options.schema !== undefined) ? options.schema + "." + options.table : options.table, 
      paging = (options.paging)? ` LIMIT ${options.paging.size} OFFSET ${(options.paging.page - 1 || 0) * options.paging.size} ` : "", 
      sort = (options.sort)? ` ORDER BY ${Object.entries(options.sort).map((value) => { return `${this._quoteColumn(options.columns[value[0] as keyof T])} ${value[1]} `; }).join(", ")} ` : "", 
      filter = (options.filters)? ` WHERE ${this._processFilters(options.columns, options.filters)}` : "", 
      qry = `SELECT ${columns} FROM ${this._quoteColumn(table)}${filter}${sort}${paging}`;

    // Log the generated query
    console.log(qry);
    const conn = await this._client.connect(),
      result = await conn.queryObject<T>(qry);
    conn.release();
    return result.rows;
  }

  protected async _count<T>(options: CountQueryOptions<T>): Promise<number> {
    const table = (options.schema !== undefined) ? options.schema + "." + options.table : options.table, 
      filter = (options.filters)? ` WHERE ${this._processFilters(options.columns, options.filters)}` : "", 
      qry = `SELECT COUNT(1) as cnt FROM ${this._quoteColumn(table)}${filter}`;

    console.log(qry);
    const conn = await this._client.connect(),
      result = await conn.queryObject<{ cnt: number }>(qry);
    conn.release();
    return result.rows[0].cnt;
  }

  protected async _insert<T>(
    options: InsertQueryOptions<T>,
  ): Promise<Array<T>> {
    const table = (options.schema !== undefined) ? options.schema + "." + options.table : options.table, 
      columns: Array<string> = options.insertColumns.map((value) => {
          return this._quoteColumn(options.columns[value as keyof T]);
        }), 
      values: Array<string> = options.data.map((insertRow) => {
          return "(" + options.insertColumns.map((value) => {
              return this._quoteValue(insertRow[value as keyof T] || undefined);
            }).join(", ") + ")"
        }), 
      returning = Object.entries(options.columns).map((value) => {
          return `this._quoteColumn(${value[1]}) AS this._quoteColumn(${value[0]})`;
        }), 
      qry = `INSERT INTO ${this._quoteColumn(table)} (${columns.join(",")}) VALUES ${values.join(",")} RETURNING ${returning}`;
    
    console.log(qry);
    const conn = await this._client.connect(),
      result = await conn.queryObject<T>("" + qry);
    conn.release();
    return result.rows;
  }

  protected async _update<T>(
    options: UpdateQueryOptions<T>,
  ): Promise<Array<T>> {
    const table = (options.schema !== undefined) ? options.schema + "." + options.table : options.table, 
      filter = (options.filters)? ` WHERE ${this._processFilters(options.columns, options.filters)}` : "", 
      keyVal = Object.entries(options.data).map((value) => {
          return `${this._quoteColumn(options.columns[value[0] as keyof T])} = ${this._quoteValue(value[1])}`;
        }), 
      returning = Object.entries(options.columns).map((value) => {
          return `${this._quoteColumn(value[1] as string)} AS ${this._quoteColumn(value[0])}`;
        }), 
      qry = `UPDATE ${this._quoteColumn(table)} SET ${keyVal}${filter} RETURNING ${returning}`;

    console.log(qry);
    const conn = await this._client.connect(),
      result = await conn.queryObject<T>("" + qry);
    conn.release();
    return result.rows;
  }

  protected async _delete<T>(options: DeleteQueryOptions<T>): Promise<number> {
    const table = (options.schema !== undefined) ? options.schema + "." + options.table : options.table, 
      filter = (options.filters)? ` WHERE ${this._processFilters(options.columns, options.filters)}` : "", 
      qry = `DELETE FROM ${this._quoteColumn(table)}${filter}`;

    console.log(qry);
    const conn = await this._client.connect(),
      result = await conn.queryObject<T>(qry);
    conn.release();
    return result.rowCount || 0;
  }

  protected async _truncate<T>(options: QueryOptions<T>): Promise<boolean> {
    const table = (options.schema !== undefined) ? options.schema + "." + options.table : options.table, 
      qry = `TRUNCATE TABLE ${this._quoteColumn(table)}`;

    console.log(qry);
    const conn = await this._client.connect();
    await conn.queryObject<T>("" + qry);
    conn.release();
    return true;
  }

  protected _createTable(options: CreateTableOptions) {
    
  }

  protected _dropTable() {

  }

  protected _syncTable() {
    
  }
  
  protected _getTableDefinition(table: string, schema?: string) {
    
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
                default:
                case "$eq":
                  ret.push(`${this._quoteColumn(columns[columnName])} = ${this._quoteValue(operatorValue)}`);
                  break;
                case "$neq":
                  ret.push(`${this._quoteColumn(columns[columnName])} != ${this._quoteValue(operatorValue)}`);
                  break;
                case "$in":
                  ret.push(`${this._quoteColumn(columns[columnName])} IN ${this._quoteValue(operatorValue)}`);
                  break;
                case "$nin":
                  ret.push(
                    `${this._quoteColumn(columns[columnName])} NOT IN ${this._quoteValue(operatorValue)}`,
                  );
                  break;
                case "$lt":
                  ret.push(`${this._quoteColumn(columns[columnName])} < ${this._quoteValue(operatorValue)}`);
                  break;
                case "$lte":
                  ret.push(`${this._quoteColumn(columns[columnName])} <= ${this._quoteValue(operatorValue)}`);
                  break;
                case "$gt":
                  ret.push(`${this._quoteColumn(columns[columnName])} > ${this._quoteValue(operatorValue)}`);
                  break;
                case "$gte":
                  ret.push(`${this._quoteColumn(columns[columnName])} >= ${this._quoteValue(operatorValue)}`);
                  break;
                // deno-lint-ignore no-case-declarations
                case "$between":
                  const opval = operatorValue as { from: unknown; to: unknown };
                  ret.push(
                    `${
                      this._quoteColumn(columns[columnName])
                    } BETWEEN '${this._quoteValue(operatorValue)}' AND '${this._quoteValue(operatorValue)}'`,
                  );
                  break;
                case "$null":
                  if (operatorValue === true) {
                    ret.push(`${this._quoteColumn(columns[columnName])} IS NULL`);
                  } else {
                    ret.push(`${this._quoteColumn(columns[columnName])} IS NOT NULL`);
                  }
                  break;
                case "$like":
                  ret.push(
                    `${this._quoteColumn(columns[columnName])} LIKE ${this._quoteValue(operatorValue)}`,
                  );
                  break;
                case "$nlike":
                  ret.push(
                    `${this._quoteColumn(columns[columnName])} NOT LIKE ${this._quoteValue(operatorValue)}`,
                  );
                  break;
              }
            }
          } else {
            // No operator means it is equal to
            // @TODO, even this will be an argument.
            ret.push(`${this._quoteColumn(columns[columnName])} = '${this._quoteValue(operation)}'`);
          }
        }
      }
    }
    // return "(" + ret.join(` ${joiner} `) + ")";
    let retVal = `( `;
    retVal += (ret.reduce((prev, curr, index) => {
      // console.log(curr.toString());
      if (index === 0) {
        return curr;
      } else {
        prev += ` ${joiner} ` + curr;
        return prev;
      }
    }));
    retVal += ` )`;
    return retVal;
  }

  // deno-lint-ignore no-explicit-any
  protected _quoteValue(value: any): string {
    if(typeof value == null || typeof(value) == 'function' || typeof(value) == 'symbol')
      return 'NULL';
    if (value === false)
      return 'FALSE'
    if (value === true)
      return 'TRUE'
    if(typeof value === 'number' || typeof value === 'bigint')
      return value + '';
    if(value instanceof Date)
      return `'${value.toISOString()}'`;
    if (value instanceof Array || Array.isArray(value))
      return '(' + value.map((v) => this._quoteValue(v)).join(',') + ')';
    if(typeof value === 'object')
      value = JSON.stringify(value);
    else
      value += '';
    
    return `'${value.replace(/'/g, "''")}'`;

  }

  protected _quoteColumn(column: string) {
    return `"${column.replace(/\./g, '"."')}"`;
  }
}
