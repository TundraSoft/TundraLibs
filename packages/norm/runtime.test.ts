/**
 * Runtime black-box suite over a mock Executor — no database needed.
 * Covers: compile validation, generated-Guardian behavior (defaults
 * via .optional(), scopes, lov), the write pipeline (hooks →
 * transforms → validation → post-defaults → encrypt+hash), the read
 * pipeline (decrypt, hidden strip, joins, afterRead), transactions,
 * and metadata-only events.
 */

import { describe, it } from '@tundralibs/compat/test';
import * as asserts from '@std/asserts';
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
  type InsertOf,
  Norm,
  NormDb,
  NormDefinitionError,
  NormHookError,
  NormQueryError,
  NormValidationError,
  type ProjectedRowOf,
  QueryAccessor,
  ReadRepo,
  type ReadRowOf,
  Repo,
  Schema,
  type Session,
  use,
} from './mod.ts';
import { defaultHash } from './crypto.ts';

type Row = Record<string, unknown>;
type Equal<X, Y> = (<T>() => T extends X ? 1 : 2) extends
  (<T>() => T extends Y ? 1 : 2) ? true : false;
type Expect<T extends true> = T;

// ── Mock executor ────────────────────────────────────────────────────

class MockExecutor implements Executor {
  withAdvisoryLock<T>(
    _key: string,
    _timeoutMs: number,
    fn: () => Promise<T>,
  ): Promise<T> {
    return fn();
  }
  raw(
    sql: string,
    params?: Record<string, unknown>,
    txId?: string,
    // deno-lint-ignore no-explicit-any
  ): Promise<any> {
    this.rawCalls?.push({ sql, params, txId });
    return Promise.resolve({ data: [], count: 0, time: 0, isSlow: false });
  }
  public rawCalls?: Array<
    { sql: string; params?: Record<string, unknown>; txId?: string }
  >;

  // ── Savepoint seam: the driver owns create / rollback-to / release
  // now, so the mock just counts how many savepoints norm opened and
  // models the callback semantics (inner throw is catchable → outer
  // survives; a succeeded block returns its value). ──
  public savepointEnters = 0;
  public savepointTxIds: string[] = [];

  public calls: Array<{ q: ExecutorQuery; txId: string | undefined }> = [];
  public selectQueue: Row[][] = [];
  public updateCount = 3;
  public capabilities = {
    transactions: true,
    transactionalDdl: true,
    alterColumns: true,
    alterConstraints: true,
    advisoryLock: false,
    dialect: 'sqlite' as const,
  };
  public txCounter = 0;
  public committed: string[] = [];
  public rolledBack: string[] = [];
  public failCommit = false;
  public failRollback = false;

  // deno-lint-ignore require-await
  async execute<R extends Record<string, unknown>>(
    q: ExecutorQuery,
    txId?: string,
  ): Promise<EngineQueryResult<R>> {
    this.calls.push({ q, txId });
    const result = (data: Row[], count?: number): EngineQueryResult<R> =>
      ({
        type: q.type,
        data: data as R[],
        count: count ?? data.length,
        time: 1,
        isSlow: false,
      }) as unknown as EngineQueryResult<R>;
    switch (q.type) {
      case 'SELECT':
        return result(this.selectQueue.shift() ?? []);
      case 'INSERT':
      case 'UPSERT': {
        const rows = (q as { data: Row | Row[] }).data;
        const arr = Array.isArray(rows) ? rows : [rows];
        // Echo RETURNING: copies, so repo post-processing does not
        // mutate what the IR captured.
        return result(arr.map((r) => ({ ...r })));
      }
      case 'UPDATE':
      case 'DELETE':
        return result([], this.updateCount);
      case 'COUNT':
        return result([{ Count: '42' }]);
      case 'TRUNCATE':
        return result([]);
      default:
        return result([]);
    }
  }

  async transaction<T>(
    run: (session: Session) => Promise<T>,
    _options?: EngineTransactionOptions,
  ): Promise<T> {
    const id = `tx-${++this.txCounter}`;
    let result: T;
    try {
      result = await run(this.#session(id));
    } catch (e) {
      // The callback threw → ROLLBACK. A rollback failure is swallowed
      // (driver parity) so the original error surfaces unmasked — never
      // attached as a spurious cause.
      try {
        if (this.failRollback) throw new Error('rollback-fail');
        this.rolledBack.push(id);
      } catch { /* driver swallows the rollback failure */ }
      throw e;
    }
    if (this.failCommit) throw new Error('commit-fail');
    this.committed.push(id);
    return result;
  }

  /** A session that models the driver's SAVEPOINT callback: the inner
   * block's throw propagates (caller catches → outer tx survives); a
   * succeeded block returns its value. Savepoints share the tx id. */
  #session(id: string): Session {
    return {
      id,
      savepoint: <T>(run: (sp: Session) => Promise<T>): Promise<T> => {
        this.savepointEnters++;
        this.savepointTxIds.push(id);
        return run(this.#session(id));
      },
    };
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

  lastOf(type: string): { q: ExecutorQuery; txId: string | undefined } {
    const hit = [...this.calls].reverse().find((c) => c.q.type === type);
    if (hit === undefined) throw new Error(`no ${type} executed`);
    return hit;
  }
}

// ── Fixtures ─────────────────────────────────────────────────────────

const hookLog: string[] = [];

const Users = Entity('users', {
  id: Column.uuid().default({ $$_expression: 'UUID' }),
  email: Column.varchar(255)
    .beforeWrite((v) => v.trim().toLowerCase())
    .encrypt().hash(),
  status: Column.varchar(16).lov(['active', 'banned', 'pending'])
    .default('pending'),
  age: Column.integer().min(13).nullable(),
  updatedAt: Column.timestamp().default(() => new Date('2026-01-01'))
    .defaultOnUpdate(() => new Date('2026-02-02')),
  passwordHash: Column.varchar(64).hidden().unfilterable(),
  displayName: Column.varchar(120).minLength(2).afterRead((v) => v.trim()),
}, {
  pk: ['id'],
  update: ['status', 'age', 'passwordHash', 'displayName'],
  hooks: {
    beforeInsert: (row) => {
      hookLog.push('beforeInsert');
      return { ...row, displayName: `~${row.displayName}` };
    },
    beforeUpdate: () => {
      hookLog.push('beforeUpdate');
    },
    afterRead: (row) => {
      hookLog.push('afterRead');
      return row;
    },
  },
});

const Posts = Entity('posts', {
  id: Column.integer(),
  authorId: Column.uuid(),
  title: Column.varchar(200),
  draft: Column.boolean().default(true),
}, {
  pk: ['id'],
  fk: { Author: { model: 'Users', on: { authorId: 'id' } } },
});

const ActivePosts = Entity('active_posts', {
  id: Column.integer(),
  title: Column.varchar(200),
}, {
  type: 'VIEW',
  query: {
    type: 'SELECT',
    table: 'posts',
    columns: ['id', 'title'],
    projection: { '@id': true, '@title': true },
    where: { '@draft': false },
  },
});

const Titles = Entity('titles', { title: Column.varchar(200) }, {
  type: 'QUERY',
  query: {
    type: 'SELECT',
    table: 'active_posts',
    columns: ['title'],
    projection: { '@title': true },
  },
});

const SECRET = 'runtime-test-secret';

function makeDb(): {
  db: NormDb<ReturnType<typeof registry>>;
  exec: MockExecutor;
  events: Array<[string, ...unknown[]]>;
} {
  const exec = new MockExecutor();
  const events: Array<[string, ...unknown[]]> = [];
  const runtime = compileRuntime(
    registry(),
    { secret: SECRET },
    exec,
    (event, ...args) => void events.push([event, ...args]),
  );
  return { db: new NormDb(runtime, exec, undefined), exec, events };
}

function registry() {
  return use(
    Schema('Blog', { Users, Posts, ActivePosts, Titles }),
  );
}

// ── Tests ────────────────────────────────────────────────────────────

describe('norm.runtime (compile + repos over mock executor)', () => {
  it(
    'compile validation: secret required, algorithms checked, ' +
      'expression defaults on encrypted columns rejected',
    () => {
      const exec = new MockExecutor();
      const noop = () => {};
      asserts.assertThrows(
        () => compileRuntime(registry(), {}, exec, noop),
        NormDefinitionError,
        'secret',
      );
      asserts.assertThrows(
        () =>
          compileRuntime(
            registry(),
            {
              secret: SECRET,
              algorithm: 'ROT13' as never,
            },
            exec,
            noop,
          ),
        NormDefinitionError,
        'unknown algorithm',
      );
      // Expression defaults on encrypted columns are rejected at
      // DEFINITION time now (the asserts layer runs inside Entity()) —
      // failing earlier than the old compile-time rejection.
      asserts.assertThrows(
        () =>
          Entity('bad', {
            id: Column.integer(),
            sec: Column.varchar(64).default({ $$_expression: 'X' }).encrypt(),
          }, { pk: ['id'] }),
        NormDefinitionError,
        'bypass encryption',
      );
      // …and compile catches the same thing for HAND-BUILT registries
      // that never went through Entity().
      const Ok = Entity('ok', {
        id: Column.integer(),
        sec: Column.varchar(64).encrypt(),
      }, { pk: ['id'] });
      const forged = {
        ...Ok,
        columns: {
          ...Ok.columns,
          sec: {
            ...Ok.columns.sec,
            default: { insert: { $$_expression: 'X' } },
          },
        },
      } as unknown as typeof Ok;
      asserts.assertThrows(
        () =>
          compileRuntime(
            { Bad: forged },
            { secret: SECRET },
            exec,
            noop,
          ),
        NormDefinitionError,
        'bypass encryption',
      );
    },
  );

  it('repo(): kind-matched accessors, cached, unknown key throws', () => {
    const { db } = makeDb();
    const users = db.repo('Users');
    asserts.assertEquals(users instanceof Repo, true);
    asserts.assertStrictEquals(db.repo('Users'), users);
    asserts.assertEquals(db.repo('ActivePosts') instanceof ReadRepo, true);
    asserts.assertEquals(
      db.repo('ActivePosts') instanceof Repo,
      false,
    );
    asserts.assertEquals(db.repo('Titles') instanceof QueryAccessor, true);
    asserts.assertThrows(
      () => db.repo('Ghost' as never),
      Error,
      "Unknown entity 'Ghost'",
    );
    type _usersIsRepo = Expect<
      Equal<
        ReturnType<typeof db.repo<'Users'>> extends Repo<infer _R, infer _S>
          ? true
          : false,
        true
      >
    >;
  });

  it(
    'insert: hooks → transforms → GENERATED-GUARDIAN defaults → ' +
      'expression injection → encrypt+hash → RETURNING pipeline',
    async () => {
      const { db, exec } = makeDb();
      hookLog.length = 0;
      const { data: rows, ...envelope } = await db.repo('Users').insert({
        email: '  ADA@Example.COM ',
        passwordHash: 'bcrypt$x',
        displayName: ' Ada ',
      });
      // The envelope rides along: ULID id, op, count.
      asserts.assertEquals(envelope.op, 'INSERT');
      asserts.assertEquals(envelope.count, 1);
      asserts.assertEquals(envelope.id.length, 26);
      asserts.assertEquals(envelope.txId, undefined);

      // The IR captured the fully-prepared row.
      const ir = exec.lastOf('INSERT').q as { data: Row[] };
      const sent = ir.data[0]!;
      // Guardian filled the declared defaults via .optional(default).
      asserts.assertEquals(sent.status, 'pending');
      asserts.assertEquals(sent.updatedAt, new Date('2026-01-01'));
      // Expression default injected AFTER validation (DB-evaluated).
      asserts.assertEquals(sent.id, { $$_expression: 'UUID' });
      // beforeWrite normalized, then encrypted — ciphertext, not plain.
      asserts.assertEquals(typeof sent.email, 'string');
      asserts.assertNotEquals(sent.email, 'ada@example.com');
      // Hash sibling: digest of the TRANSFORMED plaintext.
      asserts.assertEquals(
        sent.email_hash,
        await defaultHash('ada@example.com', 'SHA-256'),
      );
      // beforeInsert row hook replacement applied before everything.
      asserts.assertEquals(sent.displayName, '~ Ada ');

      // RETURNING: decrypted, hidden stripped, afterRead transform ran
      // (trim applied to the hook-prefixed '~ Ada ').
      const row = rows[0]!;
      asserts.assertEquals(row.email, 'ada@example.com');
      asserts.assertEquals('passwordHash' in row, false);
      asserts.assertEquals(row.displayName, '~ Ada');
      asserts.assertEquals(hookLog.includes('beforeInsert'), true);
      asserts.assertEquals(hookLog.includes('afterRead'), true);

      type _typed = Expect<
        Equal<
          'passwordHash' extends keyof (typeof rows)[number] ? true : false,
          false
        >
      >;
    },
  );

  it('insert validation: lov, missing required, batch prefixes', async () => {
    const { db } = makeDb();
    await asserts.assertRejects(
      () =>
        db.repo('Users').insert({
          email: 'a@b.c',
          passwordHash: 'x',
          displayName: 'Ada',
          status: 'sleepy' as never,
        }),
      NormValidationError,
    );
    // Batch: the bad row is addressed as [1].
    const err = await asserts.assertRejects(
      () =>
        db.repo('Users').insert([
          { email: 'a@b.c', passwordHash: 'x', displayName: 'Ada' },
          { passwordHash: 'x', displayName: 'No Email' } as never,
        ]),
      NormValidationError,
    );
    const issues = (err as NormValidationError).context.issues;
    asserts.assertEquals(issues.some((i) => i.path.startsWith('[1].')), true);
  });

  it(
    'update: scope enforced by the guardian; system defaultOnUpdate ' +
      'injected post-validation; WHERE guard blocks encrypted refs',
    async () => {
      const { db, exec } = makeDb();
      hookLog.length = 0;

      const { count } = await db.repo('Users').update(
        { status: 'banned' },
        { '@status': 'active' },
      );
      asserts.assertEquals(count, 3);
      const ir = exec.lastOf('UPDATE').q as { data: Row };
      // updatedAt is OUTSIDE the update pick-list (norm-owned for
      // callers) but its defaultOnUpdate still auto-touches.
      asserts.assertEquals(ir.data.updatedAt, new Date('2026-02-02'));
      asserts.assertEquals(ir.data.status, 'banned');
      asserts.assertEquals(hookLog.includes('beforeUpdate'), true);

      // email is not in the update scope — strict guardian rejects it.
      await asserts.assertRejects(
        () =>
          db.repo('Users').update(
            { email: 'x@y.z' } as never,
            { '@status': 'active' },
          ),
        NormValidationError,
      );

      // unfilterable() columns are never filterable (email is now
      // hashed, so it rewrites — passwordHash is the hard block).
      await asserts.assertRejects(
        () =>
          db.repo('Users').update(
            { status: 'banned' },
            { '@passwordHash': 'x' },
          ),
        Error,
        'not filterable',
      );
    },
  );

  it(
    'find: default projection hides hidden(), decrypts, runs ' +
      'afterRead; explicit projection opts hidden back in',
    async () => {
      const { db, exec } = makeDb();
      const cipher = await db.encrypt('ada@example.com');
      exec.selectQueue.push([{
        id: 'u1',
        email: cipher,
        status: 'active',
        age: 30,
        updatedAt: new Date('2026-01-01'),
        displayName: ' Ada ',
      }]);

      const { data: rows } = await db.repo('Users').find();
      const ir = exec.lastOf('SELECT').q as { projection: Row };
      asserts.assertEquals('@passwordHash' in ir.projection, false);
      asserts.assertEquals(rows[0]!.email, 'ada@example.com');
      asserts.assertEquals(rows[0]!.displayName, 'Ada'); // afterRead trim

      type _hiddenGone = Expect<
        Equal<
          'passwordHash' extends keyof (typeof rows)[number] ? true : false,
          false
        >
      >;

      // Explicit projection can opt the hidden column back in.
      exec.selectQueue.push([{ passwordHash: 'h' }]);
      const { data: picked } = await db.repo('Users').find(undefined, {
        project: { '@passwordHash': true },
      });
      asserts.assertEquals(picked[0]!.passwordHash, 'h');
    },
  );

  it(
    'find with belongsTo projection: LEFT join IR, relation decrypt ' +
      'and unwrap',
    async () => {
      const { db, exec } = makeDb();
      const cipher = await db.encrypt('ada@example.com');
      exec.selectQueue.push([
        {
          id: 1,
          title: 'Hello',
          Author: { id: 'u1', email: cipher, status: 'active' },
        },
        { id: 2, title: 'Orphan', Author: null },
      ]);

      const { data: rows } = await db.repo('Posts').find(undefined, {
        project: { '@id': true, '@title': true, '@Author': true },
      });
      const ir = exec.lastOf('SELECT').q as {
        joins: Record<string, { table: string; type: string }>;
      };
      asserts.assertEquals(ir.joins.Author!.table, 'users');
      asserts.assertEquals(ir.joins.Author!.type, 'LEFT');

      const author = rows[0]!.Author as Row;
      asserts.assertEquals(author.email, 'ada@example.com'); // decrypted
      asserts.assertEquals(rows[1]!.Author, null); // unwrapped
    },
  );

  it(
    'reverse relation projection: hasMany join derived from the FK',
    async () => {
      const { db, exec } = makeDb();
      exec.selectQueue.push([{
        id: 'u1',
        Posts: [{ id: 1, title: 'a' }, null],
      }]);
      const { data: rows } = await db.repo('Users').find(undefined, {
        project: { '@id': true, '@Posts': { '@id': true, '@title': true } },
      });
      const ir = exec.lastOf('SELECT').q as {
        joins: Record<string, { table: string }>;
        aggregates: Record<string, unknown>;
      };
      asserts.assertEquals(ir.joins.Posts!.table, 'posts');
      asserts.assertEquals('Posts' in ir.aggregates, true);
      // hasMany: null placeholders dropped, array kept. The projected
      // TYPE has Posts as an array of { id; title } (reverse relation
      // resolved from the FK) — pin it.
      asserts.assertEquals(rows[0]!.Posts, [{ id: 1, title: 'a' }]);
      type _revArray = Expect<
        Equal<
          (typeof rows)[number]['Posts'],
          { id: number; title: string }[]
        >
      >;
    },
  );

  it(
    'hashed columns filter transparently — plaintext equality rewrites ' +
      'to digest on the sibling; non-equality ops rejected',
    async () => {
      const { db, exec } = makeDb();
      // Bare equality.
      exec.selectQueue.push([]);
      await db.repo('Users').find({ '@email': '  ADA@Example.COM ' });
      let ir = exec.lastOf('SELECT').q as { where: Row };
      asserts.assertEquals(ir.where['@email'], undefined);
      asserts.assertEquals(
        ir.where['@email_hash'],
        await defaultHash('ada@example.com', 'SHA-256'),
      );

      // $in list — each element normalized + hashed.
      exec.selectQueue.push([]);
      await db.repo('Users').find({ '@email': { $in: ['A@B.C', 'x@y.z'] } });
      ir = exec.lastOf('SELECT').q as { where: Row };
      asserts.assertEquals(
        (ir.where['@email_hash'] as { $in: string[] }).$in,
        [
          await defaultHash('a@b.c', 'SHA-256'),
          await defaultHash('x@y.z', 'SHA-256'),
        ],
      );

      // Composes with $or and plain columns untouched.
      exec.selectQueue.push([]);
      await db.repo('Users').find({
        $or: [{ '@email': 'a@b.c' }, { '@status': 'active' }],
      });
      const orIr = exec.lastOf('SELECT').q as unknown as {
        where: { $or: Row[] };
      };
      asserts.assertEquals('@email_hash' in orIr.where.$or[0]!, true);
      asserts.assertEquals(orIr.where.$or[1]!['@status'], 'active');

      // update()/delete() filter by hashed plaintext too.
      await db.repo('Users').update({ status: 'banned' }, {
        '@email': 'a@b.c',
      });
      const uir = exec.lastOf('UPDATE').q as { where: Row };
      asserts.assertEquals(
        uir.where['@email_hash'],
        await defaultHash('a@b.c', 'SHA-256'),
      );

      // Non-equality operator on a hashed column is rejected.
      await asserts.assertRejects(
        () => db.repo('Users').find({ '@email': { $like: 'a%' } as never }),
        NormQueryError,
        'equality only',
      );
    },
  );

  it(
    'count coerces BIGINT strings; QueryAccessor re-issues the ' +
      'stored SELECT with pagination',
    async () => {
      const { db, exec } = makeDb();
      asserts.assertEquals((await db.repo('Posts').count()).count, 42);

      exec.selectQueue.length = 0;
      exec.selectQueue.push([{ title: 't' }]);
      const titles = await db.repo('Titles').find({ limit: 5, offset: 10 });
      asserts.assertEquals(titles.data, [{ title: 't' }]);
      asserts.assertEquals(titles.op, 'SELECT');
      const ir = exec.lastOf('SELECT').q as {
        table: string;
        limit?: number;
        offset?: number;
      };
      asserts.assertEquals(ir.table, 'active_posts');
      asserts.assertEquals(ir.limit, 5);
      asserts.assertEquals(ir.offset, 10);
    },
  );

  it(
    'transactions: tx-scoped handle stamps txId, commits, rolls ' +
      'back on throw; events emitted',
    async () => {
      const { db, exec, events } = makeDb();

      const out = await db.transaction(async (tx) => {
        asserts.assertEquals(tx.inTransaction, true);
        await tx.repo('Posts').delete({ '@id': 1 });
        // Nesting no longer throws — it opens a savepoint on the same tx
        // (covered in full by the dedicated savepoint test below).
        const inner = await tx.transaction(() => Promise.resolve(7));
        asserts.assertEquals(inner, 7);
        return 'done';
      });
      asserts.assertEquals(out, 'done');
      asserts.assertEquals(exec.committed, ['tx-1']);
      asserts.assertEquals(exec.lastOf('DELETE').txId, 'tx-1');

      await asserts.assertRejects(
        () =>
          db.transaction(() => {
            throw new Error('boom');
          }),
        Error,
        'boom',
      );
      asserts.assertEquals(exec.rolledBack, ['tx-2']);

      const names = events.map((e) => e[0]);
      asserts.assertEquals(names.includes('transactionBegin'), true);
      asserts.assertEquals(names.includes('transactionCommit'), true);
      asserts.assertEquals(names.includes('transactionRollback'), true);
    },
  );

  it('events are metadata-only and correlate with the envelope id', async () => {
    const { db, exec, events } = makeDb();
    exec.selectQueue.push([]);
    const r = await db.repo('Posts').find();
    const call = events.find((e) => e[0] === 'call');
    asserts.assertEquals(call?.[1], 'Posts');
    asserts.assertEquals(call?.[2], 'SELECT');
    // The event's id IS the envelope's id — logs correlate 1:1.
    asserts.assertEquals(call?.[5], r.id);
    // No payload-shaped entries ride along.
    asserts.assertEquals(call?.length, 6);
  });

  it('hook failures wrap as NormHookError with the cause preserved', async () => {
    const Booby = Entity('booby', { id: Column.integer() }, {
      pk: ['id'],
      hooks: {
        beforeInsert: () => {
          throw new Error('trap');
        },
      },
    });
    const exec = new MockExecutor();
    const runtime = compileRuntime(
      use(Schema('S', { Booby })),
      {},
      exec,
      () => {},
    );
    const db = new NormDb<{ Booby: typeof Booby }>(runtime, exec, undefined);
    const err = await asserts.assertRejects(
      () => db.repo('Booby').insert({ id: 1 }),
      NormHookError,
    );
    asserts.assertEquals(
      ((err as NormHookError).cause as Error).message,
      'trap',
    );
  });

  it(
    'Norm facade: engine xor database enforced; use() composes and ' +
      'shares the pool; crypto helpers roundtrip',
    async () => {
      asserts.assertThrows(
        () => new Norm({}),
        Error,
        "pass one of 'engine' or 'database'",
      );

      // Duck-typed SQL engine — exercises resolveEngine + sqlExecutor.
      const exec = new MockExecutor();
      const fakeEngine = {
        Capabilities: { transactions: true },
        select: (q: ExecutorQuery, txId?: string) => exec.execute(q, txId),
        insert: (q: ExecutorQuery, txId?: string) => exec.execute(q, txId),
        update: (q: ExecutorQuery, txId?: string) => exec.execute(q, txId),
        delete: (q: ExecutorQuery, txId?: string) => exec.execute(q, txId),
        upsert: (q: ExecutorQuery, txId?: string) => exec.execute(q, txId),
        count: (q: ExecutorQuery, txId?: string) => exec.execute(q, txId),
        insertQuery: (q: ExecutorQuery, txId?: string) => exec.execute(q, txId),
        truncate: (q: ExecutorQuery, txId?: string) => exec.execute(q, txId),
        // Driver callback form (sqlExecutor delegates to it). Not
        // exercised in this resolveEngine smoke test.
        transaction: () => Promise.reject(new Error('tx unused in this test')),
        connect: () => Promise.resolve(),
        disconnect: () => Promise.resolve(),
      };
      const norm = new Norm({ engine: fakeEngine as never, secret: SECRET });
      const db = norm.use(Schema('Blog', { Users, Posts }));
      // Posts alone would NOT compose — its FK key 'Users' must resolve.
      asserts.assertThrows(
        () => norm.use(Schema('P', { Posts })),
        Error,
        "references entity key 'Users'",
      );
      const scoped = norm.use(Schema('P', { Users, Posts }));

      exec.selectQueue.push([]);
      await scoped.repo('Posts').find();
      asserts.assertEquals(exec.lastOf('SELECT').q.type, 'SELECT');

      const cipher = await db.encrypt('round-trip');
      asserts.assertNotEquals(cipher, 'round-trip');
      asserts.assertEquals(await db.decrypt(cipher), 'round-trip');
      asserts.assertEquals(
        await db.hash('x'),
        await defaultHash('x', 'SHA-256'),
      );
    },
  );

  // ── Adversarial-review regressions ────────────────────────────────

  it('expression markers cannot bypass scope or encryption', async () => {
    const { db } = makeDb();
    // Out-of-scope column via marker (update scope excludes email...
    // and email is also encrypted — both guards apply; use updatedAt
    // for the pure scope case).
    const err = await asserts.assertRejects(
      () =>
        db.repo('Users').update(
          { updatedAt: { $$_expression: 'NOW' } } as never,
          { '@status': 'active' },
        ),
      NormValidationError,
    );
    asserts.assertEquals(
      (err as NormValidationError).context.issues[0]!.path,
      'updatedAt',
    );
    // Marker on an ENCRYPTED column: the DB would store plaintext.
    await asserts.assertRejects(
      () =>
        db.repo('Users').insert({
          email: { $$_expression: 'CURRENT_USER' },
          passwordHash: 'x',
          displayName: 'Ada',
        } as never),
      NormValidationError,
      'bypass encryption',
    );
    // Undeclared column via marker.
    await asserts.assertRejects(
      () =>
        db.repo('Users').insert({
          email: 'a@b.c',
          passwordHash: 'x',
          displayName: 'Ada',
          ghost: { $$_expression: 'X' },
        } as never),
      NormValidationError,
      'out-of-scope',
    );
  });

  it('system-filled defaults are normalized through beforeWrite', async () => {
    const Codes = Entity('codes', {
      id: Column.integer(),
      code: Column.varchar(64).beforeWrite((v) => v.toLowerCase())
        .encrypt().hash().default('SENTINEL'),
    }, { pk: ['id'] });
    const exec = new MockExecutor();
    const runtime = compileRuntime(
      use(Schema('S', { Codes })),
      { secret: SECRET },
      exec,
      () => {},
    );
    const db = new NormDb<{ Codes: typeof Codes }>(runtime, exec);
    await db.repo('Codes').insert({ id: 1 });
    const sent = (exec.lastOf('INSERT').q as { data: Row[] }).data[0]!;
    // The defaulted value was transformed BEFORE hashing — findByHash
    // (which normalizes identically) can find defaulted rows.
    asserts.assertEquals(
      sent.code_hash,
      await defaultHash('sentinel', 'SHA-256'),
    );
  });

  it('updating an encrypted hash column to null clears the sibling', async () => {
    const Vault = Entity('vault', {
      id: Column.integer(),
      sec: Column.varchar(128).nullable().encrypt().hash(),
    }, { pk: ['id'] });
    const exec = new MockExecutor();
    const runtime = compileRuntime(
      use(Schema('S', { Vault })),
      { secret: SECRET },
      exec,
      () => {},
    );
    const db = new NormDb<{ Vault: typeof Vault }>(runtime, exec);
    await db.repo('Vault').update({ sec: null }, { '@id': 1 });
    const sent = (exec.lastOf('UPDATE').q as { data: Row }).data;
    asserts.assertEquals(sent.sec, null);
    asserts.assertEquals(sent.sec_hash, null);
  });

  it('explicit-undefined keys are dropped, never SET NULL', async () => {
    const { db, exec } = makeDb();
    await db.repo('Users').update(
      { status: undefined, age: 30 } as never,
      { '@status': 'active' },
    );
    const sent = (exec.lastOf('UPDATE').q as { data: Row }).data;
    asserts.assertEquals('status' in sent, false);
    asserts.assertEquals(sent.age, 30);
  });

  it('count() plans filter-driven joins like find()', async () => {
    const { db, exec } = makeDb();
    await db.repo('Posts').count(
      { '@Author.@status': 'active' } as never,
    );
    const ir = exec.lastOf('COUNT').q as {
      joins?: Record<string, { table: string }>;
    };
    asserts.assertEquals(ir.joins?.Author?.table, 'users');
  });

  it('value-position column refs hit the filterable guard', async () => {
    const { db } = makeDb();
    await asserts.assertRejects(
      () =>
        db.repo('Users').find(
          { '@displayName': { $eq: '@passwordHash' } } as never,
        ),
      NormQueryError,
      'not filterable',
    );
  });

  it('relation-only projections are rejected (no grouping anchor)', async () => {
    const { db } = makeDb();
    await asserts.assertRejects(
      () => db.repo('Posts').find(undefined, { project: { '@Author': true } }),
      NormQueryError,
      'only relations',
    );
  });

  it('whole-relation expansion pins the target default projection', async () => {
    const { db, exec } = makeDb();
    exec.selectQueue.push([]);
    await db.repo('Posts').find(undefined, {
      project: { '@id': true, '@Author': true },
    });
    const ir = exec.lastOf('SELECT').q as {
      aggregates: Record<string, { columns: Record<string, string> }>;
    };
    // Explicit JSON_ROW over the target's DEFAULT projection —
    // passwordHash (hidden) is not serialized even if a filter later
    // widens the shared join columns.
    const cols = Object.keys(ir.aggregates.Author!.columns);
    asserts.assertEquals(cols.includes('passwordHash'), false);
    asserts.assertEquals(cols.includes('email'), true);
  });

  it('upsert: encrypted conflict keys rejected; hash sibling joins updateOnConflict', async () => {
    const { db, exec } = makeDb();
    await asserts.assertRejects(
      () =>
        db.repo('Users').upsert(
          { email: 'a@b.c', passwordHash: 'x', displayName: 'Ada' },
          { conflictKeys: ['email'] },
        ),
      NormQueryError,
      'nondeterministic',
    );
    await db.repo('Users').upsert(
      { email: 'a@b.c', passwordHash: 'x', displayName: 'Ada' },
      { conflictKeys: ['id'], updateOnConflict: ['email', 'displayName'] },
    );
    const ir = exec.lastOf('UPSERT').q as { updateOnConflict: string[] };
    asserts.assertEquals(ir.updateOnConflict.includes('@email_hash'), true);
  });

  it('unknown-key validation issues carry the offending key as path', async () => {
    const { db } = makeDb();
    const err = await asserts.assertRejects(
      () =>
        db.repo('Users').insert({
          email: 'a@b.c',
          passwordHash: 'x',
          displayName: 'Ada',
          ghost: 1,
        } as never),
      NormValidationError,
    );
    const issues = (err as NormValidationError).context.issues;
    asserts.assertEquals(issues.some((i) => i.path === 'ghost'), true);
  });

  it('commit failure is not a rollback event; a callback throw is', async () => {
    const { db, exec, events } = makeDb();
    // COMMIT-time failure surfaces as an error but is NOT a rollback
    // event — the data may even be on the wire.
    exec.failCommit = true;
    await asserts.assertRejects(
      () => db.transaction(() => Promise.resolve(1)),
      Error,
      'commit-fail',
    );
    asserts.assertEquals(
      events.some((e) => e[0] === 'transactionRollback'),
      false,
    );

    // A callback throw → ROLLBACK (event fires). The driver swallows a
    // rollback failure so the ORIGINAL error surfaces unmasked — norm
    // attaches no spurious cause.
    exec.failCommit = false;
    exec.failRollback = true;
    const err = await asserts.assertRejects(
      () =>
        db.transaction(() => {
          throw new Error('original');
        }),
      Error,
      'original',
    );
    asserts.assertEquals((err as Error).cause, undefined);
    asserts.assertEquals(
      events.some((e) => e[0] === 'transactionRollback'),
      true,
    );
  });

  it('nested transaction() opens a SAVEPOINT via session.savepoint — no tx events', async () => {
    const { db, exec, events } = makeDb();
    await db.transaction(async (tx) => {
      // Failed inner block: the driver rolls back to the savepoint and
      // rethrows — the caller catches, the outer tx stays alive.
      await asserts.assertRejects(
        () =>
          tx.transaction((inner) => {
            // A savepoint is a NESTED scope on the SAME engine tx: a
            // fresh handle, still in-transaction (not the outer handle).
            asserts.assertEquals(inner.inTransaction, true);
            asserts.assertEquals(inner === tx, false);
            return Promise.reject(new Error('inner-boom'));
          }),
        Error,
        'inner-boom',
      );
      // Successful inner block folds in and returns its value.
      const out = await tx.transaction(() => Promise.resolve(42));
      asserts.assertEquals(out, 42);
    });

    // Two savepoints opened, both on the SAME engine transaction id
    // (the driver owns create / rollback-to / release below the seam).
    asserts.assertEquals(exec.savepointEnters, 2);
    asserts.assertEquals(new Set(exec.savepointTxIds).size, 1);

    // Savepoints are not real transactions: exactly ONE begin/commit
    // pair fired, zero rollback events (the inner throw was caught).
    asserts.assertEquals(
      events.filter((e) => e[0] === 'transactionBegin').length,
      1,
    );
    asserts.assertEquals(
      events.filter((e) => e[0] === 'transactionCommit').length,
      1,
    );
    asserts.assertEquals(
      events.some((e) => e[0] === 'transactionRollback'),
      false,
    );
  });

  it('nested block: success returns its value; a throw surfaces the clean error', async () => {
    const { db } = makeDb();
    // Success folds in and returns.
    const out = await db.transaction((tx) =>
      tx.transaction(() => Promise.resolve(9))
    );
    asserts.assertEquals(out, 9);

    // A throw inside the savepoint surfaces the ORIGINAL error, unmasked
    // (the driver owns rollback-to / release — no spurious cause). It
    // then propagates out of the outer callback, rolling the tx back.
    const err = await asserts.assertRejects(
      () =>
        db.transaction((tx) =>
          tx.transaction(() => Promise.reject(new Error('inner-boom')))
        ),
      Error,
      'inner-boom',
    );
    asserts.assertEquals((err as Error).cause, undefined);
  });

  // ── API-v2 review regressions ─────────────────────────────────────

  it('empty {} filter = all rows (no where:{}, no warning event)', async () => {
    const { db, exec, events } = makeDb();
    const warnings = () => events.filter((e) => e[0] === 'warning');
    exec.selectQueue.push([]);
    await db.repo('Posts').find({});
    asserts.assertEquals('where' in exec.lastOf('SELECT').q, false);

    await db.repo('Posts').delete({}); // explicit all-rows
    asserts.assertEquals('where' in exec.lastOf('DELETE').q, false);
    asserts.assertEquals(warnings().length, 0);

    await db.repo('Posts').delete(); // OMITTED → warning event
    asserts.assertEquals(warnings().length, 1);
    asserts.assertEquals(warnings()[0]![3], 'all-rows-delete');
    asserts.assertEquals(
      String(warnings()[0]![4]).includes('ALL rows'),
      true,
    );

    await db.repo('Users').update({ status: 'banned' }, {});
    asserts.assertEquals(warnings().length, 1); // explicit {} — no new warn
  });

  it('typed aggregates: IR shape + every guard-rail rejection', async () => {
    const { db, exec } = makeDb();
    // IR: aggregate rides oql aggregates + projection; group key kept.
    exec.selectQueue.push([]);
    await db.repo('Posts').find(undefined, {
      project: { '@authorId': true },
      aggregates: { posts: { fn: 'COUNT', column: '@id' } },
    });
    const ir = exec.lastOf('SELECT').q as {
      aggregates: Record<string, unknown>;
      projection: Record<string, unknown>;
    };
    asserts.assertEquals(ir.aggregates.posts, {
      $$_aggregate: 'COUNT',
      column: '@id',
    });
    asserts.assertEquals(ir.projection['@posts'], true);
    asserts.assertEquals(ir.projection['@authorId'], true);

    // total:true + aggregates → loud.
    await asserts.assertRejects(
      () =>
        db.repo('Posts').find(undefined, {
          aggregates: { n: { fn: 'COUNT', column: '@id' } },
          total: true,
        } as never),
      NormQueryError,
      'cannot combine with aggregates',
    );
    // Relation projections + aggregates → loud.
    await asserts.assertRejects(
      () =>
        db.repo('Users').find(undefined, {
          project: { '@id': true, '@Posts': true },
          aggregates: { n: { fn: 'COUNT', column: '@id' } },
        } as never),
      NormQueryError,
      'relation projections',
    );
    // Encrypted/unfilterable aggregate target → loud.
    await asserts.assertRejects(
      () =>
        db.repo('Users').find(undefined, {
          aggregates: { n: { fn: 'COUNT', column: '@email' } },
        } as never),
      NormQueryError,
      'meaningless',
    );
    // Alias collides with a projected key → loud.
    await asserts.assertRejects(
      () =>
        db.repo('Posts').find(undefined, {
          project: { '@title': true },
          aggregates: { title: { fn: 'COUNT', column: '@id' } },
        } as never),
      NormQueryError,
      'collides',
    );
    // Unknown fn (untyped caller) → loud.
    await asserts.assertRejects(
      () =>
        db.repo('Posts').find(undefined, {
          aggregates: { n: { fn: 'MEDIAN', column: '@id' } },
        } as never),
      NormQueryError,
      'COUNT/SUM/AVG/MIN/MAX',
    );
  });

  it('a grouped aggregate that fills the default page WARNS (never silently truncates)', async () => {
    const { db, exec, events } = makeDb();
    const warnings = () => events.filter((e) => e[0] === 'warning');
    const grouped = {
      project: { '@authorId': true },
      aggregates: { posts: { fn: 'COUNT' as const, column: '@id' as const } },
    };
    const groups = (n: number) =>
      Array.from({ length: n }, (_, i) => ({ authorId: `a${i}`, posts: 1 }));

    // Posts declares no defaultPageSize → the built-in 10. Exactly ten
    // groups came back on a limit the caller never asked for: the report
    // is almost certainly cut off, and it does NOT look cut off.
    exec.selectQueue.push(groups(10));
    await db.repo('Posts').find(undefined, grouped as never);
    asserts.assertEquals(warnings().length, 1);
    asserts.assertEquals(warnings()[0]![1], 'Posts');
    asserts.assertEquals(warnings()[0]![3], 'grouped-page-cap');
    asserts.assertStringIncludes(
      String(warnings()[0]![4]),
      'silently truncated',
    );
    // The cap itself is unchanged — still a 10-row page.
    asserts.assertEquals(
      (exec.lastOf('SELECT').q as { limit?: number }).limit,
      10,
    );

    // A short page is not a truncation.
    exec.selectQueue.push(groups(3));
    await db.repo('Posts').find(undefined, grouped as never);
    asserts.assertEquals(warnings().length, 1);

    // An EXPLICIT limit is the caller's own decision — their business.
    exec.selectQueue.push(groups(2));
    await db.repo('Posts').find(
      undefined,
      { ...grouped, limit: 2 } as never,
    );
    asserts.assertEquals(warnings().length, 1);

    // limit: 0 keeps its own unbounded-read warning, not this one.
    exec.selectQueue.push(groups(10));
    await db.repo('Posts').find(
      undefined,
      { ...grouped, limit: 0 } as never,
    );
    asserts.assertEquals(warnings().length, 2);
    asserts.assertEquals(warnings()[1]![3], 'unbounded-read');

    // A non-grouped read that fills the page is ordinary pagination.
    exec.selectQueue.push(groups(10));
    await db.repo('Posts').find();
    asserts.assertEquals(warnings().length, 2);
  });

  it('scope: reads+writes constrained, graceful, equality-only, stamped', async () => {
    const { db, exec } = makeDb();
    const scoped = db.scope({ '@status': 'active' });

    // FIND: scope AND-merges into the WHERE; envelope carries it.
    exec.selectQueue.push([]);
    const r = await scoped.repo('Users').find({ '@age': 20 } as never);
    const sel = exec.lastOf('SELECT').q as { where?: Record<string, unknown> };
    asserts.assertEquals(sel.where, {
      $and: [{ '@status': 'active' }, { '@age': 20 }],
    });
    asserts.assertEquals(r.scoped, { '@status': 'active' });

    // FIND with no caller filter → WHERE is just the scope.
    exec.selectQueue.push([]);
    await scoped.repo('Users').find();
    asserts.assertEquals(
      (exec.lastOf('SELECT').q as { where?: unknown }).where,
      { '@status': 'active' },
    );

    // GRACEFUL: Posts has no `status` column → queried UNSCOPED.
    exec.selectQueue.push([]);
    const p = await scoped.repo('Posts').find({ '@id': 1 } as never);
    asserts.assertEquals(
      (exec.lastOf('SELECT').q as { where?: unknown }).where,
      { '@id': 1 }, // no scope merged
    );
    asserts.assertEquals(p.scoped, undefined);

    // COUNT + DELETE also carry the scope.
    await scoped.repo('Users').count({ '@age': 20 } as never);
    asserts.assertEquals(
      (exec.lastOf('COUNT').q as { where?: Record<string, unknown> }).where,
      { $and: [{ '@status': 'active' }, { '@age': 20 }] },
    );
    await scoped.repo('Users').delete({ '@age': 20 } as never);
    asserts.assertEquals(
      (exec.lastOf('DELETE').q as { where?: Record<string, unknown> }).where,
      { $and: [{ '@status': 'active' }, { '@age': 20 }] },
    );

    // INSERT: scope value AUTO-FILLED onto the row.
    await scoped.repo('Users').insert({
      email: 'x@y.dev',
      displayName: 'Xy',
      passwordHash: 'h',
    } as never);
    const ins = exec.lastOf('INSERT').q as { data: Row[] };
    asserts.assertEquals(ins.data[0]!.status, 'active');

    // INSERT contradicting the scope → loud.
    await asserts.assertRejects(
      () =>
        scoped.repo('Users').insert({
          email: 'z@y.dev',
          displayName: 'Zy',
          passwordHash: 'h',
          status: 'banned',
        } as never),
      NormQueryError,
      'scope-bound',
    );

    // UPDATE moving a row out of scope → loud; the WHERE stays scoped.
    await asserts.assertRejects(
      () =>
        scoped.repo('Users').update(
          { status: 'banned' } as never,
          { '@age': 20 } as never,
        ),
      NormQueryError,
      'scope-bound',
    );
    await scoped.repo('Users').update(
      { age: 30 } as never,
      { '@age': 20 } as never,
    );
    asserts.assertEquals(
      (exec.lastOf('UPDATE').q as { where?: Record<string, unknown> }).where,
      { $and: [{ '@status': 'active' }, { '@age': 20 }] },
    );

    // EQUALITY-ONLY: operators/arrays in a scope are rejected.
    asserts.assertThrows(
      () => db.scope({ '@age': { $gt: 5 } } as never),
      NormQueryError,
      'equality',
    );
    // Chaining composes (later wins); unscoped db is unaffected.
    exec.selectQueue.push([]);
    await db.repo('Users').find({ '@age': 20 } as never);
    asserts.assertEquals(
      (exec.lastOf('SELECT').q as { where?: unknown }).where,
      { '@age': 20 }, // no scope on the base db
    );

    // TYPE-LEVEL: the scoped handle relaxes the scoped column in
    // InsertOf (status becomes optional; other required cols stay).
    const typed = db.scope({ '@status': 'active' });
    // status omitted — compiles because the scope auto-fills it.
    await typed.repo('Users').insert({
      email: 'q@y.dev',
      displayName: 'Qy',
      passwordHash: 'h',
    });
    // On the base db, status is required (default fills it, but the
    // point is the scoped handle DOESN'T need it) — omitting a truly
    // required column stays an error:
    await asserts.assertRejects(
      // @ts-expect-error displayName is required even when scoped
      () => typed.repo('Users').insert({ email: 'r@y.dev' }),
      Error,
    );
  });

  it('defaultPageSize: limit-less find pages at 10; 0 = unbounded + warning event', async () => {
    const { db, exec, events } = makeDb();
    exec.selectQueue.push([]);
    await db.repo('Users').find();
    asserts.assertEquals(
      (exec.lastOf('SELECT').q as { limit?: number }).limit,
      10, // implicit default page size
    );
    exec.selectQueue.push([]);
    await db.repo('Users').find(undefined, { limit: 3 });
    asserts.assertEquals(
      (exec.lastOf('SELECT').q as { limit?: number }).limit,
      3,
    );
    // limit: 0 = deliberate unbounded — no LIMIT, one warning event.
    exec.selectQueue.push([]);
    await db.repo('Users').find(undefined, { limit: 0 });
    asserts.assertEquals(
      'limit' in (exec.lastOf('SELECT').q as Record<string, unknown>),
      false,
    );
    const warnings = events.filter((e) => e[0] === 'warning');
    asserts.assertEquals(warnings.length, 1);
    asserts.assertEquals(warnings[0]![3], 'unbounded-read');

    // Entity-declared page size rides the definition.
    const Tiny = Entity('tiny', { id: Column.integer() }, {
      pk: ['id'],
      defaultPageSize: 2,
    });
    asserts.assertEquals(Tiny.defaultPageSize, 2);
    // Junk sizes are definition errors.
    asserts.assertThrows(
      () =>
        Entity('bad', { id: Column.integer() }, {
          pk: ['id'],
          defaultPageSize: -1,
        }),
      Error,
      'non-negative',
    );
  });

  it('filter-only to-many refs lift to correlated $exists (no fan-out)', async () => {
    const { db, exec } = makeDb();
    type WhereIR = {
      joins?: Record<string, unknown>;
      where?: Record<string, unknown>;
    };

    // find: no join for the relation — the ref becomes $exists.
    exec.selectQueue.push([]);
    await db.repo('Users').find({ '@Posts.@title': 'hello' });
    const sel = exec.lastOf('SELECT').q as WhereIR;
    asserts.assertEquals(sel.joins, undefined);
    asserts.assertEquals(sel.where, {
      $exists: {
        table: 'posts',
        on: { '@authorId': '@id' },
        where: { '@title': 'hello' },
      },
    });

    // count: same lift — no join, no over-count.
    await db.repo('Users').count({ '@Posts.@title': 'hello' } as never);
    const cnt = exec.lastOf('COUNT').q as WhereIR;
    asserts.assertEquals(cnt.joins, undefined);
    asserts.assertEquals(cnt.where?.$exists !== undefined, true);

    // Same-alias refs in ONE node share ONE subquery; $or branches
    // get branch-local EXISTS; local refs stay in place.
    exec.selectQueue.push([]);
    await db.repo('Users').find({
      $or: [
        { '@Posts.@title': 'x', '@Posts.@id': 7 },
        { '@status': 'active' },
      ],
    } as never);
    const or = (exec.lastOf('SELECT').q as WhereIR).where as {
      $or: Array<Record<string, unknown>>;
    };
    asserts.assertEquals(or.$or[0], {
      $exists: {
        table: 'posts',
        on: { '@authorId': '@id' },
        where: { '@title': 'x', '@id': 7 },
      },
    });
    asserts.assertEquals(or.$or[1], { '@status': 'active' });

    // PROJECTED to-many + same filter keeps the JOIN path: the JSON
    // aggregate GROUP-BYs the base row AND the filter shapes it.
    exec.selectQueue.push([]);
    await db.repo('Users').find({ '@Posts.@title': 'hello' }, {
      project: { '@id': true, '@Posts': { '@title': true } },
    });
    const ir = exec.lastOf('SELECT').q as WhereIR & {
      aggregates: Record<string, unknown>;
    };
    asserts.assertEquals('Posts' in ir.aggregates, true);
    asserts.assertEquals('Posts' in (ir.joins ?? {}), true);
    asserts.assertEquals(ir.where, { '@Posts.@title': 'hello' });

    // ORDER BY an unprojected to-many still refuses — an EXISTS
    // subquery has no ordering scope.
    await asserts.assertRejects(
      () =>
        db.repo('Users').find(undefined, {
          orderBy: { '@Posts.@title': 'ASC' } as never,
        }),
      NormQueryError,
      'requires projecting it',
    );
  });

  it('total:true counts to-many filters via $exists (projected SELECT joins)', async () => {
    const { db, exec } = makeDb();
    exec.selectQueue.push([]);
    const res = await db.repo('Users').find({ '@Posts.@title': 'hello' }, {
      project: { '@id': true, '@Posts': { '@title': true } },
      total: true,
    });
    asserts.assertEquals(res.total, 42); // mock COUNT
    const cnt = exec.lastOf('COUNT').q as {
      joins?: Record<string, unknown>;
      where?: Record<string, unknown>;
    };
    asserts.assertEquals(cnt.joins, undefined); // NOT the SELECT's join
    asserts.assertEquals(cnt.where?.$exists !== undefined, true);
  });

  it('zero-key objects on hashed columns get the clean rejection', async () => {
    const { db } = makeDb();
    await asserts.assertRejects(
      () => db.repo('Users').find({ '@email': new Date(0) } as never),
      NormQueryError,
      'plaintext string',
    );
    await asserts.assertRejects(
      () => db.repo('Users').find({ '@email': {} } as never),
      NormQueryError,
      'plaintext string',
    );
  });

  // ── NormResult envelope + typed filters ───────────────────────────

  it('envelope: txId inside transactions; no data key on count-only ops', async () => {
    const { db, exec } = makeDb();
    const upd = await db.repo('Users').update({ status: 'banned' }, {
      '@status': 'active',
    });
    asserts.assertEquals('data' in upd, false); // no data key AT ALL
    asserts.assertEquals(upd.txId, undefined);
    type _noData = Expect<
      Equal<'data' extends keyof typeof upd ? true : false, false>
    >;

    await db.transaction(async (tx) => {
      const res = await tx.repo('Posts').delete({ '@id': 1 });
      asserts.assertEquals(res.txId, 'tx-1');
      exec.selectQueue.push([]);
      const found = await tx.repo('Posts').find();
      asserts.assertEquals(found.txId, 'tx-1');
      return 0;
    });
  });

  it('find total: opt-in second COUNT with the same filter', async () => {
    const { db, exec } = makeDb();
    exec.selectQueue.push([{ id: 1 }, { id: 2 }]);
    const r = await db.repo('Posts').find({ '@draft': false }, {
      limit: 2,
      total: true,
    });
    // count = rows in THIS page; total = all matching (mock: 42).
    asserts.assertEquals(r.count, 2);
    asserts.assertEquals(r.total, 42);
    const cq = exec.lastOf('COUNT').q as { where?: Row };
    asserts.assertEquals(cq.where, { '@draft': false });

    // Without the opt-in there is no total (and no COUNT query).
    exec.calls.length = 0;
    exec.selectQueue.push([]);
    const r2 = await db.repo('Posts').find({ '@draft': false });
    asserts.assertEquals(r2.total, undefined);
    asserts.assertEquals(
      exec.calls.some((c) => c.q.type === 'COUNT'),
      false,
    );
  });

  it('typed filters: typos and wrong value types are compile errors', async () => {
    const { db, exec } = makeDb();
    exec.selectQueue.push([]);
    // Valid: local column, lov-narrowed value, joined belongsTo ref.
    await db.repo('Posts').find({
      $or: [{ '@draft': false }, { '@Author.@status': 'active' }],
    });
    asserts.assertEquals(exec.lastOf('SELECT').q.type, 'SELECT');

    const bad1 = () =>
      // @ts-expect-error — '@typoColumn' is not a Posts column.
      db.repo('Posts').find({ '@typoColumn': 1 });
    const bad2 = () =>
      // @ts-expect-error — draft is boolean, not string.
      db.repo('Posts').find({ '@draft': 'yes' });
    const bad3 = () =>
      // @ts-expect-error — status lov excludes 'sleepy'.
      db.repo('Users').find({ '@status': 'sleepy' });
    void [bad1, bad2, bad3];
  });

  it('type pins: reverse naming matches the runtime; projection keys validated', () => {
    // Two UNNAMED FKs to the same target: runtime mints ONLY the
    // _via_ names — the type must not offer the bare source key.
    const Nodes = Entity('nodes', { id: Column.integer() }, { pk: ['id'] });
    const Edges = Entity('edges', {
      id: Column.integer(),
      fromId: Column.integer(),
      toId: Column.integer(),
    }, {
      pk: ['id'],
      fk: {
        From: { model: 'Nodes', on: { fromId: 'id' } },
        To: { model: 'Nodes', on: { toId: 'id' } },
      },
    });
    const reg = use(Schema('G', { Nodes, Edges }));
    type G = typeof reg;
    type BareGone = ProjectedRowOf<G, 'Nodes', { '@id': true }>;
    type ViaTyped = ProjectedRowOf<
      G,
      'Nodes',
      { '@id': true; '@Edges_via_From': { '@id': true } }
    >;
    type _bare = Expect<
      Equal<'Edges' extends keyof BareGone ? true : false, false>
    >;
    type _via = Expect<
      Equal<ViaTyped['Edges_via_From'], { id: number }[]>
    >;
    // Runtime agrees: only _via_ names registered.
    const exec = new MockExecutor();
    const rt = compileRuntime(reg, {}, exec, () => {});
    const names = [...(rt.reverseMap.get('Nodes')?.keys() ?? [])];
    asserts.assertEquals(names.sort(), ['Edges_via_From', 'Edges_via_To']);

    // Projection-key validation: typos are compile errors now.
    const { db } = makeDb();
    const bad = () =>
      // @ts-expect-error — '@bogus' is not a column/relation of Posts.
      db.repo('Posts').find(undefined, { project: { '@bogus': true } });
    void bad;
  });

  it('type pins: repo keys, hidden-brand chains', () => {
    const { db } = makeDb();
    // @ts-expect-error — misspelled entity keys are compile errors.
    const bad = () => db.repo('Uesrs');
    void bad;
    // hidden() brand survives generic-CHANGING modifiers.
    const HiddenChain = Entity('hc', {
      id: Column.integer(),
      secret: Column.varchar(64).hidden().nullable(),
      token: Column.varchar(64).hidden().encrypt().hash(),
    }, { pk: ['id'] });
    type Read = ReadRowOf<typeof HiddenChain>;
    type _pin = Expect<
      Equal<'secret' extends keyof Read ? true : false, false>
    >;
    type _pin2 = Expect<
      Equal<'token' extends keyof Read ? true : false, false>
    >;
    asserts.assertEquals(HiddenChain.columns.secret.project, false);
  });

  it('type pins: insert payload and returned rows', () => {
    type Ins = InsertOf<typeof Users>;
    type _required = Expect<
      Equal<
        Ins,
        {
          email: string;
          passwordHash: string;
          displayName: string;
          id?: string;
          status?: 'active' | 'banned' | 'pending';
          age?: number | null;
          updatedAt?: Date;
        }
      >
    >;
    type Read = ReadRowOf<typeof Users>;
    type _noHidden = Expect<
      Equal<'passwordHash' extends keyof Read ? true : false, false>
    >;
    type _emailPlain = Expect<Equal<Read['email'], string>>;
    asserts.assertEquals(Users.primaryKeys, ['id']);
  });
});
