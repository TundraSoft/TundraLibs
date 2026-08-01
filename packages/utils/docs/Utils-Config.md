# Utils - Config

Multi-format configuration file loader with environment variable substitution and directory filtering.

[← Back to Utils](../README.md)

## Overview

The Config utility provides a powerful system for loading and managing application configuration from multiple file formats (JSON, YAML, TOML) with support for:

- **Multiple Formats**: JSON, JSONC, YAML, TOML
- **Environment Variables**: Automatic substitution with `${VAR}` syntax
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

| Parameter         | Type                                | Required | Description                                              |
| ----------------- | ----------------------------------- | -------- | -------------------------------------------------------- |
| `options.path`    | `string`                            | Yes      | Directory path containing config files                   |
| `options.env`     | `boolean \| Record<string, string>` | No       | Environment variables for substitution (default: `true`) |
| `options.include` | `RegExp[]`                          | No       | Patterns to include specific files                       |
| `options.exclude` | `RegExp[]`                          | No       | Patterns to exclude specific files                       |

**Returns:** `Promise<ConfigType>` - Configuration object with typed access methods

### ConfigType Methods

#### `get<T>(key: string, defaultValue?: T): T | undefined`

Retrieves a configuration value by key with optional default.

```typescript
const port = config.get<number>('server.port', 3000);
```

#### `has(key: string): boolean`

Checks if a configuration key exists.

```typescript
if (config.has('database.host')) {
  // Connect to database
}
```

#### `list(): string[]`

Returns list of all root configuration keys.

```typescript
const configs = config.list(); // ['database', 'server', 'logging']
```

#### `forEach(key: string, callback: Function): void`

Iterates over array or object values.

```typescript
config.forEach('servers', (server) => {
  console.log(server.name);
});
```

#### `keys(key?: string): string[]`

Returns keys at the specified path or root level.

```typescript
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
const dbPort = config.get<number>('database.port', 5432);
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
// Automatically uses system environment variables
const config = await loadConfig({ path: './config' });

// Or provide custom environment
const config = await loadConfig({
  path: './config',
  env: {
    DB_HOST: 'localhost',
    DB_PORT: '5432',
    DB_PASSWORD: 'secret',
  },
});

console.log(config.get('database.host')); // 'localhost'
```

### Selective File Loading

```typescript
// Load only database configurations
const config = await loadConfig({
  path: './config',
  include: [/database/i, /db/i],
});

// Exclude test configurations
const config = await loadConfig({
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
const config = await loadConfig({ path: './config' });

// Access from any format
console.log(config.get('app.name')); // From JSON
console.log(config.get('database.host')); // From YAML
console.log(config.get('logging.console.level')); // From TOML
```

### Nested Object Access

```typescript
const config = await loadConfig({ path: './config' });

// Deep object traversal with dot notation
const timeout = config.get<number>('server.http.options.timeout');

// Array access
config.forEach('server.hosts', (host) => {
  console.log(`Connecting to ${host}`);
});

// Check nested paths
if (config.has('server.http.ssl.enabled')) {
  // Setup SSL
}
```

### Type-Safe Access

```typescript
interface DatabaseConfig {
  host: string;
  port: number;
  ssl: boolean;
}

const config = await loadConfig({ path: './config' });

// Type-safe retrieval
const dbConfig = {
  host: config.get<string>('database.host')!,
  port: config.get<number>('database.port', 5432),
  ssl: config.get<boolean>('database.ssl', false),
};
```

### Working with Arrays

```typescript
// config.json
{
  "servers": [
    { "name": "web1", "ip": "10.0.0.1" },
    { "name": "web2", "ip": "10.0.0.2" }
  ]
}

// Access array elements
const servers = config.get<Array<any>>('servers');

// Iterate with forEach
config.forEach('servers', (server) => {
  console.log(`${server.name}: ${server.ip}`);
});
```

## Error Handling

```typescript
try {
  const config = await loadConfig({ path: './config' });
} catch (error) {
  if (error.message.includes('Config path not found')) {
    console.error('Configuration directory not found');
  } else if (error.message.includes('Permission denied')) {
    console.error('Insufficient permissions to read config');
  } else if (error.message.includes('Duplicate config file')) {
    console.error('Multiple files with same name found');
  } else if (error.message.includes('Error parsing')) {
    console.error('Invalid configuration file format');
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

```typescript
const env = Deno.env.get('ENVIRONMENT') || 'development';
const config = await loadConfig({
  path: `./config/${env}`,
  include: [/^(?!test)/], // Exclude test configs
});
```

### 3. Provide Sensible Defaults

```typescript
const port = config.get<number>('server.port', 3000);
const host = config.get<string>('server.host', '0.0.0.0');
const workers = config.get<number>('server.workers', 4);
```

### 4. Validate Required Values

```typescript
const requiredKeys = ['database.host', 'api.key', 'server.port'];

for (const key of requiredKeys) {
  if (!config.has(key)) {
    throw new Error(`Missing required configuration: ${key}`);
  }
}
```

## Supported File Formats

| Format | Extensions        | Parser       | Features                    |
| ------ | ----------------- | ------------ | --------------------------- |
| JSON   | `.json`, `.jsonc` | `@std/jsonc` | Comments support with JSONC |
| YAML   | `.yaml`, `.yml`   | `@std/yaml`  | Anchors, aliases            |
| TOML   | `.toml`           | `@std/toml`  | Sections, nested tables     |

## Performance Notes

- **Async Loading**: All file operations are asynchronous
- **Lazy Evaluation**: Environment variable substitution happens at load time
- **Caching**: Loaded configs are returned as an object (not cached between calls)
- **File Filtering**: Uses optimized directory reading from compat layer

## Common Pitfalls

### 1. Variable Not Substituted

**Problem:** Variable shows as `${VAR}` instead of value

```typescript
// Wrong - env disabled
const config = await loadConfig({ path: './config', env: false });
```

**Solution:**

```typescript
// Correct - env enabled (default)
const config = await loadConfig({ path: './config' });
```

### 2. Undefined Values

**Problem:** Getting `undefined` for existing config

```typescript
// Wrong - incorrect key path
const value = config.get('database-host'); // undefined
```

**Solution:**

```typescript
// Correct - use dot notation
const value = config.get('database.host');
```

### 3. Type Errors

**Problem:** Runtime type mismatch

```typescript
// Wrong - assuming type
const port = config.get('server.port') + 100; // Could be string!
```

**Solution:**

```typescript
// Correct - explicit type and validation
const port = config.get<number>('server.port', 3000);
if (typeof port !== 'number') {
  throw new Error('Invalid port configuration');
}
```

## Related Utilities

- [envArgs](Utils-EnvArgs.md) - Load environment variables and .env files
- [variableReplacer](Utils-VariableReplacer.md) - Template variable substitution

[← Back to Utils](../README.md)
