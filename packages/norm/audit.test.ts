/**
 * Audit (versioned-replica) tables: definition-time validation (mutual
 * exclusion with `temporal`, name collisions, FK-target rejection) and
 * the generated replica's shape — exercised over Entity()/Schema()/
 * use() plus a live-SQLite smoke pass for the write-mirroring
 * mechanics. The full cross-dialect proof lives in
 * `tests/audit-live.test.ts`.
 */

import { describe, it } from '@tundralibs/compat/test';
import * as asserts from '@std/asserts';
import '@tundralibs/norm/engines/sqlite';
import { SQLiteEngine } from '@tundralibs/drivers/sqlite';
import {
  Column,
  Entity,
  Norm,
  NormDefinitionError,
  Schema,
  use,
} from './mod.ts';

describe('norm audit', () => {
  it('generates the replica: source columns + auditId pk + Effective From/To, no FKs', () => {
    const Users = Entity('users', {
      Id: Column.varchar(40).default(() => crypto.randomUUID()),
      Name: Column.varchar(30),
    }, { pk: ['Id'], audit: { name: 'UserAudit' } });

    const S = Schema('S', { Users });
    const audit = S.entities['UserAudit'] as {
      type: string;
      name: string;
      auditOf: string;
      primaryKeys: readonly string[];
      uniques: Record<string, readonly string[]>;
      foreignKeys?: unknown;
      columns: Record<string, unknown>;
    };
    asserts.assertExists(audit, 'UserAudit not injected into the schema');
    asserts.assertEquals(audit.type, 'AUDIT');
    asserts.assertEquals(audit.name, 'user_audit'); // snake_case of the registry name
    asserts.assertEquals(audit.auditOf, 'Users');
    asserts.assertEquals(audit.primaryKeys, ['auditId']);
    asserts.assertEquals(audit.foreignKeys, undefined);
    asserts.assertEquals(
      Object.keys(audit.uniques),
      ['users_audit_current'],
    );
    asserts.assertEquals(audit.uniques['users_audit_current'], [
      'Id',
      'EffectiveTo',
    ]);
    for (
      const col of ['Id', 'Name', 'auditId', 'EffectiveFrom', 'EffectiveTo']
    ) {
      asserts.assert(col in audit.columns, `missing column ${col}`);
    }
    asserts.assert(
      !('AsOf' in audit.columns),
      'AsOf must be virtual (not stored)',
    );
  });

  it('supports custom EffectiveFrom/To/AsOf column names', () => {
    const Users = Entity('users2', {
      Id: Column.varchar(40).default(() => crypto.randomUUID()),
    }, {
      pk: ['Id'],
      audit: {
        name: 'UserAudit2',
        EffectiveFromColumn: 'From',
        EffectiveToColumn: 'To',
        asOfColumn: 'At',
      },
    });
    const S = Schema('S2', { Users });
    const audit = S.entities['UserAudit2'] as {
      columns: Record<string, unknown>;
    };
    asserts.assert('From' in audit.columns);
    asserts.assert('To' in audit.columns);
    asserts.assert(!('EffectiveFrom' in audit.columns));
    asserts.assert(
      !('At' in audit.columns),
      'At (asOf) is virtual — never stored',
    );
  });

  it('rejects temporal + audit on the same entity', () => {
    asserts.assertThrows(
      () =>
        Entity('bad', {
          Id: Column.uuid().default({ $$_expression: 'UUID' }),
          Name: Column.varchar(30),
        }, {
          pk: ['Id'],
          temporal: { key: ['Name'] },
          audit: { name: 'BadAudit' },
        }),
      Error,
      'mutually exclusive',
    );
  });

  it('rejects an audit replica name colliding with another entity', () => {
    const A = Entity('a', {
      Id: Column.uuid().default({ $$_expression: 'UUID' }),
    }, { pk: ['Id'], audit: { name: 'B' } });
    const B = Entity('b', {
      Id: Column.uuid().default({ $$_expression: 'UUID' }),
    }, { pk: ['Id'] });
    asserts.assertThrows(() => Schema('S3', { A, B }), Error, 'collides');
  });

  it('rejects an audit column name collision with a declared column', () => {
    asserts.assertThrows(
      () =>
        Entity('bad2', {
          Id: Column.uuid().default({ $$_expression: 'UUID' }),
          EffectiveFrom: Column.timestamp(),
        }, { pk: ['Id'], audit: { name: 'Bad2Audit' } }),
      Error,
      'collides with a declared column',
    );
  });

  it('rejects an AuditPK builder with no default', () => {
    asserts.assertThrows(
      () =>
        Entity('bad3', {
          Id: Column.uuid().default({ $$_expression: 'UUID' }),
        }, {
          pk: ['Id'],
          audit: { name: 'Bad3Audit', AuditPK: Column.varchar(10) },
        }),
      Error,
      'must declare .default',
    );
  });

  it('rejects a foreign key targeting a generated AUDIT entity', () => {
    const Users = Entity('users4', {
      Id: Column.uuid().default({ $$_expression: 'UUID' }),
    }, { pk: ['Id'], audit: { name: 'UserAudit4' } });
    const Posts = Entity('posts4', {
      Id: Column.uuid().default({ $$_expression: 'UUID' }),
      AuthorAuditId: Column.varchar(26),
    }, {
      pk: ['Id'],
      fk: { Author: { model: 'UserAudit4', on: { AuthorAuditId: 'auditId' } } },
    });
    asserts.assertThrows(
      () => use(Schema('S4', { Users, Posts })),
      NormDefinitionError,
    );
  });

  it('the generated replica is read-only: no insert/update/delete/upsert/truncate', async () => {
    const Users = Entity('users5', {
      Id: Column.varchar(40).default(() => crypto.randomUUID()),
      Name: Column.varchar(30),
    }, { pk: ['Id'], audit: { name: 'UserAudit5' } });
    const engine = new SQLiteEngine('audit-readonly-test', {
      path: ':memory:',
    });
    await engine.connect();
    try {
      const norm = new Norm({ engine });
      const db = norm.use(Schema('S5', { Users }));
      const auditRepo = db.repo('UserAudit5');
      for (
        const method of ['insert', 'update', 'delete', 'upsert', 'truncate']
      ) {
        asserts.assertEquals(
          // deno-lint-ignore no-explicit-any
          typeof (auditRepo as any)[method],
          'undefined',
          `audit repo must not expose ${method}()`,
        );
      }
    } finally {
      await engine.disconnect();
    }
  });

  describe('live SQLite — write mirroring', () => {
    it('insert opens a version, update closes+opens, delete closes with no successor', async () => {
      const Users = Entity('usersL', {
        Id: Column.varchar(40).default(() => crypto.randomUUID()),
        Name: Column.varchar(30),
      }, { pk: ['Id'], audit: { name: 'UserAuditL' } });
      const engine = new SQLiteEngine('audit-live-sqlite', {
        path: ':memory:',
      });
      await engine.connect();
      try {
        const norm = new Norm({ engine });
        const db = norm.use(Schema('SL', { Users }));
        await db.raw(
          'CREATE TABLE usersl (Id TEXT PRIMARY KEY, Name TEXT NOT NULL)',
        );
        await db.raw(
          `CREATE TABLE user_audit_l (
            auditId TEXT PRIMARY KEY, Id TEXT NOT NULL, Name TEXT NOT NULL,
            EffectiveFrom TEXT NOT NULL, EffectiveTo TEXT NOT NULL,
            UNIQUE (Id, EffectiveTo))`,
        );
        const users = db.repo('Users');
        const audit = db.repo('UserAuditL');

        const ins = await users.insert({ Name: 'Alice' });
        const id = ins.data[0]!.Id;
        let trail = await audit.find({ '@Id': id });
        asserts.assertEquals(trail.count, 1);
        asserts.assertEquals(trail.data[0]!.Name, 'Alice');

        await users.update({ Name: 'Alicia' }, { '@Id': id });
        trail = await audit.find({ '@Id': id }, {
          orderBy: { '@EffectiveFrom': 'ASC' },
        });
        asserts.assertEquals(trail.count, 2);
        asserts.assertEquals(trail.data[0]!.Name, 'Alice');
        asserts.assertEquals(trail.data[1]!.Name, 'Alicia');
        asserts.assertEquals(
          trail.data[0]!.EffectiveTo,
          trail.data[1]!.EffectiveFrom,
        );

        await users.delete({ '@Id': id });
        trail = await audit.find({ '@Id': id }, {
          orderBy: { '@EffectiveFrom': 'ASC' },
        });
        asserts.assertEquals(trail.count, 2, 'delete never removes audit rows');
        const current = await audit.find({
          '@Id': id,
          '@EffectiveTo': new Date('2099-12-31T23:59:59.999Z'),
        });
        asserts.assertEquals(
          current.count,
          0,
          'no version should be current after delete',
        );
      } finally {
        await engine.disconnect();
      }
    });
  });
});
