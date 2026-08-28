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
 *   modules/views.ts   the blog's HTML templates (pure functions, ./ui)
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
 * deno run -A packages/rapid/examples/blog/main.ts
 * ```
 *
 * THE LIVE PAGE — the same routes, HTML representation: open
 * http://localhost:3100/ (→ /posts/ui). The list/detail/comments you see
 * are the very routes curl'd below; a cron job (posts.fakeComment) drops
 * comments and the page streams them in over the websocket 'comments'
 * channel (public/blog.js subscribes, then rapid.swap()s the fragment).
 *
 * Ids are UUIDs (norm generates them), so LIST first to grab one:
 *
 * ```bash
 * curl -sL localhost:3100/                               # GET / → 302 → the blog page (/posts/ui)
 * curl -s  localhost:3100/public/style.css               # a static file (text/css)
 * curl -s  localhost:3100/posts | jq                     # list, paged (LIMIT/OFFSET in SQLite)
 * curl -s 'localhost:3100/posts?level=advanced' | jq     # the page chips' filter — same route
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
 *
 * # the pact-backed counterpart — same shape, real @tundralibs/pact via
 * # @tundralibs/rapid/middlewares/pact instead of the generic seam.
 * # Boot logs the demo key/secret to use here.
 * curl -si localhost:3100/admin/pact-summary   # 401 — needs an api key
 * curl -s localhost:3100/admin/pact-summary \
 *   -H "x-api-key: <id from the boot log>" -H "x-api-secret: <secret from the boot log>" | jq
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

import { Application } from '../../mod.ts';
import {
  authenticate,
  authorize,
  cors,
  requestId,
  requestLogger,
  responseTimer,
  secureHeaders,
  serveStatic,
} from '../../middlewares/mod.ts';
import {
  authenticate as pactAuthenticate,
  authorize as pactAuthorize,
} from '../../middlewares/pact/mod.ts';
import { health, login, metrics, openapi } from '../../endpoints/mod.ts';
import { openBlogDatabase } from './db.ts';
import { registerBlogServices } from './di.ts';
import { authService, type BlogAuth, verifyToken } from './auth.ts';
import { registerPactAuth } from './pactAuth.ts';
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
// blog PAGE (the /posts/ui route the Posts module registers — same
// handler as the /posts JSON API). The old static landing page stays at
// /public/. Shows `ctx.redirect` and that function-API and module-API
// routes coexist.
app.get('/', (ctx) => ctx.redirect('/posts/ui'));

// ── the UI layer + the live channel ──────────────────────────────────
// app.ui() serves the swap runtime at /__rapid/ui.js; the module's own
// @Module({ layout }) shells its pages. The 'comments' channel is a
// server-broadcast lane — app.channel() lanes are one-way, clients can
// never publish into them; the blog page subscribes over /ws and
// refreshes fragments on 'msg'.
app.ui({ live: true }); // + /__rapid/live.js — the rapid.live bridge
app.channel('comments');

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

// The pact-backed counterpart to /admin/summary above — same job, real
// @tundralibs/pact via @tundralibs/rapid/middlewares/pact instead of the
// generic seam. authenticate()/authorize() resolve the Pact instance
// registerPactAuth() registered via inject(PACT) — see DESIGN-Auth.md.
const demoApiKey = await registerPactAuth();
app.get(
  '/admin/pact-summary',
  pactAuthenticate(),
  pactAuthorize('Admin', 'READ'),
  async (ctx) => {
    const { count } = await database.norm.use(BlogSchema).repo('Posts').count();
    // grants are BigInt masks — pick the fields that JSON can carry
    // rather than serializing ctx.auth whole.
    const { id, authMode, keyId } = ctx.auth as {
      id: string;
      authMode: string;
      keyId: string;
    };
    return { content: { posts: count, you: { id, authMode, keyId } } };
  },
);

// Stock the label the modules inject(), THEN boot them — the inject()
// field initializers resolve during construction, so the label must be
// bound first. app.modules() constructs, wires events, mounts routes.
registerBlogServices(database.norm);
const { modules } = await app.modules({ modules: [blog] });

// Seed the library. Titles nod to real published guides (the demo's
// muse); every blurb below is this example's own two-line summary —
// tags follow the [category, level, 'NN min'] convention the views
// read. The two opener rows from openBlogDatabase() are replaced so
// the shelf starts clean. Seeded PER TITLE (not a row count): against
// a persisted db, present guides never duplicate and a missing one
// heals. The demo db is a fresh temp dir per boot anyway.
const postsRepo = database.norm.use(BlogSchema).repo('Posts');
await postsRepo.delete({ '@title': 'Welcome' });
await postsRepo.delete({ '@title': 'Draft in progress' });
{
  for (
    const [title, body, tags] of [
      [
        'Why Would a Luxury Brand Burn $37M of Unsold Coats?',
        'Engineered scarcity, in plain terms: why a luxury house may prefer destroying stock to discounting it, and what that says about the thing actually being sold.',
        ['psychology', 'advanced', '20 min'],
      ],
      [
        'The Architecture of the Deal',
        'Every purchase runs two ledgers at once — what the thing is worth to you, and how good the deal feels. The second ledger moves more money than we like to admit.',
        ['psychology', 'advanced', '25 min'],
      ],
      [
        'Should UPI Remain Free?',
        'A payment rail can move half the world\'s real-time volume and still not pay for itself. Somebody covers the gap — the interesting question is who should.',
        ['banking', 'intermediate', '10 min'],
      ],
      [
        'The Six Rupee Meal',
        'What a school lunch budget of a few rupees a day buys, and why countries that treated the meal as infrastructure rather than charity got different results.',
        ['economy', 'intermediate', '9 min'],
      ],
      [
        'The Unnatural Value of Canvas',
        'When a painting outprices a hospital: how provenance, prestige, and auction mechanics can bend a demand curve the wrong way round.',
        ['psychology', 'advanced', '29 min'],
      ],
      [
        'The 80-Year Divergence of Brazil and India',
        'Two economies that started level in 1950 and took opposite roads — a demo-sized tour of the usual suspects, from resource booms to bureaucracy.',
        ['economy', 'advanced', '33 min'],
      ],
    ] as const
  ) {
    if (((await postsRepo.count({ '@title': title })).count as number) === 0) {
      await postsRepo.insert({ title, body, tags: JSON.stringify(tags) });
    }
  }
}

await app.start();

// LIVE demo loop — posts.fakeComment is a real cron job (every minute),
// but a demo can't wait that long: trigger it on a short interval too
// and broadcast the outcome on the 'comments' channel, which the blog
// page's websocket subscription turns into a fragment refresh.
// Keep the handle: an embedder shutting down gracefully must
// `clearInterval(_liveDemo)` BEFORE `app.stop()` + `database.close()` —
// the loop would otherwise keep firing jobs against disposed modules.
// (This standalone demo just dies with the process on Ctrl-C.) The
// callback never rejects: triggerJob wraps handler failures into a 500
// OUTCOME, and publish resolves even with nobody subscribed.
const _liveDemo = setInterval(async () => {
  const fired = await app.triggerJob('posts.fakeComment');
  if (fired.handlerRan && fired.status === 201) {
    await app.publish('comments', fired.content);
  }
}, 8000);
app.log.info(
  `pact demo key — curl -s localhost:${app.port}/admin/pact-summary ` +
    `-H "x-api-key: ${demoApiKey.id}" -H "x-api-secret: ${demoApiKey.secret}"`,
);
app.log.info(
  `blog example listening — the LIVE page: http://localhost:${app.port}/posts/ui ` +
    `(same data as: curl -s localhost:${app.port}/posts | jq)`,
  { modules: Object.keys(modules) },
);
