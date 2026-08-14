/**
 * @fileoverview Alias engines for Postgres-wire-compatible databases.
 *
 * These backends speak the Postgres wire protocol and emit Postgres SQL,
 * so they reuse {@link PostgresEngine}'s connection + translator wholesale
 * and override only the capabilities that genuinely differ. That keeps the
 * capability profile a per-server fact (declared on the engine) rather than
 * an assumption a consumer bakes in from the dialect.
 *
 * Databases that are byte-compatible with Postgres — Amazon Aurora/RDS
 * Postgres, Supabase, TimescaleDB (a Postgres extension) — need NO alias:
 * point a plain {@link PostgresEngine} at them. {@link AlloyDBEngine} and
 * {@link CitusEngine} are byte-compatible too, but are provided as named
 * **identity aliases** (their own {@link PostgresEngine} `Engine` value, for
 * telemetry / discoverability) — they carry the same capability profile as
 * stock Postgres, unlike {@link CockroachEngine}/{@link YugabyteEngine} which
 * genuinely differ (no advisory locks).
 *
 * @module
 */

import { PostgresEngine } from './Engine.ts';
import type { SQLEngineCapabilities } from '../../types/mod.ts';

/**
 * CockroachDB over the Postgres wire protocol. Identical to
 * {@link PostgresEngine} except that CockroachDB does **not** implement
 * session-level advisory locks (`pg_advisory_lock`), so a consumer must
 * not issue one — `advisoryLock` is `false` and callers fall back to
 * their own mechanism (e.g. a file lock).
 *
 * @example
 * ```ts
 * const db = new CockroachEngine('app', {
 *   host: 'free-tier.cockroachlabs.cloud',
 *   port: 26257,
 *   database: 'defaultdb',
 *   username: 'user',
 *   password: '...',
 *   ssl: true,
 * });
 * ```
 */
export class CockroachEngine extends PostgresEngine {
  /** Distinct identity for telemetry; the wire protocol is still Postgres. */
  public override readonly Engine = 'COCKROACH';

  /** Stock Postgres minus `advisoryLock`. */
  public override readonly Capabilities: SQLEngineCapabilities = {
    pooledConnections: true,
    transactions: true,
    preparedStatements: true,
    // CockroachDB has no pg_advisory_lock — the one capability that
    // differs from stock Postgres.
    advisoryLock: false,
    inPlaceAlter: true,
    referentialActions: true,
    parameterReplacement: undefined,
  };
}

/**
 * YugabyteDB (YSQL) over the Postgres wire protocol. YSQL reuses
 * PostgreSQL's query layer, so it emits and consumes stock Postgres SQL and
 * reuses {@link PostgresEngine}'s connection + translator wholesale.
 *
 * Like {@link CockroachEngine}, it's a **distributed** SQL database, so
 * `advisoryLock` is `false`: advisory locks are node-local (and their support
 * is version-dependent), which makes them unsafe for the cluster-wide mutual
 * exclusion the capability implies — callers should fall back to their own
 * mechanism (e.g. a file lock). Everything else matches stock Postgres
 * (transactions, prepared statements, FK enforcement, in-place `ALTER`).
 *
 * @example
 * ```ts
 * const db = new YugabyteEngine('app', {
 *   host: 'us-east.yugabyte.cloud',
 *   port: 5433,
 *   database: 'yugabyte',
 *   username: 'user',
 *   password: '...',
 *   ssl: true,
 * });
 * ```
 */
export class YugabyteEngine extends PostgresEngine {
  /** Distinct identity for telemetry; the wire protocol is still Postgres. */
  public override readonly Engine = 'YUGABYTE';

  /** Stock Postgres minus `advisoryLock`. */
  public override readonly Capabilities: SQLEngineCapabilities = {
    pooledConnections: true,
    transactions: true,
    preparedStatements: true,
    // Distributed: advisory locks are node-local / version-dependent, so
    // treat them as unavailable for cluster-wide locking (as with Cockroach).
    advisoryLock: false,
    inPlaceAlter: true,
    referentialActions: true,
    parameterReplacement: undefined,
  };
}

/**
 * Google AlloyDB for PostgreSQL over the Postgres wire protocol. AlloyDB is a
 * PostgreSQL-based engine (with Google's storage + columnar-engine additions),
 * so it emits and consumes stock Postgres SQL and has **full capability
 * parity** — advisory locks, transactions, prepared statements, FK enforcement,
 * and in-place `ALTER` all behave exactly as stock Postgres. This alias
 * therefore differs from {@link PostgresEngine} only in {@link PostgresEngine}
 * `Engine` identity (telemetry / discoverability); a plain
 * {@link PostgresEngine} pointed at AlloyDB works identically.
 *
 * @example
 * ```ts
 * const db = new AlloyDBEngine('app', {
 *   host: '10.20.0.3',
 *   port: 5432,
 *   database: 'postgres',
 *   username: 'postgres',
 *   password: '...',
 *   ssl: true,
 * });
 * ```
 */
export class AlloyDBEngine extends PostgresEngine {
  /** Distinct identity for telemetry; the wire protocol is still Postgres. */
  public override readonly Engine = 'ALLOYDB';

  // Full parity with stock Postgres — AlloyDB is enhanced Postgres, not a
  // reimplementation. Identity alias only.
  /** Identical to stock Postgres. */
  public override readonly Capabilities: SQLEngineCapabilities = {
    pooledConnections: true,
    transactions: true,
    preparedStatements: true,
    advisoryLock: true,
    inPlaceAlter: true,
    referentialActions: true,
    parameterReplacement: undefined,
  };
}

/**
 * Citus over the Postgres wire protocol — the distributed-Postgres extension
 * that powers Azure Cosmos DB for PostgreSQL (formerly Hyperscale (Citus)).
 * Citus is an extension **on** PostgreSQL rather than a reimplementation, so it
 * reuses stock Postgres SQL and keeps the full capability profile at the
 * coordinator: transactions, prepared statements, in-place `ALTER`, and
 * `pg_advisory_lock` — which is coordinator-scoped, and since all clients
 * connect through the coordinator it is effectively cluster-wide (unlike
 * {@link CockroachEngine}/{@link YugabyteEngine}, hence `advisoryLock: true`).
 *
 * **Caveat (schema design, not a capability flag):** on *distributed* tables
 * Citus restricts some DDL and foreign-key shapes (an FK must include the
 * distribution column or reference a Citus *reference* table). That's a
 * modelling constraint, not a per-engine toggle — `referentialActions` stays
 * `true` because Citus enforces referential actions on the FK shapes it
 * accepts.
 *
 * @example
 * ```ts
 * const db = new CitusEngine('app', {
 *   host: 'c.mygroup.postgres.cosmos.azure.com',
 *   port: 5432,
 *   database: 'citus',
 *   username: 'citus',
 *   password: '...',
 *   ssl: true,
 * });
 * ```
 */
export class CitusEngine extends PostgresEngine {
  /** Distinct identity for telemetry; the wire protocol is still Postgres. */
  public override readonly Engine = 'CITUS';

  // Full parity with stock Postgres at the coordinator (Citus is a PG
  // extension). Distributed-table FK/DDL caveats are schema-design, not caps.
  /** Identical to stock Postgres. */
  public override readonly Capabilities: SQLEngineCapabilities = {
    pooledConnections: true,
    transactions: true,
    preparedStatements: true,
    advisoryLock: true,
    inPlaceAlter: true,
    referentialActions: true,
    parameterReplacement: undefined,
  };
}
