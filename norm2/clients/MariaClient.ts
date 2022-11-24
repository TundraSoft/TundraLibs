import { AbstractClient } from "../AbstractClient.ts";
import { QueryTypes } from "../types/mod.ts";
import type {
  CountQuery,
  MariaConfig,
  QueryOption,
  QueryType,
  SelectQuery,
} from "../types/mod.ts";
import { MySQL } from "../../dependencies.ts";
import type { MySQLClientConfig } from "../../dependencies.ts";

export class MariaClient<O extends MariaConfig = MariaConfig>
  extends AbstractClient<O> {
  declare protected _client: MySQL;
  constructor(name: string, options: NonNullable<O> | O) {
    const defaults: Partial<MariaConfig> = {
      dialect: "MARIADB",
      port: 3306,
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
      result = (await this._client.execute(sql)).rows;
    return (result && result.length > 0 && result[0].result === 2)
      ? true
      : false;
  }

  protected async _query<
    Entity extends Record<string, unknown> = Record<string, unknown>,
  >(
    query: QueryOption<Entity>,
  ): Promise<{ type: QueryType; data?: Entity[]; count?: number }> {
    try {
      const sql = this._queryTranslator.translate(query),
        countQuery = this._queryTranslator.translate({
          ...query as CountQuery<Entity>,
          type: QueryTypes.COUNT,
        }),
        retVal: { type: QueryType; data?: Entity[]; count?: number } = {
          type: this._queryType(sql),
        };
      let actualRows = -1;

      // Get count output if and only if it is select with pagination or if it is a delete query
      if (
        (query.type === QueryTypes.SELECT &&
          (query as SelectQuery).pagination) || query.type === QueryTypes.DELETE
      ) {
        const result = (await this._client.query(countQuery)).rows[0];
        actualRows = result.TotalRows;
      }

      // Run the actual query
      // console.log(sql);
      const result = (await this._client.execute(sql));
      // console.log(result);
      retVal.data = result.rows;
      retVal.count = (result.rows) ? result.rows.length : result.affectedRows;
      if (actualRows > -1) {
        retVal.count = actualRows;
      }

      return retVal;
    } catch (error) {
      console.log("Here");
      throw error;
    }
  }
}

// const workingConfig = {
//     dialect: Dialect.MARIADB,
//     host: "localhost",
//     port: 54840,
//     userName: "root",
//     password: "mariapw",
//     database: "mysql",
//   },
//   invalidDBConfig = {
//     dialect: "POSTGRES",
//     host: "localhost",
//     port: 54841,
//     userName: "postgres",
//     password: "postgrespw",
//     database: "postgrfes",
//   },
//   invalidUserConfig = {
//     dialect: "POSTGRES",
//     host: "localhost",
//     port: 54842,
//     userName: "postgres1",
//     password: "postgrespw",
//     database: "postgres",
//   },
//   invalidUserConfig2 = {
//     dialect: "POSTGRES",
//     host: "localhost",
//     port: 54842,
//     userName: "postgres",
//     password: "postgrespw1",
//     database: "postgres",
//   },
//   invalidHostConfig = {
//     dialect: "POSTGRES",
//     host: "google.com",
//     port: 54842,
//     userName: "postgres",
//     password: "postgrespw1",
//     database: "postgres",
//   },
//   invalidPortConfig = {
//     dialect: "POSTGRES",
//     host: "localhost",
//     port: 54841,
//     userName: "postgres",
//     password: "postgrespw1",
//     database: "postgres",
//   };

// const client = new MariaClient("test", workingConfig as MariaConfig);
// console.log(await client.ping());

// const res = await client.query({
//   type: QueryTypes.RAW,
//   sql:
//     "CREATE TABLE IF NOT EXISTS test (id INT NOT NULL, name VARCHAR(255) NOT NULL, PRIMARY KEY (id))",
// });

// console.log(res);

// const ins = await client.query({
//   type: QueryTypes.INSERT,
//   table: "test",
//   columns: {
//     id: "id",
//     name: "name",
//   },
//   data: [{
//     id: 1,
//     name: "test1",
//   }, {
//     id: 2,
//     name: "test2",
//   }],
//   project: ["name"],
// });

// console.log(ins.data);
// const resDel = await client.query({
//   type: QueryTypes.RAW,
//   sql: "DROP TABLE IF EXISTS test",
// });

// console.log(resDel);

// // console.log(await client.query("SELECT 1+1 AS result"));
// // const client = new PostgresClient("test", {
// //   dialect: "POSTGRES",
// //   host: 'localhost',
// //   port: 54842,
// //   userName: 'postgres',
// //   password: 'postgrespw',
// //   database: 'postgres',
// // });
// // await client.connect();
// console.log(await client.ping() === true);
// // await client.query('SELECT 1+1 AS result');
// // console.log('OK')
