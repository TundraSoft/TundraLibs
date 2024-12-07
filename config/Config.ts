import { path, toml, yaml } from '../dependencies.ts';
import {
  envArgs,
  memoize,
  type PrivateObject,
  privateObject,
  singleton,
} from '../utils/mod.ts';
import {
  ConfigNotDefined,
  ConfigNotFound,
  ConfigPermissionError,
  DuplicateConfig,
  MalformedConfig,
} from './errors/mod.ts';
/**
 * Config
 *
 * Loads and handles configuration files. It supports yml, toml and json file formats.
 * It supports environment variable substitution as well.
 * This is a singleton class therby ensuring all loaded configs are available throughout the application
 */
@singleton
class Configurations {
  private _config: PrivateObject<Record<string, unknown>> = privateObject<
    Record<string, unknown>
  >();
  private _env: PrivateObject<Record<string, string>> = privateObject<
    Record<string, string>
  >();
  private _extensions: Array<string> = ['.json', '.yaml', '.yml', '.toml'];

  /**
   * Load a specific env file. This MUST be called before get method is called
   *
   * @param envPath Path to the .env file
   */
  loadEnv(envPath = './'): void {
    this._env = envArgs(envPath, true);
  }

  /**
   * Load the config files from the provided path. Secondary file can also be loaded
   * by passing second argument
   *
   * @param dir Path to the config files. This has to be a directory
   * @param name Specific file to load
   */
  async load(dir: string = './configs', name?: string): Promise<void> {
    // Ok scan the directory and get the files
    const files = await this._scanPath(dir, name);
    if (name && Object.keys(files).length === 0) {
      throw new ConfigNotFound({ config: name, path: dir });
    }
    for (const [configName, file] of Object.entries(files)) {
      // Check if it exists
      if (this._config.has(configName)) {
        throw new DuplicateConfig({ config: configName });
      }
      await this._loadConfig(configName, file);
    }
  }

  /**
   * Checks if a config file has been loaded
   *
   * @param name string The name of the config
   * @returns boolean True if the config exists, false otherwise
   */
  has(...items: string[]): boolean {
    const name = (items.shift() as string).trim().toLowerCase(); // NOSONAR
    if (!this._config.has(name)) {
      return false;
    }
    let final = this._config.get(name) as Record<string, unknown>;
    if (items.length > 0) {
      for (const item of items) {
        if (final[item]) {
          final = final[item] as Record<string, unknown>;
        } else {
          return false;
        }
      }
    }
    return true;
  }

  /**
   * Lists all loaded config files
   *
   * @returns string[] List of all the config names
   */
  list(): string[] {
    return Array.from(this._config.keys());
  }

  /**
   * Gets the config item from the loaded config files. It can be used to get a
   * specific item from the config file by passing the path to the item. If
   * the path is not found, will return undefined.
   *
   * @typeparam T The type of the item to return
   * @param items Array<string> The config name and the path to the item
   * @returns T
   */
  get<T>(...items: string[]): T | undefined {
    const name = (items.shift() as string).trim().toLowerCase(); // NOSONAR
    if (!this._config.has(name)) {
      throw new ConfigNotDefined({ config: name });
    }
    let final = this._config.get(name) as Record<string, unknown>;
    if (items.length > 0) {
      for (const item of items) {
        if (final[item]) {
          final = final[item] as Record<string, unknown>;
        } else {
          return undefined;
        }
      }
    }
    // Replace any variables
    return JSON.parse(this._replaceVariables(JSON.stringify(final))) as T;
  }

  clear(): void {
    this._config.clear();
  }

  /**
   * Checks if the dir exists and it is readable.
   *
   * @param dir string The directory to scan
   * @throws ConfigNotFound if the directory is not found
   * @throws ConfigPermissionError if read only permission is not given to the path
   * @throws DuplicateConfig if the same config file is found twice
   */
  protected async _checkPath(dir: string) {
    try {
      const stat = await Deno.stat(dir);
      if (stat.isDirectory === false) {
        throw new ConfigNotFound({ path: dir });
      }
    } catch (e) {
      if (e instanceof Deno.errors.PermissionDenied) {
        throw new ConfigPermissionError({ path: dir });
      } else if (e instanceof Deno.errors.NotFound) {
        throw new ConfigNotFound({ path: dir });
      } else {
        throw e;
      }
    }
  }

  /**
   * @param dir string The directory to scan
   * @param file string The specific file (only name) to load. Optional
   * @returns Record<string, string> List of config files found
   * @throws ConfigNotFound if the directory is not found
   * @throws ConfigPermissionError if read only permission is not given to the path
   * @throws DuplicateConfig if the same config file is found twice
   */
  protected async _scanPath(dir: string, file?: string) {
    // First check if the path is valid
    await this._checkPath(dir);
    const configFiles: Record<string, string> = {};
    if (file) {
      file = file.trim().toLowerCase();
    }
    for await (const entry of Deno.readDir(dir)) {
      if (entry.isFile) {
        const fileDetails = path.parse(entry.name);
        const fileName = fileDetails.name.trim().toLowerCase();
        if (file && file != fileName) {
          continue;
        }
        if (this._extensions.includes(fileDetails.ext.toLowerCase())) {
          if (configFiles[fileName]) {
            throw new DuplicateConfig({
              config: fileName,
              path: dir,
            });
          }
          configFiles[fileName] = path.join(dir, entry.name);
        }
      }
    }
    return configFiles;
  }

  /**
   * Loads the config file, parses and converts to JSON and stores it
   *
   * @param name string The name of the config
   * @param file string The file path from which to load
   * @throws MalformedConfig if the file is not a valid config file
   * @throws ConfigError if the file type is not supported
   * @throws UnsupportedConfig if the file extension is not supported
   */
  protected async _loadConfig(name: string, file: string) {
    const fileDetails = path.parse(file);
    switch (fileDetails.ext.toLowerCase()) {
      case '.json':
        try {
          this._config.set(
            name.trim().toLowerCase(),
            JSON.parse(await Deno.readTextFile(file)),
          );
        } catch {
          throw new MalformedConfig({
            config: name,
            path: fileDetails.dir,
            fileName: fileDetails.name,
            extension: fileDetails.ext,
          });
        }
        break;
      case '.yaml':
      case '.yml':
        try {
          this._config.set(
            name.trim().toLowerCase(),
            yaml.parse(await Deno.readTextFile(file)) as Record<
              string,
              unknown
            >,
          );
        } catch {
          throw new MalformedConfig({
            config: name,
            path: fileDetails.dir,
            fileName: fileDetails.name,
            extension: fileDetails.ext,
          });
        }
        break;
      case '.toml':
        try {
          this._config.set(
            name.trim().toLowerCase(),
            toml.parse(await Deno.readTextFile(file)),
          );
        } catch {
          throw new MalformedConfig({
            config: name,
            path: fileDetails.dir,
            fileName: fileDetails.name,
            extension: fileDetails.ext,
          });
        }
        break;
    }
  }

  /**
   * Replaces "variables", identified by $<key> with the value from the env. If the
   * variable is not found in the env, it will be replaced with an empty string.
   * If a variable is found as $$<key>, it will be ignored and replaced as $<key>
   *
   * @param data string The data to replace variables from env
   * @returns string Data post variable replacement
   */
  protected _replaceVariables(data: string): string {
    // Search for pattern $<key> and replace with the value from env
    const regex = /(?<!\$)\$(\w+)/g;
    let match;
    while ((match = regex.exec(data)) !== null) {
      const key = match[1];
      const value = this._env.get(key) || '';
      data = data.replace(new RegExp(`\\$${key}`, 'g'), value.trim());
    }
    return data.replaceAll(/\$\$(\w+)/g, (val) => val.slice(1));
  }
}

export const Config = new Configurations();
