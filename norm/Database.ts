import { AbstractClient } from "./AbstractClient.ts";
import { SQLite } from "./clients/SQLite.ts";
import { Postgres } from "./clients/Postgres.ts";
import type { ClientConfig } from "./types/mod.ts";
import { ConfigNotFound } from "./Errors.ts";

import { Config } from "../config/mod.ts";

export class Database {
  protected static _clients: Map<string, AbstractClient> = new Map();

  public static async init(): Promise<void> {
    await Config.load("database");
    const dbConfigs = Config.get<{ [key: string]: ClientConfig }>("database");
    for (const name in dbConfigs) {
      const config = dbConfigs[name] as ClientConfig;
      Database.load(name, config);
    }
  }

  public static get(name: string): AbstractClient {
    name = name.toLowerCase().trim();
    if (!Database._clients.has(name)) {
      throw new ConfigNotFound(name);
    }
    return Database._clients.get(name) as AbstractClient;
  }

  public static load<T extends ClientConfig>(name: string, config: T): void {
    name = name.toLowerCase().trim();
    // Initialize a database connection
    switch (config.dialect) {
      case "SQLITE":
        Database._clients.set(name, new SQLite(name, config));
        break;
      case "POSTGRES":
        Database._clients.set(name, new Postgres(name, config));
        break;
    }
  }
}
