import { AbstractClient } from "../AbstractClient_Bkp.ts";
import { PostgresConfig, SelectQueryOptions } from "../types/mod.ts";
import { PGClient, PGPool } from "../../dependencies.ts";
import type { PGClientOptions } from "../../dependencies.ts";

export class PostgresClient<O extends PostgresConfig>
  extends AbstractClient<O> {

  protected _valueEscape = "'";
  protected _tableEscape = '"';
  
  declare protected _client: PGPool;

  constructor(config: NonNullable<O> | O) {
    const defaults: Partial<PostgresConfig> = {
      // appName: 'NORM', 
      poolSize: 10, 
      idleTimeout: 5, 
      connectionTimeout: 30, 
    }
    super({ ...defaults, ...config });
  }

  public async _init(): Promise<void> {
    if (this._state === "CLOSED") {

      const pgProps: PGClientOptions = {
          applicationName: this._name, 
          hostname: this._options.host, 
          port: this._options.port, 
          user: this._options.userName,
          password: this._options.password,
          database: this._options.database,
        }, 
        poolSize = this._getOption('poolSize') || 10;
      this._client = new PGPool(pgProps, poolSize, true);
      // Hack to test the connection, if there is something wrong it will throw immediately
      await (await this._client.connect()).release();
      this._state = "OPEN";
      await this._getVersion();
    }
  }

  public async _close(): Promise<void> {
    if(this._state === "OPEN") {
      await this._client.end();
    }
  }


  //#region AbstractClient Implementation
  protected async _execute(qry: string, params?: unknown[] | undefined): Promise<void> {
    const conn = await this._client.connect();
    await conn.queryObject({
      args: params,
      text: qry,
    });
    await conn.release();
  }
  
  protected async _query<Entity>(qry: string, params?: Record<string, unknown>): Promise<Entity[]> {
    const conn = await this._client.connect(), 
      result = await conn.queryObject<Entity>({
        args: params,
        text: qry,
      });
    await conn.release();
    return result.rows;
  }

  protected async _getVersion(): Promise<void> {
    const result = await this._query<{ version: string }>("SHOW server_version");
    this._version = result[0].version;
  }
  //#endregion AbstractClient Implementation
}


const pg = new PostgresClient({
  dialect: "POSTGRES", 
  name: "test",
  host: 'localhost',
  port: 50797, 
  userName: 'postgres',
  password: 'postgrespw', 
  database: 'postgres',
  poolSize: 10, 
  idleTimeout: 5,
  connectionTimeout: 30,
});

await pg.init();
