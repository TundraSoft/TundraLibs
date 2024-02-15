import { path, toml, yaml } from '../dependencies.ts';
import { envArgs, privateObject, singleton } from '../utils/mod.ts';
import type { PrivateObject } from '../utils/mod.ts';

import {
  ConfigMalformed,
  ConfigMultiple,
  ConfigNotFound,
  ConfigPermissionError,
  ConfigUnsupported,
} from './errors/mod.ts';

/**
 * Config class
 *
 * Loads the config files from the provided path and provides a get method to access the config
 * It supports yml, toml and json file formats. It supports environment variable substitution as well
 * This is a singleton class therby ensuring all loaded configs are available throughout the application
 *
 * @singleton
 */
@singleton
export class Config {
  private _config: PrivateObject<Record<string, unknown>> = privateObject<
    Record<string, unknown>
  >();
  private _env: PrivateObject<Record<string, string>> = privateObject<
    Record<string, string>
  >();
  protected _extensions = ['.json', '.yaml', '.yml', '.toml'];

  /**
   * Load the env variables. You can set the path to the .env file also
   *
   * @param envPath Path to the .env file
   */
  loadEnv(envPath = './'): void {
    this._env = envArgs(envPath, true);
  }

  /**
   * Loads config files from the provided path. You can also send a specific file to load
   * NOTE: Each config file is loaded as the file name => contents of the file and *is case sensitive*
   * This means, a file with the name sample.yaml and SaMple.yaml will be loaded as two different configs!
   * Additionally, if a path contains 2 files with same name, i.e sample.yaml and sample.toml, it will throw an error!
   *
   * @param basePath Path to the config files. This can also be a file
   */
  load(basePath = './configs'): void {
    // Reset config
    const dirCheck = Deno.statSync(basePath);
    let configFiles: Record<string, string[]> = {};
    if (dirCheck.isFile) {
      const fileDetails = path.parse(basePath);
      // Validate extension
      if (!this._extensions.includes(fileDetails.ext.toLowerCase())) {
        throw new ConfigUnsupported(fileDetails.name, {
          path: basePath,
          ext: fileDetails.ext,
        });
      }
      configFiles[fileDetails.name] = [path.basename(basePath)];
      basePath = fileDetails.dir;
    } else {
      configFiles = this._scanPath(basePath);
    }
    for (const name in configFiles) {
      if (configFiles[name].length > 1) {
        // We have multiple files with same name
        throw new ConfigMultiple(name, {
          path: basePath,
          files: configFiles[name].join(', '),
        });
      }
      this._loadFile(basePath, configFiles[name][0], name);
    }
  }

  /**
   * Lists all config files loaded
   *
   * @returns List of all loaded configs
   */
  list(): string[] {
    return this._config.keys();
  }

  /**
   * Gets a particular config item
   *
   * @param items Key values of the config. First one points to the config file name
   * @returns T the config object, defaults to Record<string, unknown>
   * @throws ConfigNotFound if the config key is not found
   */
  get<T>(...items: string[]): T {
    const name = items[0].trim();
    items = items.slice(1);
    const path: string[] = [];
    if (this._config.has(name)) {
      // let final = JSON.parse(JSON.stringify(this.__configs.get(name))) as Record<string, unknown>;;
      let final = this._config.get(name) as Record<string, unknown>;
      for (const item of items) {
        path.push(item);
        if (final[item]) {
          final = final[item] as Record<string, unknown>;
        } else {
          throw new ConfigNotFound(name, {
            item: path.join('.'),
          });
        }
      }
      // Replace any variables
      let replace = JSON.stringify(final);
      this._env.forEach((key: string, value: string) => {
        replace = replace.replace(new RegExp(`\\$${key}`, 'g'), value.trim());
      });
      final = JSON.parse(replace) as Record<string, unknown>;
      return final as T;
    }
    throw new ConfigNotFound(name, { config: name });
  }

  /**
   * Checks if a particular config entry exists
   *
   * @param items Key values of the config. First one points to the config file name
   * @returns True if found, false if not
   */
  has(...items: string[]): boolean {
    const name = items[0].toLowerCase().trim();
    items = items.slice(1);
    if (this._config.has(name)) {
      // let final = JSON.parse(JSON.stringify(this.__configs.get(name))) as Record<string, unknown>;;
      let final = this._config.get(name) as Record<string, unknown>;
      for (const item of items) {
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

  /**
   * Scans a directory and fetches all supported config files
   *
   * @param basePath The base path/directory
   * @returns List of config files found in the directory
   * @throws ConfigPermissionError if the directory is not readable
   */
  protected _scanPath(basePath: string): Record<string, string[]> {
    // First check if we have read permissions
    const configFiles: Record<string, string[]> = {};
    const hasPermission = Deno.permissions.querySync({
      name: 'read',
      path: basePath,
    });
    if (hasPermission.state !== 'granted') {
      throw new ConfigPermissionError('N/A', { path: basePath });
    }
    // If the provided path is a file, we just load it
    const fileDetails = Deno.statSync(basePath);
    if (fileDetails.isFile) {
      const fd = path.parse(basePath);
      configFiles[fd.name] = [path.basename(basePath)];
      return configFiles;
    }
    // Ok we have, now we list the file and return the valid files
    const files = Deno.readDirSync(basePath);
    for (const file of files) {
      if (file.isFile) {
        const fileDetails = path.parse(file.name);
        if (this._extensions.includes(fileDetails.ext.toLowerCase())) {
          // Yes, we have a valid config file
          if (configFiles[fileDetails.name] === undefined) {
            configFiles[fileDetails.name] = [];
          }
          configFiles[fileDetails.name].push(file.name);
        }
      }
    }
    return configFiles;
  }

  /**
   * Loads a configuration file
   *
   * @param basePath The base path/directory
   * @param fileName The file to load
   * @param name The name of the config entry (it will be stored in this name)
   * @throws ConfigUnsupported if the file extension is not supported
   * @throws ConfigMalformed if the file is malformed or invalid
   */
  protected _loadFile(basePath: string, fileName: string, name: string): void {
    const fileDetails = path.parse(fileName);
    let data: Record<string, unknown>;
    try {
      switch (fileDetails.ext.toLowerCase()) {
        case '.json':
          data = JSON.parse(
            Deno.readTextFileSync(path.join(basePath, fileName)),
          );
          break;
        case '.yaml':
        case '.yml':
          data = yaml.parse(
            Deno.readTextFileSync(path.join(basePath, fileName)),
          ) as Record<string, unknown>;
          break;
        case '.toml':
          data = toml.parse(
            Deno.readTextFileSync(path.join(basePath, fileName)),
          ) as Record<string, unknown>;
          break;
        default:
          // Ideally it would never come here as scan only picks up files which are supported
          throw new ConfigUnsupported(name, {
            path: basePath,
            file: fileName,
            ext: fileDetails.ext,
          });
      }
    } catch (_e) {
      throw new ConfigMalformed(name, { path: basePath, file: fileName }, _e);
    }
    this._config.set(name, data);
  }
}
