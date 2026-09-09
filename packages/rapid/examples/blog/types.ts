/**
 * Domain types the modules and repositories speak in — deliberately
 * DECOUPLED from the persistence rows (see `models/`). A repository maps
 * a stored row (tags as JSON text, `createdAt` as a `Date`) to/from these
 * clean shapes, so a module never sees a storage detail.
 *
 * @module
 */

/** A blog post as the HTTP/socket layer sees it. */
export type Post = {
  id: string;
  title: string;
  body: string;
  tags: string[];
  published: boolean;
  createdAt: string;
};

/** A comment on a post. */
export type Comment = {
  id: string;
  postId: string;
  author: string;
  body: string;
  createdAt: string;
};
