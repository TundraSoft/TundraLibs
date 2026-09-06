# Audit (versioned-replica) tables

An audit table gives a normal table a full history without changing
it. The source table keeps its ordinary insert, update, and delete
semantics; its pk, FKs, relations, and existing queries behave exactly
as before. Enabling `audit` makes norm generate a replica table and
mirror every write into it, so nothing writes the trail by hand and
nothing can forget to.

It shares its effective-dating mechanics with
[temporal tables](NORM-Temporal.md) (`EffectiveFrom`/`EffectiveTo`,
the far-future sentinel, `@AsOf`). The difference is where the history
lives: a temporal table's own rows are the history, while an audit
table's rows are untouched and the history lives in a separate
generated entity. A table is one or the other, never both; norm
rejects `temporal` + `audit` together at definition time.

## Table of Contents

- [Defining one](#defining-one)
- [How the data looks](#how-the-data-looks)
- [Writing: mirrored automatically](#writing-mirrored-automatically)
- [Reading: the replica is a read-only repo](#reading-the-replica-is-a-read-only-repo)
- [Schema evolution: dropping a source column](#schema-evolution-dropping-a-source-column)
- [Options](#options)
- [Cross-engine notes](#cross-engine-notes)
- [Common issues](#common-issues)
- [Related documentation](#related-documentation)

## Defining one

Add `audit` with a `name`: the registry key the generated replica is
exposed under (`db.repo(name)`):

```typescript
import { Column, Entity } from '@tundralibs/norm';

const Users = Entity('users', {
  Id: Column.uuid().default({ $$_expression: 'UUID' }),
  Name: Column.varchar(40),
  Email: Column.varchar(255).encrypt().hash(), // ciphertext here AND in the replica
}, {
  pk: ['Id'],
  audit: { name: 'UserAudit' }, // → db.repo('UserAudit')
});
```

`Users` itself is completely ordinary: no injected columns, no
write-verb changes. `Entity()` builds the whole replica definition
right there, since it needs nothing beyond `Users`'s own columns.
Placing `Users` in a `Schema({ Users })` is what registers the replica
under `'UserAudit'`, because `Entity()` is called before it has a
registry key of its own, so the replica cannot be registered any
earlier.

## How the data looks

The replica (physical table `user_audit`, the snake_case of the
registry name) carries every column from `Users`, unchanged, plus a
generated version id and the effective-dating pair:

| auditId | Id     | Name  | Email      | EffectiveFrom       | EffectiveTo         |
| ------- | ------ | ----- | ---------- | ------------------- | ------------------- |
| ulid-a  | uuid-1 | Bob   | bob@ex.com | 2026-01-01 09:00:00 | 2026-03-01 14:30:00 |
| ulid-b  | uuid-1 | Bobby | bob@ex.com | 2026-03-01 14:30:00 | 2099-12-31 23:59:59 |

`auditId` is the replica's own primary key (by default a
lexically-sortable ULID; see [Options](#options)). `Id` is `Users`'s pk,
now the version key threading a record's history together. `Email`
stores ciphertext, exactly like the source column; see
[Cross-engine notes](#cross-engine-notes).

## Writing: mirrored automatically

The source table's write verbs are completely unchanged, so audit is
transparent to callers:

```ts ignore
await repo.insert({ Name: 'Bob', Email: 'bob@ex.com' }); // ordinary insert
await repo.update({ Name: 'Bobby' }, { '@Id': id }); // ordinary update
await repo.delete({ '@Id': id }); // ordinary delete
```

Each one mirrors into the replica via the same supersede primitive
[temporal](NORM-Temporal.md#writing-insert--supersede) uses, keyed by
the source's primary key:

- **`insert`** opens a new version.
- **`update`** and **`upsert`** close the current version and open a
  new one from the row's full post-write state.
- **`delete`** closes the current version with no successor. A closed
  version with no successor unambiguously means the source row was
  deleted, so norm adds no separate INSERT/UPDATE/DELETE column to say
  so.
- **`truncate`** closes every currently open version, with no
  successors.

On a transaction-capable engine the source write and its mirror run in
one transaction (atomic); see
[Cross-engine notes](#cross-engine-notes) for the rest. `update` and
`delete` do not get the written rows back from the database (no
`RETURNING`), so an audited `update()` or `delete()` re-reads the rows
it just touched (same filter, same transaction) to learn what to
mirror. The price of an audited unfiltered update or delete is
therefore a full re-read of every row it affects.

## Reading: the replica is a read-only repo

`db.repo('UserAudit')` is a full `find`/`findOne`/`count`/`getByPK`
repo, with filters, projections, decryption, and scope all typed, but
it has no `insert`/`update`/`delete`/`upsert`/`truncate`. norm owns
every write to it, driven by `Users`'s own writes, and a caller writing
directly would corrupt the trail.

```ts ignore
await db.repo('UserAudit').find({ '@Id': id }); // every version
await db.repo('UserAudit').find({ '@Id': id, '@EffectiveTo': sentinel }); // current
await db.repo('UserAudit').find({ '@Id': id, '@AsOf': someDate }); // as of a point in time
```

The read hooks are the same as temporal's: `EffectiveFrom` and
`EffectiveTo` are ordinary filterable columns (`find` returns every
version unless you filter), and the virtual `@AsOf` column rewrites to
`EffectiveFrom <= T AND EffectiveTo > T`.

## Schema evolution: dropping a source column

> **The replica's data survives a source column drop. `find()` stops
> knowing it exists.** Read this before you drop a column you have ever
> audited.

Add a column, rename one, change a type: the
[Migrator](NORM-Migrations.md) propagates every one of those to the
replica automatically, with no extra work. Dropping one is different,
because an audit table's whole purpose is history. The replica never
actually drops the column. It renames it to `_<column>_` (and relaxes
it to nullable, if it was not already, since the source will never
supply a value for it again) instead of removing it. The row that had
`email: 'old@x.com'` still has it, forever, under `_email_`.

What that buys you: the value is never destroyed, and a future write
never fails a stale `NOT NULL` constraint on a column the source
stopped populating years ago.

What it does not buy you: `db.repo('UserAudit').find(...)` will never
mention `_email_`. The replica's type is rebuilt from the source's
current columns every time your app starts. The exact mechanism that
makes adds, renames, and type changes propagate for free also means a
name the source no longer has is invisible to `find()`. Reaching a
retired column is a `db.raw()` job, not a typed one:

```ts ignore
await db.raw('SELECT "_email_" FROM user_audit WHERE "id" = :id:', { id });
```

Full details, including the one-retirement-per-name limit (re-adding a
column with the same name later starts a fresh mirror; retiring that
same name a second time falls back to an ordinary blocked drop instead
of overwriting the first retirement), live in
[Migrations → Audit replicas never drop a column](NORM-Migrations.md#audit-replicas-never-drop-a-column).

## Options

```ts ignore
audit: {
  name: 'UserAudit', // required — the generated entity's registry key
  AuditPK: Column.varchar(30).default(() => ulid()), // optional — full Column control; default: ULID varchar(26)
  EffectiveFromColumn: 'EffectiveFrom', // optional (this is the default)
  EffectiveToColumn: 'EffectiveTo', // optional (this is the default)
  asOfColumn: 'AsOf', // optional — the virtual @AsOf filter name
  sentinel: '2099-12-31T23:59:59.999Z', // optional — the open-end marker
}
```

`AuditPK` is a full `Column` builder, with its own type, length, and
generator, because norm generates every version id itself. It must
declare `.default(...)`, since a caller never supplies it. The physical
replica table name is derived from `name` (snake_case); there is no
separate override.

## Cross-engine notes

- **PostgreSQL / MariaDB / SQLite**: the source write and its replica
  mirror run in one transaction (atomic), and the replica's
  `UNIQUE(<source pk>, EffectiveTo)` constraint enforces
  one-current-per-key even under concurrency.
- **MongoDB** and the fetch-only dialects (Neon, Turso, D1) have no
  transactions, so the mirror is best-effort, the same caveat as
  [temporal](NORM-Temporal.md#cross-engine-notes).
- **Encryption** carries over unchanged: an `.encrypt()` column's
  ciphertext (and key-id envelope) is copied into the replica as-is,
  never decrypted and never re-encrypted. Old versions decrypt through
  the replica's own read path after `rotateKey()`, exactly like the
  source.
- The replica declares no foreign keys. A row is a specific version,
  not a stable identity, and the history must survive the source row's
  own deletion. It can never be an FK target either; norm rejects that
  at `use()` time.
- The Migrator treats the replica as an ordinary physical table. It is
  created and kept in sync on every ALTER to the source, the same as
  any other table. The one exception is a column drop; see
  [Schema evolution](#schema-evolution-dropping-a-source-column).

## Common issues

- **"`find` returns duplicates."** Expected: a bare `find({'@Id': id})`
  returns all versions. Add `'@EffectiveTo': sentinel` for the current
  one, or `'@AsOf': someDate` for a point in time.
- **No `insert`/`update`/`delete` on the audit repo.** By design. Write
  to the source table; the replica follows automatically.
- **An unfiltered `update()`/`delete()` on an audited table is
  slower.** It re-reads every row it is about to touch, since there is
  no `RETURNING` to mirror from otherwise. Scope the filter when the
  table is large.
- **MongoDB is best-effort.** No transaction, no unique index; do not
  rely on the one-current guarantee there under concurrency.
- **"Where did `email` go after I dropped it from the source?"** It is
  still there, as `_email_`, forever, just not through `find()`. See
  [Schema evolution](#schema-evolution-dropping-a-source-column).
- **"Can I cache the audit replica?"** No. `audit` has no `cache`
  option, so `db.repo('UserAudit')` always reads the database. The
  source table may still declare its own `cache` normally; mirrored
  writes invalidate it exactly like any other write (see
  [Caching](NORM-Caching.md)). Do not route around this by defining a
  cached VIEW over the replica's physical table either. A mirrored
  write invalidates the source's cache namespace only, never the
  replica's, so that VIEW's cache would go stale for its full TTL after
  every write.

## Related documentation

- [Temporal tables](NORM-Temporal.md): the alternative history
  strategy; shares the same `EffectiveFrom`/`EffectiveTo`/`@AsOf`
  mechanics but keeps every version in the source table itself.
- [Read caching](NORM-Caching.md): `cache` on the source table vs. the
  replica (the replica can never be cached).
- [Migrations](NORM-Migrations.md): the `Migrator` workflow, including
  [column retirement](NORM-Migrations.md#audit-replicas-never-drop-a-column)
  in full.
- [Schema definition](NORM-Schema.md): columns, entities, and the
  `audit` option in context.

---

[← Back to NORM](../README.md)
