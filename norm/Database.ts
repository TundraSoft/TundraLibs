import { AbstractClient } from "./AbstractClient.ts";
import { SQLite } from "./clients/SQLite.ts";
import { Postgres } from "./clients/Postgres.ts";
import type { ClientConfig, ModelDefinition, ModelType } from "./types/mod.ts";
import { ConfigNotFound } from "./Errors.ts";

import { Config } from "../config/mod.ts";
import { Model } from "./Model.ts";
export class Database {
  protected static _clients: Map<string, AbstractClient> = new Map();
  protected static _models: Map<
    string,
    Model<ModelDefinition, ModelType<ModelDefinition>>
  > = new Map();

  public static async init(modelPath?: string): Promise<void> {
    await Config.load("database");
    const dbConfigs = Config.get<{ [key: string]: ClientConfig }>("database");
    for (const name in dbConfigs) {
      const config = dbConfigs[name] as ClientConfig;
      Database.load(name, config);
    }
    if (modelPath) {
      Database._loadModels(modelPath);
    }
  }

  public static getModel<T extends ModelDefinition>(
    name: string,
  ): Model<T, ModelType<T>> {
    if (Database._models.has(name)) {
      return Database._models.get(name) as Model<T, ModelType<T>>;
    }
    throw new Error(`Model ${name} not found`);
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

  protected static async _loadModels(path: string): Promise<void> {
    const models = await import(path);
    Object.entries(models).forEach(([name, model]) => {
      Database._models.set(name, new Model(model as ModelDefinition));
    });
  }
}
