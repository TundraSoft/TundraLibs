import { type PrivateObject, privateObject, singleton } from '../utils/mod.ts';

import { AbstractClient } from './AbstractClient.ts';
import { MongoClient, PostgresClient, SQLiteClient } from './clients/mod.ts';
import type {
  ClientOptions,
  MongoOptions,
  PostgresOptions,
  SQLiteOptions,
} from './types/mod.ts';

@singleton
class ConnectionManager {
  protected _configs: PrivateObject<Record<string, ClientOptions>> =
    privateObject({});
  protected _instances: Map<string, AbstractClient> = new Map();

  setConnection(name: string, options: ClientOptions) {
    const normalizedName = this.normalizeName(name);
    if (this._configs.has(normalizedName)) {
      return;
    }
    this._configs.set(normalizedName, options);
  }

  getClient(name: string): AbstractClient {
    const normalizedName = this.normalizeName(name);
    if (!this._configs.has(name)) {
      throw new Error(`Client ${name} not found`);
    }
    const config = this._configs.get(name);
    let client: AbstractClient;
    switch (config.dialect) {
      case 'POSTGRES':
        client = new PostgresClient(
          name,
          config as PostgresOptions,
        ) as unknown as AbstractClient;
        break;
      // case 'MARIA':
      // case 'MYSQL':
      //   break;
      case 'SQLITE':
        client = new SQLiteClient(
          name,
          config as SQLiteOptions,
        ) as unknown as AbstractClient;
        break;
      case 'MONGO':
        client = new MongoClient(
          name,
          config as MongoOptions,
        ) as unknown as AbstractClient;
        break;
      default:
        throw new Error(`Unsupported dialect ${config.dialect}`);
    }
    this._instances.set(normalizedName, client);
    return this._instances.get(normalizedName) as AbstractClient;
  }

  private normalizeName(name: string): string {
    return name.trim().toLowerCase();
  }
}

export const DAM = new ConnectionManager();
