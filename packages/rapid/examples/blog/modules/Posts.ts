/**
 * The Posts module — every HTTP verb, a nested comments resource, route
 * versioning, and a scheduled digest JOB. A PLAIN class in its own file:
 * it imports the decorators (metadata-only — they never wrap the methods)
 * and pulls its dependencies with `inject()` field initializers rather
 * than a constructor. The module IS the source of truth — the data
 * actions live right here on norm, no repository hop.
 *
 * Dependencies (via `@tundralibs/doctor`, registered at boot in `di.ts`):
 *   - `Norm`    → `norm.use(BlogSchema)` gives this module its typed
 *                 repos (a scoped view over the shared pool).
 *   - `Slogger` → the app logger, correlated per request via ambient.
 *
 * @module
 */

import { inject } from '@tundralibs/doctor';
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
} from '../../../decorators/mod.ts';
import { RapidError } from '../../../errors/mod.ts';
import type {
  RapidContextPaging,
  RapidContextQuery,
  RapidContextResponse,
} from '../../../types/mod.ts';
import { BlogSchema } from '../models/mod.ts';
import type { Post } from '../types.ts';
import {
  CreateCommentBody,
  CreatePostBody,
  PostSummary,
  UpdatePostBody,
} from '../schemas.ts';
import { validated } from '../validated.ts';

/** A stored posts row as norm hands it back (tags is JSON text). */
type PostRow = {
  id: string;
  title: string;
  body: string;
  tags: string;
  published: boolean;
  createdAt: Date | string;
};

// `namespace: 'posts'` turns the bare @JOB('digest') below into the flat
// "posts.digest" job name; `prefix: '/posts'` joins onto HTTP paths only.
// `version: 'v1'` is the module DEFAULT — `find()` inherits it below.
@Module('Posts', { namespace: 'posts', prefix: '/posts', version: 'v1' })
export class Posts {
  // Injected while the instance constructs — no constructor args. `use()`
  // gives this module a typed handle over the shared connection pool.
  readonly #db = inject('Norm').use(BlogSchema);
  readonly #log = inject('Slogger');

  /** Map a stored row to the API shape (tags parsed, date normalized). */
  #present(row: PostRow): Post {
    return {
      id: row.id,
      title: row.title,
      body: row.body,
      // Every write path stores valid JSON, but never let one bad/out-of
      // -band row 500 the whole list — fall back to no tags.
      tags: this.#parseTags(row.tags),
      published: Boolean(row.published),
      createdAt: new Date(row.createdAt).toISOString(),
    };
  }

  #parseTags(raw: string): string[] {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed as string[] : [];
    } catch {
      return [];
    }
  }

  @GET('/', {
    bind: [query(), paging()],
    description: 'List posts, filterable/sortable/paginated.',
    response: PostSummary,
  })
  async list(
    _query: RapidContextQuery,
    paging: RapidContextPaging,
  ): Promise<RapidContextResponse> {
    // Paging is pushed down to SQLite (LIMIT/OFFSET + a COUNT for the
    // total) rather than sliced in memory. A real app would also map
    // `_query.filters`/`.sorting` onto norm's own filter API.
    const { page, size } = paging;
    const found = await this.#db.repo('Posts').find(undefined, {
      orderBy: { '@createdAt': 'DESC' },
      limit: size,
      offset: (page - 1) * size,
    });
    const { count: total } = await this.#db.repo('Posts').count();
    return {
      content: {
        rows: (found.data as PostRow[]).map((r) => this.#present(r)),
        total,
        paging,
      },
    };
  }

  // No explicit `version` — inherits the @Module default ('v1'), which is
  // ALSO `server.versioning.default`, so a plain request (no header)
  // resolves here too.
  @GET('/:id:', { bind: [param('id')], description: 'Fetch one post by id.' })
  async find(id: string): Promise<RapidContextResponse> {
    return { content: await this.#getOr404(id) };
  }

  // Real version evolution: v2 adds hypermedia `_links` — an explicit
  // `version` OVERRIDES the @Module default for this ONE route. Same path,
  // same param; radrouter resolves by version + path together.
  @GET('/:id:', {
    bind: [param('id')],
    version: 'v2',
    description: 'Fetch one post by id (v2: adds _links).',
  })
  async findV2(id: string): Promise<RapidContextResponse> {
    const post = await this.#getOr404(id);
    return {
      content: { ...post, _links: { comments: `/posts/${id}/comments` } },
    };
  }

  @POST('/', {
    bind: [payload(validated(CreatePostBody))],
    description: 'Create a post.',
  })
  async create(
    body: { title: string; body: string; tags?: string[] },
  ): Promise<RapidContextResponse> {
    const res = await this.#db.repo('Posts').insert({
      title: body.title,
      body: body.body,
      tags: JSON.stringify(body.tags ?? []),
    });
    const post = this.#present(res.data[0] as PostRow);
    this.#log.info('post created', { id: post.id });
    return { status: 201, content: post };
  }

  @PATCH('/:id:', {
    bind: [param('id'), payload(validated(UpdatePostBody))],
    description: 'Partially update a post.',
  })
  async patch(
    id: string,
    body: {
      title?: string;
      body?: string;
      published?: boolean;
      tags?: string[];
    },
  ): Promise<RapidContextResponse> {
    await this.#getOr404(id); // 404 before we touch anything
    const set: Record<string, unknown> = {};
    if (body.title !== undefined) set.title = body.title;
    if (body.body !== undefined) set.body = body.body;
    if (body.published !== undefined) set.published = body.published;
    if (body.tags !== undefined) set.tags = JSON.stringify(body.tags);
    // deno-lint-ignore no-explicit-any
    await this.#db.repo('Posts').update(set as any, { '@id': id } as any);
    return { content: await this.#getOr404(id) };
  }

  @DELETE('/:id:', { bind: [param('id')], description: 'Delete a post.' })
  async remove(id: string): Promise<RapidContextResponse> {
    await this.#getOr404(id);
    await this.#db.repo('Posts').delete({ '@id': id });
    this.#log.info('post deleted', { id });
    // `content` is string | Record | Uint8Array (no `null`) at the
    // decorated-method return contract — an empty string is the idiomatic
    // "204, no real body".
    return { status: 204, content: '' };
  }

  // Nested resource: @Module's prefix ("/posts") joins with THIS method's
  // path → "/posts/:id:/comments". The param is named `:id:` — the SAME as
  // find()'s at the identical trie position; radrouter requires one
  // canonical param name per position across every route there.
  @GET('/:id:/comments', {
    bind: [param('id')],
    description: "List a post's comments.",
  })
  async comments(postId: string): Promise<RapidContextResponse> {
    await this.#getOr404(postId);
    const found = await this.#db.repo('Comments').find({ '@postId': postId }, {
      orderBy: { '@createdAt': 'ASC' },
    });
    // content must be an object/string/Uint8Array, never a bare array.
    // Dates serialize to ISO through JSON.stringify, so rows go as-is.
    return { content: { rows: found.data } };
  }

  @POST('/:id:/comments', {
    bind: [param('id'), payload(validated(CreateCommentBody))],
    description: 'Add a comment to a post.',
  })
  async addComment(
    postId: string,
    body: { author: string; body: string },
  ): Promise<RapidContextResponse> {
    await this.#getOr404(postId);
    const res = await this.#db.repo('Comments').insert({
      postId,
      author: body.author,
      body: body.body,
    });
    return { status: 201, content: res.data[0] };
  }

  // Flat namespace: mounts as "posts.digest" (no HTTP path). @JOB has no
  // `description` option — that's HTTP-verb-specific today.
  @JOB('digest', '0 9 * * *')
  async digest(): Promise<RapidContextResponse> {
    const posts = await this.#db.repo('Posts').count();
    const comments = await this.#db.repo('Comments').count();
    return { content: { posts: posts.count, comments: comments.count } };
  }

  /** Fetch a post or throw the framework 404 — the one shared read path. */
  async #getOr404(id: string): Promise<Post> {
    const res = await this.#db.repo('Posts').find({ '@id': id });
    const row = res.data[0] as PostRow | undefined;
    if (row === undefined) {
      throw new RapidError('RAPID_NOT_FOUND', { details: { id } });
    }
    return this.#present(row);
  }
}
