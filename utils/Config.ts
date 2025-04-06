import * as fs from '$fs';
import * as path from '$path';
import { parse as jsonParse } from '$jsonc';
import { parse as tomlParse } from '$toml';
import { parse as yamlParse } from '$yaml';
import { envArgs } from './envArgs.ts';
import { variableReplacer } from './variableReplacer.ts';

/**
 * A type representing a valid path tuple for traversing a nested object structure.
 * Used for type-safe property access in configuration objects.
 * @template T The object type whose properties can be accessed
 */
type ValidPathTuple<T> =
  | []
  | {
    [K in keyof T]:
      | [K]
      | (T[K] extends Record<string, unknown> ? [K, ...ValidPathTuple<T[K]>]
        : [K]);
  }[keyof T];

/**
 * Represents a configuration manager providing type-safe access to configuration items
 * @template C The type of configuration object (defaults to Record<string, Record<string, unknown>>)
 * @template K Keys of the configuration object
 */
export type ConfigType<
  C extends Record<string, Record<string, unknown>> = Record<
    string,
    Record<string, unknown>
  >,
> = {
  /**
   * Gets a value from the configuration
   * @param item The configuration section to access
   * @param path The property path to traverse
   * @returns The requested configuration value or undefined
   * @throws Error if Configuration Set or path is not found
   */
  get: <T, K extends keyof C = keyof C>(
    item: K,
    ...path: Array<string>
  ) => T;

  /**
   * Checks if a configuration path exists
   * @param item The configuration section to check
   * @param path The property path to test
   * @returns True if the path exists, false otherwise
   */
  has: <K extends keyof C = keyof C>(
    item: K,
    ...path: Array<string>
  ) => boolean;

  /**
   * Gets all keys for a configuration section
   * @param item The configuration section
   * @returns Array of keys for the specified section
   */
  keys: <K extends keyof C = keyof C>(item: K) => Array<keyof C[K]>;

  /**
   * Lists all available configuration sections
   * @returns Array of configuration section names
   */
  list: () => Array<keyof C>;

  /**
   * Iterates over key-value pairs in a configuration section
   * @param item The configuration section
   * @param callback Function to call for each key-value pair
   */
  forEach: <K extends keyof C = keyof C, SK extends keyof C[K] = keyof C[K]>(
    item: K,
    callback: (key: keyof C[K], value: unknown) => void,
  ) => void;
};

/**
 * Creates a configuration manager from a data object
 * @template T The type of configuration data
 * @param data The configuration data object
 * @returns A ConfigType instance for accessing the configuration
 */
export const Config = <T extends Record<string, Record<string, unknown>>>(
  data: T,
): ConfigType<T> => {
  const _data = data;
  return {
    list: () => Object.keys(_data) as Array<keyof T>,

    has: <K extends keyof T = keyof T>(item: K, ...path: string[]) => {
      item = (String(item)).trim().toLowerCase() as K;
      if (_data[item] === undefined) {
        return false;
      } else {
        // deno-lint-ignore no-explicit-any
        let current: any = _data[item];
        for (const key of path) {
          if (current === undefined || current[key] === undefined) {
            return false;
          }
          current = current[key];
        }
        return true;
      }
    },

    get: <R = unknown, K extends keyof T = keyof T>(
      item: K,
      ...path: string[]
    ): R => {
      item = (String(item)).trim().toLowerCase() as K;
      if (_data[item] === undefined) {
        throw new Error(`Configuration set ${String(item)} not found`);
      } else {
        // deno-lint-ignore no-explicit-any
        let current: any = _data[item];
        const traversed: string[] = [];

        for (const key of path) {
          traversed.push(key);
          if (current === undefined || current[key] === undefined) {
            throw new Error(
              `Configuration item ${traversed.join(' -> ')} not found in ${
                String(item)
              }`,
            );
          }
          current = current[key];
        }

        return current as R;
      }
    },

    keys: <K extends keyof T = keyof T>(item: K) => {
      item = (item as string).trim().toLowerCase() as K;
      if (_data[item] === undefined) {
        return [];
      } else {
        return Object.keys(_data[item]!);
      }
    },

    forEach: <K extends keyof T = keyof T, SK extends keyof T[K] = keyof T[K]>(
      item: K,
      callback: (key: SK, value: T[K][SK]) => void,
    ) => {
      item = (item as string).trim().toLowerCase() as K;
      if (_data[item] === undefined) {
        return;
      } else {
        Object.entries(_data[item]!).forEach(([key, value]) =>
          callback(key as SK, value as T[K][SK])
        );
      }
    },
  };
};

/**
 * Options for loading configuration files
 *
 * Used by {@link loadConfig} function
 */
export type LoadConfigOptions = {
  /**
   * Path to the directory containing configuration files
   */
  path: string;

  /**
   * RegExp patterns for files to include (optional)
   */
  include?: Array<RegExp>;

  /**
   * RegExp patterns for files to exclude (optional)
   */
  exclude?: Array<RegExp>;

  /**
   * Environment variable handling:
   * - true: Load environment variables from the config path
   * - false/undefined: Don't use environment variables
   * - string: Path to load environment variables from
   */
  env?: boolean | string;
};

/**
 * Validates the provided configuration options to ensure they conform to the {@link LoadConfigOptions} type.
 *
 * @param options - The configuration options to validate.
 * @returns The validated {@link LoadConfigOptions} object if valid.
 * @throws ConfigError {@link TypeError} - If the validation fails with a descriptive error message.
 *
 * @example
 * ```typescript
 * import { assertLoadConfigOptions } from './Config.ts';
 *
 * const options = {
 *   path: './config',
 *   include: [/\.config\.json$/],
 *   exclude: [/\.backup$/],
 *   env: './.env',
 * };
 *
 * try {
 *   const validOptions = assertLoadConfigOptions(options);
 *   // Proceed with using validOptions
 * } catch (error) {
 *   if (error instanceof Error) {
 *     console.error(`Configuration Error: ${error.message}`);
 *   } else {
 *     throw error;
 *   }
 * }
 * ```
 *
 * @see {@link loadConfig} - The method that utilizes the validated configuration options.
 */
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

/**
 * Loads configuration files from the specified path
 * @param options Configuration options {@link LoadConfigOptions} including path and environment settings
 * @returns A Config {@link Config} object with methods to access the loaded configuration
 *
 * @example
 * // Load all config files from ./config with environment variables
 * const config = await loadConfig({
 *   path: './config',
 *   env: true
 * });
 *
 * // Get a specific configuration value
 * const serverPort = config.get<number>('server', 'port');
 */
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
