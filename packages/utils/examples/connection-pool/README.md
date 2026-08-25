# Connection pool — the `utils` core, composed

One small class showing how `Options`, `Events`, `BaseError`, and
`Singleton` — the package's stated core — fit together: a connection
pool whose config is validated, whose lifecycle is observable, and
which the whole process shares as one instance.

Run on any runtime:

```bash
deno run packages/utils/examples/connection-pool/main.ts
bun run packages/utils/examples/connection-pool/main.ts
node --import tsx packages/utils/examples/connection-pool/main.ts
```

| File                | Shows                                                                                                                                                                                                                                                                                                              |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `PoolErrors.ts`     | a `BaseError` subclass with a fixed `_messageTemplate` and typed `context` — see [Utils-BaseError.md](../../docs/Utils-BaseError.md)                                                                                                                                                                               |
| `ConnectionPool.ts` | `Options<O, E>` config + `_processOption` validation + `_setOption` for a post-construction update, `Events`' protected `_emit`, and `@Singleton` on top — see [Utils-Options.md](../../docs/Utils-Options.md), [Utils-Events.md](../../docs/Utils-Events.md), [Utils-Singleton.md](../../docs/Utils-Singleton.md) |
| `main.ts`           | constructs the pool, proves the `@Singleton` (a second `new` is ignored), drives it past `maxConnections`, and resizes it                                                                                                                                                                                          |

Expected output (abridged):

```text
1. construct + subscribe to events

2. @Singleton: a second construction is ignored
   pool === samePool: true
   maxConnections (first construction wins): 2
...
4. one more connect() throws a PoolConfigError (BaseError)
   exhausted → pool is full
   message: invalid connection pool option "maxConnections" (2): pool exhausted — call release() or resize() first
...
6. resize() is validated the same way the constructor is
   resize(0) rejected: invalid connection pool option "maxConnections" (0): must be >= 1
   resize(5) accepted, maxConnections: 5
```

Note the `@Singleton` example here decorates a single, non-inherited
class — see the "Composing with inheritance" warning in
[Utils-Singleton.md](../../docs/Utils-Singleton.md) before decorating
both a base class and a subclass of it.
