# Cacher

A flexible caching library with support for Memory, Redis, and Memcached engines.

![Deno](https://img.shields.io/badge/Deno-000000?logo=deno)
![Bun](https://img.shields.io/badge/Bun-f9f1e1?logo=bun)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white)

## Overview

The Cacher package provides a unified caching abstraction that works with multiple backends. A singleton `Cacher` manager handles engine registration and instance lifecycle, while `AbstractEngine` defines the common API that all cache engines implement.

## Browser / Worker compatibility

`@tundralibs/cacher` is a server-side cache abstraction. The built-in
Redis and Memcached engines, and the underlying socket / network
lifecycle they rely on, are intended for Deno, Bun, and Node server
runtimes. This package is not designed as a browser or worker-native
cache runtime.

Use the in-memory engine for local process-state caching in a browser
or worker context only if the target environment supports the same
runtime semantics; do not assume the networked engines are portable to
edge or browser sandboxes.

## Modules

| Module             | Description                                                           | Documentation                               |
| ------------------ | --------------------------------------------------------------------- | ------------------------------------------- |
| `Cacher` (default) | Singleton manager for engine registration and cache instance creation | This page                                   |
| `AbstractEngine`   | Base class for custom cache engine implementations                    | [Custom Engine](#custom-engine)             |
| `./engines`        | Built-in engines: Memory, Redis, Memcached                            | [Cacher-Engines](engines/Cacher-Engines.md) |
| `./errors`         | `CacherError` and `CacherEngineError` error classes                   | [Cacher-Errors](errors/Cacher-Errors.md)    |
| `./types`          | `CacherOptions`, `CacheValue`, `CacheValueOptions`                    | —                                           |

## Documentation

- [Engines Overview](engines/Cacher-Engines.md) — All built-in cache engines and their common API
- [Memory Engine](engines/memory/Cacher-Memory.md) — In-process cache, no dependencies
- [Redis Engine](engines/redis/Cacher-Redis.md) — Redis-backed cache with TLS support
- [Memcached Engine](engines/memcached/Cacher-Memcached.md) — Memcached-backed cache with TLS support
- [Errors](errors/Cacher-Errors.md) — Error classes and error code reference

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

## Quick Start

### In-Memory Cache

```typescript
import { Cacher } from '@tundralibs/cacher';

// Create a memory cache instance
const cache = Cacher.create('MEMORY', 'my-cache', {
  defaultExpiry: 300, // 5 minutes
});

// Store a value
await cache.set('user:1', { name: 'Alice', role: 'admin' });

// Retrieve a value
const user = await cache.get<{ name: string; role: string }>('user:1');
console.log(user?.name); // 'Alice'

// Check existence
if (await cache.has('user:1')) {
  console.log('User is cached');
}

// Delete a value
await cache.delete('user:1');

// Clear all entries
await cache.clear();
```

### Redis Cache

```typescript
import { Cacher } from '@tundralibs/cacher';

const cache = Cacher.create('REDIS', 'session-cache', {
  host: 'localhost',
  port: 6379,
  password: 'secret',
  db: 0,
  defaultExpiry: 3600, // 1 hour
});

await cache.set('session:abc123', {
  userId: 42,
  expires: Date.now() + 3600000,
});
const session = await cache.get<{ userId: number; expires: number }>(
  'session:abc123',
);
```

### Memcached Cache

```typescript
import { Cacher } from '@tundralibs/cacher';

const cache = Cacher.create('MEMCACHED', 'object-cache', {
  host: 'localhost',
  port: 11211,
  defaultExpiry: 600,
});

await cache.set('product:1', { id: 1, name: 'Widget', price: 9.99 });
```

## Engines

### Memory (`MEMORY`)

In-process cache with no external dependencies.

| Option          | Type     | Default | Description                                                     |
| --------------- | -------- | ------- | --------------------------------------------------------------- |
| `defaultExpiry` | `number` | `300`   | Default TTL in seconds. `0` = no expiry (max 2592000 = 30 days) |

### Redis (`REDIS`)

Uses a Redis server as the cache backend.

| Option          | Type                          | Default  | Description                             |
| --------------- | ----------------------------- | -------- | --------------------------------------- |
| `host`          | `string`                      | required | Redis server hostname                   |
| `port`          | `number`                      | `6379`   | Redis server port                       |
| `username`      | `string`                      | —        | Optional Redis username                 |
| `password`      | `string`                      | —        | Optional Redis password                 |
| `db`            | `number`                      | —        | Optional Redis database number          |
| `ssl`           | `boolean \| EngineSSLOptions` | —        | TLS configuration (`true` for defaults) |
| `defaultExpiry` | `number`                      | `300`    | Default TTL in seconds                  |

### Memcached (`MEMCACHED`)

Uses a Memcached server as the cache backend.

| Option          | Type                          | Default  | Description                             |
| --------------- | ----------------------------- | -------- | --------------------------------------- |
| `host`          | `string`                      | required | Memcached server hostname               |
| `port`          | `number`                      | `11211`  | Memcached server port                   |
| `maxBufferSize` | `number`                      | `10`     | Maximum buffer size in MB               |
| `ssl`           | `boolean \| EngineSSLOptions` | —        | TLS configuration (`true` for defaults) |
| `defaultExpiry` | `number`                      | `300`    | Default TTL in seconds                  |

## API Reference

### `Cacher.create(engine, name, options)`

Creates or retrieves a named cache instance for the specified engine.

```typescript
import { Cacher } from '@tundralibs/cacher';

const cache = Cacher.create('MEMORY', 'my-cache', { defaultExpiry: 300 });
```

The instance `name` must not contain `:` — it is the reserved namespace
separator (entries are stored as `${name}:${key}`), and a colon in the name
would let one namespace become a prefix of another and break the namespace
isolation guaranteed by `clear()`. The same rule is enforced by
`AbstractEngine`, so it also applies when an engine is constructed directly
(e.g. `new RedisCacher('user-cache', …)`), not just through `Cacher.create`.

### `Cacher.addEngine(name, engine)`

Registers a custom cache engine constructor.

```typescript
import { AbstractEngine, Cacher } from '@tundralibs/cacher';
import type { CacherOptions, CacheValue } from '@tundralibs/cacher/types';

class MyCustomEngine extends AbstractEngine<CacherOptions> {
  public readonly Engine = 'CUSTOM';

  protected _set(_key: string, _value: CacheValue): void {}
  protected _get(_key: string): CacheValue | undefined {
    return undefined;
  }
  protected _has(_key: string): boolean {
    return false;
  }
  protected _delete(_key: string): void {}
  protected _clear(): void {}
}

Cacher.addEngine('CUSTOM', MyCustomEngine);
const cache = Cacher.create('CUSTOM', 'custom-cache', { defaultExpiry: 300 });
```

### `cache.set<T>(key, value, options?)`

Stores a value in the cache. The value is JSON-serialized.

| Parameter        | Type      | Description                                |
| ---------------- | --------- | ------------------------------------------ |
| `key`            | `string`  | Cache key                                  |
| `value`          | `T`       | Value to cache (must be JSON-serializable) |
| `options.expiry` | `number`  | Override TTL in seconds for this entry     |
| `options.window` | `boolean` | Extend TTL on each access (sliding expiry) |

`expiry` accepts fractional seconds, but only the **Memory** engine honours
sub-second precision (it uses millisecond timers). **Redis** and **Memcached**
operate in whole seconds, and they normalise a fractional TTL differently.
**Redis** rounds it up to the next whole second (e.g. `1.2` → 2s). **Memcached**
truncates it toward zero (e.g. `1.9` → 1s), except that a positive sub-second
TTL is clamped up to `1s` (e.g. `0.2` → 1s) so it is never mistaken for `0`
("never expire"). An `expiry` of `0` always means "never expire" on both.

### `cache.get<T>(key)`

Retrieves a cached value. Returns `undefined` if the key does not exist or has expired.

### `cache.has(key)`

Returns `true` if the key exists and has not expired.

### `cache.delete(key)`

Removes a single entry from the cache.

### `cache.clear()`

Removes all entries in this cache instance's namespace, leaving other
namespaces on the same backend untouched.

On **Memory** and **Redis** the entries are deleted outright. **Memcached**
has no key enumeration, so the engine keys every entry with a per-namespace
version and `clear()` bumps that version: prior entries become unreachable
immediately for the clearing instance, then get reclaimed by Memcached's LRU
eviction over time rather than being deleted synchronously. No server-wide
`flush_all` is issued, so cachers sharing the server are unaffected. Other
instances of the same namespace (e.g. peer processes) pick up the clear within
about a second — each caches the version counter locally but re-reads it on a
short interval, so there is no unbounded window where a peer serves cleared
data or writes invisible keys.

## Window Mode

Setting `window: true` when calling `set()` enables sliding expiry — the TTL is reset each time the value is accessed with `get()`.

```typescript
import { Cacher } from '@tundralibs/cacher';

const cache = Cacher.create('MEMORY', 'session-cache', {});
const data = { userId: 42 };

// Entry expires 5 minutes after the last access, not after creation
await cache.set('active-session', data, { expiry: 300, window: true });
```

## Custom Engine

Extend `AbstractEngine` to implement a custom backend.

```typescript
import { AbstractEngine } from '@tundralibs/cacher';
import type { CacherOptions, CacheValue } from '@tundralibs/cacher/types';

class FileEngine extends AbstractEngine<CacherOptions> {
  public readonly Engine = 'FILE';

  protected async _set(key: string, value: CacheValue): Promise<void> {
    // write to disk
  }

  protected async _get(key: string): Promise<CacheValue | undefined> {
    // read from disk
    return undefined;
  }

  protected async _has(key: string): Promise<boolean> {
    // check existence
    return false;
  }

  protected async _delete(key: string): Promise<void> {
    // remove file
  }

  protected async _clear(): Promise<void> {
    // remove all files for this namespace
  }
}
```

## Error Handling

```typescript
import { Cacher } from '@tundralibs/cacher';
import { CacherError } from '@tundralibs/cacher/errors';

try {
  const cache = Cacher.create('REDIS', 'my-cache', { host: 'localhost' });
} catch (err) {
  if (err instanceof CacherError) {
    console.error('Cacher error:', err.message);
  }
}
```

| Error Class         | When thrown                                       |
| ------------------- | ------------------------------------------------- |
| `CacherError`       | Invalid engine name, duplicate registration       |
| `CacherEngineError` | Connection failures, invalid operations or params |

## Features

| Feature                  | Memory | Redis | Memcached |
| ------------------------ | ------ | ----- | --------- |
| No external dependencies | ✅     | ❌    | ❌        |
| Distributed/shared cache | ❌     | ✅    | ✅        |
| TLS support              | ❌     | ✅    | ✅        |
| Window (sliding) expiry  | ✅     | ✅    | ✅        |
| Custom TTL per entry     | ✅     | ✅    | ✅        |
| Namespace isolation      | ✅     | ✅    | ✅        |

## License

MIT
