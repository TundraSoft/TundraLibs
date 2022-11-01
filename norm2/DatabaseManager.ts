import { Config } from "../config/Config.ts";
import { AbstractClient } from "./AbstractClient.ts";
import { PostgresClient } from "./clients/PostgresClient.ts";
import { ClientConfig } from "./types/ClientConfig.ts";
import type { Dialects, PostgresConfig } from './types/mod.ts';

export class DatabaseManager {
  private static _configs: Map<string, ClientConfig> = new Map();
  private static _instance: Map<string, AbstractClient> = new Map();

  static register<T extends ClientConfig>(config: T) {
    const name = config.name.trim().toLowerCase(), 
      dialect = config.dialect.trim().toUpperCase() as Dialects;
    if (DatabaseManager._configs.has(name)) {
      return;
    }
    // Check if the dialect is valid
    switch(dialect) {
      case 'POSTGRES':
        DatabaseManager._configs.set(name, config);
        DatabaseManager._instance.set(name, new PostgresClient(config as T & PostgresConfig));
        break;
      default:
        throw new Error(`Invalid dialect: ${dialect}`);
    }
  }

  static async loadConfig(name: string, basePath: string) {
    await Config.load(name, basePath);
    const dbConfigs = Config.get<{ [key: string]: ClientConfig }>(name);
    for (const name in dbConfigs) {
      const config = dbConfigs[name] as ClientConfig;
      DatabaseManager.register(config);
    }
  }

  // static async test(name?: string): Promise<boolean> {
  //   return true;
  // }

  static get(name: string): AbstractClient {
    name = name.trim().toLowerCase();
    if(this._configs.has(name)) {
      return this._instance.get(name) as AbstractClient;
    } else {
      throw new Error(`Database ${name} is not registered`);
    }
  }
}