# Scoping

An always-on equality filter merged into **every read and write** of a
scoped database handle — the tenant-scoping and default-filter
primitive. `db.scope({ '@orgId': 42 })` makes every
find/count/update/delete carry `orgId = 42` and every insert auto-fill
it, so a forgotten tenant filter can't leak across tenants.

## Table of Contents

- [Creating a scoped handle](#creating-a-scoped-handle)
- [Reads](#reads)
- [Writes](#writes)
- [Typed inserts](#typed-inserts)
- [Graceful across a mixed registry](#graceful-across-a-mixed-registry)
- [The `scoped` envelope field](#the-scoped-envelope-field)
- [Rules and limits](#rules-and-limits)
- [Scoping vs views](#scoping-vs-views)

## Creating a scoped handle

`db.scope(input)` returns a new `NormDb` that shares the same
connection, runtime, and any active transaction — only the implicit
filter is added. It is typically created per request:

```typescript
import { Column, Entity, Norm, Schema } from '@tundralibs/norm';

const App = Schema('App', {
  Tickets: Entity('tickets', {
    id: Column.integer(),
    orgId: Column.integer(),
  }, { pk: ['id'] }),
});
const norm = new Norm({ database: { dialect: 'sqlite', path: './data' } });

const db = norm.use(App);

function handler(req: Request, orgId: number) {
  const orgDb = db.scope({ '@orgId': orgId });
  // every orgDb.repo(...) call is confined to this org
}
```

Scopes compose — chaining merges (the later value wins on a collision):

```typescript ignore
const scoped = db.scope({ '@orgId': 42 }).scope({ '@region': 'EU' });
// every operation carries orgId = 42 AND region = 'EU'
```

## Reads

`find`, `findOne`, `getByPK`, and `count` AND the scope into the
`WHERE`:

```typescript ignore
await orgDb.repo('Tickets').find({ '@status': 'open' });
// WHERE orgId = 42 AND status = 'open'

await orgDb.repo('Tickets').count();
// WHERE orgId = 42
```

## Writes

`insert` auto-fills the scope value — you may omit it, or pass it (it
must match, or the insert is rejected):

```typescript ignore
await orgDb.repo('Tickets').insert({ title: 'Bug' });
// orgId = 42 is filled in automatically

await orgDb.repo('Tickets').insert({ title: 'Bug', orgId: 99 });
// throws NormQueryError — a scoped insert can't write into another scope
```

`update` and `delete` constrain the `WHERE`, and `update` additionally
rejects a payload that would move a row out of scope:

```typescript ignore
await orgDb.repo('Tickets').update({ status: 'closed' }, { '@id': 7 });
// WHERE orgId = 42 AND id = 7 — can only close this org's ticket #7

await orgDb.repo('Tickets').update({ orgId: 99 }, { '@id': 7 });
// throws — cannot reassign a row to a different scope

await orgDb.repo('Tickets').delete({ '@id': 7 });
// WHERE orgId = 42 AND id = 7
```

`upsert` enforces the scope exactly like `insert`/`update`: it
auto-fills the scope value (you may omit it), rejects a payload that
contradicts the scope, and — the part specific to `upsert` — can never
adopt or overwrite another tenant's row:

```typescript ignore
await orgDb.repo('Tickets').upsert(
  { extKey: 'T-1', title: 'Bug' }, // orgId auto-filled
  { conflictKeys: ['extKey'] },
);
// INSERT … ON CONFLICT (extKey) … — the target is emitted as spelled

await orgDb.repo('Tickets').upsert(
  { extKey: 'T-1', title: 'Bug', orgId: 99 },
  { conflictKeys: ['extKey'] },
);
// throws NormQueryError — a scoped upsert can't write into another scope
```

### How the cross-scope guarantee is enforced

A conflict target alone cannot carry it. Postgres and SQLite infer the
arbiter index from the `ON CONFLICT` list and reject a list no index
covers (`42P10` / _"does not match any PRIMARY KEY or UNIQUE
constraint"_), so NORM cannot simply append the scope column to it;
and MariaDB's `ON DUPLICATE KEY UPDATE` ignores the target entirely,
matching on **any** unique key. So the guarantee is enforced one level
up, identically on all four dialects:

- **Pre-flight scope probe (always, every dialect).** Before the
  statement runs, `upsert` asks the database whether any row this write
  could collide with — the conflict target plus every declared
  `PRIMARY KEY` / `unique:` group the payload supplies, which is exactly
  what MariaDB would match on — lives outside the active scope. If one
  does, the call throws `NormQueryError` (`SCOPE_VIOLATION`) and **no**
  SQL is written. This costs **one extra `SELECT` round-trip on each
  scoped `upsert`**, so a scoped `upsert` is two statements (probe +
  write) where an unscoped one is a single write. The probe is skipped
  only when the payload gives it nothing to check — every candidate key
  is either already inside the scope (so it can only ever match in
  scope) or not fully supplied by the row (e.g. a server-generated
  primary key you omit). Note it still fires on the recommended
  per-scope-`unique` shape below whenever the payload also carries a
  primary key or other declared key the engine could match on.
- **Scoped conflict target (when the schema supports it).** If the
  entity declares a unique group covering the scope column(s) **plus**
  the `conflictKeys`, NORM folds the scope into the `ON CONFLICT` list —
  the list then names a real index, and the conflict can only ever match
  inside the scope, at the engine level:

```typescript ignore
const Tickets = Entity('tickets', {
  id: Column.integer(),
  orgId: Column.integer(),
  extKey: Column.varchar(64),
  title: Column.varchar(120),
}, { pk: ['id'], unique: { orgExt: ['orgId', 'extKey'] } });

await orgDb.repo('Tickets').upsert(
  { extKey: 'T-1', title: 'Bug' },
  { conflictKeys: ['extKey'] },
);
// INSERT … ON CONFLICT (orgId, extKey) … — matches only within org 42,
// and two tenants may hold the same extKey
```

This is the recommended multi-tenant shape: it makes the isolation a
schema invariant (nothing can violate it, not even a concurrent writer
racing the probe), and it lets two scopes carry the same business key.
Without it the upsert still works and is still guarded — it just refuses
loudly instead of partitioning.

Two limits worth knowing: the probe reasons about the constraints the
**entity declares** (the Migrator creates the schema from those same
declarations, so they agree in a norm-managed database — a unique index
added by hand outside NORM is invisible to it), and it is a
**check-then-act**: a conflicting row inserted by another scope in the
instant between the probe and the statement is not caught, so that write
then proceeds and may **overwrite** the racing row — or, when the
conflict key is globally unique and the engine matches on it alone,
**adopt** it into the active scope (the auto-filled scope value is set
onto the matched row). This is a residual race, not a routine outcome —
it needs a concurrent cross-scope writer on the same key in that narrow
window — but it is real on all four dialects, including document stores,
which match on the conflict key alone. The per-scope `unique` above
closes both limits: it folds the scope into the conflict target, so the
isolation becomes a schema invariant no concurrent writer can race, and
the probe on the conflict key falls away.

`truncate` **refuses** on a scoped handle. `TRUNCATE` carries no
`WHERE`, so honouring it would empty **every** scope's rows, not just
this one — an unscopeable, irreversible cross-scope wipe. Use
`delete({})` (which IS scoped) to clear only this scope, or call
`truncate()` on an unscoped handle for a true table truncate:

```typescript ignore
await orgDb.repo('Tickets').truncate();
// throws NormQueryError — cannot truncate from a scoped handle

await orgDb.repo('Tickets').delete({}); // clears only org 42's rows
await db.repo('Tickets').truncate(); // unscoped handle — empties the table
```

(As with reads, a scope column an entity does not have is skipped — so
`truncate()` on such an entity is not a scoped call for it and proceeds.)

## Typed inserts

The scoped handle is typed: `db.scope({ '@orgId': X })` makes `orgId`
**optional** in that handle's `insert()` **and `upsert()`**, because the
scope fills it. The base handle still requires it, and
genuinely-required non-scope columns stay required:

```typescript ignore
const orgDb = db.scope({ '@orgId': 42 });

await orgDb.repo('Tickets').insert({ title: 'Bug' }); // ok — orgId optional
await orgDb.repo('Tickets').insert({ title: 'Bug', orgId: 42 }); // ok — may pass it
await orgDb.repo('Tickets').upsert(
  { extKey: 'T-1', title: 'Bug' }, // ok — orgId optional here too
  { conflictKeys: ['extKey'] },
);

await db.repo('Tickets').insert({ title: 'Bug' }); // type error — orgId required
await orgDb.repo('Tickets').insert({ orgId: 42 }); // type error — title required
```

## Graceful across a mixed registry

A scope column that an entity doesn't have is silently skipped for that
entity — it is queried unscoped. This lets one scoped handle span a
whole registry where only some tables carry the partition column:

```typescript ignore
const orgDb = db.scope({ '@orgId': 42 });

await orgDb.repo('Tickets').count(); // WHERE orgId = 42  (Tickets has orgId)
await orgDb.repo('Countries').count(); // unscoped  (Countries has no orgId)
```

## The `scoped` envelope field

Every result from a scoped operation carries the scope that was applied
under `result.scoped`, keyed by `@column` — for audit logging. It is
absent when nothing applied (the graceful case above):

```typescript ignore
const r = await orgDb.repo('Tickets').count();
r.scoped; // { '@orgId': 42 }

const c = await orgDb.repo('Countries').count();
c.scoped; // undefined
```

## Rules and limits

- **Equality only.** A scope value is a bare primitive
  (`{ '@orgId': 42 }`). Operators, arrays, and relation refs are
  rejected — a scope is an identity partition, not a query. This is
  what makes it safe to auto-fill on insert.
- **A plain `.encrypt()` scope column is rejected.** IV-randomized
  ciphertext never compares equal, so a scope on an encrypt-only column
  can't match — it throws rather than silently matching nothing. An
  `.encrypt().hash()` column, however, **is** a valid scope column: the
  scope matches via its deterministic `<col>_hash` digest sibling on
  reads (and in `upsert`'s scope probe), and a scoped write stores the
  value as ciphertext with the digest sibling populated (so scoped reads
  find the row).
- **`raw()` and `query()` bypass the scope.** They run below the filter
  layer; both emit a `warning` event so an audit can see the escape
  hatch was used inside a scoped context.

## Scoping vs views

Use scoping for **runtime, per-request** partitions — the tenant id
that changes with every request. For a **static** "read model" (only
active rows, only published posts), define a VIEW instead: it is
explicit, appears in the schema and the migration plan, and can be
joined. Scoping and views are complementary, not competing.

---

[← Back to NORM](../README.md)
