/**
 * @fileoverview Project templates for `rapid init`, kept as plain,
 * EDITABLE string constants — one per file. `{{token}}` placeholders are
 * filled by {@link render}. {@link scaffold} assembles the file map for a
 * given set of answers (module / norm / ui toggles). No runtime prompt:
 * both `deno.json` and `package.json` are always written (every package in
 * this monorepo ships both), so nothing here branches on runtime. Edit the
 * strings below to change what a new project looks like.
 *
 * @module
 */

/** The choices `rapid init` gathers. */
import { RAPID_ERROR_CODES } from '../errors/mod.ts';

export type ScaffoldAnswers = {
  name: string;
  module: boolean;
  norm: boolean;
  /**
   * The UI layer: three-tier views (core + module layout + components),
   * a starter stylesheet under `public/`, `server.static` + `ui:` in the
   * config, and a templated home page.
   */
  ui?: boolean;
  /**
   * A vendor stylesheet filename under `public/vendor/` the core should
   * link BEFORE site.css — set by `init --with <css>` after a successful
   * self-host download (never a CDN link at runtime).
   */
  vendorCss?: string;
};

/** Replace every `{{key}}` in `tpl` from `vars`. */
export const render = (tpl: string, vars: Record<string, string>): string =>
  tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? '');

// ── templates ───────────────────────────────────────────────────────────

const GITIGNORE = `node_modules/
.env
*.log
/dist/
/coverage/
.rapid-uploads/
data/
`;

const APPLICATION_YAML =
  `# {{name}} — the \`Application\` config set. Every key except \`name\` is
# optional; the values below ARE rapid's defaults unless a comment says
# otherwise. Each comment says which part of rapid reads the key. Durations
# are SECONDS, sizes are BYTES. \`\${VAR}\` placeholders are filled from .env
# at load; an UNSET placeholder is left as literal text — never commit secrets.
# Reference: docs/Rapid-Configuration.md in the @tundralibs/rapid package.
name: {{name}}
# DEVELOPMENT | PRODUCTION — error disclosure and the default log level
# (rapid defaults to PRODUCTION; a new project starts in DEVELOPMENT)
mode: DEVELOPMENT
# Signing key for signed cookies, session() and csrf() — at least 32 chars,
# from the environment. Uncomment once APP_SECRET is set: an unset
# placeholder is NOT a valid secret and fails validation at boot.
# secret: \${APP_SECRET}
# CLONE | PROTOTYPE | SHARE — how each invocation's ctx.state is built from app.state
stateMode: CLONE
# Graceful-shutdown drain window in SECONDS (1-30) before force-close — app.stop()
shutdownTimeout: 25

headers: # header NAMES the core reads and stamps — one place, shared by custom middleware too
  requestId: x-request-id # inbound correlation id adopted per request (ctx.requestId), echoed on every response
  requestIdEcho: [] # extra response headers carrying the same id, e.g. [x-correlation-id]
  responseTime: x-response-time # "<ms>ms" on every response; false to omit

server:
  enabled: true # run the HTTP listener on this replica
  port: 3000 # 0 = OS-assigned (rapid's own default is 8008)
  hostname: localhost
  # unixSocketPath: /tmp/{{name}}.sock # replaces TCP — also REMOVE port/hostname above (mutually exclusive)
  # tls: # see @tundralibs/compat TLSOptions — inline PEM or file paths
  trustProxy: false # false | true | <reverse-proxy hop count> — ctx.remoteAddress, rateLimit() keys, x-forwarded-host
  maxBodySize: 1048576 # bytes, non-file bodies (0 disables) — ctx.payload / ctx.rawPayload (413 past it)
  metrics: false # app.meter + the metrics() endpoint; true = every family on, or pick families:
  # metrics: { requests: true, errors: true, jobs: true, sockets: true, middleware: true, bodies: true, ui: true }
  autoHead: true # a HEAD route for every GET
  methodNotAllowed: false # 405 + Allow instead of 404 on a wrong method
  ignoreTrailingSlash: true # /users and /users/ are the same route
  socketPath: /ws # websocket upgrade path for app.socket() commands and channels
  socketOrigins: [] # browser origins (https://spa.example) allowed to open the socket besides this host
  # static: # framework-served files on route miss (ui surface only); routes always win
  #   /public:
  #     root: ../public # relative to this config directory
  #     index: index.html # or false
  #     maxAge: 3600 # seconds → cache-control: public, max-age
  #     fingerprint: true # immutable ?v= URLs via view.asset()
  # api: # the API SURFACE — these requests get JSON only, pages are 404 there
  #   hosts: [api.example.com] # by hostname
  #   prefix: /api # by path — stripped before routing (/api/users → /users)
  #   trustForwardedHost: false # match hosts on x-forwarded-host (needs trustProxy too)
  paging: # ctx.args.paging — query (page, pagelimit|limit) wins over the headers; clamped, never throws
    pageHeader: x-page-number
    sizeHeader: x-page-size
    defaultSize: 10
    maxSize: 1000 # larger requests are clamped
    maxPage: 1000
  query: # structural caps for the query-string parser (ctx.args.query → 400 RAPID_QUERY_INVALID)
    maxFilters: 50
    maxSorts: 5
    maxValueLength: 2048
    maxArrayItems: 100
  versioning: # how a route version is picked (route/@Module { version })
    mode: header # header | accept | path
# identifier: x-api-version # per mode: header name (default x-api-version) | accept vendor token | path regex (default '^/(v[0-9]+)(?=/|$)') — leave unset for the mode's default
# default: v1 # the version a request without one resolves to (rapid has no default)

jobs:
  enabled: true # run scheduled (@JOB / app.job) jobs on this replica — every enabled replica runs every job

uploads: # multipart file parts (ctx.payload / ctx.files)
  # path: ./uploads # default: a temp dir created at boot, removed at stop()
  maxSize: 10485760 # bytes per file (413 past it)
  maxFiles: 20 # file parts per request
  allowedExtensions: [] # FAIL-SAFE: nothing accepted until listed, e.g. [.png, .pdf] (415 otherwise)

logger: # @tundralibs/slogger options behind app.log / this.log (appName is the app name)
  access: # one access line per request / socket frame / job firing, level by outcome
    enabled: true # the access line only — error disclosure logging stays on
    skip: [
      /healthz,
      /metrics,
    ] # routed HTTP paths, exact or '<prefix>/*' (rapid's default is [])
    # slow: 2 # seconds — past it the line is a warn carrying slow: true
    client: false # remoteAddress/userAgent/referer — personal data, opt in
  # Syslog severity NUMBER: 0 EMERGENCY · 1 ALERT · 2 CRITICAL · 3 ERROR
  # · 4 WARNING · 5 NOTICE · 6 INFO · 7 DEBUG (names are not accepted)
  # (default: 7 DEBUG in DEVELOPMENT, 6 INFO in PRODUCTION — this project pins 7)
  level: 7
  # handlers: # default: one ConsoleHandler — 'logfmt' in DEVELOPMENT, 'standard' in PRODUCTION
  #   - { name: console, type: ConsoleHandler, level: 7, formatter: json } # level 0-7; standard | logfmt | json | compact
  # interpolateMessage: true # slogger message templating, passed through
  # sampling: { sampleRate: 1 } # slogger sampling, passed through

# Tracing is opt-in — uncomment to enable (spans per invocation, trace ids on log lines).
# tracer:
#   exporter:
#     type: CONSOLE # CONSOLE | OTLP (OTLP also takes baseURL + headers)
#   resource: { deployment.environment: production } # extra resource attributes

# The UI layer's DATA half — the code half (core, layout, view, errorTemplates,
# assets) is passed to Application.initialize({ ui }). See docs/Rapid-UI.md.
# ui:
#   enabled: true # false = never emit HTML (pages 404, every request is the api surface)
#   prefer: json # json | html — a templated route's default representation
#   runtimePath: /__rapid/ui.js # the swap runtime script
#   live: false # serve /__rapid/live.js (channels over the websocket)
#   history: false # serve /__rapid/history.js (push-state navigation)
#   csrfCookie: csrf # the cookie the runtime echoes as x-csrf-token
#   swapHeader: rapid-swap # a request carrying it gets the fragment
#   swapUnless: [] # header names whose presence cancels the swap (htmx: HX-Boosted)
#   redirectHeader: rapid-redirect # a swap reply's redirect target
`;

const MAIN_PLAIN = `import { Application } from '@tundralibs/rapid';
import { health } from '@tundralibs/rapid/endpoints';

const configDir = new URL('./configs', import.meta.url).pathname;
const app = await Application.initialize(configDir);

app.get('/', () => ({ content: { app: '{{name}}', ok: true } }));
app.get('/healthz', health()); // liveness — what \`rapid health\` probes

await app.start();
app.log.info(\`{{name}} listening on \${app.address}\`);
`;

const MAIN_MODULES = `import { Application } from '@tundralibs/rapid';
import { health } from '@tundralibs/rapid/endpoints';
import * as modules from './modules/mod.ts';

const configDir = new URL('./configs', import.meta.url).pathname;
const app = await Application.initialize(configDir);
app.get('/healthz', health()); // liveness — what \`rapid health\` probes

// Boot the module system — every RapidModule exported from modules/mod.ts.
await app.modules({ modules: [modules] });

await app.start();
app.log.info(\`{{name}} listening on \${app.address}\`);
`;

const MODULE_SAMPLE =
  `import { GET, param } from '@tundralibs/rapid/decorators';
import { event, RapidModule } from '@tundralibs/rapid/modules';

const EVENTS = { Greeted: event<{ name: string }>() };

export class Greeter extends RapidModule<typeof EVENTS> {
  readonly name = 'Greeter';
  readonly namespace = 'greeter';
  protected readonly events = EVENTS;

  @GET('/hello/:name:', { bind: [param('name')] })
  async hello(name: string) {
    await this.emit('Greeted', { name });
    this.log.info('greeted', { name });
    return { content: { hello: name } };
  }
}
`;

const MODULES_BARREL = `// Generated by \`rapid modules\` — do not edit by hand.
export { Greeter } from './Greeter.ts';
`;

// Same shape as `norm init`'s own db.ts/Norm.yaml (duplicated, not
// imported — the two CLIs stay independent, same as latestVersion.ts
// already being duplicated between them). Dialect-agnostic on purpose:
// the dialect is DATA (configs/Norm.yaml), never code here — switching
// databases never touches this file.
const DB =
  `// sqlite registers via its own import (the other dialects come from the
// barrel norm's root import already pulls in).
import '@tundralibs/norm/engines/sqlite';
import { Norm } from '@tundralibs/norm';
import { loadConfig } from '@tundralibs/utils';
import { AppSchema } from './models/mod.ts';

const configDir = new URL('./configs', import.meta.url).pathname;
const config = await loadConfig({ path: configDir, env: true });

/** One connected Norm instance for the app. */
export const norm = new Norm({ database: config.get('norm.NORM_DB') });
await norm.connect();
export const db = norm.use(AppSchema);
`;

/** Same content as `norm init`'s own NORM_YAML — see that file for the
 * per-dialect field verification notes. */
const NORM_YAML =
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

const MODEL_SAMPLE = `import { Column, Entity } from '@tundralibs/norm';

/** A minimal norm entity — adjust to your schema. */
export const Users = Entity('users', {
  id: Column.uuid().default({ $$_expression: 'UUID' }),
  email: Column.varchar(255),
  createdAt: Column.timestamp(),
}, { pk: ['id'] });
`;

const MODELS_BARREL = `import { Schema } from '@tundralibs/norm';
import { Users } from './Users.ts';

/** The named schema norm.use() consumes. */
export const AppSchema = Schema('App', { Users });
`;

/**
 * The `{{aiNorm}}` section (init --norm) — a real merge of norm's own AI
 * guide (`packages/norm/cli/templates.ts`'s `AI_GUIDE_SECTION`), duplicated
 * rather than imported (same reasoning as `latestVersion.ts`), so a
 * rapid+norm app's AGENTS.md carries the same depth a standalone norm
 * project's guide does — not a shorter summary.
 */
const NORM_AI_SECTION = `
## Database (norm)

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

// No runtime prompt — both manifests are always written (every package in
// this monorepo ships both), so nothing here branches on runtime.
// {{normDenoImports}}/{{normPackageDeps}}/{{checkTargets}} are '' unless
// --norm (computed once in scaffold(), same mechanism as {{aiModules}}/
// {{aiUi}} — no post-hoc regex patch).
const DENO_JSON = `{
  "name": "{{name}}",
  "tasks": {
    "dev": "deno run -A --watch main.ts",
    "start": "deno run -A main.ts",
    "modules": "deno run -A jsr:@tundralibs/rapid/cli modules ./modules",
    "upgrade": "deno run -A jsr:@tundralibs/rapid/cli upgrade",
    "test": "deno test -A",
    "fmt": "deno fmt",
    "lint": "deno lint",
    "check": "deno check {{checkTargets}}"
  },
  "imports": {
    "@tundralibs/rapid": "jsr:@tundralibs/rapid{{rapidSpec}}"{{normDenoImports}}
  },
  "fmt": {
    "singleQuote": true,
    "proseWrap": "preserve"
  }
}
`;

// Bun users bypass this file entirely (`bun --watch main.ts`, `bun test` —
// bun runs .ts natively, no loader needed) — these scripts target Node.
const PACKAGE_JSON = `{
  "name": "{{name}}",
  "type": "module",
  "scripts": {
    "dev": "node --import tsx --watch main.ts",
    "start": "node --import tsx main.ts",
    "modules": "node --import tsx node_modules/@tundralibs/rapid/cli/mod.ts modules ./modules",
    "upgrade": "node --import tsx node_modules/@tundralibs/rapid/cli/mod.ts upgrade",
    "test": "node --import tsx --test"
  },
  "dependencies": {
    "@tundralibs/rapid": "npm:@jsr/tundralibs__rapid{{rapidSpec}}",
    "tsx": "^4"{{normPackageDeps}}
  }
}
`;

const README = `# {{name}}

A [rAPId](https://jsr.io/@tundralibs/rapid) application.

## Run

- Deno: \`deno task dev\`
- Node: \`npm run dev\`
- Bun: \`bun --watch main.ts\`

## Tasks

- \`dev\` / \`start\` — run the app (Deno/Node; Bun runs \`main.ts\` directly,
  see above)
- \`test\` — Deno: \`deno task test\`; Node: \`npm test\`; Bun: \`bun test\`
- \`modules\` — regenerate \`modules/mod.ts\`
- \`upgrade\` — bump \`@tundralibs/*\` to the latest release
`;

const AGENTS_MD = `# {{name}} — agent guide

A [rAPId](https://jsr.io/@tundralibs/rapid) application — cross-runtime,
runs on Deno, Node or Bun unmodified.
This file is the always-on baseline for any AI working in this repo. It is read
by Claude Code (via \`CLAUDE.md\`), Cursor and Codex (via \`AGENTS.md\`), and GitHub
Copilot (via \`.github/copilot-instructions.md\`) — all three resolve here. It
was generated by \`rapid init\` for rapid {{rapidVersionLabel}}; the package
docs it links are the same version, so prefer them over memory.

## Commands

\`\`\`bash
{{aiCommands}}
\`\`\`

Run the relevant ones before you consider a change done.

## Package layout (subpaths)

\`@tundralibs/rapid\` is the root (\`Application\`, \`RapidError\`, the middleware
factories, decorators, binders, \`validated\`). The rest by concern:
\`@tundralibs/rapid/context\` (\`HTTPContext\` / \`SOCKETContext\` / \`JOBContext\`
and their init types), \`@tundralibs/rapid/decorators\` (decorators, binders and
the registry introspection tooling reads: \`decorationsOf\`, \`decoratedNamesOf\`,
\`moduleMetaOf\`, \`recordDecoration\`, \`recordModule\`),
\`@tundralibs/rapid/middlewares\` (+ \`/pact\`), \`@tundralibs/rapid/modules\`
(\`RapidModule\`, \`event\`, \`reply\`, \`initModules\`, \`buildModuleContext\`,
\`ModuleRuntime\`), \`@tundralibs/rapid/endpoints\`, \`@tundralibs/rapid/errors\`
(\`RapidError\`, \`RAPID_ERROR_CODES\`, \`asValidationError\`),
\`@tundralibs/rapid/testing\`, \`@tundralibs/rapid/types\` (every public type),
\`@tundralibs/rapid/ui\` (\`html\`, \`raw\`, \`template\`, \`when\`, \`each\`, the form
helpers) and \`@tundralibs/rapid/cli\`.

## How this app is built

- **One entry point.** \`Application.initialize(source)\` is the ONLY way to make
  an app (the constructor is private). \`main.ts\` passes the \`configs/\`
  directory, so \`configs/Application.yaml\` supplies the options and every other
  config file in that directory stays readable via \`app.config\` / \`ctx.config\`
  (set name = lowercased file name, keys case-sensitive). On Cloudflare Workers
  \`worker.ts\` passes the options inline instead. Never construct
  \`new Application()\`; register everything before \`app.start()\` (or the first
  \`app.fetch()\`).
- **\`configs/Application.yaml\` is annotated** — every key carries a comment
  saying what reads it. A wrong value fails the boot with \`RAPID_CONFIG\` naming
  the key; nothing fails on the first request. Durations are SECONDS, sizes
  are BYTES. \`\${VAR}\` placeholders come from \`.env\`; an UNSET placeholder stays
  literal text, so keep \`secret: \${APP_SECRET}\` commented until the variable
  exists. \`mode\` defaults to \`PRODUCTION\` (opaque 500s); a new project starts
  in \`DEVELOPMENT\`.
- **Routes are radrouter-native.** Path params are COLON-WRAPPED: \`/users/:id:\`,
  never express-style \`:id\`. \`app.get/post/put/patch/delete(path, [options],
  ...middleware, handler)\` — the handler is always last; \`options\` is
  \`{ version?, template?, layout?, openapi? }\`. \`app.route(method, path, …)\`
  for other methods. A \`HEAD\` route is synthesised for every \`GET\`; a trailing
  slash is ignored; \`405 + Allow\` needs \`server.methodNotAllowed: true\`.
- **A handler returns the reply.** Return \`{ content, status?, headers? }\`
  (\`content\` is a string, a plain object → JSON, a \`Uint8Array\`, or a
  \`ReadableStream\` / async iterable to stream). HTTP replies may also carry
  \`cookies: [...]\` and \`redirect: '/path'\` (302; \`{ url, permanent }\` for
  301); both are ignored on JOB/SOCKET. A redirect written as a path may not
  resolve to another origin (\`//host\` is refused) — write the full URL to
  leave the site on purpose. Set a status without a body via \`ctx.response\`.
- **Middleware is universal.** \`app.use(mw)\` runs on HTTP requests, socket
  frames AND job firings, as an onion in registration order; per-route
  middleware sits between the path and the handler. Narrow with \`ctx.type\`
  (\`'HTTP' | 'SOCKET' | 'JOB'\`), \`onlyHTTP\` / \`onlySOCKET\` / \`onlyJOB\` (skip
  elsewhere) or \`guardHTTP\` / \`guardSOCKET\` / \`guardJOB\` (reject elsewhere —
  use these for auth), and by HTTP surface with \`onlyApi\` / \`onlyUi\`. Set
  headers BEFORE \`next()\` if they must survive an error; read the reply after
  \`next()\` via \`ctx.response\` / \`ctx.status\` / \`ctx.responseHeaders\`.
- **Errors:** throw \`new RapidError(code, { message?, details?, debug? })\` for
  a known condition — the code maps to the status and a client-safe message. An
  unknown throw is an opaque 500 by design. A \`@tundralibs/guardian\` failure is
  automatically a 400; wrap any OTHER validator in \`validated()\` for the same.
  4xx \`message\`/\`details\` are PUBLIC in PRODUCTION; put internals in \`debug\`.
- **Secrets:** the app \`secret\` option (≥ 32 chars, from the environment —
  never committed) is the one HMAC key for signed cookies, \`session()\` and
  \`csrf()\`. It is read when first used, so a missing secret is a 500 on that
  request, not a boot error.
- **Identity:** \`ctx.auth\` is \`undefined\` until an auth middleware calls
  \`ctx.setAuth(identity)\` (write-once). The pact adapter fills it; anything
  else (a JWT you verify yourself) does the same.
{{aiModules}}{{aiNorm}}
## The context (\`ctx\`)

Every handler and middleware receives the transport's context. Shared members:
\`type\`, \`requestId\` (correlation id; adopted from \`headers.requestId\` when
safe, else minted), \`action\` (route pattern / command / job name — the RAW
pathname on an unmatched HTTP request), \`args\` (\`params\`, \`query\`, \`paging\`),
\`state\` (per-invocation bag, built per \`stateMode\`), \`auth\` / \`setAuth()\`,
\`status\` (the interpreted outcome), \`config\`, \`meter\` (when \`server.metrics\`),
\`publish(channel, data)\` (push to socket subscribers from ANY transport),
\`detach(work)\` (abandoned-but-running work the job transport waits for),
\`response\` (set/override until \`respond()\`), \`app\`.

- **HTTP** adds \`request\`, \`headers\`, \`method\`, \`url\`, \`path\` (what the router
  saw: prefix/version stripped), \`params\`, \`matched\`, \`surface\` (\`'api' |
  'ui'\`), \`basePath\`, \`remoteAddress\` (honours \`server.trustProxy\`),
  \`cookies\`, \`payload\` (parsed body, once, cached), \`rawPayload\` (the bytes;
  order-independent of \`payload\`), \`files\` (upload temp paths), \`isSwap\`,
  \`accepts(...types)\`, \`href(path)\` (prefix-aware), \`setHeader\` /
  \`appendHeader\` / \`deleteHeader\`, \`setCookie\` (\`{ signed: true }\` uses the
  app secret) / \`signedCookie\` / \`deleteCookie\`, \`redirect(url, permanent?)\`,
  \`serve(filePath, { download? })\` (trusted paths only — no traversal guard),
  \`sse(asyncIterable)\`, \`html(string, status?)\`.
- **SOCKET** adds \`connection\` (\`id\`, upgrade \`query\`, upgrade \`headers\`),
  \`connectionId\`, \`command\`, \`frameId\`; \`payload\` is the frame's value,
  synchronous; \`args.params\` IS the frame payload (must be a plain object).
- **JOB** adds \`job\`, \`tick\` (\`scheduledAt\`, \`firedAt\`, \`count\` — \`-1\` when
  triggered by hand), \`drift\`; \`args.params\` = registration \`args\` merged with
  \`triggerJob\` overrides; no body.

## Sockets, channels and jobs

- \`app.socket('name', handler)\` registers a websocket command; frames arrive on
  \`server.socketPath\` (\`/ws\`) over the same listener, dispatched through the
  same middleware onion. \`app.channel('name', { authorize? })\` declares a
  pub/sub channel clients may subscribe to; \`ctx.publish('name', data)\` pushes.
  Browser upgrades from another origin are refused unless listed in
  \`server.socketOrigins\`. \`app.fetch()\` (Workers, tests) serves HTTP only.
- \`app.job('name', '*/5 * * * *', handler, { args? })\` registers a cron job
  (5-field schedule, validated at registration). Every replica with
  \`jobs.enabled\` runs every job — there is no leader election; schedules use
  the server's local time; a tick that fires while the previous run is still
  going is SKIPPED. \`app.triggerJob('name', args)\` runs one now (bypasses the
  overlap guard) and returns the outcome.

## Middleware catalog

All factories are exported from \`@tundralibs/rapid\` and
\`@tundralibs/rapid/middlewares\`; the pact adapter from
\`@tundralibs/rapid/middlewares/pact\`. Options are validated when the factory
is called. Durations are seconds; every non-standard header name is an
option; stateful ones take pact-style \`hooks\` with bounded in-memory defaults
(per process — inject redis/cacher-backed hooks before scaling out).

{{aiMiddleware}}

Register in this order: \`secureHeaders()\`, \`cors()\`, \`timeout(s)\`,
\`rateLimit()\`, \`compress()\`, \`etag()\`, \`csrf()\`, \`session()\`, \`authenticate\`,
\`idempotency({ scope })\`; \`authorize(...)\` per route. The correlation id,
response-time header and access log are core config (\`headers\`,
\`logger.access\`), not middleware.

## Decorators, binders and modules

From \`@tundralibs/rapid/decorators\` (also re-exported from the root unless
noted): \`@GET/@POST/@PUT/@PATCH/@DELETE(path, options?)\`, \`@SOCKET(command,
options?)\`, \`@JOB(name, schedule, options?)\`, \`@Module(name?, options?)\`,
\`@On(...events)\`, \`@Use(...invokeMiddleware)\`. Decorators are metadata-only —
they never wrap the method, so a class unit-tests with \`new\`. Route options:
\`bind\`, \`version\`, \`summary\`, \`description\`, \`tags\`, \`operationId\`,
\`security\`, \`response\` (a schema; ENFORCED in DEVELOPMENT), \`template\`,
\`layout\`, \`middleware\` (route-scoped chain, HTTP-typed; \`@SOCKET\` takes a
socket-typed one). \`@Module(name, { middleware })\` prepends a universal
chain to every route and command in the class — app \`use()\` → module →
route → handler; jobs take app-level middleware only. \`security\` documents,
\`middleware\` enforces — declare both. Binders (\`bind: [...]\`, in parameter order): \`param(name,
validate?)\`, \`payload(schemaOrValidate?)\` (a schema OBJECT also documents the
body), \`query(validate?)\`, \`paging()\`, \`header(name)\`, \`cookie(name)\`,
\`auth(validate?)\`, \`session()\` (decorators subpath only — the root exports
the \`session()\` middleware), \`connection()\` (socket only), \`config('set.key')\`.
Without a validator \`param\` is \`string\` and \`payload\` is \`unknown\`.

Modules: \`class Posts extends RapidModule<typeof EVENTS> { name = 'Posts';
namespace = 'blog'; protected readonly events = EVENTS; … }\` with
\`const EVENTS = { PostCreated: event<{ id: string }>() }\`. Members: \`this.log\`
(scoped), \`this.config\`, \`this.emit('PostCreated', payload)\`,
\`this.invoke(Target, 'method', args)\` (runs the target's \`@Use\` guards; a
denial is a 403 envelope, not a throw), optional \`init()\` / \`dispose()\`
hooks. Methods return the \`{ content }\` shape or \`reply(status, content)\`.
\`app.modules({ modules: [namespaces], instances? })\` boots the module system
ONCE (before start), mounts every decorated instance, and exposes
\`app.moduleRuntime\`. \`@Module\` options: \`prefix\` (HTTP paths), \`namespace\`
(socket commands \`ns.command\`, jobs \`ns.name\`), \`version\`, \`description\`,
\`tags\`, \`security\`, \`layout\`. \`@On('ns:Module:Event')\` handlers get
\`(payload, EventContext)\`; \`@Use\` guards module-to-module \`invoke()\` ONLY.

## Authentication

\`import { pactAuth } from '@tundralibs/rapid/middlewares/pact'\`;
\`const { authenticate, authorize, login, logout, refresh, me } = pactAuth(pact,
options)\`. \`authenticate\`
fills \`ctx.auth\` with a \`PactAuthContext\` (\`principal\`, \`via\`) from Bearer
(header or \`bearer.cookie\`), Basic, ApiKey or HMAC carriers; absent →
anonymous (\`optional: false\` → 401); present-but-invalid → 401, never
anonymous. \`authorize('Module', 'PERMISSION')\` is typed by the pact instance
and checked against its catalog when called. Options are pact's own
middleware options: carriers per scheme, \`hmac: {}\` (RFC 9421 template
signing, requests AND responses), \`encryption: {}\` (JWE payloads). Sockets
authenticate from the upgrade request's headers/cookies. A stale bearer
COOKIE is cleared and treated as anonymous (a browser keeps sending it; a 401
would lock the user out of /login). The session handlers wrap the instance:
\`app.post('/login', login())\` → \`{ token, expiresAt, refreshToken?, principal }\`
plus the \`bearer.cookie\`; \`logout()\` → 204 and the cookie cleared;
\`refresh()\` rotates a JWT session (body \`refreshToken\` or
\`session.refreshCookie\`); \`me()\` → \`{ principal, via }\` or 401. Options
under \`session\`: \`fields\`, \`cookie\` attributes, \`refreshCookie\`,
\`principal\` projection (default \`{ id }\`). Every failure is ONE 401.
Bring-your-own auth: a middleware
that verifies its credential and calls \`ctx.setAuth(...)\`.

## Errors

Registry (\`RAPID_ERROR_CODES\`): code → status → PRODUCTION message. In
PRODUCTION every 500 reads \`Internal server error\` and \`debug\` never leaves
the process; other 5xx keep their default message; 4xx send \`message\` and
\`details\` verbatim. Every error body carries \`requestId\`. \`app.onError(fn)\`
may replace the envelope (sync, one per app).

{{aiErrors}}

## Observability

- \`headers.requestId\` (\`x-request-id\`) is adopted or minted per request and
  stamped on every response (plus \`headers.requestIdEcho\` names);
  \`headers.responseTime\` (\`x-response-time\`, \`<ms>ms\`) is stamped last.
- \`logger.access\` writes one line per request / frame / job firing after the
  response is final (\`GET /users 200 12ms\` + fields); 5xx at \`error\`, 4xx at
  \`warn\`, unmatched 404 and success at \`info\`. \`app.log\` / \`this.log\` are
  slogger loggers that carry the request id; \`logger.level\` is a syslog
  NUMBER (7 DEBUG … 0 EMERGENCY).
- \`tracer\` (opt-in) wraps every invocation in a span and composes trace ids
  onto log lines; \`server.metrics: true\` creates \`app.meter\` (a metro-man
  registry) for the \`metrics()\` endpoint with seven switchable families —
  requests, error codes, jobs, sockets, middleware decisions, bodies, ui —
  \`server.metrics: { ui: false }\` turns one off; register app metrics on
  \`app.meter.registry\`.

## UI layer (\`@tundralibs/rapid/ui\`)

A route may name an HTML template — \`app.get('/x', { template: MyView },
handler)\` — while the handler keeps returning JSON-shaped data. A request
carrying the swap header (\`rapid-swap\`) gets the fragment; otherwise the
route's \`prefer\` (\`'json'\` default, \`'html'\` for pages) picks JSON or the
layout-wrapped page — \`Accept\` is never consulted; the api surface
(\`server.api\`) never renders HTML. \`html\` escapes every interpolation
(\`raw()\` is the only opt-out); \`template(fn, name)\` builds a view; the frozen
\`view\` bag exposes \`requestId\`, \`path\`, \`query\`, \`asset()\`, \`csrfToken\` and
nothing from \`ctx.auth\` unless the app's \`view\` projection names it. The
factory's \`ui\` option (\`core\`, \`layout\`, \`errorTemplates\`, \`view\`, \`assets\`)
is code; the YAML \`ui:\` block (\`enabled\`, \`prefer\`, \`live\`, \`history\`,
header/cookie names) is data. The runtime script (\`/__rapid/ui.js\`) handles
\`data-action\` / \`data-target\` / \`data-swap\` / \`data-load\` elements and
\`rapid.swap()\` / \`rapid.refresh()\`, same-origin only, echoing the CSRF
cookie; \`/__rapid/live.js\` (channels over \`/ws\`) and \`/__rapid/history.js\`
(push-state) are opt-in. Static assets: \`server.static\` (fingerprinted
\`?v=\` URLs via \`view.asset()\`).{{aiUi}}

## Endpoints (\`@tundralibs/rapid/endpoints\`)

Mount where you like: \`app.get('/healthz', health({ check? }))\` (liveness;
503 when \`check\` throws; the cause is logged, never sent),
\`app.get('/readyz', ready({ check? }))\` (readiness: 503 \`draining\` once
\`stop()\` began, 503 on a failing check), \`app.get('/metrics',
metrics({ format: 'prometheus' | 'json' }))\` (503 until \`server.metrics\`),
\`app.get('/openapi.json', openapi({ info, servers, securitySchemes, expose }))\`
(built from the routes + decorators; \`expose\` defaults to DEVELOPMENT only;
\`securitySchemes\` takes the exact OpenAPI shapes — http / apiKey / oauth2 /
openIdConnect — validated at mount, and \`bearerAuth\` is always declared).
\`docs(app, { path, viewer, spec, tryIt, render, layout, guards, expose,
info, servers, securitySchemes })\` mounts the API reference PAGE itself:
rendered server-side from rapid's templates inside the app's core/layout (no
CDN; \`layout: false\` opts out), a credential box generated from the declared
schemes plus an optional sign-in form (\`tryIt: { login: { path, fields } }\`),
try-it forms served by \`/__rapid/docs.js\`; compose a custom body with
\`render: (doc, view, opts) => html\` from the parts \`DocsAuth(doc, opts)\`,
\`DocsReference(doc, opts)\`, \`DocsOperation(path, method, op, opts)\`,
\`DocsSchemas(doc)\`; or \`viewer: 'scalar' | 'redoc' | 'swagger'\` for a
pinned SRI shell (\`spec\` required). Give \`docs()\` the SAME info / servers /
securitySchemes as \`openapi()\`.

## Testing

Use \`@tundralibs/rapid/testing\`: \`client(app)\` drives routes through
\`app.fetch\` with no port (\`await api.get('/path', { query, headers, body,
swap, host })\` → \`{ status, headers, body }\`); \`harness({ modules, instances?,
stub, container? })\` boots the module system with fakes stocked into an
isolated DI container (\`await using h = harness(...)\`; \`h.invoke\`,
\`h.modules\`); \`view(overrides)\` builds a frozen view bag for template unit
tests. A test must be able to FAIL — never assert something the type-checker
already proves.

## CLI (\`deno run -A jsr:@tundralibs/rapid/cli\`; on bun/node the \`modules\` / \`upgrade\` package scripts, or \`node --import tsx node_modules/@tundralibs/rapid/cli/mod.ts\` — there is NO \`npx rapid\`)

\`init [name] [--module] [--norm] [--ui] [--with bootstrap|pico] [--yes]\`
scaffolds a project (this file included, both \`deno.json\` and
\`package.json\` always written — no runtime prompt); \`upgrade [--dir .]\`
bumps \`@tundralibs/*\` to their
latest release; \`modules [dir] [--check]\` regenerates the module barrel
(\`--check\` exits 1 when stale — put it in CI); \`health [url] [--path /health]\`
probes a running app.

## Reference docs (rapid {{rapidVersionLabel}})

{{aiDocs}}

## Coding conventions (the org standard, fitted to an app)

- **Naming.** Classes are \`PascalCase\`; a file exporting one class/error/type
  is named after it (\`Greeter.ts\`); helper/utility files are \`camelCase\`;
  folders are lowercase or \`kebab-case\`. A test mirrors its subject:
  \`Greeter.test.ts\`. Module-level constants are \`UPPER_SNAKE_CASE\`.
- **Privacy by prefix, not \`#\`.** \`__name\` = private to the class, \`_name\` =
  protected / internal. Never use JS \`#\` private fields (they break
  subclassing and the framework's metadata-only decorators).
- **Errors.** Put app errors under \`errors/\`, one class per scenario,
  extending a single base (rapid's \`RapidError\` with a registered code maps
  straight onto an HTTP status). A helper that DETECTS a condition throws the
  typed error; a helper that merely RUNS caller code lets errors propagate
  unwrapped.
- **Imports.** Cross-folder imports go through the folder's \`mod.ts\` barrel;
  same-folder siblings import directly. One import statement per module
  (merge value and type imports).
- **JSDoc.** Every exported symbol gets a brief first line. \`{@link}\` any
  non-built-in type in prose; \`@throws {@link ErrorType}\` on every method that
  can throw — document only real throws. No marketing sections, no restating
  what the type already says.

## Which TundraLibs package for which job

The package names are not self-describing — look the NEED up here first.
All publish to JSR under \`@tundralibs/*\` and run on every runtime. Verify a
signature in the package README (or https://jsr.io/@tundralibs/<pkg>) before
using it — do not guess.

| Need                                                      | Package                                                              |
| --------------------------------------------------------- | -------------------------------------------------------------------- |
| Validate input / define a schema                          | \`@tundralibs/guardian\`                                               |
| Authentication (JWT, API keys, HMAC signing), permissions | \`@tundralibs/pact\`                                                   |
| Database models / ORM                                     | \`@tundralibs/norm\` (it builds its engine from its \`database\` config) |
| Hand-built typed query → SQL                              | \`@tundralibs/oql\`                                                    |
| Cache (memory / Redis / Memcached)                        | \`@tundralibs/cacher\`                                                 |
| Generate ids (nanoid / ulid / sequence)                   | \`@tundralibs/id\`                                                     |
| Hash, encrypt, sign, password hashing                     | \`@tundralibs/crypt\`                                                  |
| Call an upstream REST API                                 | \`@tundralibs/restler\`                                                |
| Logging                                                   | \`@tundralibs/slogger\` (via \`app.log\`)                                |
| Cron / scheduled jobs                                     | \`@tundralibs/cronus\` (via \`@JOB\`)                                    |
| Dependency injection                                      | \`@tundralibs/doctor\` (\`inject()\`, \`app.container\`)                   |
| Distributed tracing                                       | \`@tundralibs/tracer\` (the \`tracer\` option)                           |
| A runtime-only global (fs, env, process, fetch)           | \`@tundralibs/compat\` — never the global                              |
| Error base class, config loading, memoize, IP helpers     | \`@tundralibs/utils\`                                                  |
| HTTP router                                               | \`@tundralibs/radrouter\` (rapid already uses it)                      |

### The shapes

- **Validation — \`@tundralibs/guardian\`.** Build a schema, \`parse\` it:
  \`Guardian.object({ id: Guardian.number().integer().positive(), email:
  Guardian.string().email(), role: Guardian.enum(['admin','user']) })\`;
  \`type User = Guardian.infer<typeof UserSchema>\`; \`UserSchema.parse(input)\`
  throws, \`safeParse\` returns \`[err, value]\`. In rapid a guardian failure is
  automatically a 400 — bind the schema OBJECT, \`payload(UserSchema)\`, so
  it validates AND documents the request body.
- **Auth — \`@tundralibs/pact\`.** Bitmask authorization + credential schemes
  (BASIC/BEARER/APIKEY/HMAC) + OAuth + passkeys, storage through HOOKS you
  supply. \`Pact.create({ bits: { READ: 1n, EDIT: 2n }, modulePermissions:
  { Post: ['READ','EDIT'] }, hooks: { getUser, getApiKey, saveApiKey, … } })\`.
  \`await pact.authenticate(credential)\` → \`{ principal, via }\` (throws on a
  bad credential); \`await principal.assert(module, permission)\`. API keys:
  \`pact.issueApiKey({ userId })\` → \`{ key, secret }\` (show the secret once;
  your \`saveApiKey\` hook stores it encrypted, never hashed — HMAC needs the
  raw secret). HMAC over any content: \`pact.sign(content, key?)\` /
  \`pact.verifySignature(content, sig, key?)\`.
- **ORM — \`@tundralibs/norm\`.** \`Entity('users', { id: Column.uuid(), email:
  Column.varchar(255).encrypt().hash() }, { pk: ['id'] })\` → \`Schema('Identity',
  { Users })\` → \`new Norm({ database: { dialect: 'sqlite', path }, secret })\`
  → \`norm.use(Identity)\` → \`db.repo('Users').insert({...})\` / \`.find(...)\`.
  norm owns the engine (you never construct one); \`sqlite\` needs its own
  \`import '@tundralibs/norm/engines/sqlite'\`, the other dialects register
  from the barrel. Pick \`--norm\` on init to get a wired \`db.ts\`.
- **Typed queries — \`@tundralibs/oql\`.** The query object norm translates to
  SQL; use it directly only for hand-built queries: \`const q: Query<'SELECT',
  User> = { type: 'SELECT', table: 'users', columns: [...], projection: {...}
  }\`, then a translator (\`PostgresTranslator\`) renders it. Reach for \`norm\`
  first.
- **Caching — \`@tundralibs/cacher\`.** Swappable backends: \`const cache =
  Cacher.create('MEMORY', 'my-cache', { defaultExpiry: 300 })\` (or \`'REDIS'\`,
  \`'MEMCACHED'\`; the options bag is REQUIRED, \`defaultExpiry\` in seconds); \`await cache.set(key, value)\`, \`await cache.get<T>(key)\`,
  \`has\`, \`delete\`, \`clear\`. Same API across backends, so start in-memory and
  switch by config. rapid's \`session()\`/\`rateLimit()\`/\`idempotency()\` take
  persistence \`hooks\` (\`getSession\`/\`saveSession\`/\`deleteSession\`/
  \`touchSession\`, an atomic \`increment\`, a set-if-absent \`claim\`) — a cacher
  instance implements them in a few lines (same seconds unit).
- **Ids — \`@tundralibs/id\`.** \`nanoID()\` (21-char URL-safe; \`nanoID(10,
  NUMBERS)\` for length/alphabet), \`ulid()\` (sortable), \`sequenceID()\` (a
  FACTORY: \`const seq = sequenceID(); seq()\` → a bigint, counter-based,
  crypto-free), \`ObjectID()\` (also a factory). rapid mints request ids with
  \`sequenceID\` by default — set \`Application.requestIdGenerator\` to change.
- **Crypto — \`@tundralibs/crypt\`.** Primitives, by subpath. Hashing: \`await
  sha256(data)\` / \`digest(data, { algorithm: 'SHA-384' })\` from
  \`@tundralibs/crypt/digest\`. Encryption: \`encryptAES(text, key, { mode:
  'GCM', keyLength: 256 })\` / \`decryptAES\` from \`@tundralibs/crypt/encrypt\`;
  \`pbkdf2Hash\`/\`pbkdf2Verify\` (passwords) from \`@tundralibs/crypt/digest\`,
  \`hkdf\` from \`@tundralibs/crypt/generators\`. Signing:
  \`signHMAC\`/\`verifyHMAC\` (\`@tundralibs/crypt/sign\`), \`issueJWT\`/\`verifyJWT\`
  (\`@tundralibs/crypt/JWT\`). Passwords: hash with pbkdf2,
  never store plaintext.
- **REST client — \`@tundralibs/restler\`.** A typed client base. Subclass it,
  set \`vendor\`, pass \`{ baseURL }\` to \`super\`, and expose methods built on
  \`this._makeRequest<T>({ path, method, contentType: 'JSON', payload })\`.
  Put each upstream API in its own class under e.g. \`clients/\`.
- **Foundation — \`@tundralibs/utils\`.** \`BaseError<Meta>\` (extend it for app
  errors — context-carrying, chainable); \`loadConfig({ path })\` →
  \`config.get<T>('a.b')\` (what rapid's \`Application.initialize('./configs')\`
  uses); \`memoize(fn, ttlSeconds)\` (SECONDS, default 30 min), \`throttle(fn, ms)\`, \`once(fn)\`; \`@Singleton\`;
  \`Options\` (the options+events base class); network helpers (\`isPublicIP\`,
  \`isInSubnet\`, \`getFreePort\`); \`envArgs\` (.env + Docker secrets).
- **Logging — \`@tundralibs/slogger\`.** The logger behind \`app.log\`; reach
  for it directly only outside the app. \`new Slogger({ appName, level:
  SyslogSeverities.INFO, handlers: [{ name: 'console', type:
  'ConsoleHandler', level, formatter: 'logfmt' }] })\` (a preset name or a
  function); \`logger.info('msg', { ...context })\`. Inside a handler or module
  use \`app.log\` / \`this.log\` — they carry the request id for you.
- **Router — \`@tundralibs/radrouter\`.** Already inside rapid; you normally
  don't touch it. Its grammar is why params are \`/users/:id:\`. The one
  constructor option rapid passes through is \`ignoreTrailingSlash\`
  (\`server.ignoreTrailingSlash\`); radrouter's \`caseSensitive\` is not exposed.

## Rules

- Verify, don't assert: check a symbol or behaviour in source / the rapid docs
  before relying on it.
- Minimal diffs. No speculative abstractions, no filler comments, no restating
  what the types already say.
- Keep every runtime working: use \`@tundralibs/compat\` for filesystem /
  process / runtime access rather than a runtime-only global.
- Docs and config examples must be true — a wrong example is a bug.
`;

const CLAUDE_MD = `# {{name}}

@AGENTS.md

The line above imports [\`AGENTS.md\`](./AGENTS.md) — the single project guide
(commands, how rapid is used here, the middleware/error catalogs, testing,
the rules). Edit that file, never this one: every tool (Claude Code, Cursor,
Codex, Copilot) resolves to the same source.
`;

const COPILOT_MD = `# GitHub Copilot instructions

The project guide for any AI working in this codebase lives in
[\`/AGENTS.md\`](../AGENTS.md) — commands, how the app is built, testing, and
the rules. Read it first. Do not duplicate content here: this file is a
pointer so every tool (Copilot, Claude Code, Cursor, Codex) resolves to the
same single source.
`;

// ── assembly ────────────────────────────────────────────────────────────

/** No runtime prompt, so this is fixed rather than a per-runtime table. */
const AI_COMMANDS = `Deno:
  deno task dev        # run with reload
  deno task test       # deno test -A
  deno fmt && deno lint && deno task check
  deno task modules    # regenerate modules/mod.ts after adding a module
Node:
  npm install && npm run dev   # run with reload (tsx --watch)
  npm test
  npm run modules
Bun:
  bun install && bun --watch main.ts   # run with reload
  bun test
  bun run modules`;

/**
 * Build the `{ relativePath: contents }` map for a scaffold. `rapidVersion`
 * is the version `rapid init` resolved for the new project's dependency.
 * Both `deno.json` and `package.json` are always written.
 */

// ── the UI scaffold (init --ui): three tiers + a starter page ─────────

const VIEWS_CORE =
  `import { html, htmlDocument, template } from '@tundralibs/rapid/ui';
import type { RapidCoreData } from '@tundralibs/rapid';

/**
 * The CORE — the document tier: <head> (meta/css), body, the swap
 * runtime. App-level and irreplaceable; module/route layouts nest
 * inside it. \`title\`/\`meta\` arrive from the route's template options.
 */
export const CoreShell = template<RapidCoreData>((d, view) =>
  htmlDocument({
    title: d.title ?? '{{name}}',
    meta: d.meta,
    head: html\`{{vendorLink}}<link rel="stylesheet" href="\${
      view.asset('/public/site.css')
    }">\`,
    body: html\`\${d.body}<script src="\${view.runtimePath}"></script>\`,
  }), 'CoreShell');
`;

const VIEWS_LAYOUT =
  `import { type Html, html, template } from '@tundralibs/rapid/ui';

/**
 * The default MODULE-tier layout — the page shape (header + content
 * slot) nesting inside the core. A module brings its own with
 * \`@Module({ layout })\`; \`layout: false\` on a route goes straight
 * into the core.
 */
export const PageShape = template<{ body: Html; title?: string }>((d) =>
  html\`
    <header class="site"><a href="/">{{name}}</a></header>
    <main>\${d.title ? html\`<h1>\${d.title}</h1>\` : ''}\${d.body}</main>
  \`, 'PageShape');
`;

const VIEWS_COMPONENTS =
  `import { type Html, html } from '@tundralibs/rapid/ui';

/** A view component — a plain typed function; change it, every consumer follows. */
export const Card = (p: { title: string; body: Html; footer?: Html }): Html =>
  html\`<article class="card"><h3>\${p.title}</h3>
    <div>\${p.body}</div>\${
    p.footer ? html\`<footer>\${p.footer}</footer>\` : ''
  }</article>\`;
`;

const VIEWS_BARREL = `export { Card } from './components.ts';
export { CoreShell } from './core.ts';
export { PageShape } from './layout.ts';
`;

const SITE_CSS =
  `/* {{name}} — served via server.static; view.asset() fingerprints it. */
:root {
  color-scheme: light dark;
}
body {
  margin: 0;
  font: 16px/1.5 system-ui, sans-serif;
}
header.site {
  padding: 1rem 1.5rem;
  border-bottom: 1px solid color-mix(in srgb, currentColor 15%, transparent);
}
header.site a {
  font-weight: 600;
  text-decoration: none;
  color: inherit;
}
main {
  max-width: 46rem;
  margin: 0 auto;
  padding: 1.5rem;
}
.card {
  border: 1px solid color-mix(in srgb, currentColor 15%, transparent);
  border-radius: 10px;
  padding: 1rem 1.2rem;
  margin: 1rem 0;
}
.card h3 {
  margin: 0 0 .5rem;
}
`;

const HOME_MODULE = `import { GET } from '@tundralibs/rapid/decorators';
import { event, RapidModule } from '@tundralibs/rapid/modules';
import { HomePage } from './Home.views.ts';

const EVENTS = { Visited: event<{ at: string }>() };

/** The home page — same route serves JSON (curl it) and the HTML page. */
export class Home extends RapidModule<typeof EVENTS> {
  readonly name = 'Home';
  readonly namespace = 'home';
  protected readonly events = EVENTS;

  @GET('/', {
    template: { render: HomePage, prefer: 'html', title: 'Welcome' },
  })
  async index() {
    await this.emit('Visited', { at: new Date().toISOString() });
    return { content: { app: '{{name}}', ok: true } };
  }
}
`;

const HOME_VIEWS = `import { html, template } from '@tundralibs/rapid/ui';
import { Card } from '../views/mod.ts';

/** Co-located views: this module's fragments live beside the module. */
export const HomePage = template<{ app: string; ok: boolean }>(
  (d) =>
    html\`\${
      Card({
        title: d.app,
        body: html\`<p>Same handler, two representations: this page and
        the bare fragment
        (<code>curl -H 'rapid-swap: 1' localhost:3000/</code>). Routes
        declared <code>prefer: 'json'</code> serve JSON too; under
        <code>server.api</code> (a host or a prefix) pages like this one
        are simply not there.</p>\`,
      })
    }\`,
  'HomePage',
);
`;

/** `answers.norm`'s vars: the manifest deps/check-target deltas + the
 * merged AI section — split out so `scaffold()` stays under the
 * complexity budget. */
function normScaffoldVars(
  answers: ScaffoldAnswers,
  normVersions?: { norm: string | null; utils: string | null },
): Pick<
  Record<string, string>,
  'checkTargets' | 'normDenoImports' | 'normPackageDeps' | 'aiNorm'
> {
  if (!answers.norm) {
    return {
      checkTargets: 'main.ts',
      normDenoImports: '',
      normPackageDeps: '',
      aiNorm: '',
    };
  }
  const spec = (v: string | null | undefined) => v == null ? '' : `@^${v}`;
  return {
    checkTargets: 'main.ts db.ts',
    normDenoImports: `,\n    "@tundralibs/norm": "jsr:@tundralibs/norm${
      spec(normVersions?.norm)
    }",\n    "@tundralibs/utils": "jsr:@tundralibs/utils${
      spec(normVersions?.utils)
    }",\n    "$sqlite_deno": "jsr:@db/sqlite@^0.13.0"`,
    normPackageDeps: `,\n    "@tundralibs/norm": "npm:@jsr/tundralibs__norm${
      spec(normVersions?.norm)
    }",\n    "@tundralibs/utils": "npm:@jsr/tundralibs__utils${
      spec(normVersions?.utils)
    }"`,
    aiNorm: NORM_AI_SECTION,
  };
}

/** The UI scaffold (`init --ui`): three view tiers + a starter page, the
 * Application.yaml `static`/`ui` blocks uncommented, and main.ts rewired
 * to a templated route — split out so `scaffold()` stays under the
 * complexity budget. Mutates `files` in place. */
function addUiFiles(
  files: Record<string, string>,
  vars: Record<string, string>,
  answers: ScaffoldAnswers,
): void {
  const uiVars = {
    ...vars,
    vendorLink: answers.vendorCss !== undefined
      ? `<link rel="stylesheet" href="\${
          view.asset('/public/vendor/${answers.vendorCss}')
        }">`
      : '',
  };
  files['views/core.ts'] = render(VIEWS_CORE, uiVars);
  files['views/layout.ts'] = render(VIEWS_LAYOUT, vars);
  files['views/components.ts'] = VIEWS_COMPONENTS;
  files['views/mod.ts'] = VIEWS_BARREL;
  files['public/site.css'] = render(SITE_CSS, vars);
  // The DATA half in YAML (per replica): uncomment the static mount and
  // the ui block the base template carries, pages-first.
  files['configs/Application.yaml'] = files['configs/Application.yaml']!
    .replace(
      / {2}# static:[^\n]*\n(?: {2}# {3}[^\n]*\n)+/,
      (block) => block.replace(/^ {2}# /gm, '  '),
    )
    .replace(
      /# ui:\n(?:# {3}[^\n]*\n)+/,
      (block) =>
        block.replace(/^# /gm, '').replace(
          'prefer: json # json | html',
          'prefer: html # json | html',
        ),
    );
  // …the CODE half at initialize. Always 'main.ts' — no scaffold branch
  // names it differently.
  const main = 'main.ts';
  if (files[main] !== undefined) {
    files[main] = files[main]!
      .replace(
        "import { Application } from '@tundralibs/rapid';",
        "import { Application } from '@tundralibs/rapid';\n" +
          "import { CoreShell, PageShape } from './views/mod.ts';",
      )
      .replace(
        'await Application.initialize(configDir);',
        'await Application.initialize({\n' +
          '  path: configDir,\n' +
          '  ui: { core: CoreShell, layout: PageShape }, // the CODE half\n' +
          '});',
      );
  }
  if (answers.module) {
    files['modules/Home.ts'] = render(HOME_MODULE, vars);
    files['modules/Home.views.ts'] = HOME_VIEWS;
    files['modules/mod.ts'] =
      `// Generated by \`rapid modules\` — do not edit by hand.
export { Greeter } from './Greeter.ts';
export { Home } from './Home.ts';
`;
  } else if (files['main.ts'] !== undefined) {
    // Plain shape: swap the JSON sample for a templated page route.
    files['main.ts'] = files['main.ts']!
      .replace(
        "import { CoreShell, PageShape } from './views/mod.ts';",
        "import { Card, CoreShell, PageShape } from './views/mod.ts';\n" +
          "import { html, template } from '@tundralibs/rapid/ui';",
      )
      .replace(
        `app.get('/', () => ({ content: { app: '{{name}}', ok: true } }));`
          .replace('{{name}}', answers.name),
        `const HomePage = template<{ app: string; ok: boolean }>(
  (d) =>
    html\`\${
      Card({
        title: d.app,
        body: html\`<p>Same handler, two representations: this page and
        the bare fragment
        (<code>curl -H 'rapid-swap: 1' localhost:3000/</code>). Routes
        declared <code>prefer: 'json'</code> serve JSON too; under
        <code>server.api</code> (a host or a prefix) pages like this one
        are simply not there.</p>\`,
      })
    }\`,
  'HomePage',
);

app.get(
  '/',
  { template: { render: HomePage, prefer: 'html', title: 'Welcome' } },
  () => ({ content: { app: '${answers.name}', ok: true } }),
);`,
      );
  }
}

export function scaffold(
  answers: ScaffoldAnswers,
  rapidVersion: string | null,
  // Only resolved by init.ts when answers.norm — a network fetch neither
  // caller needs otherwise; scaffold() itself stays a pure function.
  normVersions?: { norm: string | null; utils: string | null },
): Record<string, string> {
  const vars: Record<string, string> = {
    name: answers.name,
    rapidVersion: rapidVersion ?? '',
    // Unknown (offline, or before the first publish) → no constraint, which
    // both registries read as "latest"; never a made-up floor.
    rapidSpec: rapidVersion === null ? '' : `@^${rapidVersion}`,
    ...normScaffoldVars(answers, normVersions),
    aiCommands: AI_COMMANDS,
    aiModules: answers.module
      ? `
## Modules (this project uses the module system)

- A module is a class extending \`RapidModule\` in \`modules/\`, declaring
  \`name\`, \`namespace\` and \`events\`; \`modules/mod.ts\` is a GENERATED barrel
  (\`rapid modules\`) — never edit it by hand, regenerate it after adding a module.
- Route methods are decorated (\`@GET('/path/:id:')\`, \`@POST\`, …, from
  \`@tundralibs/rapid/decorators\`). Decorators are metadata-only and never
  wrap the method, so a module unit-tests with \`new Greeter().hello('x')\` and
  no server. Bind arguments with \`bind: [param('id'), payload(Schema)]\` — a
  schema OBJECT validates AND documents the body; \`config('set.key')\` binds a
  config value on any transport (set = lowercased file name, keys
  case-sensitive).
- A module method returns the same \`{ content }\` reply shape as a handler.
  Declared events are emitted with \`this.emit('Name', payload)\`; \`this.log\`
  is a scoped logger. See \`modules/Greeter.ts\`.
`
      : '',
  };
  vars.rapidVersionLabel = rapidVersion ?? 'latest';
  vars.aiErrors = errorTable();
  vars.aiMiddleware = middlewareTable();
  vars.aiDocs = docLinks(rapidVersion);
  vars.aiUi = answers.ui === true
    ? `

This project was scaffolded with \`--ui\`: \`views/core.ts\` is the document
shell (\`CoreShell\`), \`views/layout.ts\` the page frame (\`PageShape\`),
\`views/components.ts\` the shared pieces; \`public/\` is mounted under
\`server.static\` with fingerprinting on; \`configs/Application.yaml\`'s
\`ui:\` block sets \`prefer: html\`.`
    : '';
  const put = (tpl: string) => render(tpl, vars);
  const files: Record<string, string> = {
    '.gitignore': GITIGNORE,
    'README.md': put(README),
    'configs/Application.yaml': put(APPLICATION_YAML),
    // Both manifests, always — every package in this monorepo ships both,
    // and there's no runtime prompt to pick just one. An npm-shaped project
    // needs the @jsr scope pointed at npm.jsr.io or `npm install` 404s.
    'deno.json': put(DENO_JSON),
    'package.json': put(PACKAGE_JSON),
    '.npmrc': '@jsr:registry=https://npm.jsr.io\n',
    'main.ts': put(answers.module ? MAIN_MODULES : MAIN_PLAIN),
  };
  if (answers.module) {
    files['modules/Greeter.ts'] = MODULE_SAMPLE;
    files['modules/mod.ts'] = MODULES_BARREL;
  }
  if (answers.ui === true) {
    addUiFiles(files, vars, answers);
  }
  if (answers.norm) {
    files['models/Users.ts'] = MODEL_SAMPLE;
    files['models/mod.ts'] = MODELS_BARREL;
    files['db.ts'] = DB;
    files['configs/Norm.yaml'] = NORM_YAML;
  }
  // ONE source (AGENTS.md) + two pointers — always written, mirroring how
  // the tools resolve them; CLAUDE.md imports the guide with `@AGENTS.md`.
  files['AGENTS.md'] = render(put(AGENTS_MD), vars); // 2nd pass: {{name}} inside aiModules
  files['CLAUDE.md'] = put(CLAUDE_MD);
  files['.github/copilot-instructions.md'] = put(COPILOT_MD);
  return files;
}

/**
 * The middleware catalog the generated guide carries — one row per shipped
 * factory. `cli.test.ts` asserts every factory the barrel exports is here.
 */
export const MIDDLEWARE_CATALOG: readonly (readonly [
  factory: string,
  purpose: string,
])[] = [
  [
    'secureHeaders()',
    'helmet set: nosniff, frame-options, referrer, HSTS (opt-in), CSP, COOP/COEP/OAC (ui surface), permissions-policy',
  ],
  [
    'cors({ origin, methods, allowedHeaders, exposedHeaders, credentials, maxAge })',
    'CORS + preflight; a disallowed origin gets no headers (the browser blocks)',
  ],
  [
    'timeout(seconds)',
    '504 past the deadline; the work keeps running detached (jobs hold their overlap slot)',
  ],
  [
    'rateLimit({ max, window, key, headers, hooks, maxKeys })',
    'fixed window per address/connection; x-ratelimit-* + retry-after; hooks.increment is atomic',
  ],
  [
    'compress({ threshold })',
    'gzip/deflate for compressible types; Vary: Accept-Encoding; weakens an inner ETag',
  ],
  [
    'etag()',
    'strong content ETag + 304 for GET/HEAD 200s; register INSIDE compress()',
  ],
  [
    'csrf({ cookie, header, field, session, sameSite, secure, path })',
    'signed, session-bound double-submit token; register OUTSIDE session()',
  ],
  [
    'session({ hooks, cookie, idleTtl, absoluteTtl, rolling, sameSite, secure, path })',
    'lazy, hook-backed session — getSession(ctx) → get/set/delete/regenerate/destroy',
  ],
  [
    'idempotency({ scope, ttl, pendingTtl, header, replayedHeader, hooks, maxRecords })',
    'Idempotency-Key replays (fingerprinted): 409 in flight, 422 mismatch; scope is REQUIRED',
  ],
  [
    'pactAuth(pact, options) → { authenticate, authorize, login, logout, refresh, me }',
    'the @tundralibs/pact adapter (subpath ./middlewares/pact): guards plus the session handlers',
  ],
  [
    'onlyHTTP / onlySOCKET / onlyJOB · guardHTTP / guardSOCKET / guardJOB · onlyApi / onlyUi',
    'scope helpers: skip, fail-closed reject, or HTTP-surface gate',
  ],
  [
    'markStateKeyUser(mw) · middlewareUsesStateKey · middlewareScope · getSession · memorySessionHooks / memoryRateLimitHooks / memoryIdempotencyHooks',
    'the helpers around them',
  ],
];

/** The docs shipped in the package — every `docs/*.md` (asserted by `cli.test.ts`). */
export const PACKAGE_DOCS: readonly (readonly [file: string, title: string])[] =
  [
    [
      'README.md',
      'README — the tour: installation, routing, middleware, modules, DI, validation, streaming, UI, endpoints, auth, observability, testing, CLI',
    ],
    [
      'docs/Rapid-Configuration.md',
      'Configuration — every Application.yaml key: type, default, unit, validation, consumer',
    ],
    [
      'docs/Rapid-Middleware.md',
      'Middleware — order and every option, hook and pitfall',
    ],
    [
      'docs/Rapid-Context.md',
      'Context & application object — what ctx carries per transport, input, output, services, every app.* member',
    ],
    [
      'docs/Rapid-Modules.md',
      'Modules — decorators, binders, RapidModule, events, invoke, lifecycle, app.modules()',
    ],
    [
      'docs/Rapid-Testing.md',
      'Testing — client(), harness(), view(), the three lanes',
    ],
    [
      'docs/Rapid-Errors.md',
      'Errors — the throw→response pipeline, disclosure by mode, every RAPID_* code',
    ],
    [
      'docs/Rapid-Auth.md',
      'Authentication & authorization — bring-your-own auth and the pact adapter (HMAC, JWE)',
    ],
    [
      'docs/Rapid-UI.md',
      'UI — templates, layouts, swaps, forms, lazy regions, live channels, history',
    ],
    [
      'docs/Rapid-Endpoints.md',
      'Endpoints — health(), ready(), metrics(), openapi(), docs(): replies, options, probes and scrape target',
    ],
    [
      'docs/Rapid-OpenAPI.md',
      'OpenAPI — the document, security schemes, the docs() reference page, credential box, customization, third-party viewers',
    ],
    ['docs/Rapid-Database.md', 'Database access & connection pooling'],
    [
      'examples/README.md',
      'Examples — four runnable apps (blog, kanban, dashboard, htmx) and where to start',
    ],
  ];

/**
 * Render a markdown table with every column padded to its widest cell —
 * `deno fmt`'s markdown formatter enforces this, so an unpadded table
 * (the naive `join('|')`) fails a fresh scaffold's OWN `deno fmt --check`.
 */
function markdownTable(headers: string[], rows: string[][]): string {
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => r[i]!.length))
  );
  const pad = (cells: string[]) =>
    `| ${cells.map((c, i) => c.padEnd(widths[i]!)).join(' | ')} |`;
  return [
    pad(headers),
    pad(widths.map((w) => '-'.repeat(w))),
    ...rows.map(pad),
  ].join('\n');
}

function errorTable(): string {
  const rows = Object.entries(RAPID_ERROR_CODES).map((
    [code, meta],
  ) => [`\`${code}\``, String(meta.status), meta.message]);
  return markdownTable(['Code', 'Status', 'PRODUCTION message'], rows);
}

function middlewareTable(): string {
  const rows = MIDDLEWARE_CATALOG.map(([f, p]) => [`\`${f}\``, p]);
  return markdownTable(['Factory', 'Purpose'], rows);
}

function docLinks(version: string | null): string {
  const base = version === null
    ? 'https://jsr.io/@tundralibs/rapid'
    : `https://jsr.io/@tundralibs/rapid/${version}`;
  return [
    'Pinned to the installed version (Node/Bun: also under `node_modules/@tundralibs/rapid/`):',
    '',
    ...PACKAGE_DOCS.map(([file, title]) =>
      // The examples are not in the published package — link the repo.
      `- [${title}](${
        file.startsWith('examples/')
          ? `https://github.com/TundraSoft/TundraLibs/blob/main/packages/rapid/${file}`
          : `${base}/${file}`
      })`
    ),
  ].join('\n');
}
