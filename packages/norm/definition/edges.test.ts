/**
 * Definition-layer edge branches: builder corners (encrypted
 * nullable/default, date bounds, remaining factories), Entity/Schema
 * argument validation, QUERY-terminal rules through joins, ambiguous
 * bare-name resolution, and doc/snapshot emission of the rarer
 * column facts.
 */

import { describe, it } from '@tundralibs/compat/test';
import * as asserts from '@std/asserts';
import {
  Column,
  DigestColumnBuilder,
  Entity,
  type InsertOf,
  Schema,
  snapshot,
  toMarkdown,
  toMermaidERD,
  use,
} from './mod.ts';

type Equal<X, Y> = (<T>() => T extends X ? 1 : 2) extends
  (<T>() => T extends Y ? 1 : 2) ? true : false;
type Expect<T extends true> = T;

describe('norm.definition-edges (builders + validation + emitters)', () => {
  it('Column.hash(): digest columns — algorithm drives the length, plaintext validators chain', () => {
    asserts.assertEquals(Column.hash().spec, {
      type: 'VARCHAR',
      length: 64,
      hashed: 'SHA-256',
    });
    asserts.assertEquals(Column.hash('SHA-384').spec.length, 96);
    asserts.assertEquals(Column.hash('SHA-512').spec.length, 128);

    // Plaintext policy chains and the builder kind survives.
    const pwd = Column.hash('SHA-256').minLength(8)
      .pattern(/[0-9]/).beforeWrite((v) => v.trim());
    asserts.assertEquals(pwd instanceof DigestColumnBuilder, true);
    asserts.assertEquals(pwd.spec.minLength, 8);
    asserts.assertEquals(pwd.spec.hashed, 'SHA-256');
    asserts.assertEquals(pwd.nullable().spec.nullable, true);
    asserts.assertEquals(
      pwd.nullable() instanceof DigestColumnBuilder,
      true,
    );

    // The caller-facing TS type is plaintext string.
    const D = Entity('creds', {
      id: Column.integer(),
      password: Column.hash('SHA-256').minLength(8),
    }, { pk: ['id'] });
    type _pin = Expect<
      Equal<InsertOf<typeof D>['password'], string>
    >;

    // One-way: encrypting a digest is a hard error.
    asserts.assertThrows(
      () => Column.hash().encrypt(),
      Error,
      'one-way already',
    );
    // And double-encrypt is too.
    asserts.assertThrows(
      () => Column.varchar(10).encrypt().encrypt(),
      Error,
      'already encrypted',
    );
  });

  it('encrypt() on every value kind: logical type kept, validators must precede', () => {
    const E = Entity('vault', {
      id: Column.integer(),
      bornAt: Column.timestamp()
        .min(new Date('1900-01-01T00:00:00Z')).encrypt(),
      wealth: Column.bigint().min(0n).encrypt().hash(),
      score: Column.integer().encrypt(),
      flags: Column.json<{ vip: boolean }>().encrypt(),
      active: Column.boolean().encrypt(),
    }, { pk: ['id'] });
    const c = E.columns;
    // Logical types survive in the spec…
    asserts.assertEquals(c.bornAt.type, 'TIMESTAMP');
    asserts.assertEquals(c.bornAt.encrypt, true);
    asserts.assertEquals(c.wealth.type, 'BIGINT');
    asserts.assertEquals(c.wealth.hash, true);
    asserts.assertEquals(c.flags.type, 'JSONB'); // json() emits JSONB
    asserts.assertEquals(c.active.encrypt, true);
    // …and the sibling synthesis works for non-string sources too.
    asserts.assertEquals('wealth_hash' in c, true);
    // TS types unchanged by encryption.
    type _dt = Expect<Equal<InsertOf<typeof E>['bornAt'], Date>>;
    type _big = Expect<Equal<InsertOf<typeof E>['wealth'], bigint>>;

    // Validators are NOT on the encrypted surface (plaintext-first).
    const enc = Column.timestamp().encrypt();
    asserts.assertEquals('min' in enc, false);
  });

  it('encrypted builders: nullable() and default() keep the encrypt kind', () => {
    const spec = Entity('e', {
      id: Column.integer(),
      a: Column.varchar(64).encrypt().nullable(),
      b: Column.varchar(64).encrypt().default('unset'),
    }, { pk: ['id'] }).columns;
    asserts.assertEquals(spec.a.encrypt, true);
    asserts.assertEquals(spec.a.nullable, true);
    asserts.assertEquals(spec.b.encrypt, true);
    asserts.assertEquals(spec.b.default?.insert, 'unset');
    // Still chainable to hash() semantics via the encrypted builder.
    const hashed = Entity('h', {
      id: Column.integer(),
      c: Column.varchar(64).encrypt().nullable().hash(),
    }, { pk: ['id'] }).columns;
    asserts.assertEquals(hashed.c.hash, true);
  });

  it('digest builders: default() declares PLAINTEXT and keeps the digest kind', () => {
    const spec = Entity('d', {
      id: Column.integer(),
      // Sibling of the encrypted case above: the declared default is the
      // PLAINTEXT — digesting happens on the way to the database.
      pin: Column.hash('SHA-256').default('changeme'),
      pw: Column.password('SHA-512').maxLength(72).default('letmein'),
    }, { pk: ['id'] }).columns;

    asserts.assertEquals(spec.pin.hashed, 'SHA-256');
    asserts.assertEquals(spec.pin.default?.insert, 'changeme');
    // The stored default is the literal plaintext, NOT a precomputed
    // digest: the physical column is digest-sized (64 hex chars) while
    // the default is the 8-char plaintext the caller wrote.
    asserts.assertEquals(spec.pin.length, 64);
    asserts.assertEquals((spec.pin.default?.insert as string).length, 8);

    // maxLength() constrains the PLAINTEXT, so it coexists with the
    // digest's own storage length rather than overriding it.
    asserts.assertEquals(spec.pw.hashed, 'SHA-512');
    asserts.assertEquals(spec.pw.length, 128);
    asserts.assertEquals(spec.pw.maxLength, 72);
    asserts.assertEquals(spec.pw.default?.insert, 'letmein');

    // The digest kind survives default(), so plaintext validators stay
    // chainable after it (they constrain the password policy).
    const chained = Column.hash('SHA-256').default('changeme')
      .minLength(8).maxLength(64);
    asserts.assertEquals(chained instanceof DigestColumnBuilder, true);
    asserts.assertEquals(chained.spec.minLength, 8);
    asserts.assertEquals(chained.spec.maxLength, 64);
    asserts.assertEquals(chained.spec.default?.insert, 'changeme');

    // default() returns a NEW builder — the source is left untouched.
    const base = Column.hash('SHA-256');
    const withDefault = base.default('changeme');
    asserts.assertNotStrictEquals<unknown>(withDefault, base);
    asserts.assertEquals(base.spec.default, undefined);
    asserts.assertEquals(withDefault.spec.default?.insert, 'changeme');

    // Generator and expression forms survive the digest surface too.
    const gen = Column.hash('SHA-256').default(() => 'rotating');
    asserts.assertEquals(typeof gen.spec.default?.insert, 'function');
    const expr = Column.hash('SHA-256').default({ $$_expression: 'X' });
    asserts.assertEquals(expr.spec.default?.insert, { $$_expression: 'X' });
  });

  it('remaining factories emit the right specs (char/decimal/boolean/date)', () => {
    const spec = Entity('f', {
      id: Column.integer(),
      code: Column.char(2),
      price: Column.decimal(8, 2),
      ok: Column.boolean(),
      day: Column.date()
        .min(new Date('2020-01-01T00:00:00Z'))
        .max(new Date('2029-12-31T00:00:00Z')),
    }, { pk: ['id'] }).columns;
    asserts.assertEquals(spec.code.type, 'CHAR');
    asserts.assertEquals(spec.code.length, 2);
    asserts.assertEquals(spec.price.type, 'DECIMAL');
    asserts.assertEquals(spec.price.precision, 8);
    asserts.assertEquals(spec.price.scale, 2);
    asserts.assertEquals(spec.ok.type, 'BOOLEAN');
    asserts.assertEquals(spec.day.type, 'DATE');
    asserts.assertEquals(typeof spec.day.min, 'string'); // ISO at rest
    asserts.assertEquals(typeof spec.day.max, 'string');
  });

  it('Entity/Schema argument validation: empty names, zero columns', () => {
    asserts.assertThrows(
      () => Entity('  ', { id: Column.integer() }, { pk: ['id'] }),
      Error,
      'non-empty string',
    );
    asserts.assertThrows(
      () => Entity('t', {}, { pk: [] as never }),
      Error,
      'at least one column',
    );
    asserts.assertThrows(
      () =>
        Schema('', {
          X: Entity('x', { id: Column.integer() }, { pk: ['id'] }),
        }),
      Error,
      'non-empty string',
    );
  });

  it('VIEW: dbSchema is carried; FK reverseCardinality is emitted', () => {
    const V = Entity('v_active', {
      id: Column.integer(),
    }, {
      type: 'VIEW',
      dbSchema: 'reporting',
      comment: 'active rows only',
      query: {
        type: 'SELECT',
        table: 'base',
        columns: ['id'],
        projection: { '@id': true },
      },
    });
    asserts.assertEquals((V as { dbSchema?: string }).dbSchema, 'reporting');
    asserts.assertEquals(
      (V as { comment?: string }).comment,
      'active rows only',
    );

    const WithCard = Entity('cards', {
      id: Column.integer(),
      uid: Column.integer(),
    }, {
      pk: ['id'],
      fk: {
        U: {
          model: 'Users',
          on: { uid: 'id' },
          reverseAs: 'Cards',
          reverseCardinality: 'hasOne',
        },
      },
    });
    asserts.assertEquals(
      WithCard.foreignKeys?.U.reverseCardinality,
      'hasOne',
    );
  });

  it('use(): a stored SELECT JOINING a QUERY entity is rejected', () => {
    const Q = Entity('q_top', { id: Column.integer() }, {
      type: 'QUERY',
      query: {
        type: 'SELECT',
        table: 'base',
        columns: ['id'],
        projection: { '@id': true },
      },
    });
    const Base = Entity('base', { id: Column.integer() }, { pk: ['id'] });
    const Joiner = Entity('joiner', { id: Column.integer() }, {
      type: 'QUERY',
      query: {
        type: 'SELECT',
        table: 'base',
        columns: ['id'],
        projection: { '@id': true },
        joins: {
          Q: {
            table: 'q_top',
            columns: ['id'],
            on: { '@id': '@Q.@id' },
          },
        } as never,
      },
    });
    const err = asserts.assertThrows(
      () => use(Schema('S', { Base, Q, Joiner })),
      Error,
    );
    asserts.assertStringIncludes(err.message, 'cannot be joined');
  });

  it('use(): ambiguous bare table names only reject when a QUERY is among them', () => {
    // Two entities share the BARE name 'dup' — the table is
    // dbSchema-qualified so the QUALIFIED names stay unique (bare
    // duplicates are rejected outright). A bare read of 'dup' is then
    // ambiguous, and a QUERY is among the candidates.
    const T = Entity('dup', { id: Column.integer() }, {
      pk: ['id'],
      dbSchema: 'legacy',
    });
    const Q = Entity('dup', { id: Column.integer() }, {
      type: 'QUERY',
      query: {
        type: 'SELECT',
        table: 'somewhere',
        columns: ['id'],
        projection: { '@id': true },
      },
    });
    const Reader = Entity('reader', { id: Column.integer() }, {
      type: 'VIEW',
      query: {
        type: 'SELECT',
        table: 'dup', // ambiguous — and a QUERY is among the candidates
        columns: ['id'],
        projection: { '@id': true },
      },
    });
    const Somewhere = Entity('somewhere', { id: Column.integer() }, {
      pk: ['id'],
    });
    const err = asserts.assertThrows(
      () =>
        use(
          Schema('S1', { T }),
          Schema('S2', { Q }),
          Schema('S3', { Reader, Somewhere }),
        ),
      Error,
    );
    asserts.assertStringIncludes(err.message, 'QUERY');

    // Same shape but both candidates are TABLE/VIEW → composes fine.
    const T2 = Entity('dup2', { id: Column.integer() }, { pk: ['id'] });
    const V2 = Entity('dup2', { id: Column.integer() }, {
      type: 'VIEW',
      dbSchema: 'other',
      query: {
        type: 'SELECT',
        table: 'somewhere',
        columns: ['id'],
        projection: { '@id': true },
      },
    });
    const Reader2 = Entity('reader2', { id: Column.integer() }, {
      type: 'VIEW',
      query: {
        type: 'SELECT',
        table: 'dup2',
        columns: ['id'],
        projection: { '@id': true },
      },
    });
    use(
      Schema('S1', { T2, Somewhere }),
      Schema('S2', { V2 }),
      Schema('S3', { Reader2 }),
    );
  });

  it('toMarkdown: decimal type, defaults, constraint summary, indexes, QUERY source', () => {
    const Rich = Entity('rich', {
      id: Column.integer(),
      price: Column.decimal(8, 2).min(0.5).max(99.5),
      email: Column.varchar(255).encrypt().hash(),
      token: Column.varchar(255).encrypt(),
      ghost: Column.varchar(10).hidden().unfilterable(),
      status: Column.varchar(8).lov(['a', 'b']).default('a'),
      slug: Column.varchar(20).pattern(/^[a-z]+$/).minLength(2).maxLength(20),
      made: Column.timestamp().default(() => new Date()),
      uid: Column.uuid().default({ $$_expression: 'UUID' }),
    }, {
      pk: ['id'],
      index: { byStatus: ['status'], bySlug: ['slug'] },
    });
    const Q = Entity('q_rich', { id: Column.integer() }, {
      type: 'QUERY',
      query: {
        type: 'SELECT',
        table: 'rich',
        columns: ['id'],
        projection: { '@id': true },
      },
    });
    const md = toMarkdown({ Rich, Q });
    asserts.assertStringIncludes(md, 'DECIMAL(8,2)');
    asserts.assertStringIncludes(md, 'encrypted+hash');
    asserts.assertStringIncludes(md, 'encrypted');
    asserts.assertStringIncludes(md, 'hidden');
    asserts.assertStringIncludes(md, 'unfilterable');
    asserts.assertStringIncludes(md, 'lov(a\\|b)'); // pipe escaped for GFM
    asserts.assertStringIncludes(md, 'pattern(/^[a-z]+$/)');
    asserts.assertStringIncludes(md, 'min(0.5)');
    asserts.assertStringIncludes(md, 'max(99.5)');
    asserts.assertStringIncludes(md, 'minLength(2)');
    asserts.assertStringIncludes(md, 'maxLength(20)');
    asserts.assertStringIncludes(md, '(generated)');
    asserts.assertStringIncludes(md, 'expr:UUID');
    asserts.assertStringIncludes(md, '"a"'); // literal default rendered as JSON
    asserts.assertStringIncludes(md, 'Index byStatus');
    asserts.assertStringIncludes(md, 'status');
    asserts.assertStringIncludes(md, 'Reads from');

    // The hash sibling is norm-owned: disableInsert+disableUpdate.
    asserts.assertStringIncludes(md, 'norm-owned');
  });

  it('toMermaidERD: qualified FK refs resolve; ambiguous bare refs are skipped', () => {
    const A = Entity('shared', { id: Column.integer() }, { pk: ['id'] });
    const B = Entity('shared', { id: Column.integer() }, {
      pk: ['id'],
      dbSchema: 'other',
    });
    const Child = Entity('children', {
      id: Column.integer(),
      pid: Column.integer(),
    }, {
      pk: ['id'],
      // Bare-name ref 'shared' is ambiguous (two entities) — the edge
      // is skipped rather than guessed.
      fk: { P: { model: 'shared', on: { pid: 'id' } } },
    });
    const erd = toMermaidERD({ A, B, Child });
    asserts.assertStringIncludes(erd, 'erDiagram');
    asserts.assertEquals(erd.includes('||--'), false);

    // Qualified 'other.shared' resolves.
    const Child2 = Entity('children2', {
      id: Column.integer(),
      pid: Column.integer(),
    }, {
      pk: ['id'],
      fk: { P: { model: 'other.shared', on: { pid: 'id' } } },
    });
    const erd2 = toMermaidERD({ A, B, Child2 });
    asserts.assertEquals(erd2.includes('--'), true);
  });

  it('snapshot: precision/scale, nullable, encrypt+hash flags, indexes', () => {
    const T = Entity('facts', {
      id: Column.integer(),
      price: Column.decimal(8, 2).nullable(),
      email: Column.varchar(255).encrypt().hash(),
      note: Column.text().nullable(),
    }, {
      pk: ['id'],
      index: { byNote: ['note'] },
    });
    const snap = snapshot({ T }) as {
      entities: Record<string, Record<string, unknown>>;
    };
    const t = snap.entities.T as {
      columns: Record<string, Record<string, unknown>>;
      indexes?: Record<string, string[]>;
    };
    asserts.assertEquals(t.columns.price, {
      type: 'DECIMAL',
      precision: 8,
      scale: 2,
      nullable: true,
    });
    asserts.assertEquals(t.columns.email.encrypt, true);
    asserts.assertEquals(t.columns.email.hash, true);
    asserts.assertEquals(t.indexes, { byNote: ['note'] });
  });
});
