import { Options } from "../options/mod.ts";
import { ConnectionError, GenericQueryError } from "./Errors.ts";

import type {
  ClientConfig,
  ClientEvents,
  Dialect,
  QueryOptions,
  QueryResult,
  QueryType,
} from "./types.ts";

export default abstract class AbstractClient
  extends Options<ClientConfig, ClientEvents> {
  protected _name: string;
  declare protected _client: unknown;

  /**
   * constructor
   * @param name string The configuration name
   * @param config ClientConfig The configuration for DB connection
   * @param configDefault ClientConfigg Config defaults to be passed
   */
  constructor(
    name: string,
    config: Partial<ClientConfig>,
    configDefault: Partial<ClientConfig>,
  ) {
    super(config, configDefault);
    this._name = name.trim();
  }

  /**
   * connect
   * Initializes a connection to the database
   */
  public async connect(): Promise<void> {
    try {
      await this._connect();
      // Should be connected now
      await this.emit("connect");
    } catch (e) {
      // Connection error. Just throw a connection error
      throw new ConnectionError(
        this._name,
        this._getOption("dialect"),
        e.message,
      );
    }
  }

  /**
   * close
   * Closes all open connection to the database
   */
  public async close() {
    try {
      // Check for transactions
      await this._close();
      this.emit("close");
    } catch (e) {
      throw e;
    }
  }

  /**
   * name
   * Returns the Configuration name
   * @getter
   */
  public get name(): string {
    return this._name;
  }

  /**
   * dialect
   * Returns the dialect currently in use
   * @getter
   */
  public get dialect(): Dialect {
    return this._getOption("dialect");
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
        totalRows: 0
      };
    this.connect();
    try {
      const op = await this._query<T>(sql, args);
      if (op.length > 0) {
        result.rows = op;
        result.totalRows = op.length;
      }
      // Set end time
      const end = performance.now();
      result.time = end - start;
      return result;
    } catch (e) {
      throw new GenericQueryError(
        this._name,
        this._getOption("dialect"),
        e.message,
      );
    }
  }

  /**
   * select (Typed)
   * Helps select data from a specific table. Supports filtering, paging and sorting
   *
   * @param options QueryOptions<T> The options or specs basis which data is to be selected
   * @returns Promise<QueryResult<T>>
   */
  public async select<T>(options: QueryOptions<T>): Promise<QueryResult<T>>;

  /**
   * select (UnTyped)
   * Helps select data from a specific table. Supports filtering, paging and sorting
   *
   * @param options QueryOptions<T> The options or specs basis which data is to be selected
   * @returns Promise<QueryResult<T>>
   */
  public async select<T = Record<string, unknown>>(
    options: QueryOptions<T>,
  ): Promise<QueryResult<T>> {
    const start = performance.now(),
      result: QueryResult<T> = {
        type: "SELECT",
        time: 0,
        totalRows: 0
      };
    this.connect();
    try {
      if (options.paging && options.paging.page < 1) {
        options.paging.page = 1;
      }
      const op = await this._select<T>(options);
      if (op.length > 0) {
        result.rows = op;
        result.totalRows = op.length;
      }
      // If paging variable found in query options, run count also and get the output
      // if (option.paging) {
      //   result.paging = option.paging;
      //   result.totalRows = await this._count(option);
      // }
      // Set end time
      const end = performance.now();
      result.time = end - start;
      return result;
    } catch (e) {
      console.log(e);
      throw new GenericQueryError(
        this._name,
        this.dialect,
        e.message,
      );
    }
  }

  /**
   * insert
   * Helps insert data to a specific table. It wil return the rows which have been inserted.
   *
   * @param options QueryOptions<T> The options
   * @returns Promise<QueryResult<T>>
   */
  public async insert<T>(options: QueryOptions<T>): Promise<QueryResult<T>>;

  /**
   * insert
   * Helps insert data to a specific table. It wil return the rows which have been inserted.
   *
   * @param options QueryOptions<T> The options
   * @returns Promise<QueryResult<T>>
   */
  public async insert<T = Record<string, unknown>>(
    options: QueryOptions<T>,
  ): Promise<QueryResult<T>> {
    const start = performance.now(),
      result: QueryResult<T> = {
        type: "INSERT",
        time: 0,
        totalRows: 0
      };
    this.connect();
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
      console.log(e);
      throw new GenericQueryError(
        this._name,
        this.dialect,
        e.message,
      );
    }
  }

  /**
   * count
   * Gets the count of records in a particular table
   *
   * @param options QueryOptions<T> The options
   * @returns Promise<QueryResult<T>>
   */
  public async count<T>(options: QueryOptions<T>): Promise<QueryResult<T>>;

  /**
   * count
   * Gets the count of records in a particular table
   *
   * @param options QueryOptions<T> The options
   * @returns Promise<QueryResult<T>>
   */
  public async count<T = Record<string, unknown>>(
    options: QueryOptions<T>,
  ): Promise<QueryResult<T>> {
    const start = performance.now(),
      result: QueryResult<T> = {
        type: "COUNT",
        time: 0,
        totalRows: 0
      };
    this.connect();
    try {
      const op = await this._count<T>(options);
      result.totalRows = op;
      // Set end time
      const end = performance.now();
      result.time = end - start;
      return result;
    } catch (e) {
      throw new GenericQueryError(
        this._name,
        this.dialect,
        e.message,
      );
    }
  }

  /**
   * update
   * Performs an update on specific table. Supports single row or bulk update of row
   *
   * @param options QueryOptions<T> The options
   * @returns Promise<QueryResult<T>>
   */
  public async update<T>(options: QueryOptions<T>): Promise<QueryResult<T>>;

  /**
   * update
   * Performs an update on specific table. Supports single row or bulk update of row
   *
   * @param options QueryOptions<T> The options
   * @returns Promise<QueryResult<T>>
   */
  public async update<T = Record<string, unknown>>(
    options: QueryOptions<T>,
  ): Promise<QueryResult<T>> {
    const start = performance.now(),
      result: QueryResult<T> = {
        type: "UPDATE",
        time: 0,
        totalRows: 0
      };
    this.connect();
    try {
      const op = await this._update<T>(options);
      result.rows = op;
      result.totalRows = op.length;
      // Set end time
      const end = performance.now();
      result.time = end - start;
      return result;
    } catch (e) {
      throw new GenericQueryError(
        this._name,
        this.dialect,
        e.message,
      );
    }
  }

  /**
   * delete
   * Performs an delete operation on specific table. Supports single row or bulk deletion of row
   *
   * @param options QueryOptions<T> The options
   * @returns Promise<QueryResult<T>>
   */
  public async delete<T>(options: QueryOptions<T>): Promise<QueryResult<T>>;

  /**
   * delete
   * Performs an delete operation on specific table. Supports single row or bulk deletion of row
   *
   * @param options QueryOptions<T> The options
   * @returns Promise<QueryResult<T>>
   */
  public async delete<T = Record<string, unknown>>(
    options: QueryOptions<T>,
  ): Promise<QueryResult<T>> {
    const start = performance.now(),
      result: QueryResult<T> = {
        type: "DELETE",
        time: 0,
        totalRows: 0
      };
    this.connect();
    try {
      const op = await this._delete<T>(options);
      result.totalRows = op;
      // Set end time
      const end = performance.now();
      result.time = end - start;
      return result;
    } catch (e) {
      throw new GenericQueryError(
        this._name,
        this.dialect,
        e.message,
      );
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
        totalRows: 0
      };
    this.connect();
    try {
      const count = await this._count<T>(options);
      await this._truncate<T>(options);
      result.totalRows = count;
      // Set end time
      const end = performance.now();
      result.time = end - start;
      return result;
    } catch (e) {
      throw new GenericQueryError(
        this._name,
        this.dialect,
        e.message,
      );
    }
  }

  /**
   * _connect
   * Abstract method implementation to connect to database
   * @abstract
   */
  protected abstract _connect(): Promise<void>;

  /**
   * _close
   * Abstract method implementation to close connection to database
   * @abstract
   */
  protected abstract _close(): Promise<void>;

  protected abstract _getQueryType(sql: string): QueryType;

  protected abstract _query<T>(
    sql: string,
    queryArgs?: Record<string, unknown>,
  ): Promise<Array<T>>;

  protected abstract _select<T>(options: QueryOptions<T>): Promise<Array<T>>;

  protected abstract _count<T>(options: QueryOptions<T>): Promise<number>;

  protected abstract _insert<T>(options: QueryOptions<T>): Promise<Array<T>>;

  protected abstract _update<T>(options: QueryOptions<T>): Promise<Array<T>>;

  protected abstract _delete<T>(options: QueryOptions<T>): Promise<number>;

  protected abstract _truncate<T>(options: QueryOptions<T>): Promise<boolean>;
}
