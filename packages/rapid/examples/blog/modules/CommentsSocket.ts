/**
 * A SEPARATE module, in its own file, sharing the SAME repositories as
 * {@link Posts} — modules don't own their data; rAPId only cares that an
 * instance has decorated methods, not where its dependencies came from.
 *
 * No @Module `prefix` here, so it mounts NO HTTP routes — a module can be
 * socket-only. The `namespace: 'comments'` flattens the bare @SOCKET
 * command to "comments.create".
 *
 * @module
 */

import { Module, payload, SOCKET } from '../../../decorators/mod.ts';
import type { RapidContextResponse } from '../../../types/mod.ts';
import type { PostRepository } from '../repositories/PostRepository.ts';
import type { CommentRepository } from '../repositories/CommentRepository.ts';
import { CreateCommentViaSocketBody } from '../schemas.ts';
import { validated } from '../validated.ts';

@Module('Comments', { namespace: 'comments' })
export class CommentsSocket {
  constructor(
    private readonly posts: PostRepository,
    private readonly comments: CommentRepository,
  ) {}

  @SOCKET('create', {
    bind: [payload(validated(CreateCommentViaSocketBody))],
  })
  async create(
    input: { postId: string; author: string; body: string },
  ): Promise<RapidContextResponse> {
    if (await this.posts.get(input.postId) === undefined) {
      return { status: 404, content: { error: 'post not found' } };
    }
    return {
      status: 201,
      content: await this.comments.create(input.postId, input),
    };
  }
}
