# NORM — Review round 4 backlog (2026-07-11)

Source: two-stage adversarial review (vs packages/norm v4; vs Drizzle & Prisma).
34 verified findings — 22 confirmed, 12 partial, 0 refuted. Dispositions per
review discussion 2026-07-11.

## Competitive scoreboard

"norm is …" relative to the named tool on that dimension.

Updated 2026-07-12 post four-dialect live proof (Postgres + MariaDB +
MongoDB fixtures now green alongside SQLite; M2M-via-view landed). The
original review's "only SQLite is live-tested" taint is GONE — the same
typed surface + migrations + encryption is now exercised end-to-end
against 3 SQL engines AND a document store. Cells changed this pass: ⇑.

| Dimension                            | vs Drizzle                                                                                                             | vs Prisma                                                                                                                                  |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Schema definition / authoring        | different                                                                                                              | **better** (no codegen)                                                                                                                    |
| Type inference & error locality      | par                                                                                                                    | different                                                                                                                                  |
| Query breadth (aggregations, raw)    | narrower gap (typed GROUP BY + bound query(); still no arbitrary joins/CTEs/sql``; raw-SQL method approved-for-later)  | narrower gap                                                                                                                               |
| Relations (traversal / nested write) | ⇑ different (filters better; M2M via views LANDED; deep nesting DECLINED BY DESIGN, not a gap)                         | worse on nested writes only (traversal declined by design; M2M via views)                                                                  |
| **Polyglot persistence (SQL+NoSQL)** | ⇑ **better** — one typed surface across SQLite/PG/Maria/Mongo, all live-proven; Drizzle is SQL-only (no Mongo)         | ⇑ **better/different** — Prisma's Mongo is a separate connector w/ feature caveats; norm = ONE surface, one migration+crypto story, proven |
| Migrations                           | **ahead on discipline** (stored reviewed plans + hash-verified apply + advisory lock; drizzle-kit has no enforcement)  | closer (reviewable SQL + multi-replica lock landed; still no drift-vs-live-DB introspection, no CLI)                                       |
| Transactions                         | par (no savepoints)                                                                                                    | —                                                                                                                                          |
| At-rest security                     | ⇑ **better** (moat) — now PROVEN across all 4 engines incl. document store, not just typed                             | ⇑ **better** (moat) — proven 4 engines; Prisma needs a 3rd-party extension w/ no migration support                                         |
| Validation                           | —                                                                                                                      | **better** (guardians)                                                                                                                     |
| Runtime reach                        | split: **worse** on serverless/edge (no HTTP drivers); **better** on backend-engine breadth incl. NoSQL                | different (no engine binary/codegen; but no Accelerate/edge-adapter equivalent)                                                            |
| Testing & mockability                | ⇑ **better** — Executor mock seam + ONE engine-parametrized live suite proven on 4 dialects; Drizzle has neither       | —                                                                                                                                          |
| Observability                        | —                                                                                                                      | different (metadata-only bus; drivers emit SQL one layer down)                                                                             |
| Docs & ecosystem                     | worse but improving (README + 6 topic docs LANDED 2026-07-12; still unpublished — publishing is the remaining blocker) | worse (same)                                                                                                                               |

Notes from fact-checking (still true): OQL implements SUM/AVG/GROUP
BY/HAVING; VIEW/QUERY entities are a typed aggregation path;
`CryptoOverrides.hash` permits HMAC siblings.

### Re-assessment delta (2026-07-12)

The technical-credibility gap has largely closed; what remains is the
PRODUCTIZATION layer, which did not move.

MOVED (all verified by live runs I ran this session):

- Four-dialect live proof incl. MongoDB → a NEW moat neither competitor
  matches: one typed surface + one migration story + one encryption
  story across relational AND document. Drizzle is SQL-only; Prisma's
  Mongo is a separate connector (no raw SQL, different relation
  handling, feature caveats). The cross-dialect run found+fixed 4 real
  bugs (PG uuid param oid, PG jsonb key inference, Maria sub-second time
  precision, Mongo JSON_ROW $map + joined-count normalization) — that's
  maturity evidence, not just typed intentions.
- Migrations discipline (stored hash-verified plans, advisory lock) —
  ahead of drizzle-kit, closing on Prisma.
- Typed aggregates + M2M-via-view + column types + matviews +
  beforeDelete + defaultPageSize + chunked crypto rebuild — the query
  and feature surface filled out.
- At-rest security moved from "typed but SQLite-only" to "proven on 4
  engines incl. a document store."

DID NOT MOVE (still the real adoption blockers):

- Docs: README + 6 topic docs now LANDED (2026-07-12); still unpublished
  (JSR) + no wiki mapping yet. Ecosystem / LLM-familiarity — still zero.
- No serverless/edge/HTTP drivers (Neon, D1, Turso, Accelerate).
- No nested writes / connect / referential actions.
- No CLI; no drift-vs-live-DB introspection.
- Raw-SQL method approved but not built (sequenced later).
- Unpublished WIP; PBKDF2-per-cell crypto cost still open.

VERDICT (recalibrated): norm is no longer "promising but unproven." It
is a proven, opinionated, security-first polyglot ORM whose moat
(encryption + validation + migration discipline + SQL/NoSQL breadth) is
now demonstrated, not asserted. Its remaining deficits are almost
entirely productization (docs, CLI, edge drivers, publishing) rather
than capability — the cheaper class of gap to close. Pick it today when
regulated data on multiple/heterogeneous engines is the core problem and
you can live inside the TundraLibs stack. The one honest "walk away"
reason for most teams is unchanged: there is nothing to read yet.

## Approved — fix wave 1 (COMPLETE 2026-07-11)

- [x] Filterless update()/delete(): replace console.warn with proper events
      on the norm event surface (also used by pageSize-0 unbounded reads).
- [x] Migrator advisory lock (pg_advisory_lock / GET_LOCK; file lock stays for
      SQLite). Fix lock.ts docstring that falsely claims it exists.
- [x] beforeDelete row hook (v4 preDelete parity).
- [x] Column types: float/double/real, TIME, DATETIME, binary/blob, JSONB.
- [x] Materialized views (EntityViewOptions.materialized + diff emission).
- [x] defaultPageSize on Entity options; default 10; 0 = unbounded and the
      unbounded query emits a warning event when it runs.
- [x] Chunked crypto-rebuild copy (paged SELECT + batched INSERT — no more
      whole-table materialization).
- [x] Rebuild coerceCanonical alignment (Date-as-string → toISOString; JSON →
      stableJson) so recomputed digests can never diverge from the write path.
- [x] Unify/rescope the two snapshot exporters (definition/snapshot.ts claims
      migration-diff purpose; Migrator uses migrations/snapshot.ts).
- [x] Eliminate `as unknown as Query<…>` hand-built IR casts (28) — typed
      construction so the compiler sees every Migrator query.
- [x] Consolidate mask compute/strip pipeline (×3) + `siblingOf()` helper for
      the `_hash` naming rule (×5 call sites).
- [x] Stored, reviewable migration plans: render planned DDL per dialect at
      snapshot time (000N.<dialect>.sql artifacts); apply() verifies its
      computed plan against the stored artifact hash and refuses on mismatch.
- [x] Typed escape hatch + aggregates: db.query() with entity binding so
      results ride decrypt/afterRead; expose OQL aggregates through the typed
      find()/select surface (basic if not advanced).

## Approved — next (after wave 1)

- [x] Postgres/Maria live fixtures LANDED 2026-07-11 — full 22-step
      Shortly suite green on sqlite+postgres+maria × Deno/Bun/Node
      (241 steps/runtime). Creds: packages/norm/.env (copied from
      drivers; gitignored); fixtures probe + skip when unreachable.
      THREE real dialect bugs found+fixed: PG string params bound as
      TEXT oid broke uuid comparisons (now UNSPECIFIED — server
      infers); PG jsonb_build_object keys then lost inference (new
      _textParameterize hook, PG casts ::text); Maria bare
      TIME/DATETIME/TIMESTAMP truncate to whole seconds (now
      TIME(6)/DATETIME(6)/TIMESTAMP(6)).
- [x] Mongo live fixture LANDED 2026-07-12 — 23-step Shortly suite runs
      on MongoDB: 20 pass, 3 skip-with-reason. Root user created on the
      server (docker exec mongosh createUser role:root); adaptive-auth
      probe + WRITE-capability check in the fixture. TWO real dialect
      bugs found+fixed: (1) MongoTranslator ran JSON_ROW relation
      aggregates through $group, evaluating '$Alias.field' against the
      $lookup ARRAY → every relation field came back as an array —
      fixed to $map over the looked-up array (jsonRowLookupAlias
      detects the shape); (2) MongoEngine.count never normalized the
      JOINED-count aggregate ({_id,**count**}) to {Count} (only the
      native path did) → joined counts returned 0 — now normalized like
      SQLEngine (drifted SQLEngine comment corrected too). suite.ts
      gained migrate:false (schemaless) + skip{stepId:reason} + step()
      wrapper; step 08 split into 08 (joined count) / 08e (EXISTS lift)
      so Mongo skips only the EXISTS part. Fixture creates the 2 unique
      indexes + 2 views from the SAME model defs. Bonus: drivers' own
      Mongo live tests now RUN (were silently auth-skipping).

      ## Mongo gaps (FINAL — only 3, all genuine limitations)
      - $exists/$nexists: MongoTranslator throws (no correlated-subquery
        form in find filters) → steps 08e (filter-only to-many lift)
        and 13b (M2M-view read filtered via EXISTS) SKIPPED.
      - Transactions: capabilities.transactions=false → step 17 SKIPPED
        (db.transaction throws NormUnsupportedError by design).
      - Migrations: N/A (schemaless — migrate:false; no plan artifacts,
        no advisory lock; fixture creates indexes + views directly).
      Everything else — encryption + digest siblings + masks, hasOne/
      belongsTo/reverse relations via $lookup+$map, joined counts,
      typed GROUP-BY aggregates, entity-bound query(), views (incl.
      join bodies), M2M-via-view PROJECTION, upsert w/ digest re-sync,
      pagination, bigint>2^53, JSON, cross-schema FK reads — WORKS.

- [x] package.json exports: ./migrations + ./asserts ADDED 2026-07-12
      (parity with deno.json verified). Node/Bun can now import the
      Migrator + asserts layer — review BLOCKER cleared.
- [x] DOCS LANDED 2026-07-12: full package README.md (Overview, Modules,
      Installation, Quick Start, Schema, Querying, Encryption, Migrations,
      Scoping, Transactions/escape-hatches, Events, 4-engine support
      table, Guides, License) + six topic docs under docs/:
      Norm-Guide (10-section "Shortly" how-to), Norm-Schema, Norm-Querying,
      Norm-Security, Norm-Migrations, Norm-Scoping. JSDoc gaps from the
      audit filled (Norm class/ctor/lifecycle, crypto algo types+consts,
      Migrator class/status/apply, rebuild/diff/plans/lock/registry
      symbols, both Repo ctors). All facts verified vs code (PBKDF2 210k,
      digest 64/96/128, event signatures, mask sig). fmt+lint+check clean;
      all .md cross-links resolve; removed 4 dead diff.ts imports in
      Migrator.ts (orphaned by Wave1-F). NAMING RATIFIED (user 2026-07-12
      "Leave it as Norm, ideally it should be NORM"): docs use the
      `NORM-` file prefix + `# NORM` title; wiki name = NORM (applied to
      workspace-meta.json at the swap below).
- [x] Test hygiene DONE 2026-07-12: removed 5 stale `as never` casts on
      to-many filters in suite.ts (kept the 2 deliberate negative-test
      bypasses); refreshed example/main.ts runtime comment + projected.ts
      reverse-name-collision note (was a stale "Known gap"); added a
      real delete-by-hash assertion to suite step 03 (net-zero throwaway
      user). 204 non-live+sqlite steps green.
- [x] SWAP TO norm DONE 2026-07-12 (user "just delete packages/norm and
      rename this to norm"): deleted the old v4 reference package, moved
      the working ORM into `packages/norm`; package name set to
      `@tundralibs/norm` (deno.json + package.json); all self-refs +
      cosmetic literals (advisory-lock key `norm:migrator`, test
      `describe('norm.*')` labels, plan-comment, tx-scope symbol, live
      `.env` path, tempdir prefixes) rewritten. workspace-meta wiki name
      set to NORM + `deno task workspace:sync` (root README, labeler,
      manifest, release-please-config, issue forms all reconciled;
      sync:check clean; root deno.json globs `./packages/*` so it's
      auto-picked-up). VERIFIED: check+lint+fmt clean; Deno 282 steps
      (all 4 dialects live incl. PG/Maria/Mongo) + Bun 26 + Node 26 all
      green. Nothing committed (hold).

## Needs discussion / design

- [x] Scoping + preset filter LANDED 2026-07-12: db.scope({@col:val}) →
      scoped NormDb; Entity({scope}) static preset (merged under
      runtime scope). Equality-only (operators/arrays rejected);
      GRACEFUL (entity lacking the column queried unscoped); applies to
      find/count/delete (WHERE AND), insert (auto-fill + reject
      conflict), update (WHERE AND + reject payload moving row out of
      scope); NormResult.scoped carries the applied filter; survives
      transaction(); raw()/query() bypass + warn. Live-proven on all 4
      dialects incl. Mongo. Entity {scope} PRESET REMOVED 2026-07-12
      (user: redundant — runtime db.scope covers multi-tenant, VIEWs
      cover static read-models; a hardcoded equality in the base entity
      makes the column pointless + hides an always-on filter). Case 2
      TYPED SCOPED HANDLE LANDED: NormDb<R,Scope>; scope<const S>()
      unions ScopeKeysOf<S>; RepoFor<R,K,Scope>→Repo<R,Self,D,Scope>;
      insert(data: ScopedInsertOf<D,Scope>) relaxes scope∩insertable
      cols to optional (Omit + Partial re-add). db.scope({country})
      .insert() drops country, base db still requires it, chaining
      accumulates, non-scope required cols stay required — 6 type
      assertions + @ts-expect-error pinned; type-depth ceiling did NOT
      bite. Soft-delete: DECLINED (user: business logic, Norm is data
      mgmt).
- [x] Encryption key rotation LANDED 2026-07-13: key-id versioned
      ciphertext (`k1.<fp>.<body>`) + standalone `rotateKey(db, {oldKey,
      newKey})` (NOT a migration — admin/downtime op). Resumable,
      idempotent, upgrades legacy cells. Online keyring deferred.
- [x] M2M RATIFIED + LANDED 2026-07-11: VIEW entities may declare
      LOGICAL fk (join + reverse derivation, never DDL). Junction-join
      views make M2M a one-call projection — suite step 13b. ON HOLD
      per user: m2mView() generator; nested-to-one JSON depth-2.
- [x] onDelete/onUpdate referential actions LANDED 2026-07-12: FK def
      gains onDelete/onUpdate (CASCADE/RESTRICT/NO_ACTION/SET_NULL —
      SET_DEFAULT excluded, MariaDB no-ops it). Threaded through
      definition→snapshot→diff→OQL FK constraint (OQL already emitted
      ON DELETE/UPDATE); asserts validate the enum + reject on VIEW
      logical fks. Live: Profiles.User = CASCADE, step 18c proves
      firing on SQLite/PG/Maria. DRIVER FIX en route: SQLite
      foreign_keys pragma was OFF on Bun (ON in Deno/Node) — adapter
      now forces PRAGMA foreign_keys=ON uniformly on every connection.
- [x] Nested writes / connect / set — DECLINED BY DESIGN 2026-07-12
      (user: "it can be achieved [via transaction], just not the same
      fluent way. I pref this so it does not confuse developers"). Same
      category as the declined nested READS, soft-delete, and the removed
      entity scope preset: a fluent nested payload hides ordering + a
      transaction and drags in ambiguous disconnect/set semantics vs the
      onDelete actions. Sanctioned pattern = explicit `transaction()`
      (parent first, its pk feeds children's FK); documented as a Guide
      recipe ("Writing across relations"). Zero new API surface.
- [x] SAVEPOINT nested transactions LANDED 2026-07-12, then MOVED INTO
      DRIVERS (user "Can you implement it in drivers itself?"):
      `transaction()` inside an open tx opens a SAVEPOINT on the SAME
      engine tx instead of throwing; same handle reused; NO transaction*
      events for savepoints. **Driver-owned:** SQLEngine gained a per-tx
      savepoint STACK (TxRecord.savepoints/spCounter) + typed
      createSavepoint / releaseSavepoint / rollbackToSavepoint (Executor
      seam; bindTx forwards; Mongo rejects); norm `__savepoint` calls the
      typed methods (no raw SQL). **LIMITATION CLOSED:** SQLEngine's
      auto-rollback-on-failure is now SAVEPOINT-AWARE — a SQL-level
      failure inside a savepoint rolls back to the innermost savepoint,
      not the whole tx, keeping the outer tx alive (also clears PG's
      aborted-tx state). So BOTH JS-level AND SQL-level failures in a
      nested block now recover. Live-green sqlite/pg/maria (suite 17b now
      does a real pk-collision recovery; Mongo skips); driver unit tests
      (stack LIFO + TRANSACTION_NOT_FOUND) + norm unit tests (seam
      sequence + failure paths). Docs updated (limitation removed).
      Adversarial review DONE (12-agent): 4 findings fixed — auto-rollback
      state-guard + fall-back-to-full-rollback when ROLLBACK TO fails
      (MariaDB deadlock zombie-tx); stack trimmed in `finally` (no
      DB-drift); SQLite `SAVEPOINT`/`RELEASE` exempt from the
      prepared-statement-cache flush. 721 drivers steps green.
- [ ] Drift detection against the live database + introspection/baselining.

## Approved — later (after cleanup + comparison closure)

- [x] Raw-SQL query method LANDED 2026-07-12: `db.raw<R>(sql, params?)`
      on the Norm facade (NOT entity-bound, per user). Executor.raw seam:
      SQL engines pass through to engine.execute({sql,params}); Mongo
      throws NormUnsupportedError; bindTx binds the txId. Named `:name:`
      params only (injection-safe path); rows RAW (no decrypt/afterRead/
      hash-rewrite); RAW op event. Live step 08r on SQL dialects (proves
      ciphertext comes back undecrypted); Mongo skips 08r.

## Adoption & performance backlog (2026-07-13 sleep-session analysis)

### Benchmarks — YES, norm needs them (currently ZERO `.bench.ts`)

The repo has a bench culture — 33 `.bench.ts` files (crypt, drivers,
guardian, id, radrouter, slogger, utils), including _comparison_ benches
(`guardian-vs-zod.bench.ts`, `RadRouter.compare.bench.ts`,
`postgres/Engine.compare.bench.ts`). NORM and OQL have none. Given the
known PBKDF2-per-cell cost (~20ms per encrypted/hashed cell, no key cache
— a real production cliff), norm is the package that MOST needs numbers.
Recommended `deno bench` suite over a MOCK executor (isolates norm's own
overhead from DB latency):

- [~] **Crypto cost (headline)** — PARTIALLY DELIVERED 2026-07-13 by
  `rotate.bench.ts` (norm's FIRST bench): per-cell encrypt ≈ 22 ms /
  decrypt ≈ 22 ms (PBKDF2 210k cliff confirmed), key-id envelope
  overhead ~1% on writes / ~0% on reads, classification ~10 ns,
  per-cell rotation ≈ 44 ms. STILL OPEN: the row-with-N-columns and
  page-of-M-rows AGGREGATE shape over a mock executor (isolate norm's
  loop overhead from the raw KDF), and hash-per-cell.
- [ ] **Translate + envelope overhead** — one-time compile (registry →
      Runtime) vs per-op cost of find/insert/update with crypto OFF, so
      it isolates OQL translate + Guardian validate + NormResult assembly
      from the DB. Target: norm overhead ≪ DB latency.
- [ ] **Hashed-filter rewrite** — digest-on-sibling rewrite vs plain
      equality; **projection/eager** — JSON_ROW aggregate + mask compute
      vs flat select.
- [ ] **`Norm.compare.bench.ts`** (repo pattern) — norm vs raw driver
      (`db.raw`) for the same query = the "what the ORM costs me" number;
      optionally vs Drizzle/Prisma on the same SQLite for a market datapoint.

Wire into `deno task bench`. Bench files need the
`/// <reference lib="deno.ns" />` header (bun-types shadows the Deno
global).

### DB reach / edge — the top adoption gap (analysis in drivers/TODO.md)

The 4 drivers already alias to a wide managed-DB set (Aurora / AlloyDB /
Timescale / CockroachDB / Yugabyte / TiDB / Vitess / DocumentDB / Cosmos
— see `packages/drivers/TODO.md`, 2026-07-13). norm is engine-agnostic
above the executor seam, so it inherits every new driver for free. norm's
own follow-on work to make aliasing clean:

- [~] **Capability-aware Migrator** — advisory-lock half DONE 2026-07-13
  (engine self-declares `advisoryLock`; the Migrator already no-ops when
  it is false, so CockroachDB works — file lock backstops). REMAINING:
  the "no-FK / app-enforced" mode for FK-less backends (PlanetScale) —
  skip FK constraint DDL when `referentialActions:false` (plan-hash
  interaction, tracked in drivers/TODO.md).
- [ ] **Edge/serverless** is unblocked purely by the drivers (Neon HTTP,
      Turso, D1, PlanetScale HTTP drivers) — no norm changes needed. This
      is the single highest-leverage adoption move (the edge market
      Drizzle owns).

### Competitive comparison (2026-07-13, ranked gaps)

Expanded adversarial comparison — 6 lenses (vs Drizzle / Prisma / Kysely /
TypeORM+MikroORM+Sequelize+Objection / ecosystem-reach / self-critique) →
synthesis. 24 deduped ranked gaps (10 high, 10 medium, 4 low; 2 small-effort).

**Positioning (synthesis):** NORM wins decisively for security-first teams
with regulated data on heterogeneous engines (incl. Mongo) inside the
TundraLibs stack — in-core searchable at-rest encryption, write-path
validation, hash-verified migrations, write-enforcing tenant scope, no
codegen, live on 4 engines × 3 runtimes. It lags on **productization, not
capability**: unpublished, no CLI, no edge drivers, no introspection.

**⚠ Two findings VERIFIED in source — actionable now (need a design call):**

- [x] **[high, effort SMALL] Crypto read-path drops a whole page on one bad
      cell — FIXED 2026-07-13.** Every decrypt call-site now routes through
      `Repo._decryptCell` with per-cell try/catch and an `onDecryptFailure`
      policy: `'null'` (default) degrades the one cell to `null` + emits a
      metadata-only `decryptError` event (`entity, column, pk, reason`) and
      the rest of the page survives; `'throw'` raises a typed
      `NormCryptoError` naming entity/column/pk. `reason` is
      `'decrypt'`|`'decode'`. Tests: `crypto-read.test.ts` (live SQLite,
      3 runtimes). Docs: NORM-Security.md → "Read-path decrypt failures".
- [x] **[high] Capabilities gated on the dialect LITERAL — FIXED 2026-07-13.**
      `sqlExecutor` now reads `engine.Capabilities.{advisoryLock,inPlaceAlter}`
      + `engine.Dialect` instead of switching on `engine.Engine` (no more
      `'sqlite'` fallback for an unknown label). Drivers gained self-declared
      capabilities + `CockroachEngine`/`PlanetScaleEngine` alias engines (see
      `drivers/TODO.md`). advisoryLock now fails closed on a no-lock engine.
      REMAINING: the Migrator honoring `referentialActions:false` (PlanetScale
      FK skip) — declared on the driver but not yet consumed (plan-hash
      interaction; tracked in drivers/TODO.md).

**Ranked gaps — productization (dominant blockers, high sev / large effort):**

- [ ] #1 Unpublished + zero ecosystem/docs-reach/LLM-familiarity
      (`1.0.0-dev0.0`, not on JSR/npm; no API reference, ~no runnable
      `@example`s). NORM's own "walk-away reason: nothing to read yet."
      Publishing is small; ecosystem is large + time-gated. Raised by ALL 6 lenses.
- [ ] #2 No edge/serverless HTTP drivers (Neon/D1/Turso/PlanetScale) — see
      `drivers/TODO.md`; unblocked by drivers, no norm-core change.
- [ ] #3 No introspection / db-pull / drift-vs-live-DB / baselining →
      greenfield-only (most adoption is brownfield). Migrator is
      snapshot-vs-FNV only; never reads the live schema.
- [ ] #4 No CLI (migrate/generate/push/pull/studio) — declined list says
      "(waits)", i.e. deferred sequencing, not a principled decline. [medium]

**Capability:**

- [ ] #8 [high] Advanced SQL not expressible: arbitrary join predicates,
      CTEs/recursive, window functions, set ops, ad-hoc subqueries, CASE.
- [x] #7 [high] Encryption key rotation — LANDED 2026-07-13. Ciphertext now
      carries a key-id envelope (`k1.<fp>.<body>`; un-stamped = legacy);
      `rotateKey(db, {oldKey, newKey, chunkSize, dryRun, onProgress})` pages
      each encrypted table and re-encrypts old→new, resumable + idempotent
      (skips already-newKey cells, upgrades legacy). SHA-256 siblings are
      plaintext-derived → rotation-invariant. v1 downtime-first (no online
      keyring yet). Tests: `rotate.test.ts` ×3 runtimes. Docs: NORM-Security
      → "Key rotation".
- [ ] #12 [medium] Thin column-type palette: no PG enum/array/tsvector/
      geometry, no `customType`, no CHECK, no partial/expression indexes.
- [ ] #16 [medium] Narrower hooks: no after-WRITE hooks (see persisted
      result) and no global/cross-entity subscribers.
- [ ] #21 [medium] Narrower engine breadth vs decorator ORMs (no MSSQL/
      Oracle/Spanner); NORM uniquely adds Mongo. [large]
- [ ] #22 [low] No polymorphic associations / STI / embeddables. [large]

**Ergonomics:**

- [ ] #9 [high] Escape hatch weak: `raw()` untyped + crypto-blind (returns
      ciphertext); `query(IR)` capped at OQL. The out for gap #8 is unsafe.
- [ ] #18 [medium] First-class M2M needs a junction VIEW (read-only ceremony).
- [ ] #19 [medium] `@`-prefix string-keyed refs leak OQL through 5 option
      positions (filter/projection/orderBy/aggregates/scope). Typed, but verbose.
- [ ] #14 [medium] No seed/fixtures framework.
- [ ] #15 [medium] No programmable `$extends` (custom methods, interception,
      plugins). [large]
- [ ] #20 [low] No `DATABASE_URL` / `postgres://` URL parser for PG/Maria/
      SQLite (only Mongo takes a URI). [small] — every provider hands a URL.

**Performance:**

- [ ] #6 [high] PBKDF2-per-cell cliff (210k iters, per-cell salt, no cache) —
      envelope-encryption / key-caching redesign. [large]
- [ ] #11 [medium] Zero benchmarks (see the Benchmarks section above).
- [ ] #17 [medium] No user-facing prepared statements; recompiles IR→SQL/call.

**Observability / tooling / maintainability:**

- [ ] #13 [medium] No OpenTelemetry / metrics / traceparent bridge (additive —
      the bus stays metadata-only by design).
- [ ] #24 [low] No Studio / GUI data browser.
- [ ] #23 [low] Repo.ts = 2,533-line single class w/ scattered dialect-string
      knowledge (1 `@example`, 114 `as` casts) — maintainability debt.

**Moat (do not regress):** searchable in-core at-rest encryption
(`.encrypt().hash()` transparent filter rewrite + `.mask()`); ONE typed
surface across SQLite/PG/Maria/**Mongo**; apply-time hash-verified migration
plans + locks + crypto rebuild; write-path Guardian validation; no
codegen/decorators/engine-binary; write-enforcing `db.scope`; mock-seam + one
engine-parametrized live suite; metadata-only (leak-proof) event bus.

## Deliberately declined

- Nested relation linkage (depth-2+ sub-projections, ORM-style deep
  include/with) — DECLINED BY DESIGN 2026-07-11. Depth-1 to-one is row
  completion; bounded to-many JSON aggregates are document
  composition; composed multi-hop shapes are DECLARED READ MODELS
  (VIEWs with logical fk — the sanctioned mechanism); genuinely
  graph-shaped needs are explicit application composition. All three
  industry strategies (JOIN fan-out + identity-map rebuild, batched
  stitching, DB-side nested JSON) fail nested pagination — the shape
  is wrong, not the implementations.

- findByUnique resurrection (transparent hashed filters + typed find cover it).
- Instance-level hashAlgorithm (moot: v4's own sibling DDL was VARCHAR(64);
  CryptoOverrides.hash is the escape hatch).
- update()/delete() RETURNING (not supported across all engines — by design).
- Required filter on update()/delete() (optionality stays; events replace warn).
- CLI (waits).
