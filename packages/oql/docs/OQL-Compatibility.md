# OQL Dialect Compatibility

Database compatibility matrix and feature support across dialects.

![Deno](https://img.shields.io/badge/Deno-000000?logo=deno)
![Bun](https://img.shields.io/badge/Bun-f9f1e1?logo=bun)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white)

## Overview

OQL aims for a uniform query surface across PostgreSQL, MariaDB/MySQL,
SQLite, and MongoDB. Most queries translate identically; a handful of
features have to be emulated, degraded, or rejected per dialect. This
document is the single reference for those divergences — in particular
the cases where the translator silently degrades rather than throwing.

The general philosophy is **graceful degradation over hard failure**:
when a feature has no native equivalent, we either passthrough an
acceptable substitute, fall back to a related construct, or no-op. We
only throw when there is no reasonable substitute and silently emitting
something else would mislead callers.

## DDL

### Schemas

| Dialect  | Behaviour                                                                                                                                                                                                                                                                                                                    |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Postgres | Native (`CREATE SCHEMA` / `DROP SCHEMA`).                                                                                                                                                                                                                                                                                    |
| MariaDB  | Mapped to databases (`CREATE DATABASE` / `DROP DATABASE`).                                                                                                                                                                                                                                                                   |
| SQLite   | No schema object — `CREATE_SCHEMA` / `DROP_SCHEMA` **throw**. `schema` on any other query (CREATE_TABLE, SELECT, CREATE_INDEX, …) is instead folded into the physical identifier as a `<schema>_<name>` prefix, so every "schema" lives in the same physical file and cross-schema foreign keys are enforced like any other. |
| MongoDB  | `CREATE_SCHEMA` **throws** (Mongo creates DBs implicitly on first write); `DROP_SCHEMA` emits `dropDatabase`.                                                                                                                                                                                                                |

### Materialized views

| Dialect  | Behaviour                                                                                  |
| -------- | ------------------------------------------------------------------------------------------ |
| Postgres | Native (`CREATE MATERIALIZED VIEW` + `REFRESH MATERIALIZED VIEW [CONCURRENTLY]`).          |
| MariaDB  | **Falls back to a regular view.** `REFRESH_MATERIALIZED_VIEW` emits the no-op `SELECT 1`.  |
| SQLite   | **Falls back to a regular view.** `REFRESH_MATERIALIZED_VIEW` emits the no-op `SELECT 1`.  |
| MongoDB  | **Falls back to a regular Mongo view.** `REFRESH_MATERIALIZED_VIEW` emits a `noop` action. |

The fallback is silent because callers can rely on `REFRESH` always
being safe to invoke — it just does nothing where there's nothing to
refresh. If you need actual materialization on a non-Postgres dialect,
build a periodically-rewritten table outside OQL.

Dropping: pass `materialized: true` on `DROP_VIEW` when the target was
created materialized — Postgres emits `DROP MATERIALIZED VIEW` (plain
`DROP VIEW` refuses matviews there); emulating dialects ignore the
flag.

On MongoDB a view's body is the source SELECT expressed as an
aggregation pipeline. A plain-`find` source SELECT is expanded to the
equivalent `$match` → `$project` → `$sort` → `$skip` → `$limit` stages
(the same expansion `INSERT_FROM_QUERY` uses), so the view preserves the
source SELECT's WHERE / projection / sort / limit / skip and matches the
`CREATE VIEW … SELECT <cols> … ORDER BY … LIMIT … OFFSET …` the SQL
dialects emit — in particular, columns the SELECT projects away are **not**
exposed by the view. `CREATE_VIEW` and `ALTER_VIEW` (emulated as
`DROP VIEW` + `CREATE VIEW`) share this single expansion path.

### TRUNCATE

| Dialect  | Behaviour                                                            |
| -------- | -------------------------------------------------------------------- |
| Postgres | Native (`TRUNCATE`, with optional `CASCADE`).                        |
| MariaDB  | Native (`TRUNCATE TABLE` — no `CASCADE`; users must drop FKs first). |
| SQLite   | Emulated as `DELETE FROM`.                                           |
| MongoDB  | Emulated as `delete` with empty filter.                              |

### Indexes

| Feature               | Postgres | MariaDB                          | SQLite              | MongoDB                        |
| --------------------- | -------- | -------------------------------- | ------------------- | ------------------------------ |
| Unique                | ✅       | ✅                               | ✅                  | ✅                             |
| Method (BTREE/HASH)   | ✅       | ✅ `USING BTREE`/`USING HASH`    | ✅ (advisory)       | n/a                            |
| Method FULLTEXT       | dropped  | ✅ `CREATE FULLTEXT INDEX`       | dropped             | n/a                            |
| Partial (`where`)     | ✅       | ❌ throws                        | ✅                  | ✅ (`partialFilterExpression`) |
| `DROP INDEX ifExists` | ✅       | ❌ silently dropped              | ✅                  | n/a                            |
| `DROP INDEX cascade`  | ✅       | ❌ silently dropped (no concept) | ❌ silently dropped | n/a                            |

**MariaDB DROP INDEX caveat**: `ifExists` and `cascade` are silently
dropped because MariaDB's `DROP INDEX` grammar does not accept them.
Callers passing `ifExists: true` get a hard error on a missing index
rather than a no-op — wrap in a try/catch if you need
fire-and-forget semantics.

**Partial-index `where` predicates have literals inlined**: Postgres
and SQLite reject parameter placeholders inside `CREATE INDEX … WHERE`
predicates ("there is no parameter $1" on Postgres). The translator
inlines literals into the predicate body the same way it does for
view definitions, and the `CREATE_INDEX` `TranslatedQuery` returns
`params: {}`. Quote escaping and non-finite-number rejection follow
the same rules as `CREATE_VIEW`.

**`method: 'FULLTEXT'` is an index KIND, not a `USING` clause**: only
MariaDB honours it, emitting `CREATE FULLTEXT INDEX … ON …` (its
`index_type` grammar accepts only `USING {BTREE | HASH}`, so `USING
FULLTEXT` is a syntax error). `BTREE` / `HASH` still render as a trailing
`USING <method>` clause. Postgres and SQLite have no full-text index
method here and drop the flag (no `USING` emitted).

### ALTER TABLE

Per-operation emission. The four column-shape ops (`addColumns`,
`dropColumns`, `renameColumns`, `renameTo`) translate on every SQL
dialect; the in-place **column redefinition** and **foreign-key** ops
diverge.

| Operation                                | Postgres                                                   | MariaDB                             | SQLite                              | MongoDB               |
| ---------------------------------------- | ---------------------------------------------------------- | ----------------------------------- | ----------------------------------- | --------------------- |
| addColumns / dropColumns / renameColumns | ✅ `ADD` / `DROP` / `RENAME COLUMN`                        | ✅ `ADD` / `DROP` / `RENAME COLUMN` | ✅ `ADD` / `DROP` / `RENAME COLUMN` | no-op (schemaless)    |
| renameTo                                 | ✅ `RENAME TO`                                             | ✅ `RENAME TO`                      | ✅ `RENAME TO`                      | ✅ `renameCollection` |
| alterColumns                             | ✅ `ALTER COLUMN … TYPE … USING` + `SET` / `DROP NOT NULL` | ✅ `MODIFY COLUMN`                  | ❌ throws                           | no-op                 |
| addForeignKeys                           | ✅ `ADD CONSTRAINT … FOREIGN KEY`                          | ✅ `ADD CONSTRAINT … FOREIGN KEY`   | ❌ throws                           | no-op                 |
| dropForeignKeys                          | ✅ `DROP CONSTRAINT`                                       | ✅ `DROP FOREIGN KEY`               | ❌ throws                           | no-op                 |

- **Postgres** emits one statement per action. `alterColumns` renders a
  `TYPE` change with an explicit `USING <col>::<type>` cast (Postgres
  refuses many implicit conversions without it), then a **separate**
  `SET NOT NULL` / `DROP NOT NULL` driven by the `nullable` flag —
  omitted attributes are **preserved**.
- **MariaDB** uses `MODIFY COLUMN`, which takes the **full** new
  definition (type + nullability in one go) and re-derives the column
  from it. `dropForeignKeys` uses MariaDB's `DROP FOREIGN KEY` grammar
  rather than Postgres's `DROP CONSTRAINT`.
- **SQLite** **throws** `DialectUnsupportedError` for `alterColumns`
  (as `ALTER COLUMN`) and for `addForeignKeys` / `dropForeignKeys`
  (as `ALTER CONSTRAINT`): it can neither redefine a column in place nor
  touch constraints on an existing table — both need the full
  table-rebuild dance (create new shape, copy, drop, rename). It refuses
  loudly instead of emitting SQL that silently does nothing.
- **MongoDB** honours only `renameTo` (`renameCollection`); every
  column/constraint op is a no-op because collections are schemaless.

When a `renameTo` is combined with a `schema`, **MariaDB qualifies the
target with that schema** (`ALTER TABLE \`s\`.\`t\` RENAME TO \`s\`.\`t2\``,
and`RENAME TABLE \`s\`.\`v\` TO \`s\`.\`v2\``for`ALTER_VIEW`). In
MariaDB/MySQL an unqualified`RENAME` target resolves against the session
**default database**, so a bare target would silently relocate the object
into the default DB (or fail 1046). Postgres and SQLite keep the object in
its schema by grammar and emit an unqualified target.

Because MariaDB's `MODIFY COLUMN` re-derives the whole column from the
supplied definition — a dropped `nullable` silently clears `NOT NULL` —
while Postgres preserves omitted attributes, `alterColumns` entries
**must set `nullable` explicitly**; the assert layer enforces this (see
[OQL Asserts](../asserts/OQL-Asserts.md)).

### Temporal precision (fractional seconds)

MariaDB now maps bare `TIME` / `DATETIME` / `TIMESTAMP` to
`TIME(6)` / `DATETIME(6)` / `TIMESTAMP(6)`. Without the explicit `(6)`,
MariaDB truncates to whole seconds — two writes in the same second
compare equal, breaking monotonic audit columns — and diverges from the
sub-second precision the other dialects already keep.

| Dialect  | `TIME` / `DATETIME` / `TIMESTAMP` emission | Sub-second precision                    |
| -------- | ------------------------------------------ | --------------------------------------- |
| Postgres | `TIME` / `TIMESTAMP` / `TIMESTAMP`         | microseconds (6 digits, native default) |
| MariaDB  | `TIME(6)` / `DATETIME(6)` / `TIMESTAMP(6)` | microseconds (6 digits)                 |
| SQLite   | `TEXT` (ISO-8601 string)                   | milliseconds (3 digits)                 |
| MongoDB  | n/a (schemaless; BSON `Date`)              | milliseconds                            |

The `(6)` alignment means a `TIMESTAMP` round-trips at **microsecond**
precision on both Postgres and MariaDB, matching PG's micros; SQLite and
MongoDB retain **milliseconds**. Anything finer than a millisecond is
therefore portable only between Postgres and MariaDB.

## DML

### RETURNING

OQL surfaces the inserted/upserted rows in `result.data` for `INSERT`
and `UPSERT` only — never on `UPDATE` or `DELETE`. This is a
**deliberate cross-dialect rule**, not a limitation: it keeps the
public contract identical across engines and forces callers who need
post-mutation rows to do an explicit re-select.

How each dialect actually delivers those rows differs, but the
caller-facing shape is the same `EngineQueryResult.data` on all of them:

| Operation | Postgres              | MariaDB                                                     | SQLite                | MongoDB                                                        |
| --------- | --------------------- | ----------------------------------------------------------- | --------------------- | -------------------------------------------------------------- |
| INSERT    | ✅ native `RETURNING` | ✅ native `RETURNING` (10.5+)                               | ✅ native `RETURNING` | ✅ engine re-fetches by `_id` after `insertOne` / `insertMany` |
| UPSERT    | ✅ native `RETURNING` | ✅ native `RETURNING` (10.5+, on `ON DUPLICATE KEY UPDATE`) | ✅ native `RETURNING` | ✅ engine re-fetches by the upsert filter (conflict keys)      |
| UPDATE    | ❌ never emitted      | ❌ never emitted                                            | ❌ never emitted      | ❌ no re-fetch — `data` is `[]`                                |
| DELETE    | ❌ never emitted      | ❌ never emitted                                            | ❌ never emitted      | ❌ no re-fetch — `data` is `[]`                                |

**Mongo specifics**: the re-fetch is one extra round-trip after the
write — `findOne({ _id })` for single insert, `find({ _id: { $in } })`
for bulk insert, `findOne(filter)` for upsert. The wire cost is a
single command per operation; rarely material in practice, but
visible under heavy throughput. If you don't need the rows back,
prefer the lower-level `engine.insertOne(...)` / `engine.insertMany(...)`
helpers, which skip the re-fetch.

### UPSERT semantics

- **Postgres / SQLite**: `INSERT … ON CONFLICT (keys) DO UPDATE SET …`, or
  `DO NOTHING` when there is nothing to set. With `updateSet`, the target
  table is aliased so its expressions can reference the existing row
  (Postgres rejects a bare column there as ambiguous with `EXCLUDED`).
- **MariaDB**: `INSERT … ON DUPLICATE KEY UPDATE …`. When there is nothing
  to set we emit the idempotent self-assignment trick (`<key> = <key>`).
- **MongoDB**: single-row `data` emits `update` with `upsert: true`.
  With `updateSet`, or any expression value, the update is an aggregation
  pipeline that tells a new document by its missing `_id`: insert values
  apply only to the insert and `updateSet` only to a conflict, as on SQL.
  Array `data` emits a `bulkWrite` action — one `updateOne` op per row,
  applied in one round-trip. RETURNING is mirrored by a single follow-up
  `find($or: [...filters])`, so the driver makes two round-trips total
  regardless of row count. **Every conflict key must carry a concrete,
  non-null value in each data row** — the conflict keys form the
  `updateOne` match filter. A row that omits a conflict key, or supplies it
  as `undefined` or `null`, would leave the filter empty/partial or
  `{ key: null }` (the Node driver serialises `undefined` to `null`, as it
  leaves `ignoreUndefined` at its default of `false`), matching an
  arbitrary existing document — any whose key is null or absent — and
  overwriting it. Any such row **throws** `DialectUnsupportedError` rather
  than corrupt an unrelated record; the guard tests the value, not merely
  key presence. (On the SQL dialects the same row is a benign plain insert:
  the column takes DEFAULT/NULL and `ON CONFLICT` never fires.)

### Expressions on MongoDB

A classic update operator such as `$set` stores an expression value
literally, so `$$NOW` would be saved as the string `"$$NOW"`.

- **UPDATE**: when any `data` value is an expression, the update is an
  aggregation pipeline (`[{ $set: … }]`), which evaluates it. Literals in
  it are wrapped in `$literal`. Plain-value updates stay a classic `$set`.
- **INSERT**: an insert document cannot evaluate expressions. `NOW`,
  `CURRENT_TIMESTAMP(TZ)`, `CURRENT_DATE`, `CURRENT_TIME`,
  `UNIX_TIMESTAMP` and `UUID` are computed by the translator, the clock
  ones at one instant per statement. Any other expression throws
  `DialectUnsupportedError`.

### INSERT … SELECT (`INSERT_FROM_QUERY`)

Append rows produced by a SELECT into a target table.

| Dialect                     | Behaviour                                                                                |
| --------------------------- | ---------------------------------------------------------------------------------------- |
| Postgres / MariaDB / SQLite | Native `INSERT INTO <target> (<cols>) SELECT … FROM <source>` — **appends**.             |
| MongoDB                     | Aggregation over the SOURCE collection ending in `$merge` into the target — **appends**. |

**MongoDB uses `$merge`, not `$out`.** `$out` atomically _replaces_ the
entire target collection (destroying its existing data); `$merge`
appends. The emitted pipeline preserves the source SELECT's WHERE /
projection / limit / sort (a plain-`find` source is expanded to the
equivalent `$match` → `$project` → `$sort` → `$skip` → `$limit` stages),
then appends `$merge: { into, whenMatched: 'fail', whenNotMatched:
'insert' }` — `whenMatched: 'fail'` mirrors a SQL primary-key violation on
an `_id` collision.

### COUNT `having`

`having` is **not supported on `COUNT`** and is **rejected by the
validator** on every dialect: a COUNT produces a single scalar with no
GROUP BY, so there is no aggregate alias to filter on. Use a `SELECT` with
`aggregates` + `having` for post-aggregation filtering. (Previously this
threw a misleading "column not in list" error on the SQL dialects and was
silently dropped on MongoDB.)

### `limit` / `offset`

`limit` and `offset` are independent in OQL — either may be set alone.
`offset` alone is **not** portable SQL, so the translator synthesises the
row count each dialect documents for "everything from here to the end":

| Query                   | Postgres             | MariaDB                                | SQLite               | MongoDB          |
| ----------------------- | -------------------- | -------------------------------------- | -------------------- | ---------------- |
| `limit: 10`             | `LIMIT 10`           | `LIMIT 10`                             | `LIMIT 10`           | `limit`          |
| `limit: 10, offset:20`  | `LIMIT 10 OFFSET 20` | `LIMIT 10 OFFSET 20`                   | `LIMIT 10 OFFSET 20` | `limit` + `skip` |
| `offset: 20` (no limit) | `OFFSET 20`          | `LIMIT 18446744073709551615 OFFSET 20` | `LIMIT -1 OFFSET 20` | `skip`           |

Only Postgres takes `OFFSET` as a standalone clause. SQLite's grammar
accepts `OFFSET` only _inside_ a `LIMIT` clause (a negative limit means
"no upper bound"); MariaDB / MySQL reject a bare `OFFSET` and document
the max-unsigned-BIGINT row count as the workaround. The sentinel is
dialect data (`_offsetOnlyLimit`), not a rewrite of the query.

### Deduplication — SELECT `distinct` / COUNT `distinct`

| Feature                       | Postgres                   | MariaDB                      | SQLite                     | MongoDB   |
| ----------------------------- | -------------------------- | ---------------------------- | -------------------------- | --------- |
| `SELECT { distinct: true }`   | ✅ `SELECT DISTINCT`       | ✅ `SELECT DISTINCT`         | ✅ `SELECT DISTINCT`       | ❌ throws |
| `COUNT { distinct: ['col'] }` | ✅ `COUNT(DISTINCT "col")` | ✅ `COUNT(DISTINCT \`col\`)` | ✅ `COUNT(DISTINCT "col")` | ❌ throws |

- `SELECT { distinct: true }` is **rejected by the validator** when
  combined with `aggregates` or a join-alias projection (`JSON_ROW`
  auto-expand) — those trigger an automatic GROUP BY that already
  deduplicates.
- `COUNT.distinct` takes exactly **one** plain column name from
  `columns` — multi-column DISTINCT counts are not portable across
  dialects.
- MongoDB throws `DialectUnsupportedError` for both — build an
  explicit `$group` pipeline when you need Mongo-side dedup.

### `$exists` / `$nexists` filters

Correlated `EXISTS (SELECT 1 FROM <table> AS __exists__ WHERE …)` /
`NOT EXISTS (…)` subquery predicates, available anywhere a
`QueryFilter` is (SELECT/COUNT/UPDATE/DELETE `where`, nested in
`$and` / `$or`).

| Dialect  | Behaviour                                                                                    |
| -------- | -------------------------------------------------------------------------------------------- |
| Postgres | Native `EXISTS` / `NOT EXISTS`.                                                              |
| MariaDB  | Native `EXISTS` / `NOT EXISTS`.                                                              |
| SQLite   | Native `EXISTS` / `NOT EXISTS`.                                                              |
| MongoDB  | **Throws** `DialectUnsupportedError` — correlated subqueries have no Mongo find-filter form. |

Correlation goes through the `on` map only (subquery column → outer
column ref or literal); the optional `where` filters the subquery
table locally. Outer refs resolve through `__base__` when the outer
query has joins, and are qualified with the outer table's own name
otherwise, so they can never be captured by the subquery table's
scope.

## Expressions

The table below summarises the per-dialect emission. The general rule:

- **native**: dialect has a direct equivalent.
- **emulated**: emitted via a related construct (`SUBSTRING`, `CONCAT`, etc.).
- **passthrough**: no native equivalent; the input is emitted as-is so
  the query still runs (caller is responsible for any client-side work).
- **literal**: materialised at translate time (e.g. UUID generated via
  `crypto.randomUUID()` and inlined as a string literal).

| Expression            | Postgres                                                                            | MariaDB                                                | SQLite                                                           | MongoDB                                                                             |
| --------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------ | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| ADD/SUBTRACT/…        | native                                                                              | native                                                 | native                                                           | native (`$add` / `$subtract` / …)                                                   |
| POWER                 | native                                                                              | native                                                 | native (`POWER` via SQLite built-in math, default since 3.35.0)  | native (`$pow`)                                                                     |
| ROUND                 | native                                                                              | native                                                 | native                                                           | native                                                                              |
| CONCAT                | native (`\|\|`)                                                                     | native (`CONCAT`)                                      | native (`\|\|`)                                                  | native (`$concat`)                                                                  |
| TO_STRING             | native (`CAST … AS TEXT`)                                                           | native (`CAST … AS CHAR`)                              | native (`CAST … AS TEXT`)                                        | native (`$toString`)                                                                |
| COALESCE / NULLIF     | native                                                                              | native                                                 | native                                                           | native (`$ifNull` / `$cond`)                                                        |
| CASE                  | native                                                                              | native                                                 | native                                                           | native (`$switch`; `when` limited to comparison, `$in`/`$nin`, `$between`, `$null`) |
| LENGTH/LOWER/UPPER    | native                                                                              | native                                                 | native                                                           | native                                                                              |
| TRIM/LTRIM/RTRIM      | native                                                                              | native                                                 | native                                                           | native (`$trim` / `$ltrim` / `$rtrim`)                                              |
| SUBSTR                | native (`SUBSTRING`)                                                                | native (`SUBSTRING`)                                   | native (`substr`)                                                | native (`$substrCP`)                                                                |
| REPLACE               | native                                                                              | native                                                 | native                                                           | native (`$replaceAll`)                                                              |
| LPAD / RPAD           | native                                                                              | native                                                 | emulated (`printf` + `replace` + `substr`; custom fill honoured) | passthrough                                                                         |
| NOW / CURRENT_*       | native                                                                              | native                                                 | native (ISO 8601 UTC text via `strftime`)                        | native (`$$NOW`); on INSERT, computed by the translator                             |
| DATE_ADD / DATE_DIFF  | native                                                                              | native (via `TIMESTAMPADD` / `TIMESTAMPDIFF`)          | native                                                           | native (`$dateAdd`); DATE_DIFF emulated, see [DATE_DIFF units](#date_diff-units)    |
| UNIX_TIMESTAMP        | native (`FLOOR(EXTRACT(EPOCH …))::BIGINT`) — the driver decodes it as a JS `bigint` | native (`UNIX_TIMESTAMP()`; milliseconds via `NOW(3)`) | native (`strftime('%s')` / `julianday`, cast to INTEGER)         | native (`$toLong` over `$$NOW`); on INSERT, computed by the translator              |
| **UUID**              | native (`gen_random_uuid()`)                                                        | native (`UUID()`)                                      | **literal** (`crypto.randomUUID()`)                              | **literal** (`crypto.randomUUID()`)                                                 |
| **HASH**              | native (`digest()` via pgcrypto)                                                    | native (`SHA2(.., 256)`)                               | **passthrough** (no built-in crypto)                             | **passthrough**                                                                     |
| **ENCRYPT / DECRYPT** | native (`pgp_sym_encrypt` / `pgp_sym_decrypt`)                                      | native (`AES_ENCRYPT` / `AES_DECRYPT`)                 | **passthrough**                                                  | **passthrough**                                                                     |

### DATE_ADD amount gotcha

A negative `amount` subtracts on every dialect. A fractional one is not
portable: Postgres and SQLite apply the fraction, MariaDB rounds it to the
nearest whole unit, and MongoDB rejects it when the query runs. Pass whole
numbers, in a smaller unit if you need the precision (`90` `MINUTES`, not
`1.5` `HOURS`).

### DATE_DIFF units

`DATE_DIFF` returns the number of **complete** units from `from` to `to`:
a partial unit is dropped, and the result is negative when `to` is the
earlier date. `MONTHS` and `YEARS` are calendar months and years.

| `from` → `to`                        | Unit     | Result |
| ------------------------------------ | -------- | ------ |
| 00:59 → 01:01, same day              | `HOURS`  | `0`    |
| 36 hours apart                       | `DAYS`   | `1`    |
| 31 January → 28 February             | `MONTHS` | `0`    |
| 31 January → 1 March                 | `MONTHS` | `1`    |
| 1 March → 31 January                 | `MONTHS` | `-1`   |
| 15 January 10:00 → 15 February 09:59 | `MONTHS` | `0`    |
| 29 February 2024 → 28 February 2025  | `YEARS`  | `0`    |
| 29 February 2024 → 1 March 2025      | `YEARS`  | `1`    |

**Every dialect returns the same number for the same two dates.** That is
why oql builds the calculation itself instead of calling whatever each
database offers: the native answers disagree, so the same query would give
a different result on a different dialect.

- MongoDB's `$dateDiff` counts unit boundaries crossed: 00:59 → 01:01 is
  one hour and 31 January → 1 February is one month.
- Postgres and SQLite have no function that returns a difference in a
  chosen unit.
- MariaDB's `TIMESTAMPDIFF` counts complete units for all six, so it is the
  reference: the other three are written to match it.

| Dialect  | `SECONDS`, `MINUTES`, `HOURS`, `DAYS`                      | `MONTHS`, `YEARS`                               |
| -------- | ---------------------------------------------------------- | ----------------------------------------------- |
| MariaDB  | `TIMESTAMPDIFF`                                            | `TIMESTAMPDIFF`                                 |
| Postgres | `EXTRACT(EPOCH FROM to - from)` over the unit, `TRUNC`ated | the year and month fields of `age(to, from)`    |
| SQLite   | `julianday` gap in milliseconds, integer-divided           | gap between calendar positions, integer-divided |
| MongoDB  | `to - from` in milliseconds, divided and `$trunc`ated      | gap between calendar positions, `$trunc`ated    |

A month has no fixed length, so elapsed time cannot be divided into months.
SQLite and MongoDB instead place each date on a scale where every month
gets a 32-day slot: `(year × 12 + month) × 32 days`, plus the time since
that month began. A slot is longer than any month, so the gap between two
positions divided by one slot is the complete calendar months, and divided
by twelve slots the complete years.

Month and year boundaries are read in UTC on SQLite and MongoDB, and in the
session time zone on Postgres and MariaDB, so keep that session on UTC.
[@tundralibs/drivers](https://jsr.io/@tundralibs/drivers) sets it on
MariaDB and refuses a non-UTC Postgres session by default; its Neon engine
does not check.

MongoDB does not reject a numeric operand for the fixed-length units, so
pass dates.

### UUID gotcha

On dialects where UUID is materialised at translate time (SQLite, MongoDB),
each `UUID()` call in a query becomes a **single literal** that the engine
sees. This is fine for `INSERT` / `UPDATE`, where you want one fresh value
per row — but inside a `SELECT`, every output row will share that single
literal. If you need per-row uniqueness in a `SELECT`, generate the UUID
client-side after fetch, or run on a dialect with a native UUID function.

### HASH / ENCRYPT / DECRYPT gotcha

On dialects that passthrough (SQLite, MongoDB) the value is emitted
unchanged: `HASH(@password)` becomes just `@password`. The query still
runs, but **the column's stored value is whatever the caller wrote** —
there's no hashing on the database side. Callers who need at-rest
hashing or encryption on these dialects must do it client-side before
calling `insert` / `update`.

OQL chose passthrough over throwing because:

1. Application code that conditionally hashes (e.g. only on a column
   marked sensitive) would otherwise need a dialect-aware branch.
2. `DECRYPT` on encrypted-by-the-app data is correctly a no-op — the
   raw column already holds the plaintext.
3. The throwing behaviour was making OQL queries non-portable, which
   defeats the point of a query-language abstraction.

## Aggregates

| Aggregate             | Postgres                                      | MariaDB                                    | SQLite                                        | MongoDB                                                                                         |
| --------------------- | --------------------------------------------- | ------------------------------------------ | --------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| COUNT/SUM/AVG/MIN/MAX | native                                        | native                                     | native                                        | native                                                                                          |
| STRING_AGG            | native                                        | native (`GROUP_CONCAT`)                    | native (`GROUP_CONCAT`)                       | **throws** (no clean aggregation-pipeline equivalent — build via `$push` + `$reduce` if needed) |
| ARRAY_AGG             | native (`array_agg`)                          | native (`JSON_ARRAYAGG`)                   | native (`json_group_array`)                   | native (`$push`)                                                                                |
| JSON_ROW              | native (`jsonb_agg(jsonb_build_object(...))`) | native (`JSON_ARRAYAGG(JSON_OBJECT(...))`) | native (`json_group_array(json_object(...))`) | native (`$push` of an object)                                                                   |

## Filters

All comparison and pattern operators (`$eq`, `$ne`, `$gt`/`$gte`/`$lt`/`$lte`,
`$in`/`$nin`, `$null`, `$between`, `$like`/`$nlike`, `$ilike`/`$nilike`,
`$startsWith`/`$endsWith`/`$contains`) translate on every dialect. Notes:

- **Case-insensitive LIKE** (`$ilike` / `$nilike`):
  - Postgres uses native `ILIKE`.
  - MariaDB uses `LIKE` (already case-insensitive on default collations).
  - SQLite uses `LIKE` (already case-insensitive for ASCII; non-ASCII
    requires `PRAGMA case_sensitive_like=OFF`, which is the default).
  - MongoDB uses `$regex` with the `i` option.

### NULL in a filter

> **A comparison never matches a NULL — on every dialect, MongoDB
> included.** `$ne` and `$nin` do not return rows whose column is NULL,
> and two NULL columns are not equal. On MongoDB a missing field counts
> as NULL.

That is SQL's rule, and MongoDB's own operators break it: a native
`$ne` / `$nin` matches a document whose field is null or missing, and
inside `$expr` null and missing sort below every value and equal each
other. OQL does not pass that through:

| Filter                                                         | SQL                 | MongoDB                                                    |
| -------------------------------------------------------------- | ------------------- | ---------------------------------------------------------- |
| `{ '@a': { $ne: 5 } }`                                         | `a <> 5`            | `{ a: { $nin: [5, null] } }`                               |
| `{ '@a': { $nin: [5, 6] } }`                                   | `a NOT IN (5, 6)`   | `{ a: { $nin: [5, 6, null] } }`                            |
| `{ '@a': '@b' }`, `{ '@a': { $lt: '@b' } }`                    | `a = b`, `a < b`    | `$expr` comparison, plus a `$gt: null` guard on each field |
| `{ '@a': { $lt: { $$_expression: 'ADD', args: ['@b', 1] } } }` | `a < (b + 1)`       | the same guarded `$expr`                                   |
| `{ '@a': { $between: ['@b', 9] } }`                            | `a BETWEEN b AND 9` | the same guarded `$expr`                                   |

So `{ '@status': { $ne: 'BANNED' } }` skips a document with no `status`.
To include it, ask for it:
`{ $or: [{ '@status': { $ne: 'BANNED' } }, { '@status': null }] }`.

Two places on MongoDB do not follow the rule yet. `$nlike` / `$nilike`
still match a null or missing field, where SQL's `NOT LIKE` does not.
And a `CASE` `when` condition compares null and missing as ordinary
low values, so `when: { '@a': { $lt: 6 } }` takes the branch for a
null `a`.

## JOINs

> **MongoDB does not honour the declared join `type` at all.** Verified
> against `MongoTranslator.__buildLookup`
> (`packages/oql/translator/MongoTranslator.ts`): it reads a join's
> `table`, `columns`, and `on`, but never reads `.type`. Every join —
> `INNER`, `LEFT`, `RIGHT`, or `FULL` — compiles to the **identical**
> `$lookup` stage, and the pipeline never `$unwind`s or filters on the
> result, so the behaviour is uniformly LEFT-outer: a local document with
> no match still comes through, carrying an empty array for the join
> alias. Concretely:
>
> - **`INNER`** does **not** filter out non-matching local documents —
>   despite the ✅ below, it silently behaves like `LEFT`.
> - **`RIGHT`** does **not** reverse the collections. Documents that exist
>   only on the joined ("right") side, with no match on the primary
>   ("left") side, are silently absent from the result — exactly like
>   `LEFT`, not a true RIGHT JOIN.
> - **`FULL`** does **not** throw. It silently compiles to the same
>   LEFT-equivalent `$lookup`, so right-only rows are silently missing.
>
> This is an unimplemented differentiation, not a documented design
> choice — earlier revisions of this table claimed RIGHT was emulated by
> reversing collections and FULL threw; neither is true of the current
> source. If correctness depends on RIGHT or FULL semantics on MongoDB,
> do not rely on the `type` field: restructure the query yourself (e.g.
> swap which table is primary for a RIGHT, or run two queries and merge
> client-side for a FULL).

| Join type | Postgres | MariaDB   | SQLite (3.39+) | MongoDB                                                 |
| --------- | -------- | --------- | -------------- | ------------------------------------------------------- |
| INNER     | ✅       | ✅        | ✅             | ⚠️ compiles, but behaves like LEFT (see callout)        |
| LEFT      | ✅       | ✅        | ✅             | ✅                                                      |
| RIGHT     | ✅       | ✅        | ✅             | ⚠️ compiles, but behaves like LEFT — **not** reversed   |
| FULL      | ✅       | ❌ throws | ✅             | ⚠️ compiles, but behaves like LEFT — does **not** throw |

Every entry in a join's `on` map is a condition, and they AND together
on every dialect. On MongoDB that means two `$lookup` shapes:

- **One entry whose value is a column ref** → the concise
  `localField` / `foreignField` form.
- **Anything else** — a composite key, a constant, or an Expression —
  → the `let` + sub-pipeline form, with every condition inside one
  `$expr: { $and: [ … ] }`. A composite key therefore correlates on
  _all_ of its parts, matching the SQL `ON a = b AND c = d`.

### NULL in a join condition

A column or Expression pair in `on` is plain equality: it never matches
when either side is `NULL`, on every dialect. List the `on` key in the
join's `nullSafe` array to also match when both sides are `NULL`; keys
left out keep plain equality.

| Pair                 | Postgres               | MariaDB | SQLite | MongoDB                            |
| -------------------- | ---------------------- | ------- | ------ | ---------------------------------- |
| plain                | `=`                    | `=`     | `=`    | `$eq`, plus a not-null guard       |
| listed in `nullSafe` | `IS NOT DISTINCT FROM` | `<=>`   | `IS`   | `$eq` over `$ifNull` on both sides |

On MongoDB a missing field counts as `NULL` in both rows. A bare
`$lookup` would match a null or missing local field to every null or
missing foreign field, so a plain pair carries a guard that drops those
foreign documents. In the concise form that guard is a `pipeline`
beside `localField` / `foreignField`, which needs MongoDB 5.0 or later.
A lone `nullSafe` key is the concise form without the guard.

A `$exists` / `$nexists` correlation map takes the same `nullSafe`
array, with the same SQL operators, and reads a `null` value the same
way: `IS NULL` on the subquery column.

A `null` value in `on` is a NULL check on the joined column (`IS NULL`;
null or missing on MongoDB) and cannot be listed in `nullSafe`, nor can
a literal — `assertJoinDetails` rejects both with a `TypeError`.

## When to expect a throw vs a silent fallback

We **throw** (as `DialectUnsupportedError`) when:

- `CREATE_INDEX` with `where` on MariaDB (partial indexes don't exist).
- `FULL JOIN` on MariaDB.
- `STRING_AGG` aggregate on MongoDB.
- `CREATE_SCHEMA` on MongoDB.
- `$like` / `$nlike` / `$ilike` / `$nilike` with an **Expression** value
  on MongoDB — the operand of those operators _is_ a wildcard pattern,
  and turning that grammar into a regex needs the pattern at translation
  time. (`$startsWith` / `$endsWith` / `$contains` carry literal
  substring semantics, so a computed operand translates fine there —
  they become an `$expr` string search.)
- `ALTER_TABLE` `alterColumns` (as `ALTER COLUMN`) and
  `addForeignKeys` / `dropForeignKeys` (as `ALTER CONSTRAINT`) on
  SQLite — in-place column/constraint changes need a full table rebuild.
- `CREATE_VIEW` with `orReplace: true` on SQLite — SQLite's `CREATE VIEW`
  grammar has no `OR REPLACE`. Use `ALTER_VIEW` with a `query` to redefine
  (it emits `DROP VIEW IF EXISTS` + `CREATE VIEW`). Postgres/MariaDB emit
  `CREATE OR REPLACE VIEW` natively.
- `UPSERT` on MongoDB where a data row omits a conflict key, or supplies
  it as `undefined`/`null` — an empty/partial or `{ key: null }` match
  filter would overwrite an arbitrary document.

The validator (a `TypeError`, separate from `DialectUnsupportedError`)
also rejects, on every dialect, a `having` clause on a `COUNT` query.

We **silently fall back / passthrough** for:

- Materialized views on MariaDB / SQLite / MongoDB → regular view +
  no-op `REFRESH`.
- `UUID` on SQLite / MongoDB → `crypto.randomUUID()` literal.
- `HASH` / `ENCRYPT` / `DECRYPT` on SQLite / MongoDB → passthrough.
- `LPAD` / `RPAD` on MongoDB → passthrough. (SQLite is **not** in this
  list: it composes the real thing — see below.)
- `TRUNCATE` on SQLite / MongoDB → `DELETE` with no filter.
- `DROP INDEX ifExists` / `cascade` flags on MariaDB → silently dropped
  (the grammar doesn't accept them; missing-index becomes a hard error).

The split is deliberate: silent fallbacks happen when there's a
reasonable substitute that keeps the query semantically meaningful;
we throw when emitting anything would actively mislead the caller.

**One entry in this document is not a deliberate fallback**: a declared
join `type` (`INNER`/`RIGHT`/`FULL`) on MongoDB is silently ignored
rather than emulated or rejected — see the [JOINs](#joins) callout
above. Every other row in this document reflects an intentional
degradation; that one is a translator gap.

## `LPAD` / `RPAD` on SQLite

SQLite ships neither function, so the translator composes them:
`printf('%*s', n, '')` builds a run of `n` spaces, `replace()` swaps each
space for the fill, an inner `substr` cuts that run to the shortfall, and
an outer `substr` truncates an input that is already longer than the
target width.

This is a real emulation, not a space-padding approximation — the fill
you pass is the fill you get. Verified by executing the emitted SQL on
SQLite 3.53.4 and diffing it against the same query on Postgres 17 and
MariaDB 11: custom fill, multi-character fill (`LPAD('x', 6, 'abc')` →
`abcabx`), truncation of an over-long input, NULL input/length/fill,
non-ASCII input, empty input, and zero length all agree.

Two edges cannot agree with both references at once, because Postgres
and MariaDB disagree with **each other** there. SQLite follows Postgres:

| Input             | Postgres | MariaDB | SQLite (ours) |
| ----------------- | -------- | ------- | ------------- |
| negative length   | `''`     | `NULL`  | `''`          |
| empty fill (`''`) | input    | `NULL`  | input         |

---

[← Back to OQL](../README.md)
