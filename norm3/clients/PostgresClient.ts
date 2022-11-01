import { AbstractClient } from "../AbstractClient.ts";
import { Dialect, QueryTypes } from "../types/mod.ts";
import type {
  CountQuery,
  PostgresConfig,
  QueryOption,
  SelectQuery,
} from "../types/mod.ts";
import { PGPool } from "../../dependencies.ts";
import type { PGClientOptions } from "../../dependencies.ts";

export class PostgresClient<O extends PostgresConfig = PostgresConfig>
  extends AbstractClient<O> {
  declare protected _client: PGPool;

  constructor(name: string, options: NonNullable<O> | O) {
    const defaults: Partial<PostgresConfig> = {
      dialect: "POSTGRES",
      port: 5432,
      poolSize: 1, // Lets default to 1
      idleTimeout: 5, // 5 seconds
      connectionTimeout: 30, // 30 seconds
    };
    super(name, { ...defaults, ...options });
  }

  protected async _connect(): Promise<void> {
    const pgConfig: PGClientOptions = {
        applicationName: this._name,
        hostname: this._options.host,
        port: this._options.port,
        user: this._options.userName,
        password: this._options.password,
        database: this._options.database,
      },
      poolSize = this._getOption("poolSize") || 1;
    this._client = new PGPool(pgConfig, poolSize, true);
    // Hack to test the connection, if there is something wrong it will throw immediately
    await (await this._client.connect()).release();
  }

  protected async _disconnect(): Promise<void> {
    await this._client.end();
  }

  protected async _ping(): Promise<boolean> {
    const sql = `SELECT 1+1 AS result`,
      client = await this._client.connect(),
      { result } = (await client.queryObject<{ result: number }>(sql)).rows[0];
    await client.release();
    return result === 2;
  }

  protected async _query<
    Entity extends Record<string, unknown> = Record<string, unknown>,
  >(query: QueryOption<Entity>): Promise<{ data?: Entity[], count?: number }> {
    try {
      // first get the client
      const client = await this._client.connect(),
        sql = this._queryTranslator.translate(query), 
        countQuery = this._queryTranslator.translate({...query as CountQuery<Entity>, type: QueryTypes.COUNT}),
        retVal: {data?: Entity[], count?: number} = {};
      let actualRows = -1;
      // Get count output if and only if it is select with pagination or if it is a delete query
      if ((query.type === QueryTypes.SELECT && (query as SelectQuery).pagination) || query.type === QueryTypes.DELETE) {
        const result = (await client.queryObject<{ TotalRows: number }>(countQuery)).rows[0];
        actualRows = result.TotalRows;
      }
      // Run the actual query
      // console.log(sql);
      const result = (await client.queryObject<Entity>(sql));
      // console.log(result);
      retVal.data = result.rows;
      retVal.count = result.rowCount;
      if (actualRows > -1) {
        retVal.count = actualRows
      }

      client.release();
      return retVal;
      
      // First get count if it is select with pagination or delete
      // if ((query.type === QueryTypes.SELECT && (query as SelectQuery).pagination) || query.type === QueryTypes.DELETE) {
      //   const countOption: CountQuery<Entity> = {
      //     type: QueryTypes.COUNT,
      //     table: query.table,
      //     schema: query.schema,
      //     columns: query.columns,
      //     filters: (query as SelectQuery<Entity>).filters,
      //   };
      //   const countOp = await this._query(countOption);
      //   retVal.count = countOp.count;
      // }
      // const result = await 
      // basis the query type, we run
      // switch (query.type) {
      //   case QueryTypes.RAW:
      //     const op = (await client.queryObject<Entity>(sql));
      //     retVal.data = op.rows;
      //     retVal.count = op.rowCount;
      //     break;
      //   case QueryTypes.SELECT:
      //     result = (await client.queryObject<Entity>(sql)).rows;
      //     break;
      //   case QueryTypes.COUNT:
      //     result = (await client.queryObject<{TotalRows: number}>(sql)).rows;
      //     break;
      //   case QueryTypes.INSERT:
      //     result = (await client.queryObject<Entity>(sql)).rows;
      //     break;
      //   case QueryTypes.UPDATE:
      //     result = (await client.queryObject<Entity>(sql)).rows;
      //     break;
      //   case QueryTypes.DELETE:
      //     await client.queryObject<Entity>(sql);
      //     break;
      // }
      // return retVal;
    } catch (error) {
      console.log('Here');
      throw error;
    }
  }

  // protected async _count<
  //   Entity extends Record<string, unknown> = Record<string, unknown>,
  // >(query: SelectQuery<Entity> | CountQuery<Entity>): Promise<number> {
  //   try {
  //     // first get the client
  //     query.type = QueryTypes.COUNT;
  //     const client = await this._client.connect(),
  //       sql = this._queryTranslator.count(query as CountQuery<Entity>);
  //     const result =
  //       (await client.queryObject<{ TotalRows: number }>(sql)).rows[0];
  //     return result.TotalRows;
  //   } catch (error) {
  //     throw error;
  //   }
  // }
}

const workingConfig = {
    dialect: Dialect.POSTGRES,
    host: "localhost",
    port: 54842,
    userName: "postgres",
    password: "postgrespw",
    database: "postgres",
  },
  invalidDBConfig = {
    dialect: Dialect.POSTGRES,
    host: "localhost",
    port: 54842,
    userName: "postgres",
    password: "postgrespw",
    database: "postgrfes",
  },
  invalidUserConfig = {
    dialect: "POSTGRES",
    host: "localhost",
    port: 54842,
    userName: "postgres1",
    password: "postgrespw",
    database: "postgres",
  },
  invalidUserConfig2 = {
    dialect: "POSTGRES",
    host: "localhost",
    port: 54842,
    userName: "postgres",
    password: "postgrespw1",
    database: "postgres",
  },
  invalidHostConfig = {
    dialect: "POSTGRES",
    host: "google.com",
    port: 54842,
    userName: "postgres",
    password: "postgrespw1",
    database: "postgres",
  },
  invalidPortConfig = {
    dialect: "POSTGRES",
    host: "localhost",
    port: 54841,
    userName: "postgres",
    password: "postgrespw1",
    database: "postgres",
  };

const client = new PostgresClient("test", workingConfig);
console.log(await client.ping());
const res = await client.query({
  type: QueryTypes.RAW,
  sql: "CREATE TABLE IF NOT EXISTS test (id INT NOT NULL, name VARCHAR(255) NOT NULL, PRIMARY KEY (id))",
});

console.log(res);

const ins = await client.query({
  type: QueryTypes.INSERT,
  table: "test",
  schema: "public",
  columns: {
    id: "id",
    name: "name", 
  }, 
  data: [{
    id: 1,
    name: "test1",
  }, {
    id: 2,
    name: "test2",
  }], 
  project: ["name"]
})

console.log(ins.data);
const resDel = await client.query({
  type: QueryTypes.RAW,
  sql: "DROP TABLE IF EXISTS test",
});

console.log(resDel);
// const client = new PostgresClient("test", {
//   dialect: "POSTGRES",
//   host: 'localhost',
//   port: 54842,
//   userName: 'postgres',
//   password: 'postgrespw',
//   database: 'postgres',
// });
// await client.connect();

// await client.query('SELECT 1+1 AS result');
// console.log('OK')
