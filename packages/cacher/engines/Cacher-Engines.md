# Cacher Engines

Built-in cache engine implementations for the Cacher package.

![Deno](https://img.shields.io/badge/Deno-000000?logo=deno)
![Bun](https://img.shields.io/badge/Bun-f9f1e1?logo=bun)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white)
![Cloudflare Workers](https://img.shields.io/badge/Cloudflare%20Workers-F38020?logo=cloudflare&logoColor=white)
![Browser](https://img.shields.io/badge/Browser-4285F4?logo=googlechrome&logoColor=white)

> **Runtime note:** `MemoryCacher` is process-local and works on every
> runtime, including Cloudflare Workers and the browser. `RedisCacher` and
> `MemCacher` need a reachable TCP target — on Workers that's real TCP via
> `@tundralibs/compat/net`'s `cloudflare:sockets` backend, no `nodejs_compat`
> flag needed, but a plain browser has no raw TCP at all.

## Overview

The `@tundralibs/cacher/engines` module re-exports all built-in cache engine classes and their option types. You can import individual engines directly rather than going through the `Cacher` manager.

| Engine                                       | Identifier    | External dependency | Description                        |
| -------------------------------------------- | ------------- | ------------------- | ---------------------------------- |
| [`MemoryCacher`](memory/Cacher-Memory.md)    | `'MEMORY'`    | None                | In-process memory cache            |
| [`RedisCacher`](redis/Cacher-Redis.md)       | `'REDIS'`     | Redis server        | Redis-backed distributed cache     |
| [`MemCacher`](memcached/Cacher-Memcached.md) | `'MEMCACHED'` | Memcached server    | Memcached-backed distributed cache |

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

### Via the `Cacher` manager (recommended)

```typescript
import { Cacher } from '@tundralibs/cacher';

const cache = Cacher.create('MEMORY', 'my-cache', { defaultExpiry: 300 });
await cache.set('key', 'value');
const value = await cache.get<string>('key');
```

### Direct instantiation

```typescript
import {
  MemCacher,
  MemoryCacher,
  RedisCacher,
} from '@tundralibs/cacher/engines';

const memCache = new MemoryCacher('local', { defaultExpiry: 300 });
const redisCache = new RedisCacher('sessions', {
  host: 'localhost',
  port: 6379,
});
const memcachedCache = new MemCacher('objects', {
  host: 'localhost',
  port: 11211,
});
```

> **Instance names may not contain `:`.** It is the reserved namespace separator
> (keys are stored as `${name}:${key}`), so allowing it would let one namespace
> become a colon-prefix of another and let `clear()` wipe a sibling. The rule is
> enforced on both creation paths, but the thrown error differs.
> `Cacher.create(...)` validates its arguments first and rejects the name with a
> base `CacherError` (message `Instance name must not contain ":" ...`, with **no
> `code` property**) before any engine is constructed. Constructing an engine
> directly (as above) instead reaches `AbstractEngine`'s constructor check, which
> throws a `CacherEngineError` (`CONFIG_INVALID`).

## Common API

All engines extend [`AbstractEngine`](../README.md#custom-engine) and share this interface:

### `set<T>(key, value, options?)`

```typescript
import { MemoryCacher } from '@tundralibs/cacher/engines';

const cache = new MemoryCacher('demo', {});
const data = { userId: 42 };

await cache.set('user:1', { name: 'Alice' });
await cache.set('session:x', data, { expiry: 600, window: true });
```

| Parameter        | Type      | Default         | Description                               |
| ---------------- | --------- | --------------- | ----------------------------------------- |
| `key`            | `string`  | —               | Cache key                                 |
| `value`          | `T`       | —               | JSON-serializable value                   |
| `options.expiry` | `number`  | `defaultExpiry` | TTL in seconds (`0` = no expiry)          |
| `options.window` | `boolean` | `false`         | Sliding expiry — resets TTL on each `get` |

### `get<T>(key)`

Returns the cached value, or `undefined` if missing or expired.

```typescript
import { MemoryCacher } from '@tundralibs/cacher/engines';

type User = { name: string };

const cache = new MemoryCacher('demo', {});

const user = await cache.get<User>('user:1');
```

### `has(key)`

Returns `true` if the key exists and has not expired.

```typescript
import { MemoryCacher } from '@tundralibs/cacher/engines';

const cache = new MemoryCacher('demo', {});

if (await cache.has('feature-flag:beta')) { /* ... */ }
```

### `delete(key)`

Removes a single entry.

```typescript
import { MemoryCacher } from '@tundralibs/cacher/engines';

const cache = new MemoryCacher('demo', {});

await cache.delete('user:1');
```

### `clear()`

Removes all entries in this instance's namespace. The mechanism is
backend-specific — Memory and Redis delete outright (Redis via `KEYS` +
`DEL`, not `SCAN`-based), Memcached bumps a version counter instead of
deleting — see each engine's own doc for the tradeoffs:
[Cacher-Redis.md#notes](redis/Cacher-Redis.md#notes),
[Cacher-Memcached.md#notes](memcached/Cacher-Memcached.md#notes).

```typescript
import { MemoryCacher } from '@tundralibs/cacher/engines';

const cache = new MemoryCacher('demo', {});

await cache.clear();
```

### `init()`

Establishes the backend connection (Redis, Memcached). Called automatically by every operation — only call explicitly if you want to pre-connect.

```typescript
import { MemoryCacher } from '@tundralibs/cacher/engines';

const cache = new MemoryCacher('demo', {});

await cache.init();
```

### `finalize()`

Releases backend resources. Call during application shutdown.

```typescript
import { MemoryCacher } from '@tundralibs/cacher/engines';

const cache = new MemoryCacher('demo', {});

await cache.finalize();
```

## Engine Comparison

| Capability               | Memory | Redis | Memcached |
| ------------------------ | :----: | :---: | :-------: |
| No external dependencies |   ✅   |  ❌   |    ❌     |
| Shared across processes  |   ❌   |  ✅   |    ✅     |
| TLS / SSL support        |   ❌   |  ✅   |    ✅     |
| Sliding (window) expiry  |   ✅   |  ✅   |    ✅     |
| Per-entry custom TTL     |   ✅   |  ✅   |    ✅     |
| Namespace isolation      |   ✅   |  ✅   |    ✅     |

## Detailed Documentation

- [MemoryCacher](memory/Cacher-Memory.md) — In-process cache, no dependencies
- [RedisCacher](redis/Cacher-Redis.md) — Redis-backed cache with TLS support
- [MemCacher](memcached/Cacher-Memcached.md) — Memcached-backed cache with TLS support

---

[← Back to Cacher](../README.md)
