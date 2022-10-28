import { Options } from '../options/mod.ts';

import type { ClientEvents, Dialects, QueryType, QueryResult, InsertQueryOptions, UpdateQueryOptions, SelectQueryOptions, DeleteQueryOptions, SelectQueryResult, Filters } from './types/mod.ts'

export type ClientConfig = {
  dialect: Dialects;
}

//#region Query Types
// export type TableName = string | { schema: string; table: string; };

//#endregion Query Types

export abstract class AbstractClient<O extends ClientConfig = ClientConfig, E extends ClientEvents = ClientEvents> extends Options<O, E> {
  protected _valueQuote = "'";
  protected _columnQuote = '"';
  
  constructor(config: NonNullable<O>) {
    super(config);
  }

  public async open() {
    try {
      await this._open();
      // this.emit("connect", "dsf");
    } catch (e) {
      // Throw error
      throw new ConnectionError(e.message, this.name, this.dialect);
    }
  }

  public async close() {
    try {
      await this._close();
    } catch (e) {
      throw new ConnectionError(e.message, this.name, this.dialect);
    }
  }

  public async test() {
    try {
      await this.query(this._testQuery);
      return true;
    } catch (_) {
      return false;
    }
  }

  public async version() {
  }

  //#region Query
  public async query<T = Record<string, unknown>>(query: string, params?: Record<string, unknown>) {
    const start = performance.now(),
      result: QueryResult<T> = {
        type: this._getQueryType(query),
        sql: query.trim().replaceAll(/\r\n|\n|\r/g, " ").replaceAll(
          /\s+|\t/g,
          " ",
        ),
        time: 0,
        count: 0,
        data: [],
      };
    await this.open();
    try {
      // console.log(sql);
      // Replace params
      // if (params) {
      //   for (const [key, value] of Object.entries(params)) {
      //     result.sql = result.sql.replaceAll(`:${key}`, this._escape(value));
      //   }
      // }
      // if (params) {
      //   const paramsArray = Array.isArray(params) ? params : [params];
      //   for (const param of paramsArray) {
      //     const index = query.indexOf("?");
      //     if (index > -1) {
      //       query = query.replace("?", this._escape(param));
      //     }
      //   }
      // }
      const op = await this._query<T>(query, params);
      if (op && op.length > 0) {
        result.data = op;
        result.count = op.length;
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

  public async insert<T = Record<string, unknown>>(options: InsertQueryOptions<T>) {
  }

  public async select<T = Record<string, unknown>>(options: SelectQueryOptions<T>) {
  }

  public async update<T = Record<string, unknown>>(options: UpdateQueryOptions<T>) {
  }

  public async delete<T = Record<string, unknown>>(options: DeleteQueryOptions<T>) {
  }

  public async count<T = Record<string, unknown>>(options: SelectQueryOptions<T>) {
  }

  public async truncate<T>(table: string, schema?: string) {
  }
  //#endregion Query

  //#region Schema
  // public async createDatabase(name: string) {
  // }

  // public async dropDatabase(name: string) {
  // }

  // public async createTable(table: string, schema: unknown) {
  // }

  // public async dropTable(table: string) {
  // }

  // public async alterTable(table: string, schema: unknown) {
  // }

  // public async createIndex<T>(table: string, schema: T) {
  // }

  // public async dropIndex<T>(table: string, schema: T) {
  // }

  // public async createColumn<T>(table: string, schema: T) {
  // }

  // public async dropColumn<T>(table: string, schema: T) {
  // }

  // public async alterColumn<T>(table: string, schema: T) {
  // }

  // public async createForeignKey<T>(table: string, schema: T) {
  // }

  // public async dropForeignKey<T>(table: string, schema: T) {
  // }

  // public async createPrimaryKey<T>(table: string, schema: T) {
  // }

  // public async dropPrimaryKey<T>(table: string, schema: T) {
  // }

  // public async createUnique<T>(table: string, schema: T) {
  // }

  // public async dropUnique<T>(table: string, schema: T) {
  // }
  //#endregion Schema

  //#region Protected Functions
  protected _getQueryType(sql: string): QueryType {
    const regEx = new RegExp(
        /^(CREATE|ALTER|DROP|TRUNCATE|SHOW|SELECT\s*COUNT|SELECT|INSERT|UPDATE|DELETE|DESC|DESCRIBE|EXPLAIN|BEGIN|COMMIT|ROLLBACK)?/i,
      ),
      match = sql.match(regEx);
    let qt: QueryType = "UNKNOWN";
    if (match && match.length > 0) {
      qt = match[0].trim().toUpperCase() as QueryType;
    }
    return qt;
  }

  protected _parseFilters<T>(filters: Filters<T>) {
  }

  protected _escape(value: unknown) {
    
  }
  //#endregion Protected Functions

  //#region Abstract Functions
  protected abstract _open(): Promise<void>;
  protected abstract _close(): Promise<void>;
  protected abstract _query<T = Record<string, unknown>>(query: string, params?: unknown): Promise<Array<T>>;
  abstract _generateInsertQuery<T>(options: InsertQueryOptions<T>): string;
  abstract _generateSelectQuery<T>(options: SelectQueryOptions<T>): string;
  abstract _generateUpdateQuery<T>(options: UpdateQueryOptions<T>): string;
  abstract _generateDeleteQuery<T>(options: DeleteQueryOptions<T>): string;
  abstract _generateCountQuery<T>(options: SelectQueryOptions<T>): string;
  abstract _generateTruncateQuery<T>(table: string, schema?: string): string;
  //#endregion Abstract Functions
}