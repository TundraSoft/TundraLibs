/**
 * Capabilities a driver engine declares about itself.
 *
 * Every engine — SQL or otherwise — declares the same shape so callers
 * can write a single feature check (`engine.Capabilities.transactions`)
 * without first narrowing on the concrete engine subclass. Engines
 * that don't support a feature simply declare `false`.
 *
 * @module
 */

export type EngineCapabilities = {
  /** Whether the engine maintains a connection pool. */
  pooledConnections: boolean;
  /**
   * Whether the engine supports transaction semantics (BEGIN / COMMIT /
   * ROLLBACK on SQL engines; sessions on Mongo; MULTI / EXEC on Redis;
   * etc.). Engines without any notion of grouped atomic work declare
   * `false` (Memcached today).
   */
  transactions: boolean;
  /**
   * Whether the engine speaks a wire-protocol prepared-statement form
   * (Postgres extended query, MariaDB binary protocol, SQLite
   * `prepare`). `true` means placeholders are bound by the protocol,
   * not parsed inline. Per-engine *caching* of parsed statements is an
   * implementation detail documented per engine.
   *
   * Engines without a parameterised query surface declare `false`
   * (Redis, Memcached, Mongo).
   */
  preparedStatements: boolean;
};
