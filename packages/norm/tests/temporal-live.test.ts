/**
 * Temporal (effective-dating) tables against REAL databases — Postgres,
 * MariaDB, SQLite, and MongoDB. The unit/mock suite (`../temporal.test.ts`)
 * pins the query sequence and error paths; this proves the end-to-end
 * behaviour on every engine, and (on the SQL engines) that the Migrator
 * creates the injected `EffectiveFrom`/`EffectiveTo` columns + the
 * one-current `UNIQUE`. Engines that are unreachable are skipped, not
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
import {
  Column,
  Entity,
  Norm,
  type NormDb,
  NormQueryError,
  NormUnsupportedError,
  Schema,
} from '../mod.ts';

const env = envArgs('./packages/norm/');
const SENTINEL = '2099-12-31T23:59:59.999Z';
const ms = (v: unknown) => new Date(v as string | Date).getTime();

const FeeSchedule = Entity('fee_schedule', {
  Id: Column.varchar(40).default(() => crypto.randomUUID()),
  Name: Column.varchar(30),
  Fees: Column.integer(),
}, { pk: ['Id'], temporal: { key: ['Name'] } });

// deno-lint-ignore no-explicit-any
type AnyEngine = any;
type Fixture = {
  name: string;
  make: () => AnyEngine;
  /** Dialect DDL for the temporal table (undefined = schemaless / Mongo). */
  ddl?: string;
};

const dbName = () =>
  env.get('DB_SCHEMA') ? `${env.get('DB_SCHEMA')}_norm` : undefined;

const FIXTURES: Fixture[] = [
  {
    name: 'sqlite',
    make: () => new SQLiteEngine('tmp-live-sqlite', { path: ':memory:' }),
    ddl: `CREATE TABLE fee_schedule (
      Id TEXT PRIMARY KEY, Name TEXT NOT NULL, Fees INTEGER NOT NULL,
      EffectiveFrom TEXT NOT NULL, EffectiveTo TEXT NOT NULL,
      UNIQUE (Name, EffectiveTo))`,
  },
  {
    name: 'postgres',
    make: () =>
      new PostgresEngine('tmp-live-pg', {
        host: env.get('POSTGRES_HOST') || 'localhost',
        port: Number.parseInt(env.get('POSTGRES_PORT') || '5432', 10),
        database: dbName() || env.get('POSTGRES_DB') || 'postgres',
        username: env.get('POSTGRES_USERNAME') || env.get('POSTGRES_USER') ||
          'postgres',
        password: env.get('POSTGRES_PASSWORD') || '',
      }),
    ddl: `CREATE TABLE fee_schedule (
      "Id" VARCHAR(40) PRIMARY KEY, "Name" VARCHAR(30) NOT NULL,
      "Fees" INTEGER NOT NULL,
      "EffectiveFrom" TIMESTAMP NOT NULL, "EffectiveTo" TIMESTAMP NOT NULL,
      UNIQUE ("Name", "EffectiveTo"))`,
  },
  {
    name: 'maria',
    make: () =>
      new MariaEngine('tmp-live-maria', {
        host: env.get('MARIA_HOST') || 'localhost',
        port: Number.parseInt(env.get('MARIA_PORT') || '3306', 10),
        database: dbName() || env.get('MARIA_DB') || 'mysql',
        username: env.get('MARIA_USERNAME') || env.get('MARIA_USER') || 'root',
        password: env.get('MARIA_PASSWORD') || '',
      }),
    // DATETIME(6) — MariaDB TIMESTAMP caps at 2038; the sentinel is 2099.
    ddl: 'CREATE TABLE fee_schedule (' +
      '`Id` VARCHAR(40) PRIMARY KEY, `Name` VARCHAR(30) NOT NULL, ' +
      '`Fees` INT NOT NULL, ' +
      '`EffectiveFrom` DATETIME(6) NOT NULL, `EffectiveTo` DATETIME(6) NOT NULL, ' +
      'UNIQUE (`Name`, `EffectiveTo`))',
  },
  {
    name: 'mongo',
    make: () =>
      new MongoEngine('tmp-live-mongo', {
        host: env.get('MONGO_HOST') || 'localhost',
        port: Number.parseInt(env.get('MONGO_PORT') || '27017', 10),
        database: env.get('MONGO_DB') || 'mongo',
        username: env.get('MONGO_USERNAME') || env.get('MONGO_USER') ||
          undefined,
        password: env.get('MONGO_PASSWORD') || undefined,
      }),
    // Schemaless — no CREATE/UNIQUE; the supersede is norm-managed and
    // best-effort (no transactions).
  },
];

for (const fx of FIXTURES) {
  describe(`norm temporal — live ${fx.name}`, () => {
    let norm: Norm | undefined;
    let db: NormDb<{ FeeSchedule: typeof FeeSchedule }> | undefined;
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
      norm = new Norm({ engine });
      db = norm.use(Schema('T', { FeeSchedule }));
      if (fx.ddl !== undefined) {
        await db.raw('DROP TABLE IF EXISTS fee_schedule').catch(() => {});
        await db.raw(fx.ddl);
      } else {
        // Mongo: clear any leftover documents from a previous run.
        // truncate() is disabled on a temporal entity (it would erase the
        // whole history norm exists to keep) — go straight at the driver,
        // bypassing norm's write API entirely, same as the SQL fixtures'
        // raw DROP TABLE above.
        await (engine as { deleteMany(c: string, f: unknown): Promise<number> })
          .deleteMany('fee_schedule', {}).catch(() => {});
      }
    });

    afterAll(async () => {
      if (db !== undefined && fx.ddl !== undefined) {
        await db.raw('DROP TABLE IF EXISTS fee_schedule').catch(() => {});
      }
      await norm?.disconnect().catch(() => {});
    });

    it('supersede timeline, @AsOf, update/upsert/truncate/delete-disabled, supplied-from', async () => {
      if (db === undefined) {
        console.warn(`  (skipped) ${reason}`);
        return;
      }
      const repo = db.repo('FeeSchedule');

      // Three supersedes build a contiguous, one-current timeline.
      await repo.insert({ Name: 'Gold', Fees: 100 });
      await repo.insert({ Name: 'Gold', Fees: 120 });
      await repo.insert({ Name: 'Gold', Fees: 150 });

      const current = await repo.find({
        '@Name': 'Gold',
        '@EffectiveTo': new Date(SENTINEL),
      });
      asserts.assertEquals(current.count, 1, `${fx.name}: one current`);
      asserts.assertEquals(current.data[0]!.Fees, 150);

      const all = await repo.find({ '@Name': 'Gold' }, {
        orderBy: { '@EffectiveFrom': 'ASC' },
      });
      asserts.assertEquals(all.data.map((r) => r.Fees), [100, 120, 150]);
      for (let i = 0; i < all.data.length - 1; i++) {
        asserts.assertEquals(
          ms(all.data[i]!.EffectiveTo),
          ms(all.data[i + 1]!.EffectiveFrom),
          `${fx.name}: contiguous periods`,
        );
      }

      // @AsOf: the version in force at an instant.
      const v1 = all.data[0]!;
      const mid = new Date((ms(v1.EffectiveFrom) + ms(v1.EffectiveTo)) / 2);
      const asOf = await repo.find({ '@Name': 'Gold', '@AsOf': mid });
      asserts.assertEquals(asOf.count, 1);
      asserts.assertEquals(asOf.data[0]!.Fees, 100);
      // "Now" per real wall-clock can race the supersede's monotonic
      // cutover clock (which strictly increases even within the SAME
      // millisecond of real time, to keep rapid same-key supersedes
      // ordered) — a fast runtime can finish all 3 inserts before real
      // time catches up to the manufactured cutover of the last one, so
      // `new Date()` here would sometimes still read as "before" it.
      // Probe just after the CURRENT version's own EffectiveFrom instead
      // — exactly what "now" needs to mean for this assertion, without
      // the race.
      const asOfNow = new Date(ms(current.data[0]!.EffectiveFrom) + 1);
      const now = await repo.find({ '@Name': 'Gold', '@AsOf': asOfNow });
      asserts.assertEquals(now.data[0]!.Fees, 150);

      // update()/upsert()/truncate()/delete() are all disabled — insert()
      // is the only write verb on a temporal table (it already
      // supersedes).
      await asserts.assertRejects(
        () => repo.update({ Name: 'Gold', Fees: 180 }),
        NormUnsupportedError,
      );
      await asserts.assertRejects(
        () =>
          repo.upsert({ Name: 'Gold', Fees: 180 }, { conflictKeys: ['Id'] }),
        NormUnsupportedError,
      );
      await asserts.assertRejects(
        () => repo.truncate(),
        NormUnsupportedError,
      );
      await asserts.assertRejects(
        () => repo.delete({ '@Name': 'Gold' }),
        NormUnsupportedError,
      );
      // None of the above touched the timeline — still 150 current.
      const stillCurrent = await repo.find({
        '@Name': 'Gold',
        '@EffectiveTo': new Date(SENTINEL),
      });
      asserts.assertEquals(stillCurrent.data[0]!.Fees, 150);

      // Supplied future EffectiveFrom schedules a version.
      const future = new Date(Date.now() + 60_000);
      const platFirst = await repo.insert({ Name: 'Plat', Fees: 500 });
      await repo.insert({ Name: 'Plat', Fees: 600, EffectiveFrom: future });
      // Same race as the Gold "now" probe above: probe just after the
      // FIRST version's own EffectiveFrom rather than an independently
      // captured `new Date()`.
      const platAsOfNow = new Date(
        ms(platFirst.data[0]!.EffectiveFrom) + 1,
      );
      const platNow = await repo.find({
        '@Name': 'Plat',
        '@AsOf': platAsOfNow,
      });
      asserts.assertEquals(platNow.data[0]!.Fees, 500);
      const platLater = await repo.find({
        '@Name': 'Plat',
        '@AsOf': new Date(future.getTime() + 1000),
      });
      asserts.assertEquals(platLater.data[0]!.Fees, 600);

      // Past EffectiveFrom is rejected.
      const err = await asserts.assertRejects(
        () =>
          repo.insert({
            Name: 'Plat',
            Fees: 700,
            EffectiveFrom: new Date(Date.now() - 60_000),
          }),
        NormQueryError,
      );
      asserts.assertEquals((err as NormQueryError).code, 'TEMPORAL_PAST');
    });
  });
}
