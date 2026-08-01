/**
 * TagsOfPosts — the M2M-via-VIEW pattern. A database VIEW flattens
 * the junction⋈tags join once, DB-side; its LOGICAL fk to Posts
 * (join-only — views never emit FK DDL) derives the reverse
 * `'@Tags'` on Posts, so "posts with their tags" is ONE call and ONE
 * SELECT with no junction pivoting:
 *
 * ```ts
 * db.repo('Posts').find(undefined, {
 *   project: { '@title': true, '@Tags': { '@name': true } },
 * });
 * ```
 *
 * @module
 */

import { Column, Entity } from '../../../mod.ts';

export const TagsOfPosts = Entity('tags_of_posts', {
  postId: Column.integer(),
  tagId: Column.integer(),
  name: Column.varchar(40),
}, {
  type: 'VIEW',
  query: {
    type: 'SELECT',
    table: 'post_tags',
    columns: ['postId', 'tagId'],
    joins: {
      T: {
        table: 'tags',
        columns: ['id', 'name'],
        type: 'INNER',
        on: { '@T.@id': '@tagId' },
      },
    },
    projection: {
      '@postId': true,
      '@tagId': true,
      '@T.@name': 'name',
    },
  },
  fk: {
    Post: { model: 'Posts', on: { postId: 'id' }, reverseAs: 'Tags' },
  },
});
