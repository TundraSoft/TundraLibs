/**
 * Guardian schemas for request validation — used through the EXISTING
 * `payload(...)` / `param(...)` binders (wrapped by `validated()` so a
 * rejection 400s instead of 500ing; no new binder mechanism needed).
 * `PostSummary` doubles as `@GET`'s `response` metadata (OpenAPI raw
 * material — it already knows `.toOpenAPI()` / `.toJSONSchema()`).
 *
 * @module
 */

import { Guardian } from '@tundralibs/guardian';

export const CreatePostBody = Guardian.object({
  title: Guardian.string().minLength(1).maxLength(200),
  body: Guardian.string().minLength(1),
  tags: Guardian.array(Guardian.string().minLength(1)).maxLength(10)
    .optional(),
});

export const UpdatePostBody = Guardian.object({
  title: Guardian.string().minLength(1).maxLength(200).optional(),
  body: Guardian.string().minLength(1).optional(),
  published: Guardian.boolean().optional(),
  tags: Guardian.array(Guardian.string().minLength(1)).maxLength(10)
    .optional(),
});

export const CreateCommentBody = Guardian.object({
  author: Guardian.string().minLength(1).maxLength(80),
  body: Guardian.string().minLength(1).maxLength(2000),
});

// The socket command takes `postId` in the SAME frame payload (sockets
// have no route params to bind it separately) — one combined schema.
export const CreateCommentViaSocketBody = Guardian.object({
  postId: Guardian.string().minLength(1),
  author: Guardian.string().minLength(1).maxLength(80),
  body: Guardian.string().minLength(1).maxLength(2000),
});

export const PostSummary = Guardian.object({
  id: Guardian.string(),
  title: Guardian.string(),
  published: Guardian.boolean(),
});

/** The list envelope `GET /posts` returns — rows, the total, the paging in effect. */
export const PostList = Guardian.object({
  rows: Guardian.array(PostSummary),
  total: Guardian.number(),
  paging: Guardian.object({ page: Guardian.number(), size: Guardian.number() }),
  level: Guardian.string().optional(),
});

// ── what the routes answer with (`response`) ──────────────────────────
// Checked against the reply in DEVELOPMENT, shown in the OpenAPI
// document, and what `rapid sdk` types its methods from.

/** One post, as every post route returns it. */
export const PostShape = Guardian.object({
  id: Guardian.string(),
  title: Guardian.string(),
  body: Guardian.string(),
  tags: Guardian.array(Guardian.string()),
  published: Guardian.boolean(),
  createdAt: Guardian.string(),
}).describe({ title: 'Post' });

/** v2 of a post: the same fields plus hypermedia links. */
export const PostWithLinks = PostShape.extend({
  _links: Guardian.object({ comments: Guardian.string() }),
});

/** One comment, as stored: `createdAt` leaves as an ISO string. */
export const CommentShape = Guardian.object({
  id: Guardian.string(),
  postId: Guardian.string(),
  author: Guardian.string(),
  body: Guardian.string(),
  createdAt: Guardian.date(),
}).describe({ title: 'Comment' });

/** `GET /admin/summary`: the post count and who asked. */
export const AdminSummary = Guardian.object({
  posts: Guardian.number(),
  you: Guardian.object({
    id: Guardian.string(),
    kind: Guardian.string(),
    via: Guardian.string(),
  }),
});
