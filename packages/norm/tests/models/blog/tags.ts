/**
 * Tags — plain lookup table (name normalized lowercase on write).
 *
 * @module
 */

import { Column, Entity } from '../../../mod.ts';

export const Tags = Entity('tags', {
  id: Column.integer(),
  name: Column.varchar(40).beforeWrite((v) => v.toLowerCase()),
}, { pk: ['id'] });
