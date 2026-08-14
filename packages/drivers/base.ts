/**
 * @fileoverview Engine-authoring surface: the abstract base classes every
 * driver extends, plus the types needed to declare and configure one.
 *
 * **Why this exists as its own sub-path.** The bases used to be reachable only
 * from the package root (`@tundralibs/drivers`), and that barrel re-exports
 * *every* concrete engine — including the native `SQLiteEngine`, whose adapter
 * loads a per-runtime native binding (`bun:sqlite`, `jsr:@db/sqlite`,
 * `better-sqlite3`). So anyone writing their own engine, and every doc teaching
 * them how, had to drag the full driver set into their module graph just to
 * name `BaseEngine`. Bundlers targeting edge/serverless runtimes choke on those
 * native specifiers, which is exactly what the per-engine sub-paths
 * (`@tundralibs/drivers/postgres`, `/neon`, `/turso`, …) were introduced to
 * avoid.
 *
 * This module closes that gap from the other side: it re-exports **only** the
 * abstract layer — no concrete engine is reachable from here, at runtime or
 * otherwise — so `import { BaseEngine } from '@tundralibs/drivers/base'` costs
 * a subclasser nothing beyond the base classes they actually extend. It is the
 * complement of the per-engine sub-paths: those ship one engine each, this one
 * ships the scaffolding to write a new one.
 *
 * **Choosing a base.** The hierarchy splits on two axes — pooled vs. pool-free,
 * and generic vs. SQL:
 *
 * | Base                                | Socket pool | Query/transaction surface |
 * | ----------------------------------- | ----------- | ------------------------- |
 * | {@link ConnectionEngine}            | no          | no                        |
 * | {@link PooledConnectionEngine}      | yes         | no                        |
 * | {@link SQLConnectionEngine}         | no          | yes                       |
 * | {@link SQLEngine}                   | yes         | yes                       |
 *
 * Extend a **pooled** base when your driver speaks a raw socket protocol and
 * wants the built-in `ConnectionPool` — owned internally as `this._pool`, never
 * constructed by the subclass — to manage min/max connections, idle eviction,
 * and acquire timeouts. Extend a
 * **pool-free** base when the backend is `fetch`-based (edge/serverless HTTP
 * drivers such as Neon, Turso, and D1) or when the underlying client pools
 * internally (as `MongoClient` does) — those never pull the socket pool in.
 *
 * {@link BaseEngine} is the historical name for {@link PooledConnectionEngine}
 * and stays exported here so existing `extends BaseEngine` subclasses keep
 * working unchanged.
 *
 * Errors live at `@tundralibs/drivers/errors`; the complete type surface,
 * including the concrete engines' event maps, lives at
 * `@tundralibs/drivers/types`.
 *
 * @module
 *
 * @example Subclassing the pooled base
 * ```typescript
 * import { BaseEngine } from '@tundralibs/drivers/base';
 * import type {
 *   EngineCapabilities,
 *   EngineOptions,
 * } from '@tundralibs/drivers/base';
 *
 * type MyConnection = { close(): Promise<void> };
 *
 * class MyEngine extends BaseEngine<MyConnection, EngineOptions> {
 *   public readonly Engine = 'MYDB';
 *   public readonly Capabilities: EngineCapabilities = {
 *     pooledConnections: true,
 *     transactions: false,
 *     preparedStatements: false,
 *   };
 *
 *   protected _createResource(): Promise<MyConnection> {
 *     return Promise.resolve({ close: () => Promise.resolve() });
 *   }
 *
 *   protected async _destroyResource(c: MyConnection): Promise<void> {
 *     await c.close();
 *   }
 *
 *   protected _ping(_c: MyConnection): Promise<boolean> {
 *     return Promise.resolve(true);
 *   }
 * }
 * ```
 */

export {
  ConnectionEngine,
  PooledConnectionEngine,
} from './ConnectionEngine.ts';
export { BaseEngine } from './BaseEngine.ts';
export { SQLConnectionEngine, SQLEngine } from './SQLEngine.ts';

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
  QueryEngineEvents,
  SQLDialect,
  SQLEngineCapabilities,
  SQLEngineEvents,
  SQLEngineOptions,
  TransactionScope,
} from './types/mod.ts';
