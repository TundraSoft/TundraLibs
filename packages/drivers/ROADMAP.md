# Drivers Roadmap

> **Status:** Four pooled TCP/socket engines (Postgres, MariaDB, SQLite,
> Mongo) and three edge/serverless HTTP engines (Neon, Turso, Cloudflare
> D1) are shipped and green across Deno/Bun/Node. The base abstractions
> (pooling, SQL transactions with savepoints) are settled; remaining work
> is the deferred features in [Planned / deferred](#planned--deferred).
>
> **Last updated:** 2026-08-20

## Current state

| Engine           | Transport                                  | Notes                                                           |
| ---------------- | ------------------------------------------ | --------------------------------------------------------------- |
| `PostgresEngine` | from-scratch pg wire v3 + SCRAM-SHA-256    | binary-format params for the types where it pays; alias base    |
| `MariaEngine`    | wraps `npm:mariadb`                        | MySQL 5.7/8 wire-compatible; alias base                         |
| `SQLiteEngine`   | embedded (`bun:` / `@db/` / `node:sqlite`) | prepared-statement cache per connection                         |
| `MongoEngine`    | wraps `npm:mongodb`                        | pool-free (`ConnectionEngine`); no transactions yet (see below) |
| `NeonHttpEngine` | HTTPS `/sql` over RESTler → `fetch`        | reuses the Postgres translator; edge-safe; one-shot (no txns)   |
| `TursoEngine`    | Turso/libSQL Hrana v3 over HTTP            | reuses the SQLite translator; edge-safe; one-shot               |
| `D1Engine`       | Cloudflare D1 REST `/query`                | reuses the SQLite translator; edge-safe; int64 lossy over JSON  |

Alias engines let byte-compatible backends reuse a base engine by
self-declaring capabilities: `CockroachEngine` (extends `PostgresEngine`,
`advisoryLock: false`), `PlanetScaleEngine` (extends `MariaEngine`,
`advisoryLock`/`referentialActions: false`). Aurora, AlloyDB, Supabase,
Timescale, Yugabyte, TiDB, SingleStore, DocumentDB, Cosmos and others
reach through the base engines with no new code — see
[`docs/Drivers-Compatibility.md`](docs/Drivers-Compatibility.md).

## Planned / deferred

Each is a genuine deferral — the feature isn't built and won't be until a
real workload drives the design. Granular sub-tasks live in GitHub Issues.

- **PlanetScale HTTP engine** — the fourth edge driver (`@planetscale/database`
  transport, MariaDB translator with FK DDL skipped). Medium priority; the
  other three edge backends already ship.
- **Mongo transaction surface** — `MongoEngine` drops `transactionId`
  silently (no session plumbing). Bringing it to parity needs a
  session registry keyed by tx id, session-threaded dispatch, and OQL
  methods that accept/forward `transactionId`. Replica-set/sharded only;
  the capability flag must expose that.
- **Prepared-statement caching (Postgres / MariaDB)** — SQLite caches
  per connection; PG/Maria don't. Non-trivial: session-scoped statement
  names, cross-connection plan invalidation (`ERROR 0A000`), and MariaDB's
  driver not exposing a clean cache handle. Gate behind an opt-in
  `enableStatementCache` when a benchmark shows parse overhead matters.
- **Streaming / cursor SELECT** — `select()` materialises the full row
  set. Want `engine.selectStream<R>(query)` (PG `CURSOR`/`FETCH`, MariaDB
  `queryStream()`, SQLite `iterate()`, Mongo native cursors). Open design
  questions: backpressure, cursor-in-transaction lifetime, `AsyncIterable`
  vs Web `ReadableStream`.
- **Redis pipelining** — every command is one round-trip. Add
  `pipeline(commands)` that writes the encoded batch in one `write()` and
  reads N replies. Same RESP frames, no protocol change.
- **Redis / Memcached raw-bytes API** — both decode bulk strings via
  `TextDecoder` and return `string`; arbitrary binary gets UTF-8 mangled.
  Add `getBytes(key): Uint8Array | null` alongside the string `get`.
- **Postgres SCRAM-SHA-256-PLUS (channel binding)** — `auth.ts` does
  SCRAM-SHA-256 only (`n,,`). `-PLUS` binds the SASL exchange to the TLS
  channel; needs the runtime to expose the peer cert (Bun/Node via
  `tls.TLSSocket.getPeerCertificate()`; Deno's `Deno.Conn` doesn't).
- **Additional engines (use-case driven)** — DuckDB (embedded, SQLite-shaped,
  OLAP companion), ClickHouse (read-mostly capability profile — no real
  UPDATE/DELETE/txn), Cassandra/ScyllaDB (CQL — a separate translator, not
  an alias). Defer until a concrete workload asks.
- **Alias follow-ups** — the Migrator honouring `referentialActions: false`
  (PlanetScale FK skip, blocked on the stored-plan hash check tolerating a
  per-server FK-strip variant), and per-engine DDL-emitter overrides (CRDB's
  no `CREATE INDEX CONCURRENTLY` in a txn, Timescale hypertables). `db.raw`
  covers these meanwhile.

## Architecture decisions worth remembering

- **Capabilities live on the engine, not the dialect string.**
  `SQLEngineCapabilities` carries `advisoryLock` / `inPlaceAlter` /
  `referentialActions`; each engine declares them and exposes
  `Dialect` (the translator family). Consumers read `engine.Capabilities.*`
  instead of switching on the dialect literal — which is what makes clean
  aliasing possible and kills the silent `'sqlite'` fallback for an
  unknown label. `advisoryLock()` fails closed when the capability is off.
- **Edge drivers reuse the existing translators verbatim.** Neon is
  wire-Postgres, Turso/D1 are wire-SQLite — no new dialect, so each edge
  engine reimplements only the transport (`_execute` + tx methods +
  `Capabilities`) and inherits the translator, value decoder, and SQLSTATE
  map. HTTP is the transport, [`@tundralibs/restler`](../restler) is the
  layer (bearer-token auth built in), and it runs over the runtime's
  native global `fetch` — no node-only module in the import graph, so the
  edge bundle stays clean (`deno task check:edge-safety` enforces this).
- **The pool-free split.** `BaseEngine` was split into a pool-free
  `ConnectionEngine` root (lifecycle, identity, events, capabilities,
  status, result helpers) and a `PooledConnectionEngine` layer that
  composes `ConnectionPool<T>`; the pooled layer keeps the historical
  `BaseEngine` name so `extends BaseEngine` is unchanged. The same split
  landed for SQL: pool-free `SQLConnectionEngine` (transactions, execution,
  OQL translation) below the pooled `SQLEngine`. Edge/HTTP SQL drivers
  extend `SQLConnectionEngine` directly — single `_resource`, no socket
  pool. `transactions` and `preparedStatements` are lifted to
  `EngineCapabilities` so every engine declares the same shape.
- **Functional support over one-shot HTTP (for norm).** Stateless SQL —
  CRUD, joins, projections, `.encrypt()`/`.hash()`, hashed filters, DDL
  migrations, `RETURNING`, LIMIT/OFFSET paging — all **keep** working. The
  only user-visible **loss** is interactive multi-statement transactions
  (`norm.transaction()` rejects cleanly on a `transactions:false` engine,
  the same seam Mongo uses). Advisory locks **degrade** gracefully (the
  Migrator falls back to a file lock).
- **Naming: `soak.ts`, not `dogfood.ts`.** Long-running realistic-workload
  scripts use the industry term "soak test" (`SOAK_DURATION_S` /
  `SOAK_WORKERS`).

## Related

- [@tundralibs/oql](../oql) — the query translators these engines consume
- [@tundralibs/norm](../norm) — the model layer built on top of the drivers
- [`docs/Drivers-Compatibility.md`](docs/Drivers-Compatibility.md) — the
  per-backend compatibility matrix
