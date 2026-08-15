/**
 * @fileoverview Every engine in one import — the deliberate
 * **give-me-everything, server-only** aggregate.
 *
 * The package root (`@tundralibs/drivers`) carries no engine: it stops at
 * the abstract bases, the errors and the shared types, so that naming one
 * of them cannot drag a native binding or a wire protocol into a bundle.
 * This barrel is the opposite trade, made on purpose — it re-exports all
 * nine engines, which means its runtime graph reaches the native SQLite
 * adapter (`bun:sqlite` / `jsr:@db/sqlite` / `better-sqlite3`) as well as
 * `npm:mariadb` and `npm:mongodb`.
 *
 * **Use it on a server**, where those resolve and the convenience is free.
 * It is also the one-line migration for code that used to import engines
 * from the root barrel: change the specifier, keep the import list.
 *
 * **Do not use it on an edge runtime or in a browser bundle** — esbuild and
 * rolldown cannot resolve the native SQLite specifiers, so the build fails
 * outright. Import the engine you actually use from its own subpath
 * instead (`@tundralibs/drivers/neon`, `/turso`, `/d1` are the fetch-only
 * engines that run there); each per-engine subpath costs you that engine
 * and nothing else.
 *
 * @module
 *
 * @example Server — all nine available
 * ```typescript
 * import { MariaEngine, PostgresEngine } from '@tundralibs/drivers/engines';
 *
 * const pg = new PostgresEngine('app', { host: 'localhost', database: 'myapp' });
 * ```
 *
 * @example Edge — one engine, its own subpath
 * ```typescript
 * import { NeonHttpEngine } from '@tundralibs/drivers/neon';
 *
 * const neon = new NeonHttpEngine('edge', {
 *   host: 'ep-cool-name-a1b2c3.us-east-2.aws.neon.tech',
 *   connectionString: 'postgresql://user:pass@ep-cool-name-a1b2c3…/neondb',
 * });
 * ```
 */

export { D1Engine } from './d1/mod.ts';
export type { D1EngineOptions } from './d1/mod.ts';
export { MariaEngine, PlanetScaleEngine } from './maria/mod.ts';
export type { MariaEngineOptions } from './maria/mod.ts';
export { MemcachedEngine } from './memcached/mod.ts';
export type { MemcachedEngineOptions } from './memcached/mod.ts';
export { MongoEngine } from './mongo/mod.ts';
export type { MongoEngineOptions } from './mongo/mod.ts';
export { NeonHttpEngine } from './neon/mod.ts';
export type { NeonHttpEngineOptions } from './neon/mod.ts';
export {
  AlloyDBEngine,
  CitusEngine,
  CockroachEngine,
  PostgresEngine,
  YugabyteEngine,
} from './postgres/mod.ts';
export type { PostgresEngineOptions } from './postgres/mod.ts';
export { RedisConnection, RedisEngine } from './redis/mod.ts';
export type { RedisEngineOptions } from './redis/mod.ts';
export { SQLiteEngine } from './sqlite/mod.ts';
export type { SQLiteEngineOptions } from './sqlite/mod.ts';
export { TursoEngine } from './turso/mod.ts';
export type { TursoEngineOptions } from './turso/mod.ts';
