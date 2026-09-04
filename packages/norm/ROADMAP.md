# NORM Roadmap

> **Status:** A proven, opinionated, security-first polyglot ORM — one
> typed surface over seven dialects (PostgreSQL, MariaDB, SQLite, and
> MongoDB self-hosted; Neon, Turso, and D1 over HTTP for edge runtimes),
> live-proven across three runtimes, published on JSR. The moat (in-core
> searchable at-rest encryption, write-path validation, hash-verified
> migrations, write-enforcing tenant scope, no codegen) is demonstrated,
> not asserted. The remaining gaps are almost entirely **productization**
> — the cheaper class of gap to close — not capability.
>
> **Last updated:** 2026-09-04

## Current state

| Layer               | Status   | Notes                                                                                                                                                                                                |
| ------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Typed model surface | Complete | Schema, querying, aggregates, scoping, transactions (with savepoints)                                                                                                                                |
| Engine support      | Complete | Seven dialects: PostgreSQL / MariaDB / SQLite / MongoDB self-hosted and live-proven; Neon / Turso / D1 fetch-only for edge runtimes (no pooling, no transactions). One migration + encryption story  |
| At-rest encryption  | Complete | `.encrypt().hash().mask()`; key rotation via `rotateKey()` (key-id envelope); since 1.5.0 the GCM path derives one AES key per secret per process instead of PBKDF2 per cell                         |
| Temporal & audit    | Complete | Shipped in 1.4.0: insert-only versioned tables and generated read-only audit replicas over one supersede primitive; best-effort on Mongo and the fetch-only dialects. Design in `DESIGN-Temporal.md` |
| Migrations          | Complete | Stored reviewed plans + hash-verified apply + advisory lock                                                                                                                                          |
| Observability       | Complete | `witness` hook bridges the metadata-only event bus to `@tundralibs/tracer`                                                                                                                           |
| Read caching        | Complete | Opt-in per-entity TTL over `@tundralibs/cacher`; per-table namespaced pruning; view/query dep-invalidation; MEMORY/REDIS/MEMCACHED; degrades on backend failure. Joins deferred (see below)          |
| Escape hatch        | Partial  | `db.raw<R>()` typed passthrough (crypto-blind by design); `query(IR)`                                                                                                                                |

## Planned / deferred

Grouped by theme; granular sub-tasks and specific bugs live in GitHub
Issues. Productization dominates — most of what a brownfield team needs
before adopting is tooling, not new query power.

### Productization (the dominant adoption blockers)

- **Introspection / drift detection** — no db-pull, no drift-vs-live-DB,
  no baselining. The Migrator is snapshot-vs-hash only and never reads the
  live schema, so it's greenfield-only; most adoption is brownfield.
- **CLI** — no `migrate` / `generate` / `push` / `pull` / `studio`.
  Deferred sequencing, not a principled decline.

### Capability

- **Advanced SQL not expressible** — arbitrary join predicates,
  CTEs/recursive, window functions, set ops, ad-hoc subqueries, `CASE`.
  (The escape-hatch gap below is the current stopgap.)
- **Thin column-type palette** — no PG enum/array/tsvector/geometry, no
  `customType`, no `CHECK`, no partial/expression indexes.
- **After-write hooks / global subscribers** — no hook that sees the
  persisted result, no cross-entity subscribers. (The audit mirror is an
  internal after-write step, not a user-facing hook — the seam is still
  unexposed.)
- **Temporal / audit actor column** — neither feature records _who_ wrote
  a version; shipped without an actor by design of the first cut.
- **Cached joined reads** — the read cache covers single-table reads
  (single-table aggregates included); joined / relational reads are never
  cached (a joined entry depends on more than one table, breaking
  per-table pruning) — the sanctioned pattern is a cacheable `VIEW`.
  Caching ad-hoc runtime joins precisely would need per-key dependency
  tracking cacher doesn't expose today.
- **Engine breadth** — no MSSQL/Oracle/Spanner (NORM uniquely adds Mongo;
  the fetch-only edge dialects arrived for free through `drivers`).
- **Polymorphic associations / STI / embeddables.**

### Ergonomics

- **Stronger escape hatch** — `raw()` is untyped and crypto-blind (returns
  ciphertext); `query(IR)` is capped at OQL. The out for the advanced-SQL
  gap is currently unsafe.
- **First-class M2M** — today needs a junction `VIEW` (read-only ceremony).
- **Seed / fixtures framework.**
- **Programmable `$extends`** — custom methods, interception, plugins.
- **`DATABASE_URL` / `postgres://` parser** for PG/Maria/SQLite (only Mongo
  takes a URI today; every provider hands out a URL).

### Performance

- **PBKDF2 residue** — the 1.5.0 per-process key applies to AES-GCM
  cells written since; legacy per-message-salt envelopes (until
  `rotateKey()` rewrites them) and the CBC/CTR modes still derive a key
  per cell at 210k iterations.
- **Benchmarks** — partially delivered (`rotate.bench.ts` measured the
  pre-1.5.0 per-cell KDF cliff and ~1% envelope overhead; it predates the
  per-process key and needs re-baselining). Still want the row-with-N-columns
  and page-of-M-rows aggregate shapes over a mock executor (isolating
  NORM's own overhead from DB latency), a hashed-filter-rewrite bench, and
  `Norm.compare.bench.ts` (NORM vs raw `db.raw` — "what the ORM costs me").
- **User-facing prepared statements** — every call recompiles IR → SQL.

### Tooling / maintainability

- **Studio / GUI data browser.**
- **`Repo.ts` maintainability debt** — a ~4,000-line file (three accessor
  classes) with scattered dialect-string knowledge and ~165 `as` casts.

## Moat — do not regress

Searchable in-core at-rest encryption (`.encrypt().hash()` transparent
filter rewrite, plus `.mask()`); ONE typed surface across
SQLite/PG/Maria/**Mongo** and the fetch-only edge dialects; apply-time
hash-verified migration plans with
locks and crypto rebuild; write-path Guardian validation; no
codegen/decorators/engine-binary; write-enforcing `db.scope`; a mock
executor seam alongside one engine-parametrized live suite; a
metadata-only (leak-proof) event bus.

## Deliberately declined (by design)

These are settled design decisions, not open gaps — recorded so they
aren't re-litigated:

- **Nested relation linkage** (ORM-style deep `include`/`with`, depth-2+
  sub-projections) — depth-1 to-one is row completion; bounded to-many is a
  JSON aggregate; multi-hop shapes are declared read models (`VIEW`s with
  logical FKs); genuinely graph-shaped needs are explicit application
  composition. All three industry strategies fail nested pagination.
- **Nested writes / connect / set** — a fluent nested payload hides
  ordering + a transaction and drags in ambiguous disconnect/set semantics.
  The sanctioned pattern is an explicit `transaction()` (parent first, its
  pk feeds children's FK), documented as a Guide recipe. Zero new API.
- **`@`-prefixed string-keyed refs** (in filter/projection/orderBy/
  aggregates/scope) — these are OQL, NORM's query language, and are
  intended. Typed but verbose; not a leak to be sealed.
- **Soft delete** — business logic; NORM is data management.
- **Entity `scope` preset** — removed; runtime `db.scope()` covers
  multi-tenant and `VIEW`s cover static read-models. A hardcoded equality
  in the base entity makes the column pointless and hides an always-on
  filter.
- **`update()`/`delete()` `RETURNING`** — not supported across all engines.
- **Required filter on `update()`/`delete()`** — optionality stays; events
  replaced the old `console.warn`.

## Related

- [@tundralibs/oql](../oql) — the query language NORM's `@`-refs speak
- [@tundralibs/drivers](../drivers) — the engine layer below the executor
  seam; NORM inherits every new driver (incl. edge/HTTP) for free
- [@tundralibs/guardian](../guardian) — the write-path validation layer
