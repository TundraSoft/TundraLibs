import { path, toml, yaml } from '../dependencies.ts';
// import type { ConfigOptions, ConfigType } from './types/mod.ts';
import { SysInfo } from '../sysinfo/mod.ts';

import {
  ConfigItemNotFound,
  ConfigNotFound,
  ConfigNotSupported,
  ConfigReadError,
} from './errors/mod.ts';

export class Config {
  protected static __configs: Map<string, Record<string, unknown>> = new Map();
  private static __env: Map<string, string>;

  // Prevent instantiation
  private constructor() {
  }

  public static async load(name: string, path = './configs'): Promise<void> {
    const readPerm =
      (await Deno.permissions.query({ name: 'read', path: path })).state;
    if (readPerm !== 'granted') {
      throw new ConfigReadError({ config: name, path });
    }
    name = name.toLowerCase().trim();
    const data = await this._loadConfig(path, name);
    this.__configs.set(name, data);
  }

  public static async loadAll(basePath = './configs'): Promise<void> {
    const readPerm =
      (await Deno.permissions.query({ name: 'read', path: basePath })).state;
    if (readPerm !== 'granted') {
      throw new ConfigReadError({ config: 'all', path: basePath });
    }
    // for await (const file of Deno.readDir(basePath)) {
    for (const file of Deno.readDirSync(basePath)) {
      if (file.isFile) {
        const st = path.parse(file.name);
        await Config.load(st.name.toLowerCase(), basePath);
      }
    }
  }

  public static has(name: string, ...items: string[]): boolean {
    name = name.toLowerCase().trim();
    const path: string[] = [];
    if (this.__configs.has(name)) {
      // let final = JSON.parse(JSON.stringify(this.__configs.get(name))) as Record<string, unknown>;;
      let final = this.__configs.get(name) as Record<string, unknown>;
      for (const item of items) {
        path.push(item);
        if (final[item]) {
          final = final[item] as Record<string, unknown>;
        } else {
          return false;
        }
      }
      return true;
    }
    return false;
  }

  public static get<T>(name: string, ...items: string[]): T {
    name = name.toLowerCase().trim();
    const path: string[] = [];
    if (this.__configs.has(name)) {
      // let final = JSON.parse(JSON.stringify(this.__configs.get(name))) as Record<string, unknown>;;
      let final = this.__configs.get(name) as Record<string, unknown>;
      for (const item of items) {
        path.push(item);
        if (final[item]) {
          final = final[item] as Record<string, unknown>;
        } else {
          throw new ConfigItemNotFound(path, { config: name });
        }
      }
      return final as T;
    }
    throw new ConfigItemNotFound(path, { config: name });
  }

  protected static async _loadConfig(
    basePath: string,
    fileName: string,
  ): Promise<Record<string, unknown>> {
    await this.initEnv();
    for (const file of Deno.readDirSync(basePath)) {
      if (file.isFile) {
        const st = path.parse(file.name);
        if (st.name.toLowerCase() === fileName) {
          const content = await Deno.readTextFile(
            path.join(basePath, file.name),
          );
          switch (st.ext.toUpperCase()) {
            case '.JSON':
            case '.JS':
              return JSON.parse(content);
            case '.TOML':
              return toml.parse(content);
            case '.YAML':
            case '.YML':
              return yaml.parse(content) as Record<string, unknown>;
            default:
              throw new ConfigNotSupported({
                config: fileName,
                path: basePath,
                ext: st.ext,
              });
          }
        }
      }
    }
    throw new ConfigNotFound({ config: fileName, path: basePath });
  }

  protected static async initEnv() {
    if (Config.__env === undefined) {
      Config.__env = await SysInfo.getAllEnv();
    }
  }
}

// Language: Typescript