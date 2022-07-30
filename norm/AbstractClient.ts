import { Options } from "../options/Options.ts";

import type {
  ClientConfig,
  ClientEvents,
  // ColumnDefinition,
  CountQueryOptions,
  CreateTableOptions,
  DeleteQueryOptions,
  Dialect,
  InsertQueryOptions,
  QueryOptions,
  // QueryPagination,
  QueryResult,
  QueryType,
  SelectQueryOptions,
  UpdateQueryOptions,
} from "./types/mod.ts";

import { ConnectionError, QueryError } from "./Errors.ts";

export abstract class AbstractClient<T extends ClientConfig = ClientConfig>
  extends Options<T, ClientEvents> {
  protected _name: string;
  declare protected _client: unknown | undefined;
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
        time: 0,
        totalRows: 0,
      };
    await this.connect();
    try {
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
      throw new QueryError(e.message, result.type, this.name, this.dialect);
    }
  }

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
    const start = performance.now(),
      result: QueryResult<T> = {
        type: "SELECT",
        time: 0,
        totalRows: 0,
      };
    await this.connect();
    try {
      // Ensure its not < 1
      if (options.paging && options.paging.size < 1) {
        delete options.paging;
      }
      if (options.paging && options.paging.page < 1) {
        options.paging.page = 1;
      }
      const op = await this._select<T>(options);
      if (op.length > 0) {
        result.rows = op;
        result.totalRows = op.length;
      }
      // If paging variable found in query options, run count also and get the output
      if (options.paging) {
        result.paging = options.paging;
        result.totalRows = await this._count(options);
      }
      // Set end time
      const end = performance.now();
      result.time = end - start;
      return result;
    } catch (e) {
      throw new QueryError(e.message, result.type, this.name, this.dialect);
    }
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
    const start = performance.now(),
      result: QueryResult<T> = {
        type: "INSERT",
        time: 0,
        totalRows: 0,
      };
    await this.connect();
    try {
      const op = await this._insert<T>(options);
      if (op.length > 0) {
        result.rows = op;
        result.totalRows = op.length;
      }
      // Set end time
      const end = performance.now();
      result.time = end - start;
      return result;
    } catch (e) {
      throw new QueryError(e.message, result.type, this.name, this.dialect);
    }
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
    const start = performance.now(),
      result: QueryResult<T> = {
        type: "COUNT",
        time: 0,
        totalRows: 0,
      };
    await this.connect();
    try {
      const op = await this._count<T>(options);
      result.totalRows = op;
      // Set end time
      const end = performance.now();
      result.time = end - start;
      return result;
    } catch (e) {
      throw new QueryError(e.message, result.type, this.name, this.dialect);
    }
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
    const start = performance.now(),
      result: QueryResult<T> = {
        type: "UPDATE",
        time: 0,
        totalRows: 0,
      };
    await this.connect();
    try {
      const op = await this._update<T>(options);
      result.rows = op;
      result.totalRows = op.length;
      // Set end time
      const end = performance.now();
      result.time = end - start;
      return result;
    } catch (e) {
      throw new QueryError(e.message, result.type, this.name, this.dialect);
    }
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
    const start = performance.now(),
      result: QueryResult<T> = {
        type: "DELETE",
        time: 0,
        totalRows: 0,
      };
    await this.connect();
    try {
      const op = await this._delete<T>(options);
      result.totalRows = op;
      // Set end time
      const end = performance.now();
      result.time = end - start;
      return result;
    } catch (e) {
      throw new QueryError(e.message, result.type, this.name, this.dialect);
    }
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
    const start = performance.now(),
      result: QueryResult<T> = {
        type: "TRUNCATE",
        time: 0,
        totalRows: 0,
      };
    await this.connect();
    try {
      const count = await this._count<T>(options);
      await this._truncate<T>(options);
      result.totalRows = count;
      // Set end time
      const end = performance.now();
      result.time = end - start;
      return result;
    } catch (e) {
      throw new QueryError(e.message, result.type, this.name, this.dialect);
    }
  }

  public async createSchema(name: string, ifExists = true): Promise<void> {
    const start = performance.now();
    await this.connect();
    try {
      await this._createSchema(name, ifExists);
      // Set end time
      const end = performance.now();
      const _time = end - start;
    } catch (e) {
      throw new QueryError(e.message, "CREATE", this.name, this.dialect);
    }
  }

  public async dropSchema(
    name: string,
    ifExists = true,
    cascade = true,
  ): Promise<void> {
    const start = performance.now();
    await this.connect();
    try {
      await this._dropSchema(name, ifExists, cascade);
      // Set end time
      const end = performance.now();
      const _time = end - start;
    } catch (e) {
      throw new QueryError(e.message, "DROP", this.name, this.dialect);
    }
  }

  public async createTable(options: CreateTableOptions): Promise<void> {
    const start = performance.now();
    await this.connect();
    try {
      await this._createTable(options);
      // Set end time
      const end = performance.now();
      const _time = end - start;
    } catch (e) {
      throw new QueryError(e.message, "CREATE", this.name, this.dialect);
    }
  }

  public async dropTable(table: string, schema?: string): Promise<boolean> {
    const start = performance.now();
    await this.connect();
    try {
      await this._dropTable(table, schema);
      // Set end time
      const end = performance.now();
      const _time = end - start;
      return true;
    } catch (e) {
      throw new QueryError(e.message, "DROP", this.name, this.dialect);
    }
  }

  protected abstract _connect(): void;

  protected abstract _close(): void;

  protected abstract _getQueryType(sql: string): QueryType;

  protected abstract _query<T>(
    sql: string,
    queryArgs?: Record<string, unknown>,
  ): Promise<Array<T> | undefined>;

  protected abstract _select<T>(
    options: SelectQueryOptions<T>,
  ): Promise<Array<T>>;

  protected abstract _count<T>(options: CountQueryOptions<T>): Promise<number>;

  protected abstract _insert<T>(
    options: InsertQueryOptions<T>,
  ): Promise<Array<T>>;

  protected abstract _update<T>(
    options: UpdateQueryOptions<T>,
  ): Promise<Array<T>>;

  protected abstract _delete<T>(
    options: DeleteQueryOptions<T>,
  ): Promise<number>;

  protected abstract _truncate<T>(options: QueryOptions<T>): Promise<boolean>;

  protected abstract _createTable(options: CreateTableOptions): Promise<void>;

  protected abstract _dropTable(table: string, schema?: string): Promise<void>;

  protected abstract _createSchema(
    name: string,
    ifExists?: boolean,
  ): Promise<void>;

  protected abstract _dropSchema(
    name: string,
    ifExists?: boolean,
    cascade?: boolean,
  ): Promise<void>;
}
