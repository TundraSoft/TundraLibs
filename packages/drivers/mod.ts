/**
 * @fileoverview Cross-runtime wire-level drivers for SQL databases and
 * key-value stores. Each engine speaks its target protocol natively
 * (no runtime-specific npm wrappers).
 *
 * **This barrel carries no engine.** It re-exports only the abstract
 * layer — the four base classes, the errors, and the shared types — all
 * of which are pure TypeScript with nothing runtime-specific behind
 * them. Engines live one subpath down, and the package exposes them at
 * three levels of granularity:
 *
 * | Specifier                          | What you get                     |
 * | ---------------------------------- | -------------------------------- |
 * | `@tundralibs/drivers`              | bases + errors + types, no engine |
 * | `@tundralibs/drivers/<engine>`     | exactly one engine               |
 * | `@tundralibs/drivers/engines`      | all nine, server-only            |
 *
 * **Why the engines left.** `SQLiteEngine`'s adapter loads a per-runtime
 * NATIVE binding (`bun:sqlite`, `jsr:@db/sqlite`, `better-sqlite3`), and
 * `MariaEngine` / `MongoEngine` pull `npm:mariadb` / `npm:mongodb`. While
 * this barrel re-exported them, naming so much as `EngineError` put all of
 * that in the importer's runtime graph: esbuild and rolldown could not
 * resolve the native SQLite specifiers at all, so bundling for Cloudflare
 * Workers, Vite or a browser failed before a line ran — and a server
 * consumer that only wanted Postgres still shipped the MariaDB and MongoDB
 * clients. Now the barrel's runtime graph reaches no engine, and every
 * consumer pays for exactly the engines it names.
 *
 * **Migrating off the barrel** is a one-line specifier change per import:
 * point each engine at its own subpath (preferred — it is what keeps a
 * bundle small), or move the whole statement to
 * `@tundralibs/drivers/engines`, which still re-exports all nine.
 * Type-only imports of the shared types stay here.
 *
 * @module drivers
 *
 * @example
 * ```typescript
 * import { PostgresEngine } from '@tundralibs/drivers/postgres';
 *
 * const pg = new PostgresEngine('app', { host: 'localhost', database: 'myapp' });
 * const r = await pg.execute({ sql: 'SELECT * FROM users WHERE id = :id:', params: { id: 1 } });
 * ```
 */

export {
  ConnectionEngine,
  PooledConnectionEngine,
} from './ConnectionEngine.ts';
export { BaseEngine } from './BaseEngine.ts';
export { SQLConnectionEngine, SQLEngine } from './SQLEngine.ts';

export { DriverError, EngineError, EngineErrorCodes } from './errors/mod.ts';
export type { EngineErrorCode, EngineErrorMeta } from './errors/mod.ts';

export type {
  EngineCapabilities,
  EngineEvents,
  EngineNetworkOptions,
  EngineOptions,
  EnginePoolOptions,
  EnginePoolStats,
  EngineQuery,
  EngineQueryResult,
  EngineQueryStats,
  EngineSecurityOptions,
  EngineSSLOptions,
  EngineStats,
  EngineStatus,
  EngineTransactionOptions,
  EngineTransactionStatus,
  MemcachedEngineEvents,
  MongoEngineEvents,
  QueryEngineEvents,
  RedisEngineEvents,
  SQLEngineCapabilities,
  SQLEngineEvents,
  SQLEngineOptions,
  TransactionScope,
} from './types/mod.ts';
