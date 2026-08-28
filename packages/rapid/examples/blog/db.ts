/**
 * Database wiring: a norm `Norm` over local SQLite, and the Migrator that
 * OWNS the DDL (never hand-write SQL — snapshot the registry and apply it;
 * norm creates the tables, foreign keys and indexes). Returns the
 * connected `Norm` instance — the modules pull it via `inject(NORM)`
 * and derive their own schema handle with `norm.use(BlogSchema)` (a
 * scoped view over the same pool).
 *
 * SQLite runs in directory mode (a folder holds the `.db` file) rather
 * than `:memory:` because a named schema needs a real backing file. Both
 * the data dir and the migrations dir are TEMP dirs here, so the example
 * is self-contained and leaves nothing behind — a real app points these
 * at stable paths so data and migration history persist.
 *
 * @module
 */

import { Norm } from '@tundralibs/norm';
// The root barrel deliberately does NOT register sqlite (its native
// binding per runtime would make the barrel unbundlable for everyone
// else) — this example uses it, so it registers explicitly.
import '@tundralibs/norm/engines/sqlite';
import { Migrator } from '@tundralibs/norm/migrations';
import { makeTempDir } from '@tundralibs/compat/file';
import { BlogSchema } from './models/mod.ts';

/** A connected, migrated blog database. */
export type BlogDatabase = {
  norm: Norm;
  /** Close the engine — call on shutdown. */
  close(): Promise<void>;
};

/** Open SQLite, create the schema via the Migrator, return the `Norm`. */
export async function openBlogDatabase(): Promise<BlogDatabase> {
  const dataDir = await makeTempDir({ prefix: 'rapid-blog-db-' });
  const migrationsDir = await makeTempDir({ prefix: 'rapid-blog-mig-' });

  const norm = new Norm({ database: { dialect: 'sqlite', path: dataDir } });
  await norm.connect();

  const db = norm.use(BlogSchema);

  // The Migrator builds the DDL from the registry snapshot and applies
  // it — tables, the comments→posts foreign key, everything.
  const migrator = new Migrator(db, { dir: migrationsDir });
  await migrator.snapshot();
  await migrator.apply();

  // Seed two posts on first run so the demo has something to list.
  if ((await db.repo('Posts').count()).count === 0) {
    await db.repo('Posts').insert([
      {
        title: 'Welcome',
        body: 'First post on the blog.',
        tags: JSON.stringify(['meta']),
        published: true,
      },
      {
        title: 'Draft in progress',
        body: 'Not ready yet.',
        tags: JSON.stringify([]),
      },
    ]);
  }

  return { norm, close: () => norm.disconnect() };
}
