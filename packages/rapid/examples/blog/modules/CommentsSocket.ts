/**
 * A SEPARATE module, in its own file — SOCKET-only (no @Module `prefix`,
 * so it mounts NO HTTP routes; a module can be socket-only). Like
 * {@link Posts} it pulls its dependencies with `inject()` and owns its
 * data actions directly on norm. The `namespace: 'comments'` flattens the
 * bare @SOCKET command to "comments.create".
 *
 * @module
 */

import { inject } from '@tundralibs/doctor';
import { Module, payload, SOCKET } from '../../../decorators/mod.ts';
import type { RapidContextResponse } from '../../../types/mod.ts';
import { BlogSchema } from '../models/mod.ts';
import { CreateCommentViaSocketBody } from '../schemas.ts';
import { validated } from '../validated.ts';

@Module('Comments', { namespace: 'comments' })
export class CommentsSocket {
  readonly #db = inject('Norm').use(BlogSchema);
  readonly #log = inject('Slogger');

  @SOCKET('create', { bind: [payload(validated(CreateCommentViaSocketBody))] })
  async create(
    input: { postId: string; author: string; body: string },
  ): Promise<RapidContextResponse> {
    const post = await this.#db.repo('Posts').find({ '@id': input.postId });
    if (post.data[0] === undefined) {
      return { status: 404, content: { error: 'post not found' } };
    }
    const res = await this.#db.repo('Comments').insert({
      postId: input.postId,
      author: input.author,
      body: input.body,
    });
    this.#log.info('comment created via socket', { postId: input.postId });
    return { status: 201, content: res.data[0] };
  }
}
