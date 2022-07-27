import { AbstractClient } from "../AbstractClient.ts";
import type {
  CountQueryOptions,
  CreateTableOptions,
  DeleteQueryOptions,
  Filters,
  InsertQueryOptions,
  QueryOptions,
  QueryType,
  SelectQueryOptions,
  SQLiteConfig,
  UpdateQueryOptions,
} from "../types/mod.ts";

import { Sql, sqlite as sql, SQLiteClient } from "../../dependencies.ts";

export class SQLite<T extends SQLiteConfig> extends AbstractClient<T> {
  protected _client: SQLiteClient | undefined = undefined;
  protected _sqlLiteOptions: Record<string, unknown> = {};

  constructor(name: string, config: Partial<T>) {
    const defaults: Partial<SQLiteConfig> = {
      dialect: "SQLITE",
      mode: "create",
      memory: false,
    };
    super(name, config, defaults as Partial<T>);
    this._sqlLiteOptions = {
      mode: this._getOption("mode"),
      memory: (this._hasOption("memory") && this._getOption("memory")) || false,
    };
  }

  _connect(): void {
    if (this._client === undefined) {
      // Connect to database
      this._client = new SQLiteClient(
        this._getOption("dbPath"),
        this._sqlLiteOptions,
      );
    }
  }

  _close(): void {
    if (this._client !== undefined) {
      this._client.close();
      this._client = undefined;
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

  // TODO - Fix this
  protected async _query<T>(
    sql: string,
    _queryArgs?: Record<string, unknown>,
  ): Promise<Array<T> | undefined> {
    const result = await this._client?.query(sql);
    console.log(result);
    if (result) {
      return result as unknown as T[];
    }
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
    const result = await this._client?.queryEntries(qry.toString());
    return result as T[];
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
    const result = await this._client?.queryEntries(qry.toString());
    console.log(result);
    return 0 as number;
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
    const result = await this._client?.queryEntries(qry.toString());
    return result as T[];
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
    const result = await this._client?.queryEntries(qry.toString());
    return result as T[];
  }

  protected async _delete<T>(
    options: DeleteQueryOptions<T>,
  ): Promise<number> {
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
    const result = await this._client?.queryEntries(qry.toString());
    console.log(result);
    return this._client?.changes || 0;
  }

  protected async _truncate<T>(options: QueryOptions<T>): Promise<boolean> {
    const qry = sql`TRUNCATE TABLE "${options.table}"`;
    // Set table
    qry.append(
      (options.schema)
        ? sql` "${options.schema}"."${options.table}"`
        : sql` "${options.table}"`,
    );

    console.log("" + qry);
    await this._client?.execute(qry.toString());
    return true;
  }

  protected _createTable(options: CreateTableOptions) {
    const qry = sql`CREATE TABLE IF NOT EXISTS`;
    // Set table
    qry.append(
      (options.schema)
        ? sql` "${options.schema}"."${options.table}"`
        : sql` "${options.table}"`,
    );
    // Set columns
    qry.append(sql` (${options.columns})`);
    // Set primary key
    if (options.primaryKeys) {
      qry.append(sql` PRIMARY KEY (${options.primaryKeys})`);
    }
    // Set unique keys
    if (options.uniqueKeys) {
      qry.append(sql` UNIQUE (${options.uniqueKeys})`);
    }
    // Set foreign keys
    // if (options.foreignKeys) {
    //   qry.append(sql` FOREIGN KEY (${options.foreignKeys})`);
    // }
    console.log("" + qry);
  }

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

// const Test = new SQLite('test.db', {memory: true});
// Test.connect();
// const cOut = await Test.query("CREATE TABLE Test (id INTEGER PRIMARY KEY, name TEXT, age INTEGER)");
// console.log(cOut);
// // const ins = await Test.query("INSERT INTO Test (name, age) VALUES ('John', 20)");
// // console.log(ins);
// // const sel = await Test.query("SELECT * FROM Test");
// // console.log(sel)
// console.log(await Test.insert({table: "Test", columns: {id: "id", name: "name", age: "age"}, data: [{name: "John", age: 20}, {name: "Jane", age: 21}]}));
// console.log(await Test.select({table: "Test", columns: {id: "id", name: "name", age: "age"}}));
// console.log(await Test.update({table: "Test", columns: {id: "id", name: "name", age: "age"}, filters: {id: {$eq: 1}}, data: {name: "John", age: 21}}));
// console.log(await Test.select({table: "Test", columns: {id: "id", name: "name", age: "age"}}));
// console.log(await Test.delete({table: "Test", columns: {id: "id", name: "name", age: "age"}, filters: {id: {$eq: 1}}}));
