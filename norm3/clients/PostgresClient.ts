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
  >(query: QueryOption<Entity>): Promise<Entity[] | undefined> {
    try {
      // first get the client
      const client = await this._client.connect(),
        sql = this._queryTranslator.translate(query);
      let result: Entity[] | undefined;
      // basis the query type, we run
      switch (query.type) {
        case QueryTypes.RAW:
          result = (await client.queryObject<Entity>(sql)).rows;
          break;
        case QueryTypes.SELECT:
          result = (await client.queryObject<Entity>(sql)).rows;
          break;
        // case QueryTypes.COUNT:
        //   result = (await client.queryObject<{count: number}>(query.sql)).rows;
        //   break;
        case QueryTypes.INSERT:
          result = (await client.queryObject<Entity>(sql)).rows;
          break;
        case QueryTypes.UPDATE:
          result = (await client.queryObject<Entity>(sql)).rows;
          break;
        case QueryTypes.DELETE:
          await client.queryObject<Entity>(sql);
          break;
      }
      return result;
    } catch (error) {
      throw error;
    }
  }

  protected async _count<
    Entity extends Record<string, unknown> = Record<string, unknown>,
  >(query: SelectQuery<Entity> | CountQuery<Entity>): Promise<number> {
    try {
      // first get the client
      query.type = QueryTypes.COUNT;
      const client = await this._client.connect(),
        sql = this._queryTranslator.count(query as CountQuery<Entity>);
      const result =
        (await client.queryObject<{ TotalRows: number }>(sql)).rows[0];
      return result.TotalRows;
    } catch (error) {
      throw error;
    }
  }
}

const workingConfig = {
    dialect: "POSTGRES",
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

const client = new PostgresClient("test", invalidDBConfig);

// const client = new PostgresClient("test", {
//   dialect: "POSTGRES",
//   host: 'localhost',
//   port: 54842,
//   userName: 'postgres',
//   password: 'postgrespw',
//   database: 'postgres',
// });
// await client.connect();
await client.ping();
// await client.query('SELECT 1+1 AS result');
// console.log('OK')
