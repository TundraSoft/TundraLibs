import { Config } from "../config/Config.ts";
import { AbstractClient } from "./AbstractClient.ts";
import { MariaClient, PostgresClient } from "./clients/mod.ts";
import {
  ClientConfig,
  Dialect,
  Dialects,
  MariaConfig,
  PostgresConfig,
} from "./types/mod.ts";

export class DatabaseManager {
  private static _configs: Map<string, ClientConfig> = new Map();
  private static _instance: Map<string, AbstractClient> = new Map();

  static async register<T extends ClientConfig>(name: string, config: T) {
    const nameClean = name.trim().toLowerCase(),
      dialect = config.dialect.trim().toUpperCase() as Dialects;
    if (DatabaseManager._configs.has(nameClean)) {
      return;
    }
    // Check if the dialect is valid
    let dbConn: AbstractClient;
    switch (dialect) {
      case Dialect.POSTGRES:
        DatabaseManager._configs.set(nameClean, config);
        dbConn = new PostgresClient(nameClean, config as T & PostgresConfig);
        break;
      // case Dialect.MYSQL:
      //   DatabaseManager._configs.set(nameClean, config);
      //   dbConn = new PostgresClient(nameClean, config as T & PostgresConfig);
      //   break;
      case Dialect.MARIADB:
        DatabaseManager._configs.set(nameClean, config);
        dbConn = new MariaClient(nameClean, config as T & MariaConfig);
        break;
      // case Dialect.SQLITE:
      //   DatabaseManager._configs.set(nameClean, config);
      //   dbConn = new PostgresClient(nameClean, config as T & PostgresConfig);
      //   break;
      // case Dialect.MONGODB:
      //   DatabaseManager._configs.set(nameClean, config);
      //   dbConn = new PostgresClient(nameClean, config as T & PostgresConfig);
      //   break;
      default:
        throw new Error(`Unsupported dialect: ${dialect}`);
    }
    // Test connection!
    await dbConn.ping();
    DatabaseManager._instance.set(nameClean, dbConn);
  }

  static async loadConfig(name: string, basePath: string) {
    await Config.load(name, basePath);
    const dbConfigs = Config.get<{ [key: string]: ClientConfig }>(name);
    for (const name in dbConfigs) {
      const config = dbConfigs[name] as ClientConfig;
      DatabaseManager.register(name, config);
    }
  }

  static get(name: string): AbstractClient {
    name = name.trim().toLowerCase();
    if (this._configs.has(name)) {
      return this._instance.get(name) as AbstractClient;
    } else {
      throw new Error(`Database ${name} is not registered`);
    }
  }

  static has(name: string): boolean {
    return this._configs.has(name.trim().toLowerCase());
  }
}
