# OQL Roadmap

> **Status:** Type system, validators, and translators for PostgreSQL,
> MariaDB, SQLite, and MongoDB are all in place and covered by 1640+
> test steps. OQL is already wired into the
> [drivers](../drivers) package (the successor to DAM). Remaining
> items are the deferred-feature work in
> [Intentionally deferred](#intentionally-deferred-phase-2) below.
>
> **Last updated:** 2026-05-12

## Current state

| Layer                       | Status   | Notes                                               |
| --------------------------- | -------- | --------------------------------------------------- |
| Type system (`types/`)      | Complete | `Query<Op, T, Joins>` for every supported op        |
| Validators (`asserts/`)     | Complete | `assertX` / `isX` pairs                             |
| Translators (`translator/`) | Complete | SQL: SQLite / Postgres / Maria. NoSQL: Mongo        |
| Drivers ↔ OQL bridge        | Complete | `drivers` package consumes the translators directly |
| DAM ↔ OQL bridge            | n/a      | DAM is deprecated; replaced by `drivers`            |

## Intentionally deferred (phase 2)

These live in the type tree but are **commented out** in the runtime
asserts and translators. They are complex to implement cleanly across
all four dialects and are not required by the API surface OQL is
built for.

- `CAST` — type conversion (STRING ↔ NUMBER ↔ DATE ↔ BIGINT ↔ BOOLEAN)
- `COALESCE` — first non-null
- `NULLIF` — null when equal
- Subqueries (`IN (SELECT ...)`, scalar subqueries in `SELECT`) —
  correlated `EXISTS` landed 2026-07-11 as the `$exists` / `$nexists`
  filter predicates (with SELECT `distinct` + `COUNT(DISTINCT col)`)
- Window functions (`ROW_NUMBER`, `RANK`, `PARTITION BY`)
- Full-text search
- CTEs (`WITH`, including recursive)
- Advanced joins (CROSS, NATURAL, self-joins, multi-condition with OR)

## Architecture decisions worth remembering

- **Validators are dialect-agnostic.** `assertCreateIndex` accepts
  `where` even though MariaDB has no partial indexes — the throw
  happens at `MariaTranslator._buildCreateIndex` time. Same query
  document validates everywhere; only translation is dialect-aware.
- **`_inlineParams` is named-only.** Every shipped SQL dialect emits
  `:name:` placeholders on the way out of the translator; drivers
  rewrite to dialect-native. Keeping the inliner named-only matches
  drivers' assumptions and avoids accidental cross-format escaping
  bugs.
- **View bodies inline literals.** SQLite + Postgres reject
  placeholders inside stored view definitions; MariaDB tolerates but
  stores the bound value as a literal anyway. The translator inlines
  literals into view DDL bodies so every dialect produces the same
  stored shape.
- **OQL has no live/DB tests — by design.** OQL is a pure translator
  with no driver dependency; its tests are goldens (fixture-based, no
  DB). Live coverage of the Query → translator → engine → real DB path
  lives in drivers' `engines/*/Translator.live.test.ts`. Adding live
  tests here would create a circular dep on `drivers` and gate OQL CI
  on DB availability — and drivers' live suites already catch
  translator/dialect drift (three real bugs surfaced that way:
  CREATE_INDEX WHERE params, HAVING aggregate alias, joined-column
  aggregate validation).

## Database compatibility matrix

| Feature            | PostgreSQL                    | MariaDB                    | SQLite                                  | MongoDB                    |
| ------------------ | ----------------------------- | -------------------------- | --------------------------------------- | -------------------------- |
| Core DML           | Full                          | Full                       | Full                                    | Full                       |
| Filters            | Full                          | Full                       | Full                                    | Full                       |
| Aggregates         | Full                          | Full                       | Full                                    | Partial (no STRING_AGG)    |
| Joins              | Full                          | RIGHT only (no FULL)       | Full                                    | `$lookup`                  |
| Expressions        | Full                          | Full                       | Limited (no crypto)                     | Limited                    |
| JSON columns       | JSONB native                  | JSON native                | json_extract                            | Native                     |
| ENCRYPT / DECRYPT  | pgcrypto                      | AES\_\*                    | Passthrough                             | Passthrough                |
| Views              | Full                          | Full                       | Full (no ALTER VIEW: emits DROP+CREATE) | Limited                    |
| Materialized views | Full (REFRESH [CONCURRENTLY]) | Falls back to regular view | Falls back to regular view              | Falls back to regular view |
| Schemas            | Full                          | Database-as-schema         | Emulated via ATTACH                     | Database-per-schema        |
| Transactions       | Full                          | Full                       | Full                                    | Full                       |
| CTEs               | Full                          | Full                       | Full                                    | None                       |
| Window functions   | Planned                       | Planned                    | Planned                                 | None                       |

See [docs/Compatibility.md](./docs/Compatibility.md) for precise
per-dialect behaviour.

## Security notes

- Parameter binding is used everywhere except `CREATE_VIEW` /
  `ALTER_VIEW`, where literals are inlined (stored view bodies
  cannot carry placeholders portably). `_formatLiteral` escapes
  single quotes and rejects non-finite numbers.
- `assertX` validators run before every translator call.
- `ENCRYPT` / `DECRYPT` / `HASH` on SQLite and MongoDB are
  **passthrough** — stored value is plaintext. Surfaced in the
  Security section of [OQL.md](./README.md). Do not rely on these
  expressions for at-rest crypto on those dialects.

## Related

- [@tundralibs/drivers](../drivers) — connection-pooled database
  drivers (the consumer of the translators)
- [@tundralibs/norm](../norm) — model layer being rebuilt on top of
  OQL
