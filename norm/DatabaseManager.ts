import { Config } from '../config/Config.ts';
import { AbstractClient } from './AbstractClient.ts';
import { MariaClient, PostgresClient } from './clients/mod.ts';
import {
  ClientConfig,
  Dialect,
  Dialects,
  MariaConfig,
  PostgresConfig,
} from './types/mod.ts';

import {
  CommunicationError,
  ConnectionNotFound,
  DialectNotSupported,
} from './errors/mod.ts';
export class DatabaseManager {
  private static _configs: Map<string, ClientConfig> = new Map();
  private static _instance: Map<string, AbstractClient> = new Map();
  public static onPoolWait: (name: string, size: number) => void = () => {};
  public static onLongQuery: (name: string, query: unknown, time: number) => void = () => {};

  static register<T extends ClientConfig>(name: string, config: T) {
    const nameClean = name.trim().toLowerCase();
    if (DatabaseManager._configs.has(nameClean)) {
      return;
    }
    DatabaseManager._configs.set(nameClean, config);
    // await DatabaseManager._initialize(nameClean);
  }

  static async loadConfig(name = 'database', basePath = './configs/') {
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
      if (this._instance.has(name) === false) {
        this._initialize(name);
      }
      return DatabaseManager._instance.get(name) as AbstractClient;
    } else {
      throw new ConnectionNotFound(name);
    }
  }

  static has(name: string): boolean {
    return this._configs.has(name.trim().toLowerCase());
  }

  static async test(name?: string) {
    if (name === undefined) {
      for (const name of DatabaseManager._configs.keys()) {
        await DatabaseManager.test(name);
      }
      return;
    }
    name = name.trim().toLowerCase();
    if (DatabaseManager.has(name as string)) {
      const db = await DatabaseManager.get(name as string);
      if (await db.ping() === false) {
        throw new CommunicationError(db.name, db.dialect);
      }
    }
  }

  protected static _initialize(name: string) {
    name = name.trim().toLowerCase();
    const config = DatabaseManager._configs.get(name) as ClientConfig,
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
        throw new DialectNotSupported(name, dialect);
    }
    // Test connection!
    // if (await dbConn.ping() === false) {
    //   throw new CommunicationError(name, dialect);
    // }
    dbConn.on('poolWait', DatabaseManager.onPoolWait);
    dbConn.on('longQuery', DatabaseManager.onLongQuery);
    DatabaseManager._instance.set(name, dbConn);
  }
}
