import { AbstractClient } from "../AbstractClient.ts";
import { ConnectionOptions } from "../types.ts";
import {
  pgsql as sql,
  pgsqlQuote as sqlQuote,
  pgsqlTables as sqlTables,
  postgres,
} from "../../dependencies.ts";

class PostgresClient extends AbstractClient {
  protected _client: postgres;
  constructor(options: ConnectionOptions) {
    super(options);
    this._client = new postgres({
      user: "anq_admin",
      password: "",
      database: "cal_prod",
      port: 5432,
      hostname: "anq-dev.postgres.database.azure.com",
      tls: {
        enabled: true,
      },
    });
  }

  protected async _connect(): Promise<void> {
    try {
      await this._client.connect();
    } catch (e) {
    }
  }

  protected async _close(): Promise<void> {
    this._client.end();
  }

  protected async _version(): Promise<string> {
    const qry = "SHOW server_version;";
    try {
      await this.connect();
      const result = await (await this._client.queryArray(qry)).rows[0][0];
      console.log(result);
    } catch (e) {
    }
    // Execute and return
    return "1";
  }

  protected async _execute(sql: string, ...args: unknown[]): Promise<void> {
    return;
  }

  protected async _query(){};

  protected async _parseQuery() {};
}

// const a = new PostgresClient();
// await a.connect();
// await a.version();
