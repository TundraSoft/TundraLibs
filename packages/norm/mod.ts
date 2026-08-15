/**
 * @fileoverview `@tundralibs/norm` entrypoint.
 *
 * This barrel exposes the full definition layer and runtime surface for
 * the ORM: entity builders, schema declarations, generated Guardian
 * validation, migration tooling, and repo/executor access over the
 * configured database engine.
 *
 * The root module is intentionally server-first. It registers all seven
 * dialects (`postgres`, `maria`, `sqlite`, `mongo`, `neon`, `turso`,
 * `d1`) so consumer code can construct a `Norm` instance with no extra
 * import. That also loads the native SQLite bindings for local
 * file-backed databases, which browser and Cloudflare Worker bundles
 * cannot resolve.
 *
 * For worker or browser targets, import `@tundralibs/norm/core` plus a
 * single engine module such as `@tundralibs/norm/engines/d1` or
 * `@tundralibs/norm/engines/neon` instead.
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
