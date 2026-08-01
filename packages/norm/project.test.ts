/**
 * Projection features over a mock executor: VIRTUAL mask columns
 * (Column.mask) and EAGER relations (fk project / reverseProject) —
 * SQL shape, compute/strip pipeline, RETURNING behavior, and type
 * pins.
 */

import { describe, it } from '@tundralibs/compat/test';
import * as asserts from '@std/asserts';
import type { EngineQueryResult } from '@tundralibs/drivers';
import {
  Column,
  compileRuntime,
  type DefaultRowOf,
  Entity,
  type Executor,
  type ExecutorQuery,
  type InsertOf,
  NormDb,
  NormQueryError,
  NormValidationError,
  Schema,
  snapshot,
  toMarkdown,
  use,
} from './mod.ts';
import { buildSnapshot } from './migrations/mod.ts';

type Row = Record<string, unknown>;
type Equal<X, Y> = (<T>() => T extends X ? 1 : 2) extends
  (<T>() => T extends Y ? 1 : 2) ? true : false;
type Expect<T extends true> = T;

class MockExec implements Executor {
  withAdvisoryLock<T>(
    _key: string,
    _timeoutMs: number,
    fn: () => Promise<T>,
  ): Promise<T> {
    return fn();
  }
  // deno-lint-ignore no-explicit-any
  raw(sql: string, params?: Record<string, unknown>): Promise<any> {
    this.rawCalls?.push({ sql, params });
    return Promise.resolve({ data: [], count: 0, time: 0, isSlow: false });
  }
  public rawCalls?: Array<{ sql: string; params?: Record<string, unknown> }>;
  public capabilities = {
    transactions: true,
    transactionalDdl: true,
    alterColumns: true,
    alterConstraints: true,
    advisoryLock: false,
    dialect: 'sqlite' as const,
  };
  public calls: ExecutorQuery[] = [];
  public selectQueue: Row[][] = [];
  execute<R extends Row>(
    q: ExecutorQuery,
    _txId?: string,
  ): Promise<EngineQueryResult<R>> {
    this.calls.push(q);
    const result = (data: Row[]) =>
      Promise.resolve(
        {
          type: q.type,
          data: data as R[],
          count: data.length,
          time: 1,
          isSlow: false,
        } as unknown as EngineQueryResult<R>,
      );
    switch (q.type) {
      case 'SELECT':
        return result(this.selectQueue.shift() ?? []);
      case 'INSERT': {
        const rows = (q as unknown as { data: Row | Row[] }).data;
        return result(
          (Array.isArray(rows) ? rows : [rows]).map((r) => ({ ...r })),
        );
      }
      default:
        return result([]);
    }
  }
  transaction<T>(): Promise<T> {
    return Promise.reject(new Error('unused'));
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
  lastOf(type: string): ExecutorQuery {
    return [...this.calls].reverse().find((c) => c.type === type)!;
  }
}

// ── Fixtures ─────────────────────────────────────────────────────────

const Cards = Entity('cards', {
  id: Column.integer(),
  card: Column.varchar(32).hidden(), // raw: opt-in only
  cardDisplay: Column.mask('card', (v) => `**** ${v.slice(-4)}`),
  cardLast4: Column.mask('card', (v) => v.slice(-4)), // 2nd mask, same source
  note: Column.varchar(40).nullable(),
}, { pk: ['id'] });

const Wallets = Entity('wallets', {
  id: Column.integer(),
  cardId: Column.integer(),
}, {
  pk: ['id'],
  fk: { Card: { model: 'Cards', on: { cardId: 'id' }, reverseAs: 'Wallets' } },
});

const Users = Entity('users', {
  id: Column.integer(),
  name: Column.varchar(40),
}, { pk: ['id'] });

const Profiles = Entity('profiles', {
  userId: Column.integer(),
  bio: Column.text().nullable(),
}, {
  pk: ['userId'],
  fk: {
    User: {
      model: 'Users',
      on: { userId: 'id' },
      reverseAs: 'Profile',
      reverseProject: true, // Users default reads eager the hasOne
    },
  },
});

const Items = Entity('items', {
  id: Column.integer(),
  ownerId: Column.integer(),
  label: Column.varchar(40),
  since: Column.timestamp().nullable(),
}, {
  pk: ['id'],
  fk: {
    Owner: {
      model: 'Users',
      on: { ownerId: 'id' },
      reverseAs: 'Items',
      project: true, // Items default reads eager the belongsTo
    },
  },
});

function registry() {
  return use(Schema('S', { Cards, Wallets, Users, Profiles, Items }));
}

function makeDb() {
  const exec = new MockExec();
  const runtime = compileRuntime(registry(), {}, exec, () => {});
  return {
    db: new NormDb<ReturnType<typeof registry>>(runtime, exec, undefined),
    exec,
  };
}

describe('norm.project (masks + eager relations)', () => {
  it('masks: default read fetches the hidden source, computes, strips', async () => {
    const { db, exec } = makeDb();
    exec.selectQueue.push([
      { id: 1, card: '4111111111111111', note: 'main' },
    ]);
    const r = await db.repo('Cards').find();
    const ir = exec.lastOf('SELECT') as unknown as { projection: Row };
    // Virtual columns never reach SQL; the hidden source rides along.
    asserts.assertEquals('@cardDisplay' in ir.projection, false);
    asserts.assertEquals('@cardLast4' in ir.projection, false);
    asserts.assertEquals('@card' in ir.projection, true);

    const row = r.data[0]!;
    asserts.assertEquals(row.cardDisplay, '**** 1111');
    asserts.assertEquals(row.cardLast4, '1111');
    asserts.assertEquals('card' in row, false); // fetched only to compute
    asserts.assertEquals(row.note, 'main');

    // Types: masks read as string; hidden source absent; writes
    // exclude masks entirely.
    type _r = Expect<Equal<(typeof row)['cardDisplay'], string>>;
    type _noRaw = Expect<
      Equal<'card' extends keyof typeof row ? true : false, false>
    >;
    type _ins = Expect<
      Equal<
        'cardDisplay' extends keyof InsertOf<typeof Cards> ? true : false,
        false
      >
    >;
  });

  it('masks: explicit projections — mask only (strip), or both (no strip)', async () => {
    const { db, exec } = makeDb();
    exec.selectQueue.push([{ card: '4222222222222222' }]);
    // deno-lint-ignore no-explicit-any
    const cards = db.repo('Cards') as any;
    const only = await cards.find(undefined, {
      project: { '@id': true, '@cardDisplay': 'disp' },
    });
    asserts.assertEquals(only.data[0].disp, '**** 2222');
    asserts.assertEquals('card' in only.data[0], false);

    exec.selectQueue.push([{ card: '4333333333333333' }]);
    const both = await cards.find(undefined, {
      project: { '@card': true, '@cardLast4': true },
    });
    asserts.assertEquals(both.data[0].card, '4333333333333333');
    asserts.assertEquals(both.data[0].cardLast4, '3333');
  });

  it('masks: RETURNING carries computed masks; raw stays hidden; writes reject mask keys', async () => {
    const { db } = makeDb();
    const r = await db.repo('Cards').insert({
      id: 9,
      card: '4999999999990007',
    });
    const row = r.data[0]!;
    asserts.assertEquals(row.cardDisplay, '**** 0007');
    asserts.assertEquals(row.cardLast4, '0007');
    asserts.assertEquals('card' in row, false); // hidden strip

    await asserts.assertRejects(
      () =>
        db.repo('Cards').insert(
          { id: 10, card: 'x', cardDisplay: 'nope' } as never,
        ),
      NormValidationError,
    );
  });

  it('masks: filters and orderBy reject; sub-projections reject; whole relations compute', async () => {
    const { db, exec } = makeDb();
    // deno-lint-ignore no-explicit-any
    const cards = db.repo('Cards') as any;
    // deno-lint-ignore no-explicit-any
    const wallets = db.repo('Wallets') as any;

    await asserts.assertRejects(
      () => cards.find({ '@cardDisplay': 'x' }),
      NormQueryError,
      'not filterable',
    );
    await asserts.assertRejects(
      () => cards.find(undefined, { orderBy: { '@cardLast4': 'ASC' } }),
      NormQueryError,
      'not filterable',
    );
    await asserts.assertRejects(
      () =>
        wallets.find(undefined, {
          project: { '@id': true, '@Card': { '@cardDisplay': true } },
        }),
      Error,
      'virtual mask',
    );

    // Whole-relation rows carry computed masks, raw stripped.
    exec.selectQueue.push([
      {
        id: 1,
        Card: JSON.stringify({
          id: 9,
          note: 'n',
          card: '4111111111117777',
        }),
      },
    ]);
    const r = await wallets.find(undefined, {
      project: { '@id': true, '@Card': true },
    });
    asserts.assertEquals(r.data[0].Card.cardDisplay, '**** 7777');
    asserts.assertEquals(r.data[0].Card.cardLast4, '7777');
    asserts.assertEquals('card' in r.data[0].Card, false);
  });

  it('masks: encrypted source decodes before the fn sees it', async () => {
    const Vault = Entity('vault', {
      id: Column.integer(),
      dob: Column.timestamp().encrypt().hidden(),
      dobYear: Column.mask('dob', (v: Date) => String(v.getFullYear())),
    }, { pk: ['id'] });
    const exec = new MockExec();
    const runtime = compileRuntime(
      use(Schema('V', { Vault })),
      { secret: 'project-test-secret' },
      exec,
      () => {},
    );
    const db = new NormDb<{ Vault: typeof Vault }>(runtime, exec, undefined);
    const born = new Date('1912-06-23T00:00:00.000Z');
    const r = await db.repo('Vault').insert({ id: 1, dob: born });
    asserts.assertEquals(r.data[0]!.dobYear, '1912');
    asserts.assertEquals('dob' in r.data[0]!, false);
  });

  it('eager belongsTo: default reads join + unwrap; explicit projection replaces; RETURNING stays flat', async () => {
    const { db, exec } = makeDb();
    exec.selectQueue.push([
      { id: 1, ownerId: 7, label: 'a', Owner: '{"id":7,"name":"Ada"}' },
      { id: 2, ownerId: 8, label: 'b', Owner: null },
    ]);
    const r = await db.repo('Items').find();
    const ir = exec.lastOf('SELECT') as unknown as { joins?: Row };
    asserts.assertEquals(Object.keys(ir.joins ?? {}), ['Owner']);
    asserts.assertEquals(r.data[0]!.Owner, { id: 7, name: 'Ada' });
    asserts.assertEquals(r.data[1]!.Owner, null);
    type _eager = Expect<
      Equal<
        'Owner' extends keyof DefaultRowOf<
          ReturnType<typeof registry>,
          'Items'
        > ? true
          : false,
        true
      >
    >;

    // Explicit projection REPLACES the default — no eager join.
    exec.selectQueue.push([{ id: 1 }]);
    await db.repo('Items').find(undefined, { project: { '@id': true } });
    const ir2 = exec.lastOf('SELECT') as unknown as { joins?: Row };
    asserts.assertEquals(Object.keys(ir2.joins ?? {}), []);

    // Writes: flat RETURNING (no relation key, runtime AND type).
    const ins = await db.repo('Items').insert({
      id: 3,
      ownerId: 7,
      label: 'c',
    });
    asserts.assertEquals('Owner' in ins.data[0]!, false);
    type _flat = Expect<
      Equal<
        'Owner' extends keyof (typeof ins)['data'][number] ? true : false,
        false
      >
    >;
  });

  it('eager hasOne reverse: target default reads include it; depth-1 only', async () => {
    const { db, exec } = makeDb();
    exec.selectQueue.push([
      { id: 7, name: 'Ada', Profile: '{"userId":7,"bio":"norm author"}' },
      { id: 8, name: 'Bob', Profile: null },
    ]);
    const r = await db.repo('Users').find();
    asserts.assertEquals(r.data[0]!.Profile, {
      userId: 7,
      bio: 'norm author',
    });
    asserts.assertEquals(r.data[1]!.Profile, null);
    // Depth-1: the eager Profile row is the target's LOCAL shape — no
    // transitive 'User' key inside it.
    asserts.assertEquals(
      'User' in (r.data[0]!.Profile as unknown as Row),
      false,
    );

    // Profiles themselves have NO eager keys — plain default read.
    exec.selectQueue.push([{ userId: 7, bio: 'b' }]);
    await db.repo('Profiles').find();
    const ir = exec.lastOf('SELECT') as unknown as { joins?: Row };
    asserts.assertEquals(Object.keys(ir.joins ?? {}), []);
  });

  it('mask renamed ONTO its source key survives; chained masks read the raw source', async () => {
    const { db, exec } = makeDb();
    exec.selectQueue.push([{ id: 1, card: '4111111111111111' }]);
    // deno-lint-ignore no-explicit-any
    const cards = db.repo('Cards') as any;
    const r = await cards.find(undefined, {
      project: {
        '@id': true,
        '@cardLast4': 'card', // output lands ON the source key
        '@cardDisplay': true, // must still read the RAW source
      },
    });
    asserts.assertEquals(r.data[0].card, '1111'); // output kept, not stripped
    asserts.assertEquals(r.data[0].cardDisplay, '**** 1111'); // from raw
  });

  it('plain-column Date filters survive the where rewrite intact', async () => {
    const { db, exec } = makeDb();
    const cutoff = new Date('2020-01-01T00:00:00.000Z');
    // deno-lint-ignore no-explicit-any
    const items = db.repo('Items') as any;
    await items.find({ '@since': { $gte: cutoff } });
    const ir = exec.lastOf('SELECT') as unknown as {
      where: { '@since': { $gte: unknown } };
    };
    // A Date is object-typed with no enumerable keys — the rewrite
    // walk used to flatten it to {}.
    asserts.assertEquals(ir.where['@since'].$gte instanceof Date, true);
  });

  it('decrypt:false never feeds ciphertext to mask fns', async () => {
    const Vault = Entity('vault2', {
      id: Column.integer(),
      dob: Column.timestamp().encrypt().hidden(),
      dobYear: Column.mask('dob', (v: Date) => String(v.getFullYear())),
    }, { pk: ['id'] });
    const exec = new MockExec();
    const runtime = compileRuntime(
      use(Schema('V2', { Vault })),
      { secret: 'project-test-secret' },
      exec,
      () => {},
    );
    const db = new NormDb<{ Vault: typeof Vault }>(runtime, exec, undefined);
    exec.selectQueue.push([{ id: 1, dob: 'ciphertext-blob' }]);
    // deno-lint-ignore no-explicit-any
    const r = await (db.repo('Vault') as any).find(undefined, {
      decrypt: false,
    });
    // No crash, no ciphertext-derived garbage — the mask is skipped.
    asserts.assertEquals('dobYear' in r.data[0], false);
  });

  it('hashed JSON: $-prefixed DATA keys digest as values; op bags still work', async () => {
    const Docs = Entity('docs', {
      id: Column.integer(),
      meta: Column.json<{ $ref: string }>().encrypt().hash(),
    }, { pk: ['id'] });
    const exec = new MockExec();
    const runtime = compileRuntime(
      use(Schema('D', { Docs })),
      { secret: 'project-test-secret' },
      exec,
      () => {},
    );
    const db = new NormDb<{ Docs: typeof Docs }>(runtime, exec, undefined);
    const ins = await db.repo('Docs').insert({
      id: 1,
      meta: { $ref: 'x' } as never,
    });
    const stored = (exec.lastOf('INSERT') as unknown as { data: Row[] })
      .data[0]!.meta_hash as string;
    asserts.assertEquals(ins.count, 1);

    // Literal round-trip: the $-key object is PLAINTEXT, not a bag.
    // deno-lint-ignore no-explicit-any
    await (db.repo('Docs') as any).find({ '@meta': { $ref: 'x' } });
    const q = exec.lastOf('SELECT') as unknown as { where: Row };
    asserts.assertEquals(q.where['@meta_hash'], stored);
    // Key ORDER never changes the digest (canonicalized)…
    // deno-lint-ignore no-explicit-any
    await (db.repo('Docs') as any).find({
      '@meta': { $eq: { $ref: 'x' } }, // op-bag escape hatch, same value
    });
    const q2 = exec.lastOf('SELECT') as unknown as { where: Row };
    asserts.assertEquals(
      (q2.where['@meta_hash'] as Row).$eq,
      stored,
    );
  });

  it('eager junction with ALL-hidden locals: pk anchors fetched then stripped', async () => {
    const Posts2 = Entity('posts2', {
      id: Column.integer(),
      title: Column.varchar(40),
    }, { pk: ['id'] });
    const Tags2 = Entity('tags2', {
      id: Column.integer(),
      name: Column.varchar(40),
    }, { pk: ['id'] });
    const Junction = Entity('post_tags2', {
      postId: Column.integer().hidden(),
      tagId: Column.integer().hidden(),
    }, {
      pk: ['postId', 'tagId'],
      fk: {
        Post: {
          model: 'Posts2',
          on: { postId: 'id' },
          reverseAs: 'TagLinks2',
          project: true,
        },
        Tag: {
          model: 'Tags2',
          on: { tagId: 'id' },
          reverseAs: 'PostLinks2',
          project: true,
        },
      },
    });
    const exec = new MockExec();
    const runtime = compileRuntime(
      use(Schema('J', { Posts2, Tags2, Junction })),
      {},
      exec,
      () => {},
    );
    const db = new NormDb<{
      Posts2: typeof Posts2;
      Tags2: typeof Tags2;
      Junction: typeof Junction;
    }>(runtime, exec, undefined);
    exec.selectQueue.push([
      {
        postId: 1,
        tagId: 2,
        Post: '{"id":1,"title":"t"}',
        Tag: '{"id":2,"name":"n"}',
      },
    ]);
    const r = await db.repo('Junction').find();
    const row = r.data[0]! as unknown as Row;
    asserts.assertEquals(row.Post, { id: 1, title: 't' });
    asserts.assertEquals(row.Tag, { id: 2, name: 'n' });
    // The pk anchors were synthesis-internal — hidden stays hidden.
    asserts.assertEquals('postId' in row, false);
    asserts.assertEquals('tagId' in row, false);
  });

  it('definition guards: mask structure + reverseProject cardinality + emitters', () => {
    asserts.assertThrows(
      () => Column.mask('x', (v) => v).encrypt(),
      Error,
      'nothing to encrypt',
    );
    asserts.assertThrows(
      () =>
        Entity('t', {
          id: Column.integer(),
          m: Column.mask('ghost', (v) => v),
        }, { pk: ['id'] }),
      Error,
      "mask source 'ghost' does not exist",
    );
    asserts.assertThrows(
      () =>
        Entity('t', {
          id: Column.integer(),
          a: Column.mask('b', (v) => v),
          b: Column.mask('a', (v) => v),
        }, { pk: ['id'] }),
      Error,
      'chains are not allowed',
    );
    asserts.assertThrows(
      () =>
        Entity('t', {
          id: Column.integer(),
          c: Column.varchar(10),
          m: Column.mask('c', (v) => v),
        }, { pk: ['id'], index: { bad: ['m'] } }),
      Error,
      'virtual mask',
    );
    asserts.assertThrows(
      () =>
        Entity('t', {
          id: Column.integer(),
          uid: Column.integer(),
        }, {
          pk: ['id'],
          fk: {
            U: { model: 'Users', on: { uid: 'id' }, reverseProject: true },
          },
        }),
      Error,
      'hasOne',
    );

    // Emitters: docs mark masks; snapshots exclude them entirely.
    const md = toMarkdown({ Cards });
    asserts.assertStringIncludes(md, 'mask(card)');
    const defSnap = snapshot({ Cards });
    asserts.assertEquals(
      'cardDisplay' in defSnap.entities.Cards!.columns,
      false,
    );
    const migSnap = buildSnapshot(
      { Cards } as never,
      '2026-01-01T00:00:00.000Z',
    );
    asserts.assertEquals(
      'cardDisplay' in migSnap.entities.Cards!.columns,
      false,
    );
    asserts.assertEquals('card' in migSnap.entities.Cards!.columns, true);
  });
});
