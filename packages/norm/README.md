# NORM

A typed, cross-runtime ORM built on [OQL](../oql/README.md) and
[@tundralibs/drivers](../drivers/README.md). One schema declaration
drives your types, validation, migrations, and at-rest column
encryption, across PostgreSQL, MariaDB/MySQL, SQLite, and MongoDB, and,
on edge runtimes, Neon, Turso, and Cloudflare D1 over HTTP.

[![JSR](https://jsr.io/badges/@tundralibs/norm)](https://jsr.io/@tundralibs/norm)
[![JSR Score](https://jsr.io/badges/@tundralibs/norm/score)](https://jsr.io/@tundralibs/norm)
![Deno](https://img.shields.io/badge/Deno-000000?logo=deno)
![Bun](https://img.shields.io/badge/Bun-f9f1e1?logo=bun)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white)

## Standout features

What sets norm apart from a typical TypeScript ORM. Each item links to
its guide.

- **At-rest encryption.** `.encrypt()` any column, then filter and
  enforce uniqueness on the ciphertext through a digest sibling. See
  [Security](docs/NORM-Security.md).
- **Audit trail.** A generated, read-only replica mirrors every insert,
  update, and delete, with no change to the source table. See
  [Audit tables](docs/NORM-Audit.md).
- **Temporal tables.** Every version of a row stays in place, with
  point-in-time (`@AsOf`) reads and scheduled changes. See
  [Temporal tables](docs/NORM-Temporal.md).
- **Multi-tenant scoping.** One call wraps every read and write of a
  handle in an always-on equality filter, enforced on cross-tenant
  writes as well. See [Scoping](docs/NORM-Scoping.md).
- **Read-query caching.** Opt-in per-entity TTLs with per-table
  invalidation on write, over any `@tundralibs/cacher` backend. See
  [Read caching](docs/NORM-Caching.md).
- **Zero-codegen types.** `RowOf`, `InsertOf`, `UpdateOf`, and typed
  filters and projections are read straight off the entity declaration.
  There are no generated files and no build step. See
  [Schema definition](docs/NORM-Schema.md).
- **Cross-runtime.** Deno, Bun, Node.js, and Cloudflare Workers from one
  codebase, with the fetch-only dialects running in the browser as well.
  See [Browser / Worker compatibility](#browser--worker-compatibility).

The [subscription-billing example](examples/subscription-billing/) shows
several of these working together in one runnable app.

## Overview

You define entities with a builder API. From that single declaration
norm derives:

- **Types.** `RowOf`, `InsertOf`, `UpdateOf`, and typed projections and
  filters, with no codegen step.
- **Validation.** A generated [Guardian](../guardian/README.md) runs
  before any SQL, so bad input is a typed error rather than a database
  error.
- **Migrations.** Snapshot-based, with a table-rebuild engine, drift
  detection, reviewable per-dialect SQL plans, and a multi-machine
  advisory lock.
- **At-rest security.** `.encrypt()` any column without changing its
  TypeScript type, filter encrypted columns through digest siblings, and
  mask sensitive values on read.

The same typed code runs against seven engines: four self-hosted
(`postgres`, `maria`, `sqlite`, `mongo`) and three fetch-only engines for
edge and serverless runtimes (`neon`, `turso`, `d1`). The live test suite
exercises the four self-hosted dialects end to end.

## Browser / Worker compatibility

The root barrel, `@tundralibs/norm`, registers six of the seven dialects
as a side effect of one import. The exception is `sqlite`, which needs a
native binding on every runtime (`bun:sqlite`, a Deno-only `@db/sqlite`
import-map alias, `node:sqlite`). None of those resolve in a bundled
target, so the barrel leaves it out and you register it yourself with
`import '@tundralibs/norm/engines/sqlite'` on Deno, Bun, or Node. With
the other six present, the barrel bundles cleanly for a Worker or
browser build. That was confirmed with a real esbuild and wrangler
build, not only a module-graph check.

Bundling is not the same as running:

- `neon`, `turso`, and `d1` are fetch-only. They need no sockets and
  work in a Worker and in a browser.
- `postgres` is a hand-rolled wire protocol over
  `@tundralibs/compat/net`, which has a Workers backend
  (`cloudflare:sockets`) and has been confirmed connecting there. A
  browser has no raw-socket API, so it cannot run there.
- `maria` wraps the third-party `mariadb` driver directly, bypassing
  `compat`, and has been confirmed connecting over TCP on Workers. The
  driver needs Node globals such as `process`, so it does not run in a
  browser.
- `mongo` has not been verified on Workers. Treat it as server-only
  until someone checks.

To be explicit about what ships to an edge or browser build, use
`@tundralibs/norm/core` plus the engine modules you need. The root
barrel forces no unbundlable dependency on you other than `sqlite`.

## Modules

| Module                          | Import                               | Description                                                                                                      |
| ------------------------------- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| Root                            | `@tundralibs/norm`                   | `Norm`, `NormDb`, repos, `Column`, `Entity`, `Schema`, `use`, plus six of the seven dialects (all but `sqlite`). |
| [Core](core.ts)                 | `@tundralibs/norm/core`              | The same surface with no dialect registered. The explicit edge/serverless entry point.                           |
| [Definition](definition/mod.ts) | `@tundralibs/norm/definition`        | Builders, entity/schema types, doc + snapshot emitters.                                                          |
| [Migrations](migrations/mod.ts) | `@tundralibs/norm/migrations`        | The `Migrator`: snapshot / plan / apply / rollback.                                                              |
| [Asserts](asserts/mod.ts)       | `@tundralibs/norm/asserts`           | Validate hand-built definitions with the same rules `Entity()` uses.                                             |
| [Engines](engines/mod.ts)       | `@tundralibs/norm/engines`           | `registerEngine` / `resolveEngineFactory`, the dialect registry.                                                 |
| Engine (one per dialect)        | `@tundralibs/norm/engines/<dialect>` | Side-effect module registering one dialect: `postgres`, `maria`, `sqlite`, `mongo`, `neon`, `turso`, `d1`.       |

## Installation

**Deno:**

```bash
deno add @tundralibs/norm
```

**Bun:**

```bash
bunx jsr add @tundralibs/norm
```

**Node.js:**

```bash
npx jsr add @tundralibs/norm
```

## Choosing an entry point

**`@tundralibs/norm`** serves Deno, Bun, and Node, and Workers and
browser builds too. The root barrel registers six of the seven dialects,
so any `database` config other than `sqlite` constructs with no extra
import. `sqlite` is held back because it needs a native binding on every
runtime (`jsr:@db/sqlite` on Deno, `bun:sqlite`, `node:sqlite`) that no
edge bundler can resolve. Keeping it out of the eager imports keeps the
barrel bundlable for everyone else.

```typescript
import { Norm } from '@tundralibs/norm';

declare const host: string, database: string, username: string;

const norm = new Norm({
  database: { dialect: 'postgres', host, database, username },
  secret: process.env.SECRET,
});
```

`sqlite` needs its own import before use, on any runtime:

```typescript
import '@tundralibs/norm/engines/sqlite';
import { Norm } from '@tundralibs/norm';

const norm = new Norm({ database: { dialect: 'sqlite', path: './data' } });
```

**`@tundralibs/norm/core`** is the edge and serverless entry point. It
has identical exports with nothing registered: you import the one engine
you need and no other driver enters the bundle. Verified on workerd:
`core` with `engines/d1` (fetch-only, no pooling); `core` with
`engines/postgres` (a real TCP connection through `compat/net`'s
`cloudflare:sockets` backend, with pooling and transactions working);
and `core` with `engines/maria` (the third-party `mariadb` driver,
independent of `compat`).

```typescript
import '@tundralibs/norm/engines/d1'; // or /neon, /turso, /postgres, /maria
import { Norm } from '@tundralibs/norm/core';

declare const env: Record<string, string>; // the Worker's bindings

const norm = new Norm({
  database: {
    dialect: 'd1',
    accountId: env.CF_ACCOUNT_ID,
    databaseId: env.D1_DATABASE_ID,
    apiToken: env.CF_API_TOKEN,
  },
});
```

`neon`, `turso`, and `d1` are one-shot fetch calls with no pooling and no
transactions, as `executor.capabilities` reports. `postgres` and `maria`
are real connections and carry no such limit. `mongo` is unverified on
Workers, and `sqlite` cannot run there at all. A dialect whose module was
never imported throws `ENGINE_NOT_REGISTERED` at construction and names
the import to add. The registry behind this is documented in
[`engines/registry.ts`](engines/registry.ts).

## Quick Start

```typescript
// sqlite needs its own explicit import before use, on any runtime —
// the other six dialects don't (see "Choosing an entry point" below).
import '@tundralibs/norm/engines/sqlite';
import { Column, Entity, Norm, Schema } from '@tundralibs/norm';

// 1. Define entities with the Column builders.
const Users = Entity('users', {
  id: Column.uuid().default({ $$_expression: 'UUID' }),
  email: Column.varchar(255).beforeWrite((v) => v.toLowerCase())
    .encrypt().hash(), // ciphertext at rest, still filterable by plaintext
  displayName: Column.varchar(120).minLength(2),
  role: Column.varchar(12).lov(['admin', 'editor', 'viewer']).default('viewer'),
}, {
  pk: ['id'],
  unique: { email: ['email_hash'] }, // unique on the digest sibling
});

// 2. Group entities into a named schema.
const Identity = Schema('Identity', { Users });

// 3. Open a connection and compose the schema(s) — norm constructs and
//    owns the engine from a dialect config; you never see the instance.
const norm = new Norm({
  database: { dialect: 'sqlite', path: './data' },
  secret: process.env.SECRET,
});
const db = norm.use(Identity);

// 4. CRUD — typed, validated, encrypted.
const created = await db.repo('Users').insert({
  email: 'Ada@Example.dev',
  displayName: 'Ada',
});
created.data[0].email; // 'ada@example.dev' (decrypted, lowercased)

// Filter by the plaintext of an encrypted column — rewritten to the
// digest sibling under the hood:
const found = await db.repo('Users').findOne({ '@email': 'ada@example.dev' });
found.data?.role; // 'viewer'
```

Every operation returns a `NormResult` envelope: `{ id, op, count, time,
isSlow, data?, total?, scoped? }`. The `id` is a ULID that also appears
on the `call` event, so logs correlate one to one.

## Defining a schema

`Column.*` builders are immutable and chainable. Invalid combinations do
not type-check: `hash()` exists only after `encrypt()`, and validators
disappear after `encrypt()`.

```typescript
import { Column } from '@tundralibs/norm';

Column.varchar(255) // VARCHAR(255)
  .nullable() // NULL allowed
  .minLength(3).maxLength(50)
  .pattern(/^[a-z]+$/)
  .beforeWrite((v) => v.trim())
  .afterRead((v) => v.toUpperCase())
  .lov(['a', 'b', 'c']) // narrows the TS type to the union
  .default('a')
  .comment('A column');

Column.integer();
Column.bigint();
Column.decimal(10, 2);
Column.float();
Column.double();
Column.real();
Column.boolean();
Column.json<{ tags: string[] }>();
Column.date();
Column.time();
Column.datetime();
Column.timestamp();
Column.uuid();
Column.text();
Column.blob();
Column.hash('SHA-256'); // one-way digest column (passwords)
Column.mask('card', (v) => '****' + v.slice(-4)); // virtual, computed on read
```

`Entity(name, columns, options)` produces a `TABLE` (which needs a `pk`),
a `VIEW`, or a terminal `QUERY`. Relationships are declared with foreign
keys that reference the target's registry key, never a table name:

```typescript
import { Column, Entity } from '@tundralibs/norm';

const Profiles = Entity('profiles', {
  userId: Column.uuid(),
  bio: Column.text().nullable(),
}, {
  pk: ['userId'],
  fk: {
    User: {
      model: 'Users', // the registry key
      on: { userId: 'id' },
      reverseAs: 'Profile', // Users can project '@Profile'
      onDelete: 'CASCADE',
    },
  },
});
```

`Schema(name, entities)` groups entities. `use(...schemas)` composes any
number of schemas into one typed database handle and resolves foreign
keys across schema boundaries.

See [Schema definition](docs/NORM-Schema.md) for the full builder
reference, relations, hooks, and validators.

## Querying

```typescript ignore
// find(filter?, options?) — filter FIRST
await db.repo('Users').find({ '@role': 'admin' }, {
  orderBy: { '@displayName': 'ASC' },
  limit: 20,
  project: { '@id': true, '@displayName': true, '@Profile': { '@bio': true } },
  total: true, // also run a COUNT with the same filter → result.total
});

await db.repo('Users').findOne({ '@id': someId });
await db.repo('Users').getByPK({ id: someId });
await db.repo('Users').count({ '@role': 'admin' });

// Grouped aggregates on the typed surface:
await db.repo('Visits').find(undefined, {
  project: { '@country': true },
  aggregates: { total: { fn: 'COUNT', column: '@id' } },
});
```

Filters are the OQL filter language typed to your columns: `$eq`, `$ne`,
`$in`, `$like`, `$between`, `$null`, `$or` and `$and`, and nested
relation refs such as `'@Profile.@bio'`. Filtering through a to-many
relation that is not projected is lifted into a correlated `EXISTS`
subquery, so it never fans out.

See [Querying](docs/NORM-Querying.md) for filters, typed projections,
relations, aggregates, and pagination.

## At-rest encryption

`.encrypt()` works on any column kind. The value keeps its declared
TypeScript type and only the storage is ciphertext:

```typescript ignore
birthday: Column.timestamp().encrypt().nullable(), // Date in TS, TEXT at rest
```

Add `.hash()` to an encrypted column and norm synthesizes a `<col>_hash`
digest sibling. Equality filters, `$in`, uniqueness, and upsert conflict
keys then work against the ciphertext by rewriting to the digest:

```typescript ignore
email: Column.varchar(255).encrypt().hash(),
// unique on the sibling:
unique: { email: ['email_hash'] },
// filter by plaintext — rewritten to email_hash = sha256('ada@...'):
await db.repo('Users').findOne({ '@email': 'ada@example.dev' });
```

`Column.hash('SHA-256')` is a standalone one-way digest column, for a
password digest that must never be readable. `Column.mask(source, fn)` is
a virtual column computed after decryption. It is never stored and never
sent to SQL.

See [Security](docs/NORM-Security.md) for encryption, digest columns,
masks, and the crypto override hooks.

## Migrations

The `Migrator` derives migrations from your definitions, with no
hand-written SQL:

```typescript ignore
import { Migrator } from '@tundralibs/norm/migrations';

const mig = new Migrator(db, { dir: './migrations' });
await mig.snapshot(); // writes 0001.json (.sql opt-in: renderSql / renderPlans())
await mig.plan(); // inspect the DDL before applying
await mig.apply(); // execute + record in _norm_migrations
await mig.rollback({ to: 0 });
```

Migrations are state-based. Each version is a full physical snapshot,
the diff between consecutive snapshots is the migration, and "down" is
the reverse diff. A type, primary-key, or crypto change that no in-place
`ALTER` can express becomes a table rebuild (rename aside, recreate,
copy, verify, drop), including per-row decrypt and re-encrypt when a
crypto marker flips. Drops are gated behind `allowDrop` and surfaced as
`blockedDrops`. `apply()` refuses a plan whose hash does not match the
reviewed `.sql` artifact, and takes a server-side advisory lock so two
CI runners cannot migrate at once.

See [Migrations](docs/NORM-Migrations.md) for the full workflow, rename
hints, the rebuild engine, and stored plans.

## Scoping (multi-tenant / default filters)

`db.scope({...})` returns a handle whose every read and write carries an
always-on equality filter:

```typescript ignore
const orgDb = db.scope({ '@orgId': currentOrgId });

await orgDb.repo('Tickets').find();          // WHERE orgId = currentOrgId
await orgDb.repo('Tickets').insert({ ... }); // orgId auto-filled (may be omitted)
await orgDb.repo('Tickets').update(data, f); // rejects moving a row out of scope
await orgDb.repo('Tickets').upsert(d, opts); // can't touch another scope's row
await orgDb.repo('Tickets').truncate();      // refused — use delete({}) to clear scope
```

`insert` fills the scope column when the payload omits it, `update`
refuses to move a row out of scope, and `upsert` refuses to touch
another scope's row on every dialect. `truncate` refuses on a scoped
handle because it carries no `WHERE`; use `delete({})` to clear one
scope. An entity without the scope column is queried unscoped, so one
handle can span a mixed registry. The applied scope rides
`result.scoped`. Scopes are equality-only. See
[Scoping](docs/NORM-Scoping.md).

## Transactions & escape hatches

```typescript ignore
await db.transaction(async (tx) => {
  await tx.repo('Users').insert({ ... });
  await tx.repo('Audit').insert({ ... });
}); // commits on resolve, rolls back on throw

// Nesting opens a SAVEPOINT on the same tx — inner rolls back to the
// savepoint on throw, the outer transaction survives (SQL engines):
await db.transaction(async (tx) => {
  try {
    await tx.transaction((sp) => sp.repo('Users').insert(maybeBad));
  } catch { /* only the inner block rolled back */ }
});

// Typed IR escape hatch — bind to an entity to ride decrypt/afterRead:
await db.query({ type: 'SELECT', table: 'users', /* ... */ }, { entity: 'Users' });

// Raw SQL escape hatch — named params, injection-safe, rows come back RAW:
await db.raw('SELECT count(*) AS n FROM users WHERE role = :role:', {
  role: 'admin',
});
```

`raw()` and `query()` bypass the typed pipeline: no decrypt, no scope, no
validation. `raw()` also emits a `warning` event on every call, so an
audit can see the escape hatch in use; `query()` does not.

## Read caching

Off by default. Pass a `cache` config to `new Norm({...})` and give each
entity a `cache` TTL in minutes. Non-transactional `find`, `findOne`,
`count`, and `getByPK` reads are then served from `@tundralibs/cacher`,
keyed by the query. The TTL is windowed: each hit resets the clock.

```typescript ignore
const norm = new Norm({
  name: 'app', // namespaces the cache (required on REDIS / MEMCACHED)
  database: { dialect: 'sqlite', path: ':memory:' },
  cache: { engine: 'MEMORY' }, // or REDIS/MEMCACHED + options
});

// Per-entity opt-in (minutes; 0/omitted = off):
Entity('users', {/* columns */}, { pk: ['id'], cache: 5 });

await users.find(); // miss → DB, then cached
await users.find(); // hit  → emits `cacheHit`
await users.find(undefined, { noCache: true }); // bypass for this call
await users.insert({/* ... */}); // any write prunes the table's cache
await db.repo('Users').clearCache(); // drop one entity (and dependent views)
await db.clearCache(); // drop every entity's cache
```

- **Per-table invalidation.** Each entity gets its own cache namespace,
  `<name>__Entity`, so a write to one table prunes only that table, and
  two `Norm`s sharing a cache engine stay isolated as long as their
  `name`s differ. Inside a transaction, reads bypass the cache and the
  prune is deferred to commit. A rollback prunes nothing.
- **Joined reads are never cached.** A joined entry would depend on more
  than one table, which per-table pruning cannot invalidate, so such
  reads emit a `cache-skip` warning. Model them as a VIEW to cache them.
  A single-table aggregate is cached normally, and a VIEW or QUERY is
  cacheable: norm resolves its stored query's source tables and prunes
  it when any of them is written.
- **Encryption guard.** Decrypted rows on an external store would leak
  the plaintext of `encrypt()` columns, so an entity with encrypted
  columns may only be cached on the in-process `MEMORY` engine. Any
  other engine makes `use()` throw at compose time.
- **Backend failures degrade to the database.** When Redis or Memcached
  is unreachable, a failed `get` is a miss and a failed `set` or prune is
  skipped. Each surfaces a `cache-error` warning. The query itself never
  fails.
- **Any cacher engine.** `MEMORY`, `REDIS`, and `MEMCACHED` all work
  through cacher's unified API, and each engine's `clear()` is scoped to
  the namespace. Memcached bumps a version counter rather than flushing
  the server.
- **Caveats.** Prune-on-write is not atomic with the database write, so
  staleness is bounded to one read window. `raw()` and external writes do
  not invalidate.

## Events

Wire the metadata-only event surface to your logger. It never carries
row data, plaintext, or secrets:

```typescript
import '@tundralibs/norm/engines/sqlite';
import { Norm } from '@tundralibs/norm';

const secret = process.env.SECRET;
const log = console;

const norm = new Norm({
  database: { dialect: 'sqlite', path: './data' },
  secret,
  _oncall: (entity, op, ms, isSlow, id) => log.info({ entity, op, ms, id }),
  _onwarning: (entity, op, code, msg) => log.warn({ entity, op, code, msg }),
  _ontransactionCommit: (txId) => log.debug({ txId, event: 'commit' }),
  // Engine events forwarded from the driver (query/slowQuery are
  // metadata-only — no SQL text, no params):
  _onconnect: (engineId) => log.info({ engineId, event: 'connect' }),
  _onslowQuery: (engineId, queryId, ms) => log.warn({ queryId, ms }),
});
```

The surface:

- `call` for every executed operation, and `cacheHit` for a read served
  from the cache (no `call` fires for it).
- `warning`, with codes such as `cache-skip` (a joined read could not be
  cached) and `cache-error` (a cache backend failed and the query fell
  back to the database).
- `decryptError`, when an encrypted cell fails to decrypt on read. It is
  a data-integrity or key-rotation signal and carries metadata only.
- `transactionBegin`, `transactionCommit`, and `transactionRollback`.
- The engine's own events, proxied from the driver: `connect`,
  `disconnect`, `connectionFailed`, `error`, `transactionTimeout`,
  `query`, and `slowQuery`.

Subscribe inline with `_on<event>` keys, or later with
`norm.on(event, fn)`.

## Tracing (`witness`)

Events give flat observability: a `call` record per operation and a
`query` record per statement. For nested spans, where an operation is
the parent of the queries it caused, configure a `witness`. Every repo
operation and `raw()` runs through it, so a tracer's active span is open
while the driver events fire, and their spans parent to it through
[ambient](../ambient/README.md).

```typescript ignore
const norm = new Norm({
  database: { dialect: 'postgres', host, database, username },
  secret,
  witness: tracer.wrap,
});
```

`tracer.wrap` (tracer 0.4 or later) is the ready-made adapter: it opens
an `INTERNAL` span named `info.name` (`'norm.Users.find'`, `'norm.raw'`,
and so on), seeds the attributes, and honours the witness contract.
Hand-roll with `startActiveSpan` only when you want a different
`SpanKind` or extra attributes.

```text
GET /orders                      ← request span (middleware)
└─ norm.Orders.find              ← the witness
   ├─ db.query                   ← driver event, parents automatically
   └─ db.query   (relation load)
```

The `witness` is a generic wrap hook, not a tracer dependency. norm
never imports tracer; you wire the two at the composition root, the
same way slogger takes a `contextProvider`. A witness must observe
without interfering: call `fn` exactly once, return its result
unchanged, and rethrow its errors. The gap between the operation span
and its query spans is norm's own overhead per operation (validation,
hooks, and per-cell crypto on encrypted columns).

## Supported databases

| Feature                       | PostgreSQL | MariaDB/MySQL | SQLite | MongoDB |
| ----------------------------- | ---------- | ------------- | ------ | ------- |
| CRUD, filters, projections    | ✅         | ✅            | ✅     | ✅      |
| Relations (join / `$lookup`)  | ✅         | ✅            | ✅     | ✅      |
| At-rest encryption + digests  | ✅         | ✅            | ✅     | ✅      |
| Aggregates (GROUP BY)         | ✅         | ✅            | ✅     | ✅      |
| Migrations                    | ✅         | ✅            | ✅     | ⚠️¹     |
| Transactions                  | ✅         | ✅            | ✅     | ❌²     |
| `$exists` to-many filter lift | ✅         | ✅            | ✅     | ❌³     |
| Raw SQL (`db.raw`)            | ✅         | ✅            | ✅     | ❌⁴     |

¹ MongoDB is schemaless, so the Migrator does not own its schema; create
indexes directly. ² MongoDB transactions require a replica set and are
not exposed. ³ Correlated subqueries have no MongoDB find-filter form.
⁴ MongoDB has no SQL surface; use `db.query()` with OQL IR.

`neon` (PostgreSQL over HTTP), `turso`, and `d1` (SQLite over HTTP) speak
their base dialect's SQL and inherit its column above, except for what a
one-shot fetch cannot do. `executor.capabilities` reports both gaps: no
transactions, so `db.transaction()` throws `NormUnsupportedError` and
temporal and audit writes are best-effort, and no advisory lock, so the
Migrator applies unlocked and without transactional DDL. See
[Browser / Worker compatibility](#browser--worker-compatibility) for
where each dialect runs.

## Guides

- [How-To Guide](docs/NORM-Guide.md): build a real app end to end.
- [Schema definition](docs/NORM-Schema.md): columns, entities,
  relations, hooks, validators.
- [Querying](docs/NORM-Querying.md): filters, projections, relations,
  aggregates, pagination.
- [Read caching](docs/NORM-Caching.md): per-entity TTLs, per-table
  invalidation, engines, and backend-failure behavior.
- [Temporal tables](docs/NORM-Temporal.md): effective-dated version
  history, `@AsOf` point-in-time reads, scheduling.
- [Audit tables](docs/NORM-Audit.md): a generated, versioned replica
  that mirrors every write, with no change to the source table.
- [Security](docs/NORM-Security.md): encryption, digests, masks.
- [Migrations](docs/NORM-Migrations.md): the `Migrator` workflow.
- [Scoping](docs/NORM-Scoping.md): tenant scoping and default filters.
- [Errors](docs/NORM-Errors.md): the error classes and every stable
  `NormErrorCode`.

## License

MIT
