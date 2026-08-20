/**
 * A full-blown rAPId example: a tiny blog API (posts + nested
 * comments) built entirely on the decorator/module tier — the
 * "slight changes" round of `@Module`/`@GET`/etc: `@Module(name,
 * {namespace, prefix, version})` and `@GET(path, {version, bind,
 * description, response})`. Two modules, every HTTP verb, guardian-
 * validated payloads (the EXISTING `payload(validator)` binder — request
 * validation needed no new mechanism, just a `validated()` helper below
 * bridging `GuardianError` into `RapidError`), nested resource paths,
 * a SOCKET command sharing state with HTTP, a scheduled JOB, and the
 * shipped middleware stack. Companion to `main.ts` (plain functions)
 * and `modules.ts` (a smaller decorator tour) in this same package.
 *
 * Run (from the repo root):
 *
 * ```bash
 * deno run --allow-net --allow-read --allow-env --allow-sys --allow-write \
 *   packages/rapid/examples/blog/main.ts
 * ```
 *
 * Try it:
 *
 * ```bash
 * curl -s localhost:3100/posts | jq                                       # list, paging defaults
 * curl -s 'localhost:3100/posts?published=eq:true&sort=title:asc' | jq    # query filters + sorting
 * curl -s -X POST localhost:3100/posts -H 'content-type: application/json' \
 *   -d '{"title":"Hello rAPId","body":"First post.","tags":["meta"]}' | jq
 * curl -s localhost:3100/posts/1 | jq                                    # no header → server.versioning.default (v1)
 * curl -s localhost:3100/posts/1 -H 'x-api-version: v2' | jq             # findV2() — same path, adds _links
 * curl -s localhost:3100/posts/1 -H 'x-api-version: v3' | jq             # unrecognized → falls back to the DEFAULT (v1), not a 404
 * curl -s -X PATCH localhost:3100/posts/1 -H 'content-type: application/json' \
 *   -d '{"published":true}' | jq
 * curl -si -X DELETE localhost:3100/posts/2
 * curl -si -X POST localhost:3100/posts -d '{"title":""}'                 # 400 — guardian rejects it
 *
 * curl -s localhost:3100/posts/1/comments | jq                           # nested resource path
 * curl -s -X POST localhost:3100/posts/1/comments -H 'content-type: application/json' \
 *   -d '{"author":"Ada","body":"Nice post!"}' | jq
 * ```
 *
 * Websocket (same port, rpc protocol on /ws):
 *
 * ```typescript
 * const ws = new Client({ url: 'ws://localhost:3100/ws' });
 * await ws.connect();
 * // @Module's namespace ("comments") joins onto the bare command name.
 * await ws.command('comments.create', { postId: '1', author: 'Grace', body: 'hi' });
 * ```
 *
 * `posts.digest` is a real cron job (`0 9 * * *`, 9am daily; namespaced
 * by `@Module`'s `namespace: 'posts'`) — trigger it on demand with
 * `app.triggerJob('posts.digest')` from a REPL, or see `main.ts` for
 * the same pattern over HTTP.
 */

import { Guardian, GuardianError } from '@tundralibs/guardian';
import { rapid } from '../../mod.ts';
import { RapidError } from '../../errors/mod.ts';
import {
  DELETE,
  GET,
  JOB,
  Module,
  paging,
  param,
  PATCH,
  payload,
  POST,
  query,
  SOCKET,
} from '../../decorators/mod.ts';
import {
  cors,
  requestId,
  requestLogger,
  responseTimer,
  secureHeaders,
} from '../../middlewares/mod.ts';
import type {
  RapidContextPaging,
  RapidContextQuery,
  RapidContextResponse,
} from '../../types/mod.ts';

// ── domain ────────────────────────────────────────────────────────────

type Post = {
  id: string;
  title: string;
  body: string;
  tags: string[];
  published: boolean;
  createdAt: string;
};

type Comment = {
  id: string;
  postId: string;
  author: string;
  body: string;
  createdAt: string;
};

/**
 * Bridge guardian validation into rAPId's error taxonomy. Framework
 * design (packages/rapid/DESIGN-modules.md): a module MAY opt into
 * `RapidError` for proper classification; a PLAIN thrown error is
 * treated as an opaque 500 by default (the safe default — modules stay
 * framework-blind otherwise). A bare `Schema.parse` throws a
 * `GuardianError`, not a `RapidError`, so without this it 500s instead
 * of 400ing — this wraps any guardian schema's `.parse` into the
 * `payload()`/`param()` binder shape, translating a rejection into
 * `RAPID_VALIDATION_FAILED` with per-field detail from `leafErrors()`.
 */
function validated<T>(schema: { parse: (value: unknown) => T }) {
  return (value: unknown): T => {
    try {
      return schema.parse(value);
    } catch (error) {
      if (error instanceof GuardianError) {
        const fields = Object.fromEntries(
          [...error.leafErrors()].map((
            { path, error: leaf },
          ) => [path.join('.') || '(root)', leaf.message]),
        );
        throw new RapidError('RAPID_VALIDATION_FAILED', {
          details: { fields },
        });
      }
      throw error;
    }
  };
}

// ── guardian schemas — request validation via the EXISTING
//    `payload(Schema.parse)` binder (wrapped through `validated()`
//    above so a rejection 400s instead of 500ing — no NEW binder
//    mechanism needed, just a RapidError bridge); `PostSummary`
//    doubles as `@GET`'s new `response` metadata (OpenAPI raw
//    material, no runtime check) since it already knows `.toOpenAPI()`
//    /`.toJSONSchema()`. ──────────────────────────────────────────────

const CreatePostBody = Guardian.object({
  title: Guardian.string().minLength(1).maxLength(200),
  body: Guardian.string().minLength(1),
  tags: Guardian.array(Guardian.string().minLength(1)).maxLength(10)
    .optional(),
});

const UpdatePostBody = Guardian.object({
  title: Guardian.string().minLength(1).maxLength(200).optional(),
  body: Guardian.string().minLength(1).optional(),
  published: Guardian.boolean().optional(),
  tags: Guardian.array(Guardian.string().minLength(1)).maxLength(10)
    .optional(),
});

const CreateCommentBody = Guardian.object({
  author: Guardian.string().minLength(1).maxLength(80),
  body: Guardian.string().minLength(1).maxLength(2000),
});

// The socket command below takes `postId` in the SAME frame payload
// (sockets have no route params to bind it separately from) — one
// combined schema, same `validated()` bridge as every HTTP payload.
const CreateCommentViaSocketBody = Guardian.object({
  postId: Guardian.string().minLength(1),
  author: Guardian.string().minLength(1).maxLength(80),
  body: Guardian.string().minLength(1).maxLength(2000),
});

const PostSummary = Guardian.object({
  id: Guardian.string(),
  title: Guardian.string(),
  published: Guardian.boolean(),
});

// ── stores — plain in-memory classes. rAPId never constructs a
//    module; YOU build (and can inject) whatever a real app would use
//    (a repository, a driver, whatever) — these are that stand-in. ───

class PostStore {
  #rows = new Map<string, Post>([
    [
      '1',
      {
        id: '1',
        title: 'Welcome',
        body: 'First post on the blog.',
        tags: ['meta'],
        published: true,
        createdAt: new Date('2026-01-01').toISOString(),
      },
    ],
    [
      '2',
      {
        id: '2',
        title: 'Draft in progress',
        body: 'Not ready yet.',
        tags: [],
        published: false,
        createdAt: new Date('2026-01-02').toISOString(),
      },
    ],
  ]);
  #nextId = 3;

  list(): Post[] {
    return [...this.#rows.values()];
  }

  find(id: string): Post | undefined {
    return this.#rows.get(id);
  }

  create(input: { title: string; body: string; tags?: string[] }): Post {
    const row: Post = {
      id: String(this.#nextId++),
      title: input.title,
      body: input.body,
      tags: input.tags ?? [],
      published: false,
      createdAt: new Date().toISOString(),
    };
    this.#rows.set(row.id, row);
    return row;
  }

  update(id: string, patch: Partial<Post>): Post | undefined {
    const row = this.#rows.get(id);
    if (row === undefined) return undefined;
    const updated = { ...row, ...patch };
    this.#rows.set(id, updated);
    return updated;
  }

  delete(id: string): boolean {
    return this.#rows.delete(id);
  }
}

class CommentStore {
  #rows = new Map<string, Comment>();
  #nextId = 1;

  listForPost(postId: string): Comment[] {
    return [...this.#rows.values()].filter((c) => c.postId === postId);
  }

  create(postId: string, input: { author: string; body: string }): Comment {
    const row: Comment = {
      id: String(this.#nextId++),
      postId,
      author: input.author,
      body: input.body,
      createdAt: new Date().toISOString(),
    };
    this.#rows.set(row.id, row);
    return row;
  }

  count(): number {
    return this.#rows.size;
  }
}

// ── modules ───────────────────────────────────────────────────────────

// `namespace: 'posts'` turns the bare @JOB('digest') below into the
// flat "posts.digest" job name; `prefix: '/posts'` joins onto HTTP
// paths only. `version: 'v1'` is the module DEFAULT — `find()`
// inherits it below without repeating `{version: 'v1'}` itself.
@Module('Posts', { namespace: 'posts', prefix: '/posts', version: 'v1' })
class Posts {
  constructor(
    private readonly posts: PostStore,
    private readonly commentStore: CommentStore,
  ) {}

  @GET('/', {
    bind: [query(), paging()],
    description: 'List posts, filterable/sortable/paginated.',
    response: PostSummary,
  })
  list(
    _query: RapidContextQuery,
    paging: RapidContextPaging,
  ): RapidContextResponse {
    // A real store would push _query.filters/_query.sorting down to
    // its own query layer (oql, a driver, …) — this toy one just
    // returns everything and lets paging slice it for the demo.
    const rows = this.posts.list();
    const { page, size } = paging;
    const start = (page - 1) * size;
    return {
      content: {
        rows: rows.slice(start, start + size),
        total: rows.length,
        paging,
      },
    };
  }

  // No explicit `version` — inherits the @Module default ('v1'), which
  // is ALSO `server.versioning.default` in this example's config, so a
  // plain request with no header resolves here too.
  @GET('/:id:', {
    bind: [param('id')],
    description: 'Fetch one post by id.',
  })
  find(id: string): RapidContextResponse {
    const post = this.posts.find(id);
    if (post === undefined) {
      throw new RapidError('RAPID_NOT_FOUND', { details: { id } });
    }
    return { content: post };
  }

  // Real version evolution: v2 adds hypermedia `_links` — an explicit
  // `version` here OVERRIDES the @Module default for this ONE route.
  // Same path, same param, radrouter resolves by version + path
  // together (see `find()` above for the v1 shape).
  @GET('/:id:', {
    bind: [param('id')],
    version: 'v2',
    description: 'Fetch one post by id (v2: adds _links).',
  })
  findV2(id: string): RapidContextResponse {
    const post = this.posts.find(id);
    if (post === undefined) {
      throw new RapidError('RAPID_NOT_FOUND', { details: { id } });
    }
    return {
      content: { ...post, _links: { comments: `/posts/${id}/comments` } },
    };
  }

  @POST('/', {
    bind: [payload(validated(CreatePostBody))],
    description: 'Create a post.',
  })
  create(
    body: { title: string; body: string; tags?: string[] },
  ): RapidContextResponse {
    return { status: 201, content: this.posts.create(body) };
  }

  @PATCH('/:id:', {
    bind: [
      param('id'),
      payload(validated(UpdatePostBody)),
    ],
    description: 'Partially update a post.',
  })
  patch(
    id: string,
    body: {
      title?: string;
      body?: string;
      published?: boolean;
      tags?: string[];
    },
  ): RapidContextResponse {
    const updated = this.posts.update(id, body);
    if (updated === undefined) {
      throw new RapidError('RAPID_NOT_FOUND', { details: { id } });
    }
    return { content: updated };
  }

  @DELETE('/:id:', { bind: [param('id')], description: 'Delete a post.' })
  remove(id: string): RapidContextResponse {
    const existed = this.posts.delete(id);
    if (!existed) throw new RapidError('RAPID_NOT_FOUND', { details: { id } });
    // `content` is closed over string | Record<string,unknown> |
    // Uint8Array (no `null`) at the decorated-method return contract —
    // unlike the plain app.get() surface, which allows `void`. An
    // empty string is the idiomatic "204, no real body" here.
    return { status: 204, content: '' };
  }

  // Nested resource: @Module's prefix ("/posts") joins with THIS
  // method's own path, so the route is "/posts/:id:/comments". The
  // param segment is named `:id:` — SAME as find()'s own `:id:` at
  // the identical trie position — radrouter requires one canonical
  // param name per position across every route registered there;
  // `:postId:` here and `:id:` on find() would conflict at start().
  @GET('/:id:/comments', {
    bind: [param('id')],
    description: "List a post's comments.",
  })
  comments(postId: string): RapidContextResponse {
    if (this.posts.find(postId) === undefined) {
      throw new RapidError('RAPID_NOT_FOUND', { details: { postId } });
    }
    // content must be an object/string/Uint8Array, never a bare array.
    return { content: { rows: this.commentStore.listForPost(postId) } };
  }

  @POST('/:id:/comments', {
    bind: [param('id'), payload(validated(CreateCommentBody))],
    description: 'Add a comment to a post.',
  })
  addComment(
    postId: string,
    body: { author: string; body: string },
  ): RapidContextResponse {
    if (this.posts.find(postId) === undefined) {
      throw new RapidError('RAPID_NOT_FOUND', { details: { postId } });
    }
    return {
      status: 201,
      content: this.commentStore.create(postId, body),
    };
  }

  // Flat namespace: mounts as "posts.digest" (no HTTP path involved).
  // @JOB has no `description` option — that's HTTP-verb-specific today.
  @JOB('digest', '0 9 * * *')
  digest(): RapidContextResponse {
    const summary = {
      posts: this.posts.list().length,
      comments: this.commentStore.count(),
    };
    return { content: summary };
  }
}

// A SEPARATE module sharing the SAME store instances — modules don't
// have to own their own data; rAPId only cares that an instance has
// decorated methods, not where its dependencies came from.
@Module('Comments', { namespace: 'comments' })
class CommentsSocket {
  constructor(
    private readonly posts: PostStore,
    private readonly comments: CommentStore,
  ) {}

  // No @Module prefix on this class — namespace alone flattens to
  // "comments.create" for this SOCKET command (HTTP paths would need
  // their own prefix; this module declares none, so it mounts NO
  // HTTP routes at all — a module can be socket/job-only).
  @SOCKET('create', {
    bind: [payload(validated(CreateCommentViaSocketBody))],
  })
  create(
    input: { postId: string; author: string; body: string },
  ): RapidContextResponse {
    if (this.posts.find(input.postId) === undefined) {
      return { status: 404, content: { error: 'post not found' } };
    }
    const comment = this.comments.create(input.postId, input);
    return { status: 201, content: comment };
  }
}

// ── boot ──────────────────────────────────────────────────────────────

const configDir = new URL('./configs', import.meta.url).pathname;
const app = await rapid(configDir, {});

app.use(
  requestLogger(),
  responseTimer(),
  secureHeaders(),
  cors(),
  requestId({ socketEcho: true }),
);

const posts = new PostStore();
const comments = new CommentStore();
app.module(new Posts(posts, comments), new CommentsSocket(posts, comments));

await app.start();
app.log.info(
  `blog example listening — try: curl -s localhost:${app.port}/posts | jq`,
);
