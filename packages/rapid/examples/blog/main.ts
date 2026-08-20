/**
 * A full-blown rAPId example: a tiny blog API (posts + nested comments) on
 * the decorator/module tier, backed by a real SQLite database through
 * `@tundralibs/norm`, with dependencies wired by `@tundralibs/doctor`.
 * Split into files the way a real app would be — MODULES ARE FILES:
 *
 *   public/            static assets (index.html + style.css) served as-is
 *   models/            norm entities (one per file) + the Blog schema
 *   db.ts              Norm + SQLite + the Migrator that owns the DDL
 *   di.ts              doctor: register the Norm + logger singletons
 *   modules/Posts.ts   HTTP + JOB module (own file) — inject()s its deps,
 *                      owns its data actions on norm (no repository hop)
 *   modules/CommentsSocket.ts   SOCKET-only module (own file)
 *   schemas.ts         guardian request schemas
 *   validated.ts       GuardianError → RapidError bridge
 *   types.ts           domain types
 *   main.ts            boot: open db → register deps → mount modules
 *
 * The modules take NO constructor args — they pull `Norm` and the logger
 * with `inject()` field initializers, so boot just registers those two
 * singletons and hands rAPId the module INSTANCES. rAPId never constructs
 * a module; doctor supplies what the module asks for as it constructs.
 *
 * Run (from the repo root):
 *
 * ```bash
 * deno run -A packages/rapid/examples/blog/main.ts
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
 * Websocket (same port, rpc protocol on /ws) — `@Module`'s namespace
 * ("comments") joins onto the bare command name:
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

import { rapid } from '../../mod.ts';
import {
  cors,
  requestId,
  requestLogger,
  responseTimer,
  secureHeaders,
  serveStatic,
} from '../../middlewares/mod.ts';
import { openBlogDatabase } from './db.ts';
import { registerBlogServices } from './di.ts';
import { Posts } from './modules/Posts.ts';
import { CommentsSocket } from './modules/CommentsSocket.ts';

// ── app + database ────────────────────────────────────────────────────
const database = await openBlogDatabase();

const configDir = new URL('./configs', import.meta.url).pathname;
const app = await rapid(configDir, {});

app.use(
  requestLogger(),
  responseTimer(),
  secureHeaders(),
  cors(),
  requestId({ socketEcho: true }),
  // Serve examples/blog/public/ (a landing page + stylesheet) at
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

// Register the two singletons the modules inject(), THEN construct the
// modules — the inject() field initializers resolve during `new`, so the
// tokens must be bound first. rAPId only receives the instances.
registerBlogServices(database.norm, app.log);
app.module(new Posts(), new CommentsSocket());

await app.start();
app.log.info(
  `blog example listening — try: curl -s localhost:${app.port}/posts | jq`,
);
