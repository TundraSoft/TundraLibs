# NORM

A typed, cross-runtime ORM built on [OQL](../oql/README.md) and
[@tundralibs/drivers](../drivers/README.md) — one schema declaration
drives your types, validation, migrations, and **at-rest column
encryption**, across PostgreSQL, MariaDB/MySQL, SQLite, and MongoDB —
and, on edge runtimes, Neon, Turso, and Cloudflare D1 over HTTP.

![Deno](https://img.shields.io/badge/Deno-000000?logo=deno)
![Bun](https://img.shields.io/badge/Bun-f9f1e1?logo=bun)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white)

## Overview

You define entities with a builder API. From that single declaration
NORM derives:

- **Types** — `RowOf`, `InsertOf`, `UpdateOf`, typed projections and
  filters, with no codegen step.
- **Validation** — a generated [Guardian](../guardian/README.md) runs
  before any SQL; bad input is a typed error, not a database error.
- **Migrations** — snapshot-based, with a table-rebuild engine, drift
  detection, reviewable per-dialect SQL plans, and a multi-machine
  advisory lock.
- **At-rest security** — `.encrypt()` any column (the TypeScript type
  is unchanged), filter encrypted columns transparently through digest
  siblings, and mask sensitive values on read.

The same typed code runs against seven engines — four self-hosted
(`postgres`, `maria`, `sqlite`, `mongo`) and three fetch-only ones for
edge/serverless runtimes (`neon`, `turso`, `d1`). The four self-hosted
dialects are exercised end-to-end by the live test suite.

## Modules

| Module                          | Import                               | Description                                                                                                |
| ------------------------------- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| Root                            | `@tundralibs/norm`                   | `Norm`, `NormDb`, repos, `Column`, `Entity`, `Schema`, `use` — plus every dialect.                         |
| [Core](core.ts)                 | `@tundralibs/norm/core`              | The same surface with NO dialect registered — the edge/serverless entry point.                             |
| [Definition](definition/mod.ts) | `@tundralibs/norm/definition`        | Builders, entity/schema types, doc + snapshot emitters.                                                    |
| [Migrations](migrations/mod.ts) | `@tundralibs/norm/migrations`        | The `Migrator` — snapshot / plan / apply / rollback.                                                       |
| [Asserts](asserts/mod.ts)       | `@tundralibs/norm/asserts`           | Validate hand-built definitions with the same rules `Entity()` uses.                                       |
| [Engines](engines/mod.ts)       | `@tundralibs/norm/engines`           | `registerEngine` / `resolveEngineFactory` — the dialect registry.                                          |
| Engine (one per dialect)        | `@tundralibs/norm/engines/<dialect>` | Side-effect module registering one dialect: `postgres`, `maria`, `sqlite`, `mongo`, `neon`, `turso`, `d1`. |

### Running on the edge

`@tundralibs/norm` (the root barrel) registers all seven dialects, so
any `database` config works with no extra import. The cost is that every
driver — including the **native** SQLite adapter — is in the bundle, and
its `bun:sqlite` / `@db/sqlite` specifiers cannot be resolved by an edge
bundler.

On Cloudflare Workers, Vercel Edge, or Vite, import `@tundralibs/norm/core`
(identical exports, zero dialects registered) plus the one engine module
you need:

```typescript
import '@tundralibs/norm/engines/d1'; // or /neon, or /turso
import { Column, Entity, Norm, Schema } from '@tundralibs/norm/core';

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

A dialect whose module was never imported throws a `NormError`
(`ENGINE_NOT_REGISTERED`) at construction, naming the import to add.
That matters most for `sqlite`: Cloudflare's `unenv` polyfill _resolves_
`node:sqlite` and even exposes `DatabaseSync`, but constructing one
throws `Illegal constructor` on workerd — so without the registry a
native-SQLite build would sail through CI and fail in production. Native
SQLite cannot work on Workers at all; `d1` and `turso` (both SQLite over
HTTP) are the supported paths, and `neon` is the Postgres one.

The edge engines are one-shot HTTP: no pooling and no transactions, which
`executor.capabilities` reports honestly. They reuse the same OQL
translators as their self-hosted counterparts (`neon` → Postgres,
`turso` / `d1` → SQLite), so the SQL norm generates is unchanged.

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

## Quick Start

```typescript
import { Column, Entity, Norm, Schema } from '@tundralibs/norm';
import { SQLiteEngine } from '@tundralibs/drivers/sqlite';

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

// 3. Open a connection and compose the schema(s).
const engine = new SQLiteEngine('app', { path: './data' });
const norm = new Norm({ engine, secret: process.env.SECRET });
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

Every operation returns a `NormResult` envelope: `{ id, op, count,
time, isSlow, data?, total?, scoped? }`. The `id` is a ULID that also
appears on the `call` event, so logs correlate 1:1.

## Defining a schema

`Column.*` builders are immutable and chainable. Invalid combinations
don't type-check — `hash()` exists only after `encrypt()`, validators
disappear after `encrypt()`, and so on.

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

`Entity(name, columns, options)` produces a `TABLE` (needs `pk`),
`VIEW`, or terminal `QUERY`. Relationships are declared with foreign
keys that reference the **target's registry key**, never a table name:

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

`Schema(name, entities)` groups them; `use(...schemas)` composes any
number of schemas into one typed database handle, resolving foreign
keys across schema boundaries.

See **[Schema definition](docs/NORM-Schema.md)** for the full builder
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

Filters are the OQL filter language typed to your columns: `$eq`,
`$ne`, `$in`, `$like`, `$between`, `$null`, `$or`/`$and`, and nested
relation refs (`'@Profile.@bio'`). Filtering _through_ a to-many
relation that isn't projected is lifted into a correlated `EXISTS`
subquery, so it never fans out.

See **[Querying](docs/NORM-Querying.md)** for filters, typed
projections, relations, aggregates, and pagination.

## At-rest encryption

This is what NORM does that mainstream TS ORMs don't. `.encrypt()`
works on **any** column kind — the value stays its declared TypeScript
type, and only the storage is ciphertext:

```typescript ignore
birthday: Column.timestamp().encrypt().nullable(), // Date in TS, TEXT at rest
```

Add `.hash()` to an encrypted column and NORM synthesizes a
`<col>_hash` digest sibling. Equality filters, `$in`, uniqueness, and
upsert conflict keys all work against ciphertext by transparently
rewriting to the digest:

```typescript ignore
email: Column.varchar(255).encrypt().hash(),
// unique on the sibling:
unique: { email: ['email_hash'] },
// filter by plaintext — rewritten to email_hash = sha256('ada@...'):
await db.repo('Users').findOne({ '@email': 'ada@example.dev' });
```

`Column.hash('SHA-256')` is a standalone one-way digest column (store a
password digest, never the plaintext). `Column.mask(source, fn)` is a
virtual column computed after decryption — never stored, never sent to
SQL.

See **[Security](docs/NORM-Security.md)** for encryption, digest
columns, masks, and the crypto override hooks.

## Migrations

The `Migrator` derives migrations from your definitions — no
hand-written SQL:

```typescript ignore
import { Migrator } from '@tundralibs/norm/migrations';

const mig = new Migrator(db, { dir: './migrations' });
await mig.snapshot(); // writes 0001.json (.sql opt-in: renderSql / renderPlans())
await mig.plan(); // inspect the DDL before applying
await mig.apply(); // execute + record in _norm_migrations
await mig.rollback({ to: 0 });
```

State-based: each version is a full physical snapshot; the diff between
consecutive snapshots is the migration, and "down" is the reverse diff.
Type/PK/crypto changes that no in-place `ALTER` can express become a
**table rebuild** (rename aside → recreate → copy → verify → drop),
including per-row decrypt/re-encrypt when a crypto marker flips. Drops
are gated behind `allowDrop` and surfaced as `blockedDrops` — never
silent. `apply()` refuses to run a plan whose hash doesn't match the
reviewed `.sql` artifact, and takes a server-side advisory lock so two
CI runners can't migrate concurrently.

See **[Migrations](docs/NORM-Migrations.md)** for the full workflow,
rename hints, the rebuild engine, and stored plans.

## Scoping (multi-tenant / default filters)

`db.scope({...})` returns a handle whose every read **and** write
carries an always-on equality filter — the tenant-scoping primitive:

```typescript ignore
const orgDb = db.scope({ '@orgId': currentOrgId });

await orgDb.repo('Tickets').find();          // WHERE orgId = currentOrgId
await orgDb.repo('Tickets').insert({ ... }); // orgId auto-filled (may be omitted)
await orgDb.repo('Tickets').update(data, f); // rejects moving a row out of scope
await orgDb.repo('Tickets').upsert(d, opts); // can't touch another scope's row
await orgDb.repo('Tickets').truncate();      // refused — use delete({}) to clear scope
```

`upsert` enforces the scope like `insert`/`update`: auto-fill (the
column is optional on the typed handle) plus a pre-flight probe that
refuses — on every dialect — a write that would collide with a row
outside the scope; declaring a `unique` over (scope column, conflict
key) additionally folds the scope into the `ON CONFLICT` target.
`truncate` **refuses** on a scoped handle, since it
carries no `WHERE` and would wipe every tenant. A scope column an
entity doesn't have is gracefully skipped (that entity is queried
unscoped), so one handle spans a mixed registry. The applied scope
rides `result.scoped` for auditing. Scopes are equality-only. See
**[Scoping](docs/NORM-Scoping.md)**.

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

`raw()` and `query()` bypass the typed pipeline (no decrypt, no scope,
no validation) and emit a `warning` event when used.

## Events

Wire the metadata-only event surface to your logger — it never carries
row data, plaintext, or secrets:

```typescript
import { Norm } from '@tundralibs/norm';
import { SQLiteEngine } from '@tundralibs/drivers/sqlite';

const engine = new SQLiteEngine('app', { path: './data' });
const secret = process.env.SECRET;
const log = console;

const norm = new Norm({
  engine,
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

The surface: `call`, `warning`, `decryptError` (an encrypted cell failed
to decrypt on read — a data-integrity / key-rotation signal, metadata
only), `transactionBegin` / `transactionCommit` / `transactionRollback`,
plus the engine's own events proxied from the driver — `connect`,
`disconnect`, `connectionFailed`, `error`, `transactionTimeout`, `query`,
and `slowQuery`. All subscribe inline via `_on<event>` keys (or
`norm.on(event, fn)`).

## Tracing (`witness`)

Events give you _flat_ observability — per-operation `call` and per-query
`query` records. For **nested** spans (an operation as the parent of the
queries it caused), configure a `witness`: every repo operation and `raw()`
runs through it, so a tracer's active span is open while the driver events
fire, and their spans parent to it automatically via
[ambient](../ambient/README.md).

```typescript ignore
const norm = new Norm({ engine, secret, witness: tracer.wrap });
```

`tracer.wrap` (tracer ≥ 0.4) is the ready-made Witness-shaped adapter: it
opens an `INTERNAL` span named `info.name` (`'norm.Users.find'`,
`'norm.raw'`, …), seeds the attributes, and honours the witness contract.
Hand-roll via `startActiveSpan` only when you want a different `SpanKind`
or extra attributes.

```text
GET /orders                      ← request span (middleware)
└─ norm.Orders.find              ← the witness
   ├─ db.query                   ← driver event, parents automatically
   └─ db.query   (relation load)
```

The `witness` is a generic wrap hook, not a tracer dependency — norm never
imports tracer; you wire them at the composition root, exactly like
slogger's `contextProvider`. **A witness observes and must not interfere:**
it must call `fn` exactly once, return its result unchanged, and re-throw
its errors. The operation-span-minus-query-spans gap also surfaces norm's
own overhead (validation, hooks, and per-cell crypto on encrypted columns)
per operation, for free.

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

¹ MongoDB is schemaless — the Migrator does not own its schema; create
indexes directly. ² MongoDB transactions require a replica set and are
not exposed. ³ Correlated subqueries have no MongoDB find-filter form.
⁴ MongoDB has no SQL surface; use `db.query()` with OQL IR.

## Guides

- **[How-To Guide](docs/NORM-Guide.md)** — build a real app end to end.
- **[Schema definition](docs/NORM-Schema.md)** — columns, entities,
  relations, hooks, validators.
- **[Querying](docs/NORM-Querying.md)** — filters, projections,
  relations, aggregates, pagination.
- **[Security](docs/NORM-Security.md)** — encryption, digests, masks.
- **[Migrations](docs/NORM-Migrations.md)** — the `Migrator` workflow.
- **[Scoping](docs/NORM-Scoping.md)** — tenant scoping & default filters.
- **[Errors](docs/NORM-Errors.md)** — the error classes and every stable
  `NormErrorCode`.

## License

MIT
