/**
 * Audit (versioned-replica) tables against REAL databases — Postgres,
 * MariaDB, SQLite, and MongoDB. The definition-level suite
 * (`../audit.test.ts`) covers validation and a SQLite mirroring smoke
 * pass; this proves insert/update/upsert/truncate/delete mirroring end
 * to end on every engine, plus the encryption interplay (ciphertext
 * carried into the replica, decrypted through its own read path) and
 * that the Migrator's snapshot layer captures the generated replica as
 * a real, FK-less table. Engines that are unreachable are skipped, not
 * failed.
 *
 * @module
 */

import { afterAll, beforeAll, describe, it } from '@tundralibs/compat/test';
import * as asserts from '@std/asserts';
import { envArgs } from '@tundralibs/utils';
import { MariaEngine } from '@tundralibs/drivers/maria';
import { MongoEngine } from '@tundralibs/drivers/mongo';
import { PostgresEngine } from '@tundralibs/drivers/postgres';
import { SQLiteEngine } from '@tundralibs/drivers/sqlite';
import { Column, Entity, Norm, type NormDb, Schema } from '../mod.ts';
import { buildSnapshot } from '../migrations/snapshot.ts';
import { runtimeOf } from '../Norm.ts';

const env = envArgs('./packages/norm/');
const SENTINEL = new Date('2099-12-31T23:59:59.999Z');

const Users = Entity('audit_users', {
  Id: Column.varchar(40).default(() => crypto.randomUUID()),
  Name: Column.varchar(30),
  Email: Column.varchar(100).encrypt().hash(),
}, { pk: ['Id'], audit: { name: 'AuditUsersAudit' } });

// Built once — Schema() composition is pure/deterministic, and every
// fixture needs the SAME registry type (source + the injected replica).
const AuditSchema = Schema('AT', { Users });
type Registry = (typeof AuditSchema)['entities'];

// deno-lint-ignore no-explicit-any
type AnyEngine = any;
type Fixture = {
  name: string;
  make: () => AnyEngine;
  /** Dialect DDL for BOTH the main table and its replica; undefined =
   * schemaless / Mongo (no CREATE, cleared via deleteMany instead). */
  ddl?: { main: string; audit: string };
};

const dbName = () =>
  env.get('DB_SCHEMA') ? `${env.get('DB_SCHEMA')}_norm` : undefined;

/** SQLite returns EffectiveFrom/To as ISO strings; Postgres/MariaDB
 * decode them to real `Date` objects — normalize to epoch ms so
 * cross-dialect comparisons don't depend on either driver's string
 * formatting (`Date#toString()` is locale/timezone-shaped, not ISO). */
const ms = (v: unknown) => new Date(v as string | Date).getTime();

const FIXTURES: Fixture[] = [
  {
    name: 'sqlite',
    make: () => new SQLiteEngine('tmp-live-audit-sqlite', { path: ':memory:' }),
    ddl: {
      main: `CREATE TABLE audit_users (
        Id TEXT PRIMARY KEY, Name TEXT NOT NULL,
        Email TEXT NOT NULL, Email_hash TEXT NOT NULL)`,
      audit: `CREATE TABLE audit_users_audit (
        auditId TEXT PRIMARY KEY, Id TEXT NOT NULL, Name TEXT NOT NULL,
        Email TEXT NOT NULL, Email_hash TEXT NOT NULL,
        EffectiveFrom TEXT NOT NULL, EffectiveTo TEXT NOT NULL,
        UNIQUE (Id, EffectiveTo))`,
    },
  },
  {
    name: 'postgres',
    make: () =>
      new PostgresEngine('tmp-live-audit-pg', {
        host: env.get('POSTGRES_HOST') || 'localhost',
        port: Number.parseInt(env.get('POSTGRES_PORT') || '5432', 10),
        database: dbName() || env.get('POSTGRES_DB') || 'postgres',
        username: env.get('POSTGRES_USERNAME') || env.get('POSTGRES_USER') ||
          'postgres',
        password: env.get('POSTGRES_PASSWORD') || '',
      }),
    ddl: {
      main: `CREATE TABLE audit_users (
        "Id" VARCHAR(40) PRIMARY KEY, "Name" VARCHAR(30) NOT NULL,
        "Email" TEXT NOT NULL, "Email_hash" VARCHAR(64) NOT NULL)`,
      audit: `CREATE TABLE audit_users_audit (
        "auditId" VARCHAR(26) PRIMARY KEY, "Id" VARCHAR(40) NOT NULL,
        "Name" VARCHAR(30) NOT NULL, "Email" TEXT NOT NULL,
        "Email_hash" VARCHAR(64) NOT NULL,
        "EffectiveFrom" TIMESTAMP NOT NULL, "EffectiveTo" TIMESTAMP NOT NULL,
        UNIQUE ("Id", "EffectiveTo"))`,
    },
  },
  {
    name: 'maria',
    make: () =>
      new MariaEngine('tmp-live-audit-maria', {
        host: env.get('MARIA_HOST') || 'localhost',
        port: Number.parseInt(env.get('MARIA_PORT') || '3306', 10),
        database: dbName() || env.get('MARIA_DB') || 'mysql',
        username: env.get('MARIA_USERNAME') || env.get('MARIA_USER') || 'root',
        password: env.get('MARIA_PASSWORD') || '',
      }),
    // DATETIME(6) — MariaDB TIMESTAMP caps at 2038; the sentinel is 2099.
    ddl: {
      main: 'CREATE TABLE audit_users (' +
        '`Id` VARCHAR(40) PRIMARY KEY, `Name` VARCHAR(30) NOT NULL, ' +
        '`Email` TEXT NOT NULL, `Email_hash` VARCHAR(64) NOT NULL)',
      audit: 'CREATE TABLE audit_users_audit (' +
        '`auditId` VARCHAR(26) PRIMARY KEY, `Id` VARCHAR(40) NOT NULL, ' +
        '`Name` VARCHAR(30) NOT NULL, `Email` TEXT NOT NULL, ' +
        '`Email_hash` VARCHAR(64) NOT NULL, ' +
        '`EffectiveFrom` DATETIME(6) NOT NULL, `EffectiveTo` DATETIME(6) NOT NULL, ' +
        'UNIQUE (`Id`, `EffectiveTo`))',
    },
  },
  {
    name: 'mongo',
    make: () =>
      new MongoEngine('tmp-live-audit-mongo', {
        host: env.get('MONGO_HOST') || 'localhost',
        port: Number.parseInt(env.get('MONGO_PORT') || '27017', 10),
        database: env.get('MONGO_DB') || 'mongo',
        username: env.get('MONGO_USERNAME') || env.get('MONGO_USER') ||
          undefined,
        password: env.get('MONGO_PASSWORD') || undefined,
      }),
    // Schemaless — no CREATE; the mirror write is norm-managed and
    // best-effort (no transactions), same caveat as temporal.
  },
];

for (const fx of FIXTURES) {
  describe(`norm audit — live ${fx.name}`, () => {
    let norm: Norm | undefined;
    let db: NormDb<Registry> | undefined;
    let reason = '';

    beforeAll(async () => {
      let engine: AnyEngine;
      try {
        engine = fx.make();
        await engine.connect();
        if (typeof engine.ping === 'function') await engine.ping();
      } catch (e) {
        reason = `${fx.name} unavailable: ${(e as Error).message}`;
        try {
          await engine?.disconnect?.();
        } catch { /* ignore */ }
        return;
      }
      norm = new Norm({ engine, secret: 'x'.repeat(32) });
      db = norm.use(AuditSchema);
      if (fx.ddl !== undefined) {
        await db.raw('DROP TABLE IF EXISTS audit_users_audit').catch(
          () => {},
        );
        await db.raw('DROP TABLE IF EXISTS audit_users').catch(() => {});
        await db.raw(fx.ddl.main);
        await db.raw(fx.ddl.audit);
      } else {
        await (engine as {
          deleteMany(c: string, f: unknown): Promise<number>;
        }).deleteMany('audit_users', {}).catch(() => {});
        await (engine as {
          deleteMany(c: string, f: unknown): Promise<number>;
        }).deleteMany('audit_users_audit', {}).catch(() => {});
      }
    });

    afterAll(async () => {
      if (db !== undefined && fx.ddl !== undefined) {
        await db.raw('DROP TABLE IF EXISTS audit_users_audit').catch(
          () => {},
        );
        await db.raw('DROP TABLE IF EXISTS audit_users').catch(() => {});
      }
      await norm?.disconnect().catch(() => {});
    });

    it('the Migrator snapshot captures the replica as a real, FK-less table', () => {
      if (db === undefined) {
        console.warn(`  (skipped) ${reason}`);
        return;
      }
      const snap = buildSnapshot(
        runtimeOf(db).registry,
        new Date(0).toISOString(),
      );
      const auditSnap = snap.entities['AuditUsersAudit'] as {
        kind: string;
        primaryKeys: readonly string[];
        foreignKeys?: unknown;
        columns: Record<string, unknown>;
      };
      asserts.assertExists(auditSnap);
      asserts.assertEquals(auditSnap.kind, 'TABLE');
      asserts.assertEquals(auditSnap.primaryKeys, ['auditId']);
      asserts.assertEquals(auditSnap.foreignKeys, undefined);
      asserts.assert('Email_hash' in auditSnap.columns);
    });

    it('insert/update/upsert/truncate/delete all mirror, ciphertext intact', async () => {
      if (db === undefined) {
        console.warn(`  (skipped) ${reason}`);
        return;
      }
      const users = db.repo('Users');
      const audit = db.repo('AuditUsersAudit');

      // insert → open a version.
      const ins = await users.insert({
        Name: 'Bob',
        Email: 'bob@example.com',
      });
      const id = ins.data[0]!.Id;
      let trail = await audit.find({ '@Id': id });
      asserts.assertEquals(
        trail.count,
        1,
        `${fx.name}: one version after insert`,
      );
      asserts.assertEquals(trail.data[0]!.Name, 'Bob');
      asserts.assertEquals(ms(trail.data[0]!.EffectiveTo), ms(SENTINEL));

      // Ciphertext at rest in the replica, decrypts back through its
      // own read path.
      const raw = await audit.find({ '@Id': id }, { decrypt: false });
      asserts.assertNotEquals(raw.data[0]!.Email, 'bob@example.com');
      const dec = await audit.find({ '@Id': id });
      asserts.assertEquals(dec.data[0]!.Email, 'bob@example.com');

      // update → close current + open new.
      await users.update({ Name: 'Bobby' }, { '@Id': id });
      trail = await audit.find({ '@Id': id }, {
        orderBy: { '@EffectiveFrom': 'ASC' },
      });
      asserts.assertEquals(
        trail.count,
        2,
        `${fx.name}: two versions after update`,
      );
      asserts.assertEquals(trail.data[0]!.Name, 'Bob');
      asserts.assertEquals(trail.data[1]!.Name, 'Bobby');
      asserts.assertEquals(
        ms(trail.data[0]!.EffectiveTo),
        ms(trail.data[1]!.EffectiveFrom),
        `${fx.name}: contiguous periods`,
      );

      // upsert → same supersede primitive.
      await users.upsert(
        { Id: id, Name: 'Robert', Email: 'bob@example.com' },
        { conflictKeys: ['Id'] },
      );
      trail = await audit.find({ '@Id': id }, {
        orderBy: { '@EffectiveFrom': 'ASC' },
      });
      asserts.assertEquals(
        trail.count,
        3,
        `${fx.name}: three versions after upsert`,
      );
      asserts.assertEquals(trail.data[2]!.Name, 'Robert');

      // truncate → bulk-close every current version, no successor.
      await users.truncate();
      trail = await audit.find({ '@Id': id });
      asserts.assertEquals(
        trail.count,
        3,
        `${fx.name}: truncate never removes audit rows`,
      );
      let current = await audit.find({ '@Id': id, '@EffectiveTo': SENTINEL });
      asserts.assertEquals(
        current.count,
        0,
        `${fx.name}: no version current after truncate`,
      );

      // A fresh insert under a NEW id opens its own timeline cleanly.
      const ins2 = await users.insert({
        Name: 'Carol',
        Email: 'carol@example.com',
      });
      const id2 = ins2.data[0]!.Id;

      // delete → close current, no successor (never removes history).
      trail = await audit.find({ '@Id': id2 });
      asserts.assertEquals(trail.count, 1);
      await users.delete({ '@Id': id2 });
      trail = await audit.find({ '@Id': id2 });
      asserts.assertEquals(
        trail.count,
        1,
        `${fx.name}: delete never removes audit rows`,
      );
      current = await audit.find({ '@Id': id2, '@EffectiveTo': SENTINEL });
      asserts.assertEquals(
        current.count,
        0,
        `${fx.name}: no version current after delete`,
      );
    });
  });
}
