/**
 * Repo edge paths over a mock executor: projection/filter validation
 * errors, hashed-operator taxonomy, unfilterable enforcement (local,
 * joined, value-position), relation post-processing (JSON fallback,
 * array filtering, nested decrypt), warnless/warning all-row writes,
 * updateByPK, truncate cascade, and read-only accessor hooks.
 */

import { describe, it } from '@tundralibs/compat/test';
import * as asserts from '@std/asserts';
import { Guardian } from '@tundralibs/guardian';
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

  it('guardians getter exposes the compiled insert/update Guardians, honoring write-scope pick-lists', () => {
    const { db } = makeDb();

    // No pick-list declared (Renamed): insert requires every column;
    // update makes everything optional, but both stay .strict() about
    // an unknown key.
    const plain = db.repo('Renamed').guardians;
    asserts.assertEquals(
      plain.insert.parse({ id: 1, label: 'x' }),
      { id: 1, label: 'x' },
    );
    asserts.assertThrows(() => plain.insert.parse({ id: 1 })); // label required
    asserts.assertEquals(plain.update.parse({ label: 'y' }), { label: 'y' });
    asserts.assertEquals(plain.update.parse({}), {});
    asserts.assertThrows(() => plain.update.parse({ nope: 1 }));

    // Docs declares `insert: ['id', 'title']` — tenantId is disableInsert,
    // so it's absent from the insert shape entirely and .strict() rejects
    // it as an unknown key. No `update` pick-list was declared, so
    // tenantId IS writable there.
    const docs = db.repo('Docs').guardians;
    asserts.assertEquals(
      docs.insert.parse({ id: 1, title: 'hi' }),
      { id: 1, title: 'hi' },
    );
    asserts.assertThrows(() =>
      docs.insert.parse({ id: 1, title: 'hi', tenantId: 'acme' })
    );
    asserts.assertEquals(
      docs.update.parse({ tenantId: 'acme' }),
      { tenantId: 'acme' },
    );
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

  it('a hand-written $exists is sent as written; only the outer side of its on is guarded', async () => {
    const { db, exec } = makeDb();
    // deno-lint-ignore no-explicit-any
    const owners = db.repo('Owners') as any;
    // `contacts` has plain columns of the names Owners hashes or hides.
    for (const op of ['$exists', '$nexists']) {
      const filter = {
        [op]: {
          table: 'contacts',
          on: { '@ownerId': '@id', '@secretNote': '@name' },
          where: { '@email': 'a@b.c', '@cipher': { $like: 'x%' } },
        },
      };
      await owners.find(filter);
      asserts.assertEquals(
        (exec.lastOf('SELECT') as unknown as { where: Row }).where,
        filter,
      );
    }
    exec.calls.length = 0;
    for (const outer of ['@secretNote', '@cipher', '@email']) {
      const err = await asserts.assertRejects(
        () =>
          owners.find({
            $exists: { table: 'contacts', on: { '@ownerId': outer } },
          }),
        NormQueryError,
        'not filterable',
      );
      asserts.assertEquals(err.context.code, 'NON_FILTERABLE_COLUMN');
    }
    asserts.assertEquals(exec.calls.length, 0);
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

    // A matched row carries the related primary key, never NULL: its
    // projected columns may all be NULL, and the key is not returned.
    const carried = (exec.lastOf('SELECT') as unknown as {
      aggregates: { Items: { columns: Record<string, unknown> } };
    }).aggregates.Items.columns;
    asserts.assertEquals(Object.keys(carried), ['label', '__pk_id']);
    exec.selectQueue.push([
      {
        id: 3,
        Items: '[{"label":null,"__pk_id":5},{"label":null,"__pk_id":null}]',
      },
    ]);
    const kept = await owners.find(undefined, {
      project: { '@id': true, '@Items': { '@label': true } },
    });
    asserts.assertEquals(kept.data[0].Items, [{ label: null }]);
    for (
      const [key, owner] of [[1, { name: null }], [null, null]] as const
    ) {
      exec.selectQueue.push([
        { id: 7, Owner: JSON.stringify({ name: null, __pk_id: key }) },
      ]);
      // deno-lint-ignore no-explicit-any
      const one = await (db.repo('Items') as any).find(undefined, {
        project: { '@id': true, '@Owner': { '@name': true } },
      });
      asserts.assertEquals(one.data[0].Owner, owner);
    }

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
      password: Column.hash('SHA-256').guard(Guardian.string().minLength(8))
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

  it('a nullable column left out is written as null on MongoDB', async () => {
    const { db, exec } = makeDb();
    const sent = (type: string) =>
      (exec.lastOf(type) as unknown as { data: Row[] }).data;
    // SQL stores NULL for a column the statement leaves out.
    await db.repo('Guarded').insert({ id: 1 });
    asserts.assertEquals(sent('INSERT'), [{ id: 1 }]);

    // A document holds only the fields written.
    Object.assign(exec.capabilities, { dialect: 'mongo' });
    await db.repo('Guarded').insert({ id: 1 });
    asserts.assertEquals(sent('INSERT'), [{ id: 1, label: null }]);
    await db.repo('Guarded').insert([{ id: 1 }, { id: 2, label: 'kept' }]);
    asserts.assertEquals(sent('INSERT'), [
      { id: 1, label: null },
      { id: 2, label: 'kept' },
    ]);
    await db.repo('Guarded').upsert({ id: 1 }, { conflictKeys: ['id'] });
    asserts.assertEquals(sent('UPSERT'), [{ id: 1, label: null }]);
    // A conflict still copies only what the caller passed.
    asserts.assertEquals(
      (exec.lastOf('UPSERT') as unknown as Row).updateOnConflict,
      [],
    );
  });

  it('upsert refuses an updateOnConflict column a row has no value for', async () => {
    for (const dialect of ['sqlite', 'mongo']) {
      const { db, exec } = makeDb();
      Object.assign(exec.capabilities, { dialect });
      const opts = { conflictKeys: ['id'], updateOnConflict: ['label'] };
      const single = await asserts.assertRejects(
        () => db.repo('Guarded').upsert({ id: 1 }, opts as never),
        NormValidationError,
        "label: updateOnConflict names 'label', which the row does not supply",
      );
      asserts.assertEquals(single.context.issues[0]!.op, 'upsert');
      const batch = await asserts.assertRejects(
        () => db.repo('Guarded').upsert([{ id: 1 }, { id: 2 }], opts as never),
        NormValidationError,
      );
      asserts.assertEquals(
        batch.context.issues.map((i) => i.path),
        ['[0].label', '[1].label'],
      );
      asserts.assertEquals(exec.calls.length, 0, dialect);
      await db.repo('Guarded').upsert({ id: 1, label: null }, opts as never);
      asserts.assertEquals(
        (exec.lastOf('UPSERT') as unknown as Row).updateOnConflict,
        ['@label'],
      );
    }
  });

  it('a column a MongoDB document lacks reads as null', async () => {
    const { db, exec } = makeDb();
    Object.assign(exec.capabilities, { dialect: 'mongo' });
    // deno-lint-ignore no-explicit-any
    const read = async (repo: any, stored: Row[], project?: Row) => {
      exec.selectQueue.push(stored);
      return (await repo.find(undefined, { project })).data;
    };
    asserts.assertEquals(
      await read(db.repo('Guarded'), [{ id: 1 }]),
      [{ id: 1, label: null }],
    );
    exec.selectQueue.push([{ id: 1 }]);
    asserts.assertEquals(
      (await db.repo('Guarded').findOne({ '@id': 1 })).data,
      { id: 1, label: null },
    );
    // Under the name the projection gives it.
    asserts.assertEquals(
      await read(db.repo('Guarded'), [{ id: 1 }], {
        '@id': true,
        '@label': 'text',
      }),
      [{ id: 1, text: null }],
    );
    // Relation rows, to-one and to-many. A row with none of its projected
    // fields is still the unmatched placeholder, as an all-NULL row is.
    asserts.assertEquals(
      await read(db.repo('Items'), [{ id: 7, Owner: { id: 1 } }], {
        '@id': true,
        '@Owner': { '@id': true, '@name': 'who' },
      }),
      [{ id: 7, Owner: { id: 1, who: null } }],
    );
    asserts.assertEquals(
      await read(db.repo('Owners'), [{ id: 1, Items: [{ id: 7 }, {}] }], {
        '@id': true,
        '@Items': { '@id': true, '@label': true },
      }),
      [{ id: 1, Items: [{ id: 7, label: null }] }],
    );
    // An upsert that leaves the stored document in place returns it.
    exec.selectQueue.push([{ id: 1 }]);
    asserts.assertEquals(
      (await db.repo('Guarded').upsert({ id: 1 }, { conflictKeys: ['id'] }))
        .data,
      [{ id: 1, label: null }],
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

describe('live SQLite — timestamps', () => {
  const Events = Entity('events_ts', {
    Id: Column.varchar(40).default(() => crypto.randomUUID()),
    CreatedOn: Column.timestamp().default({ $$_expression: 'NOW' }),
  }, { pk: ['Id'] });

  const open = async () => {
    const norm = new Norm({
      database: { dialect: 'sqlite', path: ':memory:' },
    });
    const db = norm.use(Schema('TS', { Events }));
    await norm.connect();
    await db.raw(
      'CREATE TABLE events_ts (Id TEXT PRIMARY KEY, CreatedOn TEXT NOT NULL)',
    );
    return { norm, db };
  };

  it('a NOW default reads back as the current instant and compares with app-written dates', async () => {
    const { norm, db } = await open();
    try {
      const before = new Date(Date.now() - 1000);
      await db.repo('Events').insert({});
      const after = Date.now() + 1000;
      const row = (await db.repo('Events').find()).data[0]!;
      const at = row.CreatedOn.getTime();
      asserts.assert(at >= before.getTime() && at <= after, `read ${at}`);
      // SQLite compares text: the stored value must sort like the ISO text
      // its driver writes for `before`.
      const newer = await db.repo('Events').find({
        '@CreatedOn': { $gte: before },
      });
      asserts.assertEquals(newer.count, 1);
    } finally {
      await norm.disconnect();
    }
  });

  it('reads a legacy zone-less SQLite datetime as UTC', async () => {
    // Fails under a non-UTC TZ without the fix: new Date() would parse the
    // stored text as local time.
    const { norm, db } = await open();
    try {
      await db.raw(
        "INSERT INTO events_ts (Id, CreatedOn) VALUES ('old', '2026-01-02 03:04:05')",
      );
      const row = (await db.repo('Events').find()).data[0]!;
      asserts.assertEquals(
        row.CreatedOn.toISOString(),
        '2026-01-02T03:04:05.000Z',
      );
    } finally {
      await norm.disconnect();
    }
  });
});

describe('norm.Repo — an expression on a date() column', () => {
  const NOW = { $$_expression: 'NOW' } as const;
  const DAY_OF_NOW = {
    $$_expression: 'DATE_TRUNC',
    args: { date: NOW, unit: 'DAYS' },
  };
  const Stamps = Entity('stamps', {
    id: Column.integer(),
    day: Column.date().default(NOW),
  }, { pk: ['id'] });
  const schema = () => use(Schema('DX', { Stamps }));
  const mock = (dialect: Executor['capabilities']['dialect']) => {
    const exec = new MockExec();
    Object.assign(exec.capabilities, { dialect });
    const runtime = compileRuntime(schema(), {}, exec, () => {});
    return {
      repo: new NormDb<ReturnType<typeof schema>>(runtime, exec, undefined)
        .repo('Stamps'),
      exec,
    };
  };
  const written = (exec: MockExec, type: string): unknown => {
    const { data } = exec.lastOf(type) as unknown as { data: Row | Row[] };
    return (Array.isArray(data) ? data[0]! : data).day;
  };

  it('is reduced to its day where norm stores the day', async () => {
    for (const dialect of ['sqlite', 'mongo'] as const) {
      const { repo, exec } = mock(dialect);
      await repo.update({ day: NOW } as never, { '@id': 1 });
      asserts.assertEquals(written(exec, 'UPDATE'), DAY_OF_NOW, dialect);
      await repo.upsert({ id: 1 }, { conflictKeys: ['id'] });
      asserts.assertEquals(written(exec, 'UPSERT'), DAY_OF_NOW, dialect);
    }
    const { repo, exec } = mock('sqlite');
    await repo.insert({ id: 1 });
    asserts.assertEquals(written(exec, 'INSERT'), DAY_OF_NOW);
  });

  it('is sent as given where the engine reduces it', async () => {
    for (const dialect of ['postgres', 'maria'] as const) {
      const { repo, exec } = mock(dialect);
      await repo.insert({ id: 1 });
      asserts.assertEquals(written(exec, 'INSERT'), NOW, dialect);
    }
  });

  it('is the day oql computes for a Mongo insert document', async () => {
    // The document cannot evaluate DATE_TRUNC.
    const TODAY = { $$_expression: 'CURRENT_DATE' };
    for (
      const clock of ['NOW', 'CURRENT_TIMESTAMP', 'CURRENT_TIMESTAMPTZ']
    ) {
      const { repo, exec } = mock('mongo');
      await repo.insert({ id: 1, day: { $$_expression: clock } } as never);
      asserts.assertEquals(written(exec, 'INSERT'), TODAY, clock);
    }
    const { repo, exec } = mock('mongo');
    await repo.insert([{ id: 1 }, { id: 2 }]);
    const { data } = exec.lastOf('INSERT') as unknown as { data: Row[] };
    asserts.assertEquals(data.map((row) => row.day), [TODAY, TODAY]);
  });

  it('is computed for a Mongo insert document when it adds to a Date', async () => {
    const add = (date: unknown, amount: number, unit: string) => ({
      $$_expression: 'DATE_ADD',
      args: { date, amount, unit },
    });
    const from = (iso: string) => new Date(iso);
    // A day the target month lacks is that month's last day, as oql's
    // DATE_ADD gives on the SQL engines.
    const cases: [ReturnType<typeof add>, string][] = [
      [add(from('2026-01-31T15:00:00Z'), 1, 'MONTHS'), '2026-02-28'],
      [add(from('2026-01-31T15:00:00Z'), 13, 'MONTHS'), '2027-02-28'],
      [add(from('2026-01-31T15:00:00Z'), -2, 'MONTHS'), '2025-11-30'],
      [add(from('2024-02-29T23:30:00Z'), 1, 'YEARS'), '2025-02-28'],
      [add(from('2026-01-31T15:00:00Z'), 30, 'DAYS'), '2026-03-02'],
      [add(from('2026-01-31T15:00:00Z'), 10, 'HOURS'), '2026-02-01'],
      [add(from('2026-12-31T23:30:00Z'), 30, 'MINUTES'), '2027-01-01'],
      [add(from('2026-12-31T23:59:30Z'), -31, 'SECONDS'), '2026-12-31'],
    ];
    for (const [expr, day] of cases) {
      const { repo, exec } = mock('mongo');
      await repo.insert({ id: 1, day: expr } as never);
      asserts.assertEquals(
        written(exec, 'INSERT'),
        from(`${day}T00:00:00Z`),
        JSON.stringify(expr.args),
      );
    }
    // Anything else is left for oql to refuse.
    for (
      const expr of [
        add(from('2026-01-31T15:00:00Z'), 1.5, 'DAYS'),
        add(from('2026-01-31T15:00:00Z'), 1, 'WEEKS'),
        add('@other', 1, 'DAYS'),
      ]
    ) {
      const { repo, exec } = mock('mongo');
      await repo.insert({ id: 1, day: expr } as never);
      asserts.assertEquals(written(exec, 'INSERT'), expr);
    }
  });
});

describe('norm.Repo — nullSafe relation keys', () => {
  // `tenant` is NOT NULL on both ends, `code`/`orgCode` nullable on both:
  // only the second pair can ever be NULL-safe. The pair is a declared
  // unique key of Orgs, so plain equality matches one Org at most.
  const Orgs = Entity('ns_orgs', {
    id: Column.integer(),
    tenant: Column.integer(),
    code: Column.varchar(20).nullable(),
  }, { pk: ['id'], unique: { ns_orgs_code: ['tenant', 'code'] } });
  const grantColumns = () => ({
    id: Column.integer(),
    tenant: Column.integer(),
    orgCode: Column.varchar(20).nullable(),
    perm: Column.varchar(20),
  });
  const Grants = Entity('ns_grants', grantColumns(), {
    pk: ['id'],
    fk: {
      Org: {
        model: 'Orgs',
        on: { tenant: 'tenant', orgCode: 'code' },
        reverseAs: 'Grants',
      },
    },
  });
  const SafeGrants = Entity('ns_safe_grants', grantColumns(), {
    pk: ['id'],
    fk: {
      Org: {
        model: 'Orgs',
        on: { tenant: 'tenant', orgCode: 'code' },
        reverseAs: 'SafeGrants',
        nullSafe: true,
      },
    },
  });
  const schema = () => use(Schema('NS', { Orgs, Grants, SafeGrants }));

  const mock = () => {
    const exec = new MockExec();
    const runtime = compileRuntime(schema(), {}, exec, () => {});
    return {
      // deno-lint-ignore no-explicit-any
      db: new NormDb<ReturnType<typeof schema>>(
        runtime,
        exec,
        undefined,
      ) as any,
      exec,
    };
  };
  const joinKeys = (exec: MockExec, alias: string): unknown =>
    (exec.lastOf('SELECT') as unknown as {
      joins: Record<string, { nullSafe?: string[] }>;
    }).joins[alias]!.nullSafe;
  const existsKeys = (exec: MockExec, type: string): unknown =>
    (exec.lastOf(type) as unknown as {
      where: { $exists: { nullSafe?: string[] } };
    }).where.$exists.nullSafe;
  const withOrg = { '@id': true, '@Org': true };

  it('an FK flag covers the nullable-on-both-sides pair only, in both directions', async () => {
    const { db, exec } = mock();
    await db.repo('SafeGrants').find(undefined, { project: withOrg });
    asserts.assertEquals(joinKeys(exec, 'Org'), ['@Org.@code']);
    await db.repo('Orgs').find(undefined, {
      project: { '@id': true, '@SafeGrants': true },
    });
    asserts.assertEquals(joinKeys(exec, 'SafeGrants'), [
      '@SafeGrants.@orgCode',
    ]);
    // Undeclared: plain equality.
    await db.repo('Grants').find(undefined, { project: withOrg });
    asserts.assertEquals(joinKeys(exec, 'Org'), undefined);
  });

  it('the read option overrides the FK flag, for all relations or per alias', async () => {
    const { db, exec } = mock();
    await db.repo('SafeGrants').find(undefined, {
      project: withOrg,
      nullSafe: false,
    });
    asserts.assertEquals(joinKeys(exec, 'Org'), undefined);
    await db.repo('Grants').find(undefined, {
      project: withOrg,
      nullSafe: true,
    });
    asserts.assertEquals(joinKeys(exec, 'Org'), ['@Org.@code']);
    await db.repo('Grants').getByPK({ id: 1 }, {
      project: withOrg,
      nullSafe: { Org: true },
    });
    asserts.assertEquals(joinKeys(exec, 'Org'), ['@Org.@code']);

    // An alias left out of the map keeps its FK's setting.
    const both = { '@id': true, '@Grants': true, '@SafeGrants': true };
    await db.repo('Orgs').find(undefined, {
      project: both,
      nullSafe: { Grants: true },
    });
    asserts.assertEquals(joinKeys(exec, 'Grants'), ['@Grants.@orgCode']);
    asserts.assertEquals(joinKeys(exec, 'SafeGrants'), [
      '@SafeGrants.@orgCode',
    ]);
    await db.repo('Orgs').find(undefined, {
      project: both,
      nullSafe: { SafeGrants: false },
    });
    asserts.assertEquals(joinKeys(exec, 'Grants'), undefined);
    asserts.assertEquals(joinKeys(exec, 'SafeGrants'), undefined);
  });

  it('a filter lifted to $exists carries the key, in find, count and the total count', async () => {
    const { db, exec } = mock();
    await db.repo('Orgs').find({ '@SafeGrants.@perm': 'read' });
    asserts.assertEquals(existsKeys(exec, 'SELECT'), ['@orgCode']);
    await db.repo('Orgs').find({ '@Grants.@perm': 'read' });
    asserts.assertEquals(existsKeys(exec, 'SELECT'), undefined);

    await db.repo('Orgs').count({ '@Grants.@perm': 'read' }, {
      nullSafe: true,
    });
    asserts.assertEquals(existsKeys(exec, 'COUNT'), ['@orgCode']);

    // total: true re-plans the filter for its COUNT — the projected
    // relation joins for the SELECT and lifts for the COUNT.
    exec.calls.length = 0;
    await db.repo('Orgs').find({ '@Grants.@perm': 'read' }, {
      project: { '@id': true, '@Grants': true },
      total: true,
      nullSafe: true,
    });
    asserts.assertEquals(joinKeys(exec, 'Grants'), ['@Grants.@orgCode']);
    asserts.assertEquals(existsKeys(exec, 'COUNT'), ['@orgCode']);
  });

  it('a per-alias flag that names no relation, or one with no nullable pair, is refused', async () => {
    const { db, exec } = mock();
    const unknown = await asserts.assertRejects(
      () => db.repo('Grants').find(undefined, { nullSafe: { Nope: true } }),
      NormQueryError,
      "Unknown relation alias 'Nope' in nullSafe",
    );
    asserts.assertEquals(unknown.context.code, 'UNKNOWN_RELATION');

    // Items.Owner joins NOT NULL columns.
    const items = makeDb();
    await asserts.assertRejects(
      // deno-lint-ignore no-explicit-any
      () =>
        (items.db.repo('Items') as any).find(undefined, {
          nullSafe: { Owner: true },
        }),
      NormQueryError,
      "nullSafe cannot apply to relation 'Owner'",
    );
    asserts.assertEquals(exec.calls.length + items.exec.calls.length, 0);
    // Turning it off there, or asking for every relation, is fine: the
    // relation just has nothing to make NULL-safe.
    for (const nullSafe of [{ Owner: false }, true]) {
      // deno-lint-ignore no-explicit-any
      await (items.db.repo('Items') as any).find(undefined, {
        project: { '@id': true, '@Owner': true },
        nullSafe,
      });
      asserts.assertEquals(joinKeys(items.exec, 'Owner'), undefined);
    }
  });

  it('live SQLite: NULL keys match only when NULL-safe', async () => {
    const norm = new Norm({
      database: { dialect: 'sqlite', path: ':memory:' },
    });
    const db = norm.use(Schema('NS', { Orgs, Grants }));
    await norm.connect();
    try {
      await db.raw(
        'CREATE TABLE ns_orgs (id INTEGER PRIMARY KEY, tenant INTEGER NOT NULL, code TEXT)',
      );
      await db.raw(
        'CREATE TABLE ns_grants (id INTEGER PRIMARY KEY, tenant INTEGER NOT NULL, orgCode TEXT, perm TEXT NOT NULL)',
      );
      await db.repo('Orgs').insert([
        { id: 1, tenant: 1, code: null },
        { id: 2, tenant: 1, code: 'a' },
        { id: 3, tenant: 2, code: null },
      ]);
      await db.repo('Grants').insert([
        { id: 10, tenant: 1, orgCode: null, perm: 'read' },
        { id: 11, tenant: 1, orgCode: 'a', perm: 'write' },
      ]);

      const orgOf = async (nullSafe?: boolean) =>
        (await db.repo('Grants').find(undefined, {
          project: { '@id': true, '@Org': { '@id': true } },
          orderBy: { '@id': 'ASC' },
          ...(nullSafe !== undefined ? { nullSafe } : {}),
        })).data.map((r) => [r.id, r.Org?.id ?? null]);
      asserts.assertEquals(await orgOf(), [[10, null], [11, 2]]);
      // Tenant still has to match: org 3 has a NULL code too.
      asserts.assertEquals(await orgOf(true), [[10, 1], [11, 2]]);

      const readers = { '@Grants.@perm': 'read' } as const;
      asserts.assertEquals((await db.repo('Orgs').find(readers)).data, []);
      asserts.assertEquals(
        (await db.repo('Orgs').find(readers, { nullSafe: true })).data.map((
          r,
        ) => r.id),
        [1],
      );
      asserts.assertEquals((await db.repo('Orgs').count(readers)).count, 0);
      asserts.assertEquals(
        (await db.repo('Orgs').count(readers, { nullSafe: true })).count,
        1,
      );
    } finally {
      await norm.disconnect();
    }
  });

  it('a filter through a NULL-safe to-one relation lifts to $exists on every dialect', async () => {
    const { db, exec } = mock();
    const viaOrg = { '@Org.@id': 1 };
    const lifted = {
      $exists: {
        table: 'ns_orgs',
        on: { '@tenant': '@tenant', '@code': '@orgCode' },
        nullSafe: ['@code'],
        where: { '@id': 1 },
      },
    };
    await db.repo('SafeGrants').find(viaOrg);
    await db.repo('SafeGrants').count(viaOrg);
    for (const type of ['SELECT', 'COUNT']) {
      const q = exec.lastOf(type) as unknown as Record<string, unknown>;
      asserts.assertEquals(q.where, lifted);
      asserts.assertEquals(q.joins, undefined);
    }
    // Plain equality matches one target at most: it joins.
    await db.repo('SafeGrants').find(viaOrg, { nullSafe: false });
    asserts.assertEquals(joinKeys(exec, 'Org'), undefined);

    // MongoDB lifts too: a join there tests each condition against any
    // matched row, where one row has to meet them all.
    Object.assign(exec.capabilities, { dialect: 'mongo' });
    await db.repo('SafeGrants').find(viaOrg);
    const q = exec.lastOf('SELECT') as unknown as Record<string, unknown>;
    asserts.assertEquals(q.where, lifted);
    asserts.assertEquals(q.joins, undefined);
  });

  it('a filter value from an unprojected NULL-safe to-one relation is refused on every dialect', async () => {
    const { db, exec } = mock();
    const sameTenant = { '@tenant': '@Org.@tenant' };
    const refused = async (read: () => Promise<unknown>, text: string) => {
      const err = await asserts.assertRejects(read, NormQueryError, text);
      asserts.assertEquals(err.context.code, 'INVALID_PROJECTION');
    };
    for (const dialect of ['mongo', 'sqlite']) {
      Object.assign(exec.capabilities, { dialect });
      const safe = db.repo('SafeGrants');
      await refused(() => safe.find(sameTenant), "Filter value '@Org.@tenant'");
      await refused(() => safe.count(sameTenant), 'NULL-safe relation');
      await refused(
        () => db.repo('Grants').find(sameTenant, { nullSafe: true }),
        'NULL-safe relation',
      );
      // total: true counts without the projection.
      await refused(
        () => safe.find(sameTenant, { project: withOrg, total: true }),
        'total: true cannot COUNT',
      );
    }
    asserts.assertEquals(exec.calls.length, 0);
    // Projected, or matched by plain equality, it joins.
    await db.repo('SafeGrants').find(sameTenant, { project: withOrg });
    asserts.assertEquals(joinKeys(exec, 'Org'), ['@Org.@code']);
    await db.repo('SafeGrants').find(sameTenant, { nullSafe: false });
    asserts.assertEquals(joinKeys(exec, 'Org'), undefined);
  });

  // Plain equality on both: `Seat` is a declared hasOne whose key no
  // unique key of Seats covers, `Tenant` reaches Orgs by `tenant` alone.
  const PlainSeats = Entity('ns_seats', grantColumns(), {
    pk: ['id'],
    fk: {
      Org: {
        model: 'Orgs',
        on: { tenant: 'tenant', orgCode: 'code' },
        reverseAs: 'Seat',
        reverseCardinality: 'hasOne',
      },
      Tenant: { model: 'Orgs', on: { tenant: 'tenant' } },
    },
  });

  it('a filter value from an unprojected to-one relation whose key is not unique is refused on every dialect', async () => {
    const exec = new MockExec();
    const seats = use(Schema('NS', { Orgs, Seats: PlainSeats }));
    const db = new NormDb<typeof seats>(
      compileRuntime(seats, {}, exec, () => {}),
      exec,
      undefined,
    );
    const below = { '@id': { $lt: '@Seat.@id' } } as const;
    const withSeat = { '@id': true, '@Seat': true } as const;
    const refused = async (read: () => Promise<unknown>, text: string) => {
      const err = await asserts.assertRejects(read, NormQueryError, text);
      asserts.assertEquals(err.context.code, 'INVALID_PROJECTION');
    };
    for (const dialect of ['mongo', 'sqlite']) {
      Object.assign(exec.capabilities, { dialect });
      const orgs = db.repo('Orgs');
      await refused(() => orgs.find(below), "Filter value '@Seat.@id'");
      await refused(
        () => orgs.count(below),
        "declare its join columns (tenant, orgCode) unique on 'Seats'",
      );
      await refused(
        () => db.repo('Seats').find({ '@id': { $gt: '@Tenant.@id' } }),
        "Filter value '@Tenant.@id'",
      );
      // total: true counts without the projection.
      await refused(
        () => orgs.find(below, { project: withSeat, total: true }),
        'total: true cannot COUNT',
      );
    }
    asserts.assertEquals(exec.calls.length, 0);
    // Projected, or on a declared unique key, it joins.
    await db.repo('Orgs').find(below, { project: withSeat });
    await db.repo('Seats').count({ '@id': { $gt: '@Org.@id' } });
    asserts.assertEquals(exec.calls.map((q) => q.type), ['SELECT', 'COUNT']);
  });

  it('live SQLite: a row whose NULL key matches several rows is returned and counted once', async () => {
    const Seats = Entity('ns_seats', grantColumns(), {
      pk: ['id'],
      fk: {
        Org: {
          model: 'Orgs',
          on: { tenant: 'tenant', orgCode: 'code' },
          reverseAs: 'Seat',
          reverseCardinality: 'hasOne',
          nullSafe: true,
        },
      },
    });
    const norm = new Norm({
      database: { dialect: 'sqlite', path: ':memory:' },
    });
    const db = norm.use(Schema('NS', { Orgs, Seats }));
    await norm.connect();
    try {
      await db.raw(
        'CREATE TABLE ns_orgs (id INTEGER PRIMARY KEY, tenant INTEGER NOT NULL, code TEXT)',
      );
      await db.raw(
        'CREATE TABLE ns_seats (id INTEGER PRIMARY KEY, tenant INTEGER NOT NULL, orgCode TEXT, perm TEXT NOT NULL)',
      );
      // Orgs 1 and 2 share a NULL code, as seats 10 and 12 do.
      await db.repo('Orgs').insert([
        { id: 1, tenant: 1, code: null },
        { id: 2, tenant: 1, code: null },
        { id: 3, tenant: 1, code: 'a' },
      ]);
      await db.repo('Seats').insert([
        { id: 10, tenant: 1, orgCode: null, perm: 'read' },
        { id: 11, tenant: 1, orgCode: 'a', perm: 'read' },
        { id: 12, tenant: 1, orgCode: null, perm: 'read' },
      ]);

      const viaOrg = { '@Org.@tenant': 1 } as const;
      const page = await db.repo('Seats').find(viaOrg, {
        orderBy: { '@id': 'ASC' },
        limit: 2,
        total: true,
      });
      asserts.assertEquals(page.data.map((r) => r.id), [10, 11]);
      asserts.assertEquals(page.total, 3);
      asserts.assertEquals((await db.repo('Seats').count(viaOrg)).count, 3);

      const viaSeat = { '@Seat.@perm': 'read' } as const;
      const orgs = await db.repo('Orgs').find(viaSeat, {
        orderBy: { '@id': 'ASC' },
      });
      asserts.assertEquals(orgs.data.map((r) => r.id), [1, 2, 3]);
      asserts.assertEquals((await db.repo('Orgs').count(viaSeat)).count, 3);
    } finally {
      await norm.disconnect();
    }
  });

  // Orgs 1 and 2 share a NULL code and are written 2 first; seats 10 and
  // 12 match both and are written 12 first. With no index to walk, SQLite
  // reads rows back in the order they were written.
  const seated = async () => {
    const Seats = Entity('ns_seats', grantColumns(), {
      pk: ['id'],
      fk: {
        Org: {
          model: 'Orgs',
          on: { tenant: 'tenant', orgCode: 'code' },
          reverseAs: 'Seat',
          reverseCardinality: 'hasOne',
          nullSafe: true,
        },
      },
    });
    const norm = new Norm({
      database: { dialect: 'sqlite', path: ':memory:' },
    });
    const db = norm.use(Schema('NS', { Orgs, Seats }));
    await norm.connect();
    await db.raw('PRAGMA automatic_index = OFF');
    await db.raw(
      'CREATE TABLE ns_orgs (id INTEGER NOT NULL, tenant INTEGER NOT NULL, code TEXT)',
    );
    await db.raw(
      'CREATE TABLE ns_seats (id INTEGER NOT NULL, tenant INTEGER NOT NULL, orgCode TEXT, perm TEXT NOT NULL)',
    );
    await db.repo('Orgs').insert([
      { id: 2, tenant: 1, code: null },
      { id: 1, tenant: 1, code: null },
      { id: 3, tenant: 1, code: 'a' },
    ]);
    await db.repo('Seats').insert([
      { id: 12, tenant: 1, orgCode: null, perm: 'write' },
      { id: 10, tenant: 1, orgCode: null, perm: 'read' },
      { id: 11, tenant: 1, orgCode: 'a', perm: 'read' },
    ]);
    return { norm, db };
  };

  it('live SQLite: a filter value from a NULL-safe to-one relation returns each row once when projected', async () => {
    const { norm, db } = await seated();
    try {
      const above = { '@id': { $gt: '@Org.@id' } } as const;
      for (
        const read of [
          () => db.repo('Seats').find(above),
          () => db.repo('Seats').count(above),
          () => db.repo('Orgs').find({ '@id': { $lt: '@Seat.@id' } }),
        ]
      ) {
        const err = await asserts.assertRejects(read, NormQueryError);
        asserts.assertEquals(err.context.code, 'INVALID_PROJECTION');
      }
      const projected = await db.repo('Seats').find(above, {
        project: { '@id': true, '@Org': { '@id': true } },
        orderBy: { '@id': 'ASC' },
      });
      asserts.assertEquals(
        projected.data.map((r) => [r.id, r.Org?.id]),
        [[10, 1], [11, 3], [12, 1]],
      );
      const plain = await db.repo('Seats').find(above, {
        orderBy: { '@id': 'ASC' },
        nullSafe: false,
      });
      asserts.assertEquals(plain.data.map((r) => r.id), [11]);
    } finally {
      await norm.disconnect();
    }
  });

  it('live SQLite: a filter value from a to-one relation whose key is not unique returns each row once when projected', async () => {
    const norm = new Norm({
      database: { dialect: 'sqlite', path: ':memory:' },
    });
    const db = norm.use(Schema('NS', { Orgs, Seats: PlainSeats }));
    await norm.connect();
    try {
      await db.raw(
        'CREATE TABLE ns_orgs (id INTEGER PRIMARY KEY, tenant INTEGER NOT NULL, code TEXT)',
      );
      await db.raw(
        'CREATE TABLE ns_seats (id INTEGER PRIMARY KEY, tenant INTEGER NOT NULL, orgCode TEXT, perm TEXT NOT NULL)',
      );
      await db.repo('Orgs').insert([
        { id: 1, tenant: 1, code: 'a' },
        { id: 12, tenant: 1, code: 'b' },
        { id: 3, tenant: 1, code: 'c' },
      ]);
      // Two seats each for orgs 1 and 12; of org 12's, only seat 13 is
      // above it.
      await db.repo('Seats').insert([
        { id: 10, tenant: 1, orgCode: 'a', perm: 'read' },
        { id: 11, tenant: 1, orgCode: 'a', perm: 'read' },
        { id: 5, tenant: 1, orgCode: 'b', perm: 'read' },
        { id: 13, tenant: 1, orgCode: 'b', perm: 'read' },
      ]);
      const below = { '@id': { $lt: '@Seat.@id' } } as const;
      const project = { '@id': true, '@Seat': { '@id': true } } as const;
      for (
        const read of [
          () => db.repo('Orgs').find(below),
          () => db.repo('Orgs').count(below),
          () => db.repo('Orgs').find(below, { project, total: true }),
        ]
      ) {
        const err = await asserts.assertRejects(read, NormQueryError);
        asserts.assertEquals(err.context.code, 'INVALID_PROJECTION');
      }
      const projected = await db.repo('Orgs').find(below, {
        project,
        orderBy: { '@id': 'ASC' },
      });
      asserts.assertEquals(
        projected.data.map((r) => [r.id, r.Seat?.id]),
        [[1, 10], [12, 13]],
      );
      const page = await db.repo('Orgs').find(below, {
        project,
        orderBy: { '@id': 'ASC' },
        limit: 1,
        offset: 1,
      });
      asserts.assertEquals(page.data.map((r) => r.id), [12]);
    } finally {
      await norm.disconnect();
    }
  });

  it('live SQLite: a to-one relation with several matches carries the one lowest by primary key', async () => {
    const { norm, db } = await seated();
    try {
      const seat = await db.repo('Seats').find({ '@id': 10 }, {
        project: { '@id': true, '@Org': true },
      });
      asserts.assertEquals(seat.data[0]!.Org, { id: 1, tenant: 1, code: null });
      // A projection that leaves the key out is still picked by it, and
      // the key is not returned.
      const perm = await db.repo('Orgs').find({ '@id': 1 }, {
        project: { '@id': true, '@Seat': { '@perm': true } },
      });
      asserts.assertEquals(perm.data[0]!.Seat, { perm: 'read' });
      const renamed = await db.repo('Orgs').find({ '@id': 1 }, {
        project: { '@id': true, '@Seat': { '@perm': '__pk_id' } },
      });
      asserts.assertEquals(renamed.data[0]!.Seat, { __pk_id: 'read' });
      // A match whose projected columns are all NULL is still a match;
      // by plain equality org 1 has none.
      const code = { '@id': true, '@Seat': { '@orgCode': true } } as const;
      const empty = await db.repo('Orgs').find({ '@id': 1 }, { project: code });
      asserts.assertEquals(empty.data[0]!.Seat, { orgCode: null });
      const none = await db.repo('Orgs').find({ '@id': 1 }, {
        project: code,
        nullSafe: false,
      });
      asserts.assertEquals(none.data[0]!.Seat, null);
    } finally {
      await norm.disconnect();
    }
  });

  it('a to-one pick orders by every column of a composite key', async () => {
    const Rooms = Entity('ns_rooms', {
      building: Column.integer(),
      room: Column.integer(),
      code: Column.varchar(20),
    }, { pk: ['building', 'room'] });
    const Desks = Entity('ns_desks', {
      id: Column.integer(),
      roomCode: Column.varchar(20),
    }, {
      pk: ['id'],
      fk: { Room: { model: 'Rooms', on: { roomCode: 'code' } } },
    });
    const exec = new MockExec();
    const rooms = use(Schema('NS', { Rooms, Desks }));
    const db = new NormDb<typeof rooms>(
      compileRuntime(rooms, {}, exec, () => {}),
      exec,
      undefined,
    );
    exec.selectQueue.push([{
      id: 1,
      Room: [
        { building: 2, room: 1, code: 'x' },
        { building: 1, room: 2, code: 'x' },
        { building: 1, room: 1, code: 'x' },
      ],
    }]);
    const found = await db.repo('Desks').find(undefined, {
      project: { '@id': true, '@Room': true },
    });
    asserts.assertEquals(found.data[0]!.Room, {
      building: 1,
      room: 1,
      code: 'x',
    });
  });

  it('a relation to a view, which has no primary key, carries its join columns', async () => {
    const Rooms = Entity('ns_rooms', {
      id: Column.integer(),
    }, { pk: ['id'] });
    const Notes = Entity('ns_room_notes', {
      roomId: Column.integer(),
      note: Column.varchar(20).nullable(),
    }, {
      type: 'VIEW',
      query: {
        type: 'SELECT',
        table: 'ns_desks',
        columns: ['roomId', 'note'],
        projection: { '@roomId': true, '@note': true },
      },
      fk: {
        Room: { model: 'Rooms', on: { roomId: 'id' }, reverseAs: 'Notes' },
      },
    });
    const exec = new MockExec();
    const rooms = use(Schema('NS', { Rooms, Notes }));
    const db = new NormDb<typeof rooms>(
      compileRuntime(rooms, {}, exec, () => {}),
      exec,
      undefined,
    );
    exec.selectQueue.push([{
      id: 1,
      Notes: [
        { note: null, __pk_roomId: 1 },
        { note: null, __pk_roomId: null },
      ],
    }]);
    const found = await db.repo('Rooms').find(undefined, {
      project: { '@id': true, '@Notes': { '@note': true } },
    });
    asserts.assertEquals(
      Object.keys(
        (exec.lastOf('SELECT') as unknown as {
          aggregates: { Notes: { columns: Record<string, unknown> } };
        }).aggregates.Notes.columns,
      ),
      ['note', '__pk_roomId'],
    );
    asserts.assertEquals(found.data[0]!.Notes, [{ note: null }]);
  });
});
