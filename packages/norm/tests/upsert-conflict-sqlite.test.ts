/**
 * Upsert conflict semantics on a REAL engine (SQLite, offline): what a
 * conflict writes, what it leaves alone, and what it refuses.
 *
 * @module
 */

import { afterAll, beforeAll, describe, it } from '@tundralibs/compat/test';
import * as asserts from '@std/asserts';
import { makeTempDir, removeDir } from '@tundralibs/compat/file';
import '@tundralibs/norm/engines/sqlite';
import {
  Column,
  Entity,
  Norm,
  type NormDb,
  NormQueryError,
  NormValidationError,
  Schema,
  type UpdateOf,
  use,
} from '../mod.ts';
import { Migrator } from '../migrations/mod.ts';

const Links = Entity('links', {
  Id: Column.varchar(40).default(() => crypto.randomUUID()),
  Grp: Column.varchar(10),
  Key: Column.varchar(10),
  Target: Column.varchar(100),
  Status: Column.varchar(10).default('ACTIVE'),
  Clicks: Column.integer().default(0),
  CreatedBy: Column.varchar(20).insertOnly(),
  CreatedOn: Column.timestamptz().default({ $$_expression: 'NOW' }),
  UpdatedOn: Column.timestamptz().nullable()
    .defaultOnUpdate({ $$_expression: 'NOW' }),
}, {
  pk: ['Id'],
  unique: { grpKey: ['Grp', 'Key'] },
  audit: { name: 'LinkAudit' },
});

const Hooked = Entity('hooked', {
  Id: Column.integer(),
  Name: Column.varchar(40),
}, {
  pk: ['Id'],
  hooks: { beforeUpdate: (row) => ({ ...row, Name: row.Name?.toUpperCase() }) },
});

const Contacts = Entity('contacts', {
  Id: Column.integer(),
  Email: Column.varchar(255).encrypt().hash(),
}, { pk: ['Id'] });

function registry() {
  return use(Schema('UpsertConflict', { Links, Hooked, Contacts }));
}

describe('norm.upsert conflict semantics (live sqlite)', () => {
  let db: NormDb<ReturnType<typeof registry>>;
  let norm: Norm;
  let dbDir = '';
  let migDir = '';
  const conflictKeys = ['Grp', 'Key'] as const;

  beforeAll(async () => {
    dbDir = await makeTempDir({ prefix: 'norm-upsert-conflict-db-' });
    migDir = await makeTempDir({ prefix: 'norm-upsert-conflict-mig-' });
    norm = new Norm({
      database: { dialect: 'sqlite', path: dbDir },
      secret: 'upsert-conflict-live-secret',
    });
    db = norm.use(Schema('UpsertConflict', { Links, Hooked, Contacts }));
    await norm.connect();
    const mig = new Migrator(db, { dir: migDir });
    await mig.snapshot();
    await mig.apply();
  });

  afterAll(async () => {
    await norm.disconnect();
    await removeDir(dbDir, { recursive: true });
    await removeDir(migDir, { recursive: true });
  });

  const links = () => db.repo('Links');

  it('a conflict keeps the key, insert defaults and insert-only columns', async () => {
    const first = await links().upsert(
      { Grp: 'g', Key: 'a', Target: 't1', CreatedBy: 'ada' },
      { conflictKeys },
    );
    const row = first.data[0]!;
    asserts.assertEquals(row.UpdatedOn, null, 'an insert is not an update');
    await db.raw(
      `UPDATE links SET Status = 'ARCHIVED', CreatedOn = '2020-01-01T00:00:00.000Z'`,
    );
    const second = await links().upsert(
      { Grp: 'g', Key: 'a', Target: 't2', CreatedBy: 'bob' },
      { conflictKeys },
    );
    const after = second.data[0]!;
    asserts.assertEquals(after.Id, row.Id, 'the primary key must not change');
    asserts.assertEquals(after.Target, 't2');
    asserts.assertEquals(after.Status, 'ARCHIVED');
    asserts.assertEquals(after.CreatedBy, 'ada');
    asserts.assertEquals(
      after.CreatedOn.toISOString(),
      '2020-01-01T00:00:00.000Z',
    );
    asserts.assertInstanceOf(after.UpdatedOn, Date, 'defaultOnUpdate applies');
    asserts.assertEquals(second.count, 1);
  });

  it('a client-minted primary key is never rewritten on conflict', async () => {
    const first = await links().upsert(
      { Id: 'mint-1', Grp: 'm', Key: 'a', Target: 't', CreatedBy: 'ada' },
      { conflictKeys },
    );
    const again = await links().upsert(
      { Id: 'mint-2', Grp: 'm', Key: 'a', Target: 't2', CreatedBy: 'ada' },
      { conflictKeys },
    );
    asserts.assertEquals(first.data[0]!.Id, 'mint-1');
    asserts.assertEquals(again.data[0]!.Id, 'mint-1');
    asserts.assertEquals(again.data[0]!.Target, 't2');
  });

  it("a caller's own value beats defaultOnUpdate", async () => {
    const at = new Date('2024-05-06T07:08:09.000Z');
    await links().upsert(
      { Grp: 'u', Key: 'a', Target: 't', CreatedBy: 'ada' },
      { conflictKeys },
    );
    const r = await links().upsert(
      { Grp: 'u', Key: 'a', Target: 't', CreatedBy: 'ada', UpdatedOn: at },
      { conflictKeys },
    );
    asserts.assertEquals(r.data[0]!.UpdatedOn?.toISOString(), at.toISOString());
  });

  it('update() rejects an insert-only column', async () => {
    // @ts-expect-error: an insert-only column is not part of UpdateOf.
    const typed: UpdateOf<typeof Links> = { CreatedBy: 'eve' };
    asserts.assertExists(typed);
    await asserts.assertRejects(
      () => links().update({ CreatedBy: 'eve' } as never, { '@Key': 'a' }),
      NormValidationError,
    );
  });

  it('a conflict with nothing to update leaves the row alone and returns it', async () => {
    await links().upsert(
      { Grp: 'g', Key: 'n', Target: 'kept', CreatedBy: 'ada' },
      { conflictKeys },
    );
    const again = await links().upsert(
      { Grp: 'g', Key: 'n', Target: 'ignored', CreatedBy: 'bob' },
      { conflictKeys, updateOnConflict: [] },
    );
    asserts.assertEquals(again.count, 0, 'nothing was written');
    asserts.assertEquals(again.data[0]!.Target, 'kept');
    asserts.assertEquals(again.data[0]!.UpdatedOn, null, 'no touch');
  });

  it('an update payload replaces the copy: a counter increments', async () => {
    let n = 0;
    const hit = () =>
      links().upsert(
        { Grp: 'g', Key: 'c', Target: `t${++n}`, CreatedBy: 'ada', Clicks: 1 },
        {
          conflictKeys,
          update: {
            Clicks: { $$_expression: 'ADD', args: ['@Clicks', 1] },
          } as never,
        },
      );
    await hit();
    await hit();
    const third = await hit();
    asserts.assertEquals(third.data[0]!.Clicks, 3);
    asserts.assertEquals(third.data[0]!.Target, 't1', 'not copied');
    asserts.assertInstanceOf(third.data[0]!.UpdatedOn, Date);
  });

  it('refuses a mixed batch, a key or insert-only column on conflict', async () => {
    const batch = await asserts.assertRejects(
      () =>
        links().upsert([
          { Grp: 'g', Key: 'x', Target: 't', CreatedBy: 'a' },
          { Grp: 'g', Key: 'y', CreatedBy: 'a' } as never,
        ], { conflictKeys }),
      NormQueryError,
    );
    asserts.assertEquals(batch.context.code, 'UPSERT_BATCH_SHAPE');
    for (
      const opts of [
        { conflictKeys, updateOnConflict: ['Id' as const] },
        { conflictKeys, updateOnConflict: ['CreatedBy' as const] },
        { conflictKeys, update: { Id: 'z' } as never },
      ]
    ) {
      await asserts.assertRejects(
        () =>
          links().upsert(
            { Grp: 'g', Key: 'a', Target: 't', CreatedBy: 'a' },
            opts,
          ),
        NormQueryError,
        'cannot be updated on conflict',
      );
    }
  });

  it('a beforeUpdate hook runs on an update payload and blocks a copy', async () => {
    const hooked = db.repo('Hooked');
    await hooked.insert({ Id: 1, Name: 'ada' });
    await asserts.assertRejects(
      () => hooked.upsert({ Id: 1, Name: 'bob' }, { conflictKeys: ['Id'] }),
      NormQueryError,
      'beforeUpdate hook cannot run',
    );
    const r = await hooked.upsert({ Id: 1, Name: 'bob' }, {
      conflictKeys: ['Id'],
      update: { Name: 'cy' },
    });
    asserts.assertEquals(r.data[0]!.Name, 'CY');
  });

  it('a copied encrypted column moves its digest with it', async () => {
    const contacts = db.repo('Contacts');
    await contacts.upsert({ Id: 1, Email: 'old@x.dev' }, {
      conflictKeys: ['Id'],
    });
    await contacts.upsert({ Id: 1, Email: 'new@x.dev' }, {
      conflictKeys: ['Id'],
    });
    asserts.assertEquals(
      (await contacts.findOne({ '@Email': 'new@x.dev' })).data?.Id,
      1,
    );
    asserts.assertEquals(
      (await contacts.findOne({ '@Email': 'old@x.dev' })).data,
      null,
    );
  });

  it('audits real writes only: a conflict left alone adds no version', async () => {
    const audit = db.repo('LinkAudit');
    const inserted = await links().upsert(
      { Grp: 'h', Key: 'a', Target: 't', CreatedBy: 'ada' },
      { conflictKeys },
    );
    const id = inserted.data[0]!.Id;
    const versions = async () => (await audit.find({ '@Id': id })).count;
    asserts.assertEquals(await versions(), 1);
    await links().upsert(
      { Grp: 'h', Key: 'a', Target: 'x', CreatedBy: 'ada' },
      { conflictKeys, updateOnConflict: [] },
    );
    asserts.assertEquals(await versions(), 1, 'no change, no version');
    await links().upsert(
      { Grp: 'h', Key: 'a', Target: 'y', CreatedBy: 'ada' },
      { conflictKeys },
    );
    asserts.assertEquals(await versions(), 2);
  });
});
