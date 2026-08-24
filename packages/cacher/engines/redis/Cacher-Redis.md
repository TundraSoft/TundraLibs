# Cacher Redis Engine

Redis-backed distributed cache engine.

![Deno](https://img.shields.io/badge/Deno-000000?logo=deno)
![Bun](https://img.shields.io/badge/Bun-f9f1e1?logo=bun)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white)
![Cloudflare Workers](https://img.shields.io/badge/Cloudflare%20Workers-F38020?logo=cloudflare&logoColor=white)
![Browser](https://img.shields.io/badge/Browser-4285F4?logo=googlechrome&logoColor=white)

> **Runtime note:** `RedisCacher` needs a reachable TCP target. That works
> on Cloudflare Workers — real TCP via `@tundralibs/compat/net`'s
> `cloudflare:sockets` backend, no `nodejs_compat` flag needed — but not in
> a plain browser, which has no raw TCP. The class imports fine everywhere —
> only `connect()` requires the socket.

## Overview

`RedisCacher` uses a Redis server as its backend via `@tundralibs/drivers/redis`. It supports authentication, TLS, database selection, and all standard `AbstractEngine` cache operations.

| Feature                  | Supported |
| ------------------------ | :-------: |
| No external dependencies |    ❌     |
| Shared across processes  |    ✅     |
| TLS / SSL support        |    ✅     |
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

### `RedisCacherOptions`

```typescript ignore
type RedisCacherOptions = CacherOptions & {
  /** Redis server hostname. Required. */
  host: string;

  /** Redis server port. Default: 6379. */
  port?: number;

  /** Redis username for authentication (ACL). */
  username?: string;

  /** Redis password for authentication. */
  password?: string;

  /** Redis database number. */
  db?: number;

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

`username` and `password` must be supplied together — providing only one throws `CONFIG_MISSING`.

### `EngineSSLOptions`

Forwarded verbatim to `RedisEngine`. Pick **one** presentation style — inline
PEM strings or file paths — per connection.

```typescript
type EngineSSLOptions = {
  ca?: string[]; // CA certificate(s), PEM strings
  cert?: string; // Client certificate PEM string
  key?: string; // Client private key PEM string
  caFile?: string; // Path to CA certificate file
  certFile?: string; // Path to client certificate file
  keyFile?: string; // Path to client private key file
  rejectUnauthorized?: boolean; // Verify server certificate (default: true)
  enforce?: boolean; // Enforce TLS even if not required
};
```

> **Inline and file-path fields are mutually exclusive.** Supplying both
> styles in one `ssl` object (e.g. `{ ca: [...], certFile: '...' }`) is
> rejected at the type level and again at runtime. `cert`/`key` (and
> `certFile`/`keyFile`) must also be supplied as a pair — providing only one
> half throws. `ca` is an **array** of PEM strings, not a single string.
>
> `rejectUnauthorized: false` is not honoured on every runtime: it **throws**
> on Deno (which has no in-process certificate-skip primitive), and on
> Cloudflare Workers `ssl` may only be `true`/`false`/`{ enforce }` —
> `cert`/`key`/`ca`/`certFile`/`keyFile`/`caFile`/`rejectUnauthorized: false`
> all throw there, because `cloudflare:sockets` accepts no TLS material and
> always verifies the peer against its own trust store. Bun and Node accept
> `rejectUnauthorized: false`.

### `new RedisCacher(name, options)`

Creates a new Redis-backed cache instance. Throws `CacherEngineError` with code `CONFIG_MISSING` if `host` is absent or only one of `username`/`password` is supplied, and `CONFIG_INVALID` if `name` contains `:` — the reserved namespace separator (a colon in the name would let `clear()`'s `${name}:*` pattern wipe a colon-prefixed sibling namespace). The `:` rule applies to `Cacher.create(...)` too, but there it is caught earlier by the manager — which throws a base `CacherError` (no `code`) — before this constructor's `AbstractEngine` check runs.

```typescript
import { RedisCacher } from '@tundralibs/cacher/engines';

const cache = new RedisCacher('session-cache', {
  host: 'redis.example.com',
  port: 6379,
  defaultExpiry: 3600,
});
```

### Methods

All methods are inherited from `AbstractEngine`. The connection is established lazily on the first operation.

| Method                         | Returns                   | Description                                    |
| ------------------------------ | ------------------------- | ---------------------------------------------- |
| `init()`                       | `Promise<void>`           | Connect to Redis (lazy — called automatically) |
| `finalize()`                   | `Promise<void>`           | Disconnect from Redis                          |
| `set<T>(key, value, options?)` | `Promise<void>`           | Store a value                                  |
| `get<T>(key)`                  | `Promise<T \| undefined>` | Retrieve a value                               |
| `has(key)`                     | `Promise<boolean>`        | Check if a key exists                          |
| `delete(key)`                  | `Promise<void>`           | Remove a single entry                          |
| `clear()`                      | `Promise<void>`           | Remove all entries in this namespace           |

## Usage Examples

### Basic Connection

```typescript
import { RedisCacher } from '@tundralibs/cacher/engines';

const cache = new RedisCacher('app-cache', {
  host: 'localhost',
  port: 6379,
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

const cache = Cacher.create('REDIS', 'sessions', {
  host: 'localhost',
  port: 6379,
  password: 'secret',
  defaultExpiry: 1800,
});

await cache.set('session:abc', { userId: 42 });
```

### With Authentication

```typescript
import { RedisCacher } from '@tundralibs/cacher/engines';

const cache = new RedisCacher('secure-cache', {
  host: 'redis.example.com',
  port: 6379,
  username: 'myapp',
  password: 'strongpassword',
  db: 1,
  defaultExpiry: 600,
});
```

### With TLS

```typescript
import { RedisCacher } from '@tundralibs/cacher/engines';

// Default TLS (system CA, no client cert)
const cache = new RedisCacher('tls-cache', {
  host: 'redis.example.com',
  port: 6379,
  ssl: true,
  defaultExpiry: 300,
});

// Custom TLS with file paths
const cacheWithCerts = new RedisCacher('mtls-cache', {
  host: 'redis.example.com',
  port: 6379,
  ssl: {
    caFile: '/etc/ssl/redis-ca.pem',
    certFile: '/etc/ssl/client.crt',
    keyFile: '/etc/ssl/client.key',
    rejectUnauthorized: true,
  },
  defaultExpiry: 300,
});
```

### Sliding Expiry (Window Mode)

```typescript
import { RedisCacher } from '@tundralibs/cacher/engines';

const cache = new RedisCacher('sessions', {
  host: 'localhost',
  port: 6379,
  defaultExpiry: 1800,
});

// TTL is reset on every get()
await cache.set('session:xyz', { userId: 1 }, { window: true });
const session = await cache.get('session:xyz'); // Extends TTL
```

### Error Handling

```typescript
import { Cacher } from '@tundralibs/cacher';
import { CacherEngineError } from '@tundralibs/cacher';

try {
  const cache = Cacher.create('REDIS', 'app', {
    host: 'redis.example.com',
    port: 6379,
  });
  await cache.set('ping', true);
} catch (err) {
  if (err instanceof CacherEngineError) {
    if (err.code === 'CONNECTION_FAILED') {
      console.error('Could not connect to Redis:', err.message);
    }
  }
}
```

## Notes

- The connection is lazy — `init()` is called automatically on the first operation.
- Keys are namespaced as `{name}:{key}` internally.
- Values are JSON-serialized on write and deserialized on read.
- Sliding expiry uses Redis `EXPIRE` to reset the TTL on each `get()`.
- `username` and `password` must both be provided or both absent; providing only one throws `CacherEngineError('CONFIG_MISSING', ...)`.
- `clear()` runs `KEYS {name}:*` (glob-escaping the namespace first) then one
  bulk `DEL` of everything it finds. `KEYS` is O(N) over the whole keyspace
  and blocks Redis's single-threaded event loop while it runs — fine for
  development or a namespace with a small number of keys, but a namespace
  with many thousands of keys on a shared production server can stall other
  clients for the duration of the scan. There is no `SCAN`-based option
  today; if that matters, clear via a separate `SCAN` + batched `DEL` outside
  this cacher, or keep namespaces small enough that `KEYS` is cheap.

---

[← Back to Cacher Engines](../Cacher-Engines.md)
