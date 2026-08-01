/**
 * Compile-step edges: reverse-name collision taxonomy, bare-name
 * fallback qualification, crypto config validation, and post-guardian
 * defaults for scope-excluded columns.
 */

import { describe, it } from '@tundralibs/compat/test';
import * as asserts from '@std/asserts';
import {
  Column,
  compileRuntime,
  Entity,
  type Executor,
  type ExecutorQuery,
  NormDb,
  NormDefinitionError,
  Schema,
  use,
} from './mod.ts';
import type { EngineQueryResult } from '@tundralibs/drivers';

type Row = Record<string, unknown>;

class CaptureExecutor implements Executor {
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
  execute<R extends Row>(q: ExecutorQuery): Promise<EngineQueryResult<R>> {
    this.calls.push(q);
    const data = q.type === 'INSERT' || q.type === 'UPSERT'
      ? (Array.isArray((q as { data: Row | Row[] }).data)
        ? (q as { data: Row[] }).data.map((r) => ({ ...r }))
        : [{ ...(q as { data: Row }).data }])
      : [];
    return Promise.resolve(
      {
        type: q.type,
        data,
        count: data.length,
        time: 1,
        isSlow: false,
      } as unknown as EngineQueryResult<R>,
    );
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
}

const Target = Entity('targets', {
  id: Column.integer(),
  Ghost: Column.varchar(10), // column named like a reverse candidate
}, { pk: ['id'] });

function compile(registry: Record<string, unknown>) {
  return compileRuntime(
    registry as Parameters<typeof compileRuntime>[0],
    {},
    new CaptureExecutor(),
    () => {},
  );
}

describe('norm.compile (reverse naming + crypto validation + scope defaults)', () => {
  it('reverseAs colliding with a TARGET COLUMN is a definition error', () => {
    const Src = Entity('srcs', {
      id: Column.integer(),
      tid: Column.integer(),
    }, {
      pk: ['id'],
      fk: { T: { model: 'Target', on: { tid: 'id' }, reverseAs: 'Ghost' } },
    });
    const err = asserts.assertThrows(
      () => compile(use(Schema('S', { Target, Src }))),
      NormDefinitionError,
    );
    asserts.assertStringIncludes(err.message, 'collides with column');
  });

  it('reverseAs colliding with a TARGET FK ALIAS is a definition error', () => {
    const Other = Entity('others', { id: Column.integer() }, { pk: ['id'] });
    const WithFk = Entity('withfks', {
      id: Column.integer(),
      oid: Column.integer(),
    }, {
      pk: ['id'],
      fk: { Owner: { model: 'Other', on: { oid: 'id' } } },
    });
    const Src = Entity('srcs', {
      id: Column.integer(),
      wid: Column.integer(),
    }, {
      pk: ['id'],
      fk: { W: { model: 'WithFk', on: { wid: 'id' }, reverseAs: 'Owner' } },
    });
    const err = asserts.assertThrows(
      () => compile(use(Schema('S', { Other, WithFk, Src }))),
      NormDefinitionError,
    );
    asserts.assertStringIncludes(err.message, 'foreign-key');
    asserts.assertStringIncludes(err.message, 'alias');
  });

  it('two explicit reverseAs claiming the same name: second is rejected', () => {
    const A = Entity('aa', {
      id: Column.integer(),
      tid: Column.integer(),
    }, {
      pk: ['id'],
      fk: { T: { model: 'Target', on: { tid: 'id' }, reverseAs: 'Kids' } },
    });
    const B = Entity('bb', {
      id: Column.integer(),
      tid: Column.integer(),
    }, {
      pk: ['id'],
      fk: { T: { model: 'Target', on: { tid: 'id' }, reverseAs: 'Kids' } },
    });
    const err = asserts.assertThrows(
      () => compile(use(Schema('S', { Target, A, B }))),
      NormDefinitionError,
    );
    asserts.assertStringIncludes(err.message, 'already taken');
  });

  it('single unnamed FK whose derived bare name collides is still a loud error', () => {
    // The bare name 'Ghost' collides with Target's column. claim()
    // records the issue BEFORE the `<src>_via_<alias>` fallback runs,
    // so compile throws rather than silently renaming — the author
    // must set reverseAs. (Pins current behavior; the fallback claim
    // never survives a collision.)
    const Ghost = Entity('ghosts', {
      id: Column.integer(),
      tid: Column.integer(),
    }, {
      pk: ['id'],
      fk: { T: { model: 'Target', on: { tid: 'id' } } },
    });
    const err = asserts.assertThrows(
      () => compile(use(Schema('S', { Target, Ghost }))),
      NormDefinitionError,
    );
    asserts.assertStringIncludes(err.message, 'collides with column');
  });

  it('crypto override pairing: encrypt without decrypt (and vice versa) rejected', () => {
    const Enc = Entity('encs', {
      id: Column.integer(),
      secret: Column.varchar(64).encrypt(),
    }, { pk: ['id'] });
    const reg = use(Schema('S', { Enc }));
    const exec = new CaptureExecutor();
    const half = (over: Record<string, unknown>) => () =>
      compileRuntime(
        reg,
        { secret: 's3cret', crypto: over as never },
        exec,
        () => {},
      );
    let err = asserts.assertThrows(
      half({ encrypt: () => Promise.resolve('x') }),
      NormDefinitionError,
    );
    asserts.assertStringIncludes(err.message, 'crypto.decrypt');
    err = asserts.assertThrows(
      half({ decrypt: () => Promise.resolve('x') }),
      NormDefinitionError,
    );
    asserts.assertStringIncludes(err.message, 'crypto.encrypt');
    // Both overridden together is fine.
    compileRuntime(
      reg,
      {
        secret: 's3cret',
        crypto: {
          encrypt: () => Promise.resolve('x'),
          decrypt: () => Promise.resolve('x'),
        } as never,
      },
      exec,
      () => {},
    );
  });

  it('digest-column spec validation: unknown algorithm, encrypt combo rejected', () => {
    // Hand-built specs (the builder cannot produce these) are still
    // validated at compile: the algorithm is DEFINITION data now.
    const bad = Entity('creds', {
      id: Column.integer(),
      password: Column.hash('SHA-256'),
    }, { pk: ['id'] });
    const forged = {
      ...bad,
      columns: {
        ...bad.columns,
        password: { ...bad.columns.password, hashed: 'MD5' },
      },
    } as unknown as typeof bad;
    let err = asserts.assertThrows(
      () => compile({ Creds: forged }),
      NormDefinitionError,
    );
    asserts.assertStringIncludes(err.message, 'unknown digest algorithm');

    const forgedEncrypt = {
      ...bad,
      columns: {
        ...bad.columns,
        password: { ...bad.columns.password, encrypt: true },
      },
    } as unknown as typeof bad;
    err = asserts.assertThrows(
      () => compile({ Creds: forgedEncrypt }),
      NormDefinitionError,
    );
    asserts.assertStringIncludes(err.message, 'one-way already');
  });

  it('scope-excluded columns still receive their defaults post-guardian', async () => {
    // `kind` is OUTSIDE the insert pick-list (disableInsert) but has a
    // literal default; `stamp` likewise with a bigint-string default —
    // both must reach the IR via postInsertDefaults (rehydrated).
    const Scoped = Entity('scoped', {
      id: Column.integer(),
      name: Column.varchar(40),
      kind: Column.varchar(10).default('std'),
      stamp: Column.bigint().default(5n),
    }, { pk: ['id'], insert: ['id', 'name'] });
    const exec = new CaptureExecutor();
    const runtime = compileRuntime(
      use(Schema('S', { Scoped })),
      {},
      exec,
      () => {},
    );
    const db = new NormDb<{ Scoped: typeof Scoped }>(runtime, exec, undefined);
    const r = await db.repo('Scoped').insert({ id: 1, name: 'a' });
    asserts.assertEquals(r.data[0]!.kind, 'std');
    asserts.assertEquals(r.data[0]!.stamp, 5n);
    // Out-of-scope caller payload is still rejected.
    await asserts.assertRejects(() =>
      db.repo('Scoped').insert({ id: 2, name: 'b', kind: 'x' } as never)
    );
  });

  it('scope-excluded columns with defaultOnUpdate auto-touch on update', async () => {
    const Touch = Entity('touch', {
      id: Column.integer(),
      name: Column.varchar(40),
      rev: Column.integer().default(0).defaultOnUpdate(() => 9),
    }, { pk: ['id'], update: ['name'] });
    const exec = new CaptureExecutor();
    const runtime = compileRuntime(
      use(Schema('S', { Touch })),
      {},
      exec,
      () => {},
    );
    const db = new NormDb<{ Touch: typeof Touch }>(runtime, exec, undefined);
    await db.repo('Touch').update({ name: 'n' }, { '@id': 1 });
    const q = exec.calls.find((c) => c.type === 'UPDATE') as unknown as {
      data: Row;
    };
    asserts.assertEquals(q.data.rev, 9);
  });
});
