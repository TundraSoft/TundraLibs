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
//
// `sqlite` is deliberately NOT here. Its adapter pulls a native binding
// per runtime (`jsr:@db/sqlite` on Deno via a Deno-only import-map
// alias, `bun:sqlite` on Bun, `node:sqlite` on Node) — none of which
// resolve in a bundled target (Cloudflare Workers, a browser build),
// so eagerly importing it here would make THIS barrel unbundlable for
// everyone, not just SQLite users. The other six dialects carry no such
// specifier and bundle cleanly (verified: a code-edge-only walk of this
// barrel's graph, following `deno info --json`'s `code` dependency
// edges and never its `type` edges, reaches zero sqlite modules).
//
// SQLite users register it themselves:
//   import '@tundralibs/norm/engines/sqlite';
// before constructing a Norm with `dialect: 'sqlite'` — the same
// ENGINE_NOT_REGISTERED failure as forgetting any other dialect's
// import, not a new failure mode.
import './engines/postgres.ts';
import './engines/maria.ts';
import './engines/mongo.ts';
import './engines/neon.ts';
import './engines/turso.ts';
import './engines/d1.ts';

export * from './core.ts';
