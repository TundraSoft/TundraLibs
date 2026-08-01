/**
 * Visits — the volume table (the live suite loads 200 rows for
 * joins, counts and pagination windows).
 *
 * @module
 */

import { Column, Entity } from '../../../mod.ts';

export const Visits = Entity('visits', {
  id: Column.integer(),
  linkId: Column.integer(),
  country: Column.char(2).beforeWrite((v) => v.toUpperCase()),
  referrer: Column.varchar(255).nullable(),
}, {
  pk: ['id'],
  fk: { Link: { model: 'Links', on: { linkId: 'id' }, reverseAs: 'Visits' } },
});
