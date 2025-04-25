// deno-lint-ignore-file no-explicit-any
/**
 * Database Access Manager (DAM) module
 * Provides a centralized singleton for managing database engine instances.
 * Supports multiple database engines including Postgres, MariaDB, and SQLite.
 */
import { Singleton } from '@tundralibs/utils';
import {
  AbstractEngine,
  type EngineOptions,
  MariaEngine,
  type MariaEngineOptions,
  PostgresEngine,
  type PostgresEngineOptions,
  SQLiteEngine,
  type SQLiteEngineOptions,
} from './engines/mod.ts';
import {
  DAMDuplicateProfileError,
  DAMProfileNotFoundError,
} from './errors/mod.ts';
/**
 * Singleton class for managing database engine instances.
 * Handles registration, instantiation, and testing of database connections.
 */
@Singleton
class InstanceManagement {
  /**
   * Map storing configuration options for registered database instances.
   * Keys are instance names, values are engine-specific configurations.
   */
  protected _instanceConfig: Map<string, EngineOptions> = new Map();

  /**
   * Map storing instantiated database engine instances.
   * Keys are instance names, values are engine instances.
   */
  protected _instances: Map<string, AbstractEngine<any>> = new Map();

  /**
   * Registers a new database instance configuration.
   * @param name - Unique identifier for the database instance
   * @param config - Engine-specific configuration options
   * @throws Error if an instance with the same name but different config already exists
   */
  register<T extends EngineOptions = EngineOptions>(name: string, config: T) {
    if (this._instanceConfig.has(name)) {
      const c = this._instanceConfig.get(name)!;
      if (c !== config) {
        throw new DAMDuplicateProfileError({
          profileName: name,
        });
      }
      return;
    }
    this._instanceConfig.set(name, config);
  }

  /**
   * Gets an existing database engine instance or creates a new one if it doesn't exist.
   * @param name - The name of the instance to retrieve
   * @returns The database engine instance
   * @throws Error if the instance cannot be created
   */
  getInstance(
    name: string,
  ): AbstractEngine<any> {
    if (this._instances.has(name) === false) {
      const instance = this.createInstance(name);
      this._instances.set(name, instance);
    }
    return this._instances.get(name)!;
  }

  /**
   * Creates a new database engine instance based on registered configuration.
   * @param name - The name of the instance to create
   * @returns A new database engine instance
   * @throws Error if configuration is not found or engine type is not supported
   */
  createInstance(name: string): AbstractEngine<any> {
    if (this._instances.has(name) === false) {
      const config = this._instanceConfig.get(name);
      if (config) {
        switch (config.engine) {
          case 'POSTGRES':
            return new PostgresEngine(name, config as PostgresEngineOptions);
          case 'MARIA':
            return new MariaEngine(name, config as MariaEngineOptions);
          case 'SQLITE':
            return new SQLiteEngine(name, config as SQLiteEngineOptions);
          default:
            throw new Error(`Engine ${config.engine} not supported`);
        }
      }
    }
    throw new DAMProfileNotFoundError({
      profileName: name,
    });
  }

  /**
   * Tests database connection(s) by initializing, pinging, and finalizing.
   * @param name - Optional specific instance to test; if omitted, tests all registered instances
   */
  async test(name?: string) {
    if (!name) {
      for (const [name] of this._instanceConfig) {
        await this.test(name);
      }
    } else {
      const instance = this.getInstance(name);
      await instance.init();
      await instance.ping();
      await instance.finalize();
    }
  }
}

/**
 * Global singleton instance of the Database Access Manager.
 * Use this to register, retrieve, and test database connections.
 */
export const DAM: InstanceManagement = new InstanceManagement();
