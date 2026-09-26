# Cacher Workers KV Engine

Cache engine backed by a Cloudflare Workers KV namespace.

![Cloudflare Workers](https://img.shields.io/badge/Cloudflare%20Workers-F38020?logo=cloudflare&logoColor=white)

> **Runtime note:** `WorkersKVCacher` needs a KV namespace binding, which only
> a Worker (or Miniflare) provides. The class imports on every runtime, and
> there is no REST fallback for Deno, Bun or Node. Use `REDIS` or `MEMCACHED`
> there instead.

## Overview

`WorkersKVCacher` stores entries in the KV namespace bound to your Worker. It
is shared by every isolate and data centre, needs no server of its own, and
serves reads from Cloudflare's edge cache.

KV is eventually consistent. A write or delete is visible at once in the data
centre that made it, and can take 60 seconds or more to reach the others.
That suits read-through caches, such as norm's read cache, and data that
changes rarely. It does not suit state that must be revoked everywhere at
once.

| Feature                  | Supported |
| ------------------------ | :-------: |
| No external dependencies |    ✅     |
| Shared across processes  |    ✅     |
| TLS / SSL support        |    n/a    |
| Sliding (window) expiry  |    ❌     |
| Per-entry custom TTL     |   ✅\*    |
| Namespace isolation      |    ✅     |

\* `0` (no expiry) or at least 60 seconds.

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

Bind a KV namespace to the Worker in `wrangler.jsonc`:

```jsonc
{
  "kv_namespaces": [{ "binding": "CACHE", "id": "<namespace-id>" }]
}
```

## API Reference

### `WorkersKVCacherOptions`

| Option          | Type                 | Default  | Description                                           |
| --------------- | -------------------- | -------- | ----------------------------------------------------- |
| `binding`       | `WorkersKVNamespace` | required | The KV namespace from the Worker's `env`              |
| `defaultExpiry` | `number`             | `300`    | Default TTL in seconds: `0` (no expiry) or 60–2592000 |

`WorkersKVNamespace` is the part of Cloudflare's `KVNamespace` the engine
calls: `get`, `put` and `delete`. The binding on `env` satisfies it, so cacher
needs no dependency on `@cloudflare/workers-types`.

### `new WorkersKVCacher(name, options)`

Throws `CacherEngineError`:

- `CONFIG_MISSING` without a `binding`.
- `CONFIG_INVALID` if `binding` lacks `get`, `put` or `delete`, or
  `defaultExpiry` is between 1 and 59.

### Methods

All methods are inherited from `AbstractEngine`. See
[Cacher-Engines](../Cacher-Engines.md#common-api). `set()` throws
`OPERATION_INVALID_PARAMS` for `window: true` or an `expiry` between 1 and 59,
before anything is written.

## Usage Examples

### In a Worker

```typescript
import { Cacher, type WorkersKVNamespace } from '@tundralibs/cacher';

type Env = { CACHE: WorkersKVNamespace };

export default {
  async fetch(_req: Request, env: Env): Promise<Response> {
    const cache = Cacher.create('WORKERS_KV', 'pages', {
      binding: env.CACHE,
      defaultExpiry: 600,
    });
    const hit = await cache.get<{ title: string }>('home');
    if (hit) return Response.json(hit);
    const page = { title: 'Home' };
    await cache.set('home', page);
    return Response.json(page);
  },
};
```

### Direct instantiation

```typescript
import { WorkersKVCacher } from '@tundralibs/cacher/engines';
import type { WorkersKVNamespace } from '@tundralibs/cacher';

declare const env: { CACHE: WorkersKVNamespace };

const cache = new WorkersKVCacher('sessions', { binding: env.CACHE });
await cache.set('session:abc', { userId: 42 }, { expiry: 3600 });
```

## Notes

- **Consistency.** `delete()` and `clear()` follow the same propagation as
  writes. A reader in another data centre can see the old entry for up to 60
  seconds.
- **Expiry.** KV rejects an `expirationTtl` below 60 seconds, so the engine
  rejects `expiry` between 1 and 59 rather than rounding it.
- **No window mode.** KV cannot extend a TTL without rewriting the value, so a
  sliding expiry would turn every read into a write.
- **One write per second per key.** KV rate-limits a key written more often
  than that. The failure surfaces as `OPERATION_FAILED`, with KV's error as
  `cause`.
- **`clear()`.** KV cannot delete a namespace's keys through a binding, so
  `clear()` writes a new random version to `{name}:__ns_version__`. Data keys
  are `{name}:v{version}:{key}`, and the old ones become unreachable. They stay
  stored until their own TTL expires, so an entry written with `expiry: 0`
  stays until you delete it by other means, for example with
  `wrangler kv key delete`. Each instance re-reads the version at most once
  per second.
- **Keys.** KV caps a key at 512 bytes. A `{key}` that would push the stored
  key past that is replaced by its SHA-256 digest, and a `{name}` longer than
  300 bytes is too.
- **`has()`** reads the value, since KV has no existence check.

---

[← Back to Cacher Engines](../Cacher-Engines.md)
