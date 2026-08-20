/**
 * Data access for comments. Like {@link PostRepository}, it is the only
 * norm-aware layer for its table and maps rows to the domain shape.
 *
 * @module
 */

import type { BlogDb } from '../db.ts';
import type { Comment } from '../types.ts';

/** A stored comments row as norm hands it back. */
type CommentRow = {
  id: string;
  postId: string;
  author: string;
  body: string;
  createdAt: Date | string;
};

export class CommentRepository {
  constructor(private readonly db: BlogDb) {}

  private get repo() {
    return this.db.repo('Comments');
  }

  private toComment(row: CommentRow): Comment {
    return {
      id: row.id,
      postId: row.postId,
      author: row.author,
      body: row.body,
      createdAt: new Date(row.createdAt).toISOString(),
    };
  }

  /** Every comment on a post, oldest first. */
  async listForPost(postId: string): Promise<Comment[]> {
    const res = await this.repo.find({ '@postId': postId }, {
      orderBy: { '@createdAt': 'ASC' },
    });
    return (res.data as CommentRow[]).map((r) => this.toComment(r));
  }

  /** Add a comment to a post (the UUID id + `createdAt` come from norm). */
  async create(
    postId: string,
    input: { author: string; body: string },
  ): Promise<Comment> {
    const res = await this.repo.insert({
      postId,
      author: input.author,
      body: input.body,
    });
    return this.toComment(res.data[0] as CommentRow);
  }

  /** Total number of comments. */
  async count(): Promise<number> {
    const res = await this.repo.count();
    return res.count;
  }
}
