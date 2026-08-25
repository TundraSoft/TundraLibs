# Utils - envArgs

Environment variable and configuration loader with .env file and Docker secrets support.

[← Back to Utils](../README.md)

## Overview

envArgs provides secure, flexible loading of environment variables from multiple sources:

- **System Environment**: Access system env variables
- **.env Files**: Parse .env files with quote handling
- **Docker Secrets**: Load secrets from /run/secrets
- **Permission-Aware**: Skips a source instead of throwing when its
  permission isn't granted (Deno-only gating — Bun/Node have no
  equivalent and are always treated as granted)
- **Read-only result**: wraps the merged variables in a
  [`PrivateObject`](Utils-PrivateObject.md) with mutations disabled —
  `set`/`delete`/`clear` silently no-op rather than throw (not
  `Object.freeze`)

## Installation

```bash
deno add @tundralibs/utils
```

## API Reference

### `envArgs(envFilePath?: string, loadDockerSecrets?: boolean | string): PrivateObject<Record<string, string>>`

Loads environment variables from multiple sources.

**Parameters:**

- `envFilePath` — a directory (its `.env` is loaded) or a path ending
  in `.env`. Default: `'./'`.
- `loadDockerSecrets` — `true` (**default**) reads every file under
  `/run/secrets` as a `key=filename` secret; `false` disables Docker
  secrets entirely; a string overrides the secrets directory path
  (useful in tests).

> Docker secrets loading is **on by default** — passing no second
> argument still reads `/run/secrets` when it exists and is readable.
> Pass `false` explicitly to opt out.

**Returns:** Immutable object with environment variables

**Merge order** (later overrides earlier, same key wins by source
priority — not call order):

1. System environment (needs `env` permission; Deno gates this via
   `Deno.permissions`, Bun/Node have no equivalent gate and are always
   treated as granted)
2. `.env` file (needs `read` permission on the file)
3. Docker secrets directory (needs `read` permission on the directory)

A source with no permission is silently skipped — `envArgs` never
throws on a missing file, a malformed `.env` line, or denied
permission; you simply get a smaller result.

> **Typed as always-present, but not.** `PrivateObject<Record<string,
> string>>.get('KEY')` is typed `string`, not `string | undefined` —
> TypeScript's `Record<string, string>` assumes every key exists. A
> missing key still returns `undefined` at runtime despite the type.
> Guard with `has()` or keep a `??` fallback; don't rely on the type
> to catch a missing variable.

## Usage Examples

### Basic Usage

```typescript
import { envArgs } from '@tundralibs/utils';

const env = envArgs();

// Access variables
const dbHost = env.get('DB_HOST') ?? 'localhost';
const apiKey = env.get('API_KEY');

// Check existence
if (env.has('DEBUG')) {
  console.log('Debug mode enabled');
}
```

### Loading .env File

**.env:**

```env
DB_HOST=localhost
DB_PORT=5432
API_KEY="secret-key-with-spaces"
DEBUG=true
MULTI_LINE="line1
line2"
```

**TypeScript:**

```typescript
import { envArgs } from '@tundralibs/utils';

const config = envArgs('./config/.env');

const dbConfig = {
  host: config.get('DB_HOST'),
  port: parseInt(config.get('DB_PORT') ?? '5432'),
  apiKey: config.get('API_KEY'),
};
```

### Docker Secrets

Docker secrets are read from `/run/secrets` by default — no flag
needed:

```typescript
import { envArgs } from '@tundralibs/utils';

const env = envArgs(); // Docker secrets loading is on by default

const dbPassword = env.get('db_password'); // From /run/secrets/db_password
```

Disable it, or point at a different secrets directory (e.g. in tests):

```typescript
import { envArgs } from '@tundralibs/utils';

const noSecrets = envArgs('./', false);
const customSecrets = envArgs('./', '/tmp/test-secrets');
```

### Iterating Variables

```typescript
import { envArgs } from '@tundralibs/utils';

const env = envArgs();

// Get all keys
const keys = env.keys();

// Iterate over all variables
env.forEach((key, value) => {
  if (key.startsWith('API_')) {
    console.log(`${key}: ${value}`);
  }
});
```

## .env File Format

```env
# Comments are ignored
KEY=value
QUOTED="value with spaces"
EMPTY=
MULTILINE="line1
line2"
```

## Best Practices

1. **Use Defaults**: Provide fallback values with `??` operator
2. **Type Conversion**: Parse numbers and booleans explicitly
3. **Validation**: Check required variables at startup
4. **Security**: Never log sensitive values

## Related Utilities

- [Config](Utils-Config.md) - Multi-format configuration loader
- [privateObject](Utils-PrivateObject.md) - Secure data encapsulation

[← Back to Utils](../README.md)
