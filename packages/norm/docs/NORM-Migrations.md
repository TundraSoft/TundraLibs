# Migrations

Schema migrations for NORM, derived from your entity definitions — no
hand-written SQL. The `Migrator` snapshots your schema, diffs it into
reviewable per-dialect DDL, and applies it under a lock, with drift
detection, a table-rebuild engine, and drop guards.

![Deno](https://img.shields.io/badge/Deno-000000?logo=deno)
![Bun](https://img.shields.io/badge/Bun-f9f1e1?logo=bun)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white)

## Table of Contents

- [The model](#the-model)
- [Importing the Migrator](#importing-the-migrator)
- [The workflow](#the-workflow)
  - [`snapshot()`](#snapshot)
  - [`status()`](#status)
  - [`plan()`](#plan)
  - [`apply()`](#apply)
  - [`rollback()`](#rollback)
  - [`history()`](#history)
  - [`renderPlans()`](#renderplans)
- [Reviewable stored plans](#reviewable-stored-plans)
- [Safety gates](#safety-gates)
- [Renames](#renames)
- [The rebuild engine](#the-rebuild-engine)
- [Foreign key referential actions](#foreign-key-referential-actions)
- [Dialect notes](#dialect-notes)
- [API reference](#api-reference)
- [Related documentation](#related-documentation)

## The model

Migrations are **state-based**. You never write a migration. Instead,
each version is a full **physical snapshot** of your schema — a numbered
JSON file (`0001.json`, `0002.json`, …). The migration _is_ the diff
between two consecutive snapshots, and "down" is simply the reverse
diff.

```
migrations/
├── 0001.json            ← full schema state at v1
├── 0001.sqlite.sql      ← reviewable DDL for SQLite
├── 0001.postgres.sql    ← reviewable DDL for PostgreSQL
├── 0001.maria.sql       ← reviewable DDL for MariaDB/MySQL
├── 0002.json            ← full schema state at v2
├── 0002.sqlite.sql
├── …
└── migrator.lock        ← single-host mutex (gitignore this)
```

A snapshot records only **physical** facts: table/column names, types,
primary keys, foreign keys, indexes, uniques, and the crypto markers
(`encrypt`, `hash`, `hashed`). Logical concerns — validators, hooks,
defaults, scopes, masks, and terminal `QUERY` entities — never appear,
because they generate no DDL. Encrypted columns snapshot as their
at-rest shape (`TEXT`), since that is what actually lands in the table.

Filenames are **zero-padded sequence numbers, not timestamps**. Two
branches that both mint `0003.json` collide on the filename in git —
which is exactly the alarm you want, rather than two "latest"
migrations silently coexisting.

### The tracking table and drift hash

Applied migrations are recorded in a reserved table, `_norm_migrations`,
whose own schema is fixed and never itself migrates. Do not register a
model under that name. Each row carries the version, the snapshot's
hash, when it was applied, by whom, and how long it took.

A second reserved table, `_norm_migration_progress`, appears **only on
engines without transactional DDL** (MariaDB, Mongo) and holds the
resume checkpoint for a version that failed halfway. It is emptied as
soon as the version is recorded — see
[What happens when a statement fails halfway](#what-happens-when-a-statement-fails-halfway).
Do not register a model under that name either.

Every snapshot carries a 64-bit **FNV-1a** rollup hash (16 hex chars)
over its canonical, key-sorted JSON. `rename` hints are excluded from
the hash, so a hinted snapshot and its steady-state equivalent hash
identically. On apply, that hash is stored alongside the version; on
every later run it is recomputed and compared. A mismatch means the
applied snapshot file was edited or deleted after it was applied —
**drift** — and the Migrator refuses to proceed rather than diff
against a version that no longer means what the database recorded.

## Importing the Migrator

The Migrator lives on its own subpath and is deliberately **not**
re-exported from the package root — migrations are an operational
concern, kept out of the request path and out of your app bundle.

```typescript
import { Column, Entity, Norm, Schema } from '@tundralibs/norm';
import { Migrator } from '@tundralibs/norm/migrations';
import { SQLiteEngine } from '@tundralibs/drivers';

const Users = Entity('users', {
  id: Column.integer(),
  email: Column.varchar(255).encrypt().hash(),
  displayName: Column.varchar(120).nullable(),
}, {
  pk: ['id'],
  unique: { email: ['email_hash'] },
});

const engine = new SQLiteEngine('app', { path: './data' });
const norm = new Norm({ engine, secret: process.env.SECRET });
const db = norm.use(Schema('App', { Users }));

// The Migrator binds to the handle returned by norm.use(...).
const mig = new Migrator(db, { dir: './migrations' });
```

## The workflow

The everyday loop is **snapshot → review → apply**:

```typescript ignore
await mig.snapshot(); // write 0001.json (.sql is opt-in — see below)
await mig.plan(); // inspect the DDL each pending version would run
await mig.apply(); // execute it + record in _norm_migrations
```

### `snapshot()`

Writes the next versioned snapshot — **unless** the current schema is
hash-identical to the head snapshot, in which case it is a no-op. It
writes the `000N.json` file only; the reviewable `000N.<dialect>.sql`
plan artifacts are **opt-in** — construct the Migrator with
`{ renderSql: true }` to have `snapshot()` also emit them, or generate
them on demand with [`renderPlans()`](#renderplans) (see
[Reviewable stored plans](#reviewable-stored-plans)).

```typescript ignore
const s = await mig.snapshot();
// { version: 1, path: './migrations/0001.json', written: true }

// Nothing changed since the last snapshot → no new files.
const again = await mig.snapshot();
// { version: 1, path: './migrations/0001.json', written: false }
```

The `written: false` result tells you the schema is unchanged; commit
your definitions and move on.

### `status()`

Compares the filesystem against the database — what is applied, what is
pending, and whether the applied head still matches its recorded hash.

```typescript ignore
const st = await mig.status();
// { dbVersion: 1, fsVersion: 3, pending: [2, 3], hashOk: true }
```

- `dbVersion` — highest applied version (`0` = fresh database).
- `fsVersion` — highest snapshot on disk (`0` = none yet).
- `pending` — versions on disk but not yet applied, ascending.
- `hashOk` — `false` signals drift: the applied head snapshot no longer
  matches the hash recorded when it was applied (edited or deleted).

### `plan()`

Returns the DDL each pending version would run, oldest first — **inspect
this before you apply.** No side effects; nothing touches the database.

```typescript ignore
const steps = await mig.plan();
for (const step of steps) {
  console.log(`v${step.version}`);
  console.log('  actions:', step.queries.length);
  console.log('  blocked drops:', step.blockedDrops);
  console.log('  warnings:', step.warnings);
}
```

Each `PlannedStep` carries the ordered `queries` (DDL actions, plus any
table rebuilds), the `blockedDrops` a `allowDrop: false` run would
refuse, and `warnings` for apply-time hazards (see
[Safety gates](#safety-gates)). Pass `{ allowDrop: true }` to see what
the plan looks like with drops emitted rather than blocked.

`plan()` throws loudly if the applied head snapshot is missing from the
directory (pending diffs would baseline against the wrong version) or
if a step needs an `ALTER` the dialect cannot express.

### `apply()`

Executes the pending plan and records each version in `_norm_migrations`.
Status and plan are computed **inside** the lock, so a plan can never go
stale while waiting on a concurrent run.

```typescript ignore
const r = await mig.apply();
// { applied: [2, 3], durationMs: 41 }
```

`apply()` refuses — before running anything — when:

- the applied head has **drifted** (`hashOk: false`),
- a step contains **blocked drops** (`allowDrop` is `false`; see below),
- a **plan artifact is missing or its hash no longer matches** the plan
  this apply would execute (see [Reviewable stored plans](#reviewable-stored-plans)).

Options:

```typescript ignore
await mig.apply({
  allowDrop: true, // emit DROP TABLE/COLUMN (default false)
  appliedBy: 'ci-runner', // audit column; defaults to $USER/$USERNAME
  lockTimeoutMs: 60_000, // lock acquire timeout (default 30_000)
});
```

#### What happens when a statement fails halfway

A version's plan is many statements. What a mid-plan failure leaves
behind depends on whether the engine's **DDL** participates in
transactions — which is NOT the same question as whether it supports
transactions at all:

| Dialect      | DDL in a transaction? | Guarantee on mid-plan failure                                            |
| ------------ | --------------------- | ------------------------------------------------------------------------ |
| **Postgres** | yes                   | **Atomic rollback.** Nothing is applied; retry freely.                   |
| **SQLite**   | yes                   | **Atomic rollback.** Nothing is applied; retry freely.                   |
| **MariaDB**  | no — DDL auto-commits | **Safe retry.** Completed statements stay; the retry resumes after them. |
| **Mongo**    | no transactions       | **Safe retry.** Same resume mechanism.                                   |

MariaDB/MySQL report `transactions: true` and mean it — for DML. Every
DDL statement issues an _implicit commit_, so a `BEGIN` around a
migration there buys nothing at all. Norm therefore exposes a separate
`transactionalDdl` capability and picks per engine.

**On Postgres and SQLite** the version's DDL **and** its
`_norm_migrations` row commit as one transaction. Statement _k_ failing
rolls back statements 1…_k_−1 with it, the version is never recorded,
and the database is byte-identical to where it started. `CREATE SCHEMA`
is the one exception — it runs before the transaction, because SQLite
emulates schemas with `ATTACH DATABASE`, which cannot run inside one. It
is idempotent on both dialects, so a retry is unaffected.

**On MariaDB and Mongo** atomicity is impossible, so the _retry_ is made
safe instead. After each action lands, norm records how far the version
got in `_norm_migration_progress`; the next `apply()` resumes from that
point rather than re-emitting statements that already succeeded. This
matters because `ADD COLUMN` and `ADD CONSTRAINT` are emitted **without**
`IF NOT EXISTS` — re-running them fails with "already exists", and
before the checkpoint existed the only recovery was dropping objects by
hand.

The checkpoint is fingerprinted with a hash of the action list. If the
snapshots change while a version sits half-applied, the resume would
skip the wrong statements, so `apply()` refuses with `PLAN_CHANGED`
instead of guessing. Reconcile the schema by hand, delete the row from
`_norm_migration_progress`, and re-run. Checkpoint rows are deleted the
moment a version is recorded, so the table is empty on a healthy
database (and is never created at all on Postgres/SQLite).

> **Not covered:** a **table rebuild** (see
> [The rebuild engine](#the-rebuild-engine)) that dies mid-flight on a
> non-transactional dialect. Its `__pre_migrate` table survives and the
> next apply refuses on the rename collision — that recovery is still
> manual, by design.

**Dry run** — compute and return the full plan without executing or
recording anything (drift is still checked):

```typescript ignore
const dry = await mig.apply({ dryRun: true });
// { applied: [], durationMs: 2, plannedQueries: [ …PlannedStep… ] }
console.log(dry.plannedQueries![0].blockedDrops);
```

#### Per-version transaction timeout

On the transactional-DDL engines (PostgreSQL, SQLite) a version's DDL
and its `_norm_migrations` row commit as **one transaction** (see
above). That transaction would otherwise inherit the driver's
request-scale auto-rollback timer — **120s** by default — which is far
too short for a large chunked crypto rebuild and would force-roll it
back mid-copy. The Migrator therefore **disarms** that timer by default,
so a version may run as long as it needs. Set
`transactionTimeoutMs` on the constructor to re-impose a ceiling:

```typescript ignore
const mig = new Migrator(db, {
  dir: './migrations',
  transactionTimeoutMs: 0, // default — disarmed, no per-version cap
  // transactionTimeoutMs: 600_000, // re-impose a 10-minute ceiling
});
```

- **Default `0`** disarms the cap entirely — the correct setting for a
  multi-minute rebuild that must not be interrupted. Passing `0`
  explicitly means exactly the same thing as omitting the option (as
  does any non-positive value); it is never clamped up to a 1-second
  cap.
- **A positive value** re-imposes a ceiling, rounded up to whole
  seconds (the driver's unit), never below 1s. Raise it above the
  driver's `120s` default only to bound a legitimately long version, or
  set a low value to fail a runaway migration fast.
- It has **no effect on MariaDB/MySQL or MongoDB**, whose per-action DDL
  auto-commits — those engines can't wrap a version in a transaction at
  all (they use the checkpoint-resume path instead).

### `rollback()`

Replays the **reverse diff** back down to a target version, deleting the
reverted rows from `_norm_migrations`. Rolling back a `CREATE` is a
`DROP`, so drops are implied and always allowed here — that is the whole
point of a rollback.

```typescript ignore
await mig.rollback({ to: 2 }); // revert down to v2
// { reverted: [4, 3], durationMs: 18 }

await mig.rollback(); // default: one version back (dbVersion − 1)
```

The target must be **below** the applied head. `rollback({ to: 5 })`
when the head is `3` throws a `NormMigrationError`, as does a rollback
whose intermediate snapshot file has gone missing.

Each reverted version runs under the same per-dialect atomicity rules as
[`apply()`](#what-happens-when-a-statement-fails-halfway): atomic on
Postgres/SQLite, checkpoint-resumable on MariaDB/Mongo.

### `history()`

Returns the applied migrations, **newest first**.

```typescript ignore
const hist = await mig.history();
for (const h of hist) {
  console.log(h.version, h.appliedAt, h.appliedBy, `${h.durationMs}ms`);
}
// [{ version: 3, hash: '…', appliedAt: '2026-…', appliedBy: 'ci', durationMs: 12 }, …]
```

### `renderPlans()`

Regenerates the `000N.<dialect>.sql` artifacts for **every** snapshot on
disk. Use it after hand-editing definitions, or to repair an artifact
that went missing or was tampered with (`apply()` refuses to run without
a matching one).

```typescript ignore
const out = await mig.renderPlans();
// [{ version: 1, files: ['…/0001.sqlite.sql', '…/0001.postgres.sql', '…/0001.maria.sql'] }, …]
```

## Reviewable stored plans

Every `snapshot()` writes one `000N.<dialect>.sql` artifact per SQL
dialect (`sqlite`, `postgres`, `maria`) next to the JSON. These are
**review material** — they go through your PR process exactly as
hand-written migrations would — and they are **enforced**.

Each artifact opens with a `plan-hash` header:

```sql
-- norm migration plan v0001 — dialect: postgres
-- plan-hash: 6f3a1c9d2b47e058
-- REVIEW ARTIFACT. apply() recomputes this dialect's plan and
-- REFUSES when its hash differs from the line above. Regenerate
-- with Migrator.renderPlans() after editing definitions.

CREATE TABLE "users" ( … );
CREATE UNIQUE INDEX "ux_users_email" ON "users" ("email_hash");
```

At apply time, the Migrator recomputes **its own dialect's** plan for
the version, hashes the executable statements (FNV-1a over the statement
list — comments excluded), and compares it to the stored header. If the
hashes differ, apply refuses:

> Plan artifact 0001.postgres.sql does not match the plan this apply
> would execute … the snapshot or artifact changed after review.

The guarantee: **what runs in production is exactly what was reviewed**,
regardless of who regenerated what in between. If the artifact is
missing, apply refuses too and points you at `renderPlans()`.

Artifacts always render with `allowDrop: true` so reviewers _see_ every
drop a version implies — this is independent of the apply-time
`allowDrop` gate. Rebuild steps render their real DDL bracket (rename
aside → create → drop aside) with the copy and verification steps shown
as comments, because those run through per-row JS, not as SQL. MongoDB
has no SQL surface, so it produces no artifacts and skips the check.

## Safety gates

Migrations are **never silent**. Every destructive or risky change is
surfaced, not skipped.

### Blocked drops

`allowDrop` defaults to `false`. Any `DROP TABLE` or `DROP COLUMN` the
plan would emit is instead collected into `blockedDrops` — as
`entity` or `entity.column` — and `apply()` **refuses** rather than
recording the version with the drop quietly skipped (which would
permanently desync the database from the snapshot chain):

```typescript ignore
const dry = await mig.apply({ dryRun: true });
// dry.plannedQueries[0].blockedDrops → ['Users.fullName']

await mig.apply();
// throws: "apply refused: drops are blocked (allowDrop: false) —
//          v3: Users.fullName. Pass allowDrop: true, or add
//          renamedFrom hints if these are renames."

await mig.apply({ allowDrop: true }); // explicit opt-in runs the drops
```

A dropped column is very often a _forgotten rename_ — hence the hint in
the message (see [Renames](#renames)).

### NOT NULL warnings

NORM never emits DDL column defaults (defaults are system-generated at
write time), so adding a `NOT NULL` column fails on a populated table.
The diff cannot know the row count, so it always **warns**:

```typescript ignore
const [step] = await mig.plan();
// step.warnings → ["Users.age: adding a NOT NULL column will fail if
//   'users' has rows — make it nullable() and backfill, then tighten…"]
```

The fix: add the column as `.nullable()`, backfill it, then tighten in a
later migration (nullability changes need PostgreSQL/MariaDB, or a
rebuild on SQLite).

### The two locks

`apply()` and `rollback()` take **two** locks so migrations can never
run concurrently:

1. A **file lock** — `migrator.lock` in the migrations directory
   (gitignore it) — serializes two processes on the _same_ host. On
   SQLite, where the database is a local file, this is the whole story.
2. A **server-side advisory lock** — `pg_advisory_lock` on PostgreSQL,
   `GET_LOCK` on MariaDB/MySQL — serializes across _machines_, so two CI
   runners deploying from different replicas cannot migrate at once.
   Dialects without one (SQLite) skip it.

The plan is computed **inside** both locks: a plan computed before
waiting on a concurrent apply would be stale by the time it ran. If the
advisory lock is already held elsewhere, apply throws rather than
blocking forever:

> Another process holds the migration advisory lock ('norm:migrator') —
> is a deploy running elsewhere?

Lock acquisition honors `lockTimeoutMs` (default 30s). **Both** locks are
released on every exit path, including that one: a host whose advisory
lock times out does not leave its `migrator.lock` behind.

#### Stale lock reclaim

`migrator.lock` carries its owner and the time it was last stamped, and a
live `apply()` re-stamps it between versions. A lock file that has gone
untouched for `lockStaleMs` (default **15 minutes**) is treated as
abandoned — a killed pod, an OOM, a `kill -9` — and the next contender
reclaims it instead of waiting forever:

```typescript ignore
const mig = new Migrator(db, {
  dir: './migrations',
  lockStaleMs: 60 * 60_000, // an hour, for very long rebuilds
  // lockStaleMs: Infinity   // never reclaim; delete by hand
});
```

Because the stamp is refreshed between versions, the TTL only has to
outlast the slowest **single** step, not the whole run. A step that
legitimately runs longer than `lockStaleMs` (a multi-hour table rebuild)
cannot refresh mid-flight — raise the value for those. A lock file
written by an older norm (bare token, no stamp) falls back to the file's
mtime.

## Renames

Renames are **hint-driven only** — the diff engine runs no heuristics,
so it never guesses that a dropped-plus-added pair is really a rename.

### Column renames

Add `renamedFrom` to the new column. The diff pairs it to the old
column and emits a `RENAME COLUMN` (data survives) instead of a
drop-plus-add:

```typescript
import { Column, Entity } from '@tundralibs/norm';

const Users = Entity('users', {
  id: Column.integer(),
  fullName: Column.varchar(120).nullable().renamedFrom('displayName'),
}, { pk: ['id'] });
```

```typescript ignore
const [step] = await mig.plan();
// the ALTER carries: renameColumns: { displayName: 'fullName' }
```

### Table renames

An entity's **registry key is its identity.** Change only the physical
table name under a stable key and the diff recognizes a rename with **no
hint required** — it emits `RENAME TO` and re-creates any indexes whose
names embed the table name:

```typescript
import { Column, Entity } from '@tundralibs/norm';

// key stays 'Folks'; physical name folks → people
const Folks = Entity('people', {
  id: Column.integer(),
  tag: Column.varchar(20).nullable(),
}, { pk: ['id'], index: { byTag: ['tag'] } });
// plan: ALTER TABLE folks RENAME TO people;
//       DROP INDEX ix_folks_byTag; CREATE INDEX ix_people_byTag …
```

If instead you rename the _entity key_ but keep the same physical table,
the Migrator matches the two by physical identity and it costs **zero
DDL** — a pure registry re-key. Use `renamedFrom` on the entity when the
physical table name changes _and_ you cannot rely on a stable key.

## The rebuild engine

Some changes cannot be expressed as an in-place `ALTER`. For those, the
Migrator emits a composite **`REBUILD_TABLE`** action. Two categories
trigger it:

1. **On every dialect** — a **crypto-marker flip** (`encrypt`/`hash`
   turned on or off), because the _data itself_ must be rewritten
   (decrypt / re-encrypt / backfill digest siblings).
2. **On dialects without in-place ALTER (SQLite)** — type, nullability,
   primary-key, or foreign-key changes. Primary-key changes force a
   rebuild on **all** dialects.

The rebuild runs as an ordered sequence, keeping the original data safe
until the very end:

```
drop old indexes
  → rename table aside  (<name>__pre_migrate)
  → create the new shape (+ its indexes)
  → copy rows
  → verify row counts   (copied === original, else throw)
  → drop the aside table
```

The **copy** step has two forms:

- **Structural** (no crypto change) — one `INSERT … SELECT` copies every
  column pair in a single statement.
- **Crypto-transforming** — rows are streamed through JS in pages:
  decrypt what _was_ encrypted, encrypt what _is_, and backfill
  `<col>_hash` digest siblings from the recovered plaintext. This is
  **chunked** by `rebuildChunkSize` (default 500) and paged in primary-key
  order, so a multi-million-row table never materializes in memory:

```typescript ignore
const mig = new Migrator(db, {
  dir: './migrations',
  rebuildChunkSize: 1000, // rows per page/INSERT during a crypto rebuild
});
```

(A non-positive `rebuildChunkSize` is floored to 1 — a zero-row page
would never advance the copy — while a non-finite value (`NaN`/`Infinity`)
falls back to the default 500.)

A crypto-transforming rebuild rewrites encrypted data, so a `secret`
must be configured on the `Norm` instance — the rebuild throws if it is
absent or empty.

The row-count **verification** runs before the aside table is dropped;
if the counts disagree, the rebuild throws and leaves the original in
place as `<name>__pre_migrate` for recovery.

### Caveats

- **MariaDB is not crash-safe here.** MariaDB/MySQL implicitly commit on
  DDL, so a crash mid-rebuild leaves `<name>__pre_migrate` behind. That
  is deliberate — the _next_ apply fails loudly on the rename collision
  rather than guessing, and you recover the aside table manually.
- **Digest-algorithm changes are rejected.** Changing a one-way digest's
  algorithm (e.g. `Column.hash('SHA-256')` → `Column.hash('SHA-512')`)
  throws at diff time — a one-way digest has no plaintext to re-digest
  from. Add a new column and backfill from source data instead.

## Foreign key referential actions

`onDelete` and `onUpdate` declared on a foreign key are physical facts:
they participate in the drift hash and are emitted into the generated
DDL — inline in `CREATE TABLE` on a fresh table, or as an
`ADD CONSTRAINT` when added to an existing one.

```typescript
import { Column, Entity } from '@tundralibs/norm';

const Profiles = Entity('profiles', {
  userId: Column.integer(),
}, {
  pk: ['userId'],
  fk: {
    User: {
      model: 'Users', // the registry key, never a table name
      on: { userId: 'id' },
      onDelete: 'CASCADE',
      onUpdate: 'NO_ACTION',
    },
  },
});
// Generated DDL (all three SQL dialects) includes:
//   … REFERENCES users (id) ON DELETE CASCADE ON UPDATE NO ACTION
```

Because the actions are hashed, changing _only_ an action (e.g.
`CASCADE` → `RESTRICT`) still moves the drift hash and produces a new
migration.

## Dialect notes

| Concern              | PostgreSQL | MariaDB/MySQL | SQLite | MongoDB |
| -------------------- | ---------- | ------------- | ------ | ------- |
| In-place ALTER       | ✅         | ✅            | ❌¹    | —       |
| Table rebuild engine | crypto²    | crypto²       | ✅     | —       |
| Advisory lock        | ✅         | ✅            | ❌³    | —       |
| Transactional DDL    | ✅         | ❌⁷           | ✅     | ❌⁷     |
| Plan artifacts       | ✅         | ✅            | ✅     | ❌⁴     |
| Named `dbSchema`     | ✅⁶        | ✅⁶           | ✅⁶    | —       |
| Migrator used at all | ✅         | ✅            | ✅     | ⚠️⁵     |

¹ SQLite cannot alter column types, nullability, primary keys, or
foreign keys in place, so those changes go through the rebuild engine.
² PostgreSQL and MariaDB alter structural changes in place; they only
rebuild for crypto-marker flips (a data rewrite). ³ SQLite is a local
file — the `migrator.lock` file lock is sufficient. ⁴ MongoDB has no SQL
surface, so no reviewable `.sql` is rendered and the artifact check is
skipped. ⁵ **MongoDB is schemaless** — the Migrator does not own its
schema. Create indexes directly against the collection; do not run the
Migrator against a Mongo engine. ⁶ An entity's `dbSchema` names a real
namespace the Migrator provisions **before** any table placed in it:
`CREATE SCHEMA` on PostgreSQL, `CREATE DATABASE` on MariaDB/MySQL (where
a schema _is_ a database), and — SQLite having no schemas —
`ATTACH DATABASE '<schema>.db' AS "<schema>"`, one file per schema
resolved relative to the engine's directory. ⁷ MariaDB/MySQL implicitly
COMMIT on every DDL statement and Mongo has no transaction surface, so a
version's plan cannot be atomic there — `apply()` checkpoints per action
and resumes on retry instead. See
[What happens when a statement fails halfway](#what-happens-when-a-statement-fails-halfway).

## API reference

```typescript ignore
new Migrator(db: object, options: {
  dir: string;              // migrations directory (snapshots + lock)
  rebuildChunkSize?: number; // rows per page in a crypto rebuild (500)
  renderSql?: boolean;      // write reviewable .sql artifacts (false)
  lockStaleMs?: number;     // abandoned-lock reclaim age (900_000)
  transactionTimeoutMs?: number; // per-version tx cap, Postgres/SQLite
                                 // (0 = disarmed, the default)
});

snapshot(): Promise<{ version: number; path: string; written: boolean }>;

status(): Promise<{
  dbVersion: number;
  fsVersion: number;
  pending: ReadonlyArray<number>;
  hashOk: boolean;
}>;

plan(opts?: { allowDrop?: boolean }): Promise<Array<{
  version: number;
  queries: ReadonlyArray<MigrationAction>;
  blockedDrops: ReadonlyArray<string>;
  warnings: ReadonlyArray<string>;
}>>;

apply(opts?: {
  allowDrop?: boolean;   // default false
  appliedBy?: string;    // default $USER / $USERNAME
  lockTimeoutMs?: number; // default 30_000
  dryRun?: boolean;
}): Promise<{
  applied: ReadonlyArray<number>;
  durationMs: number;
  plannedQueries?: ReadonlyArray<PlannedStep>; // dryRun only
}>;

rollback(opts?: { to?: number; lockTimeoutMs?: number }): Promise<{
  reverted: ReadonlyArray<number>;
  durationMs: number;
}>;

history(): Promise<Array<{
  version: number;
  hash: string;
  appliedAt: string;
  appliedBy: string | null;
  durationMs: number | null;
}>>;

renderPlans(): Promise<ReadonlyArray<{
  version: number;
  files: ReadonlyArray<string>;
}>>;
```

Every failure surfaces as a `NormMigrationError` (from
`@tundralibs/norm/errors`), carrying the directory and version in
context.

## Related documentation

- [Schema definition](NORM-Schema.md) — columns, entities, relations,
  `renamedFrom`, and the crypto markers migrations diff on.
- [Security](NORM-Security.md) — encryption and digest siblings, whose
  flips drive the rebuild engine.
- [Querying](NORM-Querying.md) — the typed read/write surface the
  migrated schema serves.

---

[← Back to NORM](../README.md)
