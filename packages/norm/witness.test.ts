/**
 * @fileoverview The `witness` observability hook, end-to-end over live
 * SQLite: every repo operation (and `raw()`) runs through the configured
 * witness with the right name/attributes, results and errors pass through
 * unchanged, and — the property tracing depends on — driver `query` events
 * fire WHILE the witnessed fn is executing, so a tracer's active span
 * parents them.
 * @module
 */

import { afterAll, beforeAll, describe, it } from '@tundralibs/compat/test';
import { makeTempDir, removeDir } from '@tundralibs/compat/file';
import * as asserts from '@std/asserts';
import { SQLiteEngine } from '@tundralibs/drivers/sqlite';
import {
  Column,
  Entity,
  Norm,
  Schema,
  type Witness,
  type WitnessInfo,
} from './mod.ts';
import '@tundralibs/norm/engines/sqlite';
import { registerEngine, resolveEngineFactory } from './engines/mod.ts';
import { Migrator } from './migrations/mod.ts';

const Users = Entity('users', {
  id: Column.int(),
  name: Column.clob(),
}, { pk: ['id'] });

/** One captured lifecycle entry — flat so ordering is assertable. */
type Log =
  | { kind: 'start'; info: WitnessInfo }
  | { kind: 'end'; name: string }
  | { kind: 'query-event' };

let dir = '';
let migDir = '';
let norm: Norm;
let sharedEngine: SQLiteEngine;
// deno-lint-ignore no-explicit-any
let db: any;
const log: Log[] = [];

/** Records start/end around the operation without interfering. */
const witness: Witness = async (info, fn) => {
  log.push({ kind: 'start', info });
  try {
    return await fn();
  } finally {
    log.push({ kind: 'end', name: info.name });
  }
};

/**
 * A Norm bound to the shared SQLite engine (`new Norm({ engine })` is
 * gone). The migration handle, the witnessed handle, and the no-witness
 * handle all read/write ONE physical database, so pin the sqlite factory
 * to `sharedEngine` for the single synchronous `new Norm` call — no
 * `await` between pin and restore — then restore the stock factory.
 */
function normWith(withWitness: boolean): Norm {
  const stock = resolveEngineFactory('sqlite');
  registerEngine('sqlite', () => sharedEngine as never);
  try {
    return new Norm({
      database: { dialect: 'sqlite', path: dir },
      secret: 'witness-secret',
      ...(withWitness ? { witness } : {}),
    });
  } finally {
    registerEngine('sqlite', stock as never);
  }
}

describe('norm.witness — observability wrap hook (live SQLite)', () => {
  beforeAll(async () => {
    dir = await makeTempDir({ prefix: 'norm-witness-db-' });
    migDir = await makeTempDir({ prefix: 'norm-witness-mig-' });
    sharedEngine = new SQLiteEngine('witness', { path: dir });
    await sharedEngine.connect();
    // Migrations run on an UN-witnessed handle — the hook wraps repo
    // operations, and DDL noise would only muddy the assertions below.
    const setup = normWith(false).use(Schema('App', { Users }));
    await new Migrator(setup, { dir: migDir }).snapshot();
    await new Migrator(setup, { dir: migDir }).apply();

    norm = normWith(true);
    norm.on('query', () => void log.push({ kind: 'query-event' }));
    db = norm.use(Schema('App', { Users }));
  });

  afterAll(async () => {
    await sharedEngine.disconnect();
    await removeDir(dir, { recursive: true });
    await removeDir(migDir, { recursive: true });
  });

  it('wraps operations with span-style names and attributes', async () => {
    log.length = 0;
    await db.repo('Users').insert([{ id: 1, name: 'ada' }]);
    await db.repo('Users').find();

    const starts = log.filter((l) => l.kind === 'start') as Array<
      { kind: 'start'; info: WitnessInfo }
    >;
    asserts.assertEquals(starts.map((s) => s.info.name), [
      'norm.Users.insert',
      'norm.Users.find',
    ]);
    asserts.assertEquals(starts[0]!.info.attributes, {
      'norm.entity': 'Users',
      'norm.operation': 'insert',
    });
  });

  it('passes results through unchanged', async () => {
    const res = await db.repo('Users').count();
    asserts.assertEquals(res.count, 1); // the row inserted above
    const found = await db.repo('Users').findOne({ '@id': 1 });
    asserts.assertEquals(found.data?.name, 'ada');
  });

  it('fires driver query events INSIDE the witnessed window (the nesting precondition)', async () => {
    log.length = 0;
    await db.repo('Users').find();
    const kinds = log.map((l) => l.kind);
    const start = kinds.indexOf('start');
    const query = kinds.indexOf('query-event');
    const end = kinds.indexOf('end');
    asserts.assert(start >= 0 && query >= 0 && end >= 0, `saw: ${kinds}`);
    asserts.assert(
      start < query && query < end,
      `query event must fire between start and end — a tracer's active span ` +
        `only parents children created inside the window (saw: ${kinds})`,
    );
  });

  it('wraps raw() as norm.raw', async () => {
    log.length = 0;
    const r = await db.raw('SELECT count(*) AS n FROM users');
    asserts.assertEquals(Number(r.data[0]!.n), 1);
    const start = log.find((l) => l.kind === 'start') as
      | { kind: 'start'; info: WitnessInfo }
      | undefined;
    asserts.assertEquals(start?.info.name, 'norm.raw');
    asserts.assertEquals(start?.info.attributes, { 'norm.operation': 'RAW' });
  });

  it('propagates operation errors through the witness', async () => {
    log.length = 0;
    await asserts.assertRejects(() => db.raw('SELECT definitely not sql'));
    // The witness still observed a complete start/end lifecycle.
    asserts.assertEquals(log.filter((l) => l.kind === 'start').length, 1);
    asserts.assertEquals(log.filter((l) => l.kind === 'end').length, 1);
  });

  it('returns the same wrapped accessor from the repo cache', () => {
    asserts.assertStrictEquals(db.repo('Users'), db.repo('Users'));
  });

  it('does not wrap non-operation members', () => {
    // `definition` is a getter, not an operation — it must pass through.
    const def = db.repo('Users').definition;
    asserts.assert(def !== undefined);
  });

  it('operations work identically with no witness configured', async () => {
    // A no-witness handle over the SAME shared engine — do NOT disconnect
    // it here; the shared engine outlives this test and afterAll closes it.
    const plain = normWith(false);
    const pdb = plain.use(Schema('App', { Users }));
    const res = await pdb.repo('Users').count();
    asserts.assertEquals(res.count, 1);
  });
});
