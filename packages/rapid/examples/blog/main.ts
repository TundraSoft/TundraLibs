/**
 * A full-blown rAPId example: a tiny blog API (posts + nested comments)
 * built on the decorator/module tier, backed by a real SQLite database
 * through `@tundralibs/norm`. Everything is split into files the way a
 * real app would be — MODULES ARE FILES:
 *
 *   models/            norm entities (one per file) + the Blog schema
 *   db.ts              Norm + SQLite + the Migrator that owns the DDL
 *   repositories/      the only norm-aware layer; rows ↔ domain types
 *   modules/Posts.ts   HTTP + JOB module (its own file)
 *   modules/CommentsSocket.ts   SOCKET-only module (its own file)
 *   schemas.ts         guardian request schemas
 *   validated.ts       GuardianError → RapidError bridge
 *   types.ts           domain types
 *   main.ts            boot: wire db → repositories → modules → start
 *
 * rAPId never constructs a module — YOU build the repositories, inject
 * them, and hand rAPId the instances. Companion to `../main.ts` (plain
 * functions) and `../modules.ts` (a smaller decorator tour).
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
 * curl -s localhost:3100/posts | jq                      # list, paged (LIMIT/OFFSET in SQLite)
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
} from '../../middlewares/mod.ts';
import { openBlogDatabase } from './db.ts';
import { PostRepository } from './repositories/PostRepository.ts';
import { CommentRepository } from './repositories/CommentRepository.ts';
import { Posts } from './modules/Posts.ts';
import { CommentsSocket } from './modules/CommentsSocket.ts';

// ── database → repositories ───────────────────────────────────────────
const database = await openBlogDatabase();
const postRepo = new PostRepository(database.db);
const commentRepo = new CommentRepository(database.db);
await postRepo.seedIfEmpty();

// ── app ───────────────────────────────────────────────────────────────
const configDir = new URL('./configs', import.meta.url).pathname;
const app = await rapid(configDir, {});

app.use(
  requestLogger(),
  responseTimer(),
  secureHeaders(),
  cors(),
  requestId({ socketEcho: true }),
);

// Both modules share the SAME repository instances — construction is the
// app's job, never rAPId's.
app.module(
  new Posts(postRepo, commentRepo),
  new CommentsSocket(postRepo, commentRepo),
);

await app.start();
app.log.info(
  `blog example listening — try: curl -s localhost:${app.port}/posts | jq`,
);
