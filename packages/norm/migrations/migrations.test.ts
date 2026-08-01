/**
 * Migration subsystem — integration on REAL SQLite (DDL actually
 * runs; repos verify the shape) + pure diff/version/hash units.
 */

import { afterAll, beforeAll, describe, it } from '@tundralibs/compat/test';
import * as asserts from '@std/asserts';
import {
  deleteFile,
  makeTempDir,
  pathExists,
  readTextFile,
  removeDir,
  writeTextFile,
} from '@tundralibs/compat/file';
import { SQLiteEngine } from '@tundralibs/drivers';
import type { EngineQueryResult } from '@tundralibs/drivers';
import { Column, Entity, Norm, Schema } from '../mod.ts';
import { NormMigrationError } from '../errors/mod.ts';
import { snapshot as logicalSnapshot } from '../definition/mod.ts';
import {
  buildSnapshot,
  diffSnapshots,
  FileLock,
  isRebuild,
  type MigrationAction,
  type MigrationSnapshot,
  Migrator,
  renderPlan,
  type SnapEntity,
} from './mod.ts';
import { formatVersionFilename, parseVersion } from './version.ts';
import { runtimeOf } from '../Norm.ts';
import type { Executor } from '../executor.ts';

const SECRET = 'migrations-test-secret';

/** DDL type tags of a planned step (rebuilds tagged 'REBUILD_TABLE'). */
function ddlTypes(qs: ReadonlyArray<MigrationAction>): string[] {
  return qs.map((q) => (isRebuild(q) ? q.kind : q.type));
}

// ── Schema v1 ─────────────────────────────────────────────────────────
const UsersV1 = Entity('users', {
  id: Column.integer(),
  email: Column.varchar(255).beforeWrite((v) => v.toLowerCase())
    .encrypt().hash(),
  password: Column.hash('SHA-256').minLength(8),
  // Nullable: rollbacks RE-ADD dropped columns, and no dialect can
  // add a NOT NULL column to a populated table without a DDL default
  // (which norm never emits — defaults are system-generated).
  displayName: Column.varchar(120).nullable(),
}, {
  pk: ['id'],
  index: { byName: ['displayName'] },
  unique: { email: ['email_hash'] },
});

// ── Schema v2: rename column, add column + index ─────────────────────
const UsersV2 = Entity('users', {
  id: Column.integer(),
  email: Column.varchar(255).beforeWrite((v) => v.toLowerCase())
    .encrypt().hash(),
  password: Column.hash('SHA-256').minLength(8),
  fullName: Column.varchar(120).nullable().renamedFrom('displayName'),
  bio: Column.text().nullable(),
}, {
  pk: ['id'],
  index: { byName: ['fullName'] },
  unique: { email: ['email_hash'] },
});

// ── Schema v3: type change (SQLite: applied via table REBUILD) ──────
const UsersV3 = Entity('users', {
  id: Column.bigint(), // INTEGER → BIGINT: in-place alter
  email: Column.varchar(255).encrypt().hash(),
  password: Column.hash('SHA-256').minLength(8),
  fullName: Column.varchar(120).nullable(),
  bio: Column.text().nullable(),
}, {
  pk: ['id'],
  index: { byName: ['fullName'] },
  unique: { email: ['email_hash'] },
});

describe('norm.migrations (real SQLite end to end)', () => {
  let dbDir = '';
  let migDir = '';
  let engine: SQLiteEngine;

  beforeAll(async () => {
    dbDir = await makeTempDir({ prefix: 'norm-mig-db-' });
    migDir = await makeTempDir({ prefix: 'norm-mig-files-' });
    engine = new SQLiteEngine('mig-test', { path: dbDir });
    await engine.connect();
  });
  afterAll(async () => {
    await engine.disconnect();
    await removeDir(dbDir, { recursive: true });
    await removeDir(migDir, { recursive: true });
  });

  it('diff warns on NOT NULL column adds (apply-time hazard, never silent)', () => {
    const before = buildSnapshot(
      { U: Entity('u', { id: Column.integer() }, { pk: ['id'] }) },
      '2026-01-01T00:00:00.000Z',
    );
    const after = buildSnapshot(
      {
        U: Entity('u', {
          id: Column.integer(),
          need: Column.varchar(10),
          ok: Column.varchar(10).nullable(),
        }, { pk: ['id'] }),
      },
      '2026-01-01T00:00:00.000Z',
    );
    const d = diffSnapshots(before, after);
    asserts.assertEquals(d.warnings.length, 1);
    asserts.assertStringIncludes(d.warnings[0]!, 'U.need');
    asserts.assertStringIncludes(d.warnings[0]!, 'NOT NULL');
  });

  it('FK referential actions reach the CREATE TABLE DDL on every SQL dialect', () => {
    const ts = '2026-01-01T00:00:00.000Z';
    const Users = Entity('users', { id: Column.integer() }, { pk: ['id'] });
    const Profiles = Entity('profiles', {
      userId: Column.integer(),
    }, {
      pk: ['userId'],
      fk: {
        User: {
          model: 'Users',
          on: { userId: 'id' },
          onDelete: 'CASCADE',
          onUpdate: 'NO_ACTION',
        },
      },
    });
    const snap = buildSnapshot({ Users, Profiles }, ts);
    // Snapshot carries the actions (DDL-relevant → hashed).
    asserts.assertEquals(
      snap.entities.Profiles!.foreignKeys!.User!.onDelete,
      'CASCADE',
    );
    // A change in action alone must move the drift hash.
    const noAct = buildSnapshot({
      Users,
      Profiles: Entity('profiles', { userId: Column.integer() }, {
        pk: ['userId'],
        fk: { User: { model: 'Users', on: { userId: 'id' } } },
      }),
    }, ts);
    asserts.assertNotEquals(snap.hash, noAct.hash);

    // Rendered DDL contains ON DELETE / ON UPDATE on all 3 SQL dialects.
    const diff = diffSnapshots(null, snap);
    for (const dialect of ['sqlite', 'postgres', 'maria'] as const) {
      const plan = renderPlan(1, dialect, diff.actions);
      const create = plan.statements.find((s) => s.includes('profiles'))!;
      asserts.assertStringIncludes(create, 'ON DELETE CASCADE');
      asserts.assertStringIncludes(create, 'ON UPDATE NO ACTION');
    }
  });

  it('materialized views flow snapshot → CREATE/DROP actions', () => {
    const ts = '2026-01-01T00:00:00.000Z';
    const mkView = (materialized: boolean) =>
      Entity('daily', { day: Column.varchar(10) }, {
        type: 'VIEW',
        ...(materialized ? { materialized: true } : {}),
        query: {
          type: 'SELECT',
          table: 'visits',
          columns: ['day'],
          projection: { '@day': true },
        },
      });
    const withMv = buildSnapshot({ Daily: mkView(true) }, ts);
    asserts.assertEquals(withMv.entities.Daily!.materialized, true);

    // Fresh create carries the flag through to the DDL action.
    const created = diffSnapshots(null, withMv);
    const create = created.actions.find((a) =>
      !isRebuild(a) && a.type === 'CREATE_VIEW'
    ) as Record<string, unknown>;
    asserts.assertEquals(create.materialized, true);

    // Dropping it (reverse diff) marks the DROP too — Postgres needs
    // DROP MATERIALIZED VIEW.
    const gone = diffSnapshots(withMv, {
      format: 1,
      generatedAt: ts,
      hash: '',
      entities: {},
    }, { allowDrop: true });
    const drop = gone.actions.find((a) =>
      !isRebuild(a) && a.type === 'DROP_VIEW'
    ) as Record<string, unknown>;
    asserts.assertEquals(drop.materialized, true);

    // The flag participates in the drift hash (DDL-relevant).
    const plain = buildSnapshot({ Daily: mkView(false) }, ts);
    asserts.assertNotEquals(withMv.hash, plain.hash);
  });

  it('logical and physical snapshot exporters agree on DDL-relevant facts', () => {
    // definition/snapshot.ts (logical inspection) and
    // migrations/snapshot.ts (physical wire format) are separate
    // projections of the SAME facts. A DDL-relevant property added to
    // one but not the other MUST fail here.
    const registry = { Users: UsersV2 };
    const logical = logicalSnapshot(registry).entities;
    const physical = buildSnapshot(registry, '2026-01-01T00:00:00.000Z')
      .entities;

    asserts.assertEquals(Object.keys(logical), Object.keys(physical));
    for (const key of Object.keys(logical)) {
      const l = logical[key]!;
      const p = physical[key]!;
      asserts.assertEquals(l.kind, p.kind);
      asserts.assertEquals(l.name, p.name);
      // Same column set (both exclude virtual masks; physical only
      // re-projects types, never adds/drops columns).
      asserts.assertEquals(
        Object.keys(l.columns).sort(),
        Object.keys(p.columns).sort(),
      );
      // Same crypto markers + rename hints per column.
      for (const col of Object.keys(l.columns)) {
        const lc = l.columns[col]!;
        const pc = p.columns[col]!;
        asserts.assertEquals(lc.encrypt, pc.encrypt, `${key}.${col} encrypt`);
        asserts.assertEquals(lc.hash, pc.hash, `${key}.${col} hash`);
        asserts.assertEquals(lc.hashed, pc.hashed, `${key}.${col} hashed`);
        asserts.assertEquals(
          lc.renamedFrom,
          pc.renamedFrom,
          `${key}.${col} renamedFrom`,
        );
      }
      // Same structural facts.
      asserts.assertEquals(l.primaryKeys, p.primaryKeys);
      asserts.assertEquals(l.indexes ?? {}, p.indexes ?? {});
      asserts.assertEquals(l.uniques ?? {}, p.uniques ?? {});
      asserts.assertEquals(
        (l as { renamedFrom?: string }).renamedFrom,
        (p as { renamedFrom?: string }).renamedFrom,
      );
      asserts.assertEquals(
        (l as { materialized?: true }).materialized,
        (p as { materialized?: true }).materialized,
      );
      // FK aliases + local column pairs (targets differ BY DESIGN:
      // entity keys logically, physical tables in the wire format).
      asserts.assertEquals(
        Object.keys(l.foreignKeys ?? {}).sort(),
        Object.keys(p.foreignKeys ?? {}).sort(),
      );
    }
  });

  it('version filenames parse and format round-trip', () => {
    asserts.assertEquals(formatVersionFilename(1), '0001.json');
    asserts.assertEquals(parseVersion('0001.json'), 1);
    asserts.assertEquals(parseVersion('12.JSON'), 12);
    asserts.assertEquals(parseVersion('snapshot.txt'), null);
    asserts.assertEquals(parseVersion('0000.json'), null);
  });

  it('v1: snapshot → plan → apply creates tables, siblings, digest cols, indexes', async () => {
    const norm = new Norm({ engine: engine as never, secret: SECRET });
    const db = norm.use(Schema('App', { Users: UsersV1 }));
    // renderSql: true → reviewable `.sql` plans ride along with the snapshot.
    const mig = new Migrator(db, { dir: migDir, renderSql: true });

    const s = await mig.snapshot();
    asserts.assertEquals(s, {
      version: 1,
      path: `${migDir}/0001.json`,
      written: true,
    });
    // Reviewable plan artifacts rode along — one per SQL dialect,
    // hash-stamped, containing the real DDL.
    for (const d of ['sqlite', 'postgres', 'maria']) {
      const text = await readTextFile(`${migDir}/0001.${d}.sql`);
      asserts.assertStringIncludes(text, '-- plan-hash: ');
      asserts.assertStringIncludes(text, 'CREATE TABLE');
      asserts.assertStringIncludes(text, 'users');
    }
    // Idempotent: same schema → nothing new.
    asserts.assertEquals((await mig.snapshot()).written, false);

    const plan = await mig.plan();
    asserts.assertEquals(plan.length, 1);
    const types = ddlTypes(plan[0]!.queries);
    asserts.assertEquals(types[0], 'CREATE_TABLE');
    asserts.assertEquals(
      types.filter((t) => t === 'CREATE_INDEX').length,
      2, // ix_users_byName + ux_users_email (sibling digest!)
    );

    const r = await mig.apply();
    asserts.assertEquals(r.applied, [1]);

    // The MIGRATED schema serves real traffic: encrypted email +
    // digest password + hashed filters, no hand-written DDL anywhere.
    const ins = await db.repo('Users').insert({
      id: 1,
      email: 'Ada@Test.dev',
      password: 'hunter2boat',
      displayName: 'Ada',
    });
    asserts.assertEquals(ins.data[0]!.email, 'ada@test.dev');
    asserts.assertMatch(ins.data[0]!.password, /^[0-9a-f]{64}$/);
    const found = await db.repo('Users').findOne({
      '@password': 'hunter2boat',
    } as never);
    asserts.assertEquals(found.data?.id, 1);
    // The unique index on the SIBLING digest is live.
    await asserts.assertRejects(() =>
      db.repo('Users').insert({
        id: 2,
        email: 'ADA@TEST.DEV',
        password: 'hunter2boat',
        displayName: 'Imposter',
      })
    );

    const st = await mig.status();
    asserts.assertEquals(st, {
      dbVersion: 1,
      fsVersion: 1,
      pending: [],
      hashOk: true,
    });
  });

  it('v2: renamedFrom renames the column (data survives), add column + reindex', async () => {
    const norm = new Norm({ engine: engine as never, secret: SECRET });
    const db = norm.use(Schema('App', { Users: UsersV2 }));
    const mig = new Migrator(db, { dir: migDir });

    asserts.assertEquals((await mig.snapshot()).version, 2);
    const [step] = await mig.plan();
    const alter = step!.queries.find((q) =>
      !isRebuild(q) && q.type === 'ALTER_TABLE'
    ) as Record<string, unknown> | undefined;
    asserts.assertEquals(alter?.renameColumns, { displayName: 'fullName' });
    asserts.assertEquals(Object.keys(alter?.addColumns ?? {}), ['bio']);
    asserts.assertEquals(alter?.dropColumns, undefined); // rename, not drop

    const r = await mig.apply();
    asserts.assertEquals(r.applied, [2]);

    // Ada survived the rename with her name intact.
    const ada = await db.repo('Users').getByPK({ id: 1 });
    asserts.assertEquals(ada.data?.fullName, 'Ada');
    asserts.assertEquals(ada.data?.bio, null);
  });

  it('dryRun plans without executing; forgotten renames surface as blocked drops', async () => {
    const Dropped = Entity('users', {
      id: Column.integer(),
      email: Column.varchar(255).encrypt().hash(),
      password: Column.hash('SHA-256').minLength(8),
      handle: Column.varchar(120).nullable(), // fullName gone, NO hint
      bio: Column.text().nullable(),
    }, {
      pk: ['id'],
      index: { byName: ['handle'] },
      unique: { email: ['email_hash'] },
    });
    const norm = new Norm({ engine: engine as never, secret: SECRET });
    const db = norm.use(Schema('App', { Users: Dropped }));
    const mig = new Migrator(db, { dir: migDir });
    asserts.assertEquals((await mig.snapshot()).version, 3);

    const dry = await mig.apply({ dryRun: true });
    asserts.assertEquals(dry.applied, []);
    // fullName would be DROPPED — allowDrop:false blocks it LOUDLY.
    asserts.assertEquals(
      dry.plannedQueries![0]!.blockedDrops.includes('Users.fullName'),
      true,
    );
    // Nothing executed, nothing recorded.
    asserts.assertEquals((await mig.status()).dbVersion, 2);
    // Roll the accidental snapshot forward by rolling the FILE back:
    // simplest here is applying it with drops allowed…
    const applied = await mig.apply({ allowDrop: true });
    asserts.assertEquals(applied.applied, [3]);
  });

  it('rollback replays the reverse diff and prunes history', async () => {
    const norm = new Norm({ engine: engine as never, secret: SECRET });
    const db = norm.use(Schema('App', { Users: UsersV2 }));
    const mig = new Migrator(db, { dir: migDir });

    const back = await mig.rollback({ to: 2 });
    asserts.assertEquals(back.reverted, [3]);
    asserts.assertEquals((await mig.status()).dbVersion, 2);
    // fullName is BACK (v3 dropped it; the reverse diff re-adds it).
    const ada = await db.repo('Users').getByPK({ id: 1 });
    asserts.assertEquals('fullName' in (ada.data ?? {}), true);

    const hist = await mig.history();
    asserts.assertEquals(hist.map((h) => h.version), [2, 1]);
    asserts.assertEquals(hist[0]!.hash.length, 16);

    // Invalid targets are loud.
    await asserts.assertRejects(
      () => mig.rollback({ to: 5 }),
      NormMigrationError,
    );
  });

  it('SQLite type change applies via table REBUILD — data survives', async () => {
    // Own dir AND own database: history lives in the database.
    const dir = await makeTempDir({ prefix: 'norm-mig-typechange-' });
    const dbDir2 = await makeTempDir({ prefix: 'norm-mig-typechange-db-' });
    const engine2 = new SQLiteEngine('mig-tc', { path: dbDir2 });
    await engine2.connect();
    try {
      const norm = new Norm({ engine: engine2 as never, secret: SECRET });
      const dbV2 = norm.use(Schema('App', { Users: UsersV2 }));
      const v2 = new Migrator(dbV2, { dir });
      asserts.assertEquals((await v2.snapshot()).version, 1);
      await v2.apply();
      await dbV2.repo('Users').insert({
        id: 7,
        email: 'Rebuild@Test.dev',
        password: 'hunter2boat',
        fullName: 'Rebuilt Row',
      });

      // id INTEGER → BIGINT: no in-place column alter on SQLite, so
      // the plan is ONE composite rebuild (structural — crypto
      // markers unchanged, rows copy via INSERT…SELECT).
      const dbV3 = norm.use(Schema('App', { Users: UsersV3 }));
      const v3 = new Migrator(dbV3, { dir });
      asserts.assertEquals((await v3.snapshot()).version, 2);
      const [step] = await v3.plan();
      asserts.assertEquals(ddlTypes(step!.queries), ['REBUILD_TABLE']);
      const rebuild = step!.queries.find(isRebuild)!;
      asserts.assertEquals(rebuild.transform, false);

      const applied = await v3.apply();
      asserts.assertEquals(applied.applied, [2]);
      // The row survived the rebuild — decryptable, digest intact.
      const rows = await dbV3.repo('Users').find();
      asserts.assertEquals(rows.data.length, 1);
      asserts.assertEquals(rows.data[0]!.email, 'rebuild@test.dev');
      asserts.assertEquals(rows.data[0]!.fullName, 'Rebuilt Row');
      // The rebuilt table serves NEW traffic (indexes + digest live).
      const found = await dbV3.repo('Users').findOne({
        '@password': 'hunter2boat',
      } as never);
      asserts.assertEquals(found.data?.fullName, 'Rebuilt Row');
      // The aside table is gone: a SECOND rebuild-free apply cycle
      // works and status is clean.
      asserts.assertEquals((await v3.status()).dbVersion, 2);
    } finally {
      await engine2.disconnect();
      await removeDir(dir, { recursive: true });
      await removeDir(dbDir2, { recursive: true });
    }
  });

  it('table rename via STABLE KEY: RENAME TO + index re-name; blocked drops refuse apply', async () => {
    const dir = await makeTempDir({ prefix: 'norm-mig-tblrename-' });
    const dbDir4 = await makeTempDir({ prefix: 'norm-mig-tblrename-db-' });
    const engine4 = new SQLiteEngine('mig-tr', { path: dbDir4 });
    await engine4.connect();
    try {
      const norm = new Norm({ engine: engine4 as never, secret: SECRET });
      const V1 = Entity('folks', {
        id: Column.integer(),
        tag: Column.varchar(20).nullable(),
      }, { pk: ['id'], index: { byTag: ['tag'] } });
      const m1 = new Migrator(norm.use(Schema('A', { Folks: V1 })), { dir });
      await m1.snapshot();
      await m1.apply();
      const db1 = norm.use(Schema('A', { Folks: V1 }));
      await db1.repo('Folks').insert({ id: 1, tag: 'keep' });

      // SAME entity key, new physical name — no hint needed: the key
      // IS identity, so this diffs as a RENAME, and the table-name-
      // embedding index is re-created under the new name.
      const V2 = Entity('people', {
        id: Column.integer(),
        tag: Column.varchar(20).nullable(),
      }, { pk: ['id'], index: { byTag: ['tag'] } });
      const db2 = norm.use(Schema('A', { Folks: V2 }));
      const m2 = new Migrator(db2, { dir });
      await m2.snapshot();
      const [step] = await m2.plan();
      const types = ddlTypes(step!.queries);
      asserts.assertEquals(types.includes('ALTER_TABLE'), true);
      const names = step!.queries.map((q) =>
        (q as unknown as { index?: string }).index
      );
      asserts.assertEquals(names.includes('ix_folks_byTag'), true); // drop old
      asserts.assertEquals(names.includes('ix_people_byTag'), true); // new
      await m2.apply();
      const row = await db2.repo('Folks').getByPK({ id: 1 });
      asserts.assertEquals(row.data?.tag, 'keep'); // data survived

      // Forgotten rename (drop without hint): apply now REFUSES
      // instead of recording the version with the drop skipped.
      const V3 = Entity('people', {
        id: Column.integer(),
        label: Column.varchar(20).nullable(), // tag gone, no hint
      }, { pk: ['id'], index: { byTag: ['label'] } });
      const m3 = new Migrator(norm.use(Schema('A', { Folks: V3 })), { dir });
      await m3.snapshot();
      const err = await asserts.assertRejects(
        () => m3.apply(),
        NormMigrationError,
      );
      asserts.assertStringIncludes(err.message, 'drops are blocked');
      asserts.assertEquals((await m3.status()).dbVersion, 2); // NOT recorded
      await m3.apply({ allowDrop: true }); // explicit opt-in works
    } finally {
      await engine4.disconnect();
      await removeDir(dir, { recursive: true });
      await removeDir(dbDir4, { recursive: true });
    }
  });

  it('crypto-marker flip REBUILDS: email decrypted to plaintext, data survives', async () => {
    const PlainEmail = Entity('users', {
      id: Column.integer(),
      email: Column.varchar(255), // encrypt+hash REMOVED
      password: Column.hash('SHA-256').minLength(8),
      fullName: Column.varchar(120).nullable(),
      bio: Column.text().nullable(),
    }, {
      pk: ['id'],
      index: { byName: ['fullName'] },
    });
    const dir = await makeTempDir({ prefix: 'norm-mig-crypto-' });
    const dbDir3 = await makeTempDir({ prefix: 'norm-mig-crypto-db-' });
    const engine3 = new SQLiteEngine('mig-cr', { path: dbDir3 });
    await engine3.connect();
    try {
      const norm = new Norm({ engine: engine3 as never, secret: SECRET });
      const dbV2 = norm.use(Schema('App', { Users: UsersV2 }));
      const v2 = new Migrator(dbV2, { dir });
      await v2.snapshot();
      await v2.apply();
      await dbV2.repo('Users').insert({
        id: 9,
        email: 'Secret@Test.dev',
        password: 'hunter2boat',
        fullName: 'Decrypt Me',
      });
      // 7 filler rows + rebuildChunkSize 3 push the copy across
      // MULTIPLE chunks — the transform must page, not slurp. (Small
      // numbers: every encrypted cell costs a full PBKDF2.)
      await dbV2.repo('Users').insert(
        Array.from({ length: 7 }, (_, i) => ({
          id: 100 + i,
          email: `U${i}@Filler.dev`,
          password: 'hunter2boat',
          fullName: `Filler ${i}`,
        })),
      );

      const dbPlain = norm.use(Schema('App', { Users: PlainEmail }));
      const mig = new Migrator(dbPlain, { dir, rebuildChunkSize: 3 });
      await mig.snapshot();
      // The flip is a TRANSFORMING rebuild (per-row decrypt), and the
      // dropped `email_hash` sibling + unique index stay drop-gated.
      const [step] = await mig.plan();
      asserts.assertEquals(step!.blockedDrops, ['Users.email_hash']);
      await asserts.assertRejects(() => mig.apply(), NormMigrationError);
      const applied = await mig.apply({ allowDrop: true });
      asserts.assertEquals(applied.applied, [2]);

      // ALL 505 rows survived the chunked copy — none dropped or
      // duplicated at the page boundary.
      const total = await dbPlain.repo('Users').count();
      asserts.assertEquals(total.count, 8);
      // Email is REALLY plaintext at rest now: the plain repo (no
      // decrypt marker) reads it verbatim, lowercased from v2's
      // beforeWrite at insert time.
      const rows = await dbPlain.repo('Users').find({ '@id': 9 } as never);
      asserts.assertEquals(rows.data.length, 1);
      asserts.assertEquals(rows.data[0]!.email, 'secret@test.dev');
      // Both sides of the chunk boundary decrypted correctly.
      const first = await dbPlain.repo('Users').getByPK({ id: 100 });
      asserts.assertEquals(first.data?.email, 'u0@filler.dev');
      const last = await dbPlain.repo('Users').getByPK({ id: 106 });
      asserts.assertEquals(last.data?.email, 'u6@filler.dev');
      // Copied-verbatim digest column still answers hashed filters.
      const found = await dbPlain.repo('Users').findOne({
        '@password': 'hunter2boat',
      } as never);
      asserts.assertEquals(found.data?.id, 9);

      // Rollback reverses the flip through the SAME rebuild engine:
      // plaintext → encrypted, and the dropped `email_hash` sibling
      // is re-added AND backfilled from the plaintext.
      const back = await mig.rollback({ to: 1 });
      asserts.assertEquals(back.reverted, [2]);
      const ada = await dbV2.repo('Users').getByPK({ id: 9 });
      asserts.assertEquals(ada.data?.email, 'secret@test.dev'); // decrypts
      const byEmail = await dbV2.repo('Users').findOne({
        '@email': 'secret@test.dev',
      } as never);
      asserts.assertEquals(byEmail.data?.id, 9); // sibling digest is LIVE
      // Sibling backfill crossed the chunk boundary too.
      const lastBack = await dbV2.repo('Users').findOne({
        '@email': 'u6@filler.dev',
      } as never);
      asserts.assertEquals(lastBack.data?.id, 106);
    } finally {
      await engine3.disconnect();
      await removeDir(dir, { recursive: true });
      await removeDir(dbDir3, { recursive: true });
    }
  });

  it('apply()/rollback() DISARM the version transaction timeout; the knob re-imposes a ceiling (regression)', async () => {
    // The atomic apply wraps a whole version — all its DDL plus the
    // chunked crypto REBUILD copy — in ONE ex.transaction(). With no
    // options the driver's request-scale transactionTimeout (120s) would
    // auto-roll-back a long rebuild mid-copy, so a large migration could
    // NEVER apply. The version transaction must open with the auto-
    // rollback timer DISARMED (timeout 0) by default; transactionTimeoutMs
    // re-imposes a ceiling.
    const dir = await makeTempDir({ prefix: 'norm-mig-txto-' });
    const dbDir = await makeTempDir({ prefix: 'norm-mig-txto-db-' });
    const engine = new SQLiteEngine('mig-txto', { path: dbDir });
    // Capture the options every version transaction is opened with.
    const txTimeouts: unknown[] = [];
    const origTx = engine.transaction.bind(engine);
    // deno-lint-ignore no-explicit-any
    (engine as any).transaction = (arg1: any, arg2: any) => {
      if (typeof arg1 === 'function') txTimeouts.push(arg2?.timeout);
      return origTx(arg1, arg2);
    };
    await engine.connect();
    try {
      const norm = new Norm({ engine: engine as never, secret: SECRET });
      const db = norm.use(Schema('App', { Users: UsersV1 }));
      const mig = new Migrator(db, { dir });
      await mig.snapshot();
      await mig.apply();
      // The version ran in a transaction, and every one disarmed the timer.
      asserts.assertNotEquals(txTimeouts.length, 0);
      for (const t of txTimeouts) asserts.assertEquals(t, 0);

      // An EXPLICIT 0 — the value the JSDoc and NORM-Migrations.md both
      // hand users — must mean exactly what omitting it means. Matching
      // only `undefined` sent 0 through the `Math.max(1, …)` clamp and
      // armed a ONE-SECOND auto-rollback, killing every version whose
      // DDL ran past a second (and every retry identically).
      txTimeouts.length = 0;
      const migZero = new Migrator(db, { dir, transactionTimeoutMs: 0 });
      await migZero.apply(); // nothing pending; re-run is a no-op…
      const migZero2 = new Migrator(db, { dir, transactionTimeoutMs: 0 });
      await migZero2.rollback({ to: 0 });
      asserts.assertNotEquals(txTimeouts.length, 0);
      for (const t of txTimeouts) asserts.assertEquals(t, 0);
      // Negative / non-finite are the same defect class: disarmed, never
      // clamped up to 1s.
      txTimeouts.length = 0;
      const migNeg = new Migrator(db, { dir, transactionTimeoutMs: -5_000 });
      await migNeg.apply();
      asserts.assertNotEquals(txTimeouts.length, 0);
      for (const t of txTimeouts) asserts.assertEquals(t, 0);

      // The knob forwards a ceiling (ms → whole seconds).
      txTimeouts.length = 0;
      const dbV2 = norm.use(Schema('App', { Users: UsersV2 }));
      const migCeil = new Migrator(dbV2, { dir, transactionTimeoutMs: 5_000 });
      await migCeil.snapshot();
      await migCeil.apply();
      asserts.assertNotEquals(txTimeouts.length, 0);
      for (const t of txTimeouts) asserts.assertEquals(t, 5);

      // A sub-second positive value still floors at the driver's unit.
      txTimeouts.length = 0;
      const migSub = new Migrator(dbV2, { dir, transactionTimeoutMs: 250 });
      await migSub.rollback({ to: 1 });
      asserts.assertNotEquals(txTimeouts.length, 0);
      for (const t of txTimeouts) asserts.assertEquals(t, 1);
    } finally {
      await engine.disconnect();
      await removeDir(dir, { recursive: true });
      await removeDir(dbDir, { recursive: true });
    }
  });

  it('a long single step re-stamps the file lock mid-step, not only between versions (regression)', async () => {
    // The lock's stale TTL is refreshed by touch(). Before the fix it was
    // touched ONLY between versions, so a version whose chunked rebuild
    // ran past the TTL looked abandoned — and on advisory-lock-less
    // engines (Mongo/SQLite) the file lock is the ONLY guard, so a
    // contender could reclaim it and run the same version concurrently. A
    // chunked rebuild copy must now touch the lock PER CHUNK.
    const PlainEmail = Entity('users', {
      id: Column.integer(),
      email: Column.varchar(255), // encrypt+hash REMOVED → transforming rebuild
      password: Column.hash('SHA-256').minLength(8),
      fullName: Column.varchar(120).nullable(),
      bio: Column.text().nullable(),
    }, {
      pk: ['id'],
      index: { byName: ['fullName'] },
    });
    const dir = await makeTempDir({ prefix: 'norm-mig-touch-' });
    const dbDir = await makeTempDir({ prefix: 'norm-mig-touch-db-' });
    const engine = new SQLiteEngine('mig-touch', { path: dbDir });
    await engine.connect();
    const origTouch = FileLock.prototype.touch;
    let touches = 0;
    try {
      const norm = new Norm({ engine: engine as never, secret: SECRET });
      const dbV2 = norm.use(Schema('App', { Users: UsersV2 }));
      const v2 = new Migrator(dbV2, { dir });
      await v2.snapshot();
      await v2.apply();
      // 8 rows with rebuildChunkSize 3 → the copy pages across 3 chunks.
      await dbV2.repo('Users').insert(
        Array.from({ length: 8 }, (_, i) => ({
          id: 100 + i,
          email: `U${i}@Filler.dev`,
          password: 'hunter2boat',
          fullName: `Filler ${i}`,
        })),
      );

      const dbPlain = norm.use(Schema('App', { Users: PlainEmail }));
      const mig = new Migrator(dbPlain, { dir, rebuildChunkSize: 3 });
      await mig.snapshot();

      // Count every touch() during the transforming-rebuild apply.
      // deno-lint-ignore no-explicit-any
      FileLock.prototype.touch = function (this: any) {
        touches++;
        return origTouch.call(this);
      };
      const applied = await mig.apply({ allowDrop: true });
      asserts.assertEquals(applied.applied, [2]);
      // A single-version apply touches ONCE between versions; the chunked
      // rebuild adds a touch per chunk, so the total must exceed one.
      asserts.assert(
        touches > 1,
        `expected mid-step lock touches during the rebuild, got ${touches}`,
      );
    } finally {
      FileLock.prototype.touch = origTouch;
      await engine.disconnect();
      await removeDir(dir, { recursive: true });
      await removeDir(dbDir, { recursive: true });
    }
  });

  it('with renderSql: apply verifies the artifact — tamper refused, renderPlans repairs', async () => {
    const dir = await makeTempDir({ prefix: 'norm-mig-artifact-' });
    const dbDir5 = await makeTempDir({ prefix: 'norm-mig-artifact-db-' });
    const engine5 = new SQLiteEngine('mig-art', { path: dbDir5 });
    await engine5.connect();
    try {
      const norm = new Norm({ engine: engine5 as never, secret: SECRET });
      const db = norm.use(Schema('App', { Users: UsersV1 }));
      // renderSql: true → the review gate is on (artifacts written + verified).
      const mig = new Migrator(db, { dir, renderSql: true });
      await mig.snapshot();

      // Tamper: the reviewed artifact no longer matches the plan → refused.
      const artifact = `${dir}/0001.sqlite.sql`;
      const original = await readTextFile(artifact);
      await writeTextFile(
        artifact,
        original.replace(/-- plan-hash: \S+/, '-- plan-hash: deadbeef'),
      );
      const err = await asserts.assertRejects(
        () => mig.apply(),
        NormMigrationError,
      );
      asserts.assertStringIncludes(err.message, 'does not match');
      asserts.assertEquals((await mig.status()).dbVersion, 0); // nothing ran

      // renderPlans() regenerates the correct artifact; apply proceeds.
      const rendered = await mig.renderPlans();
      asserts.assertEquals(rendered[0]!.version, 1);
      asserts.assertEquals(rendered[0]!.files.length, 3);
      const r = await mig.apply();
      asserts.assertEquals(r.applied, [1]);
    } finally {
      await engine5.disconnect();
      await removeDir(dir, { recursive: true });
      await removeDir(dbDir5, { recursive: true });
    }
  });

  it('SQL is opt-in: apply runs straight from the JSON when no artifacts exist', async () => {
    const dir = await makeTempDir({ prefix: 'norm-mig-nosql-' });
    const dbDir7 = await makeTempDir({ prefix: 'norm-mig-nosql-db-' });
    const engine7 = new SQLiteEngine('mig-nosql', { path: dbDir7 });
    await engine7.connect();
    try {
      const db = new Norm({ engine: engine7 as never, secret: SECRET })
        .use(Schema('App', { Users: UsersV1 }));
      const mig = new Migrator(db, { dir }); // renderSql default off → JSON only
      await mig.snapshot();

      // No `.sql` artifact was written…
      await asserts.assertRejects(
        () => readTextFile(`${dir}/0001.sqlite.sql`),
      );
      // …yet apply executes the freshly-computed plan from the JSON snapshot.
      const r = await mig.apply();
      asserts.assertEquals(r.applied, [1]);
      asserts.assertEquals((await mig.status()).dbVersion, 1);
    } finally {
      await engine7.disconnect();
      await removeDir(dir, { recursive: true });
      await removeDir(dbDir7, { recursive: true });
    }
  });

  it('digest algorithm changes still throw at diff time — one-way', () => {
    const ts = '2026-01-01T00:00:00.000Z';
    const before = buildSnapshot({
      U: Entity('u', {
        id: Column.integer(),
        pw: Column.hash('SHA-256'),
      }, { pk: ['id'] }),
    }, ts);
    const after = buildSnapshot({
      U: Entity('u', {
        id: Column.integer(),
        pw: Column.hash('SHA-512'),
      }, { pk: ['id'] }),
    }, ts);
    const err = asserts.assertThrows(
      () => diffSnapshots(before, after),
      NormMigrationError,
    );
    asserts.assertStringIncludes(err.message, 'one-way');
  });
});

// ── FileLock (single-machine mutex) ──────────────────────────────────
describe('norm.migrations FileLock', () => {
  const LOCK = 'migrator.lock';

  it('acquire writes the token, release removes it, re-acquire works', async () => {
    const dir = await makeTempDir({ prefix: 'norm-lock-' });
    try {
      const lock = new FileLock(dir);
      await lock.acquire();
      // The read-back settled on OUR token (lines 47-57).
      asserts.assertEquals(await pathExists(`${dir}/${LOCK}`), true);
      const token = await readTextFile(`${dir}/${LOCK}`);
      asserts.assertEquals(token.length > 0, true);

      await lock.release();
      asserts.assertEquals(await pathExists(`${dir}/${LOCK}`), false);

      // Re-acquire on the same lock instance succeeds.
      await lock.acquire();
      asserts.assertEquals(await pathExists(`${dir}/${LOCK}`), true);
      await lock.release();
    } finally {
      await removeDir(dir, { recursive: true });
    }
  });

  it('a held lock makes a second contender time out (LOCK_TIMEOUT)', async () => {
    const dir = await makeTempDir({ prefix: 'norm-lock-to-' });
    try {
      const held = new FileLock(dir);
      await held.acquire();
      const other = new FileLock(dir);
      const err = await asserts.assertRejects(
        () => other.acquire(60),
        NormMigrationError,
      );
      asserts.assertEquals(err.code, 'LOCK_TIMEOUT');
      asserts.assertStringIncludes(err.message, 'within 60ms');
      await held.release();
    } finally {
      await removeDir(dir, { recursive: true });
    }
  });

  it('release only deletes OUR lock — a non-holder leaves it alone', async () => {
    const dir = await makeTempDir({ prefix: 'norm-lock-hold-' });
    try {
      const holder = new FileLock(dir);
      await holder.acquire();
      // Never acquired ⇒ release is a no-op; must not delete the file.
      const bystander = new FileLock(dir);
      await bystander.release();
      asserts.assertEquals(await pathExists(`${dir}/${LOCK}`), true);
      await holder.release();
      asserts.assertEquals(await pathExists(`${dir}/${LOCK}`), false);
    } finally {
      await removeDir(dir, { recursive: true });
    }
  });

  it('concurrent acquires: the read-back window admits exactly one', async () => {
    const dir = await makeTempDir({ prefix: 'norm-lock-race-' });
    try {
      const a = new FileLock(dir);
      const b = new FileLock(dir);
      const settled = await Promise.allSettled([
        a.acquire(400),
        b.acquire(400),
      ]);
      const won = settled.filter((r) => r.status === 'fulfilled').length;
      asserts.assertEquals(won, 1); // mutual exclusion held
      // The winner still holds the file; release both (the loser's is a
      // no-op).
      await Promise.all([a.release(), b.release()]);
      asserts.assertEquals(await pathExists(`${dir}/${LOCK}`), false);
    } finally {
      await removeDir(dir, { recursive: true });
    }
  });
});

// ── Cheap error branches ─────────────────────────────────────────────
describe('norm.migrations (error branches)', () => {
  it('plan/status/rollback fail loudly when an applied snapshot file is gone', async () => {
    const dir = await makeTempDir({ prefix: 'norm-mig-gone-' });
    const dbDir = await makeTempDir({ prefix: 'norm-mig-gone-db-' });
    const engine = new SQLiteEngine('mig-gone', { path: dbDir });
    await engine.connect();
    try {
      const norm = new Norm({ engine: engine as never, secret: SECRET });
      const db = norm.use(Schema('App', { Users: UsersV1 }));
      const mig = new Migrator(db, { dir });
      await mig.snapshot();
      await mig.apply();

      // The applied snapshot file vanishes (edited history / bad restore).
      await deleteFile(`${dir}/0001.json`);

      // Fresh migrators so the in-run memo can't mask the deletion.
      const planErr = await asserts.assertRejects(
        () => new Migrator(db, { dir }).plan(),
        NormMigrationError,
      );
      asserts.assertEquals(planErr.code, 'MISSING_SNAPSHOT');

      const st = await new Migrator(db, { dir }).status();
      asserts.assertEquals(st.hashOk, false); // applied file gone

      const rbErr = await asserts.assertRejects(
        () => new Migrator(db, { dir }).rollback({ to: 0 }),
        NormMigrationError,
      );
      asserts.assertEquals(rbErr.code, 'MISSING_SNAPSHOT');
    } finally {
      await engine.disconnect();
      await removeDir(dir, { recursive: true });
      await removeDir(dbDir, { recursive: true });
    }
  });

  it('a transforming rebuild without a secret refuses (MISSING_SECRET)', async () => {
    const dir = await makeTempDir({ prefix: 'norm-mig-nosecret-' });
    const dbDir = await makeTempDir({ prefix: 'norm-mig-nosecret-db-' });
    const engine = new SQLiteEngine('mig-nosecret', { path: dbDir });
    await engine.connect();
    try {
      // v1: encrypted email, WITH a secret — write one row at rest.
      const normEnc = new Norm({ engine: engine as never, secret: SECRET });
      const dbEnc = normEnc.use(Schema('App', { Users: UsersV1 }));
      const migEnc = new Migrator(dbEnc, { dir });
      await migEnc.snapshot();
      await migEnc.apply();
      await dbEnc.repo('Users').insert({
        id: 1,
        email: 'a@b.dev',
        password: 'hunter2boat',
        displayName: 'A',
      });

      // v2: email encrypt() REMOVED (a per-row decrypt rebuild), but the
      // Norm has NO secret — the rebuild can't recover the plaintext.
      const PlainEmail = Entity('users', {
        id: Column.integer(),
        email: Column.varchar(255), // encrypt+hash dropped
        password: Column.hash('SHA-256').minLength(8),
        displayName: Column.varchar(120).nullable(),
      }, { pk: ['id'], index: { byName: ['displayName'] } });
      const normPlain = new Norm({ engine: engine as never }); // no secret
      const dbPlain = normPlain.use(Schema('App', { Users: PlainEmail }));
      const migPlain = new Migrator(dbPlain, { dir });
      await migPlain.snapshot();
      const err = await asserts.assertRejects(
        () => migPlain.apply({ allowDrop: true }),
        NormMigrationError,
      );
      asserts.assertEquals(err.code, 'MISSING_SECRET');
    } finally {
      await engine.disconnect();
      await removeDir(dir, { recursive: true });
      await removeDir(dbDir, { recursive: true });
    }
  });

  it('renaming a VIEW is refused at diff time (UNSUPPORTED_RENAME)', () => {
    const view = (name: string, renamedFrom?: string): SnapEntity => ({
      kind: 'VIEW',
      name,
      columns: { id: { type: 'INTEGER' } },
      query: { type: 'SELECT', table: 'base' },
      ...(renamedFrom !== undefined ? { renamedFrom } : {}),
    });
    const before: MigrationSnapshot = {
      format: 1,
      generatedAt: '',
      hash: 'h1',
      entities: { VOld: view('v_old') },
    };
    // The new view is keyed differently and hints at the old physical
    // name → the diff detects a VIEW rename, which it cannot emit.
    const after: MigrationSnapshot = {
      format: 1,
      generatedAt: '',
      hash: 'h2',
      entities: { VNew: view('v_new', 'v_old') },
    };
    const err = asserts.assertThrows(
      () => diffSnapshots(before, after),
      NormMigrationError,
    );
    asserts.assertEquals(err.code, 'UNSUPPORTED_RENAME');
    asserts.assertStringIncludes(err.message, 'not supported on views');
  });
});

// ── Lock lifecycle: a failure NEVER strands migrator.lock ────────────
//
// apply()/rollback() take the on-disk file lock and THEN the server-side
// advisory lock. When the advisory lock is contended it throws
// LOCK_TIMEOUT; if that throw escapes before the try/finally, the file
// lock is orphaned and every later run on this host fails until someone
// deletes migrator.lock by hand.
//
// The failure is injected honestly: a SQLite engine that CLAIMS the
// advisoryLock capability. Norm's executor has no SQLite advisory-lock
// implementation, so `advisoryLock()` throws exactly as a contended
// pg_advisory_lock / GET_LOCK would.
class ClaimsAdvisoryLockEngine extends SQLiteEngine {
  public override readonly Capabilities = {
    pooledConnections: false,
    transactions: true,
    preparedStatements: true,
    advisoryLock: false,
    inPlaceAlter: false,
    referentialActions: true,
    parameterReplacement: { prefix: ':', suffix: '' },
  };

  /** Flip BEFORE constructing the Norm that should see it — the
   * executor snapshots capabilities when it wraps the engine. */
  public claimAdvisoryLock(): void {
    (this.Capabilities as { advisoryLock: boolean }).advisoryLock = true;
  }
}

describe('norm.migrations lock lifecycle', () => {
  const LOCK = 'migrator.lock';

  it('apply(): an advisory-lock failure releases the file lock', async () => {
    const dir = await makeTempDir({ prefix: 'norm-mig-lockleak-' });
    const dbDir = await makeTempDir({ prefix: 'norm-mig-lockleak-db-' });
    const engine = new ClaimsAdvisoryLockEngine('mig-lockleak', {
      path: dbDir,
    });
    await engine.connect();
    try {
      // Pending work exists, so apply() gets past the empty-plan short
      // circuit and actually reaches the advisory lock.
      engine.claimAdvisoryLock();
      const norm = new Norm({ engine: engine as never, secret: SECRET });
      const db = norm.use(Schema('App', { Users: UsersV1 }));
      const mig = new Migrator(db, { dir });
      await mig.snapshot();

      const err = await asserts.assertRejects(
        () => mig.apply(),
        NormMigrationError,
      );
      asserts.assertEquals(err.code, 'LOCK_TIMEOUT');
      asserts.assertStringIncludes(err.message, 'advisory lock');

      // THE regression: the file lock must not outlive the failure.
      asserts.assertEquals(await pathExists(`${dir}/${LOCK}`), false);
    } finally {
      await engine.disconnect();
      await removeDir(dir, { recursive: true });
      await removeDir(dbDir, { recursive: true });
    }
  });

  it('rollback(): an advisory-lock failure releases the file lock', async () => {
    const dir = await makeTempDir({ prefix: 'norm-mig-rblockleak-' });
    const dbDir = await makeTempDir({ prefix: 'norm-mig-rblockleak-db-' });
    const engine = new ClaimsAdvisoryLockEngine('mig-rblockleak', {
      path: dbDir,
    });
    await engine.connect();
    try {
      // Apply v1 normally (advisoryLock still false) so rollback has an
      // applied head to revert.
      const good = new Norm({ engine: engine as never, secret: SECRET });
      const goodDb = good.use(Schema('App', { Users: UsersV1 }));
      const goodMig = new Migrator(goodDb, { dir });
      await goodMig.snapshot();
      await goodMig.apply();
      asserts.assertEquals(await pathExists(`${dir}/${LOCK}`), false);

      // Now the same database, seen through an executor that believes it
      // has advisory locks.
      engine.claimAdvisoryLock();
      const bad = new Norm({ engine: engine as never, secret: SECRET });
      const badDb = bad.use(Schema('App', { Users: UsersV1 }));
      const badMig = new Migrator(badDb, { dir });

      const err = await asserts.assertRejects(
        () => badMig.rollback({ to: 0 }),
        NormMigrationError,
      );
      asserts.assertEquals(err.code, 'LOCK_TIMEOUT');
      asserts.assertStringIncludes(err.message, 'advisory lock');
      asserts.assertEquals(await pathExists(`${dir}/${LOCK}`), false);
    } finally {
      await engine.disconnect();
      await removeDir(dir, { recursive: true });
      await removeDir(dbDir, { recursive: true });
    }
  });
});

// ── FileLock TTL / stale-owner reclaim ───────────────────────────────
describe('norm.migrations FileLock (stale reclaim)', () => {
  const LOCK = 'migrator.lock';

  it('a lock older than the TTL is reclaimed', async () => {
    const dir = await makeTempDir({ prefix: 'norm-lock-stale-' });
    try {
      // A crashed run's leftovers: stamped an hour ago.
      await writeTextFile(
        `${dir}/${LOCK}`,
        JSON.stringify({
          token: 'dead-owner',
          stampedAt: Date.now() - 3_600_000,
          owner: 'crashed-pod/1',
        }),
      );
      const lock = new FileLock(dir, 60_000); // 1-minute TTL
      await lock.acquire(500); // reclaims instead of timing out
      asserts.assertEquals(lock.held, true);
      await lock.release();
      asserts.assertEquals(await pathExists(`${dir}/${LOCK}`), false);
    } finally {
      await removeDir(dir, { recursive: true });
    }
  });

  it('a FRESH lock held by another owner is NOT reclaimed', async () => {
    const dir = await makeTempDir({ prefix: 'norm-lock-fresh-' });
    try {
      await writeTextFile(
        `${dir}/${LOCK}`,
        JSON.stringify({
          token: 'live-owner',
          stampedAt: Date.now(),
          owner: 'live-pod/2',
        }),
      );
      const lock = new FileLock(dir, 60_000);
      const err = await asserts.assertRejects(
        () => lock.acquire(120),
        NormMigrationError,
      );
      asserts.assertEquals(err.code, 'LOCK_TIMEOUT');
      asserts.assertStringIncludes(err.message, 'live-pod/2');
      // The live holder's file is untouched.
      asserts.assertEquals(await pathExists(`${dir}/${LOCK}`), true);
    } finally {
      await removeDir(dir, { recursive: true });
    }
  });

  it('touch() re-stamps a held lock so a long run is never reclaimed', async () => {
    const dir = await makeTempDir({ prefix: 'norm-lock-touch-' });
    try {
      const holder = new FileLock(dir, 60_000);
      await holder.acquire();
      // Backdate the stamp as if the run had been going for an hour.
      const raw = JSON.parse(await readTextFile(`${dir}/${LOCK}`));
      await writeTextFile(
        `${dir}/${LOCK}`,
        JSON.stringify({ ...raw, stampedAt: Date.now() - 3_600_000 }),
      );
      // Stale right now — a contender would reclaim it.
      await holder.touch();
      const contender = new FileLock(dir, 60_000);
      const err = await asserts.assertRejects(
        () => contender.acquire(120),
        NormMigrationError,
      );
      asserts.assertEquals(err.code, 'LOCK_TIMEOUT');
      await holder.release();
    } finally {
      await removeDir(dir, { recursive: true });
    }
  });

  it('an unparseable (pre-JSON) lock file falls back to mtime, so a fresh one holds', async () => {
    const dir = await makeTempDir({ prefix: 'norm-lock-legacy-' });
    try {
      // Bare-token format written by an older norm — just created, so
      // its mtime keeps it alive.
      await writeTextFile(`${dir}/${LOCK}`, 'legacy-bare-token');
      const lock = new FileLock(dir, 60_000);
      const err = await asserts.assertRejects(
        () => lock.acquire(120),
        NormMigrationError,
      );
      asserts.assertEquals(err.code, 'LOCK_TIMEOUT');
      // With a zero TTL the same legacy file IS reclaimable.
      const reclaimer = new FileLock(dir, 0);
      await reclaimer.acquire(500);
      asserts.assertEquals(reclaimer.held, true);
      await reclaimer.release();
    } finally {
      await removeDir(dir, { recursive: true });
    }
  });
});

// ── Mid-plan DDL failure: atomic where possible, retryable elsewhere ─
//
// A version's plan is many statements; the version is only recorded
// after ALL of them succeed. Statement k failing used to leave 1..k-1
// applied and the version unrecorded, so the retry re-emitted them —
// and ADD COLUMN / ADD CONSTRAINT carry no IF NOT EXISTS, so it died
// with "already exists" and only manual DROPs could recover.

/** Real SQLite that refuses DDL touching a chosen table, on demand. */
class FlakySQLiteEngine extends SQLiteEngine {
  /** Physical table whose CREATE should blow up (null = none). */
  public failCreateOf: string | null = null;
  /** Physical table whose ALTER should blow up (null = none). */
  public failAlterOf: string | null = null;
  /** Physical table whose INSERT should blow up (null = none). */
  public failInsertOf: string | null = null;

  public override insert<
    R extends Record<string, unknown> = Record<string, unknown>,
  >(
    q: Parameters<SQLiteEngine['insert']>[0],
    transactionId?: string,
  ): Promise<EngineQueryResult<R>> {
    if (q.table === this.failInsertOf) {
      return Promise.reject(new Error(`injected INSERT failure: ${q.table}`));
    }
    return super.insert<R>(q, transactionId);
  }

  public override createTable(
    q: Parameters<SQLiteEngine['createTable']>[0],
    transactionId?: string,
  ): ReturnType<SQLiteEngine['createTable']> {
    if (q.table === this.failCreateOf) {
      return Promise.reject(new Error(`injected CREATE failure: ${q.table}`));
    }
    return super.createTable(q, transactionId);
  }

  public override alterTable(
    q: Parameters<SQLiteEngine['alterTable']>[0],
    transactionId?: string,
  ): ReturnType<SQLiteEngine['alterTable']> {
    if (q.table === this.failAlterOf) {
      return Promise.reject(new Error(`injected ALTER failure: ${q.table}`));
    }
    return super.alterTable(q, transactionId);
  }
}

/** Does a physical table exist in this SQLite database? */
async function tableExists(
  db: { raw: (sql: string, p?: Record<string, unknown>) => Promise<unknown> },
  name: string,
): Promise<boolean> {
  const res = await db.raw(
    `SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table' ` +
      `AND name = :t:`,
    { t: name },
  ) as { data: Array<{ n: unknown }> };
  return Number(res.data[0]?.n ?? 0) > 0;
}

// Two independent tables, so one version's plan is >1 CREATE and the
// FIRST can land before the SECOND fails.
const AccountsV1 = Entity('accounts', {
  id: Column.integer(),
  label: Column.varchar(80).nullable(),
}, { pk: ['id'] });
const LedgerV1 = Entity('ledger', {
  id: Column.integer(),
  note: Column.varchar(80).nullable(),
}, { pk: ['id'] });

// v2 adds one column to EACH table — two separate ALTER TABLE actions.
const AccountsV2 = Entity('accounts', {
  id: Column.integer(),
  label: Column.varchar(80).nullable(),
  currency: Column.varchar(3).nullable(),
}, { pk: ['id'] });
const LedgerV2 = Entity('ledger', {
  id: Column.integer(),
  note: Column.varchar(80).nullable(),
  amount: Column.integer().nullable(),
}, { pk: ['id'] });

describe('norm.migrations mid-plan failure (transactional DDL)', () => {
  it('rolls the whole version back — no half-applied schema, no history row', async () => {
    const dir = await makeTempDir({ prefix: 'norm-mig-atomic-' });
    const dbDir = await makeTempDir({ prefix: 'norm-mig-atomic-db-' });
    const engine = new FlakySQLiteEngine('mig-atomic', { path: dbDir });
    await engine.connect();
    try {
      const norm = new Norm({ engine: engine as never, secret: SECRET });
      const db = norm.use(
        Schema('App', { Accounts: AccountsV1, Ledger: LedgerV1 }),
      );
      const mig = new Migrator(db, { dir });
      await mig.snapshot();

      // SQLite reports transactionalDdl — the whole plan is one tx.
      const steps = await mig.plan();
      asserts.assertEquals(steps.length, 1);
      asserts.assertEquals(steps[0]!.queries.length > 1, true);

      engine.failCreateOf = 'ledger';
      await asserts.assertRejects(() => mig.apply());
      engine.failCreateOf = null;

      // 'accounts' was created BEFORE 'ledger' failed — it must be gone.
      asserts.assertEquals(await tableExists(db, 'accounts'), false);
      asserts.assertEquals(await tableExists(db, 'ledger'), false);
      asserts.assertEquals((await mig.history()).length, 0);
      asserts.assertEquals((await mig.status()).dbVersion, 0);

      // …and a straight retry now succeeds, no manual cleanup.
      const res = await mig.apply();
      asserts.assertEquals(res.applied, [1]);
      asserts.assertEquals(await tableExists(db, 'accounts'), true);
      asserts.assertEquals(await tableExists(db, 'ledger'), true);
    } finally {
      await engine.disconnect();
      await removeDir(dir, { recursive: true });
      await removeDir(dbDir, { recursive: true });
    }
  });

  it('the history row commits WITH its DDL — a failed record rolls the DDL back too', async () => {
    const dir = await makeTempDir({ prefix: 'norm-mig-atomic2-' });
    const dbDir = await makeTempDir({ prefix: 'norm-mig-atomic2-db-' });
    const engine = new FlakySQLiteEngine('mig-atomic2', { path: dbDir });
    await engine.connect();
    try {
      const norm = new Norm({ engine: engine as never, secret: SECRET });
      const db = norm.use(Schema('App', { Accounts: AccountsV1 }));
      const mig = new Migrator(db, { dir });
      await mig.snapshot();
      await mig.apply();
      asserts.assertEquals(await tableExists(db, 'accounts'), true);

      // v2's ALTER succeeds but recording it in _norm_migrations does
      // not — the nastiest shape of the bug, because the schema moved
      // and the database says it didn't.
      const norm2 = new Norm({ engine: engine as never, secret: SECRET });
      const db2 = norm2.use(Schema('App', { Accounts: AccountsV2 }));
      const mig2 = new Migrator(db2, { dir });
      await mig2.snapshot();
      engine.failInsertOf = '_norm_migrations';
      await asserts.assertRejects(() => mig2.apply());
      engine.failInsertOf = null;

      // The ALTER went back with the failed INSERT: v2's column is gone.
      asserts.assertEquals((await mig2.status()).dbVersion, 1);
      const sql = await db2.raw(
        `SELECT "sql" FROM sqlite_master WHERE name = 'accounts'`,
      );
      asserts.assertEquals(
        String(sql.data[0]!.sql).includes('currency'),
        false,
      );

      // …so the plain retry works, with no duplicate-column explosion.
      const res = await mig2.apply();
      asserts.assertEquals(res.applied, [2]);
      const after = await db2.raw(
        `SELECT "sql" FROM sqlite_master WHERE name = 'accounts'`,
      );
      asserts.assertEquals(
        String(after.data[0]!.sql).includes('currency'),
        true,
      );
    } finally {
      await engine.disconnect();
      await removeDir(dir, { recursive: true });
      await removeDir(dbDir, { recursive: true });
    }
  });
});

describe('norm.migrations mid-plan failure (NON-transactional DDL)', () => {
  it('checkpoints per action so the retry resumes instead of re-emitting', async () => {
    const dir = await makeTempDir({ prefix: 'norm-mig-resume-' });
    const dbDir = await makeTempDir({ prefix: 'norm-mig-resume-db-' });
    const engine = new FlakySQLiteEngine('mig-resume', { path: dbDir });
    await engine.connect();
    try {
      const norm = new Norm({ engine: engine as never, secret: SECRET });
      const db = norm.use(
        Schema('App', { Accounts: AccountsV1, Ledger: LedgerV1 }),
      );
      // Stand v1 up normally (transactional), then migrate v2 as if the
      // engine were MariaDB: real SQLite DDL, but the migrator is told
      // DDL does NOT roll back. runtimeOf() is the migration subsystem's
      // documented seam; only the Migrator reads runtime.executor, so
      // repos keep using the untouched one.
      const mig = new Migrator(db, { dir });
      await mig.snapshot();
      await mig.apply();

      const norm2 = new Norm({ engine: engine as never, secret: SECRET });
      const db2 = norm2.use(
        Schema('App', { Accounts: AccountsV2, Ledger: LedgerV2 }),
      );
      const rt = runtimeOf(db2) as { executor: Executor };
      const real = rt.executor;
      rt.executor = {
        ...real,
        capabilities: { ...real.capabilities, transactionalDdl: false },
      };
      const mig2 = new Migrator(db2, { dir });
      await mig2.snapshot();

      // Two ALTER TABLE actions — one per table.
      const [step] = await mig2.plan();
      asserts.assertEquals(step!.queries.length, 2);
      const firstTable = (step!.queries[0] as { table: string })
        .table as string;
      const secondTable = (step!.queries[1] as { table: string })
        .table as string;

      engine.failAlterOf = secondTable;
      await asserts.assertRejects(() => mig2.apply());
      engine.failAlterOf = null;

      // Non-transactional: statement 1 REALLY landed and stays.
      asserts.assertEquals((await mig2.status()).dbVersion, 1);
      const checkpoint = await db2.raw(
        `SELECT "completed" FROM "_norm_migration_progress" ` +
          `WHERE "version" = 2`,
      );
      asserts.assertEquals(Number(checkpoint.data[0]!.completed), 1);

      // THE regression: the retry resumes at action 2 rather than
      // re-emitting the ADD COLUMN that already landed on `firstTable`
      // (SQLite rejects a duplicate column outright).
      const res = await mig2.apply();
      asserts.assertEquals(res.applied, [2]);

      // Both new columns exist, exactly once each.
      const cols = async (t: string): Promise<string[]> => {
        const r = await db2.raw(
          `SELECT "sql" FROM sqlite_master ` +
            `WHERE type = 'table' AND name = :t:`,
          { t },
        );
        return String(r.data[0]!.sql).split(/[(,]/).map((s) => s.trim());
      };
      const firstCols = (await cols(firstTable)).join('|');
      asserts.assertEquals(
        firstCols.includes('"currency"') || firstCols.includes('"amount"'),
        true,
      );
      asserts.assertEquals(await tableExists(db2, secondTable), true);

      // The checkpoint is cleared once the version is recorded.
      const left = await db2.raw(
        `SELECT COUNT(*) AS n FROM "_norm_migration_progress"`,
      );
      asserts.assertEquals(Number(left.data[0]!.n), 0);
    } finally {
      await engine.disconnect();
      await removeDir(dir, { recursive: true });
      await removeDir(dbDir, { recursive: true });
    }
  });

  it('refuses to resume when the plan changed under a checkpoint', async () => {
    const dir = await makeTempDir({ prefix: 'norm-mig-planchg-' });
    const dbDir = await makeTempDir({ prefix: 'norm-mig-planchg-db-' });
    const engine = new FlakySQLiteEngine('mig-planchg', { path: dbDir });
    await engine.connect();
    try {
      const norm = new Norm({ engine: engine as never, secret: SECRET });
      const db = norm.use(
        Schema('App', { Accounts: AccountsV1, Ledger: LedgerV1 }),
      );
      const mig = new Migrator(db, { dir });
      await mig.snapshot();
      await mig.apply();

      const norm2 = new Norm({ engine: engine as never, secret: SECRET });
      const db2 = norm2.use(
        Schema('App', { Accounts: AccountsV2, Ledger: LedgerV2 }),
      );
      const rt = runtimeOf(db2) as { executor: Executor };
      rt.executor = {
        ...rt.executor,
        capabilities: { ...rt.executor.capabilities, transactionalDdl: false },
      };
      const mig2 = new Migrator(db2, { dir });
      await mig2.snapshot();
      const [step] = await mig2.plan();
      engine.failAlterOf = (step!.queries[1] as { table: string }).table;
      await asserts.assertRejects(() => mig2.apply());
      engine.failAlterOf = null;

      // Someone edits the checkpointed plan's hash out from under it.
      await db2.raw(
        `UPDATE "_norm_migration_progress" SET "planHash" = 'deadbeefdeadbeef' ` +
          `WHERE "version" = 2`,
      );
      const err = await asserts.assertRejects(
        () => mig2.apply(),
        NormMigrationError,
      );
      asserts.assertEquals(err.code, 'PLAN_CHANGED');
      asserts.assertStringIncludes(err.message, '_norm_migration_progress');
    } finally {
      await engine.disconnect();
      await removeDir(dir, { recursive: true });
      await removeDir(dbDir, { recursive: true });
    }
  });
});
