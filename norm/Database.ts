import { AbstractClient } from "./AbstractClient.ts";
import { SQLite } from "./clients/SQLite.ts";
import { Postgres } from "./clients/Postgres.ts";
import type { ClientConfig, ModelDefinition } from "./types/mod.ts";
import { ConfigNotFound } from "./Errors.ts";

import { Config } from "../config/mod.ts";
import { Model } from "./Model.ts";

export type ModelGeneratorOptions = {
  modelPath: string; // Where are the models stored?
  connection?: string; // Generate definitions for a specific connection
  schema?: string; // Generate definitions for a specific schema
  dropCreate: boolean; // Drop and create the tables
};

export class Database {
  protected static _clients: Map<string, AbstractClient> = new Map();
  protected static _modelIndex: Map<string, string> = new Map();
  protected static _modelInfo: {
    [name: string]: {
      connection: string;
      schema?: string;
      table?: string;
      definition: ModelDefinition;
      model: Model;
    };
  } = {};

  public static async init(
    config = "Database",
    configPath?: string,
  ): Promise<void> {
    await Config.load(config, configPath);
    const dbConfigs = Config.get<{ [key: string]: ClientConfig }>(config);
    for (const name in dbConfigs) {
      const config = dbConfigs[name] as ClientConfig;
      Database.load(name, config);
    }
  }

  public static async test(name?: string): Promise<boolean> {
    if (name) {
      name = name.toLowerCase().trim();
      if (!Database._clients.has(name)) {
        throw new ConfigNotFound(name);
      }
      return await Database._clients.get(name)!.test();
    } else {
      for (const client of Database._clients.values()) {
        if (!client.test()) {
          return false;
        }
      }
      return true;
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
    switch (config.dialect.toUpperCase()) {
      case "SQLITE":
        Database._clients.set(name, new SQLite(name, config));
        break;
      case "POSTGRES":
        Database._clients.set(name, new Postgres(name, config));
        break;
    }
  }
}
