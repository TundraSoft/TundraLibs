/**
 * Capabilities specific to SQL-style engines (relational + document).
 *
 * @module
 */

import type { EngineCapabilities } from './EngineCapabilities.ts';

/**
 * The SQL translator family a {@link SQLEngine} emits. Consumers key
 * dialect-specific behaviour (migration plan artifacts, DDL emission) on
 * this — an alias engine that reuses a base translator reports its base
 * family here regardless of its own {@link EngineCapabilities} identity.
 */
export type SQLDialect = 'postgres' | 'maria' | 'sqlite';

/**
 * Capabilities specific to SQL-style engines (relational + document).
 *
 * The cross-engine fields (`transactions`, `preparedStatements`,
 * `pooledConnections`) live on {@link EngineCapabilities}; this type
 * adds only the SQL-specific concerns.
 *
 * @see {@link EngineCapabilities}
 */
export type SQLEngineCapabilities = EngineCapabilities & {
  /**
   * Native placeholder format used for parameter binding.
   * Set this so `SQLEngine._standardizeQuery` can rewrite `:name:` placeholders
   * into the dialect-specific form. Leave undefined for engines whose native
   * client already accepts named parameters (e.g. MariaDB driver).
   */
  parameterReplacement?: {
    /** Prefix character(s) for the placeholder (e.g. `$` for Postgres). */
    prefix: string;
    /** Suffix character(s), if any (e.g. `''` for Postgres). */
    suffix: string;
  };
  /**
   * Server implements session-level advisory locks (Postgres
   * `pg_advisory_lock`, MySQL/MariaDB `GET_LOCK`). Consumers (e.g. a
   * migrator) use these for multi-process mutual exclusion; when `false`
   * they must fall back to another mechanism (a file lock) rather than
   * issue a lock statement the server will reject.
   *
   * This is a PER-SERVER fact, not a per-dialect one — a wire-compatible
   * engine can share Postgres's SQL yet lack advisory locks (e.g.
   * CockroachDB), which is exactly why it lives on the engine and not in
   * a dialect switch.
   */
  advisoryLock: boolean;
  /**
   * Server can `ALTER` a column's type/nullability and add/drop
   * constraints in place, without rebuilding the table. `false` on SQLite
   * (its `ALTER TABLE` cannot change a column's type — that is a
   * create-copy-swap rebuild).
   */
  inPlaceAlter: boolean;
  /**
   * Server enforces `FOREIGN KEY` constraints with `ON DELETE` / `ON
   * UPDATE` referential actions. `false` on FK-less backends (PlanetScale
   * / Vitess), where a consumer should skip constraint DDL and enforce
   * referential integrity in application code.
   */
  referentialActions: boolean;
};
