/**
 * SQLite + `dbSchema` end-to-end — the MarketMaker field report's F4.
 *
 * SQLite emulates schemas by ATTACHing one `<schema>.db` file per
 * `dbSchema` (translator `_buildCreateSchema` + the drivers engine's path
 * resolution). The report's failure was that no `CREATE_SCHEMA` action was
 * emitted to trigger the ATTACH — fixed by the F2 change (this branch's
 * base). This test proves the loop now closes: ATTACH is planned before the
 * qualified tables, apply succeeds, and the tables serve traffic.
 */

import { afterAll, beforeAll, describe, it } from '@tundralibs/compat/test';
import * as asserts from '@std/asserts';
import { makeTempDir, readTextFile, removeDir } from '@tundralibs/compat/file';
import { SQLiteEngine } from '@tundralibs/drivers';
import { Column, Entity, Norm, Schema } from '../mod.ts';
import { Migrator } from './mod.ts';

const SECRET = 'sqlite-dbschema-secret-abcdef0123456789';

describe('norm.migrations — SQLite dbSchema via ATTACH (field report F4)', () => {
  let engine: SQLiteEngine;
  let dbDir = '';
  let migDir = '';

  beforeAll(async () => {
    dbDir = await makeTempDir({ prefix: 'norm-dbschema-db-' });
    migDir = await makeTempDir({ prefix: 'norm-dbschema-mig-' });
    engine = new SQLiteEngine('dbschema-test', { path: dbDir });
  });
  afterAll(async () => {
    await engine.disconnect().catch(() => {});
    await removeDir(dbDir, { recursive: true }).catch(() => {});
    await removeDir(migDir, { recursive: true }).catch(() => {});
  });

  it('ATTACHes each dbSchema, applies its qualified tables, and serves traffic', async () => {
    const Account = Entity('Account', {
      Id: Column.integer(),
      Email: Column.varchar(255),
    }, { pk: ['Id'], dbSchema: 'UserGroup' });
    const Job = Entity('Job', {
      Id: Column.integer(),
      Label: Column.varchar(120),
    }, { pk: ['Id'], dbSchema: 'Bots' });

    const norm = new Norm({ engine: engine as never, secret: SECRET });
    const db = norm.use(Schema('MM', { Account, Job }));
    const mig = new Migrator(db, { dir: migDir, renderSql: true });

    await mig.snapshot();
    // The SQLite plan must ATTACH each dbSchema before its qualified tables.
    const plan = await readTextFile(`${migDir}/0001.sqlite.sql`);
    asserts.assertMatch(plan, /ATTACH DATABASE .* AS "UserGroup"/);
    asserts.assertMatch(plan, /ATTACH DATABASE .* AS "Bots"/);

    // Apply end-to-end: ATTACH runs, then the qualified CREATE TABLEs.
    const r = await mig.apply();
    asserts.assertEquals(r.applied, [1]);

    // The dbSchema-qualified tables serve real traffic.
    const acc = await db.repo('Account').insert({ Id: 1, Email: 'a@b.c' });
    asserts.assertEquals(acc.data[0]!.Email, 'a@b.c');
    const job = await db.repo('Job').insert({ Id: 7, Label: 'nightly' });
    asserts.assertEquals(job.data[0]!.Label, 'nightly');
  });
});
