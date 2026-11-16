/**
 * Live tests: {@link PostgresEngine} through PgBouncer in transaction mode.
 *
 * Connection details come from `packages/drivers/.env` or the environment:
 * `PGBOUNCER_HOST`, `PGBOUNCER_PORT`, `PGBOUNCER_USER`, `PGBOUNCER_PASSWORD`
 * and `PGBOUNCER_DB`. The pooler must run with `pool_mode = transaction` and
 * allow the role two server connections; the role must have a default
 * `timezone` that is not UTC, set with `ALTER ROLE … SET timezone`, and may
 * create tables in the database.
 *
 * Skipped when `PGBOUNCER_HOST` is not set, also under `LIVE_DB_REQUIRED`.
 * When it is set and the pooler cannot be reached, the tests skip, and fail
 * with `LIVE_DB_REQUIRED=true`.
 *
 * @module
 */

import * as asserts from '@std/asserts';
import { afterAll, beforeAll, describe, it } from '@tundralibs/compat/test';
import { envArgs } from '@tundralibs/utils';
import { PostgresEngine } from '../engines/postgres/Engine.ts';
import { UTC_ZONE } from '../engines/postgres/timeZone.ts';
import { liveAvailable } from './liveAvailable.ts';

const env = envArgs('./packages/drivers/');

const HOST = env.get('PGBOUNCER_HOST');
const CONFIG = {
  host: HOST || 'localhost',
  port: Number.parseInt(env.get('PGBOUNCER_PORT') || '6432', 10),
  database: env.get('PGBOUNCER_DB') || 'postgres',
  username: env.get('PGBOUNCER_USER') || 'postgres',
  password: env.get('PGBOUNCER_PASSWORD') || undefined,
};

/** Why the pooler cannot be used, or `''` when it answers. */
async function unreachableReason(): Promise<string> {
  const probe = new PostgresEngine('pgbouncer-probe', CONFIG);
  try {
    await probe.connect();
    return (await probe.ping()) ? '' : 'the ping failed';
  } catch (error) {
    return (error as { code?: string }).code ?? (error as Error).name;
  } finally {
    await probe.disconnect().catch(() => {});
  }
}

const skipReason = !HOST
  ? 'PGBOUNCER_HOST is not set'
  : await unreachableReason().then((reason) =>
    liveAvailable('PgBouncer', reason === '')
      ? ''
      : `PgBouncer at ${CONFIG.host}:${CONFIG.port} unreachable: ${reason}`
  );

const ZONE_AND_PID =
  "SELECT current_setting('TimeZone') AS zone, pg_backend_pid() AS pid";
const TABLE = `tundra_pgbouncer_${Date.now()}`;

describe('drivers.PostgresEngine.live-pgbouncer', () => {
  if (skipReason) {
    it({ name: `skipped: ${skipReason}`, ignore: true, fn: () => {} });
    return;
  }

  /** Two clients as an application opens them, and one kept in the role's zone. */
  let client: PostgresEngine;
  let other: PostgresEngine;
  let zoned: PostgresEngine;

  const zoneAndPid = async (
    engine: PostgresEngine,
    transactionId?: string,
  ): Promise<{ zone: string; pid: number }> =>
    (await engine.execute<{ zone: string; pid: number }>({
      sql: ZONE_AND_PID,
      transactionId,
    })).data[0]!;

  beforeAll(async () => {
    client = new PostgresEngine('pgbouncer-live', CONFIG);
    other = new PostgresEngine('pgbouncer-live-other', CONFIG);
    zoned = new PostgresEngine('pgbouncer-live-zoned', {
      ...CONFIG,
      allowNonUtcTimeZone: true,
    });
    await Promise.all([client.connect(), other.connect(), zoned.connect()]);
    await client.execute({
      sql: `CREATE TABLE ${TABLE} (
        id INT PRIMARY KEY, d DATE, ts TIMESTAMP, tz TIMESTAMPTZ
      )`,
    });
  });

  afterAll(async () => {
    try {
      await client.execute({ sql: `DROP TABLE IF EXISTS ${TABLE}` });
    } finally {
      await Promise.all([
        client.disconnect(),
        other.disconnect(),
        zoned.disconnect(),
      ]);
    }
  });

  it('connects in UTC for a role whose default zone is not UTC', async () => {
    const roleZone = (await zoneAndPid(zoned)).zone;
    asserts.assertFalse(
      UTC_ZONE.test(roleZone),
      `the pooler role's default zone is ${roleZone}: give it a non-UTC one ` +
        `with ALTER ROLE … SET timezone, or this file proves nothing`,
    );
    asserts.assertEquals(await client.ping(), true);
    for (let i = 0; i < 3; i++) {
      asserts.assertEquals((await zoneAndPid(client)).zone, 'UTC');
    }
  });

  it('stays in UTC on a server connection other clients use in their own zones', async () => {
    // Outside a transaction, so the zone stays with that client.
    await other.execute({ sql: "SET TimeZone = 'America/Los_Angeles'" });
    try {
      const theirPids = new Set<number>();
      const ourPids = new Set<number>();
      // The clients run in turn, so the pooler hands them the same server
      // connection; a few rounds cover a run where a third client cut in.
      for (let round = 0; round < 5; round++) {
        const set = await zoneAndPid(other);
        asserts.assertEquals(set.zone, 'America/Los_Angeles');
        const roles = await zoneAndPid(zoned);
        asserts.assertFalse(UTC_ZONE.test(roles.zone));
        theirPids.add(set.pid).add(roles.pid);
        const ours = await zoneAndPid(client);
        asserts.assertEquals(ours.zone, 'UTC');
        ourPids.add(ours.pid);
      }
      asserts.assert(
        [...ourPids].some((pid) => theirPids.has(pid)),
        'the clients never shared a server connection',
      );
    } finally {
      await other.execute({ sql: "SET TimeZone = 'UTC'" });
    }
  });

  it('round-trips a date, a timestamp and a timestamptz unchanged', async () => {
    // 01:30 on the 16th in Asia/Kolkata: a session in the role's zone would
    // store another day and another clock time.
    const at = new Date('2026-01-15T20:00:00.000Z');
    await client.execute({
      sql: `INSERT INTO ${TABLE} (id, d, ts, tz) VALUES (1, :at:, :at:, :at:)`,
      params: { at },
    });
    const read = await client.execute({
      sql: `SELECT d, ts, tz, d::text AS d_text, ts::text AS ts_text
        FROM ${TABLE} WHERE id = 1`,
    });
    asserts.assertEquals(read.data[0], {
      d: new Date('2026-01-15T00:00:00.000Z'),
      ts: at,
      tz: at,
      d_text: '2026-01-15',
      ts_text: '2026-01-15 20:00:00',
    });
  });

  it('runs one parameterised statement on different server connections', async () => {
    const statement = (value: number) =>
      client.execute<{ value: number; label: string; pid: number }>({
        sql: 'SELECT :value:::int AS value, :label: AS label, ' +
          'pg_backend_pid() AS pid',
        params: { value, label: `row ${value}` },
      });
    const pids = new Set<number>();
    // Each statement is its own transaction. Between two of them `other`
    // opens a transaction, which takes the server connection `client` just
    // gave back, so the next statement runs on another one.
    for (let round = 0; round < 5 && pids.size < 2; round++) {
      const first = (await statement(round)).data[0]!;
      const tx = await other.beginTransaction();
      try {
        await zoneAndPid(other, tx);
        const second = (await statement(round + 100)).data[0]!;
        asserts.assertEquals(
          [first.value, first.label, second.value, second.label],
          [round, `row ${round}`, round + 100, `row ${round + 100}`],
        );
        pids.add(first.pid).add(second.pid);
      } finally {
        await other.rollbackTransaction(tx);
      }
    }
    asserts.assert(
      pids.size > 1,
      'the client never changed server connections: is pool_mode transaction?',
    );
  });

  it('keeps a transaction on one server connection, apart from other clients', async () => {
    const count = async (engine: PostgresEngine, transactionId?: string) =>
      (await engine.execute<{ n: number }>({
        sql: `SELECT COUNT(*)::int AS n FROM ${TABLE} WHERE id = 2`,
        transactionId,
      })).data[0]!.n;
    const tx = await client.beginTransaction();
    try {
      const before = await zoneAndPid(client, tx);
      await client.execute({
        sql: `INSERT INTO ${TABLE} (id, tz) VALUES (2, :at:)`,
        params: { at: new Date('2026-01-15T20:00:00.000Z') },
        transactionId: tx,
      });
      // Another client works while the transaction is open, on a server
      // connection of its own, and does not see the uncommitted row.
      asserts.assertNotEquals((await zoneAndPid(other)).pid, before.pid);
      asserts.assertEquals(await count(other), 0);
      asserts.assertEquals(await count(client, tx), 1);
      asserts.assertEquals(await zoneAndPid(client, tx), before);
      await client.commitTransaction(tx);
    } catch (error) {
      await client.rollbackTransaction(tx).catch(() => {});
      throw error;
    }
    asserts.assertEquals(await count(other), 1);
  });
});
