# Cacher Errors

Error classes for the Cacher package.

![Deno](https://img.shields.io/badge/Deno-000000?logo=deno)
![Bun](https://img.shields.io/badge/Bun-f9f1e1?logo=bun)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white)
![Cloudflare Workers](https://img.shields.io/badge/Cloudflare%20Workers-F38020?logo=cloudflare&logoColor=white)
![Browser](https://img.shields.io/badge/Browser-4285F4?logo=googlechrome&logoColor=white)

## Overview

The `@tundralibs/cacher/errors` module exports two error classes and the error-code registry used by all cacher engines.

| Export                   | Kind  | Description                                       |
| ------------------------ | ----- | ------------------------------------------------- |
| `CacherError`            | class | Base error for manager-level failures             |
| `CacherEngineError`      | class | Engine-level error with a typed error code        |
| `CacherEngineErrorCodes` | const | Map of all valid error codes to message templates |
| `CacherEngineErrorCode`  | type  | Union of all valid `CacherEngineError` code keys  |
| `CacherErrorMeta`        | type  | Metadata shape required by `CacherEngineError`    |

## Installation

**Deno:**

```bash
deno add @tundralibs/cacher
```

**Bun:**

```bash
bunx jsr add @tundralibs/cacher
```

**Node.js:**

```bash
npx jsr add @tundralibs/cacher
```

## API Reference

### `CacherError`

Base error class for failures originating in the `Cacher` manager (engine registration, instance creation). Extends `BaseError` from `@tundralibs/utils`.

```typescript ignore
class CacherError<
  M extends Record<string, unknown> = Record<string, unknown>,
> extends BaseError<M> {
  constructor(message: string, meta: M, cause?: Error);
}
```

**Example:**

```typescript ignore
import { CacherError } from '@tundralibs/cacher';

try {
  Cacher.addEngine('MY_ENGINE', MyEngine);
  Cacher.addEngine('MY_ENGINE', MyEngine); // duplicate
} catch (err) {
  if (err instanceof CacherError) {
    console.error(err.message);
  }
}
```

### `CacherEngineError`

Typed error class for failures inside a cache engine (connection, operation, configuration). Extends `CacherError` and carries a `code` property drawn from `CacherEngineErrorCode`.

```typescript ignore
class CacherEngineError<M extends CacherErrorMeta = CacherErrorMeta>
  extends CacherError<M> {
  public readonly code: CacherEngineErrorCode;
  constructor(code: CacherEngineErrorCode, meta: M, cause?: Error);
}
```

**Properties:**

- `code` — The `CacherEngineErrorCode` key identifying the failure category
- `message` — Human-readable message from `CacherEngineErrorCodes[code]` with interpolated meta values
- `context` — The full `meta` object passed to the constructor

**Example:**

```typescript
import { Cacher, CacherEngineError } from '@tundralibs/cacher';

try {
  const cache = Cacher.create('REDIS', 'my-cache', {
    host: 'redis.example.com',
    port: 6379,
  });
  await cache.set('key', 'value');
} catch (err) {
  if (err instanceof CacherEngineError) {
    console.error(`[${err.code}] ${err.message}`);
    // e.g. [CONNECTION_FAILED] Failed to connect to REDIS: ...
  }
}
```

### `CacherErrorMeta`

Required metadata shape for `CacherEngineError`. All engine errors include at minimum:

```typescript
type CacherErrorMeta = {
  /** The cacher instance name */
  name: string;
  /** The engine identifier (e.g. 'REDIS', 'MEMORY') */
  engine: string;
  /** Present when an unrecognised code was supplied */
  originalCode?: string;
} & Record<string, unknown>;
```

### `CacherEngineErrorCodes`

Registry mapping each error code to its message template. Variables in `${…}` are interpolated from the `meta` object.

```typescript
const CacherEngineErrorCodes = {
  UNKNOWN_ERROR: 'Unknown error occurred',

  // Configuration
  CONFIG_MALFORMED: 'Configuration is malformed',
  CONFIG_MISSING: 'Configuration key ${configKey} is missing',
  CONFIG_INVALID: 'Configuration value for ${configKey} is invalid: ${reason}',

  // Connection
  CONNECTION_FAILED: 'Failed to connect to ${engine}: ${reason}',
  CONNECTION_TIMEOUT: 'Connection to ${engine} timed out after ${timeout}ms',
  CONNECTION_REFUSED: 'Connection to ${engine} was refused',
  CONNECTION_LOST: 'Connection to ${engine} was lost',
  CONNECTION_INVALID_CREDENTIALS: 'Invalid credentials for ${engine}',

  // Operations
  OPERATION_NOT_SUPPORTED:
    'Operation ${operation} is not supported in ${engine}',
  OPERATION_FAILED: 'Operation ${operation} failed: ${reason}',
  OPERATION_INVALID_PARAMS:
    'Invalid parameters for operation ${operation}: ${reason}',
  OPERATION_PERMISSION_DENIED: 'Permission denied for operation ${operation}',
} as const;
```

## Error Code Reference

`Raised by` marks the codes any of the three built-in engines (Memory,
Redis, Memcached) can actually throw today. The rest exist for custom
`AbstractEngine` subclasses to reuse instead of inventing ad-hoc codes —
catching them against a built-in engine's calls is dead code, not
defensive coding.

| Code                             | Category      | Raised by              | Description                                |
| -------------------------------- | ------------- | ---------------------- | ------------------------------------------ |
| `UNKNOWN_ERROR`                  | General       | (fallback, any engine) | Catch-all for unrecognised codes           |
| `CONFIG_MALFORMED`               | Configuration | custom engines only    | The supplied config object is malformed    |
| `CONFIG_MISSING`                 | Configuration | built-in engines       | A required config key is absent            |
| `CONFIG_INVALID`                 | Configuration | built-in engines       | A config value fails validation            |
| `CONNECTION_FAILED`              | Connection    | built-in engines       | Could not establish a connection           |
| `CONNECTION_TIMEOUT`             | Connection    | custom engines only    | Connection attempt exceeded the timeout    |
| `CONNECTION_REFUSED`             | Connection    | custom engines only    | Server actively refused the connection     |
| `CONNECTION_LOST`                | Connection    | custom engines only    | An established connection was dropped      |
| `CONNECTION_INVALID_CREDENTIALS` | Connection    | custom engines only    | Authentication failed                      |
| `OPERATION_NOT_SUPPORTED`        | Operation     | custom engines only    | The engine does not support this operation |
| `OPERATION_FAILED`               | Operation     | built-in engines       | The operation failed at runtime            |
| `OPERATION_INVALID_PARAMS`       | Operation     | built-in engines       | Invalid parameters passed to an operation  |
| `OPERATION_PERMISSION_DENIED`    | Operation     | custom engines only    | Insufficient permissions for the operation |

> **Redis/Memcached wrap every driver failure uniformly.** A bad password,
> a refused connection, a DNS failure, and a timeout during `connect()` all
> surface as `CONNECTION_FAILED` with the driver's message on `reason` — the
> built-in engines never distinguish them into `CONNECTION_REFUSED` /
> `CONNECTION_TIMEOUT` / `CONNECTION_INVALID_CREDENTIALS`. Branch on
> `reason`'s text (fragile) or just treat any `CONNECTION_FAILED` as "could
> not reach the server" without a code-level cause breakdown.

## Examples

### Catching specific error codes

```typescript
import { Cacher, CacherEngineError } from '@tundralibs/cacher';

async function connect(host: string) {
  try {
    const cache = Cacher.create('REDIS', 'app', { host });
    await cache.set('ping', true);
  } catch (err) {
    if (err instanceof CacherEngineError) {
      switch (err.code) {
        // Redis wraps connection refusal, DNS failure, timeout AND bad
        // credentials all into this one code — the built-in engine never
        // raises CONNECTION_INVALID_CREDENTIALS (see the "Raised by"
        // column above), so a Redis auth failure lands here too.
        case 'CONNECTION_FAILED':
          console.error('Could not reach Redis server:', err.message);
          break;
        case 'CONFIG_MISSING':
          console.error('Missing required config:', err.context);
          break;
        default:
          console.error(`Cache error [${err.code}]:`, err.message);
      }
    }
  }
}
```

### Custom engine throwing errors

```typescript ignore
import { AbstractEngine, CacherEngineError } from '@tundralibs/cacher';
import type { CacherOptions, CacheValue } from '@tundralibs/cacher/types';

class MyEngine extends AbstractEngine<CacherOptions> {
  public readonly Engine = 'MY_ENGINE';

  protected _set(key: string, value: CacheValue): void {
    if (!this._isConnected()) {
      throw new CacherEngineError('CONNECTION_LOST', {
        name: this.name,
        engine: this.Engine,
        reason: 'backend not reachable',
      });
    }
    // ...
  }
}
```

---

[← Back to Cacher](../README.md)
