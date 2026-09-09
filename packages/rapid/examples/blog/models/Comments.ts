/**
 * The `comments` table — a norm entity with a foreign key back to
 * `Posts`. `onDelete: 'CASCADE'` means deleting a post removes its
 * comments at the database, so the app never has to (a real relation, not
 * just a loose `postId`). The `model` in an `fk` is the target's REGISTRY
 * KEY ('Posts'), not a table name.
 *
 * @module
 */

import { Column, Entity } from '@tundralibs/norm';

export const Comments = Entity('comments', {
  id: Column.uuid().default(() => crypto.randomUUID()),
  postId: Column.uuid(),
  author: Column.varchar(80),
  body: Column.text(),
  createdAt: Column.timestamp().default(() => new Date()),
}, {
  pk: ['id'],
  fk: {
    Post: {
      model: 'Posts',
      on: { postId: 'id' },
      onDelete: 'CASCADE',
    },
  },
});
