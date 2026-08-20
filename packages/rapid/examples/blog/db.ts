/**
 * Database wiring: a norm `Norm` over local SQLite, the `Blog` schema,
 * and the Migrator that OWNS the DDL (never hand-write SQL — snapshot the
 * registry and apply it; norm creates the tables, foreign keys and
 * indexes). Returns a connected, migrated handle the repositories wrap.
 *
 * SQLite is used in directory mode (a folder holds the `.db` file) rather
 * than `:memory:` because a named schema needs a real backing file. Both
 * the data dir and the migrations dir are TEMP dirs here, so the example
 * is self-contained and leaves nothing behind — a real app points these
 * at stable paths so data and migration history persist.
 *
 * @module
 */

import { Norm } from '@tundralibs/norm';
import { Migrator } from '@tundralibs/norm/migrations';
import { makeTempDir } from '@tundralibs/compat/file';
import { BlogSchema } from './models/mod.ts';

// A tiny indirection so the fully-resolved db handle type (entities and
// all) can be exported without repeating the schema generics by hand.
function useBlog(norm: Norm) {
  return norm.use(BlogSchema);
}

/** The typed database handle the repositories are built against. */
export type BlogDb = ReturnType<typeof useBlog>;

/** A connected, migrated blog database plus its owning `Norm`. */
export type BlogDatabase = {
  norm: Norm;
  db: BlogDb;
  /** Close the engine — call on shutdown. */
  close(): Promise<void>;
};

/** Open SQLite, create the schema via the Migrator, return the handle. */
export async function openBlogDatabase(): Promise<BlogDatabase> {
  const dataDir = await makeTempDir({ prefix: 'rapid-blog-db-' });
  const migrationsDir = await makeTempDir({ prefix: 'rapid-blog-mig-' });

  const norm = new Norm({ database: { dialect: 'sqlite', path: dataDir } });
  await norm.connect();

  const db = useBlog(norm);

  // The Migrator builds the DDL from the registry snapshot and applies
  // it — tables, the comments→posts foreign key, everything.
  const migrator = new Migrator(db, { dir: migrationsDir });
  await migrator.snapshot();
  await migrator.apply();

  return {
    norm,
    db,
    close: () => norm.disconnect(),
  };
}
