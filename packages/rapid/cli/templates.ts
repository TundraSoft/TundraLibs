/**
 * @fileoverview Project templates for `rapid init`, kept as plain,
 * EDITABLE string constants — one per file. `{{token}}` placeholders are
 * filled by {@link render}. {@link scaffold} assembles the file map for a
 * given set of answers (module / norm / docker toggles). Edit the strings
 * below to change what a new project looks like.
 *
 * @module
 */

/** The choices `rapid init` gathers. */
export type ScaffoldAnswers = {
  name: string;
  module: boolean;
  norm: boolean;
  /**
   * The UI layer: three-tier views (core + module layout + components),
   * a starter stylesheet under `public/`, `server.static` + `ui:` in the
   * config, and a templated home page. Server runtimes only (Workers
   * assets need a bundler manifest — `init` refuses the combination).
   */
  ui?: boolean;
  /**
   * A vendor stylesheet filename under `public/vendor/` the core should
   * link BEFORE site.css — set by `init --with <css>` after a successful
   * self-host download (never a CDN link at runtime).
   */
  vendorCss?: string;
  /**
   * The project's runtime — a PROJECT-WIDE choice made first: it decides
   * which config file is primary (`deno.json` vs `package.json`), the
   * install/dev/start/test commands, and the deploy artifact. `workers`
   * (Cloudflare) serves via `app.fetch` and gets `wrangler.toml` instead of
   * a Dockerfile.
   */
  runtime: 'deno' | 'bun' | 'node' | 'workers';
  /** A Dockerfile on the org `tundrasoft/<runtime>` image (deno/bun/node only). */
  docker: boolean;
  /** A GitHub Actions CI workflow (fmt / lint / check / test on the chosen runtime). */
  github: boolean;
  /**
   * AI-assistant instructions: one real `AGENTS.md` (rapid's conventions,
   * this project's runtime commands and layout) plus thin pointers
   * `CLAUDE.md` and `.github/copilot-instructions.md`, so Claude Code,
   * Cursor, Codex and Copilot all resolve to ONE source and never drift.
   */
  ai: boolean;
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
`;

const APPLICATION_YAML =
  `# {{name}} — the \`Application\` config set. Every key except \`name\` is
# optional; the values below ARE rapid's defaults unless a comment says
# otherwise. \`\${VAR}\` placeholders are filled from the environment / .env
# at load; an UNSET placeholder is left as literal text — never commit secrets.
name: {{name}}
# DEVELOPMENT | PRODUCTION — error disclosure and the default log level
# (rapid defaults to PRODUCTION; a new project starts in DEVELOPMENT)
mode: DEVELOPMENT
# Signing key for signed cookies, session() and csrf() — at least 32 chars,
# from the environment. Uncomment once APP_SECRET is set: an unset
# placeholder is NOT a valid secret and fails validation at boot.
# secret: \${APP_SECRET}
# CLONE | PROTOTYPE | SHARE — how each request's ctx.state is built
stateMode: CLONE
# Graceful-shutdown deadline in ms before force-exit (0 disables)
shutdownTimeout: 25000

server:
  enabled: true # run the HTTP listener on this replica
  port: 3000 # 0 = OS-assigned (rapid's own default is 8008)
  hostname: localhost
  # unixSocketPath: /tmp/{{name}}.sock # replaces TCP entirely when set
  # tls: # see @tundralibs/compat TLSOptions — inline PEM or file paths
  requestIdHeader: x-request-id # inbound correlation id adopted per request
  trustProxy: false # false | true | <reverse-proxy hop count>
  maxBodySize: 1048576 # bytes, non-file bodies (0 disables)
  metrics: false # app.meter + the metrics() endpoint
  autoHead: true # a HEAD route for every GET
  methodNotAllowed: false # 405 + Allow instead of 404 on a wrong method
  ignoreTrailingSlash: true # /users and /users/ are the same route
  socketPath: /ws # websocket upgrade path for socket commands
  paging:
    pageHeader: x-page-number
    sizeHeader: x-page-size
    defaultSize: 10
    maxSize: 1000 # larger requests are clamped
    maxPage: 1000
  query: # structural caps for the query-string parser
    maxFilters: 50
    maxSorts: 5
    maxValueLength: 2048
    maxArrayItems: 100
  versioning:
    mode: header # header | accept | path
    identifier: x-api-version # header name | accept vendor token | path regex
    default: v1 # the version a request without one resolves to

jobs:
  enabled: true # run scheduled (@JOB / app.job) jobs on this replica

uploads:
  # path: ./uploads # default: a temp dir created at boot
  maxSize: 10485760 # bytes per file
  allowedExtensions: [] # FAIL-SAFE: nothing accepted until listed, e.g. [.png, .pdf]

logger:
  # Syslog severity NUMBER: 0 EMERGENCY · 1 ALERT · 2 CRITICAL · 3 ERROR
  # · 4 WARNING · 5 NOTICE · 6 INFO · 7 DEBUG (names are not accepted)
  # (default: 7 DEBUG in DEVELOPMENT, 6 INFO in PRODUCTION)
  level: 6

# Tracing is opt-in — uncomment to enable.
# tracer:
#   exporter:
#     type: CONSOLE # CONSOLE | OTLP (OTLP also takes baseURL + headers)
`;

const MAIN_PLAIN = `import { Application } from '@tundralibs/rapid';

const configDir = new URL('./configs', import.meta.url).pathname;
const app = await Application.initialize(configDir);

app.get('/', () => ({ content: { app: '{{name}}', ok: true } }));

await app.start();
app.log.info(\`{{name}} listening on \${app.address}\`);
`;

const MAIN_MODULES = `import { Application } from '@tundralibs/rapid';
import * as modules from './modules/mod.ts';

const configDir = new URL('./configs', import.meta.url).pathname;
const app = await Application.initialize(configDir);

// Boot the module system — every RapidModule exported from modules/mod.ts.
await app.modules({ modules: [modules] });

await app.start();
app.log.info(\`{{name}} listening on \${app.address}\`);
`;

const MODULE_SAMPLE = `import { GET } from '@tundralibs/rapid/decorators';
import { event, RapidModule } from '@tundralibs/rapid/modules';

const EVENTS = { Greeted: event<{ name: string }>() };

export class Greeter extends RapidModule<typeof EVENTS> {
  readonly name = 'Greeter';
  readonly namespace = 'greeter';
  protected readonly events = EVENTS;

  @GET('/hello/:name:')
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

const DB = `import { Norm } from '@tundralibs/norm';
import { BlogSchema } from './models/mod.ts';

/** One connected Norm instance for the app (SQLite by default). */
export const norm = new Norm({
  database: { dialect: 'sqlite', path: './data' },
});
await norm.connect();
export const db = norm.use(BlogSchema);
`;

const MODEL_SAMPLE = `import { Norm } from '@tundralibs/norm';

/** A minimal norm entity — adjust to your schema. */
export const Users = {
  name: 'Users',
  columns: {
    id: { type: 'UUID', primaryKey: true },
    email: { type: 'VARCHAR', length: 255 },
    createdAt: { type: 'TIMESTAMP' },
  },
} as const;
`;

const MODELS_BARREL = `import { Users } from './Users.ts';

/** The schema registry norm.use() consumes. */
export const BlogSchema = { Users } as const;
`;

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
    "check": "deno check main.ts"
  },
  "imports": {
    "@tundralibs/rapid": "jsr:@tundralibs/rapid@^{{rapidVersion}}"
  }
}
`;

const PACKAGE_JSON = `{
  "name": "{{name}}",
  "type": "module",
  "scripts": {
    "dev": "{{devCmd}}",
    "start": "{{startCmd}}",
    "modules": "{{runTs}} node_modules/@tundralibs/rapid/cli/mod.ts modules ./modules",
    "upgrade": "{{runTs}} node_modules/@tundralibs/rapid/cli/mod.ts upgrade",
    "test": "{{testCmd}}"
  },
  "dependencies": {
    "@tundralibs/rapid": "npm:@jsr/tundralibs__rapid@^{{rapidVersion}}"
  }{{devDeps}}
}
`;

const README = `# {{name}}

A [rAPId](https://jsr.io/@tundralibs/rapid) application.

## Run

\`\`\`bash
{{runHint}}
\`\`\`

## Tasks

- \`dev\` / \`start\` — run the app
- \`modules\` — regenerate \`modules/mod.ts\`
- \`upgrade\` — bump \`@tundralibs/*\` to the latest release
`;

const DOCKERFILE =
  `# Built on the org image: Alpine + s6-overlay, runs as the unprivileged
# \`tundra\` user, and starts the app from the ENV contract below — the image's
# own s6 service runs it, so there is deliberately NO CMD / ENTRYPOINT here.
FROM tundrasoft/{{runtime}}:{{imageTag}}

COPY --chown=tundra:tundra . /app

# {{runtimeEnvDoc}}
{{runtimeEnv}}
EXPOSE {{port}}
`;

const DOCKERIGNORE = `node_modules
.git
*.log
/dist
/coverage
.env
`;

const WRANGLER_TOML = `name = "{{name}}"
main = "worker.ts"
compatibility_date = "2026-01-01"
compatibility_flags = ["nodejs_compat"]
`;

const WORKER_TS =
  `// Cloudflare Workers entry: no listening socket, so the app serves through
// its fetch handler. Jobs are not scheduled here — fire them from a Cron
// Trigger via app.triggerJob(); socket commands need a listener.
import { Application } from '@tundralibs/rapid';
{{workerModulesImport}}
const app = await Application.initialize({ name: '{{name}}' });
{{workerSetup}}
export default { fetch: (request: Request) => app.fetch(request) };
`;

const CI_WORKFLOW = `name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
{{ciSetup}}
{{ciSteps}}
`;

const AGENTS_MD = `# {{name}} — agent guide

A [rAPId](https://jsr.io/@tundralibs/rapid) application running on **{{runtime}}**.
This file is the always-on baseline for any AI working in this repo. It is read
by Claude Code (via \`CLAUDE.md\`), Cursor and Codex (via \`AGENTS.md\`), and GitHub
Copilot (via \`.github/copilot-instructions.md\`) — all three resolve here.

## Commands

\`\`\`bash
{{aiCommands}}
\`\`\`

Run the relevant ones before you consider a change done.

## How this app is built

- **One entry point.** \`Application.initialize(source)\` is the ONLY way to make
  an app (the constructor is private). \`main.ts\` passes the \`configs/\` directory,
  so \`configs/Application.yaml\` supplies the options and every other config
  set stays readable via \`app.config\`. Never construct \`new Application()\`.
- **Routes are radrouter-native.** Path params are COLON-WRAPPED: \`/users/:id:\`,
  never express-style \`:id\`. The five verb helpers (\`app.get\`/\`post\`/\`put\`/
  \`patch\`/\`delete\`) take optional route-scoped middleware, then the handler last.
- **A handler returns the reply.** Return \`{ content, status?, headers? }\`
  (\`content\` is a string, a plain object → JSON, a \`Uint8Array\`, or a
  \`ReadableStream\` / async iterable to stream). For HTTP replies you may also
  return \`cookies: [...]\` and \`redirect: '/path'\`; both are silently ignored
  on JOB/SOCKET transports.
- **Middleware is universal.** \`app.use(mw)\` runs on HTTP requests, socket
  frames AND job firings. Narrow with \`ctx.type\` or the \`onlyHTTP\` /
  \`guardHTTP\` scope helpers (\`guard*\` fails closed — use it for auth).
- **Errors:** throw a \`RapidError(code)\` for a known condition — the code maps
  to the HTTP status and a client-safe message. An unknown throw is an opaque
  500 by design. A \`@tundralibs/guardian\` validation failure is automatically
  a 400; wrap any OTHER validator in \`validated()\` to get the same.
- **Secrets:** the app \`secret\` option (≥ 32 chars, from the environment —
  never committed) is the one HMAC key for signed cookies, \`session()\` and
  \`csrf()\`.
- **UI (optional, \`@tundralibs/rapid/ui\`):** a route may name an HTML
  template — \`app.get('/x', { template: MyView }, handler)\` — while the
  handler keeps returning JSON-shaped data. A \`rapid-swap\` request header
  gets the fragment; otherwise the route's \`prefer\` (\`'json'\` default)
  picks JSON or the layout-wrapped page — \`Accept\` is never consulted.
  \`html\` escapes every interpolation (\`raw()\` is the only opt-out);
  the \`ui\` option of \`Application.initialize({ ui: { core, layout,
  errorTemplates, view } })\` sets app defaults and serves the swap
  runtime at \`/__rapid/ui.js\`. Templates never see \`ctx\` — the frozen
  \`view\` bag exposes nothing from \`ctx.auth\` unless the \`view\`
  projection names the fields.
{{aiModules}}
## Testing

Use \`@tundralibs/rapid/testing\`: \`client(app)\` drives routes through
\`app.fetch\` with no port (\`await api.get('/path')\` → \`{ status, body }\`);
\`harness({ modules, stub })\` boots the module system with fakes stocked into
an isolated DI container. A test must be able to FAIL — never assert something
the type-checker already proves.

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

| Need                                                      | Package                                                |
| --------------------------------------------------------- | ------------------------------------------------------ |
| Validate input / define a schema                          | \`@tundralibs/guardian\`                                 |
| Authentication (JWT, API keys, HMAC signing), permissions | \`@tundralibs/pact\`                                     |
| Database models / ORM                                     | \`@tundralibs/norm\` (+ \`drivers\` for the engine)        |
| Hand-built typed query → SQL                              | \`@tundralibs/oql\`                                      |
| Cache (memory / Redis / Memcached)                        | \`@tundralibs/cacher\`                                   |
| Generate ids (nanoid / ulid / sequence)                   | \`@tundralibs/id\`                                       |
| Hash, encrypt, sign, password hashing                     | \`@tundralibs/crypt\`                                    |
| Call an upstream REST API                                 | \`@tundralibs/restler\`                                  |
| Logging                                                   | \`@tundralibs/slogger\` (via \`app.log\`)                  |
| Cron / scheduled jobs                                     | \`@tundralibs/cronus\` (via \`@JOB\`)                      |
| Dependency injection                                      | \`@tundralibs/doctor\` (\`inject()\`, \`app.container\`)     |
| Distributed tracing                                       | \`@tundralibs/tracer\` (the \`tracer\` option)             |
| A runtime-only global (fs, env, process, fetch)           | \`@tundralibs/compat\` — never the global                |
| Error base class, config loading, memoize, IP helpers     | \`@tundralibs/utils\`                                    |
| HTTP router                                               | \`@tundralibs/radrouter\` (rapid already uses it)        |

### The shapes

- **Validation — \`@tundralibs/guardian\`.** Build a schema, \`parse\` it:
  \`Guardian.object({ id: Guardian.number().integer().positive(), email:
  Guardian.string().email(), role: Guardian.enum(['admin','user']) })\`;
  \`type User = Guardian.infer<typeof UserSchema>\`; \`UserSchema.parse(input)\`
  throws, \`safeParse\` returns \`[err, value]\`. In rapid a guardian failure is
  automatically a 400 — bind it with \`payload(UserSchema.parse)\`.
- **Auth — \`@tundralibs/pact\`.** Bitmask authorization + credential schemes
  (BASIC/BEARER/TOKEN/APIKEY/HMAC) + OAuth. \`Pact.create({ bits: { READ: 1n,
  EDIT: 2n }, modules: { Post: ['READ','EDIT'] }, apiKeys: true, hooks:
  { getUser, getApiKey, saveApiKey } })\`. rapid's own adapter,
  \`@tundralibs/rapid/middlewares/pact\`, wires it in: \`pact(options)\` once at
  boot, then \`authenticate(schemes?)\` + \`authorize(module, permission)\` on
  routes; the result lands in \`ctx.auth\` (read-only, set once per request).
  API keys: \`pact.issueApiKey(userId)\` → \`{ id, secret }\` (persist only the
  hash, show the secret once). HMAC over any content: \`pact.sign(content,
  key?)\` / \`pact.verifySignature(content, sig, key?)\`.
- **ORM — \`@tundralibs/norm\`.** \`Entity('users', { id: Column.uuid(), email:
  Column.varchar(255).encrypt().hash() }, { pk: ['id'] })\` → \`Schema('Identity',
  { Users })\` → \`new Norm({ engine, secret })\` → \`norm.use(Identity)\` →
  \`db.repo('Users').insert({...})\` / \`.find(...)\`. Engines come from a
  separate install, \`@tundralibs/drivers\` (e.g. \`SQLiteEngine\`,
  \`PostgresEngine\`). Pick \`--norm\` on init to get a wired \`db.ts\`.
- **Typed queries — \`@tundralibs/oql\`.** The query object norm translates to
  SQL; use it directly only for hand-built queries: \`const q: Query<'SELECT',
  User> = { type: 'SELECT', table: 'users', columns: [...], projection: {...}
  }\`, then a translator (\`PostgresTranslator\`) renders it. Reach for \`norm\`
  first.
- **Caching — \`@tundralibs/cacher\`.** Swappable backends: \`const cache =
  Cacher.create('MEMORY', 'my-cache', { defaultExpiry: 300 })\` (or \`'REDIS'\`,
  \`'MEMCACHED'\`); \`await cache.set(key, value)\`, \`await cache.get<T>(key)\`,
  \`has\`, \`delete\`, \`clear\`. Same API across backends, so start in-memory and
  switch by config. rapid's \`rateLimit()\`/\`session()\` take any \`{ get, set }\`
  store — a cacher instance fits.
- **Ids — \`@tundralibs/id\`.** \`nanoID()\` (21-char URL-safe; \`nanoID(10,
  NUMBERS)\` for length/alphabet), \`ulid()\` (sortable), \`sequenceID()\` (a
  FACTORY: \`const seq = sequenceID(); seq()\` → a bigint, counter-based,
  crypto-free), \`ObjectID()\` (also a factory). rapid mints request ids with
  \`sequenceID\` by default — set \`Application.requestIdGenerator\` to change.
- **Crypto — \`@tundralibs/crypt\`.** Primitives, by subpath. Hashing: \`await
  sha256(data)\` / \`digest(data, { algorithm: 'SHA-384' })\` from
  \`@tundralibs/crypt/digest\`. Encryption: \`encryptAES(text, key, { mode:
  'GCM', keyLength: 256 })\` / \`decryptAES\` from \`@tundralibs/crypt/encrypt\`;
  also \`pbkdf2Hash\`/\`pbkdf2Verify\` (passwords) and \`hkdf\`. Signing:
  \`signHMAC\`/\`verifyHMAC\`, JWT sign/verify. Passwords: hash with pbkdf2,
  never store plaintext.
- **REST client — \`@tundralibs/restler\`.** A typed client base. Subclass it,
  set \`vendor\`, pass \`{ baseURL }\` to \`super\`, and expose methods built on
  \`this._makeRequest<T>({ path, method, contentType: 'JSON', payload })\`.
  Put each upstream API in its own class under e.g. \`clients/\`.
- **Foundation — \`@tundralibs/utils\`.** \`BaseError<Meta>\` (extend it for app
  errors — context-carrying, chainable); \`loadConfig({ path })\` →
  \`config.get<T>('a.b')\` (what rapid's \`Application.initialize('./configs')\`
  uses); \`memoize(fn, ttlMs)\`, \`throttle(fn, ms)\`, \`once(fn)\`; \`@Singleton\`;
  \`Options\` (the options+events base class); network helpers (\`isPublicIP\`,
  \`isInSubnet\`, \`getFreePort\`); \`envArgs\` (.env + Docker secrets).
- **Logging — \`@tundralibs/slogger\`.** The logger behind \`app.log\`; reach
  for it directly only outside the app. \`new Slogger({ appName, level:
  SyslogSeverities.INFO, handlers: [{ name: 'console', type:
  'ConsoleHandler', level, formatter: 'standard' }] })\`;
  \`logger.info('msg', { ...context })\`. Inside a handler or module use
  \`app.log\` / \`this.log\` — they carry the request id for you.
- **Router — \`@tundralibs/radrouter\`.** Already inside rapid; you normally
  don't touch it. Its grammar is why params are \`/users/:id:\`. Constructor
  options rapid passes through: \`caseSensitive\`, \`ignoreTrailingSlash\`.

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

The project guide for any AI working here lives in [\`AGENTS.md\`](./AGENTS.md) —
commands, how the app is built, testing, and the rules. Read it first. This
file exists so Claude Code finds it; do not duplicate content here.
`;

const COPILOT_MD = `# GitHub Copilot instructions

The project guide for any AI working in this codebase lives in
[\`/AGENTS.md\`](../AGENTS.md) — commands, how the app is built, testing, and
the rules. Read it first. Do not duplicate content here: this file is a
pointer so every tool (Copilot, Claude Code, Cursor, Codex) resolves to the
same single source.
`;

// ── assembly ────────────────────────────────────────────────────────────

/**
 * Everything that differs per runtime, in one table. `workers` has no Docker
 * row (no container) — it gets `wrangler.toml` + `worker.ts` instead.
 */
const RUNTIME = {
  deno: {
    configFile: 'deno.json',
    runHint: 'deno task dev',
    imageTag: '2',
    // The tundrasoft/deno image runs `deno task $TASK` under s6 as `tundra`.
    runtimeEnvDoc:
      'TASK selects the deno task the image runs; ALLOW_* map to --allow-* flags.',
    runtimeEnv:
      'ENV TASK=start \\\n    ALLOW_NET=1 \\\n    ALLOW_READ=/app \\\n    ALLOW_ENV=1',
    ciSetup:
      '      - uses: denoland/setup-deno@v2\n        with:\n          deno-version: v2.x',
    ciSteps:
      '      - run: deno fmt --check\n      - run: deno lint\n      - run: deno check main.ts\n      - run: deno test -A',
    aiCommands:
      'deno task dev        # run with reload\ndeno task test       # deno test -A\ndeno fmt && deno lint && deno check main.ts\ndeno task modules    # regenerate modules/mod.ts after adding a module',
  },
  bun: {
    configFile: 'package.json',
    runHint: 'bun run dev',
    imageTag: '1',
    runtimeEnvDoc: 'SCRIPT selects the package.json script the image runs.',
    runtimeEnv: 'ENV SCRIPT=start',
    devCmd: 'bun --watch main.ts',
    startCmd: 'bun main.ts',
    runTs: 'bun',
    testCmd: 'bun test',
    devDeps: '',
    ciSetup: '      - uses: oven-sh/setup-bun@v2',
    ciSteps: '      - run: bun install\n      - run: bun test',
    aiCommands:
      'bun install\nbun run dev          # run with reload\nbun test\nbun run modules      # regenerate modules/mod.ts after adding a module',
  },
  node: {
    configFile: 'package.json',
    runHint: 'npm run dev',
    imageTag: '24',
    runtimeEnvDoc: 'SCRIPT selects the package.json script the image runs.',
    runtimeEnv: 'ENV SCRIPT=start',
    devCmd: 'node --import tsx --watch main.ts',
    startCmd: 'node --import tsx main.ts',
    runTs: 'node --import tsx',
    testCmd: 'node --import tsx --test',
    devDeps: ',\n  "devDependencies": {\n    "tsx": "^4"\n  }',
    ciSetup:
      '      - uses: actions/setup-node@v4\n        with:\n          node-version: 24',
    ciSteps: '      - run: npm ci\n      - run: npm test',
    aiCommands:
      'npm install\nnpm run dev          # run with reload (tsx --watch)\nnpm test\nnpm run modules      # regenerate modules/mod.ts after adding a module',
  },
  workers: {
    configFile: 'package.json',
    runHint: 'npx wrangler dev',
    devCmd: 'wrangler dev',
    startCmd: 'wrangler deploy',
    runTs: 'node --import tsx',
    testCmd: 'node --import tsx --test',
    devDeps:
      ',\n  "devDependencies": {\n    "tsx": "^4",\n    "wrangler": "^4"\n  }',
    ciSetup:
      '      - uses: actions/setup-node@v4\n        with:\n          node-version: 24',
    ciSteps:
      '      - run: npm ci\n      - run: npm test\n      - run: npx wrangler deploy --dry-run',
  },
} as const;

/**
 * Build the `{ relativePath: contents }` map for a scaffold. `rapidVersion`
 * is the version `rapid init` resolved for the new project's dependency.
 * The runtime decides the primary config file (never both), the run
 * commands, and the deploy artifact.
 */

// ── the UI scaffold (init --ui): three tiers + a starter page ─────────

const VIEWS_CORE = `import {
  html,
  htmlDocument,
  template,
} from '@tundralibs/rapid/ui';
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
  `import { html, type Html, template } from '@tundralibs/rapid/ui';

/**
 * The default MODULE-tier layout — the page shape (header + content
 * slot) nesting inside the core. A module brings its own with
 * \`@Module({ layout })\`; \`layout: false\` on a route goes straight
 * into the core.
 */
export const PageShape = template<{ body: Html; title?: string }>((d) =>
  html\`<header class="site"><a href="/">{{name}}</a></header>
    <main>\${d.title ? html\`<h1>\${d.title}</h1>\` : ''}\${d.body}</main>\`, 'PageShape');
`;

const VIEWS_COMPONENTS =
  `import { html, type Html } from '@tundralibs/rapid/ui';

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
:root { color-scheme: light dark; }
body { margin: 0; font: 16px/1.5 system-ui, sans-serif; }
header.site { padding: 1rem 1.5rem; border-bottom: 1px solid color-mix(in srgb, currentColor 15%, transparent); }
header.site a { font-weight: 600; text-decoration: none; color: inherit; }
main { max-width: 46rem; margin: 0 auto; padding: 1.5rem; }
.card { border: 1px solid color-mix(in srgb, currentColor 15%, transparent); border-radius: 10px; padding: 1rem 1.2rem; margin: 1rem 0; }
.card h3 { margin: 0 0 .5rem; }
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
export const HomePage = template<{ app: string; ok: boolean }>((d) =>
  html\`\${
    Card({
      title: d.app,
      body: html\`<p>Same handler, more than one representation: this
        page, the bare fragment
        (<code>curl -H 'rapid-swap: 1' localhost:3000/</code>), and pure
        JSON on a replica with <code>ui.enabled: false</code>.</p>\`,
    })
  }\`, 'HomePage');
`;

export function scaffold(
  answers: ScaffoldAnswers,
  rapidVersion: string,
): Record<string, string> {
  const rt = RUNTIME[answers.runtime];
  const vars: Record<string, string> = {
    name: answers.name,
    rapidVersion,
    runtime: answers.runtime,
    port: '3000',
    ...rt,
    workerModulesImport: answers.module
      ? "import * as modules from './modules/mod.ts';"
      : '',
    workerSetup: answers.module
      ? 'await app.modules({ modules: [modules] });'
      : "app.get('/', () => ({ content: { app: '{{name}}', ok: true } }));",
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
  const put = (tpl: string) => render(tpl, vars);
  const files: Record<string, string> = {
    '.gitignore': GITIGNORE,
    'README.md': put(README),
    'configs/Application.yaml': put(APPLICATION_YAML),
  };
  // ONE primary config file, by runtime — not both.
  if (answers.runtime === 'deno') files['deno.json'] = put(DENO_JSON);
  else files['package.json'] = put(PACKAGE_JSON);

  if (answers.runtime === 'workers') {
    files['wrangler.toml'] = put(WRANGLER_TOML);
    files['worker.ts'] = render(put(WORKER_TS), vars); // second pass: {{name}} inside workerSetup
  } else {
    files['main.ts'] = put(answers.module ? MAIN_MODULES : MAIN_PLAIN);
  }
  if (answers.module) {
    files['modules/Greeter.ts'] = MODULE_SAMPLE;
    files['modules/mod.ts'] = MODULES_BARREL;
  }
  if (answers.ui === true && answers.runtime !== 'workers') {
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
    // The DATA half in YAML (per replica), inside the server block…
    files['configs/Application.yaml'] = files['configs/Application.yaml']!
      .replace(
        '  hostname: localhost\n',
        '  hostname: localhost\n' +
          '  static: # framework-served on route miss; routes always win\n' +
          '    /public:\n' +
          '      root: ../public # relative to this config directory\n' +
          '      fingerprint: true # immutable ?v= URLs via view.asset()\n',
      ) + `
ui:
  enabled: true # false = API replica: JSON everywhere, no runtime routes
  prefer: html # pages-first; an API route sets prefer: json to override
  history: false # true serves /__rapid/history.js (opt-in push-state)
`;
    // …the CODE half at initialize.
    const main = answers.module ? 'main.ts' : 'main.ts';
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
          `const HomePage = template<{ app: string; ok: boolean }>((d) =>
  html\`\${
    Card({
      title: d.app,
      body: html\`<p>Same handler, more than one representation: this
        page, the bare fragment
        (<code>curl -H 'rapid-swap: 1' localhost:3000/</code>), and pure
        JSON on a replica with <code>ui.enabled: false</code>.</p>\`,
    })
  }\`, 'HomePage');

app.get(
  '/',
  { template: { render: HomePage, prefer: 'html', title: 'Welcome' } },
  () => ({ content: { app: '${answers.name}', ok: true } }),
);`,
        );
    }
  }
  if (answers.norm) {
    files['models/Users.ts'] = MODEL_SAMPLE;
    files['models/mod.ts'] = MODELS_BARREL;
    files['db.ts'] = DB;
  }
  if (answers.docker && answers.runtime !== 'workers') {
    files['Dockerfile'] = put(DOCKERFILE);
    files['.dockerignore'] = DOCKERIGNORE;
  }
  if (answers.github) {
    files['.github/workflows/ci.yml'] = put(CI_WORKFLOW);
  }
  if (answers.ai) {
    // ONE source (AGENTS.md) + two pointers — mirrors how tools resolve them.
    files['AGENTS.md'] = render(put(AGENTS_MD), vars); // 2nd pass: {{name}} inside aiModules
    files['CLAUDE.md'] = put(CLAUDE_MD);
    files['.github/copilot-instructions.md'] = put(COPILOT_MD);
  }
  return files;
}
