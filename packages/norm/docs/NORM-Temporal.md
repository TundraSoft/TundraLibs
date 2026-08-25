# Temporal (effective-dated) tables

A temporal table keeps **every version** of each logical record in one
table, effective-dated. Instead of an update overwriting a row, norm
**closes** the current version and **opens** a new one — so the full
history is retained and you can read the data as it was at any instant.
It's the data-warehouse **Slowly-Changing-Dimension Type 2** pattern,
built in.

There is no "who changed it" here — this is data time-travel, not an
audit log with an actor. Reach for it when the _history of the values_
matters: prices/fee schedules, tax rates, feature flags, contract terms,
config that must be reconstructable at a past date, anything with "what
was in force on 〈date〉?" questions or a "restore a previous version" need.

## Table of Contents

- [Defining one](#defining-one)
- [How the data looks](#how-the-data-looks)
- [Writing: insert = supersede](#writing-insert--supersede)
- [Scheduling with `EffectiveFrom`](#scheduling-with-effectivefrom)
- [Reading: the query hooks](#reading-the-query-hooks)
- [Options](#options)
- [Cross-engine notes](#cross-engine-notes)
- [Common issues](#common-issues)
- [Related documentation](#related-documentation)

## Defining one

Add `temporal` with a **temporal key** — the column(s) that identify a
logical record across its versions. It is **not** the primary key: the pk
stays per-_version_ (a fresh value each insert), while the temporal key
threads the versions together.

```typescript
import { Column, Entity } from '@tundralibs/norm';

const FeeTemplates = Entity('fee_templates', {
  Id: Column.uuid().default({ $$_expression: 'UUID' }), // pk — one per VERSION
  Name: Column.varchar(30), // ← temporal key (the logical record)
  Fees: Column.integer(),
}, {
  pk: ['Id'],
  temporal: { key: ['Name'] },
});
```

norm injects and manages two columns — `EffectiveFrom` and `EffectiveTo`
(names configurable) — and emits a `UNIQUE(Name, EffectiveTo)` constraint
so exactly one version per key is ever "current".

## How the data looks

After inserting the "Gold" template three times (100 → 120 → 150), the
table holds three rows for that one logical record:

| Id     | Name | Fees | EffectiveFrom       | EffectiveTo         |
| ------ | ---- | ---- | ------------------- | ------------------- |
| uuid-a | Gold | 100  | 2026-01-01 09:00:00 | 2026-03-01 14:30:00 |
| uuid-b | Gold | 120  | 2026-03-01 14:30:00 | 2026-06-15 11:05:00 |
| uuid-c | Gold | 150  | 2026-06-15 11:05:00 | 2099-12-31 23:59:59 |

The **current** version is the one whose `EffectiveTo` is the far-future
**sentinel** (`2099-12-31 23:59:59.999`). The periods are contiguous and
non-overlapping: each version's `EffectiveTo` is the next one's
`EffectiveFrom`.

## Writing: insert = supersede

On a temporal table, `insert` is the only write verb that runs — every
other one throws `NormUnsupportedError`:

- **`insert`** supersedes: it closes the current version and opens a new
  one with your values. This is the ONLY way to add a version.
- **`update`** and **`upsert`** are **disabled**, not routed to `insert` —
  a partial `update()` payload would otherwise validate against the
  wrong (non-partial) guardian and silently drop every column the
  caller didn't repeat, so norm rejects the call outright instead.
- **`delete`** and **`truncate`** are likewise **disabled** — history is
  never removed or bulk-erased.

```ts ignore
await repo.insert({ Name: 'Gold', Fees: 150 }); // supersedes the current Gold
await repo.insert({ Name: 'Gold', Fees: 180 }); // a new version — the only way to change one
await repo.update({ Fees: 180 }, { '@Name': 'Gold' }); // throws: temporal is insert-only
await repo.delete({ '@Name': 'Gold' }); // throws: delete is disabled
```

## Scheduling with `EffectiveFrom`

A caller MAY supply `EffectiveFrom` to date the new version — most
usefully to **schedule** a future change. norm splits the version in
force at that instant, so the change takes effect exactly then:

```ts ignore
const july1 = new Date('2026-07-01T00:00:00Z');
await repo.insert({ Name: 'Gold', Fees: 200, EffectiveFrom: july1 });
// Today's reads still see 150; from July 1 onward they see 200.
```

Two rules keep the timeline sane:

- `EffectiveFrom` **cannot be in the past** (history is immutable) — a past
  value throws `NormQueryError` with code `TEMPORAL_PAST` (a ~1s skew
  tolerance covers clock drift).
- It must fall in the currently-open period — a value before the active
  version's own start throws `TEMPORAL_OVERLAP`.

`EffectiveTo` is always norm-managed; you never set it.

## Reading: the query hooks

`EffectiveFrom` / `EffectiveTo` are ordinary filterable, readable columns —
reads apply **no** implicit "current only" filter, so `find({ '@Name':
'Gold' })` returns **every** version. That keeps things explicit, and adds
three fluent hooks:

```ts ignore
// The current version — filter the open end:
await repo.find({ '@Name': 'Gold', '@EffectiveTo': sentinel });

// The version in force at an instant — the virtual @AsOf column rewrites
// to `EffectiveFrom <= T AND EffectiveTo > T`:
await repo.find({ '@Name': 'Gold', '@AsOf': new Date('2026-04-01') });
await repo.find({ '@Name': 'Gold', '@AsOf': new Date() }); // = current

// The full history, oldest first:
await repo.find({ '@Name': 'Gold' }, { orderBy: { '@EffectiveFrom': 'ASC' } });
```

`@AsOf` is a **virtual, filter-only** column: it is never stored or
returned in rows — it exists purely to express point-in-time reads
fluently. Its name (and the `EffectiveFrom` / `EffectiveTo` names) are
configurable — see below.

## Options

```ts ignore
temporal: {
  key: ['Name'], // required — the temporal key column(s), NOT the pk
  EffectiveFromColumn: 'EffectiveFrom', // optional (this is the default)
  EffectiveToColumn: 'EffectiveTo', // optional (this is the default)
  asOfColumn: 'AsOf', // optional — the virtual @AsOf filter name
  sentinel: '2099-12-31T23:59:59.999Z', // optional — the open-end marker
}
```

## Cross-engine notes

- **PostgreSQL / MariaDB / SQLite** — the supersede runs in one
  transaction (atomic), and the `UNIQUE(key, EffectiveTo)` constraint
  enforces one-current-per-key even under concurrency. norm injects the
  period columns as `DATETIME` so the far-future sentinel fits (MariaDB's
  `TIMESTAMP` caps at 2038).
- **MongoDB** and the edge HTTP engines have no transactions, so the
  supersede is **best-effort**: a crash between the close and the insert
  can leave an inconsistent version state, and there is no unique index to
  guard concurrent writers. Use temporal on a transaction-capable engine
  when the one-current guarantee matters.

## Common issues

- **"`find` returns duplicates."** Expected — a bare `find({ '@Name': x })`
  returns _all_ versions. Add `'@EffectiveTo': sentinel` for the current
  one, or `'@AsOf': someDate` for a point in time.
- **The pk is not the identity.** `Id` identifies a _version_ (a fresh
  value per insert); the _record_ is identified by the temporal key. FKs
  from other tables point at a specific version's pk (immutable — safe).
- **`update`/`upsert`/`truncate`/`delete` all throw.** By design — only
  `insert()` writes. To "remove" a record, supersede it with a
  tombstone value your app recognizes, or query only current rows.
- **Backdating is rejected.** `EffectiveFrom` can only be "now" or the
  future (`TEMPORAL_PAST`) — history is immutable on purpose.
- **MongoDB is best-effort.** No transaction, no unique index — don't rely
  on the one-current guarantee there under concurrency.
- **Caching + `@AsOf` rarely hits.** A temporal table may also declare
  `cache` (see [Caching](NORM-Caching.md)) — writes still invalidate it
  correctly. But `'@AsOf': new Date()` bakes the exact millisecond into
  the cache key, so consecutive calls almost never hit; filter on
  `'@EffectiveTo': sentinel` instead for a cacheable "current" read.

## Related documentation

- [Audit tables](NORM-Audit.md) — the alternative history strategy;
  shares the same `EffectiveFrom`/`EffectiveTo`/`@AsOf` mechanics but
  keeps the source table's normal write semantics.
- [Read caching](NORM-Caching.md) — `cache` on a temporal table, and the
  `@AsOf` cache-key caveat above.
- [Migrations](NORM-Migrations.md) — a temporal table migrates as an
  ordinary TABLE; `EffectiveFrom`/`EffectiveTo` are physical columns
  diffed like any other.
- [Schema definition](NORM-Schema.md) — columns, entities, and the
  `temporal` option in context.

---

[← Back to NORM](../README.md)
