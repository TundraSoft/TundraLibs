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
    const nameClean = name.trim().toLowerCase();
    if (DatabaseManager._configs.has(nameClean)) {
      return;
    }
    DatabaseManager._configs.set(nameClean, config);
    await DatabaseManager._initialize(nameClean);
  }

  static async loadConfig(name: string, basePath: string) {
    await Config.load(name, basePath);
    const dbConfigs = Config.get<{ [key: string]: ClientConfig }>(name);
    for (const name in dbConfigs) {
      const config = dbConfigs[name] as ClientConfig;
      DatabaseManager.register(name, config);
    }
  }

  static async get(name: string): Promise<AbstractClient> {
    name = name.trim().toLowerCase();
    if (this._configs.has(name)) {
      if (this._instance.has(name) === false) {
        await this._initialize(name);
      }
      return this._instance.get(name) as AbstractClient;
    } else {
      throw new Error(`Database ${name} is not registered`);
    }
  }

  static has(name: string): boolean {
    return this._configs.has(name.trim().toLowerCase());
  }

  protected static async _initialize(name: string) {
    name = name.trim().toLowerCase();
    const config = this._configs.get(name) as ClientConfig,
      dialect = config.dialect.trim().toUpperCase() as Dialects;
    // Check if the dialect is valid
    let dbConn: AbstractClient;
    switch (dialect) {
      case Dialect.POSTGRES:
        dbConn = new PostgresClient(
          name,
          config as ClientConfig & PostgresConfig,
        );
        break;
      // case Dialect.MYSQL:
      //   DatabaseManager._configs.set(nameClean, config);
      //   dbConn = new PostgresClient(nameClean, config as T & PostgresConfig);
      //   break;
      case Dialect.MARIADB:
        dbConn = new MariaClient(name, config as ClientConfig & MariaConfig);
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
    DatabaseManager._instance.set(name, dbConn);
  }
}
