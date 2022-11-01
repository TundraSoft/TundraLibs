import { AbstractClient } from "../AbstractClient.ts";
import { MySQLConfig } from "../types/mod.ts";
import { MySQL } from "../../dependencies.ts";
import type { MySQLClientConfig } from "../../dependencies.ts";

export class MySQLClient<O extends MySQLConfig>
  extends AbstractClient<O> {

  protected _valueEscape = "'";
  protected _tableEscape = '"';
  
  declare protected _client: MySQL;

  constructor(config: NonNullable<O> | O) {
    const defaults: Partial<MySQLConfig> = {
      // appName: 'NORM', 
      poolSize: 10, 
      idleTimeout: 5, 
      connectionTimeout: 30, 
    }
    super({ ...defaults, ...config });
  }

  public async _init(): Promise<void> {
    if (this._state === "CLOSED") {

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
      this._state = "OPEN";
      await this._getVersion();
    }
  }

  public async _close(): Promise<void> {
    if(this._state === "OPEN") {
      await this._client.close();
    }
  }


  //#region AbstractClient Implementation
  protected async _execute(qry: string, params?: unknown[] | undefined): Promise<void> {
    await this._client.execute(qry, params);
  }
  
  protected async _query<Entity>(qry: string, _params?: Record<string, unknown>): Promise<Entity[]> {
    const result = await this._client.execute(qry);
    return result.rows as Entity[]
  }

  protected async _getVersion(): Promise<void> {
    const result = await this._query<{ version: string }>("SELECT VERSION() AS version;");
    console.log(result);
    this._version = result[0].version;
  }
  //#endregion AbstractClient Implementation
}


// // Connect options
// /** Database hostname */
// hostname?: string;
// /** Database username */
// username?: string;
// /** Database password */
// password?: string;
// /** Database port */
// port?: number;
// /** Database name */
// db?: string;
// /** Whether to display packet debugging information */
// debug?: boolean;
// /** Connection read timeout (default: 30 seconds) */
// timeout?: number;
// /** Connection pool size (default: 1) */
// poolSize?: number;
// /** Connection pool idle timeout in microseconds (default: 4 hours) */
// idleTimeout?: number;
// /** charset */
// charset?: string;
// tls: {
//   enabled: true,
//   caCertificates: [
//     await Deno.readTextFile("./certs/ca.crt")
//   ]
// }

const m = new MySQLClient({
  name: 'MySQL',
  dialect: 'MYSQL', 
  host: "localhost",
  port: 50796, 
  userName: "root",
  password: "mysqlpw",
  database: 'mysql', 
  poolSize: 10, 
});

const b = await m.init();
console.log(m.Version)