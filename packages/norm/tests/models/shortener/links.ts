/**
 * Links — the shortener core. TWO FKs to Users (cross-schema entity
 * keys) with explicitly named reverses, bigint clicks, JSON meta,
 * pattern-guarded slug, unique + plain indexes.
 *
 * @module
 */

import { Column, Entity } from '../../../mod.ts';

export const Links = Entity('links', {
  id: Column.integer(),
  slug: Column.varchar(32).pattern(/^[a-z0-9-]+$/)
    .beforeWrite((v) => v.trim().toLowerCase()),
  targetUrl: Column.text().minLength(10),
  ownerId: Column.uuid(),
  createdById: Column.uuid(),
  clicks: Column.bigint().min(0n).default(0n),
  isActive: Column.boolean().default(true),
  meta: Column.json<{ tags: string[]; campaign?: string }>().nullable(),
  expiresAt: Column.timestamp().nullable(),
}, {
  pk: ['id'],
  fk: {
    // TWO FKs to the same target — both reverses explicitly named.
    Owner: { model: 'Users', on: { ownerId: 'id' }, reverseAs: 'Links' },
    CreatedBy: {
      model: 'Users',
      on: { createdById: 'id' },
      reverseAs: 'CreatedLinks',
    },
  },
  index: { byOwner: ['ownerId'] },
  unique: { slug: ['slug'] },
});
