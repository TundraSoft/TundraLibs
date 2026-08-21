/**
 * Posts — all three channels in one module: a plain service call, a
 * fire-and-forget event, an AWAITED event, and guarded methods.
 * @module
 */
import { RapidError } from '../../../errors/mod.ts';
import { payload, Use } from '../../mod.ts';
import { AppModule } from '../AppModule.ts';
import { requireAuth, requireRole } from '../middleware.ts';
import type { Post } from '../services/PostStore.ts';

const EVENTS = {
  PostCreated: payload<{ id: string; authorId: string; title: string }>(),
  PostPublished: payload<{ id: string; title: string }>(),
  PostRemoved: payload<{ id: string }>(),
};

export class Posts extends AppModule<typeof EVENTS> {
  readonly name = 'Posts';
  readonly namespace = 'posts';
  protected readonly events = EVENTS;

  create(authorId: string, title: string): Post {
    if (!this.users.exists(authorId)) { // ① plain call into a shared service
      throw new RapidError('RAPID_NOT_FOUND', { details: { authorId } });
    }
    const post = this.posts.create(authorId, title);
    this.emit('PostCreated', { id: post.id, authorId, title }); // ③ event, not awaited
    this.log.info('post created', { id: post.id }); // correlated when inside a request
    return post;
  }

  /** Awaited emit: "published" means every subscriber (search index…) has seen it. */
  @Use(requireAuth)
  async publish(id: string): Promise<Post> {
    const post = this.posts.publish(id);
    if (post === undefined) {
      throw new RapidError('RAPID_NOT_FOUND', { details: { id } });
    }
    await this.emit('PostPublished', { id, title: post.title });
    return post;
  }

  @Use(requireRole('admin'))
  remove(id: string): { removed: boolean } {
    const removed = this.posts.remove(id);
    if (removed) this.emit('PostRemoved', { id });
    return { removed };
  }
}
