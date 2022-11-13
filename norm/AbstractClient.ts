import { Options } from "../options/Options.ts";

import type {
  ClientConfig,
  ClientEvents,
  CountQueryOptions,
  CreateTableOptions,
  DeleteQueryOptions,
  Dialect,
  Generators,
  InsertQueryOptions,
  QueryOptions,
  // QueryPagination,
  QueryResult,
  QueryType,
  SelectQueryOptions,
  UpdateQueryOptions,
} from "./types/mod.ts";

import { ConnectionError, QueryError } from "./Errors.ts";
import { DialectHelper } from "./DialectHelper.ts";

export abstract class AbstractClient<T extends ClientConfig = ClientConfig>
  extends Options<T, ClientEvents> {
  protected _name: string;
  declare protected _client: unknown | undefined;
  declare protected _dialectHelper: DialectHelper;
  protected _testQuery = "SELECT 1";
  protected _stats: Map<
    QueryType,
    { count: number; time: number; error: number }
  > = new Map();

  /**
   * constructor
   *
   * @param name string The configuration name
   * @param config ClientConfig The configuration for DB connection
   * @param configDefault ClientConfigg Config defaults to be passed
   */
  constructor(name: string, options: Partial<T>, defaultConfig?: Partial<T>) {
    super(options, defaultConfig);
    this._name = name.toLowerCase().trim();
    if (this.dialect !== "MONGODB") {
      this._dialectHelper = new DialectHelper(this.dialect);
    }
  }

  /**
   * dialect
   *
   * Returns the dialect currently in use
   *
   * @getter
   */
  get dialect(): Dialect {
    return this._getOption("dialect");
  }

  /**
   * name
   *
   * Returns the Configuration name
   *
   * @getter
   */
  get name(): string {
    return this._name;
  }

  get stats(): Map<QueryType, { count: number; time: number; error: number }> {
    return this._stats;
  }

  getGenerator(value: keyof Generators): unknown | undefined {
    return this._dialectHelper.getGenerator(value);
  }

  /**
   * connect
   *
   * Initializes a connection to the database
   */
  public async connect(): Promise<void> {
    try {
      await this._connect();
      this.emit("connect", "dsf");
    } catch (e) {
      // Throw error
      throw new ConnectionError(e.message, this.name, this.dialect);
    }
  }

  /**
   * close
   *
   * Closes all open connection to the database
   */
  public async close(): Promise<void> {
    try {
      await this._close();
    } catch (e) {
      throw new ConnectionError(e.message, this.name, this.dialect);
    }
  }

  public async test(): Promise<boolean> {
    try {
      await this.query(this._testQuery);
      return true;
    } catch (_) {
      return false;
    }
  }
  /**
   * query (Typed)
   * Execute an SQL query. Supports named argument substitution
   *
   * @param sql string The SQL query to run
   * @param args Record<string, unknown> The arguments to replace in query
   */
  public async query<T>(
    sql: string,
    args?: Record<string, unknown>,
  ): Promise<QueryResult<T>>;

  /**
   * query (UnTyped)
   * Execute an SQL query. Supports named argument substitution
   *
   * @param sql string The SQL query to run
   * @param args Record<string, unknown> The arguments to replace in query
   * @returns Promise<QueryResult<T>>
   */
  public async query<T = Record<string, unknown>>(
    sql: string,
    args?: Record<string, unknown>,
  ): Promise<QueryResult<T>> {
    const start = performance.now(),
      result: QueryResult<T> = {
        type: this._getQueryType(sql),
        sql: sql.trim().replaceAll(/\r\n|\n|\r/g, " ").replaceAll(
          /\s+|\t/g,
          " ",
        ),
        time: 0,
        totalRows: 0,
      };
    await this.connect();
    try {
      // console.log(sql);
      const op = await this._query<T>(sql, args);
      if (op && op.length > 0) {
        result.rows = op;
        result.totalRows = op.length;
      }
      // Set end time
      const end = performance.now();
      result.time = end - start;
      return result;
    } catch (e) {
      // TODO Handle different errors and throw appropriate error
      throw new QueryError(e.message, result.type, this.name, this.dialect);
    }
  }

  // public async execute(sql: string, args?: Record<string, unknown>): Promise<void> {
  //   const start = performance.now();
  //   await this.connect();
  //   try {
  //     await this._execute(sql, args);
  //     // Set end time
  //     const end = performance.now();
  //     const _time = end - start;
  //   } catch (e) {
  //     throw new QueryError(e.message, "EXECUTE", this.name, this.dialect);
  //   }
  // }

  /**
   * select
   *
   * Helps select data from a specific table. Supports filtering, paging and sorting
   *
   * @param options options SelectQueryOptions<T> The options or specs basis which data is to be selected
   * @returns Promise<QueryResult<T>>
   */
  public async select<T>(
    options: SelectQueryOptions<T>,
  ): Promise<QueryResult<T>>;

  /**
   * select
   *
   * Helps select data from a specific table. Supports filtering, paging and sorting
   *
   * @param options SelectQueryOptions<T> The options or specs basis which data is to be selected
   * @returns Promise<QueryResult<T>>
   */
  public async select<T = Record<string, unknown>>(
    options: SelectQueryOptions<T>,
  ): Promise<QueryResult<T>> {
    if (options.paging && options.paging.limit < 1) {
      delete options.paging;
    }
    if (options.paging && options.paging.page < 1) {
      options.paging.page = 1;
    }
    const count = await this.count(options),
      retVal = await this.query<T>(this._dialectHelper.select(options));
    retVal.totalRows = count.totalRows;
    // Time taken is sum of both
    retVal.time += count.time;
    if (options.paging) {
      retVal.paging = options.paging;
    }
    return retVal;
  }

  /**
   * insert
   *
   * Helps insert data to a specific table. It wil return the rows which have been inserted.
   *
   * @param options InsertQueryOptions<T> The options
   * @returns Promise<QueryResult<T>>
   */
  public async insert<T>(
    options: InsertQueryOptions<T>,
  ): Promise<QueryResult<T>>;

  /**
   * insert
   * Helps insert data to a specific table. It wil return the rows which have been inserted.
   *
   * @param options InsertQueryOptions<T> The options
   * @returns Promise<QueryResult<T>>
   */
  public async insert<T = Record<string, unknown>>(
    options: InsertQueryOptions<T>,
  ): Promise<QueryResult<T>> {
    return await this.query<T>(this._dialectHelper.insert(options));
  }

  /**
   * count
   * Gets the count of records in a particular table
   *
   * @param options CountQueryOptions<T> The options
   * @returns Promise<QueryResult<T>>
   */
  public async count<T>(options: CountQueryOptions<T>): Promise<QueryResult<T>>;

  /**
   * count
   * Gets the count of records in a particular table
   *
   * @param options CountQueryOptions<T> The options
   * @returns Promise<QueryResult<T>>
   */
  public async count<T = Record<string, unknown>>(
    options: CountQueryOptions<T>,
  ): Promise<QueryResult<T>> {
    const ret = await this.query<{ cnt: number }>(
      this._dialectHelper.count(options),
    );
    if (ret.rows) {
      ret.totalRows = ret.rows[0].cnt;
      delete ret.rows;
    }
    return ret as QueryResult<T>;
  }

  /**
   * update
   * Performs an update on specific table. Supports single row or bulk update of row
   *
   * @param options UpdateQueryOptions<T> The options
   * @returns Promise<QueryResult<T>>
   */
  public async update<T>(
    options: UpdateQueryOptions<T>,
  ): Promise<QueryResult<T>>;

  /**
   * update
   * Performs an update on specific table. Supports single row or bulk update of row
   *
   * @param options UpdateQueryOptions<T> The options
   * @returns Promise<QueryResult<T>>
   */
  public async update<T = Record<string, unknown>>(
    options: UpdateQueryOptions<T>,
  ): Promise<QueryResult<T>> {
    return await this.query<T>(this._dialectHelper.update(options));
  }

  /**
   * delete
   * Performs an delete operation on specific table. Supports single row or bulk deletion of row
   *
   * @param options DeleteQueryOptions<T> The options
   * @returns Promise<QueryResult<T>>
   */
  public async delete<T>(
    options: DeleteQueryOptions<T>,
  ): Promise<QueryResult<T>>;

  /**
   * delete
   * Performs an delete operation on specific table. Supports single row or bulk deletion of row
   *
   * @param options DeleteQueryOptions<T> The options
   * @returns Promise<QueryResult<T>>
   */
  public async delete<T = Record<string, unknown>>(
    options: DeleteQueryOptions<T>,
  ): Promise<QueryResult<T>> {
    const count = await this.count(options),
      retVal = await this.query<T>(this._dialectHelper.delete(options));
    retVal.totalRows = count.totalRows;
    return retVal;
  }

  /**
   * truncate
   * Truncates a table
   *
   * @param options QueryOptions<T> The options
   * @returns Promise<QueryResult<T>>
   */
  public async truncate<T>(options: QueryOptions<T>): Promise<QueryResult<T>>;

  /**
   * truncate
   * Truncates a table
   *
   * @param options QueryOptions<T> The options
   * @returns Promise<QueryResult<T>>
   */
  public async truncate<T = Record<string, unknown>>(
    options: QueryOptions<T>,
  ): Promise<QueryResult<T>> {
    const count = await this.count(options),
      retVal = await this.query<T>(this._dialectHelper.truncate(options));
    retVal.totalRows = count.totalRows;
    return retVal;
  }

  public async createSchema(name: string): Promise<void> {
    await this.query(this._dialectHelper.createSchema(name));
  }

  public async dropSchema(
    name: string,
    cascade = true,
  ): Promise<void> {
    await this.query(this._dialectHelper.dropSchema(name, cascade));
  }

  public async createTable(options: CreateTableOptions): Promise<void> {
    await this.query(this._dialectHelper.createTable(options));
  }

  public async dropTable(
    table: string,
    schema?: string,
    cascade = false,
  ): Promise<void> {
    await this.query(
      this._dialectHelper.dropTable(table, schema, cascade),
    );
  }

  // public async getTableDefinition(
  //   table: string,
  //   schema?: string,
  // ): Promise<SchemaDefinition> {
  //   // const start = performance.now()
  //   await this.connect();
  //   try {
  //     const result = await this._getTableDefinition(table, schema);
  //     // Set end time
  //     // const end = performance.now();
  //     // const time = end - start;
  //     return result;
  //   } catch (e) {
  //     throw new QueryError(e.message, "DESCRIBE", this.name, this.dialect);
  //   }
  // }

  protected abstract _connect(): void;

  protected abstract _close(): void;

  protected abstract _getQueryType(sql: string): QueryType;

  protected abstract _query<T>(
    sql: string,
    queryArgs?: Record<string, unknown>,
  ): Promise<Array<T> | undefined>;

  // protected abstract _getTableDefinition(
  //   table: string,
  //   schema?: string,
  // ): Promise<SchemaDefinition>;
}
