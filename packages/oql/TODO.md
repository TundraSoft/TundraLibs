# OQL — TODO

Concrete follow-ups from the 2026-05-12 code review. Larger work is
tracked in [ROADMAP.md](./ROADMAP.md).

## Open

- [ ] **[docs] OQL.md vs README.md drift** — README.md was removed;
      re-read OQL.md once more after Phase 2 lands to make sure
      examples (esp. projection direction, INSERT shape) stay in sync
      with the actual translator output.

## Phase 2 (deferred, see ROADMAP)

- [ ] `CAST` / `COALESCE` / `NULLIF` — commented out in validators
      and translators.
- [x] `EXISTS` subqueries — landed 2026-07-11 as `$exists` / `$nexists`
      correlated filter predicates (+ SELECT `distinct` and
      `COUNT(DISTINCT col)`); Mongo throws `DialectUnsupportedError`.
- [ ] Subqueries, remaining: `IN (SELECT ...)`, scalar subqueries.
- [ ] Window functions, CTEs, advanced joins.

## Closed (2026-05-12)

- **`validateAggregates` / `validateExpressions` didn't see joined
  columns** — `assertSelectQuery` ran them with `columnList` (base
  table only), so an aggregate referencing `@alias.@col` was
  rejected by the column-list check inside `assertColumnIdentifier`.
  Fixed by extracting a `collectJoinedColumns` helper that pre-walks
  `query.joins` to gather the flat `<alias>.<col>` list. The walker
  is called _before_ aggregate / expression validation, and the
  combined `[...columnList, ...joinedColumns]` scope is passed to
  both. The proper `assertJoins` validation still runs after via
  `validateJoinsBlock` (now taking `joinedColumns` as an argument
  instead of recomputing). Golden test pinned; live JOIN+aggregate
  test on Postgres re-enabled.
- **HAVING with aggregate-alias columns emitted invalid SQL** —
  `having: { '@cnt': { $gte: 2 } }` previously emitted
  `HAVING "cnt" >= $1` where `"cnt"` was only a SELECT-list alias.
  Postgres evaluates HAVING before the SELECT list materialises, so
  the alias isn't in scope yet (`column "cnt" does not exist`). Fixed
  by adding an optional `aliases` parameter to `_translateFilter`;
  the HAVING call site now passes `q.aggregates` (and `q.expressions`
  defensively, though the validator currently restricts HAVING keys
  to aggregates only). The translator substitutes alias refs with the
  aggregate's full SQL — `HAVING COUNT("id") >= $1`. Golden test added.
- **CREATE_INDEX with WHERE didn't run on Postgres** —
  `_buildCreateIndex` emitted `WHERE "x" = $1` against parameterised
  values, but Postgres rejects placeholders in partial-index
  predicates (same restriction as view bodies). Fixed by inlining
  literals via `_inlineParams` in `AbstractTranslator.createIndex()`,
  matching the existing `createView()` behaviour. SQLite picks up the
  fix transparently; MariaDB throws upstream because it has no
  partial indexes. Surfaced by the live Postgres coverage suite.
- **Live coverage tests for translators** — added per-engine
  `coverage` suites in `packages/drivers/engines/*/Translator.live.test.ts`
  exercising filters ($like/$between/$in/$null/$or), aggregates
  (COUNT/SUM/AVG/MIN/MAX with GROUP BY), expressions (CONCAT,
  arithmetic, LOWER, LENGTH), CREATE_INDEX (unique + partial),
  CREATE_VIEW + DROP_VIEW, and INSERT_FROM_QUERY. The Mongo suite
  adds bulk UPSERT (single-batch round-trip via the new
  `bulkWrite` action) and the `updateOnConflict` insert-only-column
  contract.
- **Bulk UPSERT on MongoTranslator** — array `data` now emits a new
  `MongoBulkWriteAction` (`sql: 'bulkWrite'`) carrying one `updateOne`
  op per row. The `drivers` Mongo engine dispatches via native
  `bulkWrite` and re-fetches all rows in one `find($or: [...])` —
  two round-trips total regardless of N.
- Removed orphan root-level `Parameters.ts` (no importers; real
  `Parameters` lives in `translator/Parameters.ts`).
- Removed stale `README.md` + `types/README.md` (canonical doc is
  `OQL.md` per the wiki-sync naming convention).
- `MariaDB DROP INDEX` silent drop of `ifExists` / `cascade`
  documented in `docs/Compatibility.md`.
- Crypto-passthrough security caveat surfaced in `OQL.md`.
- `assertSelectQuery` → `assertSelect` (and siblings) swept across
  all public docs and JSDoc.
- ColumnIdentifier behavioural tests added: Unicode rejection,
  control-char/punctuation rejection, very-long identifier (>255
  chars) handling. Library coverage already at 100%; these pin
  behaviour rather than close gaps.

## Won't do

- **MariaDB partial-index up-front rejection in validator.**
  Validators stay dialect-agnostic by design; the translator-level
  throw is the right layer.
- **Make `_inlineParams` handle non-`'named'` formats.** Drivers
  only emit/consume named placeholders, so locking to named is
  correct.
- **DAM ↔ OQL integration.** DAM is deprecated; OQL is already
  consumed by the `drivers` package.
- **Live (DB-backed) tests inside `packages/oql`.** OQL is a pure
  translator with no driver dependency — its tests are
  goldens (fixture-based, no DB). Live coverage that exercises the
  Query → translator → engine → real DB path lives in
  [`packages/drivers/engines/*/Translator.live.test.ts`](../drivers/engines).
  Adding live tests in OQL would create a circular dep on `drivers`
  and gate OQL CI on DB availability — neither is justified given
  drivers' live suites already catch translator/dialect drift (three
  real bugs surfaced this way: CREATE_INDEX WHERE params, HAVING
  aggregate alias, joined-column aggregate validation).
