/**
 * SQLite + `dbSchema` end-to-end.
 *
 * SQLite has no native schema object. `dbSchema` is folded into each
 * table's physical name as a `<dbSchema>_<name>` prefix (never a
 * separate ATTACHed file), so a FK crossing a `dbSchema` boundary lives
 * in the same physical database as everything else and is physically
 * enforced — no skip, no warning, unlike the old ATTACH-per-schema
 * emulation this replaces.
 */

import { afterAll, beforeAll, describe, it } from '@tundralibs/compat/test';
import * as asserts from '@std/asserts';
import { makeTempDir, readTextFile, removeDir } from '@tundralibs/compat/file';
import '@tundralibs/norm/engines/sqlite';
import { Column, Entity, Norm, Schema } from '../mod.ts';
import { Migrator } from './mod.ts';

const SECRET = 'sqlite-dbschema-secret-abcdef0123456789';

describe('norm.migrations — SQLite dbSchema is a physical name prefix', () => {
  let norm: Norm;
  let dbDir = '';
  let migDir = '';

  beforeAll(async () => {
    dbDir = await makeTempDir({ prefix: 'norm-dbschema-db-' });
    migDir = await makeTempDir({ prefix: 'norm-dbschema-mig-' });
    norm = new Norm({
      database: { dialect: 'sqlite', path: dbDir },
      secret: SECRET,
    });
  });
  afterAll(async () => {
    await norm.disconnect().catch(() => {});
    await removeDir(dbDir, { recursive: true }).catch(() => {});
    await removeDir(migDir, { recursive: true }).catch(() => {});
  });

  it('prefixes physical table names, enforces the cross-schema FK, and serves traffic', async () => {
    const Account = Entity('Account', {
      Id: Column.integer(),
      Email: Column.varchar(255),
      JobId: Column.integer().nullable(),
    }, {
      pk: ['Id'],
      dbSchema: 'UserGroup',
      // Crosses a dbSchema boundary — physically enforced now that
      // both tables live in the same file under prefixed names.
      fk: { Job: { model: 'Job', on: { JobId: 'Id' } } },
    });
    const Job = Entity('Job', {
      Id: Column.integer(),
      Label: Column.varchar(120),
    }, { pk: ['Id'], dbSchema: 'Bots' });

    const db = norm.use(Schema('MM', { Account, Job }));
    const mig = new Migrator(db, { dir: migDir, renderSql: true });

    await mig.snapshot();
    const plan = await readTextFile(`${migDir}/0001.sqlite.sql`);
    // No schema object is ever provisioned — no ATTACH, no CREATE SCHEMA.
    asserts.assertEquals(plan.includes('ATTACH'), false);
    asserts.assertEquals(plan.includes('CREATE SCHEMA'), false);
    // Physical names are prefixed …
    asserts.assertMatch(plan, /CREATE TABLE IF NOT EXISTS "UserGroup_Account"/);
    asserts.assertMatch(plan, /CREATE TABLE IF NOT EXISTS "Bots_Job"/);
    // … and the cross-schema FK is a real, physical REFERENCES clause.
    asserts.assertMatch(plan, /REFERENCES "Bots_Job"/);

    // Apply end-to-end: no skip, no warning.
    const r = await mig.apply();
    asserts.assertEquals(r.applied, [1]);
    asserts.assertEquals(r.warnings.length, 0);

    // The entity-level API is unaffected by the physical rename — norm
    // resolves `dbSchema` to the prefixed table under the hood.
    const job = await db.repo('Job').insert({ Id: 7, Label: 'nightly' });
    asserts.assertEquals(job.data[0]!.Label, 'nightly');
    const acc = await db.repo('Account').insert({
      Id: 1,
      Email: 'a@b.c',
      JobId: 7,
    });
    asserts.assertEquals(acc.data[0]!.Email, 'a@b.c');

    // The FK is physically enforced: a JobId with no matching Job row
    // is rejected, not silently accepted.
    await asserts.assertRejects(() =>
      db.repo('Account').insert({ Id: 2, Email: 'x@y.z', JobId: 999 })
    );
  });
});
