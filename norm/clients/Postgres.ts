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

import { PGPool, pgsql as sql, Sql } from "../../dependencies.ts";
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
    const qry = sql`SELECT `;
    // Generate column names
    if (!options.project) {
      options.project = Object.keys(options.columns);
    }
    const columns = options.project.map((value) => {
      const colName = options.columns[value as keyof T];
      return `${colName} AS ${value}`;
    });
    // const columns = Object.entries(options.columns).map((value) => {
    //   return `${value[1]} AS ${value[1]}`;
    // });
    qry.append(sql` ${columns}`);
    // Set table
    qry.append(
      (options.schema)
        ? sql` FROM "${options.schema}"."${options.table}"`
        : sql` FROM "${options.table}"`,
    );
    // Filters
    if (options.filters) {
      const filt = this._processFilters(options.columns, options.filters);
      qry.append(sql` WHERE `);
      qry.append(filt);
    }
    // Sort
    if (options.sort) {
      const sort = Object.entries(options.sort).map((value) => {
        return `${options.columns[value[0] as keyof T]} ${value[1]} `;
      });
      qry.append(sql` ORDER BY ${sort}`);
    }
    // Paging
    if (options.paging) {
      qry.append(
        sql` LIMIT ${options.paging.size} OFFSET ${
          (options.paging.page - 1 || 0) * options.paging.size
        } `,
      );
    }
    console.log("" + qry);
    const conn = await this._client.connect(),
      result = await conn.queryObject<T>("" + qry);
    conn.release();
    return result.rows;
  }

  protected async _count<T>(options: CountQueryOptions<T>): Promise<number> {
    const qry = sql`SELECT COUNT(1) as cnt`;
    // Set table
    qry.append(
      (options.schema)
        ? sql` FROM "${options.schema}"."${options.table}"`
        : sql` FROM "${options.table}"`,
    );
    // Filters
    if (options.filters) {
      const filt = this._processFilters(options.columns, options.filters);
      qry.append(sql` WHERE `);
      qry.append(filt);
    }
    console.log("" + qry);
    const conn = await this._client.connect(),
      result = await conn.queryObject<{ cnt: number }>("" + qry);
    conn.release();
    return result.rows[0].cnt;
  }

  protected async _insert<T>(
    options: InsertQueryOptions<T>,
  ): Promise<Array<T>> {
    const qry = sql`INSERT INTO `;
    // Set table
    qry.append(
      (options.schema)
        ? sql` "${options.schema}"."${options.table}"`
        : sql` "${options.table}"`,
    );

    // Set Data
    qry.append(sql` <${options.data}>`);

    // Generate return column names
    const columns = Object.entries(options.columns).map((value) => {
      return `${value[1]} AS ${value[1]}`;
    });

    qry.append(sql` RETURNING`);
    qry.append(sql` ${columns}`);

    console.log("" + qry);
    const conn = await this._client.connect(),
      result = await conn.queryObject<T>("" + qry);
    conn.release();
    return result.rows;
  }

  protected async _update<T>(
    options: UpdateQueryOptions<T>,
  ): Promise<Array<T>> {
    const qry = sql`UPDATE `;
    // Set table
    qry.append(
      (options.schema)
        ? sql` "${options.schema}"."${options.table}"`
        : sql` "${options.table}"`,
    );

    qry.append(sql` SET`);
    // Set Data
    qry.append(sql` {${options.data}}`);
    if (options.filters) {
      const theFilter = this._processFilters(
        options.columns,
        options.filters,
      );
      qry.append(sql` WHERE `);
      qry.append(theFilter);
    }
    // Generate return column names
    const columns = Object.entries(options.columns).map((value) => {
      return `${value[1]} AS ${value[1]}`;
    });
    qry.append(sql` RETURNING`);
    qry.append(sql` ${columns}`);

    console.log("" + qry);
    const conn = await this._client.connect(),
      result = await conn.queryObject<T>("" + qry);
    conn.release();
    return result.rows;
  }

  protected async _delete<T>(options: DeleteQueryOptions<T>): Promise<number> {
    const qry = sql`DELETE FROM`;
    // Set table
    qry.append(
      (options.schema)
        ? sql` "${options.schema}"."${options.table}"`
        : sql` "${options.table}"`,
    );
    // Set filter
    if (options.filters) {
      qry.append(sql` WHERE `);
      qry.append(this._processFilters(options.columns, options.filters));
    }

    console.log("" + qry);
    const conn = await this._client.connect(),
      result = await conn.queryObject<T>("" + qry);
    conn.release();
    return result.rowCount || 0;
  }

  protected async _truncate<T>(options: QueryOptions<T>): Promise<boolean> {
    const qry = sql`TRUNCATE TABLE`;
    // Set table
    qry.append(
      (options.schema)
        ? sql` "${options.schema}"."${options.table}"`
        : sql` "${options.table}"`,
    );

    console.log("" + qry);
    const conn = await this._client.connect();
    await conn.queryObject<T>("" + qry);
    conn.release();
    return true;
  }

  protected _createTable(options: CreateTableOptions) {
    const query: Array<string> = [];
    query.push(`CREATE TABLE IF NOT EXISTS ${(options.schema !== undefined) ? '"' + options.schema + '"."' + options.table + '"' : '"' + options.table + '"'} (`);
    const columns = []
    const constrains: Array<string> = []
    // PK
    if(options.primaryKeys && options.primaryKeys.length > 0) {
      constrains.push(` PRIMARY KEY ("${options.primaryKeys.join('", "')}")`);
    }
    if(options.uniqueKeys) {
      for(const [name, keys] of Object.entries(options.uniqueKeys)) {
        constrains.push(` CONSTRAINT "${options.table}_${name}" UNIQUE ("${keys.join('", "')}")`);
      }
    }
    // The columns
    for(const [name, define] of Object.entries(options.columns)) {
      columns.push(` "${name}" ${define.type}${define.isNullable === true ? '' : ' NOT NULL'}`);
    }
    if(constrains.length > 0)
      query.push(columns.join(', \n') + ', ');
    else 
      query.push(columns.join(', \n'));
    query.push(constrains.join(', \n'));
    query.push(');');
    console.log(query.join('\n'));
  }

  protected _dropTable() {}

  protected _syncTable() {}
  
  protected _processFilters<T>(
    columns: Record<string, string>,
    filter: Filters<T>,
    joiner = "AND",
  ): Sql {
    const ret: Array<Sql> = [];
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
                  ret.push(sql`${columns[columnName]} = '${operatorValue}'`);
                  break;
                case "$neq":
                  ret.push(sql`${columns[columnName]} != '${operatorValue}'`);
                  break;
                case "$in":
                  ret.push(sql`${columns[columnName]} IN [${operatorValue}]`);
                  break;
                case "$nin":
                  ret.push(
                    sql`${columns[columnName]} NOT IN [${operatorValue}]`,
                  );
                  break;
                case "$lt":
                  ret.push(sql`${columns[columnName]} < '${operatorValue}'`);
                  break;
                case "$lte":
                  ret.push(sql`${columns[columnName]} <= '${operatorValue}'`);
                  break;
                case "$gt":
                  ret.push(sql`${columns[columnName]} > '${operatorValue}'`);
                  break;
                case "$gte":
                  ret.push(sql`${columns[columnName]} >= '${operatorValue}'`);
                  break;
                // deno-lint-ignore no-case-declarations
                case "$between":
                  const opval = operatorValue as { from: unknown; to: unknown };
                  ret.push(
                    sql`${
                      columns[columnName]
                    } BETWEEN '${opval.from}' AND '${opval.to}'`,
                  );
                  break;
                case "$null":
                  if (operatorValue === true) {
                    ret.push(sql`${columns[columnName]} IS NULL`);
                  } else {
                    ret.push(sql`${columns[columnName]} IS NOT NULL`);
                  }
                  break;
                case "$like":
                  ret.push(
                    sql`${columns[columnName]} LIKE '${operatorValue}'`,
                  );
                  break;
                case "$nlike":
                  ret.push(
                    sql`${columns[columnName]} NOT LIKE '${operatorValue}'`,
                  );
                  break;
              }
            }
          } else {
            // No operator means it is equal to
            // @TODO, even this will be an argument.
            ret.push(sql`${columns[columnName]} = '${operation}'`);
          }
        }
      }
    }
    // return "(" + ret.join(` ${joiner} `) + ")";
    const retVal = sql`( `;
    retVal.append(ret.reduce((prev, curr, index) => {
      // console.log(curr.toString());
      if (index === 0) {
        return curr;
      } else {
        prev.append(sql` ${joiner} `);
        prev.append(curr);
        return prev;
      }
    }));
    retVal.append(sql` )`);
    return retVal;
  }
}
