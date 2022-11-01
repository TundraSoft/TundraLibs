import { AbstractClient } from "../AbstractClient.ts";
import type { MySQLConfig } from "../types/mod.ts";
import { MySQL } from "../../dependencies.ts";
import type { MySQLClientConfig } from "../../dependencies.ts";

export class MySQLClient<O extends MySQLConfig = MySQLConfig>
  extends AbstractClient<O> {
  declare protected _client: MySQL;
  constructor(name: string, options: NonNullable<O> | O) {
    const defaults: Partial<MySQLConfig> = {
      dialect: "MYSQL",
      port: 5432,
      poolSize: 10,
      idleTimeout: 5,
      connectionTimeout: 30,
    };
    super(name, { ...defaults, ...options });
  }

  protected async _connect(): Promise<void> {
    const mysqlConfig: MySQLClientConfig = {
      hostname: this._options.host,
      port: this._options.port,
      username: this._options.userName,
      password: this._options.password,
      db: this._options.database,
      timeout: this._options.connectionTimeout,
      poolSize: this._options.poolSize,
      idleTimeout: this._options.idleTimeout,
    };
    this._client = await new MySQL().connect(mysqlConfig);
    // Hack to test the connection, if there is something wrong it will throw immediately
    this._state = "CONNECTED";
  }

  protected async _disconnect(): Promise<void> {
    await this._client.close();
  }

  protected async _ping(): Promise<boolean> {
    const sql = `SELECT 1+1 AS result`,
      result = (await this._client.query(sql));
    console.log(result);
    return result === 2;
  }

  protected async _query(
    qry: string,
    params?: unknown[] | undefined,
  ): Promise<unknown> {
    return this._client.query(qry, params);
  }

  protected async _rawQuery(
    qry: string,
    params?: unknown[] | undefined,
  ): Promise<unknown> {
    return this._client.query(qry, params);
  }
}

const workingConfig = {
    dialect: "MYSQL",
    host: "google.com",
    port: 54841,
    userName: "root",
    password: "mysqlpw",
    database: "mysql",
  },
  invalidDBConfig = {
    dialect: "POSTGRES",
    host: "localhost",
    port: 54841,
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

const client = new MySQLClient("test", workingConfig as MySQLConfig);
console.log(await client.query("SELECT 1+1 AS result"));
// const client = new PostgresClient("test", {
//   dialect: "POSTGRES",
//   host: 'localhost',
//   port: 54842,
//   userName: 'postgres',
//   password: 'postgrespw',
//   database: 'postgres',
// });
// await client.connect();
console.log(await client.ping() === true);
// await client.query('SELECT 1+1 AS result');
// console.log('OK')
