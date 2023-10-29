import { path, toml, yaml } from '../dependencies.ts';
import { privateObject } from '../utils/privateObject.ts';
import type { PrivateObject } from '../utils/privateObject.ts';
/**
 * Config class for loading configuration files from specific path.
 * This is a singleton class.
 * 
 */
export class Config {
  protected static __instance: Config;
  // We use private object to prevent sniffing of secrets
  private _configs: PrivateObject<Record<string, unknown>> = privateObject<Record<string, unknown>>();

  private constructor() {
  }

  /**
   * Returns the singleton instance of the Config class.
   * 
   * @returns {Config}
   * @public
   * @static
   */
  public static getInstance(): Config {
    if (!this.__instance) {
      this.__instance = new Config();
    }
    return this.__instance;
  }

  /**
   * Loads a configuration file from the provided path
   *
   * @param {string} name - The name of the configuration (no extension)
   * @param {string} basePath - The path to the configuration file. Default is './configs'.
   * @throws {ConfigReadError} - If read permission is not granted for the specified path.
   * @public
   * @static
   */
  public async load(
    name: string,
    basePath = './configs',
  ): Promise<void> {
    const readPerm =
      (await Deno.permissions.query({ name: 'read', path: basePath })).state;
    if (readPerm !== 'granted') {
      throw new ConfigReadError({ config: name, path: basePath });
    }
    name = name.toLowerCase().trim();
    const data = await this._loadConfig(basePath, name);
    this.__configs.set(name, data);
  }
}