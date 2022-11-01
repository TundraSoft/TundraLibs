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

  get name(): string {
    return this._name;
  }

  get dialect(): Dialects {
    return this._dialect;
  }

  get state(): "OPEN" | "CLOSED" {
    return this._state;
  }

  get version(): string {
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
        this._version = await this._getVersion();
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

  //#region Basic executors
  public async execute(): Promise<void> {}

  public async query(): Promise<void> {}
  //#endregion Basic executors

  //#region Standard DML
  public async select(): Promise<void> {}

  public async count(): Promise<void> {}

  public async insert(): Promise<void> {}

  public async update(): Promise<void> {}

  public async delete(): Promise<void> {}

  //#endregion Standard DML

  //#region DDL
  public async createSchema(name: string): Promise<void> {}

  public async dropSchema(name: string): Promise<void> {}

  public async createTable(): Promise<void> {}

  public async dropTable(): Promise<void> {}

  public async truncate(): Promise<void> {}

  public async createIndex(): Promise<void> {}

  public async dropIndex(): Promise<void> {}
  
  //#region Abstract Methods
  protected abstract _init(): Promise<void>;
  protected abstract _close(): Promise<void>;
  protected abstract _getVersion(): Promise<string>;
  //#endregion Abstract Methods
}