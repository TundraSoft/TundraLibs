/**
 * Comments — owns its own state, and shows DELEGATION: `purgeThread` must
 * delete the post, which only an admin may do, so it goes through
 * `invoke` (Posts' guard runs against the CALLER's principal) rather
 * than calling the method directly and silently bypassing the guard.
 * @module
 */
import { RapidError } from '../../../errors/mod.ts';
import { payload } from '../../mod.ts';
import { AppModule } from '../AppModule.ts';
import { Posts } from './Posts.ts';

export type Comment = {
  id: number;
  postId: string;
  author: string;
  body: string;
};

export class Comments extends AppModule {
  readonly name = 'Comments';
  readonly namespace = 'comments';
  readonly events = {
    CommentAdded: payload<{ postId: string; author: string; body: string }>(),
  };
  private __rows: Comment[] = [];
  private __seq = 0;

  async add(postId: string, author: string, body: string): Promise<Comment> {
    if (this.posts.get(postId) === undefined) {
      throw new RapidError('RAPID_NOT_FOUND', { details: { postId } });
    }
    const comment = { id: ++this.__seq, postId, author, body };
    this.__rows.push(comment);
    await this.emit('CommentAdded', { postId, author, body }); // awaited
    return comment;
  }

  forPost(postId: string): Comment[] {
    return this.__rows.filter((c) => c.postId === postId);
  }

  /** ② invoke: delegation that HONORS Posts.remove's admin guard. */
  async purgeThread(
    postId: string,
  ): Promise<{ status: number; purged: number }> {
    const outcome = await this.invoke(Posts, 'remove', [postId]);
    if (outcome.status !== 200) return { status: outcome.status, purged: 0 };
    const before = this.__rows.length;
    this.__rows = this.__rows.filter((c) => c.postId !== postId);
    return { status: 200, purged: before - this.__rows.length };
  }
}
