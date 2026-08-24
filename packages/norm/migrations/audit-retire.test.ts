/**
 * Audit-replica column drops — `diffSnapshots` never drops a column
 * from an entity carrying `auditOf`; it retires it (`_<col>_`, relaxed
 * to nullable if it was `NOT NULL`) instead, reusing the existing
 * rename/rebuild machinery. Pure emission tests — no live database —
 * mirroring `ddl-ordering.test.ts`'s style. The live, DB-backed proof
 * (data actually survives, a post-retirement write actually succeeds,
 * a source-only FK/unique never reaches the replica) lives in
 * `tests/audit-live.test.ts`.
 */

import { describe, it } from '@tundralibs/compat/test';
import * as asserts from '@std/asserts';
import { diffSnapshots, type MigrationSnapshot } from './mod.ts';
import type { SnapEntity } from './mod.ts';
import type { RebuildTable } from './rebuild.ts';

const GEN = '2026-08-24T00:00:00.000Z';

function snap(entities: Record<string, SnapEntity>): MigrationSnapshot {
  return { format: 1, generatedAt: GEN, hash: 'test', entities };
}

const usersV1: SnapEntity = {
  kind: 'TABLE',
  name: 'users',
  columns: {
    Id: { type: 'VARCHAR', length: 40 },
    Name: { type: 'VARCHAR', length: 30 },
    LegacyNote: { type: 'VARCHAR', length: 100 }, // NOT NULL (no `nullable`)
    OptionalTag: { type: 'VARCHAR', length: 20, nullable: true },
  },
  primaryKeys: ['Id'],
};

const auditV1: SnapEntity = {
  kind: 'TABLE',
  name: 'user_audit',
  auditOf: 'Users',
  columns: {
    auditId: { type: 'VARCHAR', length: 26 },
    Id: { type: 'VARCHAR', length: 40 },
    Name: { type: 'VARCHAR', length: 30 },
    LegacyNote: { type: 'VARCHAR', length: 100 },
    OptionalTag: { type: 'VARCHAR', length: 20, nullable: true },
    EffectiveFrom: { type: 'DATETIME' },
    EffectiveTo: { type: 'DATETIME' },
  },
  primaryKeys: ['auditId'],
  uniques: { users_audit_current: ['Id', 'EffectiveTo'] },
};

// v2: both LegacyNote and OptionalTag removed from BOTH entities (as
// buildAudit() would produce — it always mirrors the source's CURRENT
// columns).
const usersV2: SnapEntity = {
  ...usersV1,
  columns: { Id: usersV1.columns.Id!, Name: usersV1.columns.Name! },
};
const auditV2: SnapEntity = {
  ...auditV1,
  columns: {
    auditId: auditV1.columns.auditId!,
    Id: auditV1.columns.Id!,
    Name: auditV1.columns.Name!,
    EffectiveFrom: auditV1.columns.EffectiveFrom!,
    EffectiveTo: auditV1.columns.EffectiveTo!,
  },
};

describe('norm.migrations audit-replica column retirement', () => {
  it('retires (renames + relaxes) instead of dropping; the SOURCE column still blocks', () => {
    const prev = snap({ Users: usersV1, UserAudit: auditV1 });
    const curr = snap({ Users: usersV2, UserAudit: auditV2 });
    const { actions, blockedDrops, warnings } = diffSnapshots(prev, curr);

    // The source's OWN drop is still blocked by default — unchanged.
    asserts.assertEquals(blockedDrops, [
      'Users.LegacyNote',
      'Users.OptionalTag',
    ]);
    // The replica's columns are NEVER in blockedDrops.
    asserts.assert(!blockedDrops.some((b) => b.startsWith('UserAudit.')));

    // Both retirements warned about.
    asserts.assertEquals(warnings.length, 2);
    asserts.assert(warnings[0]!.includes('UserAudit.LegacyNote'));
    asserts.assert(warnings[0]!.includes('_LegacyNote_'));
    asserts.assert(warnings[1]!.includes('UserAudit.OptionalTag'));

    // The replica rebuilds (SQLite-style ALTER-in-place isn't assumed
    // here; inPlaceAlter defaults true, but a synthetic nullable-relax
    // still needs SOME physical action) — find its action and check
    // the rename pairing lands on the frozen names.
    const auditAction = actions.find((a) =>
      'kind' in a ? a.entityKey === 'UserAudit' : (
        'table' in a && a.table === 'user_audit'
      )
    );
    asserts.assertExists(auditAction, 'expected an action touching user_audit');
    if ('kind' in auditAction! && auditAction.kind === 'REBUILD_TABLE') {
      const pairs = Object.fromEntries((auditAction as RebuildTable).pairs);
      asserts.assertEquals(pairs['_LegacyNote_'], 'LegacyNote');
      asserts.assertEquals(pairs['_OptionalTag_'], 'OptionalTag');
      // The frozen LegacyNote copy is nullable in the REBUILT target —
      // read it back off the `to` snapshot the rebuild carries.
      const to = (auditAction as RebuildTable).to;
      asserts.assertEquals(to.columns['_LegacyNote_']?.nullable, true);
    } else if ('renameColumns' in auditAction!) {
      asserts.assertEquals(
        auditAction.renameColumns?.['LegacyNote'],
        '_LegacyNote_',
      );
      asserts.assertEquals(
        auditAction.renameColumns?.['OptionalTag'],
        '_OptionalTag_',
      );
    } else {
      throw new Error(
        `unexpected action shape: ${JSON.stringify(auditAction)}`,
      );
    }
  });

  it('an ordinary TABLE (no auditOf) still drops normally — no retirement leak', () => {
    const prev = snap({ Users: usersV1 });
    const curr = snap({ Users: usersV2 });
    const { blockedDrops } = diffSnapshots(prev, curr);
    asserts.assertEquals(blockedDrops, [
      'Users.LegacyNote',
      'Users.OptionalTag',
    ]);
  });

  it('a name retired twice falls back to an ordinary (blocked) drop — no collision', () => {
    // v2: LegacyNote retired (as above). v3: a NEW LegacyNote column is
    // added back (fresh mirror), THEN removed again in v4 — the second
    // retirement would collide with the still-frozen `_LegacyNote_`
    // from v2, so it must fall back to a normal drop instead.
    const v2Audit: SnapEntity = {
      ...auditV2,
      columns: {
        ...auditV2.columns,
        _LegacyNote_: { type: 'VARCHAR', length: 100, nullable: true },
      },
    };
    const v3Users: SnapEntity = {
      ...usersV2,
      columns: {
        ...usersV2.columns,
        LegacyNote: { type: 'VARCHAR', length: 100, nullable: true },
      },
    };
    const v3Audit: SnapEntity = {
      ...v2Audit,
      columns: {
        ...v2Audit.columns,
        LegacyNote: { type: 'VARCHAR', length: 100, nullable: true },
      },
    };
    const v4Users: SnapEntity = { ...usersV2 }; // LegacyNote removed again
    const v4Audit: SnapEntity = { ...v2Audit }; // matches v3Audit minus LegacyNote

    const { blockedDrops, warnings } = diffSnapshots(
      snap({ Users: v3Users, UserAudit: v3Audit }),
      snap({ Users: v4Users, UserAudit: v4Audit }),
    );
    // The SOURCE drop still blocks as always.
    asserts.assert(blockedDrops.includes('Users.LegacyNote'));
    // The REPLICA's second LegacyNote collides with the frozen name
    // from the FIRST retirement — falls back to an ordinary drop,
    // which is ALSO blocked by default (never silently discarded).
    asserts.assert(
      blockedDrops.includes('UserAudit.LegacyNote'),
      `expected the second retirement to fall back to a blocked drop, got ${
        JSON.stringify(blockedDrops)
      }`,
    );
    asserts.assert(!warnings.some((w) => w.includes('UserAudit.LegacyNote')));
  });
});
