/**
 * @fileoverview Cross-runtime wire-level drivers for SQL databases and
 * key-value stores. Each engine speaks its target protocol natively
 * (no runtime-specific npm wrappers).
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

export {
  AlloyDBEngine,
  CitusEngine,
  CockroachEngine,
  D1Engine,
  type D1EngineOptions,
  MariaEngine,
  type MariaEngineOptions,
  MemcachedEngine,
  type MemcachedEngineOptions,
  MongoEngine,
  type MongoEngineOptions,
  NeonHttpEngine,
  type NeonHttpEngineOptions,
  PlanetScaleEngine,
  PostgresEngine,
  type PostgresEngineOptions,
  RedisEngine,
  type RedisEngineOptions,
  SQLiteEngine,
  type SQLiteEngineOptions,
  TursoEngine,
  type TursoEngineOptions,
  YugabyteEngine,
} from './engines/mod.ts';

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
