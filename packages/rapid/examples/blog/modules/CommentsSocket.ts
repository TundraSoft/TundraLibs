/**
 * A SOCKET-only module in its own file (no `prefix` → no HTTP routes).
 * Delegates the existence check to `Posts` through `invoke`: the call
 * carries this request's correlation, runs `Posts.get`'s guards if it
 * had any, and turns its 404 throw into an envelope instead of an
 * exception. The `namespace` field flattens the bare @SOCKET command to
 * "comments.create".
 *
 * @module
 */
import { payload, SOCKET } from '../../../decorators/mod.ts';
import type { RapidContextResponse } from '../../../types/mod.ts';
import { CreateCommentViaSocketBody } from '../schemas.ts';
import { validated } from '../validated.ts';
import { BlogModule } from './BlogModule.ts';
import { Posts } from './Posts.ts';

export class CommentsSocket extends BlogModule {
  readonly name = 'Comments';
  readonly namespace = 'comments';
  protected readonly events = {};

  @SOCKET('create', { bind: [payload(validated(CreateCommentViaSocketBody))] })
  async create(
    input: { postId: string; author: string; body: string },
  ): Promise<RapidContextResponse> {
    const post = await this.invoke(Posts, 'get', [input.postId]);
    if (post.status !== 200) {
      return {
        status: post.status,
        content: post.content as Record<string, unknown>,
      };
    }
    const res = await this.db.repo('Comments').insert({
      postId: input.postId,
      author: input.author,
      body: input.body,
    });
    this.log.info('comment created via socket', { postId: input.postId });
    return { status: 201, content: res.data[0] };
  }
}
