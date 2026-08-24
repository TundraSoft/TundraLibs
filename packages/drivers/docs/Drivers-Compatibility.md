# Driver Compatibility Matrix

A single view of every `@tundralibs/drivers` engine — what kind of store it
talks to, which SQL dialect it emits, how it reaches the wire, and which
capabilities it declares. Values are read straight from each engine's
`Capabilities` object; they are self-describing facts a consumer (norm's
`sqlExecutor`, application code) can branch on without knowing the concrete
class.

## Legend

- **Kind** — SQL (relational), document, or KV (key/value).
- **Dialect** — the OQL translator family. The public `engine.Dialect` getter
  is defined on `SQLConnectionEngine` — the pool-free base shared by
  `SQLEngine` (the pooled SQL engines) **and** the three pool-free HTTP
  engines (`NeonHttpEngine`, `TursoEngine`, `D1Engine`), so every SQL engine
  in the matrix has it. Document/KV engines (`MongoEngine`, `RedisEngine`,
  `MemcachedEngine`) extend a different, non-SQL base (`ConnectionEngine` /
  `BaseEngine`) that declares no `Dialect` property at all — `engine.Dialect`
  on one of them is a **compile-time** `TS2339`, not a value that reads as
  `undefined` at runtime, so their cell is `—`. (`MongoEngine` still
  translates OQL to Mongo operations internally — it just carries no public
  SQL-dialect getter.) A consumer holding a mixed union of engine types
  should narrow with `'Dialect' in engine` rather than reading the property
  directly — see
  [Branching on capabilities at runtime](#branching-on-capabilities-at-runtime)
  below.
- **Transport** — how bytes leave the process.
- **Edge-safe** — runs on every edge/serverless runtime, including ones with
  no socket primitive at all (Vercel Edge), because it uses only global
  `fetch`. Cloudflare Workers and Deno Deploy are partial exceptions to the ❌
  column — see [Edge / serverless](#edge--serverless) below.
- ✅ supported · ❌ not supported · — not applicable (capability is
  SQL-only; KV/document engines don't declare it).

## Matrix

| Engine                        | Kind     | Dialect  | Transport                           | Edge-safe | Transactions | Prepared statements | Connection pooling | Advisory lock | Referential actions | In-place alter |
| ----------------------------- | -------- | -------- | ----------------------------------- | --------- | ------------ | ------------------- | ------------------ | ------------- | ------------------- | -------------- |
| `PostgresEngine`              | SQL      | postgres | TCP socket (wire v3, scratch)       | ❌        | ✅           | ✅                  | ✅                 | ✅            | ✅                  | ✅             |
| `CockroachEngine` _(alias)_   | SQL      | postgres | TCP socket                          | ❌        | ✅           | ✅                  | ✅                 | ❌            | ✅                  | ✅             |
| `YugabyteEngine` _(alias)_    | SQL      | postgres | TCP socket                          | ❌        | ✅           | ✅                  | ✅                 | ❌            | ✅                  | ✅             |
| `AlloyDBEngine` _(alias)_     | SQL      | postgres | TCP socket                          | ❌        | ✅           | ✅                  | ✅                 | ✅            | ✅                  | ✅             |
| `CitusEngine` _(alias)_       | SQL      | postgres | TCP socket                          | ❌        | ✅           | ✅                  | ✅                 | ✅            | ✅                  | ✅             |
| `MariaEngine`                 | SQL      | maria    | `npm:mariadb` (TCP)                 | ❌        | ✅           | ✅                  | ✅                 | ✅            | ✅                  | ✅             |
| `PlanetScaleEngine` _(alias)_ | SQL      | maria    | `npm:mariadb` (TCP)                 | ❌        | ✅           | ✅                  | ✅                 | ❌            | ❌                  | ✅             |
| `SQLiteEngine`                | SQL      | sqlite   | embedded (in-process)               | ❌        | ✅           | ✅                  | ❌                 | ❌            | ✅                  | ❌             |
| `MongoEngine`                 | document | —        | `npm:mongodb` (TCP)                 | ❌        | ❌           | ❌                  | ❌                 | —             | —                   | —              |
| `RedisEngine`                 | KV       | —        | TCP (RESP3, scratch)                | ❌        | ❌           | ❌                  | ✅                 | —             | —                   | —              |
| `MemcachedEngine`             | KV       | —        | TCP (text, scratch)                 | ❌        | ❌           | ❌                  | ✅                 | —             | —                   | —              |
| `NeonHttpEngine`              | SQL      | postgres | HTTPS `fetch` (`POST /sql`)         | ✅        | ❌           | ❌                  | ❌                 | ❌            | ✅                  | ✅             |
| `TursoEngine`                 | SQL      | sqlite   | HTTPS `fetch` (`POST /v3/pipeline`) | ✅        | ❌           | ❌                  | ❌                 | ❌            | ✅                  | ❌             |
| `D1Engine`                    | SQL      | sqlite   | HTTPS `fetch` (`POST …/query`)      | ✅        | ❌           | ❌                  | ❌                 | ❌            | ✅                  | ❌             |

Notes:

- **Aliases reuse a base engine and override only what differs.**
  `CockroachEngine` and `YugabyteEngine` both extend `PostgresEngine`: each is a
  **distributed** SQL database whose advisory locks are node-local (and, for
  Yugabyte, version-dependent), unsafe for the cluster-wide mutual exclusion the
  capability implies — so `advisoryLock: false`, everything else stock Postgres.
  `AlloyDBEngine` (Google AlloyDB) and `CitusEngine` (Citus / Azure Cosmos DB
  for PostgreSQL) also extend `PostgresEngine` but are **identity aliases** with
  full stock-Postgres capability parity (a distinct `Engine` value for telemetry
  / discoverability) — AlloyDB is enhanced Postgres and Citus is an extension on
  Postgres, so `advisoryLock` stays `true` (Citus's is coordinator-scoped, which
  all clients route through). A plain `PostgresEngine` also works against both.
  `PlanetScaleEngine` extends `MariaEngine` for a standard MySQL-protocol
  connection to Vitess — which does not enforce `FOREIGN KEY` constraints and
  whose `GET_LOCK` is not cluster-wide, so both `referentialActions` and
  `advisoryLock` are `false`. Byte-compatible backends (Aurora/RDS, AlloyDB,
  Supabase, TimescaleDB, TiDB, SingleStore) need no alias — point the base
  engine at them.
- **`SQLiteEngine` is single-connection by design** (an embedded, in-process
  library — no socket, no server), so `pooledConnections` is `false` and there
  is no server-side advisory lock; `ALTER` cannot retype a column
  (`inPlaceAlter: false`).
- **`MongoEngine` / `RedisEngine` / `MemcachedEngine` declare only the shared
  `EngineCapabilities`** (`transactions`, `preparedStatements`,
  `pooledConnections`); the SQL-only flags (`advisoryLock`,
  `referentialActions`, `inPlaceAlter`) don't apply. Mongo and Redis _could_
  support transactions (Mongo sessions, Redis `MULTI`/`EXEC`) but the surface
  isn't wired through yet, so both declare `transactions: false` honestly.

## Branching on capabilities at runtime

Every value in the matrix above is read straight off `engine.Capabilities`
(and, for SQL engines, `engine.Dialect`) — no engine-specific `instanceof`
checks needed. `Capabilities` is present on every engine type, so it's
always safe to read; `Dialect` is not (see the Legend note above), so narrow
with `'Dialect' in engine` rather than reading it directly on a value whose
static type might be a non-SQL engine:

```typescript
import { PostgresEngine } from '@tundralibs/drivers/postgres';
import { RedisEngine } from '@tundralibs/drivers/redis';

type AnyEngine = PostgresEngine | RedisEngine;

/** SQL dialect when the engine has one, `undefined` for document/KV engines. */
function dialectOf(engine: AnyEngine): string | undefined {
  // `Dialect` only exists on SQL engines (`SQLConnectionEngine` subclasses,
  // covering every SQL row in the matrix above). `'Dialect' in engine` both
  // checks its presence and narrows the type — reading `engine.Dialect`
  // directly on a `RedisEngine`-typed value is a compile error, not a
  // runtime `undefined`.
  return 'Dialect' in engine ? engine.Dialect : undefined;
}

const pg = new PostgresEngine('app', { host: 'localhost', database: 'app' });
const cache = new RedisEngine('cache', { host: 'localhost' });

console.log(pg.Capabilities.transactions); // true — safe to call pg.transaction(fn)
console.log(cache.Capabilities.transactions); // false — RedisEngine has no transaction() at all
console.log(dialectOf(pg)); // 'postgres'
console.log(dialectOf(cache)); // undefined
```

## Edge / serverless

Three edge/HTTP drivers ship today — all pool-free, one request per query, each a
thin transport swap over an existing translator:

- **`NeonHttpEngine`** — Postgres-over-HTTP. POSTs each statement to
  `https://<host>/sql`, reusing the Postgres translator (`Dialect = 'postgres'`)
  and the shared Postgres text-value decoder, so the emitted SQL and decoded
  rows are identical to `PostgresEngine`'s.
- **`TursoEngine`** — SQLite-over-HTTP (Turso / libSQL Hrana v3). POSTs an
  `[execute, close]` pipeline to `https://<host>/v3/pipeline`, reusing the
  SQLite translator (`Dialect = 'sqlite'`), the pure Hrana value map, and the
  shared SQLite error map — so the emitted SQL and mapped errors are identical
  to `SQLiteEngine`'s, **without** importing any native SQLite binding.
- **`D1Engine`** — SQLite-over-HTTP (Cloudflare D1 REST). POSTs `{ sql, params }`
  (positional `?`) to
  `…/accounts/{accountId}/d1/database/{databaseId}/query`, reusing the SQLite
  translator (`Dialect = 'sqlite'`) and the shared SQLite error map — so the
  emitted SQL and mapped errors are identical to `SQLiteEngine`'s, **without**
  importing any native SQLite binding. Targets D1's REST path (not the in-Worker
  `env.DB` binding); int64 params are lossy over JSON beyond ±(2^53 − 1).

All three POST over RESTler → the runtime's native global `fetch`, never opening
a socket (and, for Turso and D1, never loading a native SQLite driver), so they
run unchanged on Cloudflare Workers, Vercel Edge, and Deno Deploy — only the
transport differs from their socket/embedded siblings.

**Cloudflare Workers and Deno Deploy are not socket-less, despite the ❌ in
the Edge-safe column above.** `PostgresEngine`, `MariaEngine`, `RedisEngine`,
and `MemcachedEngine` open real TCP connections on both, but not identically:
on Deno Deploy all four connect natively, since it runs the real Deno runtime
and `Deno.connect` works unchanged. On Workers, `PostgresEngine`,
`RedisEngine` and `MemcachedEngine` connect via `@tundralibs/compat`'s
`net.connect()`, which runs on `cloudflare:sockets` — workerd's
outbound-socket primitive — with no `nodejs_compat` compatibility flag
required; `MariaEngine` connects too, but by a different path, since it wraps
the third-party `mariadb` driver directly instead of `compat/net` — it needs
the `nodejs_compat` flag to shim `node:net` underneath that driver. Every one
of the four works the same as on Deno/Bun/Node, as long as the target is
reachable from them. The Edge-safe column tracks _fetch-only_ portability
across every edge runtime, including Vercel Edge, which has no socket
primitive at all; Workers and Deno Deploy are the two edge targets where the
TCP engines also happen to work.

Still **planned** (see [`ROADMAP.md`](../ROADMAP.md) → _Planned / deferred_), a
thin transport swap over its existing translator:

| Driver           | Backend     | Transport                       | Reuses translator |
| ---------------- | ----------- | ------------------------------- | ----------------- |
| PlanetScale-HTTP | PlanetScale | HTTPS (`@planetscale/database`) | MariaDB (no FK)   |

(The `PlanetScaleEngine` alias above is the standard MySQL-protocol connection;
the edge HTTP endpoint is a different transport and gets its own engine.)

**Foreign-key enforcement over Turso HTTP** is server-dependent: `TursoEngine`
declares `referentialActions: true` so the translator still emits FK DDL, but
stateless one-shot HTTP holds no `PRAGMA foreign_keys = ON`, so runtime
enforcement follows the server default (Turso cloud ON; a bare `sqld` typically
OFF). No pragma is injected. **Cloudflare D1**, by contrast, enforces foreign
keys by default on every query, so `D1Engine`'s FK constraints are enforced at
runtime without any pragma.

### Functional support over one-shot HTTP (for norm)

Because each `execute()` is a standalone HTTP request, there is no session to
carry state across calls. What that means for a higher-level consumer like
norm:

- **KEEPS** (all stateless SQL): CRUD, joins, projections, `.encrypt()` /
  `.hash()`, hashed filters, DDL migrations, **RETURNING on INSERT** (it's in
  the translated SQL and the HTTP API returns the rows), LIMIT/OFFSET paging.
  (Caveat: because `transactions: false`, a **multi-statement** DDL call is not
  atomic here — the tx wrapper is skipped, so a partial failure does not roll
  back statements that already succeeded.)
- **LOSES**: interactive multi-statement transactions — the only user-visible
  loss. `transactions: false`, so `transaction()` / `beginTransaction()` reject
  with `UNSUPPORTED_OPERATION` at the base guard (the same seam Mongo uses),
  before any client is reserved.
- **DEGRADES gracefully**: advisory locks off (a migrator falls back to a file
  lock); no result streaming (norm pages via LIMIT/OFFSET anyway); no
  LISTEN/NOTIFY, `SET`, temp tables, or session-lifetime prepared statements
  (norm uses none).

### Security posture

The `Neon-Connection-String` header carries the database password (it is the
primary authentication mechanism). It lives on the RESTler client's default
headers, never on a thrown error: `NeonHttpEngine._wrapDriverError` copies only
the safe, query-relevant fields (`sqlState`, `table`, `column`, `constraint`,
`detail`, the SQL text), and RESTler redacts the connection-string header in
its own error and log output. An optional bearer `token` (Neon Authorize / RLS)
is handled the same way.

## See also

- [Postgres engine](../engines/postgres/Drivers-Postgres.md) ·
  [SQLite engine](../engines/sqlite/Drivers-SQLite.md)
- [Neon (HTTP) engine](../engines/neon/Drivers-Neon.md) ·
  [Turso (HTTP) engine](../engines/turso/Drivers-Turso.md) ·
  [Cloudflare D1 (HTTP) engine](../engines/d1/Drivers-D1.md)
- [SQLEngine](Drivers-SQLEngine.md) · [BaseEngine](Drivers-BaseEngine.md) ·
  [Error handling](Drivers-Errors.md)

[← Back to Drivers](../README.md)
