import { Config } from "../config/mod.ts";
import AbstractClient from "./AbstractClient.ts";
import { PostgresClient } from "./clients/PostgresClient.ts";
import { ClientConfig, ModelSchema } from "./types.ts";
import { BaseModel } from "./BaseModel.ts";

export class Database {
  protected static _clients: Map<string, AbstractClient> = new Map();
  protected static _models: Map<string, BaseModel<unknown>> = new Map();

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

  public static async spoofGetDatabase(name: string, config: ClientConfig): Promise<AbstractClient> {
    if (!Database._clients.has(name)) {
      switch (config.dialect) {
        case "POSTGRES":
          Database._clients.set(name, await new PostgresClient(name, config));
          break;
        default:
          throw new Error(`Unknown dialect ${config.dialect}`);
          // break;
      }
    }
    console.log(Database._clients);
    return Database._clients.get(name) as AbstractClient;
  }

  public static newModel<T>(name: string, schema: ModelSchema<T>) {
    name = name.trim().toLowerCase();
    if(!Database._models.has(name)) {
      const model = new BaseModel<T>(schema);
      Database._models.set(name, model as BaseModel<unknown>);
    }
    return Database._models.get(name) as BaseModel<T>;
  }

  public static getModel<T>(name: string) {
    name = name.trim().toLowerCase();
    if(Database._models.has(name)) {
      return Database._models.get(name) as BaseModel<T>;
    }
    // return Database._models.get(name) as BaseModel<T>;
  }
}
