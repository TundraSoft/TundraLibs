# Cacher quickstart

A runnable tour of `@tundralibs/cacher`'s common API (`set`/`get`/`has`/
`delete`/`clear`, per-entry and sliding TTL, namespace isolation) plus the
handful of behaviours that differ **per engine** — sourced from
[`../../README.md`](../../README.md) and
[`../../engines/Cacher-Engines.md`](../../engines/Cacher-Engines.md).

Only `MEMORY` needs no external service, so it's the only engine this
example actually exercises end to end. `memory.ts` runs every operation
against it and calls out, in comments next to each one, exactly how
`REDIS`/`MEMCACHED` would differ — see the per-engine docs
([`Cacher-Memory.md`](../../engines/memory/Cacher-Memory.md),
[`Cacher-Redis.md`](../../engines/redis/Cacher-Redis.md),
[`Cacher-Memcached.md`](../../engines/memcached/Cacher-Memcached.md)) for the
full detail behind each callout. `remote-config.ts` complements it by
constructing valid `REDIS`/`MEMCACHED` option shapes — including TLS —
without ever connecting to a server.

## Files

| File               | Shows                                                                                                                                                                                                                                                                                |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `memory.ts`        | `Cacher.create('MEMORY', …)`, `set`/`get`/`has`/`delete`, per-entry TTL, MEMORY's sub-second TTL precision, window (sliding) mode, namespace isolation, the `create()`-ignores-options gotcha, `cache.clear()` vs `Cacher.clear()`, and direct `new MemoryCacher(...)` instantiation |
| `remote-config.ts` | Valid `RedisCacherOptions`/`MemCacherOptions` shapes (auth, TLS via file paths, TLS via inline PEM), the runtime-only `username`/`password` pairing guard, and the type-level rejection of mixed inline/file TLS fields — construction only, no connection attempted                 |

## Run

```bash
# Deno
deno run packages/cacher/examples/quickstart/memory.ts
deno run packages/cacher/examples/quickstart/remote-config.ts

# Bun
bun run packages/cacher/examples/quickstart/memory.ts
bun run packages/cacher/examples/quickstart/remote-config.ts

# Node
node --import tsx packages/cacher/examples/quickstart/memory.ts
node --import tsx packages/cacher/examples/quickstart/remote-config.ts
```

Both files are self-contained and exit on their own — `remote-config.ts`
never calls `init()`/`set()`/`get()`/`has()`/`delete()`/`clear()`, so no
Redis or Memcached server needs to be running for either script.
