/**
 * Definition-layer tests: builder chains (validators, kind
 * preservation, local default generators), `Entity()` (TABLE/VIEW/
 * QUERY kinds, FK name emission, row-level hooks) — and the
 * TYPE-level assertions proving the inference payoff (RowOf /
 * InsertOf / UpdateOf / PrimaryKeyOf read builder phantoms; no
 * `as const`, no literal decoding).
 */

import { describe, it } from '@tundralibs/compat/test';
import * as asserts from '@std/asserts';
import { assertDefinition } from '../asserts/mod.ts';
import {
  Column,
  Entity,
  type EntityViewOptions,
  HashedColumnBuilder,
  type InsertOf,
  type PrimaryKeyOf,
  type RowOf,
  type UpdateOf,
} from './mod.ts';

// ── Type-assertion helpers ───────────────────────────────────────────
type Equal<X, Y> = (<T>() => T extends X ? 1 : 2) extends
  (<T>() => T extends Y ? 1 : 2) ? true : false;
type Expect<T extends true> = T;

// ── Fixtures ─────────────────────────────────────────────────────────

const Users = Entity('users', {
  id: Column.uuid().default({ $$_expression: 'UUID' }),
  email: Column.varchar(255).encrypt().hash()
    .beforeWrite((v) => v.trim().toLowerCase()),
  age: Column.integer().nullable(),
  role: Column.varchar(32).default('member'),
  passwordHash: Column.varchar(64).hidden(),
  meta: Column.json<{ tags: string[] }>().nullable(),
}, {
  pk: ['id'],
  index: { byRole: ['role'] },
});

const Posts = Entity('posts', {
  id: Column.integer(),
  userId: Column.uuid(),
  title: Column.varchar(120),
}, {
  pk: ['id'],
  fk: {
    // Entity KEY — resolved when schemas compose in use().
    Author: { model: 'Users', on: { userId: 'id' } },
  },
});

const Memberships = Entity('memberships', {
  orgId: Column.uuid(),
  userId: Column.uuid(),
  role: Column.varchar(32),
}, { pk: ['orgId', 'userId'] });

const ActiveUsers = Entity('active_users', {
  id: Column.uuid(),
  email: Column.varchar(255),
}, {
  type: 'VIEW',
  query: {
    type: 'SELECT',
    table: 'users',
    columns: ['id', 'email'],
    projection: { '@id': true, '@email': true },
  },
});

const RoleCounts = Entity('role_counts', {
  role: Column.varchar(32),
  total: Column.integer(),
}, {
  type: 'QUERY',
  query: {
    type: 'SELECT',
    table: 'users',
    columns: ['role'],
    projection: { '@role': true },
  },
});

describe('norm.definition (builders + Entity)', () => {
  it('extended column kinds: float/double/real/time/datetime/timestamptz/json/blob', () => {
    asserts.assertEquals(Column.float().spec.type, 'FLOAT');
    asserts.assertEquals(Column.double().spec.type, 'DOUBLE');
    asserts.assertEquals(Column.real().spec.type, 'REAL');
    asserts.assertEquals(Column.time().spec.type, 'TIME');
    asserts.assertEquals(Column.datetime().spec.type, 'DATETIME');
    asserts.assertEquals(Column.timestamptz().spec.type, 'TIMESTAMPTZ');
    // json() emits JSONB (never bare JSON — the Postgres default).
    asserts.assertEquals(Column.json().spec.type, 'JSONB');
    asserts.assertEquals(Column.blob().spec.type, 'BLOB');

    // Extended SQL types.
    asserts.assertEquals(Column.int().spec.type, 'INT');
    asserts.assertEquals(Column.tinyint().spec.type, 'TINYINT');
    asserts.assertEquals(Column.smallint().spec.type, 'SMALLINT');
    asserts.assertEquals(Column.numeric(10, 2).spec.type, 'NUMERIC');
    asserts.assertEquals(Column.numeric(10, 2).spec.precision, 10);
    asserts.assertEquals(Column.clob().spec.type, 'CLOB');
    asserts.assertEquals(Column.xml().spec.type, 'XML');
    asserts.assertEquals(Column.bit().spec.type, 'BIT');
    asserts.assertEquals(Column.binary(16).spec.type, 'BINARY');
    asserts.assertEquals(Column.binary(16).spec.length, 16);
    asserts.assertEquals(Column.varbinary(32).spec.type, 'VARBINARY');
    // password() is a digest column, identical to hash().
    asserts.assertEquals(Column.password().spec.type, 'VARCHAR');
    asserts.assertEquals(Column.password().spec.hashed, 'SHA-256');
    asserts.assertEquals(
      Column.password('SHA-512').spec,
      Column.hash('SHA-512').spec,
    );
    // Extended numerics keep the validator chain (integer branch).
    asserts.assertEquals(Column.smallint().min(0).max(9).spec.max, 9);
    // clob/xml keep string validators.
    asserts.assertEquals(Column.clob().maxLength(1000).spec.maxLength, 1000);

    // Numeric/date kinds keep their validator + crypto chains.
    asserts.assertEquals(Column.float().min(0).encrypt().spec.encrypt, true);
    asserts.assertEquals(
      Column.datetime().encrypt().nullable().spec.nullable,
      true,
    );

    // Binary columns cannot encrypt — the codec is text-canonical.
    asserts.assertThrows(
      () =>
        Entity('bin', {
          id: Column.integer(),
          raw: Column.blob().encrypt() as never,
        }, { pk: ['id'] }),
      Error,
      'binary columns cannot encrypt',
    );
  });

  it('VIEW logical fk: emitted + reverse rules; QUERY stays terminal', () => {
    const body = () => ({
      type: 'SELECT' as const,
      table: 'post_tags',
      columns: ['postId', 'tagId'],
      projection: { '@postId': true, '@tagId': true },
    });

    // Logical fk rides the emitted VIEW definition (join-only).
    const V = Entity('tags_of_posts', {
      postId: Column.integer(),
      name: Column.varchar(40),
    }, {
      type: 'VIEW',
      query: body(),
      fk: { Post: { model: 'Posts', on: { postId: 'id' }, reverseAs: 'Tags' } },
    });
    asserts.assertEquals(V.foreignKeys?.Post.model, 'Posts');
    asserts.assertEquals(V.foreignKeys?.Post.reverseAs, 'Tags');

    // FK rules apply to views: ghost local column is a loud error.
    asserts.assertThrows(
      () =>
        Entity('bad_view', { postId: Column.integer() }, {
          type: 'VIEW',
          query: body(),
          fk: { Post: { model: 'Posts', on: { ghost: 'id' } } },
        } as never),
      Error,
      "local column 'ghost' does not exist",
    );

    // Views have no pk — reverseProject demands an EXPLICIT hasOne.
    asserts.assertThrows(
      () =>
        Entity('bad_rp', { postId: Column.integer() }, {
          type: 'VIEW',
          query: body(),
          fk: {
            Post: {
              model: 'Posts',
              on: { postId: 'id' },
              reverseProject: true,
            },
          },
        } as never),
      Error,
      'views have no primary key',
    );

    // QUERY entities are terminal — hand-built fk is rejected.
    const forgedQuery = {
      ...Entity('q', { postId: Column.integer() }, {
        type: 'QUERY',
        query: body(),
      }),
      foreignKeys: { Post: { model: 'Posts', on: { postId: 'id' } } },
    };
    asserts.assertThrows(
      () => assertDefinition(forgedQuery as never),
      Error,
      'terminal',
    );
  });

  it('FK referential actions: emitted on TABLE, validated, rejected on VIEW', () => {
    // Emitted onto the TABLE definition's FK.
    const Profiles = Entity('profiles', {
      userId: Column.integer(),
      bio: Column.text().nullable(),
    }, {
      pk: ['userId'],
      fk: {
        User: {
          model: 'Users',
          on: { userId: 'id' },
          onDelete: 'CASCADE',
          onUpdate: 'SET_NULL',
        },
      },
    });
    asserts.assertEquals(Profiles.foreignKeys?.User.onDelete, 'CASCADE');
    asserts.assertEquals(Profiles.foreignKeys?.User.onUpdate, 'SET_NULL');

    // Invalid action → loud.
    asserts.assertThrows(
      () =>
        Entity('p2', { userId: Column.integer() }, {
          pk: ['userId'],
          fk: {
            User: { model: 'Users', on: { userId: 'id' }, onDelete: 'DELETE' },
          },
        } as never),
      Error,
      'not a valid referential action',
    );

    // On a VIEW's LOGICAL fk → rejected (no physical constraint).
    asserts.assertThrows(
      () =>
        Entity('v', { userId: Column.integer() }, {
          type: 'VIEW',
          query: {
            type: 'SELECT',
            table: 'profiles',
            columns: ['userId'],
            projection: { '@userId': true },
          },
          fk: {
            User: { model: 'Users', on: { userId: 'id' }, onDelete: 'CASCADE' },
          },
        } as never),
      Error,
      'meaningless on a VIEW',
    );
  });

  it('materialized views carry the flag onto the emitted definition', () => {
    const MV = Entity('daily', { day: Column.varchar(10) }, {
      type: 'VIEW',
      materialized: true,
      query: {
        type: 'SELECT',
        table: 'visits',
        columns: ['day'],
        projection: { '@day': true },
      },
    });
    asserts.assertEquals(MV.materialized, true);
    // Plain views stay unflagged.
    const V = Entity('plain', { day: Column.varchar(10) }, {
      type: 'VIEW',
      query: {
        type: 'SELECT',
        table: 'visits',
        columns: ['day'],
        projection: { '@day': true },
      },
    });
    asserts.assertEquals('materialized' in V, false);
  });

  // ── Builders emit plain data ──────────────────────────────────────

  it('chains emit plain specs (immutable — base builders are reusable)', () => {
    const base = Column.varchar(64);
    const modified = base.nullable().hidden();
    asserts.assertEquals(base.spec, { type: 'VARCHAR', length: 64 });
    asserts.assertEquals(modified.spec, {
      type: 'VARCHAR',
      length: 64,
      nullable: true,
      project: false,
    });
  });

  it('specs are serializable data (transform fns aside)', () => {
    const roundtrip = JSON.parse(JSON.stringify(Users.columns.id));
    asserts.assertEquals(roundtrip, {
      type: 'UUID',
      default: { insert: { $$_expression: 'UUID' } },
    });
  });

  it('encrypt().hash() sets both flags; beforeWrite is carried', () => {
    const spec = Users.columns.email;
    asserts.assertEquals(spec.encrypt, true);
    asserts.assertEquals(spec.hash, true);
    const fn = spec.transforms?.beforeWrite as (v: string) => string;
    asserts.assertEquals(fn('  MiXeD@X.com '), 'mixed@x.com');
  });

  // ── Validators (plain constraint data + type narrowing) ──────────

  it('validators emit plain constraint data', () => {
    const status = Column.varchar(16).lov(['active', 'banned']);
    asserts.assertEquals(status.spec.lov, ['active', 'banned']);

    const slug = Column.varchar(80).pattern(/^[a-z0-9-]+$/).minLength(3)
      .maxLength(80);
    asserts.assertEquals(slug.spec.pattern, { source: '^[a-z0-9-]+$' });
    asserts.assertEquals(slug.spec.minLength, 3);
    asserts.assertEquals(slug.spec.maxLength, 80);

    const ci = Column.varchar(10).pattern(/^ab+$/i);
    asserts.assertEquals(ci.spec.pattern, { source: '^ab+$', flags: 'i' });
    const fromString = Column.varchar(10).pattern('^x$');
    asserts.assertEquals(fromString.spec.pattern, { source: '^x$' });

    const qty = Column.integer().min(0).max(100);
    asserts.assertEquals(qty.spec.min, 0);
    asserts.assertEquals(qty.spec.max, 100);

    // Bigint bounds/lov are stored as strings (JSON-safe).
    const big = Column.bigint().min(0n).lov([1n, 2n]);
    asserts.assertEquals(big.spec.min, '0');
    asserts.assertEquals(big.spec.lov, ['1', '2']);

    // Date bounds canonicalize to ISO strings (timezone-stable,
    // diff-stable across the JSON roundtrip).
    const day = Column.date().min(new Date('2020-01-01'));
    asserts.assertEquals(day.spec.min, '2020-01-01T00:00:00.000Z');

    // Everything above survives a JSON roundtrip.
    const json = JSON.parse(JSON.stringify(slug.spec));
    asserts.assertEquals(json.pattern, { source: '^[a-z0-9-]+$' });
  });

  it('lov() narrows the TS type — no `as const` anywhere', () => {
    const status = Column.varchar(16).lov(['active', 'banned']);
    type _lov = Expect<
      Equal<
        NonNullable<(typeof status)['spec']['$type']>,
        'active' | 'banned'
      >
    >;

    // Both chain orders preserve null.
    const afterNullable = Column.varchar(16).nullable().lov(['a', 'b']);
    const beforeNullable = Column.varchar(16).lov(['a', 'b']).nullable();
    type _n1 = Expect<
      Equal<
        (typeof afterNullable)['spec']['$type'],
        'a' | 'b' | null | undefined
      >
    >;
    type _n2 = Expect<
      Equal<
        (typeof beforeNullable)['spec']['$type'],
        'a' | 'b' | null | undefined
      >
    >;

    // Numeric lov narrows too (bigint literals).
    const bits = Column.bigint().lov([1n, 2n]);
    type _bits = Expect<
      Equal<NonNullable<(typeof bits)['spec']['$type']>, 1n | 2n>
    >;

    // default() is checked against the narrowed union.
    const ok = Column.varchar(16).lov(['a', 'b']).default('a');
    void ok;
    // @ts-expect-error — 'x' is not in the lov union.
    const bad = Column.varchar(16).lov(['a', 'b']).default('x');
    void bad;

    asserts.assertEquals(status.spec.lov?.length, 2);
  });

  it('chains preserve the builder kind (no decay to base)', () => {
    // nullable/default after encrypt/hash keep the branding…
    const sec = Column.varchar(64).encrypt().hash().nullable()
      .comment('secret');
    asserts.assertEquals(sec.spec.encrypt, true);
    asserts.assertEquals(sec.spec.hash, true);
    asserts.assertEquals(sec.spec.nullable, true);
    asserts.assertEquals(sec.spec.comment, 'secret');

    // …so the hash sibling is still synthesized, and follows
    // the source column's nullability.
    const Vault = Entity('vault', {
      id: Column.integer(),
      sec: Column.varchar(64).encrypt().hash().nullable(),
    }, { pk: ['id'] });
    const sibling = (Vault.columns as Record<string, { nullable?: true }>)
      .sec_hash;
    asserts.assertEquals(sibling.nullable, true);
    type _siblingType = Expect<
      Equal<RowOf<typeof Vault>['sec_hash'], string | null>
    >;

    // Validators before encrypt() — the plaintext constraint chain.
    const email = Column.varchar(255).pattern(/@/).minLength(3).encrypt()
      .hash();
    asserts.assertEquals(email.spec.pattern, { source: '@' });
    asserts.assertEquals(email.spec.encrypt, true);
    asserts.assertEquals(email.spec.hash, true);
  });

  it('local default generators work on BOTH insert and update slots', () => {
    const touched = Column.timestamp().default(() => new Date(0))
      .defaultOnUpdate(() => new Date(1));
    const ins = touched.spec.default?.insert as () => Date;
    const upd = touched.spec.default?.update as () => Date;
    asserts.assertEquals(ins().getTime(), 0);
    asserts.assertEquals(upd().getTime(), 1);
    // Function defaults are dropped by the JSON export (runtime-only).
    asserts.assertEquals(
      JSON.parse(JSON.stringify(touched.spec)).default,
      {},
    );
  });

  it('canonicalizes bigint and Date literals in defaults (JSON-safe)', () => {
    const big = Column.bigint().default(1n).defaultOnUpdate(2n);
    asserts.assertEquals(big.spec.default, { insert: '1', update: '2' });
    const when = Column.timestamp().default(new Date('2020-01-01'));
    asserts.assertEquals(
      when.spec.default?.insert,
      '2020-01-01T00:00:00.000Z',
    );
    // The whole entity stringifies — no bigint TypeError.
    const Big = Entity('bigt', { id: Column.integer(), n: big }, {
      pk: ['id'],
    });
    asserts.assertEquals(
      JSON.parse(JSON.stringify(Big)).columns.n.default,
      { insert: '1', update: '2' },
    );
  });

  it('lov() rejects an earlier literal default outside the union', () => {
    asserts.assertThrows(
      () => Column.varchar(16).default('x').lov(['a', 'b']),
      Error,
      'insert default "x" is not',
    );
    asserts.assertThrows(
      () => Column.varchar(16).defaultOnUpdate('zzz').lov(['on', 'off']),
      Error,
      'update default',
    );
    asserts.assertThrows(
      () => Column.bigint().default(9n).lov([1n, 2n]),
      Error,
      'in [1, 2]',
    );
    // Function/expression defaults cannot be checked — they pass.
    const ok = Column.varchar(16).default({ $$_expression: 'X' }).lov(['a']);
    asserts.assertEquals(ok.spec.lov, ['a']);
  });

  it('fk on-mapping guards: empty and undefined-valued entries rejected', () => {
    asserts.assertThrows(
      () =>
        Entity('p', { id: Column.integer() }, {
          pk: ['id'],
          fk: { Author: { model: 'users', on: {} } },
        }),
      Error,
      'at least one column pair',
    );
    asserts.assertThrows(
      () =>
        Entity('p', { id: Column.integer() }, {
          pk: ['id'],
          fk: { Author: { model: 'users', on: { id: undefined } } },
        }),
      Error,
      'no target column given',
    );
  });

  it('pk cannot be a norm-owned synthesized sibling', () => {
    asserts.assertThrows(
      () =>
        Entity('bad', {
          id: Column.integer(),
          sec: Column.varchar(64).encrypt().hash(),
        }, { pk: ['sec_hash' as never] }),
      Error,
      'norm-owned',
    );
  });

  it('HashedColumnBuilder enforces its own brand at construction', () => {
    // The class IS the brand: a directly-constructed instance can
    // never carry hash-less runtime data under a hash-branded type.
    const direct = new HashedColumnBuilder({ type: 'VARCHAR', length: 64 });
    asserts.assertEquals(direct.spec.hash, true);
  });

  it('definitions are frozen and never alias caller inputs', () => {
    asserts.assertThrows(() => {
      (Users.columns as Record<string, { type: string }>).id.type = 'X';
    }, TypeError);
    asserts.assertThrows(() => {
      (Users.primaryKeys as unknown as string[]).push('email');
    }, TypeError);

    // Caller-held on/index objects are copied at emission.
    const onMap: Partial<Record<'id' | 'pid', string>> = { pid: 'id' };
    const cols: ('id' | 'pid')[] = ['pid'];
    const Iso = Entity('iso', {
      id: Column.integer(),
      pid: Column.integer(),
    }, {
      pk: ['id'],
      fk: { P: { model: 'Posts', on: onMap } },
      index: { byP: cols },
    });
    onMap.pid = 'ghost';
    cols.push('id');
    asserts.assertEquals(Iso.foreignKeys?.P.on, { pid: 'id' });
    asserts.assertEquals(Iso.indexes?.byP, ['pid']);
  });

  // ── Entity(TABLE) ─────────────────────────────────────────────────

  it('carries the pk tuple (composite supported)', () => {
    asserts.assertEquals(Memberships.primaryKeys, ['orgId', 'userId']);
    asserts.assertEquals(Users.primaryKeys, ['id']);
  });

  it('rejects unknown, nullable, and empty pk declarations', () => {
    asserts.assertThrows(
      () =>
        Entity('bad', { a: Column.integer() }, {
          pk: ['ghost' as unknown as 'a'],
        }),
      Error,
      "column 'ghost' does not exist",
    );
    asserts.assertThrows(
      () => Entity('bad', { a: Column.integer().nullable() }, { pk: ['a'] }),
      Error,
      'is nullable',
    );
    asserts.assertThrows(
      () =>
        Entity('nopk', { a: Column.integer() }, {
          pk: [] as unknown as ['a'],
        }),
      Error,
      'at least one column',
    );
    asserts.assertThrows(
      () => Entity('empty', {}, { pk: ['x' as never] }),
      Error,
      'at least one column',
    );
  });

  it('synthesizes the hash sibling (norm-owned VARCHAR(64))', () => {
    const sibling = (Users.columns as Record<string, unknown>)
      .email_hash as Record<string, unknown>;
    asserts.assertEquals(sibling.type, 'VARCHAR');
    asserts.assertEquals(sibling.length, 64);
    asserts.assertEquals(sibling.disableInsert, true);
    asserts.assertEquals(sibling.disableUpdate, true);
  });

  it('rejects a column colliding with a synthesized sibling', () => {
    asserts.assertThrows(
      () =>
        Entity('bad', {
          id: Column.integer(),
          ssn: Column.varchar(512).encrypt().hash(),
          ssn_hash: Column.varchar(64),
        }, { pk: ['id'] }),
      Error,
      'collides with the hash sibling',
    );
  });

  it('validates fk local columns and index columns', () => {
    asserts.assertThrows(
      () =>
        Entity('p', { id: Column.integer() }, {
          pk: ['id'],
          // Unknown LOCAL columns are already compile errors — cast
          // past them to prove the runtime guard too.
          fk: { Author: { model: 'Users', on: { nope: 'id' } as never } },
        }),
      Error,
      "local column 'nope'",
    );
    asserts.assertThrows(
      () =>
        Entity('p', { id: Column.integer() }, {
          pk: ['id'],
          index: { bad: ['ghost' as unknown as 'id'] },
        }),
      Error,
      "column 'ghost'",
    );
    asserts.assertEquals(Posts.foreignKeys?.Author.on, { userId: 'id' });
  });

  it('FK targets are entity KEYS — emitted verbatim, serializable', () => {
    asserts.assertEquals(Posts.foreignKeys?.Author.model, 'Users');
    type _literal = Expect<
      Equal<
        NonNullable<typeof Posts['foreignKeys']>['Author']['model'],
        'Users'
      >
    >;

    // The JSON export does NOT embed the target entity — the key is
    // resolved against the registry at use() time (target existence,
    // kind, and target columns are checked there).
    const json = JSON.stringify(Posts);
    asserts.assertEquals(json.includes('email_hash'), false);
    asserts.assertEquals(
      JSON.parse(json).foreignKeys.Author,
      { model: 'Users', on: { userId: 'id' } },
    );
  });

  it('insert/update pick-lists scope the payload types and flags', () => {
    // The clearremit pattern: CreateRequest = pick(...), UpdateRequest
    // = pick(...).partial() — declared ON the definition.
    const Bank = Entity('bank_master', {
      country: Column.varchar(2),
      bank: Column.varchar(100),
      routing: Column.varchar(30),
    }, {
      pk: ['country', 'bank'],
      insert: ['country', 'bank', 'routing'],
      update: ['routing'], // PKs not updatable
    });

    // Runtime: unlisted columns become norm-owned for that operation.
    asserts.assertEquals(Bank.columns.country.disableUpdate, true);
    asserts.assertEquals(Bank.columns.routing.disableUpdate, undefined);
    asserts.assertEquals(Bank.columns.routing.disableInsert, undefined);

    // Types: InsertOf keeps the pick-list; UpdateOf shrinks to it.
    type Ins = InsertOf<typeof Bank>;
    type _ins = Expect<
      Equal<Ins, { country: string; bank: string; routing: string }>
    >;
    type Upd = UpdateOf<typeof Bank>;
    type _upd = Expect<Equal<Upd, { routing?: string }>>;

    // Unknown columns in a scope list are rejected.
    asserts.assertThrows(
      () =>
        Entity('bad', { id: Column.integer() }, {
          pk: ['id'],
          update: ['ghost' as never],
        }),
      Error,
      "column 'ghost' does not exist",
    );
  });

  it('captures the entity NAME as a literal type', () => {
    type _n = Expect<Equal<typeof Users['name'], 'users'>>;
    asserts.assertEquals(Users.name, 'users');
  });

  it('carries entity comments (docs + DDL)', () => {
    const Commented = Entity('c', { id: Column.integer().comment('the id') }, {
      pk: ['id'],
      comment: 'a commented table',
    });
    asserts.assertEquals(Commented.comment, 'a commented table');
    asserts.assertEquals(Commented.columns.id.comment, 'the id');
  });

  // ── Row-level hooks ───────────────────────────────────────────────

  it('row hooks: typed payloads, carried on the definition, JSON-dropped', () => {
    const Audited = Entity('audited', {
      id: Column.integer(),
      email: Column.varchar(255).encrypt().hash(),
      note: Column.text().nullable(),
    }, {
      pk: ['id'],
      hooks: {
        beforeInsert: (row) => ({ ...row, note: row.note ?? 'via-hook' }),
        beforeUpdate: (row) => row,
        afterRead: (row) => row,
      },
    });

    // Pre-write hooks see the WRITE payload shapes (sibling excluded);
    // post-read sees the full row (sibling included).
    type BI = Parameters<
      NonNullable<NonNullable<typeof Audited['hooks']>['beforeInsert']>
    >[0];
    type _bi = Expect<
      Equal<BI, { id: number; email: string; note?: string | null }>
    >;
    type BU = Parameters<
      NonNullable<NonNullable<typeof Audited['hooks']>['beforeUpdate']>
    >[0];
    type _bu = Expect<
      Equal<BU, { id?: number; email?: string; note?: string | null }>
    >;
    type AR = Parameters<
      NonNullable<NonNullable<typeof Audited['hooks']>['afterRead']>
    >[0];
    type _ar = Expect<
      Equal<AR, {
        id: number;
        email: string;
        email_hash: string;
        note: string | null;
      }>
    >;

    // Carried at runtime…
    const hooked = Audited.hooks?.beforeInsert?.({ id: 1, email: 'a@b.c' });
    asserts.assertEquals(hooked, { id: 1, email: 'a@b.c', note: 'via-hook' });
    // …but dropped from the JSON export (runtime-only callbacks).
    asserts.assertEquals(JSON.parse(JSON.stringify(Audited)).hooks, {});
  });

  it('read-only kinds accept afterRead but reject write hooks', () => {
    const WithRead = Entity('v_read', { id: Column.uuid() }, {
      type: 'VIEW',
      query: {
        type: 'SELECT',
        table: 'users',
        columns: ['id'],
        projection: { '@id': true },
      },
      hooks: { afterRead: (row) => row },
    });
    asserts.assertEquals(typeof WithRead.hooks?.afterRead, 'function');

    asserts.assertThrows(
      () =>
        Entity('v_bad', { id: Column.uuid() }, {
          type: 'VIEW',
          query: {
            type: 'SELECT',
            table: 'users',
            columns: ['id'],
            projection: { '@id': true },
          },
          hooks: { beforeInsert: (row: never) => row } as never,
        }),
      Error,
      'write-side hooks',
    );
  });

  // ── Entity(VIEW) + Entity(QUERY) ──────────────────────────────────

  it('builds VIEW and QUERY kinds over stored SELECTs', () => {
    asserts.assertEquals(ActiveUsers.type, 'VIEW');
    asserts.assertEquals(ActiveUsers.query.table, 'users');
    asserts.assertEquals(RoleCounts.type, 'QUERY');
    asserts.assertEquals(Object.keys(RoleCounts.columns), ['role', 'total']);
  });

  it('rejects write-side declarations and non-SELECT queries on read-only kinds', () => {
    const select: EntityViewOptions['query'] = {
      type: 'SELECT',
      table: 't',
      columns: ['id'],
      projection: { '@id': true },
    };
    asserts.assertThrows(
      () =>
        Entity('v', { id: Column.uuid().default('x') }, {
          type: 'VIEW',
          query: select,
        }),
      Error,
      'write-side declarations',
    );
    asserts.assertThrows(
      () =>
        Entity('q', { id: Column.uuid().default('x') }, {
          type: 'QUERY',
          query: select,
        }),
      Error,
      'write-side declarations',
    );
    asserts.assertThrows(
      () =>
        Entity('v', { id: Column.uuid() }, {
          type: 'VIEW',
          query: { type: 'COUNT' } as unknown as typeof select,
        }),
      Error,
      'must be a SELECT',
    );
  });

  // ── The payoff: type inference off builder phantoms ───────────────

  it('type pins: RowOf / InsertOf / UpdateOf / PrimaryKeyOf', () => {
    type Row = RowOf<typeof Users>;
    type _rowExact = Expect<
      Equal<Row, {
        id: string;
        email: string;
        email_hash: string;
        age: number | null;
        role: string;
        passwordHash: string;
        meta: { tags: string[] } | null;
      }>
    >;

    type Ins = InsertOf<typeof Users>;
    type _insertShape = Expect<
      Equal<Ins, {
        // required: no default, not nullable
        email: string;
        passwordHash: string;
        // optional: defaulted or nullable — hash sibling EXCLUDED
        id?: string;
        age?: number | null;
        role?: string;
        meta?: { tags: string[] } | null;
      }>
    >;

    type Upd = UpdateOf<typeof Users>;
    type _updateExcludesSibling = Expect<
      Equal<'email_hash' extends keyof Upd ? true : false, false>
    >;

    type Pk = PrimaryKeyOf<typeof Users>;
    type _pk = Expect<Equal<Pk, { id: string }>>;
    type CompositePk = PrimaryKeyOf<typeof Memberships>;
    type _compositePk = Expect<
      Equal<CompositePk, { orgId: string; userId: string }>
    >;

    // QUERY results have row types too.
    type CountRow = RowOf<typeof RoleCounts>;
    type _countRow = Expect<Equal<CountRow, { role: string; total: number }>>;

    // Runtime anchor so the test body isn't empty at runtime.
    asserts.assertEquals(Users.primaryKeys.length, 1);
  });
});
