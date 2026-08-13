/**
 * @tundralibs/norm — definition layer (builders, entities, named
 * schemas, docs, snapshots) + runtime (Norm facade, generated-Guardian
 * validation, repos over the executor seam).
 *
 * ```ts
 * const norm = new Norm({ database: {...}, secret });
 * const db = norm.use(Blog, Stats);
 * await db.repo('Users').insert({ email: 'a@b.c', ... });
 * ```
 *
 * This barrel is the batteries-included entry point: it registers every
 * dialect (`postgres`, `maria`, `sqlite`, `mongo`, `neon`, `turso`,
 * `d1`), so any `database` config works with no extra import — and every
 * driver, native SQLite binding included, is therefore in the bundle.
 *
 * On an edge runtime import {@link module:core} (`@tundralibs/norm/core`)
 * plus the one `@tundralibs/norm/engines/<dialect>` module you need; the
 * export surface is otherwise identical.
 *
 * @module
 */

// Side-effect imports: each registers one dialect's engine factory (see
// `engines/registry.ts`). They come first so a dialect is registered
// before any consumer code can construct a Norm.
import './engines/postgres.ts';
import './engines/maria.ts';
import './engines/sqlite.ts';
import './engines/mongo.ts';
import './engines/neon.ts';
import './engines/turso.ts';
import './engines/d1.ts';

export * from './core.ts';
