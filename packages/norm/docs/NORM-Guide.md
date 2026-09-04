# NORM — How-To Guide

A hands-on walkthrough that builds a small multi-tenant application,
**"Shortly"**, a link shortener with users, profiles, links, and visit
analytics, using every major feature of norm. Each snippet is drawn
from the package's own live test suite, so it runs unchanged on
PostgreSQL, MariaDB, SQLite, and MongoDB.

## Table of Contents

- [1. Install and connect](#1-install-and-connect)
- [2. Model the schema](#2-model-the-schema)
- [3. Let the Migrator own the schema](#3-let-the-migrator-own-the-schema)
- [4. Insert and read](#4-insert-and-read)
- [5. Encryption in practice](#5-encryption-in-practice)
- [6. Relations](#6-relations)
- [7. Reports and aggregates](#7-reports-and-aggregates)
- [8. Multi-tenant scoping](#8-multi-tenant-scoping)
- [9. Transactions](#9-transactions)
- [10. Testing your app](#10-testing-your-app)

## 1. Install and connect

```bash
deno add @tundralibs/norm       # or: bunx / npx jsr add @tundralibs/norm
```

`Norm` builds its engine from a `database` config, the way every
example in this guide does. Add a `secret` if you use encrypted
columns. Give it a `name` when an app runs more than one `Norm`: the
name prefixes every error the instance raises (`[shortly] …`), names
the driver connection, and namespaces the
[read cache](NORM-Caching.md). It defaults to `norm-<n>`.

```typescript
import { Norm } from '@tundralibs/norm';

const norm = new Norm({
  name: 'shortly',
  database: {
    dialect: 'postgres',
    host: 'localhost',
    port: 5432,
    database: 'shortly',
    username: 'app',
    password: Deno.env.get('PG_PASSWORD'),
  },
  secret: Deno.env.get('APP_SECRET'),
});
```

`dialect` is one of `postgres`, `maria`, `sqlite`, or `mongo` for a
self-hosted database, or `neon`, `turso`, or `d1` for the fetch-only
engines that run on edge and serverless runtimes. This guide imports
the root `@tundralibs/norm` barrel throughout, which registers every
dialect except `sqlite`; that one needs its own
`@tundralibs/norm/engines/sqlite` import. See
[Browser / Worker compatibility](../README.md#browser--worker-compatibility)
for which dialects run on an edge runtime, and prefer
`@tundralibs/norm/core` plus the single engine module you need there;
see [Choosing an entry point](../README.md#choosing-an-entry-point).

## 2. Model the schema

Keep one entity per file and one folder per schema; the folder is the
schema boundary. Columns are built with the chainable `Column` API, and
invalid combinations do not type-check.

`models/identity/users.ts`:

```typescript
import { Column, Entity } from '@tundralibs/norm';

export const Users = Entity('users', {
  id: Column.uuid().default({ $$_expression: 'UUID' }),
  // Encrypted at rest, still filterable by plaintext via the digest sibling:
  email: Column.varchar(255).beforeWrite((v) => v.trim().toLowerCase())
    .encrypt().hash(),
  // Store only a one-way digest — never the plaintext:
  password: Column.hash('SHA-256').minLength(8),
  displayName: Column.varchar(120).minLength(2),
  role: Column.varchar(12).lov(['admin', 'editor', 'viewer']).default('viewer'),
  // A virtual, computed-on-read column — never stored:
  apiKeyHint: Column.mask('apiKey', (v: string) => '…' + v.slice(-4)),
  apiKey: Column.varchar(64).hidden(), // excluded from default reads
  createdAt: Column.timestamp().default(() => new Date()),
}, {
  pk: ['id'],
  unique: { email: ['email_hash'] }, // uniqueness on the digest sibling
  hooks: {
    beforeInsert: (row) => ({ ...row, displayName: row.displayName.trim() }),
  },
});
```

`models/identity/profiles.ts` is a 1:1 extension, linked by a foreign
key. The `model` is the target's registry key (`'Users'`), not a table
name:

```typescript
import { Column, Entity } from '@tundralibs/norm';

export const Profiles = Entity('profiles', {
  userId: Column.uuid(),
  bio: Column.text().nullable(),
  birthday: Column.timestamp().encrypt().nullable(), // Date in TS, TEXT at rest
}, {
  pk: ['userId'],
  fk: {
    User: {
      model: 'Users',
      on: { userId: 'id' },
      reverseAs: 'Profile', // Users can now project '@Profile'
      reverseProject: true, // ...and it's eagerly included by default
      onDelete: 'CASCADE', // deleting a user removes its profile
    },
  },
});
```

`Users` and `Profiles` are plain tables. The options argument of
`Entity()` also takes `temporal` (keep every version of a row; the
table becomes insert-only), `audit` (a generated read-only history
replica beside a normally mutable table), and a `cache: <minutes>` TTL
for join-free reads. `temporal` and `audit` are mutually exclusive. See
[Temporal](NORM-Temporal.md), [Audit](NORM-Audit.md), and
[Caching](NORM-Caching.md).

Group entities into a schema and compose the schemas into a typed
database handle. `use()` resolves foreign keys across schema
boundaries, so `Links.ownerId → Users` works even though the two live
in different schemas.

```typescript ignore
import { Schema } from '@tundralibs/norm';
import { Users } from './models/identity/users.ts';
import { Profiles } from './models/identity/profiles.ts';
import { Links, Visits } from './models/shortener/mod.ts';

const Identity = Schema('Identity', { Users, Profiles });
const Shortener = Schema('Shortener', { Links, Visits });

const db = norm.use(Identity, Shortener);
```

## 3. Let the Migrator own the schema

Do not hand-write DDL. Snapshot the composed registry and apply it. The
Migrator creates the tables, indexes, digest siblings, and foreign keys,
and records what it did.

```typescript ignore
import { Migrator } from '@tundralibs/norm/migrations';

const mig = new Migrator(db, { dir: './migrations' });

await mig.snapshot(); // writes 0001.json (reviewable .sql plans are opt-in)
await mig.plan(); // inspect the DDL before you run it
await mig.apply(); // execute + record in _norm_migrations
```

On day two you change a model: `snapshot()` writes `0002.json`,
`plan()` shows the diff, and `apply()` runs it. A rename is a one-line
hint, `.renamedFrom('oldName')` on the column, so the data survives. A
forgotten rename shows up as a blocked drop, and `apply()` refuses
rather than silently losing the column. See
[Migrations](NORM-Migrations.md) for rebuilds, stored plans, and the
advisory lock.

## 4. Insert and read

Every operation returns a `NormResult` envelope. Reads carry `data`;
counts carry only `count`. The `id` is a ULID that also appears on the
`call` event, so a slow query in your logs can be matched to its call.

```typescript ignore
const created = await db.repo('Users').insert({
  email: '  Ada@Shortly.DEV ',
  password: 'hunter2boat',
  displayName: 'Ada',
});

created.data[0].email; // 'ada@shortly.dev' — decrypted + normalized
created.data[0].role; // 'viewer' — default applied
created.data[0].apiKeyHint; // '…' + last 4 of the generated apiKey
'apiKey' in created.data[0]; // false — hidden() stripped from the result

// Insert a batch:
await db.repo('Users').insert([
  { email: 'bob@shortly.dev', password: 'correcthorse', displayName: 'Bob' },
  { email: 'eve@shortly.dev', password: 'batterystaple', displayName: 'Eve' },
]);

// Read:
const ada = await db.repo('Users').getByPK({ id: created.data[0].id });
const admins = await db.repo('Users').find({ '@role': 'admin' }, {
  orderBy: { '@displayName': 'ASC' },
  limit: 20,
});
```

Validation runs before any SQL. An out-of-range `role` or a too-short
`displayName` is a `NormValidationError` rather than a database error.
See [Querying](NORM-Querying.md) for the full filter and projection
reference.

## 5. Encryption in practice

`email` is ciphertext in the database. You filter by the plaintext and
norm rewrites the comparison to the SHA-256 digest sibling:

```typescript ignore
// Transparent: this becomes  WHERE email_hash = sha256('ada@shortly.dev')
const found = await db.repo('Users').findOne({ '@email': 'ada@shortly.dev' });

// Case-insensitive uniqueness falls out of the beforeWrite + digest:
await db.repo('Users').insert({
  email: 'ADA@SHORTLY.DEV',
  password: 'x',
  displayName: 'Imposter',
}); // rejected — collides with Ada on email_hash
```

`password` is a one-way digest column. You write and filter by the
plaintext; only the digest is stored:

```typescript ignore
await db.repo('Users').findOne({ '@password': 'hunter2boat' }); // matches Ada
// The stored value is a 64-char hex digest; the plaintext is unrecoverable.
```

Encrypted non-string columns keep their type. `Profiles.birthday` is a
`Date` in TypeScript and ciphertext `TEXT` at rest, and you read a
`Date` back. See [Security](NORM-Security.md) for the codec, masks,
digest columns, and the crypto override hooks.

## 6. Relations

`Profiles.User` declared `reverseProject: true`, so a default read of a
user includes its profile:

```typescript ignore
const u = await db.repo('Users').getByPK({ id: adaId });
u.data?.Profile; // { userId, bio, birthday } | null
```

Project relations explicitly to shape the result. Projections are
depth-1 and never fan out; reverse to-many relations come back as
arrays:

```typescript ignore
const org = await db.repo('Organisations').find(undefined, {
  project: {
    '@name': true,
    '@Users': { '@id': true, '@displayName': true }, // hasMany → array
  },
});

// Filter a parent BY its children — lifted into an EXISTS subquery,
// so it never duplicates the parent rows:
const active = await db.repo('Links').find({ '@Visits.@country': 'IN' });
```

Many-to-many is a database VIEW that joins the junction once, declared
with a logical foreign key so it reads like an ordinary relation:

```typescript ignore
// A view: post_tags ⋈ tags, with a logical fk back to Posts.
const posts = await db.repo('Posts').find(undefined, {
  project: { '@title': true, '@Tags': { '@name': true } }, // one call, one SELECT
});
```

## 7. Reports and aggregates

Grouped aggregates live on the typed `find()` surface. The projected
columns become the `GROUP BY`:

```typescript ignore
const byCountry = await db.repo('Visits').find(undefined, {
  project: { '@country': true },
  aggregates: { visits: { fn: 'COUNT', column: '@id' } },
  orderBy: { '@country': 'ASC' },
  limit: 0, // ← every group. Without this you get the first TEN.
});
byCountry.data; // [{ country: 'BR', visits: 50 }, { country: 'DE', visits: 50 }, ...]

// Aggregate-only (no group keys) → a single summary row:
const summary = await db.repo('Visits').find(undefined, {
  aggregates: {
    total: { fn: 'COUNT', column: '@id' },
    latest: { fn: 'MAX', column: '@id' },
  },
});
```

A grouped read pages like any other read. With no `limit` it stops at
the entity's `defaultPageSize` of 10, so a report with more groups than
that is truncated, and a truncated report looks complete. Pass
`limit: 0` for every group, or an explicit `limit` to page it. When a
grouped read fills the default page, norm emits a `grouped-page-cap`
warning event. See
[Grouped reports are paged like any other read](./NORM-Querying.md#grouped-reports-are-paged-like-any-other-read).

For anything the typed surface cannot express, drop to the IR escape
hatch, `db.query(ir, { entity })`, which still decrypts, or to raw SQL,
`db.raw(sql, params)`, which does not.

## 8. Multi-tenant scoping

`db.scope({...})` returns a handle whose every read and write carries
an always-on equality filter. Scope once per request to the current
tenant and every later call is confined to it:

```typescript ignore
function handler(req) {
  const orgDb = db.scope({ '@orgId': req.orgId });

  // All confined to this org:
  await orgDb.repo('Links').find(); // WHERE orgId = req.orgId
  await orgDb.repo('Links').insert({ slug }); // orgId auto-filled (may be omitted)
  await orgDb.repo('Links').delete(f); // only this org's rows
}
```

Scoping applies to writes too. `insert` fills the scope column (the
typed handle makes it optional), `update` refuses a payload that would
move a row into another tenant, and `upsert` refuses on every dialect to
adopt or overwrite another tenant's row. Declare a `unique` over the
scope column and the conflict key and the scope is folded into the
`ON CONFLICT` target as well. `truncate` takes no `WHERE`, so on a
scoped handle it refuses rather than wipe every tenant; use
`delete({})` to clear only the current scope. A scope column an entity
does not have is skipped for that entity. See
[Scoping](NORM-Scoping.md).

## 9. Transactions

`db.transaction(fn)` commits when `fn` resolves and rolls back if it
throws. The `tx` handle shares everything, including an active scope:

```typescript ignore
await db.transaction(async (tx) => {
  const post = await tx.repo('Posts').insert({ title, authorId });
  await tx.repo('Audit').insert({ action: 'post.created', userId: authorId });
  // if either throws, both roll back
});
```

**Writing across relations.** norm has no nested-write syntax such as
`{ posts: { create: … } }`. That shape hides ordering and a transaction
and brings ambiguous `disconnect` and `set` semantics with it. The
sanctioned pattern is an explicit transaction, which reads clearly and
composes with everything else:

```typescript ignore
await db.transaction(async (tx) => {
  const user = await tx.repo('Users').insert({ email, displayName });
  await tx.repo('Posts').insert(
    posts.map((p) => ({ ...p, authorId: user.data[0].id })),
  );
  // parent first (its pk feeds the children's FK); all-or-nothing.
});
```

**Nesting.** Calling `transaction()` inside an open transaction opens a
`SAVEPOINT` on the same engine transaction. On resolve its writes fold
into the outer transaction; on throw only the inner block is rolled
back and the error is rethrown, so you can `try/catch` it and continue
the outer transaction.

```typescript ignore
await db.transaction(async (tx) => {
  await tx.repo('Users').insert({ email, displayName });
  try {
    await tx.transaction((sp) => sp.repo('Profiles').insert(maybeInvalid));
  } catch {
    // the profile write rolled back to its savepoint; the user survives
  }
});
```

This holds for JavaScript-level failures such as validation errors and
for SQL-level failures such as a constraint violation. The engine scopes
its rollback-on-failure to the innermost savepoint, so a failed
statement undoes only the nested block and the outer transaction stays
usable.

MongoDB and the fetch-only dialects have no transaction support and
reject `transaction()` with `NormUnsupportedError`.

## 10. Testing your app

Test against a real SQLite database. It is fast enough to be the
default, and the Migrator applies your actual definitions, so you test
the real schema:

```typescript ignore
import '@tundralibs/norm/engines/sqlite';
import { Migrator } from '@tundralibs/norm/migrations';

const tempDir = await Deno.makeTempDir();
const db = new Norm({
  database: { dialect: 'sqlite', path: tempDir },
  secret: 'test',
}).use(Identity, Shortener);
await new Migrator(db, { dir: tempDir }).snapshot();
await new Migrator(db, { dir: tempDir }).apply();
// ...run your app code against `db`, assert on the NormResult envelopes.
```

To unit-test code above the database with no engine at all, implement
the `Executor` seam (`execute`, `ddl`, `transaction`, and
`capabilities`) as a mock and pass it to `compileRuntime`. The
package's own `runtime.test` does exactly this.

---

[← Back to NORM](../README.md)
