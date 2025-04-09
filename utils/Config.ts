// deno-lint-ignore-file no-explicit-any
import * as fs from '$fs';
import * as path from '$path';
import { parse as jsonParse } from '$jsonc';
import { parse as tomlParse } from '$toml';
import { parse as yamlParse } from '$yaml';
import { envArgs } from './envArgs.ts';
import { variableReplacer } from './variableReplacer.ts';

export type ConfigType = {
  list: () => Array<string>;
  has: (path: string) => boolean;
  keys: (set: string) => Array<string>;
  get: <T = unknown>(path: string) => T;
  forEach: (
    set: string,
    callback: (key: string, value: unknown) => void,
  ) => void;
};

export const Config = <
  C extends Record<string, Record<string, unknown>> = Record<
    string,
    Record<string, unknown>
  >,
>(config: C): ConfigType => {
  const _data = config;
  // Cache few items
  const _configSets: Array<string> = Object.keys(_data);
  return {
    list: () => _configSets,
    has: (path: string): boolean => {
      const paths = (path as unknown as string).split('.');
      const set = paths.shift() as string;
      if (!_configSets.includes(set)) {
        return false;
      }
      let obj: any = _data[set]!;
      while (paths.length > 0) {
        const key = paths.shift();
        if (obj[key as string] === undefined) {
          return false;
        } else {
          obj = obj[key as string];
        }
      }
      return true;
    },
    keys: <K extends keyof C | string>(set: K): Array<string> => {
      if (!_configSets.includes(set as string)) {
        throw new Error(`Config set "${set as string}" does not exist`);
      }
      return Object.keys(_data[set as string]!);
    },
    get: <T = unknown>(path: string): T => {
      const paths = (path as unknown as string).split('.');
      const set = paths.shift() as string;
      if (!_configSets.includes(set)) {
        throw new Error(`Config set "${set}" does not exist`);
      }
      let obj: any = _data[set]!;
      const traversed: Array<string> = [];
      while (paths.length > 0) {
        const key = paths.shift();
        traversed.push(key as string);
        if (Object.keys(obj).includes(key as string) === false) {
          throw new Error(
            `Config item "${
              traversed.join('.')
            }" does not exist in set "${set}`,
          );
        } else {
          obj = obj[key as string];
        }
      }
      return obj;
    },
    forEach: (set: string, callback: (key: string, value: unknown) => void) => {
      if (!_configSets.includes(set)) {
        throw new Error(`Config set "${set}" does not exist`);
      }
      const obj = _data[set]!;
      for (const key of Object.keys(obj)) {
        const value = obj[key];
        callback(key, value);
      }
    },
  };
};

/**
 * Options for loading configuration files
 */
export type LoadConfigOptions = {
  /**
   * Path to the directory containing configuration files
   */
  path: string;

  /**
   * RegExp patterns for files to include
   * Only files matching these patterns will be loaded
   */
  include?: Array<RegExp>;

  /**
   * RegExp patterns for files to exclude
   * Files matching these patterns will be ignored
   */
  exclude?: Array<RegExp>;

  /**
   * Environment variable handling:
   * - `true`: Load environment variables from the config path
   * - `false` or `undefined`: Don't use environment variables
   * - `string`: Path to load environment variables from
   */
  env?: boolean | string;
};

export const assertLoadConfigOptions = (
  options: unknown,
): options is LoadConfigOptions => {
  if (typeof options !== 'object' || options === null) {
    throw TypeError('Invalid options: expected an object');
  }
  const { path, include, exclude, env } = options as Record<string, unknown>;
  if (typeof path !== 'string') {
    throw TypeError('Invalid options: path must be a string');
  }
  if (
    include !== undefined && !Array.isArray(include) ||
    (Array.isArray(include) && include.some((i) => !(i instanceof RegExp)))
  ) {
    throw TypeError('Invalid options: include must be an array of RegExp');
  }
  if (
    exclude !== undefined && !Array.isArray(exclude) ||
    (Array.isArray(exclude) && exclude.some((i) => !(i instanceof RegExp)))
  ) {
    throw TypeError('Invalid options: exclude must be an array of RegExp');
  }
  if (
    env !== undefined &&
    typeof env !== 'boolean' &&
    typeof env !== 'string'
  ) {
    throw TypeError(
      'Invalid options: env must be a boolean or a string',
    );
  }
  return true;
};

export const loadConfig = async (options: LoadConfigOptions) => {
  const defaults: Partial<LoadConfigOptions> = {
    exclude: [],
  };
  options = { ...defaults, ...options };
  assertLoadConfigOptions(options);
  let env: Record<string, string> = {};
  if (options.env === undefined || typeof options.env === 'boolean') {
    if (options.env) {
      env = envArgs(options.path).asObject();
    }
  } else if (typeof options.env === 'string') {
    env = envArgs(options.env).asObject();
  }
  const configs: Record<string, Record<string, unknown>> = {};
  try {
    const files = await Array.fromAsync(fs.walk(options.path, {
      includeDirs: false,
      includeFiles: true,
      match: options.include,
      skip: options.exclude,
      exts: ['json', 'js', 'toml', 'yaml', 'yml'],
    }));
    for (const file of files) {
      const fd = path.parse(file.path);
      const name = fd.name.toLowerCase();
      if (configs[name]) {
        throw new Error(`Duplicate config file found: ${file.path}`);
      }
      const ext = fd.ext;
      // Read the file
      const content = variableReplacer(await Deno.readTextFile(file.path), env);
      // Replace env
      let parsed: Record<string, unknown>;
      switch (ext) {
        case '.toml':
          try {
            parsed = tomlParse(content);
          } catch {
            throw new Error(
              `Error parsing config file - TOML: ${file.path}`,
            );
          }
          break;
        case '.yaml':
        case '.yml':
          try {
            parsed = yamlParse(content) as Record<string, unknown>;
          } catch {
            throw new Error(`Error parsing config file - YML: ${file.path}`);
          }
          break;
        case '.json':
        case '.js':
        default:
          try {
            parsed = jsonParse(content) as Record<string, unknown>;
          } catch {
            throw new Error(`Error parsing config file - JSON: ${file.path}`);
          }
          break;
      }
      configs[name] = parsed;
    }
  } catch (e) {
    if ((e as Error).message.includes('Duplicate config file')) {
      throw e;
    } else if ((e as Error).message.toLowerCase().includes('parse')) {
      throw e;
    } else if (e instanceof Deno.errors.NotFound) {
      throw new Error(`Config path not found: ${options.path}`);
    } else if (
      e instanceof Deno.errors.PermissionDenied ||
      e instanceof Deno.errors.NotCapable
    ) {
      throw new Error(`Permission denied: ${options.path}`);
    } else {
      throw new Error(`Error loading config: ${(e as Error).message}`);
    }
  }
  return Config<typeof configs>(configs);
};
