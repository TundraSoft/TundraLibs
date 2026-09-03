# Read caching

An opt-in read-through cache over
[`@tundralibs/cacher`](../../cacher/README.md). It is **off by default**:
a `Norm` caches nothing unless you pass a `cache` config, and even then
only entities that declare a per-entity `cache` TTL participate. When it
is on, non-transactional `find` / `findOne` / `count` / `getByPK` reads
are served from the cache, keyed by the query, and any write to a table
prunes that table's cache.

## Table of Contents

- [Enabling caching](#enabling-caching)
- [What gets cached](#what-gets-cached)
- [Invalidation](#invalidation)
- [Bypassing the cache per call](#bypassing-the-cache-per-call)
- [Manual clearing](#manual-clearing)
- [Views and queries](#views-and-queries)
- [Temporal and audit tables](#temporal-and-audit-tables)
- [Encryption](#encryption)
- [Cache engines](#cache-engines)
- [Backend failures](#backend-failures)
- [Events](#events)
- [Rules and limits](#rules-and-limits)
- [Related documentation](#related-documentation)

## Enabling caching

Two things must both be present: a `cache` config on the `Norm`, and a
`cache` TTL (in **minutes**) on each entity you want cached.

```typescript
import { Column, Entity, Norm, Schema } from '@tundralibs/norm';

const App = Schema('App', {
  Users: Entity('users', {
    id: Column.integer(),
    name: Column.varchar(40),
  }, {
    pk: ['id'],
    cache: 5, // cache reads for 5 minutes (windowed — see below)
  }),
});

const norm = new Norm({
  name: 'app',
  database: { dialect: 'sqlite', path: './data' },
  cache: { engine: 'MEMORY' },
});
const db = norm.use(App);
```

The TTL is **windowed**: each cache hit resets the clock, so a hot query
stays cached as long as it keeps being read. `cache: 0` (or omitting it)
turns caching off for that entity.

The `Norm`'s `name` roots the cache namespace and is the isolation
boundary: two `Norm`s pointed at the same cache engine must use different
names, or they would share (and cross-prune) each other's entries. It
defaults to `norm-<n>`, a per-process counter — fine for `MEMORY`, whose
store is private to the process, but a `REDIS` / `MEMCACHED` engine
requires an explicit `name` (the constructor throws `INVALID_CACHE_CONFIG`
otherwise), since every process would call itself `norm-1`.

## What gets cached

Cached: `find`, `findOne`, `count`, and `getByPK` — outside a
transaction, when the entity declares a `cache` TTL.

Not cached:

- **Reads that join another table.** A joined result depends on more than
  one table, which would break per-table invalidation. These emit a
  `cache-skip` `warning` so the miss is diagnosable — model a cached
  multi-table read as a [VIEW](#views-and-queries) instead. A single-table
  aggregate (`GROUP BY` on one table) _is_ cached normally.
- **Reads inside a transaction.** A transaction sees uncommitted data;
  serving it from — or writing it into — the shared cache would leak that
  view to other connections. In-transaction reads always hit the database.
- **`raw()` and `query()`.** The escape hatches bypass the typed pipeline
  entirely, caching included.

## Invalidation

Any write to a table (`insert` / `update` / `delete` / `upsert` /
`truncate`) prunes that table's cache — the whole namespace, since the
cache is keyed by query, not by row.

```typescript ignore
await db.repo('Users').find(); // miss → database, then cached
await db.repo('Users').find(); // hit
await db.repo('Users').insert({ id: 2, name: 'Bo' }); // prunes the cache
await db.repo('Users').find(); // miss again → database
```

Inside a transaction the prune is **deferred to commit** — a rollback
prunes nothing (nothing changed), and the pruned entries never carry a
transaction's uncommitted view.

Prune-on-write is not atomic with the database write, so a concurrent
reader can repopulate an entry in the window between the write landing and
the prune firing — bounded, one-read-window staleness. External writes and
`raw()` do not invalidate at all.

## Bypassing the cache per call

Pass `noCache: true` to skip the cache for a single read — it neither
reads a cached value nor populates one (the query still runs against the
database):

```typescript ignore
await db.repo('Users').find(undefined, { noCache: true });
await db.repo('Users').getByPK({ id: 1 }, { noCache: true });
await db.repo('Users').count(undefined, { noCache: true });
```

## Manual clearing

```typescript ignore
await db.repo('Users').clearCache(); // drop one entity (and dependent views)
await db.clearCache(); // drop every entity's cache for this connection
```

`repo.clearCache()` mirrors what a write to that model does: it drops the
model's own cache plus any VIEW / QUERY that reads from it. `db.clearCache()`
(no argument) drops everything. Both are no-ops when no `cache` was
configured.

> A schema [migration](NORM-Migrations.md) never calls either of these —
> `Migrator.apply()`/`rollback()` run DDL only and don't touch the read
> cache. If the `Norm` instance you migrate against also has `cache`
> configured, call `db.clearCache()` afterward so rows cached under the
> old shape don't linger on an external engine (Redis/Memcached) that
> outlives the process.

## Views and queries

VIEW and QUERY entities are cacheable too. Because they derive from base
tables, norm resolves each one's stored query source tables — recursively,
through composed views — at compose time, and prunes the view's cache
whenever any of those tables is written.

```typescript ignore
const App = Schema('App', {
  Orders: Entity('orders', {/* ... */}, { pk: ['id'] }),
  RecentOrders: Entity('recent_orders', {/* ... */}, {
    type: 'VIEW',
    cache: 2,
    query: { type: 'SELECT', table: 'orders' /* ... */ },
  }),
});
// A write to Orders prunes the RecentOrders cache automatically.
```

This is the sanctioned way to cache a multi-table read: model it as a
VIEW and you get precise, dependency-driven invalidation for free.

## Temporal and audit tables

`cache` combines with [`temporal`](NORM-Temporal.md) on the same TABLE:
`insert` — the only write verb a temporal table allows — invalidates the
cache exactly like any other write. The one caveat is `@AsOf`: a filter
like `find({ '@AsOf': new Date() })` bakes that exact millisecond into
the cache key, so consecutive calls almost never hit — filter on
`'@EffectiveTo': sentinel` instead for a cacheable "current" read (see
[Temporal → Common issues](NORM-Temporal.md#common-issues)).

`cache` also combines with [`audit`](NORM-Audit.md) on the SOURCE table
— the mirror write into the replica doesn't change how the source's own
cache is invalidated. The generated **replica itself can never be
cached**, though: `audit` has no `cache` option, so `db.repo('<name>')`
always reads the database. Don't route around this with a VIEW
over the replica's physical table — a mirrored write invalidates the
SOURCE's cache namespace only, never the replica's, so that VIEW's
cache would never get pruned and would silently serve stale rows past
its TTL (see [Audit → Common issues](NORM-Audit.md#common-issues)).

## Encryption

Caching stores the **decrypted** rows a read returns. On an external cache
(Redis / Memcached) that would put the plaintext of `.encrypt()` columns
at rest — defeating the point of encrypting them. So an entity with
encrypted columns may only be cached on the in-process `MEMORY` engine;
combining encrypted columns, `cache > 0`, and a non-MEMORY engine throws a
`NormError` (`INVALID_CACHE_CONFIG`) at `use()` time.

## Cache engines

Any engine registered on the `@tundralibs/cacher` singleton works — norm
goes through cacher's unified API and never special-cases an engine:

```typescript ignore
// In-process, no dependencies (the only engine that may cache encrypted
// entities):
cache: { engine: 'MEMORY' }

// Redis / Memcached — options are forwarded verbatim to cacher:
cache: {
  engine: 'REDIS',
  options: { host: '10.0.0.1', port: 6379, username: '', password: '…', db: 0 },
}
```

Each entity gets its own cache namespace (`<name>__Entity`, rooted at
the `Norm`'s `name`), and every
engine's namespace clear is correctly scoped — Redis deletes `name:*`,
Memcached bumps a per-namespace version counter (never a server-wide
`flush_all`), Memory clears its own map. So pruning one table never
disturbs another table's cache or another app sharing the same server.

## Backend failures

A cache backend is treated as best-effort: if the cache engine is
unreachable mid-request, the query degrades to the database rather than
failing. A failed read is a miss (the row is fetched from the source), a
failed write or prune is skipped, and each surfaces a `cache-error`
`warning`. A Redis blip slows requests down; it never takes them down.

## Events

Wire these on the [event bus](../README.md#events):

- **`cacheHit(entity, op, id)`** — a read was served from the cache; no
  `call` event fires for it (nothing executed). `id` matches the returned
  `NormResult` envelope.
- **`warning(entity, op, 'cache-skip', message)`** — a joined read could
  not be cached.
- **`warning(entity, op, 'cache-error', message)`** — a cache backend
  failed and the query fell back to the database.

## Rules and limits

- Both the `Norm` `cache` config **and** a per-entity `cache` TTL are
  required — either alone caches nothing.
- A non-`MEMORY` cache engine requires an explicit `Norm` `name`, and a
  `name` used for caching must not contain `:` (cacher's reserved
  separator) or `__` (norm's entity separator).
- Per-entity `cache` is a non-negative integer number of minutes, capped
  at 30 days (the cacher expiry ceiling); an invalid value throws
  `INVALID_CACHE_CONFIG` at `use()` time.
- The cache key is derived from the compiled query, so two logically-equal
  filters written with a different key order are a benign cache miss, not a
  correctness problem.

## Related documentation

- [Temporal tables](NORM-Temporal.md) — `cache` combined with
  `temporal`, and the `@AsOf` cache-key caveat.
- [Audit tables](NORM-Audit.md) — `cache` on an audited source table;
  why the generated replica can never be cached.
- [Migrations](NORM-Migrations.md) — the `Migrator` never touches the
  read cache; call `db.clearCache()` after a schema change.
- [Schema definition](NORM-Schema.md) — columns, entities, and the
  `cache` option in context.

---

[← Back to NORM](../README.md)
