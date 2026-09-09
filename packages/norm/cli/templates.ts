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

/** The delimited section merged into (or used as) CLAUDE.md / AGENTS.md. */
export const AI_GUIDE_SECTION = `## norm

### Schema

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
  // Schema(...)), never a table name.
  fk: { User: { model: 'Users', on: { userId: 'id' }, reverseAs: 'Profile' } },
});
\`\`\`

Column builders: \`varchar(n)\`, \`integer\`, \`bigint\`, \`decimal(p, s)\`,
\`float\`, \`double\`, \`real\`, \`boolean\`, \`json<T>()\`, \`date\`, \`time\`,
\`datetime\`, \`timestamp\`, \`uuid\`, \`text\`, \`blob\`, \`hash('SHA-256')\` (a
one-way digest column, e.g. for passwords), \`mask(source, fn)\` (a virtual
column computed after decryption — never stored, never sent to SQL).
Chainable on (most of) these: \`.nullable()\`, \`.minLength()\`/\`.maxLength()\`,
\`.pattern(re)\`, \`.beforeWrite(fn)\`/\`.afterRead(fn)\`, \`.lov([...])\` (narrows
the TS type to that union), \`.default(v)\`, \`.min()\`/\`.max()\` (numeric),
\`.hidden()\`/\`.unfilterable()\`, \`.comment(text)\`.

### Entity kinds

\`Entity(name, columns, options)\` defaults to \`type: 'TABLE'\` (physical,
writable, needs \`pk\`). \`type: 'VIEW'\` is DB-side and read-only (\`query\`:
a stored OQL \`SELECT\`; can be joined against, optionally
\`materialized: true\`). \`type: 'QUERY'\` is client-side, read-only, and
terminal — it cannot be joined or built upon, and cannot declare \`fk\`.
Both read-only kinds take \`afterRead\` only (no write hooks); \`index\`/
\`unique\`/\`insert\`/\`update\` are TABLE-only.

### Hooks

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

### Querying

Read/write through \`db\` (exported from \`db.ts\`) via \`db.repo(entityKey)\`
— never a raw query unless norm's typed layer genuinely can't express it
(escape hatches: \`db.query(...)\`/\`db.raw(...)\`, both skip decrypt/scope/
validation and \`raw()\` emits a \`warning\` event every call):

\`\`\`ts
await db.repo('Users').insert({ email: 'a@b.com' });
await db.repo('Users').findOne({ '@email': 'a@b.com' });
await db.repo('Users').getByPK({ id });
await db.repo('Users').count({ '@role': 'admin' });
await db.repo('Users').find({ '@role': 'admin' }, {
  orderBy: { '@displayName': 'ASC' },
  limit: 20,
  project: { '@id': true, '@displayName': true, '@Profile': { '@bio': true } },
});
await db.repo('Users').update({ role: 'admin' }, { '@id': id });
await db.repo('Users').upsert({ email: 'a@b.com', role: 'admin' }, opts);
await db.repo('Users').delete({ '@id': id }); // delete({}) = all rows
await db.repo('Users').truncate(); // refused on a temporal or scoped entity
\`\`\`

Filters are the OQL filter language typed to your columns (\`$eq\`, \`$ne\`,
\`$in\`, \`$like\`, \`$between\`, \`$null\`, \`$or\`/\`$and\`, nested relation refs
like \`'@Profile.@bio'\`). A filter through an unprojected to-many relation
becomes a correlated \`EXISTS\` — it never fans out rows (not on MongoDB,
which has no correlated-subquery form — see the dialect note below).

### Transactions

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

### Scoping (multi-tenant / default filters)

\`db.scope({ '@orgId': currentOrgId })\` returns a handle whose every read
and write carries that equality filter automatically — \`insert\` fills it
in when omitted, \`update\`/\`upsert\` refuse to move or touch a row outside
the scope, \`truncate\` is refused outright (use \`delete({})\` to clear one
scope; it carries no \`WHERE\`). An entity with no scope column is queried
unscoped, so one handle can span a mixed registry.

### At-rest encryption

\`.encrypt()\` any column — it keeps its declared TS type, only storage is
ciphertext. Add \`.hash()\` to keep it equality-searchable (e.g.
\`Column.varchar(255).encrypt().hash()\` for email) — norm derives a
\`<col>_hash\` sibling and rewrites \`{ '@email': ... }\` filters (and
uniqueness/upsert conflict keys) against it automatically. An entity with
any encrypted column may only use read caching on the in-process
\`MEMORY\` cache engine (decrypted rows on Redis/Memcached would leak
plaintext) — \`use()\` throws at compose time otherwise.

### Read caching (off by default)

\`new Norm({ cache: { engine: 'MEMORY' } })\` plus a per-entity \`cache:
<minutes>\` option turns on caching for non-transactional \`find\`/
\`findOne\`/\`count\`/\`getByPK\`; any write on that entity prunes its cache.
\`{ noCache: true }\` bypasses it for one call. A joined read is never
cached (per-table pruning can't invalidate it) — model it as a \`VIEW\` to
make it cacheable.

### Events and tracing

Metadata-only — never row data, plaintext, or secrets. Subscribe with
\`_on<event>\` constructor keys or later via \`norm.on(event, fn)\`: \`call\`
(every operation), \`cacheHit\`, \`warning\` (e.g. \`cache-skip\`,
\`cache-error\`), \`decryptError\`, \`transactionBegin\`/\`Commit\`/\`Rollback\`,
and the proxied engine events (\`connect\`, \`query\`, \`slowQuery\`, ...). For
nested spans instead of flat events, configure a \`witness\` (see
[ambient](https://jsr.io/@tundralibs/ambient)) — every repo operation and
\`raw()\` runs through it.

### Errors

Every thrown error extends \`NormError\` (\`@tundralibs/norm/errors\`) and
exposes \`.code\` and \`.norm\` (the raising instance's \`name\`) getters —
branch on \`instanceof\`, not string-matching the message. The subclasses
that matter day to day: \`NormQueryError\` (bad filter/projection/upsert
before any engine call), \`NormValidationError\` (an insert/update/upsert
payload failed the column-derived Guardian — detail on \`context.issues\`),
\`NormHookError\` (a hook threw — \`context.model\`/\`context.hook\` identify
it), and \`NormUnsupportedError\` (the configured engine or the entity's
own shape forbids the call, e.g. \`update()\` on a temporal entity).

### Connection

The database connection is DATA, not code: edit \`configs/Norm.yaml\` (the
\`NORM_DB:\` block — every dialect norm supports is shown there, one
active at a time) to change dialect, host or credentials. Use
\`\${VAR}\` placeholders and a local \`.env\` for secrets — never hand-edit
them into source control. \`db.ts\` never changes when the dialect does.

Not every dialect supports everything: MongoDB has no transactions and
no raw SQL (\`db.query()\` with OQL IR only); Neon/Turso/D1 have no
transactions either (fetch-only, one request per statement) and migrate
without an advisory lock.

Full reference (relations, migrations, aggregates, pagination, crypto
overrides): https://jsr.io/@tundralibs/norm.
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
