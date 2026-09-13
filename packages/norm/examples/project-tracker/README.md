# Project tracker — a NORM example

A small task board: members and a SELF-referential `Tasks` table
(every task can have subtasks), over an in-memory SQLite database.
Every file is meant to be copied wholesale into a real project. Run it
on any runtime:

```bash
deno run --allow-all packages/norm/examples/project-tracker/main.ts
bun run packages/norm/examples/project-tracker/main.ts
node --import tsx packages/norm/examples/project-tracker/main.ts
```

| File        | Shows                                                                                                        |
| ----------- | ---------------------------------------------------------------------------------------------------------- |
| `schema.ts` | `Members`, `Tasks` — a self-referential FK (`ParentTaskId` → its own table), a Guardian-validated JSON `Metadata` column, a per-entity read `cache`, and a blanket-delete guard |
| `main.ts`   | seven numbered scenarios, run top to bottom: Migrator create, seeding, the self-reference, eager nested projection, read caching, `beforeDelete`, and `SET_NULL` promotion |

This example deliberately overlaps as little as possible with
[../subscription-billing](../subscription-billing),
[../helpdesk](../helpdesk), and [../order-fulfillment](../order-fulfillment)
— no encryption, no `temporal`/`audit`, no password columns, no
many-to-many view. What it shows instead:

- **A self-referential foreign key** — `Tasks.ParentTaskId` names
  `model: 'Tasks'`, its OWN registry key. One entity, two relations:
  `@Subtasks` (the reverse) and the ordinary `@Assignee` FK onto
  `Members`, both eager-projectable in a single `find()` call.
- **`Column.json(schema)` really does validate on the way in — but
  read it back as TEXT** — SQLite has no native JSON type, so what a
  `find()`/`insert()` returns for that column is the stored JSON
  string, not a parsed object. `JSON.parse()` it yourself (scenario 3).
  Easy to miss if you assume every column round-trips as its TS type.
- **A per-entity read cache** — `Tasks` declares `cache: 5` (minutes);
  the `Norm` instance opts in engine-wide with `cache: {}`. A second
  identical `find()` is served from cache — observable here via the
  `_oncacheHit` event handler, wired inline at construction.
- **`hooks.beforeDelete` as a blanket-delete guard** — it only ever
  sees the caller's FILTER, never rows, so the one thing it can
  enforce is "was a filter even supplied": refusing the "wipe the
  whole task list" footgun without touching any real, filtered delete.

norm constructs and owns the SQLite engine itself from the `database`
config. `import '@tundralibs/norm/engines/sqlite'` registers the
dialect (the one engine held out of the root barrel; see the README's
"Choosing an entry point"). The one extra install is
`@tundralibs/compat`, for a cross-runtime temp directory the Migrator
writes its snapshot files into; the cache engine (`MEMORY`, in-process)
needs no setup either. The database itself is `:memory:`, so that is
the only disk write the example makes, and it is removed when the run
finishes.

Expected shape of the output (ids vary run to run; ordering does not):

```text
▶ 1. Migrator: schema created
{ "snapshot": { "version": 1, "written": true }, "applied": [1] }

▶ 2. Members seeded
{ "members": ["Priya Shah", "Sam Ortiz"] }

▶ 3. A self-referential parent/subtask pair
{ "parent": "Ship the v2 API", "metadataIsRawText": true, "metadataParsed": {"labels":["api","q3"],"estimateHours":40}, "subtaskCount": 2 }

▶ 4. One find(), parent + its assignee + its subtasks
{ "title": "Ship the v2 API", "assignee": "Priya Shah", "subtasks": ["Design the schema", "Write the migration"] }

▶ 5. A repeated read is served from the per-entity cache
{ "cacheHitObserved": true }

▶ 6. beforeDelete refuses a filter-less delete; a real one works
{ "blanketDeleteBlocked": true, "taskCountBefore": 3, "taskCountAfter": 2 }

▶ 7. Deleting the parent promotes its subtask to top-level
{ "subtaskSurvives": true, "parentTaskIdAfter": null }
```

## What to take for your own project

| Feature demonstrated                                | Read next                                                                                  |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| Reverse relations, eager projection                  | [../../docs/NORM-Schema.md](../../docs/NORM-Schema.md#reverse-relations)                     |
| `Column.json(schema)`                                | [../../docs/NORM-Schema.md](../../docs/NORM-Schema.md#json-schemas)                          |
| Read caching (`cache`, `_oncacheHit`)                 | [../../docs/NORM-Caching.md](../../docs/NORM-Caching.md)                                     |
| `hooks.beforeDelete`                                  | [../../docs/NORM-Schema.md](../../docs/NORM-Schema.md#hooks)                                  |
| Referential actions (`SET_NULL`)                      | [../../docs/NORM-Schema.md](../../docs/NORM-Schema.md#referential-actions)                    |
