/**
 * @fileoverview `loadConfig({ path })` — read JSON / JSONC / YAML /
 * TOML files from a directory, substitute `${VAR}` placeholders from
 * `.env` (optional), and expose them through the dot-path
 * {@link ConfigType} accessor.
 *
 * Each file becomes one config "set" named after the basename
 * (lowercased, without extension): `database.yaml` →
 * `config.get('database.host')`.
 *
 * @module
 */

// deno-lint-ignore-file no-explicit-any
import * as path from '@tundralibs/compat/path';
import { readDir, readTextFile } from '@tundralibs/compat/file';
import { parse as jsonParse } from '@std/jsonc';
import { parse as tomlParse } from '@std/toml';
import { parse as yamlParse } from '@std/yaml';
import { envArgs } from './envArgs.ts';
import { variableReplacer } from './variableReplacer.ts';

/**
 * Read-only view over loaded config sets, accessed by dot path.
 * Top-level keys are "sets" (one per file); deeper segments traverse
 * the parsed object tree.
 */
export type ConfigType = {
  /** Names of all loaded sets (one per config file). */
  list: () => Array<string>;
  /**
   * Whether `path` (e.g. `'database.host'`) resolves to a defined value.
   * Returns `false` (never throws) when the path runs through a `null`
   * intermediate or a primitive — a numeric segment does not index into
   * string characters (`'db1'.0` is not a match).
   */
  has: (path: string) => boolean;
  /** Direct keys of `set`. Throws if the set is unknown. */
  keys: (set: string) => Array<string>;
  /**
   * Resolve `path` and cast to `T`, in one of two forms.
   *
   * `get(path)` — no default — throws when the path does not resolve.
   *
   * `get(path, defaultValue)` returns `defaultValue` instead of throwing.
   * It does so in exactly the cases {@link ConfigType.has} reports as
   * `false`: an unknown set, a missing segment, a path running through a
   * `null` intermediate or a primitive, or a key that exists but holds
   * `undefined`. A stored `null` is a real value — it is returned as-is,
   * never replaced by the default.
   *
   * Both forms return `T`; supplying a default never widens the result
   * to `T | undefined`.
   *
   * @throws {Error} Single-argument form only: if any segment is missing,
   *   or the path runs through a `null` intermediate or a primitive
   *   (reported as the friendly `Config item "…" does not exist` error,
   *   never a raw `TypeError`); numeric segments never index into string
   *   characters. The two-argument form returns the default instead.
   */
  get: {
    <T = unknown>(path: string): T;
    <T = unknown>(path: string, defaultValue: T): T;
  };
  /** Iterate the direct entries of `set`. Throws if the set is unknown. */
  forEach: (
    set: string,
    callback: (key: string, value: unknown) => void,
  ) => void;
};

/**
 * Wrap an already-parsed `{ set: { ... } }` record in a
 * {@link ConfigType} accessor. Used by {@link loadConfig} after
 * parsing files; expose directly when you've parsed config yourself.
 *
 * @typeParam C - Shape of the parsed config record.
 * @param config - Object whose top-level keys are config-set names.
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
      const paths = path.split('.');
      const set = paths.shift();
      if (!set || !_configSets.includes(set)) {
        return false;
      }
      let obj: any = _data[set];
      while (paths.length > 0) {
        const key = paths.shift();
        // Stop at any non-traversable node before dereferencing it: a `null`
        // intermediate (e.g. YAML's `replica:` → null) would throw
        // "Cannot read properties of null", and a primitive such as a string
        // would expose character indices (`'db1'.0` → 'd'). `has()` must
        // report whether the path resolves — return false, never throw.
        if (!key || obj === null || typeof obj !== 'object') {
          return false;
        }
        if (obj[key] === undefined) {
          return false;
        }
        obj = obj[key];
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
    // The rest tuple is what separates `get(path)` from
    // `get(path, undefined)`: only an argument that was actually passed
    // gives `defaultValue.length === 1`, so the no-default form keeps
    // throwing exactly as before. Callers see the overload pair declared
    // on ConfigType['get'], not this signature.
    get: <T = unknown>(path: string, ...defaultValue: [T] | []): T => {
      const paths = path.split('.');
      const set = paths.shift();
      if (!set || !_configSets.includes(set)) {
        if (defaultValue.length === 1) {
          return defaultValue[0];
        }
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
        // A `null`/`undefined` intermediate (e.g. YAML's `replica:` → null) or
        // a primitive such as a string has no traversable members. Report the
        // documented "does not exist" error instead of throwing a raw
        // TypeError from `Object.keys(null)` or silently indexing into string
        // characters (`'db1'.0` → 'd'). The `typeof` guard also short-circuits
        // before `Object.keys` ever runs on a non-object.
        if (
          obj === null || typeof obj !== 'object' ||
          Object.keys(obj).includes(key) === false
        ) {
          if (defaultValue.length === 1) {
            return defaultValue[0];
          }
          throw new Error(
            `Config item "${
              traversed.join('.')
            }" does not exist in set "${set}"`,
          );
        } else {
          obj = obj[key];
        }
      }
      // A key that is present but holds `undefined` is what `has()` calls
      // missing, so the defaulting form treats it the same way — keeping
      // `get(p, d)` equivalent to `has(p) ? get(p) : d`. `null` is a value
      // the config author wrote down, so it survives untouched. The
      // no-default form is unchanged: it still hands back the `undefined`.
      if (obj === undefined && defaultValue.length === 1) {
        return defaultValue[0];
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

/** Options for {@link loadConfig}. */
export type LoadConfigOptions = {
  /** Directory containing the config files. */
  path: string;
  /** If set, only files whose names match one of these patterns are loaded. */
  include?: Array<RegExp>;
  /** Files matching any of these patterns are skipped. */
  exclude?: Array<RegExp>;
  /**
   * `true`: load `.env` from `path`.
   * `string`: load `.env` from this path.
   * `false` / `undefined`: no env substitution.
   */
  env?: boolean | string;
};

/**
 * Runtime type guard for {@link LoadConfigOptions} — throws `TypeError`
 * with a specific message on the first invalid field.
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

const loadEnvironmentVariables = (
  options: LoadConfigOptions,
): Record<string, string> => {
  if (options.env === undefined || typeof options.env === 'boolean') {
    return options.env ? envArgs(options.path).asObject() : {};
  } else if (typeof options.env === 'string') {
    return envArgs(options.env).asObject();
  }
  return {};
};

// Dispatch to the right parser by extension. `.json`/`.js` go through
// jsonc so comments are tolerated. The catch wraps the parser error
// with the file path so callers can locate the offending file.
const parseConfigContent = (
  content: string,
  ext: string,
  filePath: string,
): Record<string, unknown> => {
  try {
    switch (ext) {
      case '.toml':
        return tomlParse(content);
      case '.yaml':
      case '.yml':
        return yamlParse(content) as Record<string, unknown>;
      case '.json':
      case '.js':
      default:
        return jsonParse(content) as Record<string, unknown>;
    }
  } catch (cause) {
    const formatMap: Record<string, string> = {
      '.toml': 'TOML',
      '.yaml': 'YML',
      '.yml': 'YML',
      '.json': 'JSON',
      '.js': 'JSON',
    };
    const format = formatMap[ext] || 'JSON';
    // Preserve the underlying parser error as `cause` so callers can inspect
    // the real syntax error (line/column/message) instead of only the path.
    throw new Error(`Error parsing config file - ${format}: ${filePath}`, {
      cause,
    });
  }
};

const processConfigFiles = async (
  options: LoadConfigOptions,
  env: Record<string, string>,
): Promise<Record<string, Record<string, unknown>>> => {
  const configs: Record<string, Record<string, unknown>> = {};

  for await (
    const entry of readDir(options.path, {
      includeDirs: false,
      skip: options.exclude,
      match: options.include,
      exts: ['.json', '.js', '.toml', '.yaml', '.yml'],
    })
  ) {
    const ext = path.extname(entry.name).toLowerCase();
    const filePath = entry.path; // Use the full path from entry
    const fd = path.parse(filePath);
    const name = fd.name.toLowerCase();

    if (configs[name]) {
      throw new Error(`Duplicate config file found: ${filePath}`);
    }

    const content = variableReplacer(
      await readTextFile(filePath),
      env,
    );
    const parsed = parseConfigContent(content, ext, filePath);
    configs[name] = parsed;
  }

  return configs;
};

/**
 * Load every supported config file under `options.path`, substitute
 * `${VAR}` placeholders from `.env` (when `env` is set), parse, and
 * return a {@link ConfigType} accessor.
 *
 * Each file becomes a set named after its lowercased basename:
 * `database.yaml` → `config.get('database.host')`. Two files with the
 * same basename (e.g., `db.json` and `db.yaml`) raise an error.
 *
 * @throws {@link TypeError} If `options` fails {@link assertLoadConfigOptions}.
 * @throws {Error} If the path is unreadable, files don't parse, or
 *   basenames collide.
 *
 * @example
 * ```typescript
 * const config = await loadConfig({ path: './config', env: true });
 * config.get<string>('database.host');
 * ```
 *
 * @see {@link Config} {@link LoadConfigOptions} {@link variableReplacer}
 */
export const loadConfig = async (
  options: LoadConfigOptions,
): Promise<ConfigType> => {
  const defaults: Partial<LoadConfigOptions> = {
    exclude: [],
  };
  options = { ...defaults, ...options };
  assertLoadConfigOptions(options);

  const env = loadEnvironmentVariables(options);

  const configs = await processConfigFiles(options, env);
  return Config<typeof configs>(configs);
};
