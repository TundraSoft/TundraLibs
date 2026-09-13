/**
 * Project tracker — members and a self-referential Tasks table (every
 * task can have subtasks), over an in-memory SQLite database.
 *
 *   schema.ts   Members, Tasks (`ParentTaskId` points at ANOTHER row
 *               in the same table; a Guardian-validated JSON
 *               `Metadata` column; a 5-minute read cache; a blanket-
 *               delete guard).
 *   main.ts     this file — numbered scenarios, run top to bottom.
 *
 * Run on any runtime:
 *
 * ```bash
 * deno run --allow-all packages/norm/examples/project-tracker/main.ts
 * bun run packages/norm/examples/project-tracker/main.ts
 * node --import tsx packages/norm/examples/project-tracker/main.ts
 * ```
 *
 * Zero external infra — SQLite runs in-process (`:memory:`); the
 * in-process `MEMORY` cache engine needs no setup either.
 *
 * @module
 */
import '@tundralibs/norm/engines/sqlite';
import { Norm } from '@tundralibs/norm';
import { Migrator } from '@tundralibs/norm/migrations';
import { ProjectTrackerSchema } from './schema.ts';
// Needs a separate install: deno add @tundralibs/compat
import { makeTempDir, removeDir } from '@tundralibs/compat/file';

const say = (title: string, value: unknown) =>
  console.log(`\n▶ ${title}\n${JSON.stringify(value, null, 2)}`);

const migDir = await makeTempDir({ prefix: 'norm-project-tracker-' });
let cacheHits = 0;
const norm = new Norm({
  database: { dialect: 'sqlite', path: ':memory:' },
  // Engine-wide switch; only entities that declare their OWN `cache`
  // TTL (Tasks, here) are actually cached.
  cache: {},
  // `_on<event>` keys register listeners inline — no separate .on()
  // call. cacheHit fires on every read served WITHOUT touching SQLite.
  _oncacheHit: () => {
    cacheHits += 1;
  },
});

try {
  // ─── 1. Migrator: create the schema ────────────────────────────────
  const db = norm.use(ProjectTrackerSchema);
  const mig = new Migrator(db, { dir: migDir });
  const snap = await mig.snapshot();
  const applied = await mig.apply();
  say('1. Migrator: schema created', {
    snapshot: { version: snap.version, written: snap.written },
    applied: applied.applied,
  });

  // ─── 2. Members ─────────────────────────────────────────────────────
  const members = (await db.repo('Members').insert([
    { Name: 'Priya Shah', Email: 'priya@tracker.dev' },
    { Name: 'Sam Ortiz', Email: 'sam@tracker.dev' },
  ])).data;
  const [priya, sam] = members;
  say('2. Members seeded', { members: members.map((m) => m.Name) });

  // ─── 3. Self-referential FK: a task with subtasks ──────────────────
  // ParentTaskId points at ANOTHER row of the SAME `tasks` table —
  // `model: 'Tasks'` in schema.ts names this entity's own registry key.
  const tasks = db.repo('Tasks');
  const parent = (await tasks.insert({
    Title: 'Ship the v2 API',
    AssigneeId: priya!.Id,
    Metadata: { labels: ['api', 'q3'], estimateHours: 40 },
  })).data[0]!;
  const subtasks = (await tasks.insert([
    { Title: 'Design the schema', ParentTaskId: parent.Id, AssigneeId: sam!.Id },
    {
      Title: 'Write the migration',
      ParentTaskId: parent.Id,
      AssigneeId: sam!.Id,
    },
  ])).data;
  say('3. A self-referential parent/subtask pair', {
    parent: parent.Title,
    // Validated as an object on the way IN; SQLite has no native JSON
    // type, so what comes back is the stored JSON TEXT — parse it
    // yourself if you want a live object back.
    metadataIsRawText: typeof parent.Metadata === 'string',
    metadataParsed: JSON.parse(parent.Metadata as unknown as string),
    subtaskCount: subtasks.length,
  });

  // ─── 4. Eager projection: parent + subtasks + assignee, one call ───
  // `@Subtasks` is the reverse of the self-referential FK; `@Assignee`
  // is the plain forward FK. Both resolve in the SAME SELECT — no
  // pivoting from the caller, no N+1.
  const withRelations = await tasks.findOne({ '@Id': parent.Id }, {
    project: {
      '@Title': true,
      '@Assignee': { '@Name': true },
      '@Subtasks': { '@Title': true, '@Status': true },
    },
  });
  say('4. One find(), parent + its assignee + its subtasks', {
    title: withRelations.data!.Title,
    assignee: withRelations.data!.Assignee?.Name,
    subtasks: withRelations.data!.Subtasks?.map((s) => s.Title),
  });

  // ─── 5. Read caching: a second identical read never touches SQLite ─
  // Tasks declares `cache: 5` (minutes); the FIRST find() populates the
  // cache, the SECOND is served from it — cacheHit fires, no `call`.
  const cacheKeyFilter = { '@AssigneeId': sam!.Id };
  await tasks.find(cacheKeyFilter); // populates the cache
  const hitsBefore = cacheHits;
  await tasks.find(cacheKeyFilter); // identical read — served from cache
  say('5. A repeated read is served from the per-entity cache', {
    cacheHitObserved: cacheHits > hitsBefore,
  });

  // ─── 6. beforeDelete: refuse a filter-less delete ──────────────────
  // The blanket-delete footgun — deleting EVERY task — is refused
  // before it ever reaches SQL; a real filter still works normally.
  let blanketDeleteBlocked = false;
  try {
    await tasks.delete();
  } catch {
    blanketDeleteBlocked = true;
  }
  const beforeCount = (await tasks.count()).count;
  await tasks.delete({ '@Id': subtasks[1]!.Id });
  const afterCount = (await tasks.count()).count;
  say('6. beforeDelete refuses a filter-less delete; a real one works', {
    blanketDeleteBlocked,
    taskCountBefore: beforeCount,
    taskCountAfter: afterCount,
  });

  // ─── 7. SET_NULL: deleting a parent promotes its remaining subtask ─
  await tasks.delete({ '@Id': parent.Id });
  const promoted = await tasks.findOne({ '@Id': subtasks[0]!.Id });
  say('7. Deleting the parent promotes its subtask to top-level', {
    subtaskSurvives: promoted.data !== null,
    parentTaskIdAfter: promoted.data!.ParentTaskId, // null, not a dangling FK
  });
} finally {
  await norm.disconnect();
  await removeDir(migDir, { recursive: true });
}
