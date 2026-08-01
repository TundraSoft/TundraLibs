/**
 * PostTags — the M2M junction with a COMPOSITE primary key. Both FKs
 * name their reverses, enabling two-hop traversal (Tag → junction →
 * Post) through the junction's own belongsTo.
 *
 * @module
 */

import { Column, Entity } from '../../../mod.ts';

export const PostTags = Entity('post_tags', {
  postId: Column.integer(),
  tagId: Column.integer(),
}, {
  pk: ['postId', 'tagId'], // composite
  fk: {
    Post: { model: 'Posts', on: { postId: 'id' }, reverseAs: 'TagLinks' },
    Tag: { model: 'Tags', on: { tagId: 'id' }, reverseAs: 'PostLinks' },
  },
});
