/**
 * Scoped upsert on a REAL engine (SQLite, offline).
 *
 * Round-3 folded the scope column into the ON CONFLICT target
 * unconditionally; the regression test for it asserted the emitted IR
 * against a mock executor, so it could not observe that Postgres/SQLite
 * REJECT an inference list matching no index — nor that MariaDB ignores
 * the target entirely. Everything here runs statements through a real
 * database: the SQL either works or it does not.
 *
 * @module
 */

import { afterAll, beforeAll, describe, it } from '@tundralibs/compat/test';
import * as asserts from '@std/asserts';
import { makeTempDir, removeDir } from '@tundralibs/compat/file';
import { SQLiteEngine } from '@tundralibs/drivers/sqlite';
import {
  Column,
  Entity,
  Norm,
  type NormDb,
  NormQueryError,
  Schema,
  use,
} from '../mod.ts';
import { Migrator } from '../migrations/mod.ts';

const SECRET = 'scoped-upsert-live-secret';

/** NO per-scope unique: a globally-unique business key plus the PK —
 * the ordinary shape a scoped upsert must keep working on. */
const Tickets = Entity('tickets', {
  id: Column.integer(),
  orgId: Column.integer(),
  extKey: Column.varchar(64),
  status: Column.varchar(20),
}, { pk: ['id'], unique: { extKey: ['extKey'] } });

/** The multi-tenant shape: UNIQUE (orgId, extKey). Here — and only
 * here — the scope may be folded into the conflict target. */
const Notes = Entity('notes', {
  id: Column.integer(),
  orgId: Column.integer(),
  extKey: Column.varchar(64),
  body: Column.varchar(200),
}, { pk: ['id'], unique: { orgExt: ['orgId', 'extKey'] } });

function registry() {
  return use(Schema('ScopeUpsert', { Tickets, Notes }));
}

describe('norm.scoped-upsert (live sqlite)', () => {
  let db: NormDb<ReturnType<typeof registry>>;
  let norm: Norm;
  let dbDir = '';
  let migDir = '';

  beforeAll(async () => {
    dbDir = await makeTempDir({ prefix: 'norm-scoped-upsert-db-' });
    migDir = await makeTempDir({ prefix: 'norm-scoped-upsert-mig-' });
    const engine = new SQLiteEngine('scoped-upsert', { path: dbDir });
    norm = new Norm({ engine: engine as never, secret: SECRET });
    db = norm.use(Schema('ScopeUpsert', { Tickets, Notes }));
    const mig = new Migrator(db, { dir: migDir });
    await mig.snapshot();
    await mig.apply();
    // Seed two tenants.
    await db.repo('Tickets').insert([
      { id: 1, orgId: 42, extKey: 'K-42', status: 'open' },
      { id: 9, orgId: 99, extKey: 'K-99', status: 'open' },
    ]);
  });

  afterAll(async () => {
    await norm.disconnect();
    await removeDir(dbDir, { recursive: true });
    await removeDir(migDir, { recursive: true });
  });

  it('a scoped upsert on the PRIMARY KEY still runs (regression: ON CONFLICT target the engine rejects)', async () => {
    // Round-3 emitted `ON CONFLICT ("orgId", "id")`; no such index
    // exists, so SQLite/Postgres refused the statement outright. The
    // everyday scoped upsert must reach the database and work. Note the
    // payload OMITS orgId — the scoped handle's type relaxes it (no
    // cast) and the runtime auto-fills it.
    const org42 = db.scope({ '@orgId': 42 });
    const r = await org42.repo('Tickets').upsert(
      { id: 1, extKey: 'K-42', status: 'closed' },
      { conflictKeys: ['id'] },
    );
    asserts.assertEquals(r.op, 'UPSERT');
    asserts.assertEquals(r.scoped, { '@orgId': 42 });
    const back = await db.repo('Tickets').getByPK({ id: 1 });
    asserts.assertEquals(back.data?.status, 'closed');
    asserts.assertEquals(back.data?.orgId, 42);

    // A globally-unique business key works the same way.
    const r2 = await org42.repo('Tickets').upsert(
      { id: 1, extKey: 'K-42', status: 'reopened' },
      { conflictKeys: ['extKey'] },
    );
    asserts.assertEquals(r2.op, 'UPSERT');
    asserts.assertEquals(
      (await db.repo('Tickets').getByPK({ id: 1 })).data?.status,
      'reopened',
    );
  });

  it('a scoped upsert cannot overwrite another scope via a global unique key', async () => {
    // The finding-1 security property: tenant 42 aims a conflict key at
    // tenant 99's row. Without a per-scope UNIQUE the ON CONFLICT target
    // cannot express the scope (and on MariaDB it never can), so the
    // guard is the pre-flight probe — which is dialect-independent.
    const org42 = db.scope({ '@orgId': 42 });
    await asserts.assertRejects(
      () =>
        org42.repo('Tickets').upsert(
          { id: 500, extKey: 'K-99', status: 'stolen' },
          { conflictKeys: ['extKey'] },
        ),
      NormQueryError,
      'OUTSIDE the active scope',
    );
    // Tenant 99's row is untouched, and nothing was inserted.
    const victim = await db.repo('Tickets').getByPK({ id: 9 });
    asserts.assertEquals(victim.data?.status, 'open');
    asserts.assertEquals(victim.data?.orgId, 99);
    asserts.assertEquals((await db.repo('Tickets').count()).count, 2);
  });

  it('a scoped upsert cannot overwrite another scope via a PK collision (the MariaDB any-unique-key hole)', async () => {
    // MariaDB's ON DUPLICATE KEY UPDATE matches on ANY unique key, not
    // the conflict target — so a payload PK belonging to another tenant
    // silently rewrites that tenant's row there. The probe covers every
    // DECLARED key the payload supplies, so the write is refused on all
    // four dialects, before any SQL runs.
    const org42 = db.scope({ '@orgId': 42 });
    await asserts.assertRejects(
      () =>
        org42.repo('Tickets').upsert(
          { id: 9, extKey: 'K-NEW', status: 'stolen' },
          { conflictKeys: ['extKey'] },
        ),
      NormQueryError,
      'OUTSIDE the active scope',
    );
    const victim = await db.repo('Tickets').getByPK({ id: 9 });
    asserts.assertEquals(victim.data?.extKey, 'K-99');
    asserts.assertEquals(victim.data?.status, 'open');
  });

  it('a declared per-scope UNIQUE folds the scope into the conflict target', async () => {
    // Notes declares UNIQUE (orgId, extKey), so the folded target names
    // a real index: the statement is legal AND the conflict can only
    // match inside the scope. Two tenants may hold the same extKey.
    const org42 = db.scope({ '@orgId': 42 });
    const org99 = db.scope({ '@orgId': 99 });
    await org42.repo('Notes').upsert(
      { id: 200, extKey: 'N-1', body: 'from 42' },
      { conflictKeys: ['extKey'] },
    );
    // Same business key, different scope: an INSERT, never a conflict.
    await org99.repo('Notes').upsert(
      { id: 201, extKey: 'N-1', body: 'from 99' },
      { conflictKeys: ['extKey'] },
    );
    asserts.assertEquals((await db.repo('Notes').count()).count, 2);
    // Re-upsert inside scope 42: updates ITS row, leaves 99 alone.
    await org42.repo('Notes').upsert(
      { id: 202, extKey: 'N-1', body: 'from 42 again' },
      { conflictKeys: ['extKey'] },
    );
    asserts.assertEquals((await db.repo('Notes').count()).count, 2);
    asserts.assertEquals(
      (await org42.repo('Notes').findOne({ '@extKey': 'N-1' })).data?.body,
      'from 42 again',
    );
    asserts.assertEquals(
      (await org99.repo('Notes').findOne({ '@extKey': 'N-1' })).data?.body,
      'from 99',
    );
  });

  it('an unscoped upsert is untouched: no probe, no fold', async () => {
    // The unscoped path must behave exactly as before — including the
    // cross-tenant overwrite that is legitimate without a scope.
    const r = await db.repo('Tickets').upsert(
      { id: 9, orgId: 99, extKey: 'K-99', status: 'closed-unscoped' },
      { conflictKeys: ['extKey'] },
    );
    asserts.assertEquals(r.scoped, undefined);
    asserts.assertEquals(
      (await db.repo('Tickets').getByPK({ id: 9 })).data?.status,
      'closed-unscoped',
    );
  });

  it('a scoped upsert that contradicts the scope is still rejected before any query', async () => {
    const org42 = db.scope({ '@orgId': 42 });
    await asserts.assertRejects(
      () =>
        org42.repo('Tickets').upsert(
          { id: 1, orgId: 99, extKey: 'K-42', status: 'x' },
          { conflictKeys: ['extKey'] },
        ),
      NormQueryError,
      'scope-bound',
    );
  });
});
