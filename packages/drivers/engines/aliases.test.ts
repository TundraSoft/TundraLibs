/**
 * @fileoverview Alias-engine + capability-declaration tests. These
 * exercise the SELF-DESCRIBING capability surface only — no live database
 * is touched (engines connect lazily), so alias engines for backends we
 * cannot reach in CI (CockroachDB, PlanetScale) are still verifiable.
 * @module
 */

import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import {
  AlloyDBEngine,
  CitusEngine,
  CockroachEngine,
  MariaEngine,
  PlanetScaleEngine,
  PostgresEngine,
  SQLiteEngine,
  YugabyteEngine,
} from '../mod.ts';

const PG = { host: 'h', database: 'd', username: 'u' } as const;
const MY = { host: 'h', database: 'd', username: 'u' } as const;

describe('drivers.aliases (capability declarations, no connection)', () => {
  it('base engines declare the SQL capability surface', () => {
    const pg = new PostgresEngine('pg', PG);
    asserts.assertEquals(pg.Dialect, 'postgres');
    asserts.assertEquals(pg.Capabilities.advisoryLock, true);
    asserts.assertEquals(pg.Capabilities.inPlaceAlter, true);
    asserts.assertEquals(pg.Capabilities.referentialActions, true);

    const my = new MariaEngine('my', MY);
    asserts.assertEquals(my.Dialect, 'maria');
    asserts.assertEquals(my.Capabilities.advisoryLock, true);

    const lite = new SQLiteEngine('lite', { path: ':memory:' });
    asserts.assertEquals(lite.Dialect, 'sqlite');
    // file-local — no server advisory lock, and ALTER cannot retype.
    asserts.assertEquals(lite.Capabilities.advisoryLock, false);
    asserts.assertEquals(lite.Capabilities.inPlaceAlter, false);
    asserts.assertEquals(lite.Capabilities.referentialActions, true);
  });

  it('CockroachEngine: Postgres family + identity, but advisory locks OFF', () => {
    const cr = new CockroachEngine('cr', PG);
    // Reuses the Postgres translator → same SQL family + plan artifacts.
    asserts.assertEquals(cr.Dialect, 'postgres');
    asserts.assert(cr instanceof PostgresEngine);
    // Its own identity for telemetry / instanceId.
    asserts.assertEquals(cr.Engine, 'COCKROACH');
    asserts.assertStringIncludes(cr.instanceId, 'COCKROACH');
    // The one capability that differs from stock Postgres.
    asserts.assertEquals(cr.Capabilities.advisoryLock, false);
    asserts.assertEquals(cr.Capabilities.inPlaceAlter, true);
    asserts.assertEquals(cr.Capabilities.referentialActions, true);
  });

  it('YugabyteEngine: Postgres family + identity, but advisory locks OFF', () => {
    const yb = new YugabyteEngine('yb', PG);
    // Reuses the Postgres translator → same SQL family + plan artifacts.
    asserts.assertEquals(yb.Dialect, 'postgres');
    asserts.assert(yb instanceof PostgresEngine);
    // Its own identity for telemetry / instanceId.
    asserts.assertEquals(yb.Engine, 'YUGABYTE');
    asserts.assertStringIncludes(yb.instanceId, 'YUGABYTE');
    // Distributed: advisory locks node-local → off; the rest match Postgres.
    asserts.assertEquals(yb.Capabilities.advisoryLock, false);
    asserts.assertEquals(yb.Capabilities.inPlaceAlter, true);
    asserts.assertEquals(yb.Capabilities.referentialActions, true);
  });

  it('AlloyDBEngine: Postgres family + identity, FULL parity (advisory locks ON)', () => {
    const ab = new AlloyDBEngine('ab', PG);
    asserts.assertEquals(ab.Dialect, 'postgres');
    asserts.assert(ab instanceof PostgresEngine);
    asserts.assertEquals(ab.Engine, 'ALLOYDB');
    asserts.assertStringIncludes(ab.instanceId, 'ALLOYDB');
    // Identity alias — same capability profile as stock Postgres.
    asserts.assertEquals(ab.Capabilities.advisoryLock, true);
    asserts.assertEquals(ab.Capabilities.inPlaceAlter, true);
    asserts.assertEquals(ab.Capabilities.referentialActions, true);
  });

  it('CitusEngine: Postgres family + identity, FULL parity (coordinator advisory locks ON)', () => {
    const ct = new CitusEngine('ct', PG);
    asserts.assertEquals(ct.Dialect, 'postgres');
    asserts.assert(ct instanceof PostgresEngine);
    asserts.assertEquals(ct.Engine, 'CITUS');
    asserts.assertStringIncludes(ct.instanceId, 'CITUS');
    // Distributed extension ON Postgres — coordinator-scoped advisory locks ON.
    asserts.assertEquals(ct.Capabilities.advisoryLock, true);
    asserts.assertEquals(ct.Capabilities.inPlaceAlter, true);
    asserts.assertEquals(ct.Capabilities.referentialActions, true);
  });

  it('PlanetScaleEngine: Maria family, advisory locks AND FK enforcement OFF', () => {
    const ps = new PlanetScaleEngine('ps', MY);
    asserts.assertEquals(ps.Dialect, 'maria');
    asserts.assert(ps instanceof MariaEngine);
    asserts.assertEquals(ps.Engine, 'PLANETSCALE');
    asserts.assertEquals(ps.Capabilities.advisoryLock, false);
    asserts.assertEquals(ps.Capabilities.referentialActions, false);
  });
});
