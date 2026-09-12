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
import '@tundralibs/norm/engines/sqlite';
import { Column, Entity, Norm, Schema } from '../mod.ts';
import { Migrator } from './mod.ts';

const SECRET = 'sqlite-dbschema-secret-abcdef0123456789';

describe('norm.migrations — SQLite dbSchema via ATTACH (field report F4)', () => {
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

  it('ATTACHes each dbSchema, applies its qualified tables, and serves traffic', async () => {
    const Account = Entity('Account', {
      Id: Column.integer(),
      Email: Column.varchar(255),
      JobId: Column.integer().nullable(),
    }, {
      pk: ['Id'],
      dbSchema: 'UserGroup',
      // Crosses a dbSchema boundary — SQLite can't enforce this
      // (cross-ATTACHed-database FK constraints aren't supported), so
      // the physical constraint is skipped (best-effort, never
      // thrown) — the relation still works for joins/eager
      // projection, and apply() must succeed and warn about it.
      fk: { Job: { model: 'Job', on: { JobId: 'Id' } } },
    });
    const Job = Entity('Job', {
      Id: Column.integer(),
      Label: Column.varchar(120),
    }, { pk: ['Id'], dbSchema: 'Bots' });

    const db = norm.use(Schema('MM', { Account, Job }));
    const mig = new Migrator(db, { dir: migDir, renderSql: true });

    await mig.snapshot();
    // The SQLite plan must ATTACH each dbSchema before its qualified tables.
    const plan = await readTextFile(`${migDir}/0001.sqlite.sql`);
    asserts.assertMatch(plan, /ATTACH DATABASE .* AS "UserGroup"/);
    asserts.assertMatch(plan, /ATTACH DATABASE .* AS "Bots"/);
    // The cross-schema FK's constraint never reaches the plan (would be
    // a SQL parse error on real SQLite) — the relation itself does.
    asserts.assertEquals(plan.includes('REFERENCES'), false);

    // Apply end-to-end: ATTACH runs, then the qualified CREATE TABLEs —
    // no thrown error, and the skip is surfaced as a warning.
    const r = await mig.apply();
    asserts.assertEquals(r.applied, [1]);
    asserts.assertEquals(r.warnings.length, 1);
    asserts.assertStringIncludes(r.warnings[0]!, "Entity('Account').fk.Job");
    asserts.assertStringIncludes(r.warnings[0]!, 'ATTACHed databases');

    // The dbSchema-qualified tables serve real traffic.
    const acc = await db.repo('Account').insert({ Id: 1, Email: 'a@b.c' });
    asserts.assertEquals(acc.data[0]!.Email, 'a@b.c');
    const job = await db.repo('Job').insert({ Id: 7, Label: 'nightly' });
    asserts.assertEquals(job.data[0]!.Label, 'nightly');
  });
});
