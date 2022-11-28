import { fs, path, toml, yaml } from '/root/dependencies.ts';
import type { ConfigFile } from './types.ts';
import { Sysinfo } from '/root/sysinfo/mod.ts';

export class Config {
  static #configs: Map<string, Record<string, unknown>> = new Map();
  static #configFiles: Map<string, ConfigFile> = new Map();
  static #envEnabled: boolean;
  static #env: Map<string, string>;

  /**
   * load
   * Loads information from the provided file name.
   * *NOTE* - the file name should be lower case only
   *
   * @param name string Config file name
   * @param path string Config path, defaults to ./configs
   * @returns boolean True if file was found and loaded, else false
   */
  static async load(name: string, path = './configs'): Promise<void> {
    await Config._initEnv();
    //#region Test read permission
    const readPerm =
      await (await Deno.permissions.query({ name: 'read', path: path })).state;
    if (readPerm !== 'granted') {
      throw new Error(`Read permission is required for path: ${path}`);
    }
    //#endregion
    name = name.toLowerCase().trim();

    const data = await Config._loadConfig(path, name);
    this.#configs.set(name, data);
  }

  /**
   * get(typed)
   * Get config item. First search by file name, then if provided search for sub items
   * and return that instead of returning the entire object.
   * Any ENV arguments placed will also be replaced and returned.
   *
   * @param name string The config section name (file)
   * @param items string[] Specific sub item
   */
  static get<T>(
    name: string,
    ...items: string[]
  ): T;

  /**
   * get
   * Get config item. First search by file name, then if provided search for sub items
   * and return that instead of returning the entire object.
   * Any ENV arguments placed will also be replaced and returned.
   *
   * @param name string The config section name (file)
   * @param items Array<string> Specific sub item
   * @returns Record<string, unknown> | undefined The config data, null if not found
   */
  static get<T = Record<string, unknown> | string | number | boolean | Date>(
    name: string,
    ...items: string[]
  ): T {
    Config._initEnv();
    name = name.toLowerCase().trim();
    let config: Record<string, unknown>;
    if (Config.#configs.has(name)) {
      config = Config.#configs.get(name) as Record<string, unknown>;
      //#region Replace env variables
      let data = JSON.stringify(config);
      if (Config.#env && Config.#env.size > 0) {
        Config.#env.forEach((value, key) => {
          const regex = new RegExp('\\$' + key + '', 'g');
          data = data.replaceAll(regex, value);
        });
      }
      // Replace the env variables
      //#endregion Replace env variables
      let final = JSON.parse(data);
      for (const item of items) {
        if (final[item]) {
          final = final[item];
        } else {
          throw new Error(
            `Requested config item ${item} not found in config ${name}.`,
          );
        }
      }
      return final as T;
    }
    throw new Error(`Could not find configuration by the name ${name}.`);
  }

  static has(name: string, ...items: string[]): boolean {
    Config._initEnv();
    name = name.toLowerCase().trim();
    let config: Record<string, unknown>;
    if (Config.#configs.has(name)) {
      config = Config.#configs.get(name) as Record<string, unknown>;
      let final = JSON.parse(JSON.stringify(config));
      for (const item of items) {
        if (final[item]) {
          final = final[item];
        } else {
          return false;
        }
      }
      return true;
    }
    return false;
  }

  /**
   * loadConfig
   * Actually loads the config data from the file. Basis file type, it will parse and return the data
   * as a json object.
   *
   * @param basePath string The base path to the config file
   * @param name string The name of the config file
   * @returns Promise<Record<string, unknown>> The parsed config information
   */
  protected static async _loadConfig(
    basePath: string,
    fileName: string,
  ): Promise<Record<string, unknown>> {
    // Loop through and find the file
    let content: string;
    for await (const file of Deno.readDir(basePath)) {
      if (file.isFile) {
        const st = path.parse(file.name);
        if (st.name.toLowerCase() === fileName) {
          switch (st.ext.toUpperCase()) {
            case '.JSON':
            case '.JS':
              content = await Deno.readTextFile(path.join(basePath, file.name));
              return JSON.parse(content);
            case '.TOML':
              content = await Deno.readTextFile(path.join(basePath, file.name));
              return toml.parse(content);
            case '.YAML':
            case '.YML':
              content = await Deno.readTextFile(path.join(basePath, file.name));
              return yaml.parse(content) as Record<string, unknown>;
            default:
              throw new Error(`Unknown file type: ${st.ext}`);
          }
        }
      }
    }
    throw new Error(`Could not find config file: ${fileName}`);
  }

  /**
   * initEnv
   * Initializes and checks if environment variable access is available
   */
  protected static async _initEnv() {
    if (Config.#env === undefined) {
      Config.#env = await Sysinfo.getAllEnv();
    }
  }
}
