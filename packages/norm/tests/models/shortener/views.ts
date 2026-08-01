/**
 * Read-only kinds over the shortener tables: ActiveLinks is a real
 * database VIEW; TopLinks is a QUERY (stored client-side SELECT)
 * composed ON that view.
 *
 * @module
 */

import { Column, Entity } from '../../../mod.ts';

export const ActiveLinks = Entity('active_links', {
  id: Column.integer(),
  slug: Column.varchar(32),
  targetUrl: Column.text(),
  clicks: Column.bigint(),
}, {
  type: 'VIEW',
  query: {
    type: 'SELECT',
    table: 'links',
    columns: ['id', 'slug', 'targetUrl', 'clicks', 'isActive'],
    projection: {
      '@id': true,
      '@slug': true,
      '@targetUrl': true,
      '@clicks': true,
    },
    where: { '@isActive': true },
  },
});

export const TopLinks = Entity('top_links', {
  slug: Column.varchar(32),
  clicks: Column.bigint(),
}, {
  type: 'QUERY',
  query: {
    type: 'SELECT',
    table: 'active_links', // composes on the VIEW
    columns: ['slug', 'clicks'],
    projection: { '@slug': true, '@clicks': true },
    orderBy: { '@clicks': 'DESC' },
  },
});
