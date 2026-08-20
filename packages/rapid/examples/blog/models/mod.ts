/**
 * The `Blog` schema — the folder is the schema boundary; this barrel
 * composes its entities into one named schema that `db.ts` hands to
 * `norm.use()`.
 *
 * @module
 */

import { Schema } from '@tundralibs/norm';
import { Posts } from './Posts.ts';
import { Comments } from './Comments.ts';

export { Comments } from './Comments.ts';
export { Posts } from './Posts.ts';

export const BlogSchema = Schema('Blog', { Posts, Comments });
