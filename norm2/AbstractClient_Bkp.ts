import { Options } from "../options/mod.ts";

import type {
  ClientConfig,
  ClientEvents,
  DeleteQueryOptions,
  Dialects,
  Filters,
  InsertQueryOptions,
  QueryResult,
  QueryType,
  SelectQueryOptions,
  DataQueryResult,
  UpdateQueryOptions,
} from "./types/mod.ts";

import { ErrorCodes, NormError } from "./errors/mod.ts";

export abstract class AbstractClient<
  O extends ClientConfig = ClientConfig,
  E extends ClientEvents = ClientEvents,
> extends Options<O, E> {
  /**
   * Connection Name
   * @type {string}
   */
  protected _name: string;
  
  /**
   * Connection Dialect, example POSTGRES
   * @type {Dialects}
   */
  protected _dialect: Dialects;

  /**
   * Returns the status of the connection.
   * @type {"OPEN" | "CLOSED"}
   */
   protected _state: "OPEN" | "CLOSED" = "CLOSED";

  /**
   * The Database version
   * @type {string}
   */
  declare protected _version: string;

  protected _valueEscape = "'";

  protected _tableEscape = '"';

  /**
   * The actual client/driver for this connection
   */
  declare protected _client: unknown | undefined;

  constructor(options: NonNullable<O> | O) {
    super(options);
    this._name = options.name;
    this._dialect = options.dialect;
  }

  get Name(): string {
    return this._name;
  }

  get Dialect(): Dialects {
    return this._dialect;
  }

  get State(): "OPEN" | "CLOSED" {
    return this._state;
  }

  get Version(): string {
    return this._version;
  }

  /**
   * Initializes the connection. This need not be called as it is called 
   * when a query is executed.
   */
  public async init(): Promise<void> {
    if (this._state === "CLOSED") {
      try {
        await this._init();
        // Fetch the version
        await this._getVersion();
      } catch (e) {
        // Ensure the state is set to closed
        this._state = "CLOSED";
        throw e;
      }
    }
  }

  /**
   * Closes the connection if it is open
   */
  public async close(): Promise<void> {
    if(this._state === "OPEN") {
      await this._close();
      this._state = "CLOSED";
    }
  }

  public async select<Entity extends Record<string, unknown>>(options: SelectQueryOptions<Entity>): Promise<DataQueryResult<Entity>>;
  public async select<Entity extends Record<string, unknown> = Record<string, unknown>>(options: SelectQueryOptions<Entity>): Promise<DataQueryResult<Entity>> {
    try {
      await this._init();
      const start = performance.now();
      const sql = this.generateSelectQuery<Entity>(options), 
        retVal: DataQueryResult<Entity> = {
        type: "SELECT", 
        sql: sql,
        time: 0, 
        data: [],
        count: 0,
        paging: options.paging,
      }
      // Get the results
      retVal.data = await this._query<Entity>(sql);
      // Get the count
      if (options.paging) {
        retVal.count = (await this.count(options)).count;
      } else {
        retVal.count = retVal.data.length;
      }
      retVal.time = performance.now() - start;
      return retVal;
    } catch (e) {
      // TODO - Handle the error
      throw e;
    }
  }

  public async count<Entity extends Record<string, unknown>>(options: SelectQueryOptions<Entity>): Promise<QueryResult<Entity>>;
  public async count<Entity extends Record<string, unknown> = Record<string, unknown>>(options: SelectQueryOptions<Entity>): Promise<QueryResult<Entity>> {
    try {
      await this._init();
      const start = performance.now();
      const sql = this.generateCountQuery<Entity>(options), 
        retVal: QueryResult<Entity> = {
        type: "COUNT", 
        sql: sql,
        time: 0, 
        count: 0,
      }
      // Get the results
      retVal.count = (await this._query<{TotalRows: number}>(sql))[0].TotalRows;
      retVal.time = performance.now() - start;
      return retVal;
    } catch (e) {
      // TODO - Handle the error
      throw e;
    }
  }

  public async insert<Entity extends Record<string, unknown>>(options: InsertQueryOptions<Entity>): Promise<QueryResult<Entity>>;
  public async insert<Entity extends Record<string, unknown> = Record<string, unknown>>(options: InsertQueryOptions<Entity>): Promise<DataQueryResult<Entity>> {
    try {
      await this._init();
      const start = performance.now();
      const sql = this.generateInsertQuery<Entity>(options), 
        retVal: DataQueryResult<Entity> = {
        type: "INSERT", 
        sql: sql,
        time: 0, 
        data: [],
        count: 0,
      }
      // Get the results
      retVal.data = await this._query<Entity>(sql);
      retVal.count = retVal.data.length;
      retVal.time = performance.now() - start;
      return retVal;
    } catch (e) {
      // TODO - Handle the error
      throw e;
    }
  }

  public async update<Entity extends Record<string, unknown>>(options: UpdateQueryOptions<Entity>): Promise<QueryResult<Entity>>;
  public async update<Entity extends Record<string, unknown> = Record<string, unknown>>(options: UpdateQueryOptions<Entity>): Promise<DataQueryResult<Entity>> {
    try {
      await this._init();
      const start = performance.now();
      const sql = this.generateUpdateQuery<Entity>(options), 
        retVal: DataQueryResult<Entity> = {
        type: "UPDATE", 
        sql: sql,
        time: 0, 
        data: [],
        count: 0,
      }
      // Get the results
      retVal.data = await this._query<Entity>(sql);
      retVal.count = retVal.data.length;
      retVal.time = performance.now() - start;
      return retVal;
    } catch (e) {
      // TODO - Handle the error
      throw e;
    }
  }

  public async delete<Entity extends Record<string, unknown>>(options: DeleteQueryOptions<Entity>): Promise<QueryResult<Entity>>;
  public async delete<Entity extends Record<string, unknown> = Record<string, unknown>>(options: DeleteQueryOptions<Entity>): Promise<QueryResult<Entity>> {
    try {
      await this._init();
      const start = performance.now();
      const sql = this.generateDeleteQuery<Entity>(options), 
        retVal: QueryResult<Entity> = {
        type: "DELETE", 
        sql: sql,
        time: 0, 
        count: 0,
      }
      // Get the count of rows deleted
      retVal.count = (await this.count(options)).count
      // Perform the query
      await this._query<Entity>(sql);
      retVal.time = performance.now() - start;
      return retVal;
    } catch (e) {
      // TODO - Handle the error
      throw e;
    }
  }

  public async truncate(table: string, schema: string): Promise<void> {
    try {
      await this._init();
      const sql = this.generateTruncateQuery(table, schema);
      // TODO Change this to execute
      await this._query(sql);
    } catch (e) {
      // TODO - Handle the error
      throw e;
    }
  }

  //#region SQL Generators
  public generateSelectQuery<Entity extends Record<string, unknown>>(options: SelectQueryOptions<Entity>): string;
  public generateSelectQuery<Entity extends Record<string, unknown> = Record<string, unknown>>(options: SelectQueryOptions<Entity>): string {
    if (options.paging && options.paging.limit < 1) {
      delete options.paging;
    }
    if (options.paging && options.paging.page < 1) {
      options.paging.page = 1;
    }
    const tableName = this._escapeTable((options.schema ? options.schema + "." : "") + options.table), 
      columns = Object.keys(options.columns).map((alias) => {
        if (!options.project || (options.project && options.project.includes(alias))) {
          return `${this._escapeTable(options.columns[alias])} AS ${this._escapeTable(alias)}`;
        }
        return '';
      }), 
      paging = (options.paging && options.paging.limit > 0) ? `LIMIT ${options.paging.limit} OFFSET ${(options.paging.page - 1) * options.paging.limit} ` : "",
      sort = (options.sort && Object.keys(options.sort).length > 0)
      ? ` ORDER BY ${
        Object.entries(options.sort).map((value) => {
          return `${
            this._escapeTable(options.columns[value[0]])
          } ${value[1]} `;
        }).join(", ")
      }`
      : "",
      filter = (options.filters)? ` WHERE ${this._processFilters(options.columns, options.filters)}` : '';
      return `SELECT ${columns.join(", ")} FROM ${tableName}${filter}${sort}${paging};`;
  }

  public generateCountQuery<Entity extends Record<string, unknown>>(options: SelectQueryOptions<Entity>): string;
  public generateCountQuery<Entity extends Record<string, unknown> = Record<string, unknown>>(options: SelectQueryOptions<Entity>): string {
    const tableName = this._escapeTable((options.schema ? options.schema + "." : "") + options.table), 
      filter = (options.filters)? ` WHERE ${this._processFilters(options.columns, options.filters)}` : '';
      return `SELECT COUNT(1) AS TotalRows FROM ${tableName} ${filter};`;
  }

  public generateInsertQuery<Entity extends Record<string, unknown>>(options: InsertQueryOptions<Entity>): string;
  public generateInsertQuery<Entity extends Record<string, unknown> = Record<string, unknown>>(options: InsertQueryOptions<Entity>): string {
    const tableName = this._escapeTable((options.schema ? options.schema + "." : "") + options.table), 
      columns = Object.keys(options.columns).map((alias) => {
        return `${this._escapeTable(options.columns[alias])}`;
      }), 
      values = options.data.map((row) => {
          return Object.keys(options.columns).map((key) => {
            return this._escapeValue(row[key]);
          });
          // return `(${Object.keys(columns).map((key) => {
          //   return this._escapeValue(row[key]);
          // }).join(", ")})`;
        }), 
      returning = Object.keys(options.columns).map((alias) => {
          if (!options.project || (options.project && options.project.includes(alias))) {
            return `${this._escapeTable(options.columns[alias])} AS ${this._escapeTable(alias)}`
          }
        });
      return `INSERT INTO ${tableName} \n(${columns.join(", ")}) \nVALUES (${values.join("), \n(")}) \nRETURNING ${returning.join(', \n')};`;
  }

  public generateUpdateQuery<Entity extends Record<string, unknown>>(options: UpdateQueryOptions<Entity>): string;
  public generateUpdateQuery<Entity extends Record<string, unknown> = Record<string, unknown>>(options: UpdateQueryOptions<Entity>): string {
    const tableName = this._escapeTable((options.schema ? options.schema + "." : "") + options.table), 
      columns = Object.keys(options.data).map((columnName) => {
        return `${this._escapeTable(options.columns[columnName])} = ${this._escapeValue(options.data[columnName])}`;
      }), 
      filter = (options.filters)? ` WHERE ${this._processFilters(options.columns, options.filters)}` : '',
      returning = Object.keys(options.columns).map((alias) => {
          if (!options.project || (options.project && options.project.includes(alias))) {
            return `${this._escapeTable(options.columns[alias])} AS ${this._escapeTable(alias)}`
          }
        });
      return `UPDATE ${tableName} \nSET ${columns.join(", \n")}${filter}\nRETURNING ${returning.join(', \n')};`;
  }

  public generateDeleteQuery<Entity extends Record<string, unknown>>(options: DeleteQueryOptions<Entity>): string;
  public generateDeleteQuery<Entity extends Record<string, unknown> = Record<string, unknown>>(options: DeleteQueryOptions<Entity>): string {return ''}

  public generateTruncateQuery(table: string, schema?: string): string {
    return `TRUNCATE TABLE ${this._escapeTable((schema ? schema + "." : "") + table)};`;
  }
  //#endregion SQL Generators

  //#region Protected methods
  protected _processFilters<Entity extends Record<string, unknown>>(
    columns: Record<string, string>,
    filter: Filters<Entity>,
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
              operation as Filters<Entity>,
              (columnName === "$or") ? "OR" : "AND",
            ),
          );
          // } else if (!columns[columnName]) {
          //   throw new Error(`[module=norm] Column ${columnName} is not part of column list for filtering`)
        } else {
          // No its a variable
          if (typeof operation === "object") {
            // Parse the operator
            for (const [operator, operatorValue] of Object.entries(operation as Filters<Entity>)) {
              // Hack for boolean
              switch (operator) {
                case "$eq":
                  ret.push(
                    `${this._escapeTable(columns[columnName])} = ${
                      this._escapeValue(operatorValue)
                    }`,
                  );
                  break;
                case "$neq":
                  ret.push(
                    `${this._escapeTable(columns[columnName])} != ${
                      this._escapeValue(operatorValue)
                    }`,
                  );
                  break;
                case "$in":
                  ret.push(
                    `${this._escapeTable(columns[columnName])} IN ${
                      this._escapeValue(operatorValue)
                    }`,
                  );
                  break;
                case "$nin":
                  ret.push(
                    `${this._escapeTable(columns[columnName])} NOT IN ${
                      this._escapeValue(operatorValue)
                    }`,
                  );
                  break;
                case "$lt":
                  ret.push(
                    `${this._escapeTable(columns[columnName])} < ${
                      this._escapeValue(operatorValue)
                    }`,
                  );
                  break;
                case "$lte":
                  ret.push(
                    `${this._escapeTable(columns[columnName])} <= ${
                      this._escapeValue(operatorValue)
                    }`,
                  );
                  break;
                case "$gt":
                  ret.push(
                    `${this._escapeTable(columns[columnName])} > ${
                      this._escapeValue(operatorValue)
                    }`,
                  );
                  break;
                case "$gte":
                  ret.push(
                    `${this._escapeTable(columns[columnName])} >= ${
                      this._escapeValue(operatorValue)
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
                    `${this._escapeTable(columns[columnName])} BETWEEN '${
                      this._escapeValue(opval.$from)
                    }' AND '${this._escapeValue(opval.$to)}'`,
                  );
                  break;
                case "$null":
                  if (operatorValue === true) {
                    ret.push(
                      `${this._escapeTable(columns[columnName])} IS NULL`,
                    );
                  } else {
                    ret.push(
                      `${this._escapeTable(columns[columnName])} IS NOT NULL`,
                    );
                  }
                  break;
                case "$like":
                  ret.push(
                    `${this._escapeTable(columns[columnName])} LIKE ${
                      this._escapeValue(operatorValue)
                    }`,
                  );
                  break;
                case "$nlike":
                  ret.push(
                    `${this._escapeTable(columns[columnName])} NOT LIKE ${
                      this._escapeValue(operatorValue)
                    }`,
                  );
                  break;
                case "$ilike":
                  ret.push(
                    `${this._escapeTable(columns[columnName])} ILIKE ${
                      this._escapeValue(operatorValue)
                    }`,
                  );
                  break;
                case "$nilike":
                  ret.push(
                    `${this._escapeTable(columns[columnName])} NOT ILIKE ${
                      this._escapeValue(operatorValue)
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
              `${this._escapeTable(columns[columnName])} = ${
                this._escapeValue(operation)
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
  protected _escapeValue(value: any): string {
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
      return "(" + value.map((v) => this._escapeValue(v)).join(",") + ")";
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
    const findRegEx = new RegExp(this._valueEscape, "g"), 
      replace = this._valueEscape + this._valueEscape;
    // return `'${value.replace(/'/g, "''")}'`;
    return `'${value.replace(findRegEx, replace)}'`;
  }

  protected _escapeTable(value: string): string {
    const split = value.split(".");
    return split.join(this._tableEscape + "." + this._tableEscape);
  }
  //#endregion Protected Methods

  //#region Abstract Methods
  protected abstract _init(): Promise<void>;
  protected abstract _close(): Promise<void>;

  
  //#region DDL Generators
  // public abstract _generateCreateSchema(name: string): string;
  // public abstract _generateDropSchema(name: string): string;
  // public abstract _generateCreateTable(options: CreateTableOptions<T>): string;
  // public abstract _generateDropTable(options: { table: T }): string;
  // public abstract _generateTruncateQuery<T>(options: DeleteQueryOptions<T>): string;
  //#endregion DDL Generators
  
  /**
   * _execute
   * 
   * The most basic method which simply executes an sql statement passed. If parameters are passed, 
   * they are escaped and substituted in the query.
   * 
   * @param qry The sql query to execute
   * @param params Params to substitute in the query
   * @returns T[]
   */
  protected abstract _execute(qry: string, params?: unknown[]): Promise<void>;

  /**
   * _query
   * 
   * Executes an sql statement which returns data. If parameters are passed, they are escaped and
   * substituted in the query.
   * 
   * @param qry The sql query to execute
   * @param params Params to substitute in the query
   * @returns T[]
   */
  protected abstract _query<Entity extends Record<string, unknown>>(qry: string, params?: Record<string, unknown>): Promise<Entity[]>;

  /**
   * _getVersion
   * 
   * Gets the version of the Database. This is typically called when connection is established, a 
   * way to ensure that the connection is actually established. Use Version to actually get the version.
   * 
   */
  protected abstract _getVersion(): Promise<void>;
  //#endregion Abstract Methods
}