/**
 * Repo edge paths over a mock executor: projection/filter validation
 * errors, hashed-operator taxonomy, unfilterable enforcement (local,
 * joined, value-position), relation post-processing (JSON fallback,
 * array filtering, nested decrypt), warnless/warning all-row writes,
 * updateByPK, truncate cascade, and read-only accessor hooks.
 */

import { describe, it } from '@tundralibs/compat/test';
import * as asserts from '@std/asserts';
import type { EngineQueryResult } from '@tundralibs/drivers';
import {
  Column,
  compileRuntime,
  Entity,
  type Executor,
  type ExecutorQuery,
  Norm,
  NormDb,
  NormHookError,
  NormQueryError,
  NormValidationError,
  Schema,
  use,
} from './mod.ts';
import '@tundralibs/norm/engines/sqlite';
import { registerEngine, resolveEngineFactory } from './engines/mod.ts';
import { defaultHash } from './crypto.ts';

type Row = Record<string, unknown>;

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
    const result = (data: Row[], count?: number) =>
      Promise.resolve(
        {
          type: q.type,
          data: data as R[],
          count: count ?? data.length,
          time: 1,
          isSlow: false,
        } as unknown as EngineQueryResult<R>,
      );
    switch (q.type) {
      case 'SELECT':
        return result(this.selectQueue.shift() ?? []);
      case 'INSERT':
      case 'UPSERT': {
        const rows = (q as unknown as { data: Row | Row[] }).data;
        const arr = Array.isArray(rows) ? rows : [rows];
        return result(arr.map((r) => ({ ...r })));
      }
      case 'COUNT':
        return result([{ Count: '5' }]);
      case 'UPDATE':
      case 'DELETE':
        return result([], 2);
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

const SECRET = 'repo-edges-secret';

const Owners = Entity('owners', {
  id: Column.integer(),
  name: Column.varchar(40),
  email: Column.varchar(255)
    .beforeWrite((v) => v.trim().toLowerCase())
    .encrypt().hash(),
  cipher: Column.varchar(255).encrypt(), // encrypted, NOT lookupable
  secretNote: Column.varchar(255).unfilterable(),
}, { pk: ['id'] });

const Items = Entity('items', {
  id: Column.integer(),
  ownerId: Column.integer(),
  label: Column.varchar(40).afterRead((v) => v.trim()),
}, {
  pk: ['id'],
  fk: { Owner: { model: 'Owners', on: { ownerId: 'id' }, reverseAs: 'Items' } },
});

const Renamed = Entity('renamed', {
  id: Column.integer(),
  label: Column.varchar(40),
}, {
  pk: ['id'],
  hooks: {
    beforeUpdate: (row) => ({ ...row, label: 'replaced' }),
  },
});

const deleteLog: Array<Record<string, unknown> | undefined> = [];
const Guarded = Entity('guarded', {
  id: Column.integer(),
  label: Column.varchar(40).nullable(),
}, {
  pk: ['id'],
  hooks: {
    beforeDelete: (filter) => {
      deleteLog.push(filter);
      if (filter === undefined) throw new Error('no blanket deletes');
    },
  },
});

const VOwners = Entity('v_owners', {
  id: Column.integer(),
  name: Column.varchar(40),
}, {
  type: 'VIEW',
  query: {
    type: 'SELECT',
    table: 'owners',
    columns: ['id', 'name'],
    projection: { '@id': true, '@name': true },
  },
});

const QGood = Entity('q_good', {
  name: Column.varchar(40),
}, {
  type: 'QUERY',
  query: {
    type: 'SELECT',
    table: 'v_owners',
    columns: ['name'],
    projection: { '@name': true },
  },
  hooks: {
    afterRead: (row) => ({ ...row, name: `${row.name}!` }),
  },
});

const QBad = Entity('q_bad', {
  name: Column.varchar(40),
}, {
  type: 'QUERY',
  query: {
    type: 'SELECT',
    table: 'v_owners',
    columns: ['name'],
    projection: { '@name': true },
  },
  hooks: {
    afterRead: () => {
      throw new Error('hook-boom');
    },
  },
});

// Multi-tenant entity for scope regression tests: `orgId` is the scope
// column (plain + insertable), `extKey` the upsert conflict key. NO
// per-scope unique is declared — the conflict target must therefore be
// left exactly as the caller spelled it (Postgres/SQLite reject an
// ON CONFLICT list that matches no index).
const Tickets = Entity('tickets', {
  id: Column.integer(),
  orgId: Column.integer(),
  extKey: Column.varchar(64),
  status: Column.varchar(20),
}, { pk: ['id'] });

// Same shape WITH the multi-tenant unique declared — the one case where
// folding the scope into the ON CONFLICT target names a real index.
const ScopedTickets = Entity('scoped_tickets', {
  id: Column.integer(),
  orgId: Column.integer(),
  extKey: Column.varchar(64),
  status: Column.varchar(20),
}, { pk: ['id'], unique: { orgExt: ['orgId', 'extKey'] } });

// `tenantId` is `.encrypt().hash()` AND excluded from the insert
// pick-list (disableInsert) — only the scope may set it. A scoped
// insert must store it as ciphertext + digest sibling, never plaintext.
const Docs = Entity('docs', {
  id: Column.integer(),
  tenantId: Column.varchar(64).encrypt().hash(),
  title: Column.varchar(120),
}, { pk: ['id'], insert: ['id', 'title'] });

function registry() {
  return use(
    Schema('S', {
      Owners,
      Items,
      Renamed,
      Guarded,
      VOwners,
      QGood,
      QBad,
      Tickets,
      ScopedTickets,
      Docs,
    }),
  );
}

function makeDb() {
  const exec = new MockExec();
  const events: Array<[string, ...unknown[]]> = [];
  const runtime = compileRuntime(
    registry(),
    { secret: SECRET },
    exec,
    (event, ...args) => void events.push([event, ...args]),
  );
  return {
    db: new NormDb<ReturnType<typeof registry>>(runtime, exec, undefined),
    exec,
    events,
  };
}

describe('norm.Repo (edge paths over mock executor)', () => {
  it('definition getters on Repo, ReadRepo and QueryAccessor', () => {
    const { db } = makeDb();
    asserts.assertEquals(db.repo('Owners').definition.name, 'owners');
    asserts.assertEquals(db.repo('VOwners').definition.name, 'v_owners');
    asserts.assertEquals(db.repo('QGood').definition.name, 'q_good');
  });

  it('projection validation: every malformed shape errors with its own message', async () => {
    const { db } = makeDb();
    const items = db.repo('Items');
    // deno-lint-ignore no-explicit-any
    const find = items.find.bind(items) as (
      f?: unknown,
      o?: any,
    ) => Promise<unknown>;

    await asserts.assertRejects(
      () => find(undefined, { project: { slug: true } }),
      Error,
      'must start with',
    );
    await asserts.assertRejects(
      () => find(undefined, { project: { '@label': { '@x': true } } }),
      Error,
      'sub-projection is only valid for relations',
    );
    await asserts.assertRejects(
      () => find(undefined, { project: { '@Nope': true } }),
      Error,
      'Unknown projection target',
    );
    await asserts.assertRejects(
      () => find(undefined, { project: { '@Owner': { badkey: true } } }),
      Error,
      'must start with',
    );
    await asserts.assertRejects(
      () => find(undefined, { project: { '@Owner': { '@ghost': true } } }),
      Error,
      'not declared on entity',
    );
  });

  it('joined where refs: unknown alias / unknown columns on FK and reverse', async () => {
    const { db } = makeDb();
    // deno-lint-ignore no-explicit-any
    const items = db.repo('Items') as any;
    // deno-lint-ignore no-explicit-any
    const owners = db.repo('Owners') as any;

    await asserts.assertRejects(
      () => items.find({ '@Mystery.@x': 1 }),
      Error,
      'Unknown relation alias',
    );
    await asserts.assertRejects(
      () => items.find({ '@Owner.@ghost': 1 }),
      Error,
      'not declared on entity',
    );
    // ALREADY-JOINED relations (projected) must still validate the
    // where-ref column — this used to leak 'ghost' into the join IR.
    await asserts.assertRejects(
      () =>
        owners.find({ '@Items.@ghost': 1 }, {
          project: { '@id': true, '@Items': true },
        }),
      Error,
      'not declared on entity',
    );
    await asserts.assertRejects(
      () =>
        items.find({ '@Owner.@ghost': 1 }, {
          project: { '@id': true, '@Owner': true },
        }),
      Error,
      'not declared on entity',
    );
    // The legal shape still works: projected to-many + filter on a
    // REAL column of the relation.
    await owners.find({ '@Items.@label': 'x' }, {
      project: { '@id': true, '@Items': true },
    });
  });

  it('unfilterable enforcement: local, joined, value-position and $in refs', async () => {
    const { db, exec } = makeDb();
    // deno-lint-ignore no-explicit-any
    const owners = db.repo('Owners') as any;
    // deno-lint-ignore no-explicit-any
    const items = db.repo('Items') as any;

    await asserts.assertRejects(
      () => owners.find({ '@secretNote': 'x' }),
      NormQueryError,
      'not filterable',
    );
    // encrypt() WITHOUT hash() implies unfilterable.
    await asserts.assertRejects(
      () => owners.find({ '@cipher': 'x' }),
      NormQueryError,
      'not filterable',
    );
    // Joined reference to an unfilterable target column.
    await asserts.assertRejects(
      () => items.find({ '@Owner.@secretNote': 'x' }),
      NormQueryError,
      'not filterable',
    );
    // Value-position reference (operator RHS).
    await asserts.assertRejects(
      () => owners.find({ '@name': { $eq: '@secretNote' } }),
      NormQueryError,
      'not filterable',
    );
    // Array element reference inside $in.
    await asserts.assertRejects(
      () => owners.find({ '@name': { $in: ['literal', '@secretNote'] } }),
      NormQueryError,
      'not filterable',
    );
    // Value-position JOINED reference.
    await asserts.assertRejects(
      () => items.find({ '@label': { $eq: '@Owner.@secretNote' } }),
      NormQueryError,
      'not filterable',
    );
    // ORDER BY walks the same enforcement (local, joined, arrays).
    await asserts.assertRejects(
      () => owners.find(undefined, { orderBy: { '@secretNote': 'ASC' } }),
      NormQueryError,
      'not filterable',
    );
    await asserts.assertRejects(
      () => items.find(undefined, { orderBy: { '@Owner.@secretNote': 'ASC' } }),
      NormQueryError,
      'not filterable',
    );
    // Unknown alias in an orderBy ref falls through to the join
    // planner's own, more specific error.
    await asserts.assertRejects(
      () => items.find(undefined, { orderBy: { '@Zzz.@x': 'ASC' } }),
      Error,
      'Unknown relation alias',
    );
    asserts.assertEquals(exec.calls.length, 0); // all rejected pre-engine
  });

  it('hashed filter operators: full accept/reject taxonomy', async () => {
    const { db, exec } = makeDb();
    // deno-lint-ignore no-explicit-any
    const owners = db.repo('Owners') as any;

    // Accepted: $eq / $ne / $in / $nin / $null and array shorthand.
    await owners.find({ '@email': { $eq: 'A@B.C ' } });
    await owners.find({ '@email': { $ne: 'a@b.c' } });
    await owners.find({ '@email': { $nin: ['a@b.c'] } });
    await owners.find({ '@email': { $null: true } });
    await owners.find({ '@email': ['a@b.c', 'x@y.z'] }); // shorthand IN
    const shorthand = exec.lastOf('SELECT') as unknown as {
      where: Record<string, unknown>;
    };
    const siblingEntry = Object.entries(shorthand.where)
      .find(([k]) => k.includes('email_hash'));
    asserts.assertEquals(Array.isArray(siblingEntry?.[1]), true);
    const digests = siblingEntry![1] as string[];
    asserts.assertEquals(digests.every((d) => /^[0-9a-f]{64}$/.test(d)), true);

    // Rejected shapes.
    await asserts.assertRejects(
      () => owners.find({ '@email': { $like: 'a%' } }),
      NormQueryError,
      'not supported on hashed column',
    );
    await asserts.assertRejects(
      () => owners.find({ '@email': 42 }),
      NormQueryError,
      'plaintext string',
    );
    await asserts.assertRejects(
      () => owners.find({ '@email': '@name' }),
      NormQueryError,
      'cannot be compared against another column',
    );
  });

  it('scope on an encrypt().hash() column rewrites to the sibling digest (regression)', async () => {
    // A scope value flows through the SAME _prepareWhere path as a caller
    // filter, so `email` (encrypt().hash(), beforeWrite: trim+lowercase)
    // compares against its `email_hash` digest — NOT a raw `@email`
    // equality against IV-randomised ciphertext (which never matches).
    const { db, exec } = makeDb();
    const scoped = db.scope({ '@email': 'A@B.C ' } as never);
    const digest = await defaultHash('a@b.c', 'SHA-256');

    // Scope-only find: WHERE is the rewritten sibling equality.
    exec.selectQueue.push([]);
    await scoped.repo('Owners').find();
    const sel = exec.lastOf('SELECT') as unknown as {
      where: Record<string, unknown>;
    };
    asserts.assertEquals(sel.where, { '@email_hash': digest });
    // The raw plaintext column must NOT leak into the WHERE.
    asserts.assertEquals('@email' in sel.where, false);

    // Merged with a caller filter, the scope stays digest-rewritten.
    exec.selectQueue.push([]);
    await scoped.repo('Owners').find({ '@name': 'z' } as never);
    const sel2 = exec.lastOf('SELECT') as unknown as {
      where: Record<string, unknown>;
    };
    asserts.assertEquals(sel2.where, {
      $and: [{ '@email_hash': digest }, { '@name': 'z' }],
    });

    // count()/delete() route the scope through the same path.
    await scoped.repo('Owners').count();
    asserts.assertEquals(
      (exec.lastOf('COUNT') as unknown as { where: Record<string, unknown> })
        .where,
      { '@email_hash': digest },
    );

    // A scope on an encrypt()-WITHOUT-hash column can't be honoured — it
    // now fails loudly at query time (like a normal filter) instead of
    // silently matching nothing.
    const bad = db.scope({ '@cipher': 'nope' } as never);
    await asserts.assertRejects(
      () => bad.repo('Owners').find(),
      NormQueryError,
      'not filterable',
    );
  });

  it('count() with a joined filter carries the join into the COUNT IR', async () => {
    const { db, exec } = makeDb();
    // deno-lint-ignore no-explicit-any
    const items = db.repo('Items') as any;
    const r = await items.count({ '@Owner.@name': 'z' });
    asserts.assertEquals(r.count, 5);
    const q = exec.lastOf('COUNT') as unknown as { joins?: Row };
    asserts.assertEquals(Object.keys(q.joins ?? {}), ['Owner']);

    // find(..., {total: true}) issues a second COUNT that carries the
    // SAME where-derived joins.
    exec.calls.length = 0;
    const page = await items.find({ '@Owner.@name': 'z' }, { total: true });
    asserts.assertEquals(page.total, 5);
    const q2 = exec.lastOf('COUNT') as unknown as { joins?: Row };
    asserts.assertEquals(Object.keys(q2.joins ?? {}), ['Owner']);
  });

  it('$or recursion ensures joins referenced anywhere in the tree', async () => {
    const { db, exec } = makeDb();
    // deno-lint-ignore no-explicit-any
    const items = db.repo('Items') as any;
    await items.find({
      $or: [{ '@Owner.@name': 'a' }, { '@label': 'b' }],
    });
    const q = exec.lastOf('SELECT') as unknown as { joins?: Row };
    asserts.assertEquals(Object.keys(q.joins ?? {}), ['Owner']);
  });

  it('relation post-processing: JSON fallback, array filtering, nested decrypt', async () => {
    const { db, exec } = makeDb();
    const cipher = await db.encrypt('inner@plain.dev');

    // Reverse relation: junk JSON stays raw; arrays filter null /
    // all-null objects and keep scalars.
    exec.selectQueue.push([
      { id: 1, Items: 'not-json' },
      { id: 2, Items: '[null, {"label": null}, {"label": " x "}, 42]' },
    ]);
    // deno-lint-ignore no-explicit-any
    const owners = db.repo('Owners') as any;
    const r = await owners.find(undefined, {
      project: { '@id': true, '@Items': { '@label': true } },
    });
    // Unparseable JSON stays raw; hasMany normalization wraps it.
    asserts.assertEquals(r.data[0].Items, ['not-json']);
    asserts.assertEquals(r.data[1].Items, [{ label: ' x ' }, 42]);

    // belongsTo object: encrypted columns inside the nested row are
    // decrypted; non-string/null encrypted values are left alone.
    exec.selectQueue.push([
      {
        id: 7,
        Owner: JSON.stringify({
          id: 1,
          name: 'n',
          email: cipher,
          cipher: null,
          secretNote: 's',
        }),
      },
    ]);
    // deno-lint-ignore no-explicit-any
    const items = db.repo('Items') as any;
    const rr = await items.find(undefined, {
      project: { '@id': true, '@Owner': true },
    });
    asserts.assertEquals(rr.data[0].Owner.email, 'inner@plain.dev');
    asserts.assertEquals(rr.data[0].Owner.cipher, null);
  });

  it('decrypt skips non-string values; projected locals still run afterRead', async () => {
    const { db, exec } = makeDb();
    exec.selectQueue.push([
      { id: 1, name: 'a', email: 12345, cipher: null, secretNote: 's' },
    ]);
    const r = await db.repo('Owners').find();
    asserts.assertEquals(r.data[0]!.email, 12345 as never); // skipped, not crashed

    exec.selectQueue.push([{ tag: '  padded  ' }]);
    // deno-lint-ignore no-explicit-any
    const items = db.repo('Items') as any;
    const rr = await items.find(undefined, { project: { '@label': 'tag' } });
    asserts.assertEquals(rr.data[0].tag, 'padded'); // afterRead through rename
  });

  it('update/delete without filter emit warning EVENTS; explicit {} does not; updateByPK targets the pk', async () => {
    const { db, exec, events } = makeDb();
    const warnings = () => events.filter((e) => e[0] === 'warning');

    await db.repo('Renamed').update({ label: 'x' });
    await db.repo('Renamed').delete();
    asserts.assertEquals(warnings().length, 2);
    const [, entity, op, code, message] = warnings()[0]!;
    asserts.assertEquals(entity, 'Renamed');
    asserts.assertEquals(op, 'UPDATE');
    asserts.assertEquals(code, 'all-rows-update');
    asserts.assertStringIncludes(String(message), 'ALL rows');
    asserts.assertEquals(warnings()[1]![3], 'all-rows-delete');

    await db.repo('Renamed').update({ label: 'y' }, {});
    await db.repo('Renamed').delete({});
    asserts.assertEquals(warnings().length, 2); // no new warnings

    await db.repo('Renamed').updateByPK({ label: 'z' }, { id: 9 });
    const q = exec.lastOf('UPDATE') as unknown as { where: Row; data: Row };
    asserts.assertEquals(q.where, { '@id': 9 });
    // beforeUpdate hook replaced the payload row.
    asserts.assertEquals(q.data.label, 'replaced');
  });

  it('beforeDelete hook sees the filter, can veto, and skips on truncate', async () => {
    const { db, exec } = makeDb();
    deleteLog.length = 0;

    await db.repo('Guarded').delete({ '@id': 7 });
    asserts.assertEquals(deleteLog, [{ '@id': 7 }]);
    asserts.assertEquals(
      (exec.lastOf('DELETE') as unknown as { where: Row }).where,
      { '@id': 7 },
    );

    // deleteByPK routes through delete() — hook fires with the pk filter.
    await db.repo('Guarded').deleteByPK({ id: 9 });
    asserts.assertEquals(deleteLog.length, 2);

    // Veto: the hook throws on blanket deletes → NormHookError, and
    // the DELETE never reaches the executor.
    const before = exec.calls.filter((c) => c.type === 'DELETE').length;
    const err = await asserts.assertRejects(
      () => db.repo('Guarded').delete(),
      NormHookError,
    );
    asserts.assertEquals(
      ((err as NormHookError).cause as Error).message,
      'no blanket deletes',
    );
    asserts.assertEquals(
      exec.calls.filter((c) => c.type === 'DELETE').length,
      before, // vetoed — nothing executed
    );

    // truncate() is not a delete — the hook does not fire.
    const logged = deleteLog.length;
    await db.repo('Guarded').truncate();
    asserts.assertEquals(deleteLog.length, logged);
  });

  it('truncate({cascade: true}) forwards the flag', async () => {
    const { db, exec } = makeDb();
    await db.repo('Renamed').truncate({ cascade: true });
    const q = exec.lastOf('TRUNCATE') as unknown as { cascade?: boolean };
    asserts.assertEquals(q.cascade, true);
  });

  it('QueryAccessor: afterRead replacement applies; a throwing hook wraps as NormHookError', async () => {
    const { db, exec } = makeDb();
    exec.selectQueue.push([{ name: 'ada' }]);
    const good = await db.repo('QGood').find({ limit: 5 });
    asserts.assertEquals(good.data[0]!.name, 'ada!');

    exec.selectQueue.push([{ name: 'ada' }]);
    const err = await asserts.assertRejects(
      () => db.repo('QBad').find(),
      NormHookError,
    );
    asserts.assertEquals(
      ((err as NormHookError).cause as Error).message,
      'hook-boom',
    );
  });

  it('digest columns: write digests in place, plaintext filters rewrite, policy validates plaintext', async () => {
    const Creds = Entity('creds', {
      id: Column.integer(),
      password: Column.hash('SHA-256').minLength(8)
        .beforeWrite((v) => v.trim()),
      recovery: Column.hash('SHA-512').nullable(),
    }, { pk: ['id'] });
    const exec = new MockExec();
    const runtime = compileRuntime(
      use(Schema('S', { Creds })),
      {}, // digests need NO secret
      exec,
      () => {},
    );
    const db = new NormDb<{ Creds: typeof Creds }>(runtime, exec, undefined);

    const r = await db.repo('Creds').insert({
      id: 1,
      password: '  hunter2boat  ', // beforeWrite trims first
    });
    const stored = r.data[0]!.password;
    asserts.assertMatch(stored, /^[0-9a-f]{64}$/); // SHA-256 hex, at rest
    const expected = await defaultHash('hunter2boat', 'SHA-256');
    asserts.assertEquals(stored, expected);

    // Plaintext equality rewrites to the digest ON THE SAME column.
    await db.repo('Creds').find({ '@password': 'hunter2boat' } as never);
    const q = exec.lastOf('SELECT') as unknown as { where: Row };
    asserts.assertEquals(q.where['@password'], expected);

    // SHA-512 column digests with ITS algorithm (128 hex chars).
    const r2 = await db.repo('Creds').insert({
      id: 2,
      password: 'hunter2boat',
      recovery: 'rescue-phrase',
    });
    asserts.assertMatch(r2.data[0]!.recovery as string, /^[0-9a-f]{128}$/);

    // Plaintext policy fires BEFORE digesting; digest length ≠ cap
    // (a 40-char password is fine on a VARCHAR(64) digest column).
    await asserts.assertRejects(
      () => db.repo('Creds').insert({ id: 3, password: 'short' }),
      NormValidationError,
    );
    await db.repo('Creds').insert({
      id: 4,
      password: 'x'.repeat(40),
    });

    // Non-equality operators rejected, like sibling digests.
    await asserts.assertRejects(
      () => db.repo('Creds').find({ '@password': { $like: 'h%' } } as never),
      NormQueryError,
      'not supported on hashed column',
    );
  });

  it('encrypted non-string columns: canonical codec round-trips, sibling digest matches', async () => {
    const Vault = Entity('vault', {
      id: Column.integer(),
      bornAt: Column.timestamp().encrypt().hash(),
      wealth: Column.bigint().encrypt(),
      flags: Column.json<{ vip: boolean }>().encrypt(),
      active: Column.boolean().encrypt(),
    }, { pk: ['id'] });
    const exec = new MockExec();
    const runtime = compileRuntime(
      use(Schema('S', { Vault })),
      { secret: SECRET },
      exec,
      () => {},
    );
    const db = new NormDb<{ Vault: typeof Vault }>(runtime, exec, undefined);

    const born = new Date('1990-05-06T07:08:09.000Z');
    const r = await db.repo('Vault').insert({
      id: 1,
      bornAt: born,
      wealth: 2n ** 70n,
      flags: { vip: true },
      active: true,
    });
    // RETURNING decrypts AND decodes back to logical types.
    const row = r.data[0]!;
    asserts.assertEquals(row.bornAt instanceof Date, true);
    asserts.assertEquals(
      (row.bornAt as Date).toISOString(),
      born.toISOString(),
    );
    asserts.assertEquals(row.wealth, 2n ** 70n);
    asserts.assertEquals(row.flags, { vip: true });
    asserts.assertEquals(row.active, true);

    // What hit the ENGINE was ciphertext + a canonical-string digest.
    const ins = exec.lastOf('INSERT') as unknown as { data: Row[] };
    const at = ins.data[0]!;
    asserts.assertEquals(typeof at.bornAt, 'string');
    asserts.assertNotEquals(at.bornAt, born.toISOString());
    asserts.assertEquals(
      at.bornAt_hash,
      await defaultHash(born.toISOString(), 'SHA-256'),
    );
    asserts.assertEquals(typeof at.wealth, 'string'); // ciphertext

    // Equality filter on the encrypted+hashed Date: Date operand
    // canonicalizes and digests onto the sibling.
    await db.repo('Vault').find({ '@bornAt': born } as never);
    const q = exec.lastOf('SELECT') as unknown as { where: Row };
    asserts.assertEquals(
      q.where['@bornAt_hash'],
      await defaultHash(born.toISOString(), 'SHA-256'),
    );
    // Mistyped operand gets the clean rejection.
    await asserts.assertRejects(
      () => db.repo('Vault').find({ '@bornAt': 'not-a-date' } as never),
      NormQueryError,
      'plaintext Date',
    );
  });

  it('tx-scoped NormDb via Norm facade proxies inTransaction and nests via savepoint', async () => {
    const exec = new MockExec();
    // deno-lint-ignore no-explicit-any
    const makeScope = (id: string): any => ({
      id,
      execute: (query: unknown) => exec.execute(query as never, id as never),
      // deno-lint-ignore no-explicit-any
      transaction: (inner: (sp: any) => Promise<unknown>) =>
        inner(makeScope(id)),
    });
    const fakeEngine = {
      Capabilities: { transactions: true },
      select: (q: ExecutorQuery, t?: string) => exec.execute(q, t as never),
      insert: (q: ExecutorQuery, t?: string) => exec.execute(q, t as never),
      insertQuery: (q: ExecutorQuery, t?: string) =>
        exec.execute(q, t as never),
      update: (q: ExecutorQuery, t?: string) => exec.execute(q, t as never),
      delete: (q: ExecutorQuery, t?: string) => exec.execute(q, t as never),
      upsert: (q: ExecutorQuery, t?: string) => exec.execute(q, t as never),
      count: (q: ExecutorQuery, t?: string) => exec.execute(q, t as never),
      truncate: (q: ExecutorQuery, t?: string) => exec.execute(q, t as never),
      // Driver callback form: run the fn with a TransactionScope.
      // deno-lint-ignore no-explicit-any
      transaction: (fn: (scope: any) => Promise<unknown>) =>
        fn(makeScope('tx-1')),
      connect: () => Promise.resolve(),
      disconnect: () => Promise.resolve(),
    };
    // `new Norm({ engine })` is gone; pin the sqlite factory to the fake
    // engine for the single synchronous construction (no `await` between
    // pin and restore), then restore the stock factory.
    const stock = resolveEngineFactory('sqlite');
    registerEngine('sqlite', () => fakeEngine as never);
    let norm: Norm;
    try {
      norm = new Norm({
        database: { dialect: 'sqlite', path: ':memory:' },
        secret: SECRET,
      });
    } finally {
      registerEngine('sqlite', stock as never);
    }
    const db = norm.use(Schema('S', { Renamed }));
    // Registry without ANY encrypted column: read path short-circuits.
    const plain = await db.repo('Renamed').find();
    asserts.assertEquals(plain.count, 0);
    const out = await db.transaction(async (tx) => {
      asserts.assertEquals(tx.inTransaction, true);
      // Nesting now opens a SAVEPOINT on the same engine tx (a fresh,
      // still-in-transaction handle) instead of being rejected.
      const inner = await tx.transaction((sp) => {
        asserts.assertEquals(sp.inTransaction, true);
        return Promise.resolve(1);
      });
      asserts.assertEquals(inner, 1);
      return 'done';
    });
    asserts.assertEquals(out, 'done');
  });

  it('upsert() enforces db.scope() like insert()/update() (regression)', async () => {
    // upsert() used to bypass scope entirely: no SCOPE_VIOLATION reject,
    // no auto-fill, no scope enforcement, no `scoped` envelope — a
    // silent cross-tenant write hole on a scoped handle.
    // NOTE the calls below are UNCAST: upsert takes the same
    // scope-relaxed payload type as insert, so the documented "orgId is
    // auto-filled, you may omit it" call must COMPILE.
    const { db, exec } = makeDb();
    const org42 = db.scope({ '@orgId': 42 });

    // 1. A payload contradicting the scope is REJECTED (as insert does).
    await asserts.assertRejects(
      () =>
        org42.repo('Tickets').upsert(
          { id: 1, orgId: 99, extKey: 'K1', status: 'closed' },
          { conflictKeys: ['extKey'] },
        ),
      NormQueryError,
      'scope-bound',
    );

    // 2. Omitting the scope column AUTO-FILLS it and reports `scoped`.
    //    The conflict target stays EXACTLY as spelled: `tickets` has no
    //    (orgId, extKey) unique, and Postgres/SQLite reject an
    //    ON CONFLICT list that matches no index.
    exec.calls.length = 0;
    const r = await org42.repo('Tickets').upsert(
      { id: 2, extKey: 'K2', status: 'open' },
      { conflictKeys: ['extKey'] },
    );
    const q = exec.lastOf('UPSERT') as unknown as {
      data: Row[];
      conflictKeys: string[];
    };
    asserts.assertEquals(q.data[0]!.orgId, 42); // auto-filled
    asserts.assertEquals(q.conflictKeys, ['@extKey']);
    // Envelope carries the applied scope for the audit trail.
    asserts.assertEquals(r.scoped, { '@orgId': 42 });
    // A pre-flight probe ran: "does this write collide with a row
    // outside the scope?" — the guarantee that holds on EVERY dialect,
    // including MariaDB, whose ON DUPLICATE KEY ignores the target.
    const probe = exec.lastOf('SELECT') as unknown as { where: Row };
    asserts.assertEquals(typeof probe.where, 'object');

    // 3. Unscoped upsert is unchanged — no scope folded in, no probe.
    exec.calls.length = 0;
    await db.repo('Tickets').upsert(
      { id: 3, orgId: 7, extKey: 'K3', status: 'open' },
      { conflictKeys: ['extKey'] },
    );
    const q2 = exec.lastOf('UPSERT') as unknown as { conflictKeys: string[] };
    asserts.assertEquals(q2.conflictKeys, ['@extKey']);
    asserts.assertEquals(exec.calls.some((c) => c.type === 'SELECT'), false);

    // 4. A DECLARED per-scope unique is the one case that folds — the
    //    emitted target then names a real index.
    exec.calls.length = 0;
    await org42.repo('ScopedTickets').upsert(
      { id: 4, extKey: 'K4', status: 'open' },
      { conflictKeys: ['extKey'] },
    );
    const q3 = exec.lastOf('UPSERT') as unknown as { conflictKeys: string[] };
    asserts.assertEquals(q3.conflictKeys, ['@orgId', '@extKey']);
    // The folded target IS the declared unique, so it needs no probe of
    // its own; the PK is still probed (MariaDB matches on ANY key).
    const folded = exec.lastOf('SELECT') as unknown as { where: Row };
    asserts.assertEquals(
      JSON.stringify(folded.where).includes('extKey'),
      false,
    );

    // 5. The probe REFUSES when the database reports a colliding row
    //    outside the scope (mock: the next SELECT returns one).
    exec.calls.length = 0;
    exec.selectQueue.push([{ orgId: 99 }]);
    await asserts.assertRejects(
      () =>
        org42.repo('Tickets').upsert(
          { id: 5, extKey: 'K5', status: 'open' },
          { conflictKeys: ['extKey'] },
        ),
      NormQueryError,
      'OUTSIDE the active scope',
    );
    // Nothing was written.
    asserts.assertEquals(exec.calls.some((c) => c.type === 'UPSERT'), false);
  });

  it('scoped insert of a norm-owned encrypted scope column stores ciphertext + digest (regression)', async () => {
    // `tenantId` is `.encrypt().hash()` and non-insertable, so the scope
    // is the ONLY writer. It was injected RAW after __writeRows had
    // already encrypted — writing plaintext at rest with a NULL digest
    // sibling, so every scoped read (which filters the sibling) missed
    // the row. It must now be encrypted with its digest populated.
    const { db, exec } = makeDb();
    const digest = await defaultHash('acme', 'SHA-256');
    // deno-lint-ignore no-explicit-any
    await (db.scope({ '@tenantId': 'acme' } as never).repo('Docs') as any)
      .insert({ id: 1, title: 'x' });
    const q = exec.lastOf('INSERT') as unknown as { data: Row[] };
    const written = q.data[0]!;
    // Ciphertext at rest, NOT the plaintext scope value.
    asserts.assertNotEquals(written.tenantId, 'acme');
    asserts.assertEquals(typeof written.tenantId, 'string');
    // Digest sibling is populated (was NULL/undefined before the fix).
    asserts.assertEquals(written.tenantId_hash, digest);
  });

  it('scoped upsert verifies an encrypted scope on its digest sibling, and refuses when there is none', async () => {
    const { db, exec } = makeDb();
    const digest = await defaultHash('acme', 'SHA-256');
    exec.calls.length = 0;
    await db.scope({ '@tenantId': 'acme' }).repo('Docs').upsert(
      { id: 1, title: 'x' },
      { conflictKeys: ['id'] },
    );
    // The probe compares the DIGEST sibling — a random-IV ciphertext
    // could never compare equal.
    const probe = exec.lastOf('SELECT') as unknown as { where: Row };
    asserts.assertEquals(JSON.stringify(probe.where).includes(digest), true);
    const q = exec.lastOf('UPSERT') as unknown as { data: Row[] };
    asserts.assertEquals(q.data[0]!.tenantId_hash, digest);

    // encrypt() WITHOUT .hash(): the scope cannot be matched at all, so
    // the upsert refuses rather than pretend it verified something.
    await asserts.assertRejects(
      () =>
        db.scope({ '@cipher': 'v' }).repo('Owners').upsert(
          { id: 1, name: 'A', email: 'a@b.c', secretNote: 'n' },
          { conflictKeys: ['id'] },
        ),
      NormQueryError,
      'without a .hash() sibling',
    );
  });

  it('truncate() refuses on a scoped handle (regression)', async () => {
    // TRUNCATE carries no WHERE, so on a scoped handle it would silently
    // empty EVERY scope's rows. It must refuse rather than perform an
    // unscopeable cross-scope wipe.
    const { db, exec } = makeDb();
    await asserts.assertRejects(
      () => db.scope({ '@orgId': 42 } as never).repo('Tickets').truncate(),
      NormQueryError,
      'scoped handle',
    );
    // Unscoped truncate still works.
    exec.calls.length = 0;
    await db.repo('Tickets').truncate();
    asserts.assertEquals(exec.lastOf('TRUNCATE').type, 'TRUNCATE');
    // A scope that does not APPLY to the entity is not a scoped handle
    // for it — truncate proceeds (Renamed has no `orgId`).
    await db.scope({ '@orgId': 42 } as never).repo('Renamed').truncate();
  });

  it('value-position joined column ref plans its join (regression)', async () => {
    // A cross-column filter written value-position
    // (`{'@label': {$gt: '@Owner.@name'}}`) is guarded as a column ref
    // but its join was never planned — the IR referenced `Owner` with no
    // joins block. The join must now be planned, exactly as the
    // key-position spelling already is.
    const { db, exec } = makeDb();
    exec.selectQueue.push([]);
    // deno-lint-ignore no-explicit-any
    await (db.repo('Items') as any).find({
      '@label': { $gt: '@Owner.@name' },
    });
    const q = exec.lastOf('SELECT') as unknown as { joins?: Row };
    asserts.assertEquals(Object.keys(q.joins ?? {}), ['Owner']);
  });

  it('value-position ref to an UNPROJECTED to-many is refused, not silently bound as data (regression)', async () => {
    // Only KEY-position refs to an unprojected to-many can be lifted
    // into the correlated $exists; a value-position one used to be
    // copied through verbatim, so `'@Items.@label'` reached the
    // translator as an out-of-scope @-string and was bound as a
    // PARAMETER — comparing the literal text against a varchar column
    // and returning silently-wrong rows.
    const { db, exec } = makeDb();
    await asserts.assertRejects(
      () =>
        // deno-lint-ignore no-explicit-any
        (db.repo('Owners') as any).find({
          '@name': { $gt: '@Items.@label' },
        }),
      NormQueryError,
      'cannot supply a comparison VALUE',
    );
    asserts.assertEquals(exec.calls.length, 0); // nothing executed
    // The KEY-position spelling still lifts to $exists…
    exec.calls.length = 0;
    exec.selectQueue.push([]);
    // deno-lint-ignore no-explicit-any
    await (db.repo('Owners') as any).find({
      '@Items.@label': { $gt: 'x' },
    });
    const q = exec.lastOf('SELECT') as unknown as { where: Row };
    asserts.assertEquals(Object.keys(q.where), ['$exists']);
    // …and a value-position ref to a PROJECTED to-many joins as usual.
    exec.calls.length = 0;
    exec.selectQueue.push([]);
    // deno-lint-ignore no-explicit-any
    await (db.repo('Owners') as any).find(
      { '@name': { $gt: '@Items.@label' } },
      { project: { '@id': true, '@name': true, '@Items': true } },
    );
    const q2 = exec.lastOf('SELECT') as unknown as { joins?: Row };
    asserts.assertEquals(Object.keys(q2.joins ?? {}), ['Items']);
  });
});
