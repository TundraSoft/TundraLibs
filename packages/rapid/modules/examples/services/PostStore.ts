/**
 * In-memory post store — `@Vial` service.
 * @module
 */
import { Vial } from '@tundralibs/doctor';
import { ulid } from '@tundralibs/id';

export type Post = {
  id: string;
  authorId: string;
  title: string;
  published: boolean;
};

@Vial('SINGLETON')
export class PostStore {
  private readonly __rows = new Map<string, Post>();

  create(authorId: string, title: string): Post {
    const post = { id: ulid(), authorId, title, published: false };
    this.__rows.set(post.id, post);
    return post;
  }
  get(id: string): Post | undefined {
    return this.__rows.get(id);
  }
  publish(id: string): Post | undefined {
    const post = this.__rows.get(id);
    if (post !== undefined) post.published = true;
    return post;
  }
  remove(id: string): boolean {
    return this.__rows.delete(id);
  }
  list(): Post[] {
    return [...this.__rows.values()];
  }
}
