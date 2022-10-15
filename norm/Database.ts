import { AbstractClient } from "./AbstractClient.ts";
import { SQLite } from "./clients/SQLite.ts";
import { Postgres } from "./clients/Postgres.ts";
import type { ClientConfig, ModelDefinition, ModelType } from "./types/mod.ts";
import { ConfigNotFound } from "./Errors.ts";

import { Config } from "../config/mod.ts";
import { Model } from "./Model.ts";

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
  } = {}

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

  public static registerModel(
    model: Model,
    definition: ModelDefinition,
  ): void {
    const name: string = model.name,
      indexName: string = name.toLowerCase();
    if (Database._modelIndex.has(indexName)) {
      const existingName = Database._modelIndex.get(indexName) as string;
      // Check if the config is same as the one registered
      if (
        model.schema === Database._modelInfo[existingName].schema &&
        model.table === Database._modelInfo[existingName].table
      ) {
        // If same, then just return
        return;
      } else {
        // If different, then throw error
        throw new Error(`Model ${name} already registered`);
      }
    }
    Database._modelIndex.set(indexName, name);
    Database._modelInfo[name] = {
      connection: model.connection,
      schema: model.schema,
      table: model.table,
      definition: definition,
      model: model,
    };
  }

  public static getModel<
    T extends ModelType<S>,
    S extends ModelDefinition = ModelDefinition,
  >(name: string): Model<S, T> {
    name = name.trim().toLowerCase();
    if (Database._modelIndex.has(name)) {
      const modelName = Database._modelIndex.get(name) as string;
      return Database._modelInfo[modelName].model as Model<S, T>;
    } else {
      throw new Error("Unknown model");
    }
  }

  // Check data types
  // public static validateModels(connection?: string, schema?: string): void {
  //   // Validate particular set of models - filtered by connection or schema
  // }

  // public static verifyRelations(connection?: string, schema?: string): void {
  // }

  // protected static _parseDefinition(definition: ModelDefinition): void {
  // }

}
