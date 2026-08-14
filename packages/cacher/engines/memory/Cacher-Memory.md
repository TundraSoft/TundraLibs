# Cacher Memory Engine

In-process memory cache with no external dependencies.

![Deno](https://img.shields.io/badge/Deno-000000?logo=deno)
![Bun](https://img.shields.io/badge/Bun-f9f1e1?logo=bun)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white)

## Overview

`MemoryCacher` stores values in the current process's heap. It requires no external services, making it ideal for development, testing, and single-process deployments where persistence is not needed.

| Feature                  | Supported |
| ------------------------ | :-------: |
| No external dependencies |    ✅     |
| Shared across processes  |    ❌     |
| TLS / SSL support        |    ❌     |
| Sliding (window) expiry  |    ✅     |
| Per-entry custom TTL     |    ✅     |
| Namespace isolation      |    ✅     |

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

### `MemoryCacherOptions`

`MemoryCacherOptions` is an alias for the base `CacherOptions` — no extra options are required.

```typescript
type MemoryCacherOptions = CacherOptions;

type CacherOptions = {
  /**
   * Default TTL in seconds.
   * 0 = no expiry. Maximum 21600 (6 hours). Default: 300 (5 minutes).
   */
  defaultExpiry?: number;
};
```

### `new MemoryCacher(name, options)`

Creates a new in-memory cache instance.

```typescript
import { MemoryCacher } from '@tundralibs/cacher/engines';

const cache = new MemoryCacher('user-cache', { defaultExpiry: 300 });
```

| Parameter               | Type     | Description                             |
| ----------------------- | -------- | --------------------------------------- |
| `name`                  | `string` | Unique name / namespace prefix          |
| `options.defaultExpiry` | `number` | Default TTL in seconds (default: `300`) |

### Methods

All methods are inherited from `AbstractEngine`. See [Cacher Engines](../Cacher-Engines.md#common-api) for the full method signatures.

| Method                         | Returns                   | Description                            |
| ------------------------------ | ------------------------- | -------------------------------------- |
| `set<T>(key, value, options?)` | `Promise<void>`           | Store a value                          |
| `get<T>(key)`                  | `Promise<T \| undefined>` | Retrieve a value                       |
| `has(key)`                     | `Promise<boolean>`        | Check if a key exists                  |
| `delete(key)`                  | `Promise<void>`           | Remove a single entry                  |
| `clear()`                      | `Promise<void>`           | Remove all entries in this namespace   |
| `finalize()`                   | `void`                    | Clears all entries and releases memory |

## Usage Examples

### Basic Cache Operations

```typescript
import { MemoryCacher } from '@tundralibs/cacher/engines';

const cache = new MemoryCacher('products', { defaultExpiry: 600 });

// Store a value
await cache.set('product:1', { id: 1, name: 'Widget', price: 9.99 });

// Retrieve a value
const product = await cache.get<{ id: number; name: string; price: number }>(
  'product:1',
);
console.log(product?.name); // 'Widget'

// Check existence
if (await cache.has('product:1')) {
  console.log('Product is cached');
}

// Delete a specific key
await cache.delete('product:1');

// Clear all entries
await cache.clear();
```

### Via the `Cacher` Manager

```typescript
import { Cacher } from '@tundralibs/cacher';

const cache = Cacher.create('MEMORY', 'sessions', {
  defaultExpiry: 1800, // 30 minutes
});

await cache.set('session:abc', { userId: 42, role: 'admin' });
const session = await cache.get<{ userId: number; role: string }>(
  'session:abc',
);
```

### Sliding Expiry (Window Mode)

Resets the TTL each time the value is accessed, keeping active sessions alive.

```typescript
import { MemoryCacher } from '@tundralibs/cacher/engines';

const cache = new MemoryCacher('sessions', { defaultExpiry: 300 });

// Expires 5 minutes after the last access
await cache.set('session:xyz', { userId: 1 }, { window: true });

// Each get() extends the TTL by another 5 minutes
const session = await cache.get('session:xyz');
```

### Per-Entry Custom TTL

```typescript
import { MemoryCacher } from '@tundralibs/cacher/engines';

const cache = new MemoryCacher('app-cache', { defaultExpiry: 60 });

// Short-lived rate-limit counter (10 seconds)
await cache.set('rate:user:42', 1, { expiry: 10 });

// Longer-lived user profile (1 hour)
await cache.set('user:42', { name: 'Alice' }, { expiry: 3600 });

// Never expire (permanent for this process lifetime)
await cache.set('config:features', { beta: true }, { expiry: 0 });
```

### Cleanup on Shutdown

```typescript
import { MemoryCacher } from '@tundralibs/cacher/engines';

const cache = new MemoryCacher('temp', {});

// ... use cache

// Release all timers and memory on shutdown
cache.finalize();
```

## Notes

- Values are JSON-serialized on write and deserialized on read — the stored value must be JSON-compatible.
- Namespace isolation: all keys are stored as `{name}:{key}` internally, so two `MemoryCacher` instances with different names never collide.
- Expiry is implemented using `setTimeout`. Creating many entries with short TTLs generates many timers; use `clear()` or `finalize()` to release them.
- Data is **not** persisted across process restarts.

---

[← Back to Cacher Engines](../Cacher-Engines.md)
