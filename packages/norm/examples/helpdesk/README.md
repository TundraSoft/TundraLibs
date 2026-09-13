# Helpdesk — a NORM example

A support-ticket backend: agents, tickets, and an activity log, over
an in-memory SQLite database. Every file is meant to be copied
wholesale into a real project. Run it on any runtime:

```bash
deno run --allow-all packages/norm/examples/helpdesk/main.ts
bun run packages/norm/examples/helpdesk/main.ts
node --import tsx packages/norm/examples/helpdesk/main.ts
```

| File         | Shows                                                                                                       |
| ------------ | ------------------------------------------------------------------------------------------------------------ |
| `schema.ts`  | `Agents` (`Column.password('PBKDF2')`), `Tickets` (SLA hook, idempotent `ExternalRef`, `defaultPageSize`), `TicketNotes` (two independent FKs, `SET_NULL` vs `CASCADE`) |
| `seed.ts`    | two agent credentials (plaintext, purely so `main.ts` has something to hash and verify)                     |
| `main.ts`    | seven numbered scenarios, run top to bottom: Migrator create, login via `pbkdf2Verify`, batch insert + a hook-computed SLA clock, idempotent `upsert()`, referential actions, filters + pagination, and `guardians` |

This example deliberately overlaps as little as possible with
[../subscription-billing](../subscription-billing) — no `temporal`,
`audit`, or `.encrypt()`. What it shows instead:

- **`Column.password('PBKDF2')`** — a SALTED digest, never equality-
  filterable (contrast with subscription-billing's `Email`, a
  deterministic `.encrypt().hash()` chosen there because the app
  needs to look a customer up by it). "Log in" is read-the-row-then-
  `pbkdf2Verify(candidate, stored)`, not find-by-hash.
- **A hook computing a value the caller never supplies** — `DueAt` has
  no default; `beforeInsert` (which runs BEFORE validation) derives it
  from `Priority`, so it's never part of the insert shape at all.
- **`upsert()`** — idempotent ingestion keyed on a caller-supplied
  `ExternalRef`, the shape a webhook redelivery needs.
- **Two referential actions on the same schema** — `SET_NULL`
  (un-assign a ticket when its agent is removed) versus `CASCADE`
  (a note cannot outlive its ticket).
- **`defaultPageSize`** — an unbounded `find()` is capped at the
  entity's declared page size; `{ total: true }` still reports the
  real match count, and `{ limit, offset }` pages past it.
- **`db.repo(key).guardians`** — validating an inbound webhook payload
  BEFORE `upsert()` ever runs, catching an invalid `Priority` value
  with the exact rules `upsert()`'s own insert-side Guardian applies.

norm constructs and owns the SQLite engine itself from the `database`
config. `import '@tundralibs/norm/engines/sqlite'` registers the
dialect (the one engine held out of the root barrel; see the README's
"Choosing an entry point"). The one extra install is
`@tundralibs/compat`, for a cross-runtime temp directory the Migrator
writes its snapshot files into. The database itself is `:memory:`, so
that is the only disk write the example makes, and it is removed when
the run finishes.

Expected shape of the output (ids and hour counts vary run to run;
ordering does not):

```text
▶ 1. Migrator: schema created
{ "snapshot": { "version": 1, "written": true }, "applied": [1] }

▶ 2. Agents: salted PBKDF2 credential, verified by re-hashing
{ "agentsSeeded": 2, "loginChecksPassed": true }

▶ 3. Batch insert: one row per priority, DueAt from the SLA hook
{ "dueDates": [{"priority":"urgent","hoursFromNow":2}, {"priority":"low","hoursFromNow":72}, {"priority":"normal","hoursFromNow":24}] }

▶ 4. upsert(): a replayed webhook updates in place, no duplicate
{ "sameRow": true, "rowCountForExternalRef": 1, "subjectAfterRedelivery": "App crashes on login" }

▶ 5. SET_NULL un-assigns; CASCADE removes the dependent notes
{ "ticketSurvivesAgentDelete": true, "assignedAgentIdAfterAgentDelete": null, "noteCountAfterAgentDelete": 2, "noteCountAfterTicketDelete": 0 }

▶ 6. $in/$or filters + defaultPageSize-bounded find()
{ "highPriorityOpenCount": 1, "totalTicketsInTable": 8, "unpaginatedRowsReturned": 5, "page2RowCount": 2 }

▶ 7. guardians: a malformed webhook delivery never reaches upsert()
{ "rejected": true, "message": "Object validation failed with 1 error(s)" }
```

## What to take for your own project

| Feature demonstrated                                  | Read next                                                                                              |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| `Column.password()` / `Column.hash()`                  | [../../docs/NORM-Security.md](../../docs/NORM-Security.md#password-columns--columnpassword)             |
| `hooks.beforeInsert` and hook/validation ordering       | [../../docs/NORM-Schema.md](../../docs/NORM-Schema.md#hooks)                                             |
| `upsert()`                                              | [../../README.md](../../README.md#querying)                                                              |
| Referential actions (`onDelete`)                        | [../../docs/NORM-Schema.md](../../docs/NORM-Schema.md#referential-actions)                                |
| `defaultPageSize`, `limit`/`offset`/`total`             | [../../docs/NORM-Querying.md](../../docs/NORM-Querying.md)                                               |
| `db.repo(key).guardians`                                | [../../docs/NORM-Schema.md#whole-row-guardians-insertupdate](../../docs/NORM-Schema.md#whole-row-guardians-insertupdate) |
