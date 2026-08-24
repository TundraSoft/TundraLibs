# Utils - Config

Multi-format configuration file loader with environment variable substitution and directory filtering.

[← Back to Utils](../README.md)

## Overview

The Config utility provides a powerful system for loading and managing application configuration from multiple file formats (JSON, YAML, TOML) with support for:

- **Multiple Formats**: `.json`, `.js`, `.yaml`/`.yml`, `.toml` — see
  [Supported File Formats](#supported-file-formats) for the exact
  extension list the loader scans for.
- **Environment Variables**: Opt-in `${VAR}` substitution, via the `env` option
- **Directory Filtering**: Include/exclude patterns for selective loading
- **Type Safety**: Full TypeScript support with generic types
- **Nested Access**: Dot notation for deep object traversal
- **Validation**: Built-in checks for duplicate and malformed configs

## Installation

```bash
deno add @tundralibs/utils
```

## API Reference

### `loadConfig(options: LoadConfigOptions): Promise<ConfigType>`

Loads configuration files from a directory and returns a Config object.

**Parameters:**

| Parameter         | Type                | Required | Description                                                                                              |
| ----------------- | ------------------- | -------- | -------------------------------------------------------------------------------------------------------- |
| `options.path`    | `string`            | Yes      | Directory path containing config files                                                                   |
| `options.env`     | `boolean \| string` | No       | `true` loads `.env` from `options.path`; a string loads it from that path; omitted means no substitution |
| `options.include` | `RegExp[]`          | No       | Patterns to include specific files                                                                       |
| `options.exclude` | `RegExp[]`          | No       | Patterns to exclude specific files                                                                       |

`env` selects a source, it is not a bag of variables — pass `true` or a
path, never a `Record`. Substitution is **off** unless you ask for it.
When it is on, values come from the system environment, the `.env` file,
and Docker secrets, merged in that order (see
[envArgs](Utils-EnvArgs.md)).

**Returns:** `Promise<ConfigType>` - Configuration object with typed access methods

### ConfigType Methods

#### `get<T>(path: string): T` — `get<T>(path: string, defaultValue: T): T`

Resolves a dot-separated path and casts the result to `T`. Two overloads,
one difference: what happens when the path does not resolve.

- **Without a default**, `get` **throws** — `Config set "…" does not
  exist` for an unknown set, `Config item "…" does not exist in set "…"`
  for anything deeper.
- **With a default**, it returns the default instead of throwing.

The default applies in exactly the cases [`has`](#haspath-string-boolean)
reports as `false`: an unknown set, a missing segment, a path running
through a `null` intermediate or a primitive, and a key that exists but
holds `undefined`. So `config.get(p, d)` is `config.has(p) ? config.get(p) : d`.

A stored `null` is a value the config author wrote down, so it is
returned as-is — as are the falsy `0`, `''` and `false`. The default
replaces _missing_, not _falsy_.

Both overloads return `T`; passing a default never widens the result to
`T | undefined`.

```typescript
import { loadConfig } from '@tundralibs/utils';

const config = await loadConfig({ path: './config' });

// Required — throws if 'server.port' is not configured.
const port = config.get<number>('server.port');

// Optional — falls back to 3000 when it is not.
const fallbackPort = config.get<number>('server.port', 3000);
```

#### `has(path: string): boolean`

Checks whether a path resolves to a defined value. Never throws — an
unknown set, a missing segment and a key holding `undefined` all return
`false`.

```typescript
import { loadConfig } from '@tundralibs/utils';

const config = await loadConfig({ path: './config' });

if (config.has('database.host')) {
  // Connect to database
}
```

#### `list(): string[]`

Returns list of all root configuration keys.

```typescript
import { loadConfig } from '@tundralibs/utils';

const config = await loadConfig({ path: './config' });

const configs = config.list(); // ['database', 'server', 'logging']
```

#### `forEach(set: string, callback: (key: string, value: unknown) => void): void`

Iterates the **direct entries of one set** — the top level of a single
config file. The first argument is a set name, not a path: passing
`'server.hosts'` throws `Config set "server.hosts" does not exist`. The
callback receives the key and the value as two arguments.

```typescript
import { loadConfig } from '@tundralibs/utils';

const config = await loadConfig({ path: './config' });

// 'database' is a set — i.e. the file database.json / .yaml / .toml.
config.forEach('database', (key, value) => {
  console.log(key, value);
});
```

#### `keys(set: string): string[]`

Returns the direct keys of one set. Like `forEach`, it takes a set name
— required, and top-level only — and throws if the set is unknown. Use
`list()` for the set names themselves, and `get()` to reach anything
deeper.

```typescript
import { loadConfig } from '@tundralibs/utils';

const config = await loadConfig({ path: './config' });

const dbKeys = config.keys('database'); // ['host', 'port', 'name']
```

## Usage Examples

### Basic Configuration Loading

```typescript
import { loadConfig } from '@tundralibs/utils';

// Load all config files from directory
const config = await loadConfig({
  path: './config',
});

// Access configuration values
const dbHost = config.get<string>('database.host');
const dbPort = config.get<number>('database.port');
```

### Environment Variable Substitution

**Config file (config.json):**

```json
{
  "database": {
    "host": "${DB_HOST}",
    "port": "${DB_PORT}",
    "password": "${DB_PASSWORD}"
  }
}
```

**TypeScript:**

```typescript
import { loadConfig } from '@tundralibs/utils';

// `env: true` reads .env from the config directory, plus system env
const config = await loadConfig({ path: './config', env: true });

// Or point at a specific .env file
const custom = await loadConfig({
  path: './config',
  env: './config/.env',
});

console.log(custom.get('database.host')); // 'localhost'
```

### Selective File Loading

```typescript
import { loadConfig } from '@tundralibs/utils';

// Load only database configurations
const config = await loadConfig({
  path: './config',
  include: [/database/i, /db/i],
});

// Exclude test configurations
const withoutTests = await loadConfig({
  path: './config',
  exclude: [/test/i, /mock/i],
});
```

### Multiple File Formats

The loader automatically detects and parses different formats:

**config.json:**

```json
{
  "app": {
    "name": "MyApp",
    "version": "1.0.0"
  }
}
```

**database.yaml:**

```yaml
host: localhost
port: 5432
ssl: true
```

**logging.toml:**

```toml
[console]
level = "info"
colors = true

[file]
path = "/var/log/app.log"
```

```typescript
import { loadConfig } from '@tundralibs/utils';

const config = await loadConfig({ path: './config' });

// Access from any format
console.log(config.get('app.name')); // From JSON
console.log(config.get('database.host')); // From YAML
console.log(config.get('logging.console.level')); // From TOML
```

### Nested Object Access

```typescript
import { loadConfig } from '@tundralibs/utils';

const config = await loadConfig({ path: './config' });

// Deep object traversal with dot notation
const timeout = config.get<number>('server.http.options.timeout');

// Iterate the direct entries of a set
config.forEach('server', (key, value) => {
  console.log(`${key} = ${value}`);
});

// Check nested paths
if (config.has('server.http.ssl.enabled')) {
  // Setup SSL
}
```

### Type-Safe Access

```typescript
import { loadConfig } from '@tundralibs/utils';

interface DatabaseConfig {
  host: string;
  port: number;
  ssl: boolean;
}

const config = await loadConfig({ path: './config' });

// Type-safe retrieval
const dbConfig: DatabaseConfig = {
  host: config.get<string>('database.host'),
  port: config.get<number>('database.port'),
  ssl: config.get<boolean>('database.ssl'),
};
```

### Working with Arrays

**config.json:**

```json
{
  "servers": [
    { "name": "web1", "ip": "10.0.0.1" },
    { "name": "web2", "ip": "10.0.0.2" }
  ]
}
```

The file is the set, so the array sits at `config.servers`. An array is
an ordinary value — `forEach` iterates a set's direct entries, not the
contents of one of them, so iterate the array itself:

```typescript
import { loadConfig } from '@tundralibs/utils';

const config = await loadConfig({ path: './config' });

type Server = { name: string; ip: string };

const servers = config.get<Array<Server>>('config.servers', []);

for (const server of servers) {
  console.log(`${server.name}: ${server.ip}`);
}
```

## Error Handling

Directory-read failures surface as the typed errors `loadConfig`'s
underlying `readDir` call (`@tundralibs/compat/file`) throws —
`FileNotFound` and `FileAccessDenied` — not generic `Error`s with a
particular substring. `loadConfig` itself throws plain `Error` for a
duplicate basename or a parse failure:

```typescript
import { loadConfig } from '@tundralibs/utils';
import { FileAccessDenied, FileNotFound } from '@tundralibs/compat/file';

try {
  const config = await loadConfig({ path: './config' });
} catch (err) {
  if (err instanceof FileNotFound) {
    console.error('Configuration directory not found:', err.path);
  } else if (err instanceof FileAccessDenied) {
    console.error('Insufficient permissions to read config:', err.path);
  } else if (
    err instanceof Error && err.message.includes('Duplicate config file')
  ) {
    console.error('Multiple files with the same basename found');
  } else if (err instanceof Error && err.message.includes('Error parsing')) {
    console.error('Invalid configuration file format:', err.cause);
  } else {
    throw err;
  }
}
```

## Best Practices

### 1. Organize Configs by Feature

```
config/
├── database.json     # Database settings
├── server.yaml       # Server configuration
├── logging.toml      # Logging setup
└── features.json     # Feature flags
```

### 2. Use Environment-Specific Configs

`Deno.env` / `process.env` are runtime-specific globals; use
[`envArgs`](Utils-EnvArgs.md) to read the selector portably:

```typescript
import { envArgs, loadConfig } from '@tundralibs/utils';

const env = envArgs().get('ENVIRONMENT') ?? 'development';
const config = await loadConfig({
  path: `./config/${env}`,
  include: [/^(?!test)/], // Exclude test configs
});
```

### 3. Provide Sensible Defaults

```typescript
import { loadConfig } from '@tundralibs/utils';

const config = await loadConfig({ path: './config' });

const port = config.get<number>('server.port', 3000);
const host = config.get<string>('server.host', '0.0.0.0');
const workers = config.get<number>('server.workers', 4);
```

Each call returns `number` / `string`, not `number | undefined` — the
default is part of the result type, so there is nothing to narrow
afterwards. Reserve the no-default form for values the application
cannot start without, and let it throw.

### 4. Validate Required Values

```typescript
import { loadConfig } from '@tundralibs/utils';

const config = await loadConfig({ path: './config' });

const requiredKeys = ['database.host', 'api.key', 'server.port'];

for (const key of requiredKeys) {
  if (!config.has(key)) {
    throw new Error(`Missing required configuration: ${key}`);
  }
}
```

## Supported File Formats

| Format | Extensions scanned | Parser       | Features                            |
| ------ | ------------------ | ------------ | ----------------------------------- |
| JSON   | `.json`, `.js`     | `@std/jsonc` | `//` and `/* */` comments tolerated |
| YAML   | `.yaml`, `.yml`    | `@std/yaml`  | Anchors, aliases                    |
| TOML   | `.toml`            | `@std/toml`  | Sections, nested tables             |

> `.json` files may contain JSONC-style comments — the parser used for
> `.json`/`.js` is `@std/jsonc` regardless of extension — but the
> directory scan itself only picks up the five extensions above. **A
> file literally named `*.jsonc` is invisible to `loadConfig`**
> (silently not loaded, no error): put comments in a `.json`-extension
> file instead. Likewise `.js` is scanned and parsed as JSONC, not
> executed.

## Performance Notes

- **Async Loading**: All file operations are asynchronous
- **Lazy Evaluation**: Environment variable substitution happens at load time
- **Caching**: Loaded configs are returned as an object (not cached between calls)
- **File Filtering**: Uses optimized directory reading from compat layer

## Common Pitfalls

### 1. Variable Not Substituted

**Problem:** Variable shows as `${VAR}` instead of value

```typescript
import { loadConfig } from '@tundralibs/utils';

// Wrong - substitution is off unless you ask for it
const config = await loadConfig({ path: './config' });
```

**Solution:**

```typescript
import { loadConfig } from '@tundralibs/utils';

// Correct - env enabled
const config = await loadConfig({ path: './config', env: true });
```

### 2. Undefined Values

**Problem:** Getting `undefined` for existing config

```typescript
import { loadConfig } from '@tundralibs/utils';

const config = await loadConfig({ path: './config' });

// Wrong - incorrect key path
const value = config.get('database-host'); // throws
```

**Solution:**

```typescript
import { loadConfig } from '@tundralibs/utils';

const config = await loadConfig({ path: './config' });

// Correct - use dot notation
const value = config.get('database.host');
```

### 3. Type Errors

**Problem:** Runtime type mismatch

```typescript
import { loadConfig } from '@tundralibs/utils';

const config = await loadConfig({ path: './config' });

// Wrong - assuming type
const port = config.get<number>('server.port') + 100; // Could be string!
```

**Solution:**

```typescript
import { loadConfig } from '@tundralibs/utils';

const config = await loadConfig({ path: './config' });

// Correct - explicit type and validation
const port = config.get<number>('server.port');
if (typeof port !== 'number') {
  throw new Error('Invalid port configuration');
}
```

## Related Utilities

- [envArgs](Utils-EnvArgs.md) - Load environment variables and .env files
- [variableReplacer](Utils-VariableReplacer.md) - Template variable substitution

[← Back to Utils](../README.md)
