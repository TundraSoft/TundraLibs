import { AbstractClient } from "../AbstractClient.ts"
import { pgsqlTables as sqlTables, pgsql as sql, pgsqlQuote as sqlQuote } from "../../dependencies.ts"

class PGClient extends AbstractClient {
  constructor() {
    super();
  }

  protected async _connect(): Promise<boolean> {
    return true;
  }
  protected async _close(): Promise<boolean> {
    return true;
  }
  protected async _version(): Promise<string> {
    const qry = 'SHOW server_version;';
    // Execute and return
    return '1';
  }
  protected async _execute(sql: string,...args: unknown[]): Promise<void> {
    return;
  }
}
