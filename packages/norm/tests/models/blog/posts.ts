/**
 * Posts — the blog side. Cross-schema FK to Users ('Author').
 *
 * @module
 */

import { Column, Entity } from '../../../mod.ts';

export const Posts = Entity('posts', {
  id: Column.integer(),
  authorId: Column.uuid(),
  title: Column.varchar(200).minLength(3).beforeWrite((v) => v.trim()),
  body: Column.text().nullable(),
  draft: Column.boolean().default(true),
}, {
  pk: ['id'],
  fk: {
    Author: { model: 'Users', on: { authorId: 'id' }, reverseAs: 'Posts' },
  },
});
