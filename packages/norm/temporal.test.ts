/**
 * Temporal (effective-dating) tables: column injection, the supersede
 * write path (close-current + insert-new, transactional), and
 * update()/upsert()/delete()/truncate() all being disabled (insert() is
 * the only write verb — it already supersedes) — exercised black-box
 * over a mock executor that records the query sequence.
 */

import { afterAll, beforeAll, describe, it } from '@tundralibs/compat/test';
import * as asserts from '@std/asserts';
import { makeTempDir, removeDir } from '@tundralibs/compat/file';
import '@tundralibs/norm/engines/sqlite';
import type {
  EngineQueryResult,
  EngineTransactionOptions,
} from '@tundralibs/drivers';
import {
  Column,
  compileRuntime,
  Entity,
  type Executor,
  type ExecutorQuery,
  Norm,
  NormDb,
  NormQueryError,
  NormUnsupportedError,
  Schema,
  type Session,
  use,
} from './mod.ts';
import type { AnyDefinition } from './definition/mod.ts';

type Row = Record<string, unknown>;

/** Records every executed query and whether a transaction was opened. */
class MockExec implements Executor {
  public calls: ExecutorQuery[] = [];
  public txOpened = 0;
  /** Rows the internal `@AsOf` SELECT returns (the "current version"). */
  public selectRows: Row[] = [];
  public capabilities = {
    transactions: true,
    transactionalDdl: true,
    alterColumns: true,
    alterConstraints: true,
    advisoryLock: false,
    dialect: 'sqlite' as const,
  };

  execute<R extends Row>(
    q: ExecutorQuery,
    _txId?: string,
  ): Promise<EngineQueryResult<R>> {
    this.calls.push(q);
    const make = (data: Row[], count?: number) =>
      Promise.resolve(
        {
          type: q.type,
          data: data as R[],
          count: count ?? data.length,
          time: 1,
          isSlow: false,
        } as unknown as EngineQueryResult<R>,
      );
    if (q.type === 'INSERT') {
      const rows = (q as unknown as { data: Row[] }).data;
      return make(rows.map((r) => ({ ...r })));
    }
    if (q.type === 'UPDATE') return make([], 0);
    if (q.type === 'SELECT') {
      return make(this.selectRows.map((r) => ({ ...r })));
    }
    return make([]);
  }
  async transaction<T>(
    run: (s: Session) => Promise<T>,
    _o?: EngineTransactionOptions,
  ): Promise<T> {
    this.txOpened++;
    const session: Session = { id: 'tx-1', savepoint: (fn) => fn(session) };
    return await run(session);
  }
  withAdvisoryLock<T>(
    _k: string,
    _t: number,
    fn: () => Promise<T>,
  ): Promise<T> {
    return fn();
  }
  // deno-lint-ignore no-explicit-any
  raw(): Promise<any> {
    return Promise.resolve({ data: [], count: 0, time: 0, isSlow: false });
  }
  ddl(): Promise<void> {
    return Promise.resolve();
  }
  connect(): Promise<void> {
    return Promise.resolve();
  }
  disconnect(): Promise<void> {
    return Promise.resolve();
  }
}

function setup<R extends Record<string, AnyDefinition>>(schema: R) {
  const exec = new MockExec();
  const runtime = compileRuntime(
    use(Schema('S', schema as Record<string, AnyDefinition>)),
    {},
    exec,
    () => {},
  );
  return { exec, db: new NormDb<R>(runtime, exec) };
}

const SENTINEL = '2099-12-31T23:59:59.999Z';

const FeeTemplates = Entity('fee_templates', {
  Id: Column.uuid().default(() => crypto.randomUUID()),
  Name: Column.varchar(30),
  Fees: Column.numeric(10, 2),
}, { pk: ['Id'], temporal: { key: ['Name'] } });

/** A canned "current version" for the internal @AsOf lookup. */
const CURRENT: Row = {
  Id: 'v0',
  Name: 'Gold',
  Fees: 100,
  EffectiveFrom: '2020-01-01T00:00:00.000Z',
  EffectiveTo: SENTINEL,
};

describe('norm temporal', () => {
  it('injects EffectiveFrom / EffectiveTo columns + a one-current unique', () => {
    const cols = Object.keys(FeeTemplates.columns);
    asserts.assert(cols.includes('EffectiveFrom'), 'EffectiveFrom injected');
    asserts.assert(cols.includes('EffectiveTo'), 'EffectiveTo injected');
    const uniques = (FeeTemplates as { uniques?: Record<string, string[]> })
      .uniques ?? {};
    const groups = Object.values(uniques);
    asserts.assert(
      groups.some((g) => g.includes('Name') && g.includes('EffectiveTo')),
      'UNIQUE(Name, EffectiveTo) emitted',
    );
  });

  it('exposes a customizable column-name form', () => {
    const E = Entity('e', { id: Column.uuid(), k: Column.varchar(10) }, {
      pk: ['id'],
      temporal: {
        key: ['k'],
        EffectiveFromColumn: 'ValidFrom',
        EffectiveToColumn: 'ValidTo',
      },
    });
    const cols = Object.keys(E.columns);
    asserts.assert(cols.includes('ValidFrom') && cols.includes('ValidTo'));
    asserts.assert(!cols.includes('EffectiveFrom'));
  });

  it('insert supersedes: SELECT-current, UPDATE-close, INSERT-new, in a tx', async () => {
    const { db, exec } = setup({ FeeTemplates });
    exec.selectRows = [CURRENT]; // a current version exists
    await db.repo('FeeTemplates').insert({ Name: 'Gold', Fees: 150 });
    asserts.assertEquals(exec.txOpened, 1, 'the close+insert ran in a tx');
    asserts.assertEquals(
      exec.calls.map((c) => c.type),
      ['SELECT', 'UPDATE', 'INSERT'],
    );

    // Close UPDATE sets EffectiveTo (to the cutover) on the current row.
    const upd = exec.calls[1] as { data: Row; where?: Row };
    asserts.assert('EffectiveTo' in upd.data, 'close sets EffectiveTo');
    asserts.assertExists(upd.where, 'close filters by key + @AsOf');

    // Insert carries EffectiveFrom + inherits the current version's end
    // (the sentinel here).
    const ins = exec.calls[2] as { data: Row[] };
    const row = ins.data[0]!;
    asserts.assertEquals(row.Name, 'Gold');
    asserts.assertInstanceOf(row.EffectiveFrom, Date);
    asserts.assertInstanceOf(row.EffectiveTo, Date);
    asserts.assertEquals(
      (row.EffectiveTo as Date).toISOString(),
      SENTINEL,
      'new version inherits the open (sentinel) end',
    );
  });

  it('first version (no current) skips the close: SELECT then INSERT', async () => {
    const { db, exec } = setup({ FeeTemplates });
    exec.selectRows = []; // no current version
    await db.repo('FeeTemplates').insert({ Name: 'New', Fees: 1 });
    asserts.assertEquals(exec.calls.map((c) => c.type), ['SELECT', 'INSERT']);
  });

  it('update is disabled (a partial payload would drop unspecified columns)', async () => {
    const { db, exec } = setup({ FeeTemplates });
    exec.selectRows = [CURRENT];
    await asserts.assertRejects(
      () => db.repo('FeeTemplates').update({ Name: 'Gold', Fees: 150 }),
      NormUnsupportedError,
    );
    asserts.assertEquals(exec.calls.length, 0); // never reaches the engine
  });

  it('upsert is disabled', async () => {
    const { db, exec } = setup({ FeeTemplates });
    exec.selectRows = [CURRENT];
    await asserts.assertRejects(
      () =>
        db.repo('FeeTemplates').upsert(
          { Name: 'Gold', Fees: 150 },
          { conflictKeys: ['Id'] },
        ),
      NormUnsupportedError,
    );
    asserts.assertEquals(exec.calls.length, 0);
  });

  it('delete is disabled', async () => {
    const { db } = setup({ FeeTemplates });
    await asserts.assertRejects(
      () => db.repo('FeeTemplates').delete({ '@Name': 'Gold' }),
      NormUnsupportedError,
    );
  });

  it('truncate is disabled', async () => {
    const { db } = setup({ FeeTemplates });
    await asserts.assertRejects(
      () => db.repo('FeeTemplates').truncate(),
      NormUnsupportedError,
    );
  });

  it('the virtual @AsOf filter rewrites to a from/to range (not stored)', async () => {
    // AsOf is filter-only: not a real column, not in the schema.
    asserts.assert(!('AsOf' in FeeTemplates.columns), 'AsOf is not a column');
    const { db, exec } = setup({ FeeTemplates });
    const at = new Date('2025-06-01T00:00:00Z');
    await db.repo('FeeTemplates').find({ '@AsOf': at });
    const sel = exec.calls.find((c) => c.type === 'SELECT') as {
      where?: unknown;
    };
    const w = JSON.stringify(sel.where);
    asserts.assertStringIncludes(w, 'EffectiveFrom');
    asserts.assertStringIncludes(w, 'EffectiveTo');
    asserts.assert(!w.includes('AsOf'), '@AsOf is rewritten away');
  });

  it('rejects an encrypted temporal key at definition time', () => {
    asserts.assertThrows(() =>
      Entity('bad', {
        id: Column.uuid(),
        secret: Column.varchar(30).encrypt(),
      }, { pk: ['id'], temporal: { key: ['secret'] } })
    );
  });

  it('rejects a temporal column name collision', () => {
    asserts.assertThrows(() =>
      Entity('bad2', {
        id: Column.uuid(),
        k: Column.varchar(10),
        EffectiveFrom: Column.timestamp(),
      }, { pk: ['id'], temporal: { key: ['k'] } })
    );
  });
});

describe('norm temporal — live SQLite', () => {
  const Templates = Entity('fee_templates', {
    Id: Column.uuid().default(() => crypto.randomUUID()),
    Name: Column.varchar(30),
    Fees: Column.integer(),
  }, { pk: ['Id'], temporal: { key: ['Name'] } });

  let dir = '';
  let norm: Norm;
  let db: NormDb<{ Templates: typeof Templates }>;

  beforeAll(async () => {
    dir = await makeTempDir();
    norm = new Norm({ database: { dialect: 'sqlite', path: dir } });
    db = norm.use(Schema('App', { Templates }));
    await norm.connect();
    // Hand-roll the table (Migrator temporal support is a follow-up):
    // the versioned columns + the one-current-per-key constraint.
    await db.raw(
      `CREATE TABLE fee_templates (
         Id TEXT PRIMARY KEY,
         Name TEXT NOT NULL,
         Fees INTEGER NOT NULL,
         EffectiveFrom TEXT NOT NULL,
         EffectiveTo TEXT NOT NULL,
         UNIQUE (Name, EffectiveTo)
       )`,
    );
  });
  afterAll(async () => {
    await norm.disconnect();
    await removeDir(dir, { recursive: true });
  });

  // `EffectiveFrom` / `EffectiveTo` are now first-class in the type — no
  // casts. (This engine returns them as ISO strings at read time, so `ms()`
  // parses defensively.)
  const sentinel = new Date(SENTINEL);
  const ms = (v: Date) => new Date(v).getTime();

  it('supersede builds a versioned timeline; one current per key', async () => {
    const repo = db.repo('Templates');
    await repo.insert({ Name: 'Gold', Fees: 100 });
    await repo.insert({ Name: 'Gold', Fees: 120 });
    await repo.insert({ Name: 'Gold', Fees: 150 });
    // An independent key keeps its own timeline.
    await repo.insert({ Name: 'Silver', Fees: 10 });

    // Exactly one CURRENT version of Gold, and it is the latest write.
    const current = await repo.find({
      '@Name': 'Gold',
      '@EffectiveTo': sentinel,
    });
    asserts.assertEquals(current.count, 1);
    asserts.assertEquals(current.data[0]!.Fees, 150);

    // Every version of Gold is retained.
    const all = await repo.find({ '@Name': 'Gold' }, {
      orderBy: { '@EffectiveFrom': 'ASC' },
    });
    asserts.assertEquals(all.count, 3);
    asserts.assertEquals(all.data.map((r) => r.Fees), [100, 120, 150]);

    // The superseded versions are closed (non-sentinel end), and the
    // periods are contiguous & non-overlapping (each close == next from).
    const closed = all.data.filter((r) => ms(r.EffectiveTo) !== ms(sentinel));
    asserts.assertEquals(closed.length, 2, 'two closed versions');
    for (let i = 0; i < all.data.length - 1; i++) {
      asserts.assertEquals(
        ms(all.data[i]!.EffectiveTo),
        ms(all.data[i + 1]!.EffectiveFrom),
        'close of one version == open of the next (no gap/overlap)',
      );
    }

    // Silver is untouched by Gold's supersedes.
    const silver = await repo.find({
      '@Name': 'Silver',
      '@EffectiveTo': sentinel,
    });
    asserts.assertEquals(silver.count, 1);
    asserts.assertEquals(silver.data[0]!.Fees, 10);

    // Point-in-time via the virtual @AsOf column: pick an instant inside
    // the FIRST version's period; @AsOf rewrites to the from/to range.
    const v1 = all.data[0]!;
    const mid = new Date((ms(v1.EffectiveFrom) + ms(v1.EffectiveTo)) / 2);
    const asOf = await repo.find({ '@Name': 'Gold', '@AsOf': mid });
    asserts.assertEquals(asOf.count, 1);
    asserts.assertEquals(asOf.data[0]!.Fees, 100);

    // @AsOf: now → the current version. Real wall-clock `new Date()`
    // can race the monotonic supersede clock (which strictly advances
    // even within the same real millisecond, to keep rapid same-key
    // supersedes ordered) — probe just after the CURRENT version's own
    // EffectiveFrom instead, which is what "now" needs to mean here.
    const currentGold = all.data[2]!;
    const nowVersion = await repo.find({
      '@Name': 'Gold',
      '@AsOf': new Date(ms(currentGold.EffectiveFrom as never) + 1),
    });
    asserts.assertEquals(nowVersion.count, 1);
    asserts.assertEquals(nowVersion.data[0]!.Fees, 150);
  });

  it('supplied EffectiveFrom schedules a future version; past is rejected', async () => {
    const repo = db.repo('Templates');
    const future = new Date(Date.now() + 60_000); // +1 min
    const v1 = await repo.insert({ Name: 'Platinum', Fees: 500 }); // v1 [now, sentinel)
    // Split at `future`: v1 closes at future, v2 = [future, sentinel).
    await repo.insert({ Name: 'Platinum', Fees: 600, EffectiveFrom: future });

    const all = await repo.find({ '@Name': 'Platinum' }, {
      orderBy: { '@EffectiveFrom': 'ASC' },
    });
    asserts.assertEquals(all.data.map((r) => r.Fees), [500, 600]);
    asserts.assertEquals(
      ms(all.data[0]!.EffectiveTo),
      future.getTime(),
      'the prior version now closes at the scheduled instant',
    );

    // Right now the old version is still in force; after `future`, the
    // new. Same wall-clock-vs-monotonic-clock race as above — probe
    // just after v1's own EffectiveFrom rather than an independently
    // captured `new Date()`.
    const nowV = await repo.find({
      '@Name': 'Platinum',
      '@AsOf': new Date(ms(v1.data[0]!.EffectiveFrom as never) + 1),
    });
    asserts.assertEquals(nowV.data[0]!.Fees, 500);
    const laterV = await repo.find({
      '@Name': 'Platinum',
      '@AsOf': new Date(future.getTime() + 1000),
    });
    asserts.assertEquals(laterV.data[0]!.Fees, 600);

    // A past EffectiveFrom is rejected — history is immutable.
    const err = await asserts.assertRejects(
      () =>
        repo.insert({
          Name: 'Platinum',
          Fees: 700,
          EffectiveFrom: new Date(Date.now() - 60_000),
        }),
      NormQueryError,
    );
    asserts.assertEquals((err as NormQueryError).code, 'TEMPORAL_PAST');
  });
});
