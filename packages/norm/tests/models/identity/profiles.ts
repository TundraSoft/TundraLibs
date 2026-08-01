/**
 * Profiles — 1:1 extension of Users. FK columns == pk, so the reverse
 * relation DERIVES hasOne (`Users` rows project `@Profile` as
 * object-or-null, no explicit cardinality needed).
 *
 * @module
 */

import { Column, Entity } from '../../../mod.ts';

export const Profiles = Entity('profiles', {
  userId: Column.uuid(),
  bio: Column.text().nullable(),
  birthday: Column.timestamp().encrypt().nullable(), // Date in TS, TEXT at rest
  website: Column.varchar(255).nullable(),
}, {
  pk: ['userId'],
  fk: {
    User: {
      model: 'Users',
      on: { userId: 'id' },
      reverseAs: 'Profile',
      // Users' default reads eagerly carry their Profile (hasOne).
      reverseProject: true,
      // A profile cannot outlive its user — deleting the user cascades.
      onDelete: 'CASCADE',
    },
  },
});
