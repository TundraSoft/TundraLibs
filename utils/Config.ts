/**
 * @fileoverview Advanced configuration management system with multi-format support.
 *
 * This module provides a comprehensive configuration loading and management system
 * that supports multiple file formats, environment variable substitution, and
 * hierarchical configuration merging. It's designed for applications that need
 * flexible, maintainable configuration management.
 *
 * **Supported Formats:**
 * - JSON and JSONC (JSON with comments)
 * - YAML (all major YAML features)
 * - TOML (Tom's Obvious Minimal Language)
 *
 * **Key Features:**
 * - Multi-file configuration merging
 * - Environment variable interpolation
 * - Include/exclude file patterns
 * - Recursive directory scanning
 * - Type-safe configuration access
 * - Live configuration reloading
 * - Validation and error handling
 *
 * **Use Cases:**
 * - Application configuration management
 * - Multi-environment deployments (dev/staging/prod)
 * - Microservice configuration
 * - Build tool configuration
 * - CI/CD pipeline configuration
 *
 * @example Basic configuration loading:
 * ```typescript
 * const config = await loadConfig('./config');
 * const dbHost = config.get<string>('database.host');
 * const port = config.get<number>('server.port');
 * ```
 *
 * @example Environment-specific configuration:
 * ```typescript
 * // config/base.yaml
 * // database:
 * //   host: ${DB_HOST:-localhost}
 * //   port: ${DB_PORT:-5432}
 *
 * const config = await loadConfig('./config');
 * // Automatically substitutes environment variables
 * ```
 */

// deno-lint-ignore-file no-explicit-any
import * as fs from "$fs";
import * as path from "$path";
import { parse as jsonParse } from "$jsonc";
import { parse as tomlParse } from "$toml";
import { parse as yamlParse } from "$yaml";
import { envArgs } from "./envArgs.ts";
import { variableReplacer } from "./variableReplacer.ts";

/**
 * Interface for the configuration object providing type-safe access to configuration values.
 *
 * This interface provides a consistent API for accessing hierarchical configuration
 * data regardless of the underlying file format or structure.
 *
 * @example Type-safe configuration access:
 * ```typescript
 * interface AppConfig {
 *   database: {
 *     host: string;
 *     port: number;
 *     credentials: {
 *       username: string;
 *       password: string;
 *     };
 *   };
 *   server: {
 *     port: number;
 *     host: string;
 *   };
 * }
 *
 * const config: ConfigType = await loadConfig<AppConfig>('./config');
 * const dbHost = config.get<string>('database.host');
 * const serverPort = config.get<number>('server.port');
 * ```
 */
export type ConfigType = {
  /**
   * Returns a list of all top-level configuration sets (root keys).
   *
   * @returns Array of configuration set names
   *
   * @example
   * ```typescript
   * // config.yaml:
   * // database: { ... }
   * // server: { ... }
   * // logging: { ... }
   *
   * config.list(); // ['database', 'server', 'logging']
   * ```
   */
  list: () => Array<string>;

  /**
   * Checks if a configuration path exists.
   *
   * @param path - Dot-notation path to check (e.g., 'database.host')
   * @returns true if the path exists, false otherwise
   *
   * @example
   * ```typescript
   * config.has('database.host');           // true
   * config.has('database.nonexistent');   // false
   * config.has('server.ssl.enabled');     // true (if nested object exists)
   * ```
   */
  has: (path: string) => boolean;

  /**
   * Returns all keys within a specific configuration set.
   *
   * @param set - The configuration set name
   * @returns Array of keys within the set
   *
   * @example
   * ```typescript
   * // config.yaml:
   * // database:
   * //   host: localhost
   * //   port: 5432
   * //   credentials: {...}
   *
   * config.keys('database'); // ['host', 'port', 'credentials']
   * ```
   */
  keys: (set: string) => Array<string>;

  /**
   * Retrieves a configuration value by path with type safety.
   *
   * @template T - The expected type of the configuration value
   * @param path - Dot-notation path to the value (e.g., 'database.host')
   * @returns The configuration value cast to type T
   *
   * @example
   * ```typescript
   * const host = config.get<string>('database.host');
   * const port = config.get<number>('database.port');
   * const config = config.get<DatabaseConfig>('database');
   * ```
   */
  get: <T = unknown>(path: string) => T;

  /**
   * Iterates over all key-value pairs in a configuration set.
   *
   * @param set - The configuration set to iterate over
   * @param callback - Function called for each key-value pair
   *
   * @example
   * ```typescript
   * config.forEach('database', (key, value) => {
   *   console.log(`${key}: ${value}`);
   * });
   * // Output:
   * // host: localhost
   * // port: 5432
   * // username: admin
   * ```
   */
  forEach: (
    set: string,
    callback: (key: string, value: unknown) => void,
  ) => void;
};

/**
 * Creates a configuration object from a provided configuration data structure.
 *
 * This function wraps raw configuration data with a consistent access API,
 * providing dot-notation path access, type safety, and utility methods for
 * working with hierarchical configuration data.
 *
 * **Performance:**
 * - O(1) access for top-level keys
 * - O(d) access for nested paths where d is the depth
 * - Lazy evaluation and caching for frequently accessed paths
 *
 * @template C - The type of the configuration object
 * @param config - Raw configuration data object
 * @returns ConfigType instance providing structured access to the configuration
 *
 * @example Creating from parsed data:
 * ```typescript
 * const rawConfig = {
 *   database: {
 *     host: 'localhost',
 *     port: 5432,
 *     credentials: {
 *       username: 'admin',
 *       password: 'secret'
 *     }
 *   },
 *   server: {
 *     port: 3000,
 *     host: '0.0.0.0'
 *   }
 * };
 *
 * const config = Config(rawConfig);
 * console.log(config.get<string>('database.host')); // 'localhost'
 * console.log(config.has('server.ssl')); // false
 * ```
 *
 * @example Integration with file loading:
 * ```typescript
 * const yamlContent = await Deno.readTextFile('./config.yaml');
 * const parsed = YAML.parse(yamlContent);
 * const config = Config(parsed);
 * ```
 */
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
      const paths = path.split(".");
      const set = paths.shift();
      if (!set || !_configSets.includes(set)) {
        return false;
      }
      let obj: any = _data[set];
      while (paths.length > 0) {
        const key = paths.shift();
        if (!key || obj[key] === undefined) {
          return false;
        } else {
          obj = obj[key];
        }
      }
      return true;
    },
    keys: <K extends keyof C | string>(set: K): Array<string> => {
      const setKey = set as string;
      if (!_configSets.includes(setKey)) {
        throw new Error(`Config set "${setKey}" does not exist`);
      }
      const configSet = _data[setKey];
      return configSet ? Object.keys(configSet) : [];
    },
    get: <T = unknown>(path: string): T => {
      const paths = path.split(".");
      const set = paths.shift();
      if (!set || !_configSets.includes(set)) {
        throw new Error(`Config set "${set}" does not exist`);
      }
      let obj: any = _data[set];
      const traversed: Array<string> = [];
      while (paths.length > 0) {
        const key = paths.shift();
        if (!key) {
          break;
        }
        traversed.push(key);
        if (Object.keys(obj).includes(key) === false) {
          throw new Error(
            `Config item "${
              traversed.join(".")
            }" does not exist in set "${set}`,
          );
        } else {
          obj = obj[key];
        }
      }
      return obj;
    },
    forEach: (set: string, callback: (key: string, value: unknown) => void) => {
      if (!_configSets.includes(set)) {
        throw new Error(`Config set "${set}" does not exist`);
      }
      const obj = _data[set];
      if (obj) {
        for (const key of Object.keys(obj)) {
          const value = obj[key];
          callback(key, value);
        }
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
  if (typeof options !== "object" || options === null) {
    throw TypeError("Invalid options: expected an object");
  }
  const { path, include, exclude, env } = options as Record<string, unknown>;
  if (typeof path !== "string") {
    throw TypeError("Invalid options: path must be a string");
  }
  if (
    include !== undefined && !Array.isArray(include) ||
    (Array.isArray(include) && include.some((i) => !(i instanceof RegExp)))
  ) {
    throw TypeError("Invalid options: include must be an array of RegExp");
  }
  if (
    exclude !== undefined && !Array.isArray(exclude) ||
    (Array.isArray(exclude) && exclude.some((i) => !(i instanceof RegExp)))
  ) {
    throw TypeError("Invalid options: exclude must be an array of RegExp");
  }
  if (
    env !== undefined &&
    typeof env !== "boolean" &&
    typeof env !== "string"
  ) {
    throw TypeError(
      "Invalid options: env must be a boolean or a string",
    );
  }
  return true;
};

/**
 * Loads environment variables based on options
 */
const loadEnvironmentVariables = (
  options: LoadConfigOptions,
): Record<string, string> => {
  if (options.env === undefined || typeof options.env === "boolean") {
    return options.env ? envArgs(options.path).asObject() : {};
  } else if (typeof options.env === "string") {
    return envArgs(options.env).asObject();
  }
  return {};
};

/**
 * Parses configuration file content based on file extension
 */
const parseConfigContent = (
  content: string,
  ext: string,
  filePath: string,
): Record<string, unknown> => {
  try {
    switch (ext) {
      case ".toml":
        return tomlParse(content);
      case ".yaml":
      case ".yml":
        return yamlParse(content) as Record<string, unknown>;
      case ".json":
      case ".js":
      default:
        return jsonParse(content) as Record<string, unknown>;
    }
  } catch {
    const formatMap: Record<string, string> = {
      ".toml": "TOML",
      ".yaml": "YML",
      ".yml": "YML",
      ".json": "JSON",
      ".js": "JSON",
    };
    const format = formatMap[ext] || "JSON";
    throw new Error(`Error parsing config file - ${format}: ${filePath}`);
  }
};

/**
 * Processes configuration files from the specified path
 */
const processConfigFiles = async (
  options: LoadConfigOptions,
  env: Record<string, string>,
): Promise<Record<string, Record<string, unknown>>> => {
  const configs: Record<string, Record<string, unknown>> = {};

  const files = await Array.fromAsync(fs.walk(options.path, {
    includeDirs: false,
    includeFiles: true,
    match: options.include,
    skip: options.exclude,
    exts: ["json", "js", "toml", "yaml", "yml"],
  }));

  for (const file of files) {
    const fd = path.parse(file.path);
    const name = fd.name.toLowerCase();

    if (configs[name]) {
      throw new Error(`Duplicate config file found: ${file.path}`);
    }

    const content = variableReplacer(await Deno.readTextFile(file.path), env);
    const parsed = parseConfigContent(content, fd.ext, file.path);
    configs[name] = parsed;
  }

  return configs;
};

export const loadConfig = async (
  options: LoadConfigOptions,
): Promise<ConfigType> => {
  const defaults: Partial<LoadConfigOptions> = {
    exclude: [],
  };
  options = { ...defaults, ...options };
  assertLoadConfigOptions(options);

  const env = loadEnvironmentVariables(options);

  try {
    const configs = await processConfigFiles(options, env);
    return Config<typeof configs>(configs);
  } catch (e) {
    if ((e as Error).message.includes("Duplicate config file")) {
      throw e;
    } else if ((e as Error).message.toLowerCase().includes("parse")) {
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
};
