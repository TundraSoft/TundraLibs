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

Read/write through \`db\` (exported from \`db.ts\`) via \`db.repo(entityKey)\`
— never a raw query unless norm's typed query layer can't express it:

\`\`\`ts
await db.repo('Users').insert({ email: 'a@b.com' });
await db.repo('Users').findOne({ '@email': 'a@b.com' });
await db.repo('Users').find({ '@role': 'admin' }, { limit: 10 });
await db.repo('Users').getByPK({ id });
\`\`\`

\`.encrypt()\` any column for at-rest encryption; add \`.hash()\` on top to
keep it equality-searchable (e.g. \`Column.varchar(255).encrypt().hash()\`
for an email column) — norm derives a \`<col>_hash\` column and rewrites
\`{ '@email': ... }\` filters against it automatically. Full column/
relation/query/migration reference: https://jsr.io/@tundralibs/norm.

The database connection is DATA, not code: edit \`configs/Norm.yaml\` (the
\`NORM_DB:\` block — every dialect norm supports is shown there, one
active at a time) to change dialect, host or credentials. Use
\`\${VAR}\` placeholders and a local \`.env\` for secrets — never hand-edit
them into source control. \`db.ts\` never changes when the dialect does.
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
