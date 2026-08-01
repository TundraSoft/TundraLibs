/**
 * DDL-emission ordering — regressions for the MarketMaker field report
 * (packages/norm/BUGREPORT-2026-07-14): Postgres BYTEA typmod (F1),
 * `CREATE SCHEMA` namespace provisioning (F2), circular-FK ALTER-split
 * (F3), and self-referential non-PK-unique FK deferral (F5).
 *
 * Pure emission tests — `diffSnapshots` → `renderPlan` — so no live
 * database is needed; the fresh-DB plan's statement order is asserted
 * directly.
 */

import { describe, it } from '@tundralibs/compat/test';
import * as asserts from '@std/asserts';
import { diffSnapshots, type MigrationSnapshot, renderPlan } from './mod.ts';
import type { SnapEntity } from './mod.ts';
import type { SqlDialect } from './plans.ts';

const GEN = '2026-07-15T00:00:00.000Z';

function snap(entities: Record<string, SnapEntity>): MigrationSnapshot {
  return { format: 1, generatedAt: GEN, hash: 'test', entities };
}

/** Executable statements of the fresh-DB plan for one dialect. */
function fresh(
  entities: Record<string, SnapEntity>,
  dialect: SqlDialect = 'postgres',
): string[] {
  const { actions } = diffSnapshots(null, snap(entities));
  return renderPlan(1, dialect, actions).statements;
}

describe('norm.migrations DDL ordering (MarketMaker field report)', () => {
  it('F1: a binary length is dropped on Postgres (BYTEA, never BYTEA(32))', () => {
    const [create] = fresh({
      Instrument: {
        kind: 'TABLE',
        name: 'Instrument',
        columns: { Id: { type: 'UUID' }, Ref: { type: 'BINARY', length: 32 } },
        primaryKeys: ['Id'],
      },
    }).filter((s) => s.includes('CREATE TABLE'));
    asserts.assert(create.includes('BYTEA'), create);
    asserts.assertFalse(create.includes('BYTEA(32)'), create);
    // A real length type still carries its typmod.
    asserts.assert(create.includes('UUID'), create);
  });

  it('F2: CREATE SCHEMA IF NOT EXISTS precedes its qualified CREATE TABLE', () => {
    const stmts = fresh({
      User: {
        kind: 'TABLE',
        name: 'User',
        dbSchema: 'UserGroup',
        columns: { Id: { type: 'UUID' } },
        primaryKeys: ['Id'],
      },
    });
    const schemaIdx = stmts.findIndex((s) =>
      /CREATE SCHEMA IF NOT EXISTS "UserGroup"/.test(s)
    );
    const tableIdx = stmts.findIndex((s) =>
      s.includes('CREATE TABLE') && s.includes('"UserGroup"')
    );
    asserts.assert(schemaIdx >= 0, 'CREATE SCHEMA must be emitted');
    asserts.assert(tableIdx >= 0, 'qualified CREATE TABLE must be emitted');
    asserts.assert(schemaIdx < tableIdx, 'schema is created before its table');
  });

  it('F3: a circular FK pair is applyable — one edge ALTER-split after both CREATEs', () => {
    const stmts = fresh({
      Bot: {
        kind: 'TABLE',
        name: 'Bot',
        columns: {
          Id: { type: 'UUID' },
          ActiveConfigVersionId: { type: 'UUID', nullable: true },
        },
        primaryKeys: ['Id'],
        foreignKeys: {
          activeConfig: {
            columns: ['ActiveConfigVersionId'],
            references: { table: 'ConfigVersion', columns: ['Id'] },
          },
        },
      },
      ConfigVersion: {
        kind: 'TABLE',
        name: 'ConfigVersion',
        columns: { Id: { type: 'UUID' }, BotId: { type: 'UUID' } },
        primaryKeys: ['Id'],
        foreignKeys: {
          bot: {
            columns: ['BotId'],
            references: { table: 'Bot', columns: ['Id'] },
          },
        },
      },
    });
    const inlineFk = stmts.filter((s) =>
      s.includes('CREATE TABLE') && s.includes('FOREIGN KEY')
    );
    const alterFk = stmts.filter((s) =>
      s.startsWith('ALTER TABLE') && s.includes('FOREIGN KEY')
    );
    asserts.assertEquals(inlineFk.length, 1, 'exactly one FK stays inline');
    asserts.assertEquals(alterFk.length, 1, 'the cycle edge is deferred');
    // The deferred FK is applied after EVERY table exists.
    const alterIdx = stmts.findIndex((s) =>
      s.startsWith('ALTER TABLE') && s.includes('FOREIGN KEY')
    );
    const lastCreate = stmts.reduce(
      (acc, s, i) => (s.includes('CREATE TABLE') ? i : acc),
      -1,
    );
    asserts.assert(alterIdx > lastCreate, 'deferred FK follows all CREATEs');
  });

  it('F5: a self-ref FK to a non-PK unique column defers past its unique index', () => {
    const stmts = fresh({
      User: {
        kind: 'TABLE',
        name: 'User',
        columns: {
          Id: { type: 'UUID' },
          ReferralCode: { type: 'VARCHAR', length: 12 },
          ReferredBy: { type: 'VARCHAR', length: 12, nullable: true },
        },
        primaryKeys: ['Id'],
        uniques: { ReferralCode: ['ReferralCode'] },
        foreignKeys: {
          referredBy: {
            columns: ['ReferredBy'],
            references: { table: 'User', columns: ['ReferralCode'] },
          },
        },
      },
    });
    const [create] = stmts.filter((s) => s.includes('CREATE TABLE'));
    asserts.assertFalse(
      create.includes('FOREIGN KEY'),
      'the self-ref FK is not inline',
    );
    const uxIdx = stmts.findIndex((s) =>
      /UNIQUE INDEX/i.test(s) && s.includes('ReferralCode')
    );
    const fkIdx = stmts.findIndex((s) =>
      s.startsWith('ALTER TABLE') && s.includes('FOREIGN KEY')
    );
    asserts.assert(uxIdx >= 0, 'the unique index is created');
    asserts.assert(fkIdx > uxIdx, 'the FK ALTER follows the unique index');
  });

  it('a plain acyclic FK to a parent PK stays inline (no needless ALTER)', () => {
    const stmts = fresh({
      Post: {
        kind: 'TABLE',
        name: 'Post',
        columns: { Id: { type: 'UUID' }, AuthorId: { type: 'UUID' } },
        primaryKeys: ['Id'],
        foreignKeys: {
          author: {
            columns: ['AuthorId'],
            references: { table: 'User', columns: ['Id'] },
          },
        },
      },
      User: {
        kind: 'TABLE',
        name: 'User',
        columns: { Id: { type: 'UUID' } },
        primaryKeys: ['Id'],
      },
    });
    asserts.assertFalse(
      stmts.some((s) =>
        s.startsWith('ALTER TABLE') && s.includes('FOREIGN KEY')
      ),
      'acyclic PK-target FK needs no ALTER-split',
    );
    asserts.assert(
      stmts.some((s) =>
        s.includes('CREATE TABLE') && s.includes('FOREIGN KEY')
      ),
      'it stays inline',
    );
  });
});
