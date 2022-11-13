import { Options } from "../options/mod.ts";
import { QueryTranslator } from "./QueryTranslator.ts";

import type {
  ClientConfig,
  ClientEvents,
  CountQuery,
  CreateSchemaQuery,
  CreateTableQuery,
  DeleteQuery,
  Dialects,
  DropSchemaQuery,
  DropTableQuery,
  GeneratorOutput,
  InsertQuery,
  QueryOption,
  QueryResult,
  QueryType,
  SelectQuery,
  TruncateTableQuery,
  UpdateQuery,
} from "./types/mod.ts";

import { Generator, QueryTypes } from "./types/mod.ts";

export abstract class AbstractClient<
  O extends ClientConfig = ClientConfig,
  E extends ClientEvents = ClientEvents,
> extends Options<O, E> {
  protected _dialect: Dialects;
  protected _name: string;
  protected _state: "CONNECTED" | "CLOSED" = "CLOSED";

  declare protected _client: unknown;
  protected _queryTranslator: QueryTranslator;

  constructor(name: string, config: NonNullable<O> | O) {
    super(config);
    this._name = name.trim();
    this._dialect = config.dialect;
    this._queryTranslator = new QueryTranslator(this._dialect);
  }

  get name(): string {
    return this._name;
  }

  get status(): "CONNECTED" | "CLOSED" {
    return this._state;
  }

  get dialect(): Dialects {
    return this._dialect;
  }

  public async connect(): Promise<void> {
    try {
      if (this._state === "CLOSED") {
        await this._connect();
        // Test if it is actually connected
        this._state = "CONNECTED";
      }
    } catch (e) {
      console.log(e);
      this._state = "CLOSED";
      // Handle all errors
      throw e;
    }
  }

  public async disconnect(): Promise<void> {
    try {
      if (this._state === "CONNECTED") {
        await this._disconnect();
        this._state = "CLOSED";
      }
    } catch (e) {
      // Handle all errors
      throw e;
    }
  }

  public async ping(): Promise<boolean> {
    try {
      await this.connect();
      return this._ping();
    } catch (_e) {
      return false;
    }
  }

  public async query<
    Entity extends Record<string, unknown> = Record<string, unknown>,
  >(sql: QueryOption<Entity>): Promise<QueryResult<Entity>> {
    try {
      await this.connect();
      const start = performance.now(),
        retVal: QueryResult<Entity> = {
          type: sql.type,
          time: 0,
          count: 0,
        };
      // Ensure projection has same column names as columns
      if (sql.type === QueryTypes.INSERT) {
        if ((sql as InsertQuery<Entity>).data.length === 0) {
          throw new Error("No data to insert");
        }
      } else if (sql.type === QueryTypes.UPDATE) {
        if ((sql as UpdateQuery<Entity>).data.length === 0) {
          throw new Error("No data to update");
        }
      }
      // console.log(sql);
      const result = await this._query(sql);
      if (result) {
        retVal.type = result.type;
        retVal.data = result.data;
        retVal.count = result.count || 0;
      }
      retVal.time = performance.now() - start;
      // console.log('Done')
      return retVal;
    } catch (e) {
      // console.log('In Error')
      // Handle all errors
      throw e;
    }
  }

  public async select<
    Entity extends Record<string, unknown> = Record<string, unknown>,
  >(sql: SelectQuery<Entity>): Promise<QueryResult<Entity>> {
    try {
      const retVal = await this.query<Entity>(sql);
      return retVal;
    } catch (e) {
      // Handle all errors
      throw e;
    }
  }

  public async count<
    Entity extends Record<string, unknown> = Record<string, unknown>,
  >(sql: CountQuery<Entity>): Promise<QueryResult<Entity>> {
    try {
      const retVal = await this.query<Entity>(sql);
      return retVal;
    } catch (e) {
      // Handle all errors
      throw e;
    }
  }

  public async insert<
    Entity extends Record<string, unknown> = Record<string, unknown>,
  >(sql: InsertQuery<Entity>): Promise<QueryResult<Entity>> {
    try {
      sql.type = QueryTypes.INSERT;
      // pre-checks
      if (sql.data.length === 0) {
        throw new Error("No data to insert");
      }
      return await this.query<Entity>(sql);
    } catch (e) {
      // Handle all errors
      throw e;
    }
  }

  public async update<
    Entity extends Record<string, unknown> = Record<string, unknown>,
  >(sql: UpdateQuery<Entity>): Promise<QueryResult<Entity>> {
    try {
      sql.type = QueryTypes.UPDATE;
      // Pre-checks
      if (sql.data.length === 0) {
        throw new Error("No data to Update");
      }
      return await this.query<Entity>(sql);
    } catch (e) {
      // Handle all errors
      throw e;
    }
  }

  public async delete<
    Entity extends Record<string, unknown> = Record<string, unknown>,
  >(sql: DeleteQuery<Entity>): Promise<QueryResult<Entity>> {
    try {
      sql.type = QueryTypes.DELETE;
      // Pre-checks
      return await this.query<Entity>(sql);
    } catch (e) {
      // Handle all errors
      throw e;
    }
  }

  public async createSchema(sql: CreateSchemaQuery): Promise<void> {
    sql.type = QueryTypes.CREATE_SCHEMA;
    await this._query(sql);
  }

  public async dropSchema(sql: DropSchemaQuery) {
    sql.type = QueryTypes.DROP_SCHEMA;
    await this._query(sql);
  }

  public async createTable<
    Entity extends Record<string, unknown> = Record<string, unknown>,
  >(sql: CreateTableQuery<Entity>) {
    sql.type = QueryTypes.CREATE_TABLE;
    await this._query(sql);
  }

  public async dropTable(sql: DropTableQuery) {
    sql.type = QueryTypes.DROP_TABLE;
    await this._query(sql);
  }

  // public async updateTableStructure<
  //   Entity extends Record<string, unknown> = Record<string, unknown>,
  // >(sql: CreateTableQuery<Entity>) {
  //   // Ok this is the complicated part, we need to fetch the structure, compare, then generate the alter script.
  // }

  public async truncateTable(sql: TruncateTableQuery) {
    sql.type = QueryTypes.TRUNCATE;
    await this._query(sql);
  }

  public generateQuery<
    Entity extends Record<string, unknown> = Record<string, unknown>,
  >(
    sql: QueryOption<Entity>,
  ): string {
    return this._queryTranslator.translate(sql);
  }

  // DB Generators
  public hasGenerator(name: string): boolean {
    return this._queryTranslator.hasGenerator(name);
  }

  public async isDBGenerator(name: keyof typeof Generator): Promise<boolean> {
    const ret = await this._queryTranslator.getGenerator(name),
      match = /^\$\{(.*)\}$/.exec(String(ret));
    return (match && match.length > 0) || false;
  }

  public async getGenerator(
    name: keyof typeof Generator,
  ): Promise<GeneratorOutput> {
    return await this._queryTranslator.getGenerator(name);
  }

  protected _queryType(sql: string): QueryType {
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

  //#region Abstract Methods
  protected abstract _connect(): Promise<void>;
  protected abstract _disconnect(): Promise<void>;
  protected abstract _ping(): Promise<boolean>;
  protected abstract _query<
    Entity extends Record<string, unknown> = Record<string, unknown>,
  >(
    query: QueryOption<Entity>,
  ): Promise<{ type: QueryType; data?: Entity[]; count?: number }>;
  //#endregion Abstract Methods
}
