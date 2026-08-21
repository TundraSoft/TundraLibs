/**
 * The `posts` table — a norm entity. One entity per file is norm's own
 * convention (the folder is the schema boundary; see `mod.ts`).
 *
 * The PK is a UUID generated app-side via a JS default (dialect-agnostic
 * — SQLite has no `UUID()` function). `createdAt` defaults to now the
 * same way. `tags` is stored as JSON text and (de)serialized by the
 * repository, so the domain layer works with a real `string[]`.
 *
 * @module
 */

import { Column, Entity } from '@tundralibs/norm';

export const Posts = Entity('posts', {
  id: Column.uuid().default(() => crypto.randomUUID()),
  title: Column.varchar(200),
  body: Column.text(),
  // JSON array of tag strings, stored as TEXT; the repository maps it.
  tags: Column.text().default('[]'),
  published: Column.boolean().default(false),
  createdAt: Column.timestamp().default(() => new Date()),
}, { pk: ['id'] });
