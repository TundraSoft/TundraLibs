/**
 * The Blog schema — posts, tags, and their composite-pk M2M junction.
 * Posts point at Identity's 'Users' cross-schema.
 *
 * @module
 */

import { Schema } from '../../../mod.ts';
import { Posts } from './posts.ts';
import { Tags } from './tags.ts';
import { PostTags } from './post-tags.ts';
import { TagsOfPosts } from './tags-of-posts.ts';

export { Posts, PostTags, Tags, TagsOfPosts };

export const Blog = Schema('Blog', { Posts, Tags, PostTags, TagsOfPosts });
