# Caching

Caching is opt-in. With no `cache` config pact holds no cache instances and
every resolution hits your hooks — correct, simple, and the right default
until hook traffic says otherwise. Opting in trades bounded staleness for
round-trips, per data type.

## Table of Contents

- [Configuration](#configuration)
- [The instance name is the namespace](#the-instance-name-is-the-namespace)
- [Invalidation is freshness](#invalidation-is-freshness)
- [What lands in the cache](#what-lands-in-the-cache)
- [Engine notes](#engine-notes)

## Configuration

```typescript
import { Pact } from '@tundralibs/pact';

const pact = Pact.create({
  bits: { READ: 1n },
  modulePermissions: { Post: ['READ'] },
  name: 'my-api', // the cache namespace — required for non-MEMORY engines
  options: {
    cache: {
      // engine: 'MEMORY' (default) | 'REDIS' | 'MEMCACHED' | ...
      ttl: { principal: 15, apiKey: 5, session: 5 }, // minutes, per type
      // options: { host, port, ... } passed to the cacher engine
    },
  },
});
```

Three cache types exist — `principal` (resolved actors with grants),
`apiKey` (key records), `session` (session records). A type without a TTL
(or with `0`) gets no cache instance and always hits the hook; TTLs are
minutes, fixed per entry, capped at 30 days.

## The instance name is the namespace

Cache keys live under `<name>__<type>` cacher namespaces
(`my-api__principal`, ...). The `name` on the create definition is that
namespace root, which makes it a deployment-wide identity:

- Two pact instances with the same explicit name share caches — that is
  the intended multi-process production shape on a shared engine.
- Two different applications on one shared Redis must use different
  names. Grants are positional bitmasks, so a foreign cached principal is
  not garbage but a plausible-looking wrong answer.
- An unnamed instance gets a per-process auto name (`pact-<n>`), safe by
  construction on MEMORY. Configuring a non-MEMORY engine without an
  explicit name throws `INVALID_OPTION` at construction, because
  per-process auto names cannot form a coherent shared namespace.

Names reject `:` (cacher's key separator) and `__` (the type separator).

## Invalidation is freshness

Grants and statuses live in your storage, where pact cannot see writes.
With caching on, a change becomes visible when the TTL lapses or when you
say so:

| Call                      | Effect                                                            |
| ------------------------- | ----------------------------------------------------------------- |
| `invalidatePrincipal(id)` | Evicts one principal; also stale-marks every held bound principal |
| `revokeApiKey(keyId)`     | Revokes via hook, evicts the key and its principal entries        |
| `clearCache()`            | Clears every type — the coarse escape hatch                       |

Call `invalidatePrincipal` after any grants or status write and the change
is immediate; forget it and the change lands within the TTL. All three
calls also bump the epoch that forces
[bound principals](Pact-Security.md) to re-resolve at their next check.

## What lands in the cache

Values are encoded through a JSON-safe carrier (bigint masks and dates
round-trip; `__proto__` keys are dropped in both directions). Two entries
deserve a policy decision:

- **API-key records carry the raw secret** — they must, since both the
  APIKEY comparison and HMAC recomputation need it. On an external engine
  that means raw secrets in Redis memory and snapshots. Enable the
  `apiKey` TTL only when the engine is inside your trust boundary;
  omitting it is the opt-out (keys then resolve through `getApiKey` every
  time). Anyone with write access to the cache can impersonate actors
  regardless — the cache engine is part of the trusted base once you opt
  in.
- **Sessions in cache-only mode** are the store itself — see
  [Sessions](Pact-Sessions.md).

## Engine notes

- **MEMORY** is per-process: each process warms its own cache, restarts
  start cold, and on Cloudflare Workers each isolate is its own "process",
  which makes MEMORY caching there close to a no-op.
- Same-name instances share the underlying cacher instance; the first
  construction's engine options win and later ones are ignored.
- A misconfigured engine fails at construction with `CACHE_INIT_FAILED`,
  never silently.

---

[← Back to Pact](../README.md)
