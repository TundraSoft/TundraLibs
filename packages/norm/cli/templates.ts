/**
 * @fileoverview Project templates for `norm init`, kept as plain, EDITABLE
 * string constants — one per file. `{{token}}` placeholders are filled by
 * {@link render}. Every file here is dialect-agnostic: the dialect lives in
 * `configs/Norm.yaml` (data), never in code, so nothing in this file
 * branches on it.
 * @module
 */

/** Replace every `{{key}}` in `tpl` from `vars`. */
export const render = (tpl: string, vars: Record<string, string>): string =>
  tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? '');

// ── templates ───────────────────────────────────────────────────────────

export const MODEL_SAMPLE = `import { Column, Entity } from '@tundralibs/norm';

/** A minimal norm entity — adjust to your schema. */
export const Users = Entity('users', {
  id: Column.uuid().default({ $$_expression: 'UUID' }),
  email: Column.varchar(255),
  createdAt: Column.timestamp(),
}, { pk: ['id'] });
`;

export const MODELS_BARREL = `import { Schema } from '@tundralibs/norm';
import { Users } from './Users.ts';

/** The named schema norm.use() consumes. */
export const AppSchema = Schema('App', { Users });
`;

/**
 * The connection config lives here, as DATA — never in \`db.ts\`. Defaults
 * to a local SQLite file (zero external service). Every dialect norm
 * supports is shown below, but DRY rather than copy-paste-ready: the
 * network fields postgres/maria/mongo/neon all share (host/username/
 * password/database) are written once, and each dialect's own delta
 * (port, or its own alternative shape) follows — field names verified
 * against the real @tundralibs/drivers engine option types, not guessed.
 * Switching dialects means changing \`dialect:\` and adding that dialect's
 * fields; \`db.ts\` never changes either way.
 */
export const NORM_YAML =
  `# Read by db.ts via @tundralibs/utils' loadConfig() — this file becomes
# config set 'norm' (basename, lowercased); \${VAR} placeholders resolve
# from a sibling .env when present. To switch dialects: set \`dialect:\`
# below and add that dialect's fields (shared network fields are listed
# once further down, then each dialect's own on top of those) — db.ts
# never changes either way.

NORM_DB:
  dialect: sqlite # postgres | maria | mongo | neon | turso | d1
  path: ./data
  # readonly: false
  # create: true

# --- postgres / maria / mongo / neon share these network fields ---
#   host: \${DB_HOST}
#   username: \${DB_USERNAME}
#   password: \${DB_PASSWORD}
#   database: \${DB_NAME}

# -- postgres --
#   port: 5432
#   # also: applicationName, statementTimeoutMs, allowCleartextPassword

# -- maria (MySQL / MariaDB) --
#   port: 3306

# -- mongo --
#   port: 27017
#   # or, instead of host/username/password/database above:
#   # uri: \${MONGO_URI}

# -- neon (Postgres over HTTP — edge/Workers-safe) --
#   # host is required, port is unused
#   # or, instead of username/password/database above:
#   # connectionString: \${NEON_CONNECTION_STRING}

# --- sqlite (in-memory, e.g. for tests) — no network fields at all ---
#   path: ':memory:'

# --- turso (libSQL over HTTP — edge/Workers-safe) — its own shape ---
#   url: \${TURSO_URL}
#   authToken: \${TURSO_AUTH_TOKEN}

# --- d1 (Cloudflare D1 over HTTP — edge/Workers-safe) — its own shape ---
#   accountId: \${D1_ACCOUNT_ID}
#   databaseId: \${D1_DATABASE_ID}
#   apiToken: \${D1_API_TOKEN}
`;

export const DB =
  `// Dialect-agnostic on purpose: the dialect is DATA (configs/Norm.yaml),
// never code here — switching databases never touches this file.
// sqlite registers via its own import (the other dialects come from the
// barrel norm's root import already pulls in).
import '@tundralibs/norm/engines/sqlite';
import { Norm } from '@tundralibs/norm';
import { loadConfig } from '@tundralibs/utils';
import { AppSchema } from './models/mod.ts';

const configDir = new URL('./configs', import.meta.url).pathname;
const config = await loadConfig({ path: configDir, env: true });

/** One connected Norm instance for the project. */
export const norm = new Norm({ database: config.get('norm.NORM_DB') });
await norm.connect();
export const db = norm.use(AppSchema);
`;

export const GITIGNORE = `data/
.env
`;

export const README = `# {{name}}

A [norm](https://jsr.io/@tundralibs/norm) schema project.

## Schema

Declare entities under \`models/\` (\`Entity\`/\`Schema\` from
\`@tundralibs/norm\`) — a schema file never touches connection details.

## Connection

The database connection is DATA, not code: edit \`configs/Norm.yaml\` to
change dialect / host / credentials (defaults to a local SQLite file under
\`./data\`). \`db.ts\` never changes when you switch dialects.

## Tasks

- Deno: \`deno task test\` / \`fmt\` / \`lint\` / \`check\`
- Node: \`npm test\`
- Bun: \`bun test\`
`;

/**
 * The short pointer merged into `AGENTS.md` — the CONTENT lives in the
 * dedicated `norm.agent.md` file (see {@link AI_GUIDE_SECTION}), so a
 * user's own notes elsewhere survive every `upgrade`. Agents that read
 * `AGENTS.md` (Cursor, Codex) do not follow links on their own, so it
 * also carries the never-hand-roll checklist. Reused as-is by rapid's CLI
 * when scaffolding a `--norm` project.
 */
export const AI_GUIDE_LINK =
  `Read [norm.agent.md](./norm.agent.md) before writing data-layer code.
norm already provides — never hand-roll: migrations (\`Migrator\`, no hand
SQL DDL), pagination with \`total\`, aggregates/GROUP BY, request
validators (\`repo.guardians\`), temporal and audit history tables,
at-rest encryption with searchable hashes, PBKDF2 password columns, key
rotation, tenant scoping, read caching, transactions.`;

/** The `CLAUDE.md` section: an `@` import, so Claude Code loads the whole
 * guide into context rather than only seeing a link it may not follow. */
export const AI_GUIDE_IMPORT = `@norm.agent.md`;

/** The full guide — written wholesale to \`norm.agent.md\` by \`norm init\`/
 * \`upgrade\` (and by rapid's \`--norm\` scaffold, imported rather than
 * copied). Regenerated in full every time; never hand-edit this file. */
export const AI_GUIDE_SECTION = `# norm

norm is a full ORM. Before writing data-layer code, check this guide — the
features below already exist, and re-implementing them by hand (a migration
script, a history table, a hand-written request schema, a SHA-256 password
column) is the most common mistake.

## Schema

Schema lives under \`models/\`: \`Entity(name, columns, options)\` (needs a
\`pk\`) grouped by \`Schema(name, { Users, ... })\`; neither touches
connection details — never add a dialect, host, or credential to a
\`models/*.ts\` file.

\`\`\`ts
import { Column, Entity } from '@tundralibs/norm';

const Profiles = Entity('profiles', {
  userId: Column.uuid(),
  bio: Column.text().nullable(),
}, {
  pk: ['userId'],
  // Relations are FKs referencing the target's REGISTRY KEY (its key in
  // Schema(...)), never a table name. Optional: onDelete/onUpdate,
  // project: true (eager-load on default reads), reverseProject,
  // reverseCardinality: 'hasOne' | 'hasMany'.
  fk: { User: { model: 'Users', on: { userId: 'id' }, reverseAs: 'Profile' } },
});
\`\`\`

Column builders: \`varchar(n)\`, \`integer\`, \`bigint\`, \`decimal(p, s)\`,
\`float\`, \`double\`, \`real\`, \`boolean\`, \`json<T>()\` (or
\`json(Guardian.object(...))\` to infer the shape), \`date\`, \`time\`,
\`datetime\`, \`timestamp\`, \`timestamptz\`, \`uuid\`, \`text\`, \`blob\`.
ID factories that generate their own value: \`ulid()\`, \`cuid()\`, \`cuid2()\`,
\`nanoId()\`, \`objectId()\`, \`simpleId()\` (a BIGINT).
\`password('PBKDF2')\` is the column for passwords (salted; verify with
\`pbkdf2Verify(candidate, row.password)\`, exported by norm) — add
\`.hidden()\` so it stays out of default reads. \`hash('SHA-256')\` is a
plain one-way digest (tokens, lookups) — never use it for passwords.
\`mask(source, fn)\` is a virtual column computed after decryption — never
stored, never sent to SQL.

Chainable on (most of) these: \`.nullable()\`, \`.guard(g)\` (an already-built
\`@tundralibs/guardian\` instance — validators AND transforms, in your own
order; pinned to the column's own concrete guardian class), \`.beforeWrite(fn)\`/
\`.afterRead(fn)\`, \`.default(v)\` and \`.defaultOnUpdate(v)\` (a value, a
function such as \`() => new Date()\`, or \`{ $$_expression: 'NOW' | 'UUID' }\`),
\`.hidden()\`/\`.unfilterable()\`, \`.insertOnly()\` (set once at insert:
\`update()\` rejects it and an upsert conflict never changes it, e.g.
\`CreatedBy\`), \`.renamedFrom('old')\` (a rename hint for migrations — data
survives instead of drop + add), \`.comment(text)\`.
\`Column.enum([...])\` is its own factory (not chained) — narrows the TS
type to the literal union, no \`as const\` needed.

Read-back types match the declared TS type on every dialect: a \`bigint\`
column (incl. \`simpleId\`) is always a \`bigint\`, a date column a \`Date\`, a
JSON column the parsed value — top-level AND inside relation values.
\`JSON.stringify\` throws on a \`bigint\`, so convert at the API edge.

## Entity kinds

\`Entity(name, columns, options)\` defaults to \`type: 'TABLE'\` (physical,
writable, needs \`pk\`). \`type: 'VIEW'\` is DB-side and read-only (\`query\`:
a stored OQL \`SELECT\`; can be joined against, optionally
\`materialized: true\`). \`type: 'QUERY'\` is client-side, read-only, and
terminal — it cannot be joined or built upon, and cannot declare \`fk\`.
Both read-only kinds take \`afterRead\` only (no write hooks); \`index\`/
\`unique\`/\`insert\`/\`update\` are TABLE-only.

## History: temporal and audit entities

Never hand-build a history or audit table — declare it:

\`\`\`ts
// Temporal: every insert supersedes the current version (EffectiveFrom/
// EffectiveTo are injected). update/upsert/delete/truncate all throw.
const Fees = Entity('fees', cols, { pk: ['Id'], temporal: { key: ['Name'] } });
// Audit: a read-only replica written on every insert/update/delete.
const Users = Entity('users', cols, { pk: ['id'], audit: { name: 'UserAudit' } });

await db.repo('Fees').find({ '@Name': 'Gold', '@AsOf': new Date('2026-04-01') });
await db.repo('UserAudit').find({ '@id': id });
\`\`\`

## Hooks

Row-level, whole-row (not per-column). TABLE gets all four; returning a
row replaces the payload, returning nothing means the hook mutated in
place:

\`\`\`ts
Entity('tickets', {/* columns */}, {
  pk: ['id'],
  hooks: {
    beforeInsert: (row) => ({ ...row, subject: row.subject.trim() }),
    beforeUpdate: (row) => row,
    afterRead: (row) => row,
    // Fires before DELETE, with the caller's filter (undefined = the
    // all-rows form) — THROW to veto. Runs for delete()/deleteByPK(),
    // not truncate().
    beforeDelete: (filter) => {
      if (filter === undefined) throw new Error('refusing unfiltered delete');
    },
  },
});
\`\`\`

\`insert\`/\`update\` options restrict which columns a caller may pass for
that operation (a "request schema" — everything else becomes norm-owned
for it); norm-maintained behavior (hash siblings, \`defaultOnUpdate\`)
always runs regardless of the list.

## Request validation

Every TABLE repo exposes the validators norm derives from its columns —
use them at the API boundary instead of re-declaring the rules:

\`\`\`ts
const body = db.repo('Users').guardians.insert.parse(json); // .update for PATCH
\`\`\`

## Querying

Read/write through \`db\` (exported from \`db.ts\`) via \`db.repo(entityKey)\`
— never a raw query unless norm's typed layer genuinely can't express it.
Every call returns a result envelope, never bare rows: \`findOne\`/\`getByPK\`
give \`{ data: row | null }\`, \`find\` gives \`{ data: rows, count }\`,
\`insert\`/\`upsert\` return the written rows, \`update\`/\`delete\` return only
\`{ count }\`.

\`\`\`ts
await db.repo('Users').insert({ email: 'a@b.com' }); // or an array: a batch
const { data: user } = await db.repo('Users').findOne({ '@email': 'a@b.com' });
await db.repo('Users').getByPK({ id });
await db.repo('Users').count({ '@role': 'admin' });
const page = await db.repo('Users').find({ '@role': 'admin' }, {
  orderBy: { '@displayName': 'ASC' },
  limit: 20,
  offset: 40,
  total: true, // page.total = all matching rows; page.count = this page
  project: { '@id': true, '@displayName': 'name', '@Profile': { '@bio': true } },
});
const { count } = await db.repo('Users').update({ role: 'admin' }, { '@id': id });
// On conflict: only the columns you passed (never keys, insert-only or
// insert-default-only ones) plus defaultOnUpdate; \`update: {...}\` sets
// exactly that instead (counters), \`updateOnConflict: []\` leaves the row.
await db.repo('Users').upsert({ email: 'a@b.com', role: 'admin' }, opts);
await db.repo('Users').delete({ '@id': id }); // delete({}) = all rows
await db.repo('Users').truncate(); // refused on a temporal or scoped entity
\`\`\`

\`find()\` with no \`limit\` returns \`defaultPageSize\` rows (default 10 — set
it per entity), NOT everything; pass \`limit: 0\` for all rows (it emits a
warning). Projection: \`'@col': true\` keeps a column, \`'@col': 'alias'\`
renames it, \`'@Relation': true\` loads the whole related row (an array for
to-many), \`'@Relation': { '@col': true }\` picks its columns.

Aggregates: the projected columns are the GROUP BY; results come back as
\`number | string | bigint\` depending on the dialect, so coerce:

\`\`\`ts
const perCountry = await db.repo('Visits').find(undefined, {
  project: { '@country': true },
  aggregates: { visits: { fn: 'COUNT', column: '@id' } }, // SUM/AVG/MIN/MAX
  limit: 0,
});
Number(perCountry.data[0]!.visits);
\`\`\`

Filters are the OQL filter language typed to your columns (\`$eq\`, \`$ne\`,
\`$gt\`/\`$gte\`/\`$lt\`/\`$lte\`, \`$in\`/\`$nin\`, \`$like\`/\`$ilike\`,
\`$startsWith\`/\`$contains\`, \`$between\`, \`$null\`, \`$or\`/\`$and\`, nested
relation refs like \`'@Profile.@bio'\`). A filter through an unprojected
to-many relation becomes a correlated \`EXISTS\` — it never fans out rows
(not on MongoDB, which has no correlated-subquery form — see the dialect
note below).

Escape hatches: \`db.query<Row>(ir, { entity })\` runs OQL IR and still
decrypts and runs \`afterRead\` for that entity; \`db.raw(sql, params)\` runs
hand-written SQL with \`:name:\` params and skips decrypt/scope/validation
(it emits a \`warning\` event every call). \`db.encrypt\`/\`db.decrypt\`/\`db.hash\`
build values for hand-written filters.

## Transactions

\`\`\`ts
await db.transaction(async (tx) => {
  await tx.repo('Users').insert({/* ... */});
  await tx.repo('Audit').insert({/* ... */});
}); // commits on resolve, rolls back on throw
\`\`\`

Nesting (\`tx.transaction(sp => ...)\`) opens a SAVEPOINT on SQL engines —
only the inner block rolls back on throw; the outer transaction survives.
A fetch-only dialect (\`neon\`/\`turso\`/\`d1\`) or MongoDB sends one request
per statement, so \`db.transaction()\` throws \`NormUnsupportedError\`
there — check \`configs/Norm.yaml\`'s active dialect before relying on it.

## Scoping (multi-tenant / default filters)

\`db.scope({ '@orgId': currentOrgId })\` returns a handle whose every read
and write carries that equality filter automatically — \`insert\` fills it
in when omitted, \`update\`/\`upsert\` refuse to move or touch a row outside
the scope, \`truncate\` is refused outright (use \`delete({})\` to clear one
scope; it carries no \`WHERE\`). An entity with no scope column is queried
unscoped, so one handle can span a mixed registry.

## At-rest encryption

\`.encrypt()\` any column — it keeps its declared TS type, only storage is
ciphertext. It needs \`new Norm({ secret })\` (use \`keyDerivation: 'HKDF'\`
on Cloudflare Workers); \`use()\` throws without one. Add \`.hash()\` to keep
it equality-searchable (e.g. \`Column.varchar(255).encrypt().hash()\` for
email) — norm derives a \`<col>_hash\` sibling and rewrites \`{ '@email': ... }\`
filters against it automatically. Uniqueness and upsert conflicts are NOT
automatic: declare \`unique: { email: ['email_hash'] }\` and pass
\`conflictKeys: ['email_hash']\` (an encrypted conflict key is rejected).
Rotate the key with \`rotateKey(db, { oldKey, newKey, dryRun })\`.
An entity with any encrypted column may only use read caching on the
in-process \`MEMORY\` cache engine (decrypted rows on Redis/Memcached would
leak plaintext) — \`use()\` throws at compose time otherwise.

## Migrations

There is no \`migrate\` CLI command and you never write CREATE/ALTER by
hand — the \`Migrator\` (\`@tundralibs/norm/migrations\`) diffs versioned
JSON snapshots of your schema:

\`\`\`ts
import { Migrator } from '@tundralibs/norm/migrations';

const mig = new Migrator(db, { dir: './migrations' });
await mig.snapshot(); // writes 000N.json only when the schema changed
const steps = await mig.plan(); // review: steps[i].queries, .blockedDrops
await mig.apply(); // drops are refused unless apply({ allowDrop: true })
await mig.rollback({ to: 1 });
\`\`\`

Use \`.renamedFrom('old')\` on a column (or the table's \`renamedFrom\`
option) so a rename keeps its data instead of becoming drop + add. In a
runtime with no filesystem, apply snapshots a bundler inlined:
\`new Migrator(db, { source: memorySource({ snapshots: { 1: v1, 2: v2 } }) })\`
(on SQLite it then locks with a database-row \`TableLock\`). Tests can run
the same \`Migrator\` against a temp-dir SQLite database.

## Read caching (off by default)

\`new Norm({ cache: { engine: 'MEMORY' } })\` plus a per-entity \`cache:
<minutes>\` option turns on caching for non-transactional \`find\`/
\`findOne\`/\`count\`/\`getByPK\`; any write on that entity prunes its cache.
\`{ noCache: true }\` bypasses it for one call. A joined read is never
cached (per-table pruning can't invalidate it) — model it as a \`VIEW\` to
make it cacheable.

## Events and tracing

Metadata-only — never row data, plaintext, or secrets. Subscribe with
\`_on<event>\` constructor keys or later via \`norm.on(event, fn)\`: \`call\`
(every operation), \`cacheHit\`, \`warning\` (e.g. \`cache-skip\`,
\`cache-error\`), \`decryptError\`, \`transactionBegin\`/\`Commit\`/\`Rollback\`,
and the proxied engine events (\`connect\`, \`query\`, \`slowQuery\`, ...). For
nested spans instead of flat events, configure a \`witness\` (see
[ambient](https://jsr.io/@tundralibs/ambient)) — every repo operation and
\`raw()\` runs through it.

## Errors

norm's own errors extend \`NormError\` (\`@tundralibs/norm/errors\`) and expose
\`.code\` and \`.norm\` (the raising instance's \`name\`) getters — branch on
\`instanceof\`, not string-matching the message: \`NormQueryError\` (bad
filter/projection/upsert before any engine call), \`NormValidationError\`
(a payload failed the column-derived Guardian — detail on
\`context.issues\`), \`NormHookError\` (\`context.model\`/\`context.hook\`),
\`NormUnsupportedError\` (the engine or the entity's shape forbids the
call), \`NormDefinitionError\`, \`NormCryptoError\`, \`NormMigrationError\`.
Database errors (\`DUPLICATE_KEY\`, \`FOREIGN_KEY_VIOLATION\`, ...) arrive as
the drivers' \`EngineError\` with that \`code\`, not as a \`NormError\`.

## Connection

The database connection is DATA, not code: edit \`configs/Norm.yaml\` (the
\`NORM_DB:\` block — every dialect norm supports is shown there, one
active at a time) to change dialect, host or credentials. Use
\`\${VAR}\` placeholders and a local \`.env\` for secrets — never hand-edit
them into source control. \`db.ts\` never changes when the dialect does.
On Cloudflare Workers, import \`@tundralibs/norm/core\` plus exactly one
\`@tundralibs/norm/engines/<dialect>\` (the native SQLite engine cannot be
bundled there).

Not every dialect supports everything: MongoDB has no transactions and
no raw SQL (\`db.query()\` with OQL IR only); Neon/Turso/D1 have no
transactions either (fetch-only, one request per statement), and only
Postgres/MariaDB take a server-side migration lock.

CLI: \`norm ping\` checks the connection; \`norm upgrade\` bumps norm and
regenerates this guide. Full reference (relations, migrations, aggregates,
pagination, crypto overrides): https://jsr.io/@tundralibs/norm.
`;

export const DENO_JSON = `{
  "name": "{{name}}",
  "tasks": {
    "test": "deno test -A",
    "fmt": "deno fmt",
    "lint": "deno lint",
    "check": "deno check db.ts"
  },
  "imports": {
    "@tundralibs/norm": "jsr:@tundralibs/norm{{normSpec}}",
    "@tundralibs/utils": "jsr:@tundralibs/utils{{utilsSpec}}",
    "$sqlite_deno": "jsr:@db/sqlite@^0.13.0"
  },
  "fmt": {
    "singleQuote": true,
    "proseWrap": "preserve"
  }
}
`;

export const PACKAGE_JSON = `{
  "name": "{{name}}",
  "type": "module",
  "scripts": {
    "test": "node --import tsx --test"
  },
  "dependencies": {
    "@tundralibs/norm": "npm:@jsr/tundralibs__norm{{normSpec}}",
    "@tundralibs/utils": "npm:@jsr/tundralibs__utils{{utilsSpec}}",
    "tsx": "^4"
  }
}
`;
