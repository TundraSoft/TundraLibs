/**
 * @tundralibs/norm — definition layer (builders, entities, named
 * schemas, docs, snapshots) + runtime (Norm facade, generated-Guardian
 * validation, repos over the executor seam).
 *
 * ```ts ignore
 * const norm = new Norm({ database: {...}, secret });
 * const db = norm.use(Blog, Stats);
 * await db.repo('Users').insert({ email: 'a@b.c', ... });
 * ```
 *
 * **Server-only.** This barrel registers all seven dialects
 * (`postgres`, `maria`, `sqlite`, `mongo`, `neon`, `turso`, `d1`) so
 * that any `database` config constructs with no extra import. The price
 * is the native SQLite adapter, whose per-runtime bindings
 * (`$sqlite_deno` / `bun:sqlite` / `node:sqlite` / `better-sqlite3`) an
 * edge bundler cannot resolve: importing this module means the bundle
 * cannot be built for Cloudflare Workers or a browser.
 *
 * There, import {@link module:core} (`@tundralibs/norm/core`) plus the
 * one `@tundralibs/norm/engines/<dialect>` module you need; the export
 * surface is otherwise identical.
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
