import { path, toml, yaml } from "../dependencies.ts";
import type { ConfigFile } from "./types.ts";
import { Sysinfo } from "../sysinfo/mod.ts";

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
  static async load(name: string, path = "./configs"): Promise<boolean> {
    Config._initEnv();
    //#region Test read permission
    const readPerm =
      await (await Deno.permissions.query({ name: "read", path: path })).state;
    if (readPerm !== "granted") {
      throw new Error(`Read permission is required for path: ${path}`);
    }
    //#endregion
    // let mode: ConfigMode = "PROD";
    // if (Config.#envEnabled && Config.#env.has("ENV")) {
    //   if (Config.#env.get("ENV") as ConfigMode === "DEV") {
    //     mode = "DEV";
    //   }
    // }
    name = name.toLowerCase().trim();
    //#region Handle different extentions
    const configFiles: ReadonlyArray<ConfigFile> = [
      {
        basePath: path,
        fileName: name,
        // configMode: mode,
        type: "JSON",
        extention: "json",
      },
      {
        basePath: path,
        fileName: name,
        // configMode: mode,
        type: "YAML",
        extention: "yaml",
      },
      {
        basePath: path,
        fileName: name,
        // configMode: mode,
        type: "YAML",
        extention: "yml",
      },
      {
        basePath: path,
        fileName: name,
        // configMode: mode,
        type: "TOML",
        extention: "toml",
      },
    ];
    //#endregion Handle different extentions

    //#region Load the file
    for (const configFile of configFiles) {
      try {
        const data = await Config._loadConfig(configFile);
        this.#configFiles.set(name, configFile);
        this.#configs.set(name, data);
        return true;
      } catch {
        // continue regardless of error
      }
    }
    return false;
    //#endregion Load the file
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
      if (Config.#env.size > 0) {
        Config.#env.forEach((value, key) => {
          const regex = new RegExp("\\$" + key + "", "g");
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
   * @param data ConfigFile The config file to search for & load
   * @returns Promise<Record<string, unknown>> The parsed config information
   */
  protected static async _loadConfig(
    data: ConfigFile,
  ): Promise<Record<string, unknown>> {
    const fileName = `${data.fileName}.${data.extention}`;
    const filePath = path.join(data.basePath, fileName);
    let config: Record<string, unknown>,
      content: string;
    switch (data.type) {
      case "JSON":
        content = await Deno.readTextFile(filePath);
        config = JSON.parse(content);
        break;
      case "TOML":
        content = await Deno.readTextFile(filePath);
        config = toml.parse(content);
        break;
      case "YAML":
        content = await Deno.readTextFile(filePath);
        config = yaml.parse(content) as Record<string, unknown>;
        break;
      default:
        config = {};
        break;
    }
    return config as Record<string, unknown>;
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
