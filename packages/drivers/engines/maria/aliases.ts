/**
 * @fileoverview Alias engines for MySQL-wire-compatible databases.
 *
 * These backends speak the MySQL wire protocol, so they reuse
 * {@link MariaEngine}'s connection + translator and override only the
 * capabilities that differ. Databases that are byte-compatible with
 * MySQL/MariaDB — Amazon Aurora/RDS MySQL, TiDB, SingleStore — need NO
 * alias: point a plain {@link MariaEngine} at them.
 *
 * @module
 */

import { MariaEngine } from './Engine.ts';
import type { SQLEngineCapabilities } from '../../types/mod.ts';

/**
 * PlanetScale (Vitess) over the MySQL wire protocol. Reuses
 * {@link MariaEngine}, but Vitess **does not enforce `FOREIGN KEY`
 * constraints** and its `GET_LOCK` is not cluster-wide, so both
 * `referentialActions` and `advisoryLock` are `false`. A consumer should
 * skip FK constraint DDL (enforce referential integrity in application
 * code) and not rely on a server-side advisory lock.
 *
 * Note: PlanetScale's edge/serverless HTTP endpoint (`@planetscale/
 * database`) is a different transport and needs its own engine; this
 * class targets a standard MySQL-protocol connection.
 */
export class PlanetScaleEngine extends MariaEngine {
  public override readonly Engine = 'PLANETSCALE';

  public override readonly Capabilities: SQLEngineCapabilities = {
    pooledConnections: true,
    transactions: true,
    preparedStatements: true,
    advisoryLock: false, // Vitess GET_LOCK is not cluster-wide
    inPlaceAlter: true,
    referentialActions: false, // Vitess does not enforce FK constraints
    parameterReplacement: { prefix: ':', suffix: '' },
  };
}
