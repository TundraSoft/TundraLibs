# Memcached

Memcached driver speaking the text protocol over plain TCP or Unix sockets.

![Deno](https://img.shields.io/badge/Deno-000000?logo=deno)
![Bun](https://img.shields.io/badge/Bun-f9f1e1?logo=bun)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white)

## Table of Contents

- [Features](#features)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Configuration](#configuration)
- [API Reference](#api-reference)
  - [Retrieval](#retrieval)
  - [Storage](#storage)
  - [Mutation](#mutation)
  - [Counters](#counters)
  - [Admin](#admin)
- [Examples](#examples)

## Features

| Feature                                          | Bun | Deno | Node.js |
| ------------------------------------------------ | --- | ---- | ------- |
| `get` / `gets` (with CAS token)                  | ✅  | ✅   | ✅      |
| `set` / `add` / `replace` / `cas`                | ✅  | ✅   | ✅      |
| `append` / `prepend`                             | ✅  | ✅   | ✅      |
| `delete`                                         | ✅  | ✅   | ✅      |
| `incr` / `decr`                                  | ✅  | ✅   | ✅      |
| `touch` (extend TTL without re-sending value)    | ✅  | ✅   | ✅      |
| `flush` (with optional delay)                    | ✅  | ✅   | ✅      |
| `stats`, `version`                               | ✅  | ✅   | ✅      |
| TCP transport                                    | ✅  | ✅   | ✅      |
| Unix socket transport (`host` ending in `.sock`) | ✅  | ✅   | ✅      |
| Connection pool with min/max/idle eviction       | ✅  | ✅   | ✅      |
| Auto-connect on first operation                  | ✅  | ✅   | ✅      |

## Installation

**Deno:**

```bash
deno add @tundralibs/drivers
```

**Bun:**

```bash
bunx jsr add @tundralibs/drivers
```

**Node.js:**

```bash
npx jsr add @tundralibs/drivers
```

### Import

```typescript
import { MemcachedEngine } from '@tundralibs/drivers/memcached';
// or
import { MemcachedEngine } from '@tundralibs/drivers/engines';
```

## Quick Start

```typescript
import { MemcachedEngine } from '@tundralibs/drivers/memcached';

const cache = new MemcachedEngine('app-cache', {
  host: 'localhost',
  port: 11211,
});

// Operations auto-connect on first call.
await cache.set('user:1', JSON.stringify({ name: 'Alice' }), 60);
const raw = await cache.get('user:1');

await cache.disconnect();
```

## Configuration

`MemcachedEngineOptions` extends `EngineOptions`. The fields specific to this
driver are:

| Option          | Type     | Default | Description                                                                                                                               |
| --------------- | -------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `host`          | `string` | —       | **Required.** Hostname for TCP, or a path ending in `.sock` for Unix socket transport.                                                    |
| `port`          | `number` | `11211` | TCP port. Ignored when `host` is a `.sock` path.                                                                                          |
| `maxBufferSize` | `number` | `2`     | Maximum response buffer size in megabytes. A response exceeding this throws `OPERATION_FAILED` and the connection is dropped (see below). |

The constructor throws `EngineError` (`MISSING_CONFIG_VALUE`, meta
`{ option: "host" }`) when `host` is not provided.

### Connection health

An operation that leaves a connection unusable **destroys** that connection
instead of returning it to the pool, and the pool creates a fresh one on the
next use. That covers every way a command can leave the socket unusable:

- a **transport failure** — a read or write that rejects (ECONNRESET, EPIPE,
  an aborted TLS session). On Node and Bun such a socket rejects every later
  read and write forever, so recycling it is a permanent outage
- a socket the server **closed mid-reply** (a clean EOF part-way through a
  response)
- a **mid-reply desync** — buffer overflow, or a malformed/partial `VALUE`
  frame with unconsumed bytes still in flight

Recycling such a connection would let the next command read the leftover
bytes as its own response (silently wrong, cross-key data) or fail. A
complete server-error reply (`ERROR` / `CLIENT_ERROR` / `SERVER_ERROR`)
leaves the socket in a known state, so the connection is kept.

Plus all common options inherited from `EngineOptions` (pool sizing, SSL,
custom `idGenerator`, lifecycle event handlers). See
[BaseEngine docs](../../docs/Drivers-BaseEngine.md#configuration) for the full
list.

### Unix socket transport

Pass a path ending in `.sock` as `host`:

```typescript
const cache = new MemcachedEngine('local', {
  host: '/var/run/memcached/memcached.sock',
});
```

The driver dispatches to `compat.connect({ path })` instead of TCP.

## API Reference

### Retrieval

#### `get(key: string): Promise<string | null>`

Retrieve the value stored at `key`.

**Returns:** Raw stored value, or `null` if the key is missing / expired.

```typescript
const value = await cache.get('user:1');
if (value !== null) {
  const user = JSON.parse(value);
}
```

#### `gets(key: string): Promise<{ value: string; cas: string } | null>`

Retrieve the value at `key` along with its CAS (compare-and-swap) token. Use
together with [`cas()`](#caskey-string-value-string-castoken-string-ttl-number-promiseboolean)
for optimistic concurrency control.

**Returns:** `{ value, cas }` on hit, `null` if the key is missing / expired.

```typescript
const result = await cache.gets('counter');
if (result) {
  const next = (Number(result.value) + 1).toString();
  const ok = await cache.cas('counter', next, result.cas, 60);
  if (!ok) {
    // Another writer beat us. Retry from the top.
  }
}
```

### Storage

#### `set(key: string, value: string, ttl?: number): Promise<boolean>`

Unconditionally store `value` under `key`. Replaces any existing entry.

**Parameters:**

- `key` - Cache key.
- `value` - Raw value (encode complex types yourself, e.g. via `JSON.stringify`).
- `ttl` - Time-to-live in seconds (minimum 1). Defaults to 30.

**Returns:** `true` on success.

**Throws:** `EngineError` (`OPERATION_FAILED`) if the server does not reply `STORED`.

#### `add(key: string, value: string, ttl?: number): Promise<boolean>`

Store `value` only if the key does **not** already exist.

**Returns:**

- `true` on successful store
- `false` if the key already exists (server returned `NOT_STORED`)

**Throws:** `EngineError` (`OPERATION_FAILED`) for any other server response.

#### `replace(key: string, value: string, ttl?: number): Promise<boolean>`

Store `value` only if the key already exists.

**Returns:**

- `true` on successful store
- `false` if the key does not exist (server returned `NOT_STORED`)

**Throws:** `EngineError` (`OPERATION_FAILED`) for any other server response.

#### `cas(key: string, value: string, casToken: string, ttl?: number): Promise<boolean>`

Conditionally store `value` only if the server-side CAS token still matches
`casToken`. Use with [`gets()`](#getskey-string-promise-value-string-cas-string--null)
for optimistic concurrency control.

**Returns:**

- `true` on successful store
- `false` if another writer beat us (server returned `EXISTS`) or the key has
  since been removed (`NOT_FOUND`)

Callers can re-`gets` and retry on `false`.

**Throws:** `EngineError` (`OPERATION_FAILED`) for any other server response.

### Mutation

#### `append(key: string, value: string): Promise<boolean>`

Append `value` to the existing value at `key`. The key must already exist.

**Throws:** `EngineError` (`OPERATION_FAILED`) if the key does not exist.

#### `prepend(key: string, value: string): Promise<boolean>`

Prepend `value` to the existing value at `key`. The key must already exist.

**Throws:** `EngineError` (`OPERATION_FAILED`) if the key does not exist.

#### `delete(key: string): Promise<boolean>`

Delete `key` from the cache.

**Returns:** `true` if the key was deleted, `false` if it did not exist.

#### `touch(key: string, ttl: number): Promise<boolean>`

Update the expiry of an existing key without re-sending its value.

**Parameters:**

- `key` - Cache key.
- `ttl` - New time-to-live in seconds (minimum 1).

**Returns:** `true` if the key existed and its TTL was updated, `false` if the
key did not exist.

```typescript
// Sliding-window cache: extend session if it's still active.
const ok = await cache.touch(`session:${sid}`, 1800);
if (!ok) {
  // Session expired — force re-auth.
}
```

### Counters

#### `incr(key: string, delta?: number): Promise<number>`

Atomically increment the numeric value at `key` by `delta` (default `1`).

**Returns:** The new value after incrementing.

**Throws:** `EngineError` (`OPERATION_FAILED`) if the key does not exist or
does not contain a numeric value. Initialize counters with `set` first.

#### `decr(key: string, delta?: number): Promise<number>`

Atomically decrement the numeric value at `key` by `delta` (default `1`).
Memcached clamps decrements at `0` (does not go negative).

**Returns:** The new value after decrementing.

**Throws:** `EngineError` (`OPERATION_FAILED`) if the key does not exist or
does not contain a numeric value.

### Admin

#### `flush(delaySeconds?: number): Promise<boolean>`

Flush all data from the server.

**Parameters:**

- `delaySeconds` - Optional delay in seconds before the flush takes effect.
  The command returns `OK` immediately; existing entries are then expired
  after the delay. Useful for staggered invalidation across a fleet of clients.

**Returns:** `true` on success.

```typescript
await cache.flush(); // immediate
await cache.flush(10); // entries expire after 10 seconds
```

#### `stats(): Promise<string[]>`

Retrieve server statistics as raw `STAT <key> <value>` lines (with the
trailing `END` filtered out).

```typescript
const lines = await cache.stats();
for (const line of lines) {
  console.log(line); // e.g. "STAT pid 1234"
}
```

#### `version(): Promise<string>`

Retrieve the server version string.

```typescript
const v = await cache.version(); // "1.6.41"
```

## Examples

### Optimistic concurrency control

```typescript
async function safeIncrement(cache: MemcachedEngine, key: string) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const fetched = await cache.gets(key);
    if (!fetched) {
      // First write — initialize.
      const ok = await cache.add(key, '1', 60);
      if (ok) return 1;
      continue; // someone else added; retry as a normal increment
    }
    const next = (Number(fetched.value) + 1).toString();
    const stored = await cache.cas(key, next, fetched.cas, 60);
    if (stored) return Number(next);
    // Conflict — retry.
  }
  throw new Error('Failed to increment after 5 attempts');
}
```

### Sliding-window session cache

```typescript
class SessionCache {
  constructor(private cache: MemcachedEngine, private ttl: number) {}

  async load(sid: string) {
    const raw = await this.cache.get(`session:${sid}`);
    if (raw === null) return null;
    // Extend on every successful read.
    await this.cache.touch(`session:${sid}`, this.ttl);
    return JSON.parse(raw);
  }

  async save(sid: string, data: unknown) {
    await this.cache.set(`session:${sid}`, JSON.stringify(data), this.ttl);
  }

  async destroy(sid: string) {
    await this.cache.delete(`session:${sid}`);
  }
}
```

### Pooled, observed cache

```typescript
const cache = new MemcachedEngine('app-cache', {
  host: 'cache.internal',
  port: 11211,
  pool: { min: 2, max: 16, idleTimeoutSeconds: 60 },
  _onconnect: (id) => log.info(`${id} ready`),
  _onconnectionFailed: (id, err) => log.error(`${id} failed`, err),
  _onwarn: (_, msg) => log.warn(msg),
});

await cache.connect(); // optional — operations auto-connect anyway

// Use freely; pool serializes concurrent operations.
await Promise.all([
  cache.set('a', '1', 60),
  cache.set('b', '2', 60),
  cache.set('c', '3', 60),
]);

console.log(cache.poolStats); // { total, active, idle, waiting }
```

### Staggered invalidation across a fleet

```typescript
// All workers issue this; Memcached schedules the flush, so caches don't
// stampede the origin all at once.
const stagger = Math.floor(Math.random() * 30); // 0–30 seconds
await cache.flush(stagger);
```

---

[← Back to Drivers](../../README.md)
