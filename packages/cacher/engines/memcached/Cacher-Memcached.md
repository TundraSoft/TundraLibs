# Cacher Memcached Engine

Memcached-backed distributed cache engine.

![Deno](https://img.shields.io/badge/Deno-000000?logo=deno)
![Bun](https://img.shields.io/badge/Bun-f9f1e1?logo=bun)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white)

## Overview

`MemCacher` uses a Memcached server as its backend via `@tundralibs/drivers/memcached`. It supports TLS (for managed deployments such as AWS ElastiCache for Memcached) and all standard `AbstractEngine` cache operations.

> **Note:** Standard open-source Memcached does not support TLS unless built with `--enable-tls`. TLS is primarily relevant for managed cloud offerings.

| Feature                  | Supported |
| ------------------------ | :-------: |
| No external dependencies |    ❌     |
| Shared across processes  |    ✅     |
| TLS / SSL support        |    ✅*    |
| Sliding (window) expiry  |    ✅     |
| Per-entry custom TTL     |    ✅     |
| Namespace isolation      |    ✅     |

\* TLS requires a TLS-enabled Memcached build or managed service.

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

### `MemCacherOptions`

```typescript ignore
type MemCacherOptions = CacherOptions & {
  /** Memcached server hostname. Required. */
  host: string;

  /** Memcached server port. Default: 11211. */
  port?: number;

  /** Maximum buffer size in MB. Default: 10. */
  maxBufferSize?: number;

  /**
   * TLS configuration.
   * Pass `true` for default TLS (system CA, no client cert),
   * or an EngineSSLOptions object for fine-grained control.
   */
  ssl?: boolean | EngineSSLOptions;

  /** Default TTL in seconds. 0 = no expiry. Default: 300. */
  defaultExpiry?: number;
};
```

### `EngineSSLOptions`

Forwarded verbatim to `MemcachedEngine`. Both inline PEM strings and file paths are accepted.

```typescript
type EngineSSLOptions = {
  ca?: string; // CA certificate PEM string
  cert?: string; // Client certificate PEM string
  key?: string; // Client private key PEM string
  caFile?: string; // Path to CA certificate file
  certFile?: string; // Path to client certificate file
  keyFile?: string; // Path to client private key file
  rejectUnauthorized?: boolean; // Verify server certificate (default: true)
  enforce?: boolean; // Enforce TLS even if not required
};
```

### `new MemCacher(name, options)`

Creates a new Memcached-backed cache instance. Throws `CacherEngineError` with code `CONFIG_MISSING` if `host` is absent.

```typescript
import { MemCacher } from '@tundralibs/cacher/engines';

const cache = new MemCacher('product-cache', {
  host: 'memcached.example.com',
  port: 11211,
  defaultExpiry: 600,
});
```

### Methods

All methods are inherited from `AbstractEngine`. The connection is established lazily on the first operation.

| Method                         | Returns                   | Description                                          |
| ------------------------------ | ------------------------- | ---------------------------------------------------- |
| `init()`                       | `Promise<void>`           | Connect to Memcached (lazy — called automatically)   |
| `finalize()`                   | `Promise<void>`           | Disconnect from Memcached                            |
| `set<T>(key, value, options?)` | `Promise<void>`           | Store a value                                        |
| `get<T>(key)`                  | `Promise<T \| undefined>` | Retrieve a value                                     |
| `has(key)`                     | `Promise<boolean>`        | Check if a key exists                                |
| `delete(key)`                  | `Promise<void>`           | Remove a single entry                                |
| `clear()`                      | `Promise<void>`           | Invalidate all entries in this namespace (see Notes) |

## Usage Examples

### Basic Connection

```typescript
import { MemCacher } from '@tundralibs/cacher/engines';

const cache = new MemCacher('app-cache', {
  host: 'localhost',
  port: 11211,
  defaultExpiry: 300,
});

await cache.set('user:1', { name: 'Alice', role: 'admin' });
const user = await cache.get<{ name: string; role: string }>('user:1');
console.log(user?.name); // 'Alice'

await cache.finalize(); // Disconnect on shutdown
```

### Via the `Cacher` Manager

```typescript
import { Cacher } from '@tundralibs/cacher';

const cache = Cacher.create('MEMCACHED', 'objects', {
  host: 'localhost',
  port: 11211,
  defaultExpiry: 600,
});

await cache.set('product:1', { id: 1, name: 'Widget', price: 9.99 });
```

### Custom Buffer Size

```typescript
import { MemCacher } from '@tundralibs/cacher/engines';

// Increase buffer for larger cached objects
const cache = new MemCacher('large-objects', {
  host: 'localhost',
  maxBufferSize: 50, // 50 MB
  defaultExpiry: 300,
});
```

### With TLS (Managed Memcached)

```typescript
import { MemCacher } from '@tundralibs/cacher/engines';

// Default TLS (e.g. AWS ElastiCache with TLS enabled)
const cache = new MemCacher('cloud-cache', {
  host: 'my-cluster.abc123.cfg.euw1.cache.amazonaws.com',
  ssl: true,
  defaultExpiry: 600,
});

// Custom TLS with CA certificate
const cacheWithCA = new MemCacher('secure-cache', {
  host: 'memcached.example.com',
  ssl: {
    caFile: '/etc/ssl/memcached-ca.pem',
    rejectUnauthorized: true,
  },
  defaultExpiry: 600,
});
```

### Sliding Expiry (Window Mode)

```typescript
import { MemCacher } from '@tundralibs/cacher/engines';

const cache = new MemCacher('sessions', {
  host: 'localhost',
  defaultExpiry: 1800,
});

// TTL is reset on every get()
await cache.set('session:xyz', { userId: 1 }, { window: true });
const session = await cache.get('session:xyz'); // Extends TTL
```

### Error Handling

```typescript
import { Cacher, CacherEngineError } from '@tundralibs/cacher';

try {
  const cache = Cacher.create('MEMCACHED', 'app', {
    host: 'memcached.example.com',
  });
  await cache.set('ping', true);
} catch (err) {
  if (err instanceof CacherEngineError) {
    if (err.code === 'CONNECTION_FAILED') {
      console.error('Could not connect to Memcached:', err.message);
    }
  }
}
```

## Notes

- The connection is lazy — `init()` is called automatically on the first operation.
- Keys are namespaced and version-scoped as `{name}:v{version}:{key}` internally. Because the Memcached text protocol forbids whitespace/control characters in keys and caps a whole key at 250 bytes, **both** the `{name}` prefix and the `{key}` user portion are transparently percent-encoded, with a SHA-256 fallback whose trigger differs between the two. The `{name}` prefix is replaced by a fixed 64-char SHA-256 digest once its percent-encoded form exceeds **160 bytes** — a deliberately lower cap than 250 that reserves budget for the `:v{version}:` prefix and the user key's own 64-byte SHA-256 fallback, so a long name is hashed well before it alone would approach 250. The `{key}` user portion is percent-encoded and only SHA-256-hashed if the resulting whole wire key would still overflow the **250-byte** limit. The same encoding is applied to the internal probe key (`{name}:__cacher_probe__`) and version-counter key (`{name}:__ns_version__`). Any name or key accepted by the Memory/Redis engines therefore also works here — you never have to pre-sanitise names or keys for Memcached. (The one universal rule, enforced on every engine, is that an instance **name** may not contain `:`, the reserved namespace separator.)
- Values are JSON-serialized on write and deserialized on read.
- `defaultExpiry: 0` (or `set(..., { expiry: 0 })`) means **never expire** — the entry persists until it is deleted, cleared, or evicted by the server.
- `clear()` is **namespace-scoped**. Because Memcached exposes no key enumeration, the engine cannot delete a namespace's keys by prefix and deliberately does **not** call `flush_all` (which would wipe every other namespace and application on the server). Instead it keeps a per-namespace version counter (`{name}:__ns_version__`) that is embedded in every data key, and `clear()` atomically increments it. All previously-written entries become unreachable at once; Memcached then reclaims them through normal LRU eviction rather than deleting them synchronously. Each instance caches the counter locally but re-reads it from the server at most once per second, so a `clear()` on one instance is observed by every other instance sharing the namespace within about a second — both for reads (peers stop serving cleared entries) and writes (peers' new writes land under the current version, visible to all instances). There is no unbounded window in which peers serve stale data or write invisible keys.
- Standard Memcached does not support TLS without a custom build. For TLS, use a managed service (e.g. AWS ElastiCache for Memcached with TLS enabled).
- `host` is required; omitting it throws `CacherEngineError('CONFIG_MISSING', ...)`.

---

[← Back to Cacher Engines](../Cacher-Engines.md)
