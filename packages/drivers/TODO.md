# Drivers — Open Items

Living list of follow-ups that aren't yet scheduled but are tracked so
they don't get lost.

Items are tagged:

- **[bug]** — incorrect behavior that should be fixed. Not "deferred" —
  just hasn't been hit hard enough to surface as a customer report.
- **[cleanup]** — code-shape or API-surface improvement; behavior is
  correct today.
- **[gap]** — intentional deferral; the feature isn't built and won't
  be until there's a real use case driving the design.

## [gap] Database compatibility via driver aliasing (2026-07-13)

The four SQL/document engines speak standard wire protocols / official
clients, so many managed and wire-compatible databases work **today** by
pointing an existing engine at them — BYO `engine`, or norm's
`database: { dialect, host, ... }`. Verified reach and the sharp edges
that block _clean_ aliasing:

### Reach today (no new code)

| Engine (dialect) | Transport                               | Aliases to (works now)                                                                                                                    |
| ---------------- | --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Postgres         | from-scratch pg wire v3 + SCRAM-SHA-256 | Aurora/RDS Postgres, AlloyDB, Supabase, **TimescaleDB** (extension = real PG), Materialize, Yugabyte (YSQL), CockroachDB, Neon (over TCP) |
| MariaDB          | wraps `npm:mariadb`                     | MySQL 5.7/8, Aurora/RDS MySQL, TiDB, Vitess, SingleStore                                                                                  |
| SQLite           | embedded (`bun:`/`@db/`/`node:sqlite`)  | libSQL **local** file, any embedded SQLite                                                                                                |
| Mongo            | wraps `npm:mongodb` (URI)               | Atlas, DocumentDB, Cosmos DB (Mongo API), FerretDB                                                                                        |

### What blocked _clean_ aliasing — and the alias-engine fix (2026-07-13)

The root problem was that capabilities were a fixed switch on the dialect
_string_, so an aliased DB inherited the base dialect's assumptions
wholesale. **RESOLVED** by making engines self-describe:

- **DONE — capabilities on the engine.** `SQLEngineCapabilities` gained
  `advisoryLock` / `inPlaceAlter` / `referentialActions`; each engine
  declares them, and `SQLEngine.Dialect` exposes the translator family.
  norm's `sqlExecutor` now reads `engine.Capabilities.*` + `engine.Dialect`
  instead of switching on `engine.Engine` (killing the silent `'sqlite'`
  fallback for an unknown label). `advisoryLock()` fails closed when the
  capability is off, so no doomed `pg_advisory_lock` is issued.
- **DONE — alias engines.** `CockroachEngine` (extends `PostgresEngine`,
  `advisoryLock: false`, reuses the Postgres translator/plans) and
  `PlanetScaleEngine` (extends `MariaEngine`, `advisoryLock: false`,
  `referentialActions: false`). Byte-identical backends (Aurora / AlloyDB
  / Supabase / Timescale / TiDB / SingleStore) still use the base engine
  as-is — no alias needed. Verified without a live DB in
  `engines/aliases.test.ts` + `norm/executor.test.ts`.

Remaining under this heading:

1. **Migrator honoring `referentialActions: false`** (PlanetScale's FK
   skip). The capability is declared, but norm's migration still emits FK
   constraint DDL. Non-trivial because the stored per-dialect `.sql` plan
   is rendered generically (the 'maria' plan HAS FKs) while a PlanetScale
   apply would skip them → plan-hash mismatch. Needs a per-server plan
   variant or an apply-time FK-strip that the hash check tolerates.
2. **No target-specific DDL tuning** — an alias engine can flip capability
   flags but not (yet) override individual DDL emitters (CRDB's no
   `CREATE INDEX CONCURRENTLY` in a txn, Timescale hypertables). Add a
   per-engine DDL hook when a real workload needs it. `db.raw` covers it
   meanwhile.
3. **Serverless/edge targets are HTTP-only** (Neon serverless, Turso
   remote libSQL, Cloudflare D1, PlanetScale HTTP, Upstash) — the current
   engines are all TCP/socket. → new drivers below.

**DONE** — the compatibility matrix is published as
[`docs/Drivers-Compatibility.md`](docs/Drivers-Compatibility.md).

## [gap] Edge / serverless HTTP drivers (2026-07-13)

Current engines dial TCP; edge runtimes (Cloudflare Workers, Vercel
Edge, Deno Deploy) forbid raw sockets, and the serverless DBs above are
HTTP-native. New engines, each a thin `BaseEngine`/`SQLEngine` subclass
that swaps the transport but **reuses the existing OQL translators**:

| Driver           | Backend       | Transport                       | Reuses translator | Priority           |
| ---------------- | ------------- | ------------------------------- | ----------------- | ------------------ |
| `NeonHttpEngine` | Neon          | HTTPS (`/sql` fetch)            | Postgres          | **DONE (shipped)** |
| `TursoEngine`    | Turso/libSQL  | HTTP (Hrana v3)                 | SQLite            | **DONE (shipped)** |
| `D1Engine`       | Cloudflare D1 | HTTPS (D1 REST `/query`)        | SQLite            | **DONE (shipped)** |
| PlanetScale-HTTP | PlanetScale   | HTTPS (`@planetscale/database`) | MariaDB (no FK)   | medium             |

**DONE — `NeonHttpEngine` shipped** (the first edge/HTTP driver): the pool-free
`SQLConnectionEngine` base + `NeonHttpClient` (Neon SQL-over-HTTP transport over
RESTler → native `fetch`) + `NeonHttpEngine`, which reuses the Postgres
translator, text-value decoder, and SQLSTATE map without importing the TCP wire
stack — edge-safe verified. One-shot HTTP, so `transactions` / `advisoryLock` /
`preparedStatements` / `pooledConnections` are declared `false`. Docs:
[`engines/neon/Drivers-Neon.md`](engines/neon/Drivers-Neon.md) and the
[compatibility matrix](docs/Drivers-Compatibility.md).

**DONE — `TursoEngine` shipped** (the second edge/HTTP driver): `TursoHttpClient`
(Turso / libSQL Hrana-v3 SQLite-over-HTTP transport over RESTler → native
`fetch`) + `TursoEngine`, which reuses the SQLite translator, the pure Hrana
value map, and the SQLite error-code map **without importing any native SQLite
binding** (`bun:sqlite` / `@db/sqlite` / `better-sqlite3` / `node:sqlite`) —
edge-safe verified by `deno task check:edge-safety`. One-shot Hrana HTTP, so
`transactions` / `advisoryLock` / `preparedStatements` / `pooledConnections` are
declared `false`; FK DDL is still emitted (`referentialActions: true`) but
runtime enforcement is server-dependent over stateless HTTP. A live integration
test drives the engine end-to-end through a test-only in-process Hrana proxy
backed by `:memory:` SQLite (zero infra in CI; `TURSO_HTTP_ENDPOINT` escape
hatch for a real endpoint). Docs:
[`engines/turso/Drivers-Turso.md`](engines/turso/Drivers-Turso.md) and the
[compatibility matrix](docs/Drivers-Compatibility.md).

**DONE — `D1Engine` shipped** (the third edge/HTTP driver): `D1HttpClient`
(Cloudflare D1 SQLite-over-HTTP REST transport over RESTler → native `fetch`) +
`D1Engine`, which reuses the SQLite translator and the SQLite error-code map
**without importing any native SQLite binding** — edge-safe verified by
`deno task check:edge-safety`. It POSTs `{ sql, params }` (positional `?`) to
`…/accounts/{accountId}/d1/database/{databaseId}/query`; one-shot REST, so
`transactions` / `advisoryLock` / `preparedStatements` / `pooledConnections` are
declared `false`. FK DDL is emitted (`referentialActions: true`) and D1 enforces
foreign keys by default. int64 params are lossy over JSON beyond ±(2^53 − 1) (a
documented limitation; unlike Turso's Hrana string-encoded integers). A live
integration test drives the engine end-to-end through a test-only in-process D1
REST proxy backed by `:memory:` SQLite (zero infra in CI; `D1_HTTP_ENDPOINT`
escape hatch for a real endpoint). Docs:
[`engines/d1/Drivers-D1.md`](engines/d1/Drivers-D1.md) and the
[compatibility matrix](docs/Drivers-Compatibility.md). PlanetScale-HTTP remains
pending.

Design notes:

- **fetch-based → no socket pool** (the platform pools). Extend a
  pool-free `ConnectionEngine` base (see the Mongo-pool cleanup item) or
  stub the pool the way Mongo does.
- Transactions vary by backend: Neon HTTP is one-shot per request (set
  `transactions: false` for that mode; the WebSocket/session variant
  supports them); D1 has `batch()`; libSQL has interactive txns over
  Hrana. Set each capability flag honestly.
- This is the **single highest-leverage adoption move** — it unlocks the
  edge/serverless market Drizzle currently owns, and every one of these
  backends already has a matching translator.

### Build plan + decisions (ratified 2026-07-13 discussion)

**Layering — where the code lives:**

- **Engine subclass → `packages/drivers`** (this package). Each edge
  driver is a thin `SQLEngine` subclass that reimplements ONLY the
  transport (`_execute` + the 3 tx methods + `Capabilities`).
- **OQL is NOT a prerequisite** for Neon / Turso / D1. They are
  wire-compatible with an existing dialect (Neon=Postgres, Turso/D1=
  SQLite, PlanetScale=MySQL/Maria), so they REUSE the existing translator
  verbatim — edge introduces no new dialect, and the translator emits the
  same SQL whether it ships over TCP or HTTP. No OQL-first work.
- **RESTler is the HTTP layer, not the home**: extend
  `@tundralibs/restler` (bearer-token auth built in = exactly how
  Neon/Turso/PlanetScale authenticate). It runs over compat's fetch,
  which delegates to the runtime's native global `fetch` on the plain
  HTTPS path → edge-safe. Do NOT use compat/fetch's `tls`/`unix`
  extensions (Deno/Bun-only). VERIFY when building: RESTler's import
  graph pulls no node-only module, so the edge bundle stays clean.

**Build order (all in Drivers, none in OQL):**

1. **Pool-free base** — the one shared prerequisite. `SQLEngine` assumes a
   socket pool; edge is fetch/stateless. Extend a pool-free
   `ConnectionEngine` base or stub the pool the way `MongoEngine` does.
2. **First driver: `NeonHttpEngine` or `TursoEngine`** — simplest API;
   one-shot mode (`transactions: false`) sidesteps tx complexity for v1.
   Doing one end-to-end validates the pool-free base and de-risks the rest.
3. **Per-backend JSON→value mapping** — HTTP APIs return JSON, so
   numbers/bigints/dates come back as strings; map to the driver value
   contract (reuse the SQLite int64 adapter lesson: number when safe,
   bigint beyond ±(2^53−1)).
4. **Honest capability flags** — `transactions`, `advisoryLock`,
   `referentialActions` per backend.

**Functional support over one-shot HTTP (for norm):**

- **KEEPS** (all stateless SQL): CRUD, joins, projections,
  `.encrypt()`/`.hash()`, hashed filters, DDL migrations, **RETURNING on
  INSERT** (Neon/Turso/D1 — it's in the translated SQL and the HTTP API
  returns the rows), LIMIT/OFFSET paging.
- **LOSES**: interactive multi-statement transactions — the ONLY
  user-visible loss. `norm.transaction()` already rejects cleanly on a
  `transactions:false` engine (same seam Mongo uses).
- **DEGRADES gracefully**: advisory locks off (Migrator falls back to
  file lock); no result streaming (norm pages via LIMIT/OFFSET anyway);
  no LISTEN/NOTIFY / `SET` / temp tables / session-lifetime prepared
  statements (norm uses none).

**Caveats to document:**

- Migrator's SQLite table-REBUILD isn't atomic without a transaction —
  over HTTP each step autocommits (same caveat as MariaDB today).
- **PlanetScale FK-skip** (Vitess rejects FK DDL) is a
  capability-gated EMIT decision in the translator/Migrator (honor
  `referentialActions:false`), NOT core OQL surface — and it only affects
  PlanetScale (medium priority). Neon/Turso/D1 need zero FK handling.

## [gap] Additional engines (lower priority, use-case driven)

- **DuckDB** (embedded, SQLite-shaped) — analytics/embedded; a `duckdb`
  binding fits the embedded-engine mold. Good OLAP companion.
- **ClickHouse** (HTTP or native) — OLAP; OQL SELECT/aggregates map, but
  no real UPDATE/DELETE/txn → needs a read-mostly capability profile.
- **Cassandra/ScyllaDB** (CQL) — different enough (no joins, partition
  keys) to be a separate translator, not an alias.

Defer until a concrete workload asks; the edge/HTTP drivers are the ones
with real pull.

## [gap] Mongo transaction surface

`SQLEngine` exposes a full transaction lifecycle (`beginTransaction`,
`commitTransaction`, `rollbackTransaction`, auto-rollback on failure,
timeout-armed sessions). `MongoEngine` has none of it — its OQL methods
silently drop any `transactionId` argument because there's no plumbing
behind it.

Mongo 4.0+ supports multi-document transactions via sessions
(`client.startSession()` + `session.withTransaction()`). To bring Mongo
to parity:

- Add a session registry on `MongoEngine` keyed by transaction id.
- Have `beginTransaction` start a session, store it, and arm a timeout.
- `commitTransaction` / `rollbackTransaction` should call the
  session's `commitTransaction()` / `abortTransaction()` and end it.
- `_dispatch` needs to thread the session through every Mongo client
  call (every action accepts `{ session }` as the last option).
- The OQL methods need to actually accept and forward `transactionId`
  (today they don't take it at all).

Caveats: replica-set or sharded cluster only — single-node Mongo
without a replica set will reject transactions. The capability flag
should expose this.

## [gap] Postgres / MariaDB prepared-statement caching

SQLite caches prepared statements per connection (commit e788519).
Postgres and MariaDB do not. The wire savings on parse round-trips
are real for tight repeat-query loops, but the implementation is
non-trivial because:

- Statement names are session-scoped (per `PgConnection`), so the cache
  has to live per-connection.
- A schema change on connection B invalidates connection A's cached
  plans — Postgres signals this via `ERROR 0A000: cached plan must
  not change result type`. Either retry-on-error in the dispatcher or
  cross-connection invalidation through a pool-level event.
- Plan staleness from stats updates is also a concern; Postgres mostly
  handles this server-side (`plan_cache_mode`) but cache hits can miss
  a better plan.
- MariaDB's driver doesn't expose a clean handle to cache.

Defer until a benchmark shows parse overhead is material for a real
workload. If implemented, gate behind an opt-in
`enableStatementCache: boolean` so users can A/B compare.

## [gap] Streaming / cursor support for SELECT

`select()` materialises the full row set into memory. Fine for OLTP,
hostile for any analytical query that returns 100k+ rows.

Shape we'd want:

```ts ignore
const stream = engine.selectStream<R>(query);
for await (const row of stream) { ... }
```

Per-engine implementation:

- **Postgres**: declare a `CURSOR` and `FETCH` in chunks, or use the
  protocol-level row callback (`PgConnection` already streams internally).
- **MariaDB**: `mariadb` package has `queryStream()` returning a Node
  stream. Wrap in an async iterator.
- **SQLite**: `better-sqlite3` exposes `iterate()` on prepared statements.
- **MongoDB**: cursors are native — `find().stream()` or `aggregate().stream()`.

Open design questions:

- Backpressure: who pauses when the consumer is slow?
- Transaction semantics: a streaming cursor inside a transaction must
  hold the connection until exhaustion; needs explicit lifetime rules.
- Result type: AsyncIterable? Web Streams ReadableStream? Both?

---

## [bug] ~~SQLEngine: commit / rollback race during await~~ — **FIXED**

Resolved by introducing intermediate states `'COMMITTING'` and
`'ROLLING_BACK'` in `EngineTransactionStatus`, set _before_ the
driver-level await. `execute()` now gates on `tx.state === 'ACTIVE'`
and returns `TRANSACTION_NOT_FOUND` for queries that arrive while a
commit or rollback is in flight.

Original report kept below for historical context.

---

In `SQLEngine.commitTransaction` (and the symmetric rollback path), the
state-machine transition runs **after** the underlying driver call
awaits:

```ts ignore
const tx = this._transactions.get(transactionId);
if (!tx || tx.state !== 'ACTIVE') return;
if (tx.timer) clearTimeout(tx.timer);
try {
  await this._commitTransaction(tx.client, transactionId);
  tx.state = 'COMMITTED';        // ← state transition is AFTER the await
  ...
}
```

During the `await`, the registry still shows `state === 'ACTIVE'`. A
concurrent `execute({ transactionId })` call sees an active transaction
and dispatches a query on the same client mid-commit. Driver-dependent
breakage — Postgres responds "current transaction is aborted" or
similar; MariaDB/SQLite may protocol-error.

**Fix sketch:** introduce intermediate states `'COMMITTING'` and
`'ROLLING_BACK'`. Set the intermediate state _before_ the await; the
state machine becomes `ACTIVE → COMMITTING → COMMITTED`. `execute()`
gates on `tx.state === 'ACTIVE'` (not just truthy), so concurrent
work during the in-flight commit is refused with
`TRANSACTION_NOT_FOUND` or a new `TRANSACTION_IN_PROGRESS`.

Affects: every concrete SQL engine (Postgres, MariaDB, SQLite).
Triggered by application code that fires concurrent queries on the
same `transactionId` while the user is calling commit/rollback — rare
but real (e.g. a queued background task touching the same tx).

## [bug] ~~Memcached: binary-value parser uses string positions~~ — **FIXED**

Resolved by adding a dedicated `_readValue` helper that:

- Reads bytes (not strings) from the socket
- Parses the `VALUE <key> <flags> <bytes> [<cas>]` header line
- Reads exactly `<bytes>` bytes for `<data>`, then asserts `\r\nEND\r\n`
- Surfaces server errors (`ERROR` / `CLIENT_ERROR` / `SERVER_ERROR`)
  and connection-drop mid-reply as `OPERATION_FAILED`

`get` and `gets` now use this helper. Other commands (`set`, `add`,
`flush`, etc.) still use the line-based `_request` — they don't
carry binary payloads.

Original report kept below for historical context.

---

`MemcachedEngine.get()` parses the server's `VALUE` reply via
`response.lastIndexOf('\r\nEND')`:

```ts ignore
const newline = response.indexOf('\r\n');
const end = response.lastIndexOf('\r\nEND');
if (newline < 0 || end < 0) return null;
return response.slice(newline + 2, end);
```

Memcached's text protocol declares an explicit `<bytes>` length on the
`VALUE <key> <flags> <bytes>\r\n<data>\r\nEND` reply. Values that
happen to contain `\r\nEND` get misparsed: `lastIndexOf` finds the
terminator inside the value, not the actual one trailing it.

**Fix:** parse the `<bytes>` count from the header line, read exactly
that many bytes for `<data>`, then assert `\r\nEND\r\n` follows. Same
applies to `gets` (which also takes a CAS token at the end of the
header).

Affects: any caller storing arbitrary binary (e.g. msgpack-encoded
payloads or compressed blobs) that happens to contain the byte
sequence `0d 0a 45 4e 44`. Rare in practice but real.

## [bug] ~~BaseEngine: `positiveInt` accepts zero; `max: 0` deadlocks~~ — **FIXED**

Resolved by renaming the helper to `nonNegativeInt` (honest naming
— it accepts `0`, which is fine for `min`, `idleTimeoutSeconds`,
and `acquireTimeoutSeconds`) and adding an explicit `max >= 1`
check when `pool` is configured.

Original report kept below for historical context.

---

`_validatePoolOptions` uses a helper called `positiveInt`:

```ts
const positiveInt = (n: unknown) =>
  typeof n === 'number' && Number.isInteger(n) && n >= 0;
```

Name lies — it accepts `0`. With `pool: { min: 0, max: 0 }` the
validator passes, then `_acquire` never creates a resource (the
`< this._poolMax` check is never true) and waiters queue forever.

**Fix:** rename to `nonNegativeInt`, and add a separate constraint that
`max >= 1` when `pool` is configured.

---

## [cleanup] ~~Drop the "auto-connect → CLOSED check" idiom~~ — **FIXED**

Dead `if (this._status === 'CLOSED') throw` branch removed from twelve
sites across `RedisEngine` / `MemcachedEngine`. `BaseEngine.connect()`
either flips status to `READY` or throws — the check was unreachable.

## [cleanup] ~~`notice` event leaks `as any` casts~~ — **FIXED**

Lifted `notice` from `SQLEngineEvents` to `EngineEvents`. Six
`(this.emit as any)('notice', …)` casts dropped across Postgres,
Redis, and Memcached.

## [cleanup] ~~`Capabilities` surface forks at SQL vs non-SQL~~ — **FIXED**

`transactions` and `preparedStatements` lifted from
`SQLEngineCapabilities` up to `EngineCapabilities`. Every engine now
declares the same shape so callers can write
`engine.Capabilities.transactions` without first narrowing on the
subclass. `parameterReplacement?` stays on `SQLEngineCapabilities`
since it's SQL-specific.

## [cleanup] ~~Mongo subclass leaks the pool abstraction~~ — **FIXED**

Took **option (2)** (the "Middle" fix): `BaseEngine` was split into a
pool-free `ConnectionEngine` root (lifecycle + identity + events +
capabilities + status + options + query-result helpers + pool-free
resource seams) and a `PooledConnectionEngine` layer that composes the
`ConnectionPool<T>` and delegates its `connect`/`disconnect`/`ping` +
`_acquire`/`_release`/`_destroy`/`_ensureMin`/`_drain` seams to it. The
pooled layer is still exported under the historical name `BaseEngine`
(`export { PooledConnectionEngine as BaseEngine }`) so `extends
BaseEngine` keeps working unchanged.

`MongoEngine` now `extends ConnectionEngine` and its three throwing
stubs (`_createResource` / `_destroyResource` / `_ping`) are **gone** —
the pool-free root promises nothing Mongo can't deliver, and Mongo keeps
its own `connect` / `disconnect` / `ping` overrides driving the
`MongoClient` directly.

Note (**DONE** — the analogous `SQLEngine` split landed without touching
the oracle): a pool-free `SQLConnectionEngine` (extends `ConnectionEngine`)
now holds the full SQL surface — transactions, query execution + stats, OQL
translation, query standardization — reaching only the pool-free-safe
resource seams. The historical `SQLEngine` name is **kept as the pooled
class**: it now `extends SQLConnectionEngine` and re-adds the
`ConnectionPool<T>` by mirroring `PooledConnectionEngine`
(`connect`/`disconnect`/`ping`/`poolStats`/`_acquire`/`_release`/`_destroy`

- `_ensureMin`/`_drain` + the `_draining`/`_idle`/`_waiters`/`_pending`
  accessors + the `_createResource`/`_destroyResource`/`_ping` abstracts). So
  `FakeSQLEngine extends SQLEngine` — the frozen oracle — and every concrete
  driver (`PostgresEngine`/`CockroachEngine`, `MariaEngine`/`PlanetScaleEngine`,
  `SQLiteEngine`) keep pooled behaviour unchanged, with **no edit to
  `SQLEngine.test.ts`**. Future edge/serverless HTTP SQL drivers extend
  `SQLConnectionEngine` directly, implement `_open`/`_close` to establish a
  single `_resource`, and reuse the query/transaction surface with no socket
  pool (see `SQLConnectionEngine.test.ts` for a pool-free proof). The
  ~90-line pool-wiring overlap between `PooledConnectionEngine` and the
  pooled `SQLEngine` is deliberate (no mixin).

## [cleanup] ~~Acquire timeout race in BaseEngine pool~~ — **FIXED**

`Waiter<T>` now carries a `settled` flag; the timeout, `_release`, and
`_drain` paths each check and set it so the second one to fire is a
no-op. No correctness change — idempotency was already protecting us
— but the splice / stray-`reject()` noise is gone.

## [cleanup] ~~SQLEngine: validate `slowQueryThreshold > 0`~~ — **FIXED**

`SQLEngine` gained a `_processOption` override that rejects
`slowQueryThreshold <= 0`, `transactionTimeout < 0` (0 means
"disabled"), and non-boolean `autoRollbackOnFailure` with
`INVALID_CONFIG_VALUE`.

## [cleanup] ~~SQLite: `ATTACH` uses string interpolation~~ — **FIXED**

`SQLiteEngine._createResource` now uses `db.prepare('ATTACH DATABASE
? AS "<alias>"')` with the path bound; the alias still needs identifier
quoting (SQLite doesn't bind identifiers), with any `"` doubled to keep
the quoting closed.

---

## [cleanup] ~~Inconsistent TLS `enforce` semantics~~ — **FIXED (doc only)**

Took option (1): `EngineSSLOptions`'s docstring now carries a
per-engine semantics table (plaintext-retry on Postgres / Redis /
Memcached; ignored on MariaDB; URI-configured on Mongo; n/a on
SQLite), and each engine's class header repeats the engine-specific
note inline. Options (2) MariaDB fallback shim and (3) drop `enforce`
remain deferred — open them as new TODO entries if either becomes
worth the churn.

---

## [cleanup] ~~Memcached `_request` swallows mid-read disconnect~~ — **FIXED**

`__request` now throws `CONNECTION_LOST` when `conn.read()` returns
`null` mid-reply, matching `RedisConnection.readReply`. Callers get a
proper transport error instead of a truncated string.

## [cleanup] Redis: no pipelining

Every command is one round-trip. MULTI/EXEC serializes sends rather
than batching. For tight repeat-command loops or fan-out workloads
the wire overhead dominates.

**Fix sketch:** add `pipeline(commands: Array<...>): Promise<RespValue[]>`
that writes the full encoded batch in one `conn.write()` call, then
reads N replies sequentially. Same RESP frames, no protocol changes —
just batching the I/O.

## [cleanup] Redis / Memcached: no raw-bytes API

Both engines decode bulk strings via `TextDecoder` and return
`string`. Arbitrary binary stored under a key gets UTF-8 mangled.
Most users want strings; some (image data, msgpack, length-prefixed
formats) need bytes.

**Fix sketch:** add `getBytes(key): Uint8Array | null` (Redis) and the
equivalent on Memcached, returning the raw bytes from the bulk frame
without UTF-8 decode. Keep existing `get` for the common case.

## [cleanup] ~~Postgres: text-format parameters only~~ — **FIXED**

`binary.ts` now sends **binary format** (`format: 1`) for the types
where it pays off — bool, int, float, bigint, Date, `bytea`, and jsonb —
via per-parameter format codes in the Bind message; other params fall
back to text. `PostgresEngine._standardizeQuery` builds the ordered
`EncodedParam[]` through `encodeParam`. Result values are still decoded
from text (binary result decoding remains a later add).

## [cleanup] ~~Mongo: per-operation `as any` casts~~ — **FIXED**

`__run` is now generic on the document type, so each public CRUD
method passes its own `T` and receives a `Collection<T>` with typed
signatures. Nine `(col as any).<op>(...)` casts removed across
insertOne / insertMany / findOne / find / updateOne / updateMany /
bulkUpsert / deleteOne / deleteMany / countDocuments / aggregate.
Filter / update args still need a single boundary cast to Mongo's
`Filter<T>` / parametric update shape (narrower than `as any` on the
whole collection). The three admin-method casts (`dropIndex`,
`createCollection`, `rename`) have since been narrowed to minimal
structural casts naming the method used, and the `query`-event cast
resolved — the only bare `as any` left in drivers source are the two
documented `_processOption` generic-variance casts (SQLEngine /
Memcached), a TS limitation rather than sloppiness.

## [cleanup] ~~SQLEngine constructor's `options as any`~~ — **FIXED**

`BaseEngine`'s constructor now accepts `EventOptionKeys<O, E>` keyed
on the class's `E extends EngineEvents` generic, so subclass event
sets (e.g. `SQLEngineEvents`) thread through without the cast.
`SQLEngine`'s `super(...)` call is now plain.

## [gap] Postgres: SCRAM-SHA-256-PLUS (channel binding)

`auth.ts` implements SCRAM-SHA-256 only. The `-PLUS` variant binds the
SASL exchange to the underlying TLS channel via the
`tls-server-end-point` (or `tls-unique`) cb-type — required by some
hardened Postgres deployments. Today we always advertise `n,,` (no
channel binding).

**Fix sketch:** when the server's SASL mechanism list includes
`SCRAM-SHA-256-PLUS` and we're on TLS, extract the server cert
fingerprint (SHA-256 of the DER bytes), prepend `p=tls-server-end-
point,,` + the binding data to the client-first-message, and use
`y,,` instead of `n,,`. Requires the runtime to expose the peer cert
— Deno: `Deno.Conn` doesn't expose this directly; Bun/Node via
`tls.TLSSocket.getPeerCertificate()`.

---

## Audit summary

Most of the items above came from a directed audit. The base
abstractions (BaseEngine pool, SQLEngine transactions) are
well-designed. The SQL engines are consistent with each other.
The non-SQL engines (Mongo, Redis, Memcached) each have minor
audit findings but no blockers.

~~The biggest live correctness items: **the SQLEngine commit race**
(small fix, real bug) and **Memcached binary value parsing**
(small fix, real bug). Worth scheduling.~~

**Update:** all three `[bug]` items above have been fixed. Tests pass
on Deno (706 steps), Bun (569), and Node (569) — same coverage as
before the fixes.

The biggest design item: **Mongo's relationship to `BaseEngine`** —
either accept the inheritance smell, or refactor pool into
composition. Both are valid; pick when there's appetite for the
churn.

## Naming changes

`dogfood.ts` scripts have been renamed to `soak.ts` across all
engines. "Dogfooding" is jargon — "soak testing" is the industry
term for "run a realistic workload for an extended period to
surface leaks, races, and resource exhaustion." Environment
variables also renamed: `DOGFOOD_DURATION_S` → `SOAK_DURATION_S`,
`DOGFOOD_WORKERS` → `SOAK_WORKERS`.
