import { Config } from "../config/mod.ts";
import AbstractClient from "./AbstractClient.ts";
import { PostgresClient } from "./clients/PostgresClient.ts";
import { ClientConfig } from "./types.ts";

export class Database {
  protected static _clients: Map<string, AbstractClient> = new Map();

  public static async getDatabase(name = "default"): Promise<AbstractClient> {
    if (!Database._clients.has(name)) {
      await Config.load("database");
      const config = Config.get<ClientConfig>("database", name) as ClientConfig;
      if (config === undefined) {
        throw new Error(`Database config ${name} not found`);
      } else {
        switch (config.dialect) {
          case "POSTGRES":
            Database._clients.set(name, new PostgresClient(name, config));
            break;
          default:
            throw new Error(`Unknown dialect ${config.dialect}`);
            // break;
        }
      }
    }
    return Database._clients.get(name) as AbstractClient;
  }
}
