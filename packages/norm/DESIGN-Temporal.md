# Temporal & audit tables — design

> **Status:** BOTH features BUILT (uncommitted) + live-tested on all 4
> engines (Postgres/MariaDB/SQLite/MongoDB) + an adversarial review
> pass (temporal's write-verb guards hardened: `update`/`upsert`/
> `truncate` all disabled, not just `delete`).
>
> **Created:** 2026-08-23 · **Revised:** 2026-08-24 (audit built; two
> features split; reads are plain column filters; Mongo/edge
> best-effort)

## Build status (2026-08-24)

**Live-verified on Postgres, MariaDB, SQLite, and MongoDB** (`tests/
temporal-live.test.ts` — supersede timeline, `@AsOf`, `update`→insert,
`delete` disabled, future-scheduling, past-rejection). Live testing caught
two real bugs the mock/SQLite tests missed: (1) storing dates as ISO
strings broke MariaDB (datetime format) and MongoDB (type) — fixed by
setting **`Date` values** and letting each driver format them; (2) the 2099
sentinel overflowed MariaDB's `TIMESTAMP` (2038 cap) — fixed by injecting
**`DATETIME`** (→ `DATETIME(6)` on Maria, `TIMESTAMP` on PG, `TEXT` on
SQLite). On Mongo the supersede is best-effort (no transactions, no unique).

**Temporal — built and green** (mock + live 4-engine, Deno/Bun/Node):
config + `EffectiveFrom`/`EffectiveTo` injection + `UNIQUE(key…,
EffectiveTo)` + `insert`=supersede (close-current + insert-new, in a
transaction; best-effort on no-tx engines) + `update`→insert + `delete`
disabled + monotonic cutover clock (strictly-increasing periods) +
**`EffectiveFrom`/`EffectiveTo` first-class in the TYPE** (`RowOf`/
`FilterOf`; excluded from `InsertOf`/`UpdateOf`; custom names flow via
`const` inference) + a **virtual `@AsOf` filter column** (`asOfColumn`,
default `AsOf`; filter-only — not stored, excluded from `RowOf`;
`find({ '@AsOf': T })` rewrites to `from <= T AND to > T`). Files:
`definition/entity.ts` (options + `buildTemporal` + `_TemporalColumnsOf` /
`_AsOfName`), `definition/infer.ts` (`_AsOfKeys` exclusion), `compile.ts`
(`CompiledEntity.temporal`), `Repo.ts` (`__temporalSupersede`, monotonic
clock, `@AsOf` rewrite in `__rewriteWhereNode`), `temporal.test.ts`. Plus
**caller-supplied `EffectiveFrom`**: `insert`/`update` may carry it —
optional-on-insert in the type, `EffectiveTo` stays locked; the supersede
SPLITS the version in force at that instant (via `@AsOf`), inheriting its
end (`__versionAt` + `__temporalCutover`); validated **not in the past**
(±1s skew, `TEMPORAL_PAST`) and strictly after the split version's start
(`TEMPORAL_OVERLAP`). One unified path (default = split at "now"), so
future-scheduling falls out.

**Post-build adversarial review (2026-08-24):** `update()` originally
routed a partial payload straight to `insert()`, silently dropping any
column the caller didn't repeat — now **disabled** (throws
`NormUnsupportedError`), like `delete()`. `upsert()` and `truncate()`
had NO temporal guard at all (upsert bypassed the supersede entirely;
truncate would have erased the whole history) — both now disabled too.
A temporal table is insert-only: `insert()` is the only write verb, and
it already supersedes.

**Audit — built and live-tested on all 4 engines** (`audit.test.ts` +
`tests/audit-live.test.ts`): the source table's write verbs are
UNCHANGED; norm mirrors every insert/update/upsert/delete/truncate into
the generated replica via the same supersede primitive (delete/truncate
→ close, no successor). New `type: 'AUDIT'` definition kind (a real,
physical, FK-less table — `RepoFor`/`Norm.repo()` dispatch it to
`ReadRepo`, same as VIEW); `Entity()` builds the whole replica eagerly
(it needs nothing beyond the source's own columns), `Schema()`
relocates it into the registry and fills in `auditOf`. Live testing
again caught engine-specific bugs mocks/SQLite missed: MongoDB's raw
insert result carries its own `_id` field alongside norm's declared
columns, which leaked into the replica INSERT until the mirror path
started filtering to the replica's OWN declared column set. Files:
`definition/entity.ts` (`AuditTableOptions` + `buildAudit` +
`AuditDefinition` + `_AuditColumnsOf`), `definition/schema.ts`
(`injectAuditReplicas` + `_AuditEntitiesOf<M>` type-level injection),
`compile.ts` (`CompiledEntity.audit`; the replica's OWN
`CompiledEntity.temporal` is reused read-side only — same `@AsOf`
mechanics, never a write path since the replica is never a `Repo`),
`Repo.ts` (`_auditMirror`, `_withTx`, `_pkValuesOf`), `asserts/
registry.ts` (AUDIT rejected as an FK target — a row is a version, not
a stable identity).

**Deferred (follow-ups, in priority order):**

1. **Migrator** — the injected temporal columns/unique and the
   generated audit replica all live on the emitted def, so the
   Migrator's existing snapshot-diff machinery already picks them up
   with zero special-casing (verified: `buildSnapshot()` captures the
   AUDIT def as `kind: 'TABLE'`, no `foreignKeys`) — the FULL
   file-backed `Migrator.apply()` flow itself is still unexercised
   end-to-end for either feature (both live tests hand-roll DDL).
2. **Retention/pruning** of old versions — out of scope for v1, both
   features.

Two related, **separate** features that share one effective-dating
mechanism:

- **Temporal table** — the **main table itself** keeps every version.
  Its write semantics change (insert = supersede; no update-in-place, no
  delete).
- **Audit table** — the main table stays a **normal** table; norm
  generates a **replica** that records every version. The main table's
  write semantics are unchanged.

Neither has an **actor / who-changed-it** concept — the data is the
record. (`CreatedBy` / `CreatedDate` in examples are ordinary app-owned
columns.)

**A single entity is one or the other, never both.** A temporal table is
already its own complete history, so `audit` on a `temporal` entity would
just version the versions — norm rejects the combination at compose time
(`.use()`).

## Shared mechanics: effective-dating

A versioned row carries two auto-injected timestamp columns,
`EffectiveFrom` and `EffectiveTo` (names configurable). The **current**
version is the one whose `EffectiveTo` is the far-future **sentinel**
(`2099-12-31 23:59:59.999`, value configurable — decided over `NULL`).

The sentinel is load-bearing, not cosmetic:

- A plain cross-dialect `UNIQUE(<key…>, EffectiveTo)` enforces **at most
  one current version per key** — on every dialect, MariaDB included
  (which has no partial indexes). `NULL` can't (databases allow multiple
  NULLs in a unique index).
- It is the **concurrency guard**: the supersede below is check-then-act,
  and the unique constraint makes two racing supersedes safe — the second
  fails the constraint and retries.

**Supersede** (the write primitive), keyed by the version key:

1. Find the current version (`EffectiveTo = sentinel`).
2. If one exists → **close** it: `EffectiveTo = cutover`.
3. **Insert** the new version: `EffectiveFrom = cutover`,
   `EffectiveTo = sentinel`; its pk is generated by the **pk column's own
   configured default** (ULID/UUID/…), exactly like a normal insert.

`cutover` defaults to now. A caller may supply `EffectiveFrom = F` to use
`F` as the cutover; `F` must be at/after the current version's
`EffectiveFrom` (future-dating is fine), and is **rejected** if it lands
inside a closed historical period — the timeline only appends at the open
end. `EffectiveTo` is always norm-managed.

**Reads are plain column filters — no magic.** `EffectiveFrom` /
`EffectiveTo` are ordinary filterable columns; norm does **not** inject a
current-version predicate. So:

- `find({ key })` returns **all** versions.
- `find({ '@key': ..., '@EffectiveTo': sentinel })` returns the current
  version.
- point-in-time is an ordinary range filter on `EffectiveFrom` /
  `EffectiveTo` — **or**, more fluently, the virtual **`@AsOf`** filter
  column: `find({ '@key': ..., '@AsOf': T })` rewrites to
  `EffectiveFrom <= T AND EffectiveTo > T` (pass `new Date()` for the
  current version). `@AsOf` is filter-only — it is never stored or read.

## Feature 1 — Temporal table (the main table is versioned)

Declare a **temporal key** (one or more columns, **not** the pk) that
identifies the logical record across versions. The pk stays per-**version**
(a fresh value each insert).

```ts ignore
import { Column, Entity } from '@tundralibs/norm';

const FeeTemplates = Entity('fee_templates', {
  Id: Column.uuid().default({ $$_expression: 'UUID' }), // pk per VERSION
  Name: Column.varchar(30), // ← temporal key (the logical identity)
  Template: Column.varchar(1000),
  Fees: Column.numeric(10, 2),
  Tax: Column.numeric(10, 2),
  CreatedBy: Column.uuid(), // ordinary column (FK below)
  CreatedDate: Column.timestamp(),
}, {
  pk: ['Id'],
  fk: { Creator: { model: 'Users', on: { CreatedBy: 'id' } } },
  temporal: {
    key: ['Name'], // required — the logical identity
    // norm generates EffectiveFrom / EffectiveTo; the names are overridable:
    EffectiveFromColumn: 'EffectiveFrom', // optional (this is the default)
    EffectiveToColumn: 'EffectiveTo', // optional (this is the default)
  },
});
```

The pk generator is whatever you set on the column — swap
`.default({ $$_expression: 'UUID' })` for `Column.varchar(26).default(() =>
ulid())` (from `@tundralibs/id`) to key versions by ULID instead.

Operations:

- **`insert`** → supersede (the primitive above) — the ONLY write verb.
- **`update` / `upsert` / `truncate` / `delete`** → all **disabled**
  (throw `NormUnsupportedError`). Fields are never mutated in place, and
  routing a PARTIAL `update()` payload to `insert()` would silently
  drop every column the caller didn't repeat — so a new version always
  comes from a full `insert()` call. History is never removed or
  bulk-erased. (Retention/pruning is a separate later concern.)

Example: `find({ Name: 'Gold' })` lists every version of the Gold
template; `find({ Name: 'Gold', EffectiveTo: sentinel })` is the one in
force now.

## Feature 2 — Audit table (a versioned replica)

The main table is a **normal** table with normal insert/update/delete.
Enabling audit makes norm generate a **replica** table:

- all of the main table's columns, **plus** `EffectiveFrom` /
  `EffectiveTo`, **plus a new surrogate pk** — a full `Column` builder you
  supply (`AuditPK`), so you control its type, length, and generator;
  defaults to a **ULID** (lexically sortable → better index / range-scan /
  search than a random UUID);
- the main table's **PK becomes the replica's version key**.

```ts ignore
import { Column, Entity } from '@tundralibs/norm';
import { ulid } from '@tundralibs/id';

const Users = Entity('users', {
  id: Column.uuid().default({ $$_expression: 'UUID' }),
  name: Column.varchar(40),
  email: Column.varchar(255).encrypt().hash(), // ciphertext here AND in the replica
}, {
  pk: ['id'],
  audit: {
    name: 'UserAudit', // registry name of the generated audit entity → db.repo('UserAudit')
    AuditPK: Column.varchar(30).default(() => ulid()), // optional — full Column control; default ULID
  },
});
// Generated audit entity 'UserAudit' (table `user_audit`):
//   auditId        (AuditPK)          -- one per audit row (here: ULID)
//   id             (= version key)    -- the main users.id
//   name, email                       -- mirrored (email stays ciphertext)
//   EffectiveFrom, EffectiveTo
```

On every write to the main table norm mirrors it into the replica via the
supersede primitive keyed by the main pk:

- main **insert** → open a replica version.
- main **update** → close the current replica version, open a new one with
  the new values.
- main **delete** → close the current replica version (no successor).

The main table is untouched, so its pk, FKs, relations, and existing
queries all behave exactly as before.

### Visibility — the audit entity is a read-only repo

norm registers the generated entity under its `name`, so it is queryable
with the **full typed surface** (filters, projections, decryption of
encrypted columns, scope):

```ts ignore
await db.repo('UserAudit').find({ id, EffectiveTo: sentinel }); // current
await db.repo('UserAudit').find({ id }); // every version of that record
```

It is **read-only** — a `ReadRepo` exposing `find` / `findOne` / `count` /
`getByPK` only, no `insert` / `update` / `delete`. norm owns the audit
writes (they are driven by the main-table writes); a caller writing to the
replica directly would corrupt the trail.

_Implementation note:_ because the entity is synthesized from the source
(not hand-declared in `Schema`), norm must thread it into the handle's
type so `repo('UserAudit')` type-checks — real TypeScript work, but the
runtime side is just another registered read-only entity.

## Cross-dialect

- **Reads** are plain `WHERE` → every engine.
- **Writes** are a read + close + insert (temporal) or an extra replica
  write (audit). On **SQL + pooled** engines these run in **one
  transaction** (atomic). On **MongoDB** (no transactions) and the **edge
  HTTP** engines (`neon`/`turso`/`d1`, one-shot) the steps run **without a
  transaction** — best-effort, and a crash between them can leave an
  inconsistent version state. This limitation is **documented on the
  feature**, not hidden.
- No native DB temporal (MariaDB `SYSTEM VERSIONING`) is used — norm's own
  effective-dating behaves identically everywhere.

## Encryption interplay (a strength)

Versioned rows (temporal table or audit replica) store the source's
`.encrypt()` columns as **ciphertext** — never plaintext at rest, unlike a
trigger-based audit. Old versions decrypt through the normal read path,
and each carries its **key-id envelope**, so versions written under an old
key still decrypt after `rotateKey()` (or degrade per the
`onDecryptFailure` policy).

## Migrations

- **Temporal**: inject `EffectiveFrom` / `EffectiveTo`; emit
  `UNIQUE(<temporal key…>, EffectiveTo)`; index the range columns.
- **Audit**: generate the replica table (main columns + time columns + new
  pk; main pk as the version key + `UNIQUE(<main pk…>, EffectiveTo)`) and
  keep its shape **in sync** on every ALTER to the main table.

## Interactions with existing features

- **Read cache** — a past-instant read is immutable (history never
  changes) → long-TTL cacheable; current reads follow write-invalidation.
- **Scope (multi-tenant)** — versions carry the scope columns; scoped reads
  filter them like any read.
- **Soft delete** — temporal/audit **subsume** the data-recovery use case
  (superseded versions are retained and restorable) without a `deleted_at`
  flag.
- **Hooks** — `beforeInsert` / `beforeUpdate` / `beforeDelete` still fire.

## Configuration surface (shipped)

```ts ignore
// Feature 1 — the main table is versioned:
temporal?: {
  key: readonly string[]; // temporal-key columns (not the pk) — required
  EffectiveFromColumn?: string; // default 'EffectiveFrom'
  EffectiveToColumn?: string; // default 'EffectiveTo'
  asOfColumn?: string; // default 'AsOf'
  sentinel?: string; // default '2099-12-31T23:59:59.999Z'
};

// Feature 2 — a generated versioned replica entity:
audit?: {
  name: string; // required — registry name of the generated entity, db.repo(name)
  AuditPK?: AnyColumnBuilder; // the replica pk column (full Column control); default ULID varchar(26)
  EffectiveFromColumn?: string; // default 'EffectiveFrom'
  EffectiveToColumn?: string; // default 'EffectiveTo'
  asOfColumn?: string; // default 'AsOf'
  sentinel?: string;
};
```

`AuditPK` being a `Column` builder (not a `{type}` enum) means the audit
key is defined exactly like any other norm column — its own type, length,
generator, even `.comment()` — with a ULID `varchar(26)` as the default
(and **must** declare `.default(...)` — a caller never supplies it).
The boolean shorthand (`audit: true`) from the original proposal was
DROPPED before building: `Entity()` doesn't know its own future
registry key (that's assigned later, as a `Schema({...})` object
property), so `<Key>Audit`-style auto-naming would need to be resolved
at `Schema()` time instead of `Entity()` time — real complexity for a
convenience that just saves typing `{ name: 'XAudit' }`. `name` is
always explicit; the physical replica table name is auto-derived from
it (snake_case) with no separate override.

## Still open / minor

- **The full file-backed `Migrator.apply()` flow** is unexercised
  end-to-end for either feature — both live tests hand-roll DDL, and
  only `buildSnapshot()` (the snapshot-diff machinery's own DDL-shape
  extractor) has been verified directly against a live-built registry.
- **Retention / pruning** of old versions — out of scope for v1, both
  features.

## Non-goals (v1)

- **No actor / who-changed-it** — data history only.
- **No application valid-time / bitemporal** — one time axis.
- **No mid-timeline inserts** — supersede at the open end only.
- **No transactional guarantee on Mongo / edge** — documented, not
  silently assumed.
