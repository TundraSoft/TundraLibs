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
 *   auth.ts            the @tundralibs/pact instance + authenticate/authorize
 *   types.ts           domain types
 *   main.ts            boot: open db → mount endpoints + modules
 *
 * Beyond the modules it also mounts the `./endpoints` catalog —
 * `health`, `metrics` (metro-man), `openapi` (the assembled 3.0.3 doc),
 * — plus pact's `authenticate`/`authorize` middleware on a
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
 * http://localhost:8001/ (→ /posts/ui). The list/detail/comments you see
 * are the very routes curl'd below; a cron job (posts.fakeComment) drops
 * comments and the page streams them in over the websocket 'comments'
 * channel (public/blog.js subscribes, then rapid.swap()s the fragment).
 *
 * Ids are UUIDs (norm generates them), so LIST first to grab one:
 *
 * ```bash
 * curl -sL localhost:8001/                               # GET / → 302 → the blog page (/posts/ui)
 * curl -s  localhost:8001/public/style.css               # a static file (text/css)
 * curl -s  localhost:8001/posts | jq                     # list, paged (LIMIT/OFFSET in SQLite)
 * curl -s 'localhost:8001/posts?level=advanced' | jq     # the page chips' filter — same route
 * ID=$(curl -s localhost:8001/posts | jq -r '.rows[0].id')
 * curl -s localhost:8001/posts/$ID | jq                  # no header → server.versioning.default (v1)
 * curl -s localhost:8001/posts/$ID -H 'x-api-version: v2' | jq   # findV2() — same path, adds _links
 *
 * curl -s -X POST localhost:8001/posts -H 'content-type: application/json' \
 *   -d '{"title":"Hello rAPId","body":"First post.","tags":["meta"]}' | jq
 * curl -s -X PATCH localhost:8001/posts/$ID -H 'content-type: application/json' \
 *   -d '{"published":true}' | jq
 * curl -si -X DELETE localhost:8001/posts/$ID            # its comments cascade in SQLite
 * curl -si -X POST localhost:8001/posts -d '{"title":""}'   # 400 — guardian rejects it
 *
 * curl -s localhost:8001/posts/$ID/comments | jq         # nested resource path
 * curl -s -X POST localhost:8001/posts/$ID/comments -H 'content-type: application/json' \
 *   -d '{"author":"Ada","body":"Nice post!"}' | jq
 * ```
 *
 * Platform endpoints (the `./endpoints` catalog + auth middleware):
 *
 * ```bash
 * curl -s  localhost:8001/healthz | jq        # readiness — pings the DB
 * curl -s  localhost:8001/metrics             # Prometheus text (server.metrics)
 * curl -s  localhost:8001/openapi.json | jq   # the assembled OpenAPI 3.0.3 doc
 * curl -si localhost:8001/admin/summary       # 401 — needs an author
 * TOKEN=$(curl -s -X POST localhost:8001/login -H 'content-type: application/json' \
 *   -d '{"username":"ada","password":"lovelace"}' | jq -r .token)
 * curl -s localhost:8001/admin/summary -H "authorization: Bearer $TOKEN" | jq
 * # the same route over an API key — boot logs the demo key/secret
 * curl -s localhost:8001/admin/summary \
 *   -H "x-api-key: <id from the boot log>" -H "x-api-secret: <secret from the boot log>" | jq
 * ```
 *
 * Websocket (same port, rpc protocol on /ws) — the module's `namespace`
 * field ("comments") joins onto the bare command name:
 *
 * ```ts ignore
 * const ws = new Client({ url: 'ws://localhost:8001/ws' });
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

import { Application, RapidError } from '../../mod.ts';
import { cors, secureHeaders } from '../../middlewares/mod.ts';
import { health, metrics, openapi } from '../../endpoints/mod.ts';
import type { PactAuthContext } from '../../middlewares/pact.ts';
import { openBlogDatabase } from './db.ts';
import { registerBlogServices } from './di.ts';
import {
  authenticate,
  authorize,
  DEMO_ACCOUNTS,
  isAuthor,
  issueDemoApiKey,
  pact,
  usernameOf,
} from './auth.ts';
import { BlogSchema } from './models/mod.ts';
import * as blog from './modules/mod.ts';
import {
  AdminChrome,
  AdminSummaryView,
  BlogCore,
  type BlogView,
  NotFoundView,
} from './modules/views.ts';

// ── app + database ────────────────────────────────────────────────────
const database = await openBlogDatabase();

const configDir = new URL('./configs', import.meta.url).pathname;
// The ui DATA half (live: true) is YAML — configs/Application.yaml.
// The CODE half rides the factory: the core document, the 404 page, and
// the `view` projection — the ONE channel through which identity
// reaches templates. It computes the MENU server-side from ctx.auth
// (permission-based navigation: an author's menu gains Admin; nobody
// else's does — templates just render what crossed).
const app = await Application.initialize({
  path: configDir,
  ui: {
    core: BlogCore,
    // The registry fires when the representation resolves to HTML: the
    // 401 lands on any signed-out visit to /admin/ui (prefer html), the
    // 404 on swap requests for a missing post (curl it: -H 'rapid-swap:
    // 1' /posts/nope). API-first plain GETs keep the JSON envelope.
    errorTemplates: { 404: NotFoundView },
    view: (ctx): BlogView => {
      const auth = ctx.auth as PactAuthContext | undefined;
      const menu: { label: string; href: string }[] = [
        { label: 'The library', href: '/posts/ui' },
        { label: 'OpenAPI', href: '/openapi.json' },
      ];
      if (isAuthor(auth)) {
        menu.push({ label: 'Admin', href: '/admin/ui' });
        menu.push({ label: 'Sign out', href: '/logout' });
      } else {
        menu.push({ label: 'Sign in (demo)', href: '/login/as/ada' });
      }
      return {
        menu,
        ...(auth !== undefined ? { user: { username: usernameOf(auth) } } : {}),
      };
    },
  },
}, {});

app.use(
  secureHeaders(),
  cors(),
  // IDENTIFICATION only, app-wide (gating stays per-route via
  // authorize): a bearer token or API key on the headers, else the
  // `session` cookie the /login route set — the cookie is what lets a BROWSER be
  // signed in, so the projection above can vary the nav per caller on
  // ordinary page loads. Anonymous requests flow through.
  authenticate,
);
// Static serving is CONFIG now — see configs/Application.yaml's
// `server.static` (`/public` → ../public): served framework-side on
// route miss, so routes always win and secureHeaders/cors still apply.

// A plain function route alongside the modules: GET / redirects to the
// blog PAGE (the /posts/ui route the Posts module registers — same
// handler as the /posts JSON API). The old static landing page stays at
// /public/. Shows `ctx.redirect` and that function-API and module-API
// routes coexist.
app.get('/', (ctx) => ctx.redirect('/posts/ui'));

// ── the UI layer + the live channel ──────────────────────────────────
// The UI's data half is CONFIG — configs/Application.yaml's `ui:` set
// (`live: true` serves /__rapid/ui.js + /__rapid/live.js); the module's
// own @Module({ layout }) shells its pages. The 'comments' channel is a
// server-broadcast lane — app.channel() lanes are one-way, clients can
// never publish into them; the blog page subscribes over /ws and
// refreshes fragments on 'msg'.
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
// every invocation; this just serializes it. Try `curl :8001/metrics`.
app.get('/metrics', metrics());

// The assembled OpenAPI 3.0.3 document, built from the mounted routes
// (module routes included) and cached. `?version=v2` selects a version.
app.get(
  '/openapi.json',
  openapi({
    info: { description: 'A tiny blog API — posts + nested comments.' },
    servers: [{ url: 'http://localhost:8001', description: 'local dev' }],
  }),
);

// Auth: POST /login runs pact's login and returns the session token, also
// setting it as the HttpOnly `session` cookie authenticate reads. A login
// route is app code — the body shape, the cookie and what the principal
// exposes are yours. `secure: false` only because this demo is plain http.
const AUTH_FAILURE = new Set([
  'INVALID_CREDENTIALS',
  'NOT_ACTIVE',
  'SESSION_EXPIRED',
  'REFRESH_REUSED',
]);
app.post('/login', async (ctx) => {
  const body = (await ctx.payload) as Record<string, unknown> | null;
  const username = body?.username;
  const password = body?.password;
  if (typeof username !== 'string' || typeof password !== 'string') {
    throw new RapidError('RAPID_VALIDATION_FAILED', {
      message: 'body must carry string username and password',
      details: { fields: ['username', 'password'] },
    });
  }
  let result: Awaited<ReturnType<typeof pact.login>>;
  try {
    result = await pact.login({ identifier: username, password });
  } catch (error) {
    const code = (error as { code?: unknown } | null)?.code;
    if (typeof code === 'string' && AUTH_FAILURE.has(code)) {
      // One 401 for every failure kind — never an account oracle.
      throw new RapidError('RAPID_UNAUTHENTICATED', {
        message: 'invalid credentials',
      });
    }
    throw error;
  }
  const { token, expiresAt } = result.session;
  return {
    content: {
      token,
      expiresAt: expiresAt.toISOString(),
      principal: { id: result.principal.id }, // a projection, never the whole principal
    },
    cookies: [{
      name: 'session',
      value: token,
      options: {
        path: '/',
        httpOnly: true,
        secure: false,
        sameSite: 'Lax',
        maxAge: Math.max(
          0,
          Math.floor((expiresAt.getTime() - Date.now()) / 1000),
        ),
      },
    }],
  };
});

// DEMO-ONLY browser sign-in: log the demo account in with its known
// password and set the same cookie /login would, so the permission-based
// nav is clickable (visit /login/as/ada → the menu gains Admin). A real
// app has a login form posting to /login instead.
app.get('/login/as/:username:', async (ctx) => {
  const password = DEMO_ACCOUNTS[ctx.params.username];
  if (password === undefined) throw new RapidError('RAPID_NOT_FOUND');
  const { session } = await pact.login({
    identifier: ctx.params.username,
    password,
  });
  return {
    content: '',
    cookies: [{
      name: 'session',
      value: session.token,
      options: { path: '/', httpOnly: true },
    }],
    redirect: '/posts/ui',
  };
});
app.get('/logout', async (ctx) => {
  const token = ctx.cookies['session'];
  if (token !== undefined) await pact.logout(token).catch(() => {});
  ctx.deleteCookie('session', { path: '/' });
  return { content: '', redirect: '/posts/ui' };
});

// The ADMIN PAGE — the /admin/summary data as a page. Route-level
// `layout: AdminChrome` swaps the tier-2 chrome (different nav, same
// core document); authorize() gates it exactly like the API twin below.
app.get(
  '/admin/ui',
  {
    template: {
      render: AdminSummaryView,
      layout: AdminChrome,
      prefer: 'html',
      title: 'Admin — The Library',
    },
  },
  authorize('Admin', 'READ'),
  async (ctx) => {
    const { count } = await database.norm.use(BlogSchema).repo('Posts').count();
    const you = ctx.auth as PactAuthContext;
    return {
      content: { posts: count, you: { username: usernameOf(you), via: you.via } },
    };
  },
);
// The API twin: a session (bearer or cookie) or the demo API key — the
// app-wide `authenticate` accepted either; `authorize` is typed by the
// blog's own catalog. grants are BigInt masks, so pick the fields JSON
// can carry rather than serializing ctx.auth whole.
const demoApiKey = await issueDemoApiKey();
app.get(
  '/admin/summary',
  authorize('Admin', 'READ'),
  async (ctx) => {
    const { count } = await database.norm.use(BlogSchema).repo('Posts').count();
    const { principal, via } = ctx.auth as PactAuthContext;
    return {
      content: { posts: count, you: { id: principal.id, kind: principal.kind, via } },
    };
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
  `pact demo key — curl -s localhost:${app.port}/admin/summary ` +
    `-H "x-api-key: ${demoApiKey.key}" -H "x-api-secret: ${demoApiKey.secret}"`,
);
app.log.info(
  `blog example listening — the LIVE page: http://localhost:${app.port}/posts/ui ` +
    `(same data as: curl -s localhost:${app.port}/posts | jq)`,
  { modules: Object.keys(modules) },
);
