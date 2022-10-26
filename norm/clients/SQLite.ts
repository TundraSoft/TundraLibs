import { AbstractClient } from "../AbstractClient.ts";
import type {
  // CountQueryOptions,
  // CreateTableOptions,
  // DeleteQueryOptions,
  // Filters,
  // InsertQueryOptions,
  // QueryOptions,
  QueryType,
  // SchemaDefinition,
  // SelectQueryOptions,
  SQLiteConfig,
  // UpdateQueryOptions,
} from "../types/mod.ts";

import { SQLiteClient } from "../../dependencies.ts";

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
    const result = await this._client?.queryEntries(sql);
    if (result) {
      return result as unknown as T[];
    }
  }

  // public async _getTableDefinition(
  //   table: string,
  //   schema?: string,
  // ): Promise<SchemaDefinition> {
  //   //TODO Implement
  //   return await {
  //     table: table,
  //     schema: schema,
  //     columns: {},
  //   };
  // }
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
