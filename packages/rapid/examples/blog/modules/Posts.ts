/**
 * The Posts module — every HTTP verb, a nested comments resource, route
 * versioning, and a scheduled digest JOB. It is a PLAIN class in its own
 * file: it imports the decorators (metadata-only — they never wrap the
 * methods), takes its dependencies (the repositories) by constructor, and
 * knows nothing about how it's mounted. `new Posts(postRepo, commentRepo)`
 * works in a unit test with no server involved.
 *
 * Handlers are `async` now that the repositories hit SQLite — the module
 * tier awaits a returned promise transparently.
 *
 * @module
 */

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
import type { PostRepository } from '../repositories/PostRepository.ts';
import type { CommentRepository } from '../repositories/CommentRepository.ts';
import {
  CreateCommentBody,
  CreatePostBody,
  PostSummary,
  UpdatePostBody,
} from '../schemas.ts';
import { validated } from '../validated.ts';

// `namespace: 'posts'` turns the bare @JOB('digest') below into the flat
// "posts.digest" job name; `prefix: '/posts'` joins onto HTTP paths only.
// `version: 'v1'` is the module DEFAULT — `find()` inherits it below.
@Module('Posts', { namespace: 'posts', prefix: '/posts', version: 'v1' })
export class Posts {
  constructor(
    private readonly posts: PostRepository,
    private readonly commentRepo: CommentRepository,
  ) {}

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
    // total) rather than slicing in memory. A real app would also map
    // `_query.filters`/`.sorting` onto the repository's own filter API.
    const { page, size } = paging;
    const { rows, total } = await this.posts.list({
      limit: size,
      offset: (page - 1) * size,
    });
    return { content: { rows, total, paging } };
  }

  // No explicit `version` — inherits the @Module default ('v1'), which is
  // ALSO `server.versioning.default`, so a plain request (no header)
  // resolves here too.
  @GET('/:id:', {
    bind: [param('id')],
    description: 'Fetch one post by id.',
  })
  async find(id: string): Promise<RapidContextResponse> {
    const post = await this.posts.get(id);
    if (post === undefined) {
      throw new RapidError('RAPID_NOT_FOUND', { details: { id } });
    }
    return { content: post };
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
    const post = await this.posts.get(id);
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
  async create(
    body: { title: string; body: string; tags?: string[] },
  ): Promise<RapidContextResponse> {
    return { status: 201, content: await this.posts.create(body) };
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
    const updated = await this.posts.update(id, body);
    if (updated === undefined) {
      throw new RapidError('RAPID_NOT_FOUND', { details: { id } });
    }
    return { content: updated };
  }

  @DELETE('/:id:', { bind: [param('id')], description: 'Delete a post.' })
  async remove(id: string): Promise<RapidContextResponse> {
    const existed = await this.posts.remove(id);
    if (!existed) throw new RapidError('RAPID_NOT_FOUND', { details: { id } });
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
    if (await this.posts.get(postId) === undefined) {
      throw new RapidError('RAPID_NOT_FOUND', { details: { postId } });
    }
    // content must be an object/string/Uint8Array, never a bare array.
    return { content: { rows: await this.commentRepo.listForPost(postId) } };
  }

  @POST('/:id:/comments', {
    bind: [param('id'), payload(validated(CreateCommentBody))],
    description: 'Add a comment to a post.',
  })
  async addComment(
    postId: string,
    body: { author: string; body: string },
  ): Promise<RapidContextResponse> {
    if (await this.posts.get(postId) === undefined) {
      throw new RapidError('RAPID_NOT_FOUND', { details: { postId } });
    }
    return {
      status: 201,
      content: await this.commentRepo.create(postId, body),
    };
  }

  // Flat namespace: mounts as "posts.digest" (no HTTP path). @JOB has no
  // `description` option — that's HTTP-verb-specific today.
  @JOB('digest', '0 9 * * *')
  async digest(): Promise<RapidContextResponse> {
    return {
      content: {
        posts: await this.posts.count(),
        comments: await this.commentRepo.count(),
      },
    };
  }
}
