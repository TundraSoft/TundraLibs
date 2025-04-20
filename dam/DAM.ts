// deno-lint-ignore-file no-explicit-any
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

@Singleton
class InstanceManagement {
  protected _instanceConfig: Map<string, EngineOptions> = new Map();
  protected _instances: Map<string, AbstractEngine<any>> = new Map();

  register<T extends EngineOptions = EngineOptions>(name: string, config: T) {
    if (this._instanceConfig.has(name)) {
      const c = this._instanceConfig.get(name)!;
      if (c !== config) {
        throw new Error(
          `Instance ${name} already registered with different config`,
        );
      }
      return;
    }
    this._instanceConfig.set(name, config);
  }

  getInstance(
    name: string,
  ): AbstractEngine<any> {
    if (this._instances.has(name) === false) {
      const instance = this.createInstance(name);
      this._instances.set(name, instance);
    }
    return this._instances.get(name)!;
  }

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
    throw new Error(`Could not find config for ${name}`);
  }

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

export const DAM = new InstanceManagement();
