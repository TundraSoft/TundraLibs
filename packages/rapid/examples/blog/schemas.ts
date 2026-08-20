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
