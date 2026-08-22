/**
 * A full-blown rAPId example: a tiny blog API (posts + nested comments) on
 * the decorator/module tier, backed by a real SQLite database through
 * `@tundralibs/norm`, with dependencies wired by `@tundralibs/doctor`.
 * Split into files the way a real app would be — MODULES ARE FILES:
 *
 *   public/            static assets (index.html + style.css) served as-is
 *   models/            norm entities (one per file) + the Blog schema
 *   db.ts              Norm + SQLite + the Migrator that owns the DDL
 *   di.ts              doctor: stock the Norm instance under a typed label
 *   modules/BlogModule.ts   the project's RapidModule base (db via doctor)
 *   modules/Posts.ts   HTTP + JOB module, publishes PostCreated/PostDeleted
 *   modules/CommentsSocket.ts   SOCKET-only module; invoke()s Posts.get
 *   modules/Audit.ts   event-only module — subscribes, logs, no transport
 *   modules/mod.ts     the static barrel app.modules() boots from
 *   schemas.ts         guardian request schemas (validated() bridges 400s)
 *   auth.ts            a stand-in for pact — login service + token verify
 *   types.ts           domain types
 *   main.ts            boot: open db → mount endpoints + modules
 *
 * Beyond the modules it also mounts the `./endpoints` catalog —
 * `health`, `metrics` (metro-man), `openapi` (the assembled 3.0.3 doc),
 * and `login` — plus the `authenticate`/`authorize` middleware on a
 * protected `/admin/summary` route. See the curl block below.
 *
 * The modules take NO constructor args — `BlogModule` pulls `Norm` with an
 * `inject()` field initializer, so boot stocks that one label and hands
 * `app.modules()` the barrel: it constructs each module, wires events,
 * mounts the decorated routes/commands/jobs, and `stop()` disposes them.
 *
 * Run (from the repo root):
 *
 * ```bash
 * deno run -A packages/rapid/examples/main.ts
 * ```
 *
 * Ids are UUIDs (norm generates them), so LIST first to grab one:
 *
 * ```bash
 * curl -sL localhost:3100/                               # GET / → 302 → the static landing page
 * curl -s  localhost:3100/public/style.css               # a static file (text/css)
 * curl -s  localhost:3100/posts | jq                     # list, paged (LIMIT/OFFSET in SQLite)
 * ID=$(curl -s localhost:3100/posts | jq -r '.rows[0].id')
 * curl -s localhost:3100/posts/$ID | jq                  # no header → server.versioning.default (v1)
 * curl -s localhost:3100/posts/$ID -H 'x-api-version: v2' | jq   # findV2() — same path, adds _links
 *
 * curl -s -X POST localhost:3100/posts -H 'content-type: application/json' \
 *   -d '{"title":"Hello rAPId","body":"First post.","tags":["meta"]}' | jq
 * curl -s -X PATCH localhost:3100/posts/$ID -H 'content-type: application/json' \
 *   -d '{"published":true}' | jq
 * curl -si -X DELETE localhost:3100/posts/$ID            # its comments cascade in SQLite
 * curl -si -X POST localhost:3100/posts -d '{"title":""}'   # 400 — guardian rejects it
 *
 * curl -s localhost:3100/posts/$ID/comments | jq         # nested resource path
 * curl -s -X POST localhost:3100/posts/$ID/comments -H 'content-type: application/json' \
 *   -d '{"author":"Ada","body":"Nice post!"}' | jq
 * ```
 *
 * Platform endpoints (the `./endpoints` catalog + auth middleware):
 *
 * ```bash
 * curl -s  localhost:3100/healthz | jq        # readiness — pings the DB
 * curl -s  localhost:3100/metrics             # Prometheus text (server.metrics)
 * curl -s  localhost:3100/openapi.json | jq   # the assembled OpenAPI 3.0.3 doc
 * curl -si localhost:3100/admin/summary       # 401 — needs an author token
 * TOKEN=$(curl -s -X POST localhost:3100/login -H 'content-type: application/json' \
 *   -d '{"username":"ada","password":"lovelace"}' | jq -r .token)
 * curl -s localhost:3100/admin/summary -H "authorization: Bearer $TOKEN" | jq
 * ```
 *
 * Websocket (same port, rpc protocol on /ws) — the module's `namespace`
 * field ("comments") joins onto the bare command name:
 *
 * ```ts ignore
 * const ws = new Client({ url: 'ws://localhost:3100/ws' });
 * await ws.connect();
 * await ws.command('comments.create', {
 *   postId: '<a post id>',
 *   author: 'Grace',
 *   body: 'hi',
 * });
 * ```
 *
 * `posts.digest` is a real cron job (9am daily) — trigger it on demand
 * with `await app.triggerJob('posts.digest')`.
 *
 * @module
 */

import { Application } from '../mod.ts';
import {
  authenticate,
  authorize,
  cors,
  requestId,
  requestLogger,
  responseTimer,
  secureHeaders,
  serveStatic,
} from '../middlewares/mod.ts';
import { health, login, metrics, openapi } from '../endpoints/mod.ts';
import { openBlogDatabase } from './db.ts';
import { registerBlogServices } from './di.ts';
import { authService, type BlogAuth, verifyToken } from './auth.ts';
import { BlogSchema } from './models/mod.ts';
import * as blog from './modules/mod.ts';

// ── app + database ────────────────────────────────────────────────────
const database = await openBlogDatabase();

const configDir = new URL('./configs', import.meta.url).pathname;
const app = await Application.initialize(configDir, {});

app.use(
  requestLogger(),
  responseTimer(),
  secureHeaders(),
  cors(),
  requestId({ socketEcho: true }),
  // Serve examples/public/ (a landing page + stylesheet) at
  // /public/* — no route/handler; content-types come from the file
  // extensions. A missing file falls through to routing/404.
  serveStatic({
    root: new URL('./public', import.meta.url).pathname,
    prefix: '/public',
    maxAge: 3600,
  }),
);

// A plain function route alongside the modules: GET / redirects to the
// static landing page (302). Shows `ctx.redirect` and that function-API
// and module-API routes coexist.
app.get('/', (ctx) => ctx.redirect('/public/'));

// ── platform endpoints (the ./endpoints catalog) ─────────────────────
// Each is a plain handler you mount where you like — nothing here is
// magic, and none of it costs anything on the hot path.

// Liveness/readiness: the check queries the DB (throws → 503 unhealthy).
app.get(
  '/healthz',
  health({ check: () => database.norm.use(BlogSchema).repo('Posts').count() }),
);

// Prometheus scrape target — the Meter (server.metrics: true) collected
// every invocation; this just serializes it. Try `curl :3100/metrics`.
app.get('/metrics', metrics());

// The assembled OpenAPI 3.0.3 document, built from the mounted routes
// (module routes included) and cached. `?version=v2` selects a version.
app.get(
  '/openapi.json',
  openapi({
    info: { description: 'A tiny blog API — posts + nested comments.' },
    servers: [{ url: 'http://localhost:3100', description: 'local dev' }],
  }),
);

// Auth: POST /login runs the (stand-in) auth service and returns a token;
// authenticate() fills ctx.auth from the bearer token, authorize() gates.
// A real app swaps auth.ts for `@tundralibs/pact` — see login({ pact }).
app.post('/login', login({ pact: authService }));
app.get(
  '/admin/summary',
  authenticate({ verify: verifyToken }),
  authorize((auth) => (auth as BlogAuth).roles.includes('author')),
  async (ctx) => {
    const { count } = await database.norm.use(BlogSchema).repo('Posts').count();
    return { content: { posts: count, you: ctx.auth } };
  },
);

// Stock the label the modules inject(), THEN boot them — the inject()
// field initializers resolve during construction, so the label must be
// bound first. app.modules() constructs, wires events, mounts routes.
registerBlogServices(database.norm);
const { modules } = await app.modules({ modules: [blog] });
await app.start();
app.log.info(
  `blog example listening — try: curl -s localhost:${app.port}/posts | jq`,
  { modules: Object.keys(modules) },
);
