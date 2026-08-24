/**
 * Audit-replica column retirement against a REAL SQLite database.
 * `migrations/audit-retire.test.ts` proves the pure diff logic
 * (dialect-independent); this proves the generated DDL actually
 * EXECUTES — SQLite takes the REBUILD path (it can't ALTER a column's
 * nullability in place) — and that historical data genuinely survives
 * a source column drop, and a write immediately after doesn't fail a
 * stale NOT NULL constraint.
 *
 * SQLite only, deliberately: `_norm_migrations` is GLOBAL to whatever
 * database a Migrator connects to, and Postgres/MariaDB here are the
 * shared dev instances (not per-run isolated the way SQLite's
 * `:memory:` is) — matching `migrations/migrations.test.ts`'s own
 * choice to test the Migrator exclusively against SQLite for the same
 * reason. A version that reset `_norm_migrations`/
 * `_norm_migration_progress` on Postgres/MariaDB before each run was
 * tried and works fine in isolation, but a genuine, reproducible
 * `TABLE_NOT_FOUND` on `_norm_migration_progress` surfaced running the
 * FULL suite under `node --test` (which parallelizes test files by
 * default) — a live concurrent apply() on one file's Maria fixture
 * racing another file's bootstrap DROP TABLE. Wiping global migration
 * state on a resource other tests may be using concurrently is exactly
 * the kind of shared-state risk this repo's tools avoid; it isn't
 * worth it for a scenario the dialect-independent diff logic (above)
 * and the DDL-execution proof (below, on an isolated engine) already
 * cover between them.
 *
 * Postgres and MariaDB WERE manually live-verified (`allowDrop: true`
 * applying an ALTER — not a rebuild — cleanly, historical data
 * surviving, a post-retirement write succeeding) during development;
 * that proof just isn't kept as a standing automated test against the
 * shared instance. Re-verify by hand against a real Postgres/MariaDB
 * if this diff logic changes.
 *
 * @module
 */

import { describe, it } from '@tundralibs/compat/test';
import * as asserts from '@std/asserts';
import { makeTempDir, removeDir } from '@tundralibs/compat/file';
import { SQLiteEngine } from '@tundralibs/drivers/sqlite';
import { Column, Entity, Norm, Schema } from '../mod.ts';
import { Migrator } from '../migrations/mod.ts';

describe('norm audit — drop-column retirement live sqlite', () => {
  it('a dropped NOT NULL source column is retired, not lost, and writes keep working', async () => {
    const engine = new SQLiteEngine('tmp-audit-drop-sqlite', {
      path: ':memory:',
    });
    await engine.connect();
    const migDir = await makeTempDir({ prefix: 'norm-audit-drop-sqlite-' });
    try {
      const UsersV1 = Entity('adrop_users', {
        Id: Column.varchar(40).default(() => crypto.randomUUID()),
        Name: Column.varchar(30),
        LegacyNote: Column.varchar(100), // NOT NULL
      }, { pk: ['Id'], audit: { name: 'AdropUserAudit' } });

      const norm1 = new Norm({ engine: engine as never });
      const db1 = norm1.use(Schema('App', { Users: UsersV1 }));
      const mig1 = new Migrator(db1, { dir: migDir });
      await mig1.snapshot();
      await mig1.apply();

      const ins = await db1.repo('Users').insert({
        Name: 'Alice',
        LegacyNote: 'irreplaceable historical note',
      });
      const id = ins.data[0]!.Id;

      // v2: LegacyNote removed from the source.
      const UsersV2 = Entity('adrop_users', {
        Id: Column.varchar(40).default(() => crypto.randomUUID()),
        Name: Column.varchar(30),
      }, { pk: ['Id'], audit: { name: 'AdropUserAudit' } });

      const norm2 = new Norm({ engine: engine as never });
      const db2 = norm2.use(Schema('App', { Users: UsersV2 }));
      const mig2 = new Migrator(db2, { dir: migDir });
      await mig2.snapshot();
      const plan = await mig2.plan();
      asserts.assertEquals(plan[0]!.blockedDrops, ['Users.LegacyNote']);
      await mig2.apply({ allowDrop: true });

      // The historical value survives — physically — at the DB level.
      const raw = await db2.raw<{ _LegacyNote_: string | null }>(
        'SELECT "_LegacyNote_" FROM adrop_user_audit WHERE "Id" = :id:',
        { id },
      );
      asserts.assertEquals(
        raw.data[0]?._LegacyNote_,
        'irreplaceable historical note',
        'retired column should survive the drop',
      );

      // The critical check: a write AFTER the drop must not fail a
      // stale NOT NULL on the retired column.
      await db2.repo('Users').update({ Name: 'Alicia' }, { '@Id': id });
      const rawAfter = await db2.raw<
        { _LegacyNote_: string | null; Name: string }
      >(
        'SELECT "_LegacyNote_", "Name" FROM adrop_user_audit WHERE "Id" = :id: ' +
          'ORDER BY "EffectiveFrom" DESC LIMIT 1',
        { id },
      );
      asserts.assertEquals(rawAfter.data[0]?.Name, 'Alicia');
      asserts.assertEquals(
        rawAfter.data[0]?._LegacyNote_,
        null,
        'the new version has nothing to mirror for the retired column',
      );
    } finally {
      await engine.disconnect();
      await removeDir(migDir, { recursive: true });
    }
  });
});
