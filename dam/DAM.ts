import { AbstractClient } from './Client.ts';
import {
  MariaClient,
  MongoClient,
  PostgresClient,
  SQLiteClient,
} from './clients/mod.ts';
import type {
  ClientOptions,
  MariaOptions,
  MongoOptions,
  PostgresOptions,
  SQLiteOptions,
} from './types/mod.ts';
import { DAMError } from './errors/mod.ts';
import { singleton } from '../utils/mod.ts';

/**
 * Manages the connections and configurations for clients in the DAM (Data Access Manager).
 */
@singleton
class ConnectionManager {
  protected _configs: Map<string, ClientOptions> = new Map();
  private _clients: Map<string, AbstractClient> = new Map();

  /**
   * Adds a configuration for a client with the specified name.
   *
   * @param name - The name of the client configuration.
   * @param config - The configuration options for the client.
   * @throws {DAMConfigError} If the dialect is invalid or the configuration already exists.
   */
  public addConfig<T extends ClientOptions>(name: string, config: T) {
    name = name.trim().toLowerCase();
    if (
      !config.dialect ||
      !['POSTGRES', 'MONGO', 'SQLITE', 'MARIA'].includes(config.dialect)
    ) {
      throw new DAMError(
        `Unsupported dialect ${config.dialect} passed for ${name}`,
        {
          dialect: config.dialect,
          name: name,
          item: 'name',
        },
      );
    }
    if (this._configs.has(name) && this._configs.get(name) !== config) {
      throw new DAMError(`Config by the name ${name} already exists`, {
        dialect: config.dialect,
        name: name,
        item: 'name',
      });
    } else {
      this._configs.set(name, config);
    }
  }

  /**
   * Checks if a configuration with the specified name exists.
   *
   * @param name - The name of the configuration to check.
   * @returns `true` if a configuration with the specified name exists, `false` otherwise.
   */
  public hasConfig(name: string): boolean {
    name = name.trim().toLowerCase();
    return this._configs.has(name);
  }

  /**
   * Retrieves a client instance based on the provided name.
   *
   * @param name - The name of the client.
   * @returns The client instance.
   * @throws DAMConfigError if the config for the provided name is not found.
   */
  public getClient<T extends AbstractClient>(name: string): T {
    name = name.trim().toLowerCase();
    if (!this._configs.has(name)) {
      throw new DAMError(`Config by the name ${name} is not defined.`, {
        dialect: '',
        name: name,
      });
    }
    // Return instance if already exists!
    if (this._clients.has(name) === false) {
      const config = this._configs.get(name) as ClientOptions;
      switch (config.dialect) {
        case 'POSTGRES':
          this._clients.set(
            name,
            new PostgresClient(
              name,
              config as PostgresOptions,
            ) as unknown as AbstractClient,
          );
          break;
        case 'MONGO':
          this._clients.set(
            name,
            new MongoClient(
              name,
              config as MongoOptions,
            ) as unknown as AbstractClient,
          );
          break;
        case 'SQLITE':
          this._clients.set(
            name,
            new SQLiteClient(
              name,
              config as SQLiteOptions,
            ) as unknown as AbstractClient,
          );
          break;
        case 'MARIA':
          this._clients.set(
            name,
            new MariaClient(
              name,
              config as MariaOptions,
            ) as unknown as AbstractClient,
          );
          break;
      }
    }
    return this._clients.get(name) as T;
  }
}

export const DAM = new ConnectionManager();
