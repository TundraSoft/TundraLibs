/**
 * Coverage for {@link AbstractTranslator}'s guard / refusal branches — the
 * paths that throw instead of emitting SQL.
 *
 * Some are reachable straight off the public API (MariaDB has no FULL
 * JOIN). The rest are gated by `_support` flags or by the parameter style,
 * both of which every shipped dialect currently sets to the permissive
 * value — so they're exercised through thin subclasses that flip one flag.
 * That is the point: the flags are load-bearing, not decoration, and a
 * future dialect that turns one off gets the documented error rather than
 * invalid SQL.
 *
 * Literal formatting lives here too ({@link AbstractTranslator._formatLiteral}
 * is `protected` and only reachable via the view / index DDL inlining path).
 *
 * @module translator/DialectGuards.test
 */

import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { SQLiteTranslator } from './SQLiteTranslator.ts';
import { PostgresTranslator } from './PostgresTranslator.ts';
import { MariaTranslator } from './MariaTranslator.ts';
import {
  type MongoAggregateAction,
  MongoTranslator,
} from './MongoTranslator.ts';
import { DialectUnsupportedError, OqlError } from '../errors/mod.ts';
import type { Query } from '../types/mod.ts';
import type {
  DialectSupport,
  FilterOperatorMap,
  ParameterStyle,
} from './types/mod.ts';

/** Exposes the protected literal formatter for direct assertion. */
class LiteralProbe extends SQLiteTranslator {
  public literal(value: unknown): string {
    return this._formatLiteral(value);
  }
}
class PgLiteralProbe extends PostgresTranslator {
  public literal(value: unknown): string {
    return this._formatLiteral(value);
  }
}
class MariaLiteralProbe extends MariaTranslator {
  public literal(value: unknown): string {
    return this._formatLiteral(value);
  }
  public unit(value: unknown): string {
    return this._timeUnitArg(value);
  }
}

/** A dialect with every optional feature switched off. */
class MinimalTranslator extends SQLiteTranslator {
  protected override readonly _support: DialectSupport = {
    schema: false,
    materializedView: false,
    truncate: false,
    rightJoin: false,
    fullJoin: false,
    returning: { insert: false, upsert: false },
  };
}

/** A dialect whose driver binds positionally (`?`), so params can't inline. */
class PositionalTranslator extends SQLiteTranslator {
  protected override readonly _parameterStyle: ParameterStyle = {
    format: 'positional',
    prefix: '?',
    suffix: '',
  };
}

/** A dialect that declares no filter operators at all. */
class NoOperatorTranslator extends SQLiteTranslator {
  protected override readonly _filterOperatorMap: FilterOperatorMap = new Map();
}

const JOIN_QUERY = (type: 'RIGHT' | 'FULL'): Query<'SELECT'> =>
  ({
    type: 'SELECT',
    table: 'orders',
    columns: ['id', 'userId'],
    joins: {
      U: {
        table: 'users',
        columns: ['id', 'name'],
        type,
        on: { '@U.@id': '@userId' },
      },
    },
    projection: { '@id': true, '@U.@name': 'userName' },
  }) as unknown as Query<'SELECT'>;

const VIEW_QUERY = {
  type: 'CREATE_VIEW',
  view: 'active_users',
  query: {
    type: 'SELECT',
    table: 'users',
    columns: ['id', 'status'],
    projection: { '@id': true },
    where: { '@status': 'active' },
  },
} as unknown as Query<'CREATE_VIEW'>;

describe('oql.translator.guards', () => {
  describe('DATE_TRUNC unit', () => {
    // `expressions` are validated by the asserts layer; a filter operand is
    // not, so the translator's own check is what stops a unit reaching SQL.
    const withUnit = (unit: string) =>
      ({
        type: 'SELECT',
        table: 'orders',
        columns: ['id', 'at'],
        projection: { '@id': true },
        where: {
          '@at': {
            $gte: {
              $$_expression: 'DATE_TRUNC',
              args: { date: '@at', unit },
            },
          },
        },
      }) as unknown as Query<'SELECT'>;

    it('refuses a unit outside DAYS / MONTHS / YEARS on every SQL dialect', () => {
      for (const unit of ['HOURS', "day', now()); DROP TABLE orders; --"]) {
        for (
          const t of [
            new SQLiteTranslator(),
            new PostgresTranslator(),
            new MariaTranslator(),
          ]
        ) {
          const err = asserts.assertThrows(
            () => t.select(withUnit(unit)),
            OqlError,
          );
          asserts.assertEquals((err as OqlError).code, 'INVALID_TIME_UNIT');
        }
      }
    });

    it('emits the operand when the unit is valid', () => {
      // Control: same query shape — proves the unit is what is rejected.
      const { sql } = new PostgresTranslator().select(withUnit('MONTHS'));
      asserts.assertStringIncludes(
        sql,
        `WHERE "at" >= date_trunc('month', "at")`,
      );
    });
  });

  describe('join support flags', () => {
    it('maria refuses FULL JOIN (no such syntax in MySQL/MariaDB)', () => {
      const err = asserts.assertThrows(
        () => new MariaTranslator().select(JOIN_QUERY('FULL')),
        DialectUnsupportedError,
      );
      asserts.assertStringIncludes(err.message, 'FULL JOIN');
      asserts.assertEquals((err as OqlError).code, 'DIALECT_UNSUPPORTED');
    });

    it('refuses RIGHT JOIN when the dialect flag is off', () => {
      const err = asserts.assertThrows(
        () => new MinimalTranslator().select(JOIN_QUERY('RIGHT')),
        DialectUnsupportedError,
      );
      asserts.assertStringIncludes(err.message, 'RIGHT JOIN');
    });

    it('emits the join when the flag is on', () => {
      // Control: same query, stock dialect — proves the guard is what
      // rejects it above, not the query shape.
      const { sql } = new MariaTranslator().select(JOIN_QUERY('RIGHT'));
      asserts.assertStringIncludes(sql, 'RIGHT JOIN `users`');
    });
  });

  describe('statement support flags', () => {
    it('refuses TRUNCATE when the dialect flag is off', () => {
      const err = asserts.assertThrows(
        () =>
          new MinimalTranslator().truncate(
            { type: 'TRUNCATE', table: 'users' } as Query<'TRUNCATE'>,
          ),
        DialectUnsupportedError,
      );
      asserts.assertStringIncludes(err.message, 'TRUNCATE');
    });

    it('refuses CREATE_SCHEMA when the dialect flag is off', () => {
      asserts.assertThrows(
        () =>
          new MinimalTranslator().createSchema(
            { type: 'CREATE_SCHEMA', schema: 'analytics' } as Query<
              'CREATE_SCHEMA'
            >,
          ),
        DialectUnsupportedError,
        'CREATE_SCHEMA',
      );
    });

    it('refuses DROP_SCHEMA when the dialect flag is off', () => {
      asserts.assertThrows(
        () =>
          new MinimalTranslator().dropSchema(
            { type: 'DROP_SCHEMA', schema: 'analytics' } as Query<
              'DROP_SCHEMA'
            >,
          ),
        DialectUnsupportedError,
        'DROP_SCHEMA',
      );
    });
  });

  describe('filter operator map', () => {
    it('refuses an operator the dialect declares no emitter for', () => {
      const err = asserts.assertThrows(
        () =>
          new NoOperatorTranslator().select(
            {
              type: 'SELECT',
              table: 'users',
              columns: ['id', 'age'],
              projection: { '@id': true },
              where: { '@age': { $gte: 18 } },
            } as unknown as Query<'SELECT'>,
          ),
        DialectUnsupportedError,
      );
      asserts.assertStringIncludes(err.message, "filter operator '$gte'");
    });

    it('says which column a refused value belongs to, and why', () => {
      for (const op of ['$in', '$nin']) {
        for (
          const t of [
            new SQLiteTranslator(),
            new PostgresTranslator(),
            new MariaTranslator(),
            new MongoTranslator(),
          ]
        ) {
          asserts.assertThrows(
            () =>
              t.select(
                {
                  type: 'SELECT',
                  table: 'users',
                  columns: ['id', 'status'],
                  projection: { '@id': true },
                  where: { '@status': { [op]: ['a', null] } },
                } as unknown as Query<'SELECT'>,
              ),
            TypeError,
            `Value for '@status' must be valid Operators - Invalid Operators: '${op}' array element at index 1 cannot be null — use '$null: true'`,
          );
        }
      }
    });
  });

  describe('DATE_ADD / DATE_DIFF unit', () => {
    // Same gap as DATE_TRUNC above: a filter operand is not asserted.
    // Postgres and SQLite bind the unit, so without the translator's check
    // an unknown one reaches the database as data.
    const operands = (unit: string) => [
      { $$_expression: 'DATE_ADD', args: { date: '@at', amount: 1, unit } },
      { $$_expression: 'DATE_DIFF', args: { from: '@at', to: '@at', unit } },
    ];
    const withOperand = (operand: unknown) =>
      ({
        type: 'SELECT',
        table: 'orders',
        columns: ['id', 'at'],
        projection: { '@id': true },
        where: { '@at': { $gte: operand } },
      }) as unknown as Query<'SELECT'>;

    it('refuses an unknown unit with the same error on every engine', () => {
      for (const unit of ['WEEKS', 'days']) {
        for (const operand of operands(unit)) {
          const messages = [
            new SQLiteTranslator(),
            new PostgresTranslator(),
            new MariaTranslator(),
            new MongoTranslator(),
          ].map((t) => {
            const err = asserts.assertThrows(
              () => t.select(withOperand(operand)),
              OqlError,
            );
            asserts.assertEquals((err as OqlError).code, 'INVALID_TIME_UNIT');
            return (err as OqlError).message;
          });
          asserts.assertEquals(new Set(messages).size, 1);
        }
      }
    });

    it('refuses it under expressions with the same code', () => {
      // There the validator refuses it, before a dialect is involved.
      for (const expression of operands('WEEKS')) {
        for (
          const t of [
            new SQLiteTranslator(),
            new PostgresTranslator(),
            new MariaTranslator(),
            new MongoTranslator(),
          ]
        ) {
          const err = asserts.assertThrows(
            () =>
              t.select(
                {
                  type: 'SELECT',
                  table: 'orders',
                  columns: ['id', 'at'],
                  expressions: { e: expression },
                  projection: { '@id': true, '@e': true },
                } as unknown as Query<'SELECT'>,
              ),
            OqlError,
          );
          asserts.assertEquals(err.code, 'INVALID_TIME_UNIT');
        }
      }
    });

    it('binds the unit when it is valid', () => {
      // Control: same query shape — proves the unit is what is rejected.
      for (const operand of operands('DAYS')) {
        for (const t of [new SQLiteTranslator(), new PostgresTranslator()]) {
          const { params } = t.select(withOperand(operand));
          asserts.assert(Object.values(params ?? {}).includes('DAYS'));
        }
      }
    });
  });

  describe('UNIX_TIMESTAMP unit', () => {
    // Same gap again: `unit` picks the emitted form at translation time, so
    // an unchecked one silently became seconds. The asserts never see these
    // positions, so the translators must check it.
    const stamp = (unit?: unknown) => ({
      $$_expression: 'UNIX_TIMESTAMP',
      unit,
    });
    const positions: Record<string, (operand: unknown) => Query<'SELECT'>> = {
      'a filter operand': (operand) =>
        ({
          type: 'SELECT',
          table: 'orders',
          columns: ['id', 'at'],
          projection: { '@id': true },
          where: { '@at': { $gte: operand } },
        }) as unknown as Query<'SELECT'>,
      'a nested argument': (operand) =>
        ({
          type: 'SELECT',
          table: 'orders',
          columns: ['id', 'at'],
          projection: { '@id': true },
          where: {
            '@at': { $gte: { $$_expression: 'ADD', args: ['@id', operand] } },
          },
        }) as unknown as Query<'SELECT'>,
      'a CASE condition': (operand) =>
        ({
          type: 'SELECT',
          table: 'orders',
          columns: ['id', 'at'],
          expressions: {
            e: {
              $$_expression: 'CASE',
              args: {
                cases: [{ when: { '@at': { $gte: operand } }, then: 1 }],
                else: 0,
              },
            },
          },
          projection: { '@id': true, '@e': true },
        }) as unknown as Query<'SELECT'>,
    };
    const translators = () => [
      new SQLiteTranslator(),
      new PostgresTranslator(),
      new MariaTranslator(),
      new MongoTranslator(),
    ];

    for (const [position, query] of Object.entries(positions)) {
      it(`refuses an unknown unit with the same error on every engine: ${position}`, () => {
        for (const unit of ['minutes', 'SECONDS', null]) {
          const messages = translators().map((t) => {
            const err = asserts.assertThrows(
              () => t.select(query(stamp(unit))),
              OqlError,
            );
            asserts.assertEquals(err.code, 'INVALID_TIME_UNIT');
            return err.message;
          });
          asserts.assertEquals(new Set(messages).size, 1);
        }
      });
    }

    it('reads a missing unit as seconds on every engine', () => {
      // Control: same shapes, so the unit is what the test above rejects.
      for (const query of Object.values(positions)) {
        for (const t of translators()) {
          const out = (unit?: string) =>
            JSON.stringify(t.select(query(stamp(unit))));
          asserts.assertEquals(out(), out('seconds'));
          asserts.assertNotEquals(out(), out('milliseconds'));
        }
      }
    });
  });

  describe('param inlining', () => {
    it('refuses to inline a non-named placeholder format', () => {
      const err = asserts.assertThrows(
        () => new PositionalTranslator().createView(VIEW_QUERY),
        OqlError,
      );
      asserts.assertEquals(
        (err as OqlError).code,
        'PARAM_INLINE_UNSUPPORTED',
      );
    });

    it('inlines named placeholders into the stored view body', () => {
      // Control for the case above — and the reason inlining exists at
      // all: a stored view body cannot carry placeholders.
      const { sql, params } = new SQLiteTranslator().createView(VIEW_QUERY);
      asserts.assertStringIncludes(sql, `"status" = 'active'`);
      asserts.assertEquals(params, {});
    });
  });

  describe('MariaDB time unit', () => {
    // The unit is written into the SQL, so validation is the only thing
    // between a hand-built query and the statement text. `constructor`
    // is the inherited-key case a plain property lookup would let through.
    it('refuses anything that is not an OQL time unit', () => {
      const maria = new MariaLiteralProbe();
      asserts.assertEquals(maria.unit('MONTHS'), 'MONTH');
      for (
        const unit of ['WEEKS', 'constructor', 'DAY); DROP TABLE t; --', 7]
      ) {
        const err = asserts.assertThrows(() => maria.unit(unit), OqlError);
        asserts.assertEquals(err.code, 'INVALID_TIME_UNIT');
      }
    });
  });

  describe('_formatLiteral', () => {
    const sqlite = new LiteralProbe();
    const postgres = new PgLiteralProbe();
    const maria = new MariaLiteralProbe();

    it('renders scalars', () => {
      asserts.assertEquals(sqlite.literal(null), 'NULL');
      asserts.assertEquals(sqlite.literal(undefined), 'NULL');
      asserts.assertEquals(sqlite.literal(42), '42');
      asserts.assertEquals(sqlite.literal(10n), '10');
      asserts.assertEquals(sqlite.literal(true), 'TRUE');
      asserts.assertEquals(sqlite.literal(false), 'FALSE');
      asserts.assertEquals(
        sqlite.literal(new Date(0)),
        `'1970-01-01T00:00:00.000Z'`,
      );
    });

    it('doubles embedded single quotes in strings', () => {
      asserts.assertEquals(sqlite.literal("O'Brien"), `'O''Brien'`);
    });

    it('refuses to inline a non-finite number', () => {
      for (const bad of [Infinity, -Infinity, NaN]) {
        const err = asserts.assertThrows(
          () => sqlite.literal(bad),
          OqlError,
        );
        asserts.assertEquals((err as OqlError).code, 'NON_FINITE_LITERAL');
      }
    });

    it('renders bytes as a blob literal on sqlite / maria', () => {
      const bytes = new Uint8Array([0x0a, 0x1b, 0xff]);
      // `X'…'` is a blob literal on both.
      asserts.assertEquals(sqlite.literal(bytes), `X'0a1bff'`);
      asserts.assertEquals(maria.literal(bytes), `X'0a1bff'`);
    });

    it('renders bytes as a bytea literal on postgres', () => {
      // Postgres' `X'…'` is a BIT STRING, not bytes — feeding one to a
      // bytea column is a type error. Hex-format bytea input is the
      // correct literal, and the leading `\x` stays a literal backslash
      // because standard_conforming_strings is on by default.
      const bytes = new Uint8Array([0x0a, 0x1b, 0xff]);
      asserts.assertEquals(
        postgres.literal(bytes),
        String.raw`'\x0a1bff'::bytea`,
      );
      asserts.assertEquals(
        postgres.literal(new Uint8Array([])),
        `'\\x'::bytea`,
      );
    });

    it('escapes backslashes on maria only (string-escape semantics)', () => {
      asserts.assertEquals(maria.literal('a\\b'), `'a\\\\b'`);
      asserts.assertEquals(sqlite.literal('a\\b'), `'a\\b'`);
      asserts.assertEquals(postgres.literal('a\\b'), `'a\\b'`);
    });
  });

  describe('index predicate', () => {
    const index = (operand: unknown) =>
      ({
        type: 'CREATE_INDEX',
        index: 'idx_due',
        table: 'orders',
        columns: ['@id'],
        where: { '@due': { $gte: operand } },
      }) as Query<'CREATE_INDEX'>;
    const dateAdd = {
      $$_expression: 'DATE_ADD',
      args: { date: new Date('2026-03-15T00:00:00Z'), amount: 1, unit: 'DAYS' },
    };
    const add = { $$_expression: 'ADD', args: ['@due', 1] };

    it('refuses DATE_ADD where the engine cannot hold it, with one error', () => {
      // Postgres builds the interval from text, which is not IMMUTABLE; a
      // MongoDB partial filter takes no $expr. SQLite can hold it.
      const features = [new PostgresTranslator(), new MongoTranslator()].map(
        (t) => {
          const err = asserts.assertThrows(
            () => t.createIndex(index(dateAdd)),
            DialectUnsupportedError,
          );
          return err.feature;
        },
      );
      asserts.assertEquals(features, [
        'the computed expression DATE_ADD in an index predicate',
        'the computed expression DATE_ADD in an index predicate',
      ]);
      asserts.assertStringIncludes(
        new SQLiteTranslator().createIndex(index(dateAdd)).sql,
        'WHERE "due" >= strftime(',
      );
    });

    it('refuses an $exists or $nexists on every dialect with one error', () => {
      // No engine takes a subquery in an index predicate: Postgres and
      // SQLite fail in the database, MariaDB has no partial index.
      const translators = [
        new PostgresTranslator(),
        new MariaTranslator(),
        new SQLiteTranslator(),
        new MongoTranslator(),
      ];
      for (const node of ['$exists', '$nexists']) {
        const where = {
          $or: [{ '@due': null }, {
            [node]: { table: 'items', on: { '@orderId': 1 } },
          }],
        };
        for (const t of translators) {
          const err = asserts.assertThrows(
            () =>
              t.createIndex({ ...index(1), where } as Query<'CREATE_INDEX'>),
            OqlError,
            `'where' holds '${node}'`,
          );
          asserts.assertEquals(err.code, 'EXISTS_NO_OUTER_TABLE');
        }
      }
    });

    it('refuses any expression on MongoDB only', () => {
      asserts.assertThrows(
        () => new MongoTranslator().createIndex(index(add)),
        DialectUnsupportedError,
        'the computed expression ADD in an index predicate',
      );
      asserts.assertEquals(
        new PostgresTranslator().createIndex(index(add)).sql,
        'CREATE INDEX "idx_due" ON "orders" ("id") WHERE "due" >= ("due" + 1)',
      );
    });

    it('refuses a clock or UUID expression on every engine, with one error', () => {
      const translators = [
        new PostgresTranslator(),
        new SQLiteTranslator(),
        new MariaTranslator(),
        new MongoTranslator(),
      ];
      for (
        const type of [
          'NOW',
          'CURRENT_DATE',
          'CURRENT_TIME',
          'CURRENT_TIMESTAMP',
          'CURRENT_TIMESTAMPTZ',
          'UNIX_TIMESTAMP',
          'UUID',
        ]
      ) {
        // Nested too, so the search has to walk expression arguments;
        // MongoDB names the outer COALESCE there, as it refuses any.
        const nested = {
          $$_expression: 'COALESCE',
          args: ['@due', { $$_expression: type }],
        };
        for (const t of translators) {
          for (const operand of [{ $$_expression: type }, nested]) {
            const err = asserts.assertThrows(
              () => t.createIndex(index(operand)),
              DialectUnsupportedError,
            );
            const named = t instanceof MongoTranslator && operand === nested
              ? 'COALESCE'
              : type;
            asserts.assertEquals(
              err.feature,
              `the computed expression ${named} in an index predicate`,
            );
          }
        }
      }
    });

    it('reads a bare @name expression argument as a column', () => {
      const where = {
        '@due': { $gte: { $$_expression: 'ADD', args: ['@start', 1] } },
        '@n': { $gt: '@start' },
        '@m': { $gt: '@id' },
        '@s': { $endsWith: '@example.com' },
      };
      const q = {
        type: 'CREATE_INDEX',
        index: 'idx_due',
        table: 'orders',
        columns: ['@id'],
        where,
      } as Query<'CREATE_INDEX'>;
      asserts.assertEquals(
        new PostgresTranslator().createIndex(q).sql,
        'CREATE INDEX "idx_due" ON "orders" ("id") WHERE "due" >= ("start" + 1)' +
          ` AND "n" > "start" AND "m" > "id"` +
          ` AND "s" LIKE ('%' || '@example.com') ESCAPE '\\'`,
      );
      asserts.assertStringIncludes(
        new SQLiteTranslator().createIndex(q).sql,
        'WHERE "due" >= ("start" + 1) AND "n" > "start" AND "m" > "id"',
      );
    });

    it('reads a bare @name inside CASE as a column', () => {
      const q = {
        type: 'CREATE_INDEX',
        index: 'idx_due',
        table: 'orders',
        columns: ['@id'],
        where: {
          '@due': {
            $gt: {
              $$_expression: 'CASE',
              args: {
                cases: [{ when: { '@kind': 'a' }, then: '@start' }],
                else: '@stop',
              },
            },
          },
        },
      } as Query<'CREATE_INDEX'>;
      asserts.assertEquals(
        new SQLiteTranslator().createIndex(q).sql,
        'CREATE INDEX "idx_due" ON "orders" ("id") WHERE "due" > ' +
          `(CASE WHEN "kind" = 'a' THEN "start" ELSE "stop" END)`,
      );
    });
  });

  describe('joined column spelling', () => {
    const withJoin = (extra: Record<string, unknown>) =>
      ({
        type: 'SELECT',
        table: 'users',
        columns: ['id', 'name', 'meta'],
        joins: {
          P: {
            type: 'LEFT',
            table: 'profiles',
            columns: ['userId', 'label'],
            on: { '@P.@userId': '@id' },
          },
        },
        projection: { '@id': true },
        ...extra,
      }) as unknown as Query<'SELECT'>;
    const misspelled = [
      withJoin({ where: { '@P.label': 'x' } }),
      withJoin({ where: { '@name': '@P.label' } }),
      withJoin({
        expressions: {
          c: { $$_expression: 'COALESCE', args: ['@P.label', 'none'] },
        },
        projection: { '@id': true, '@c': 'c' },
      }),
    ];
    const refuses = (t: { select(q: Query<'SELECT'>): unknown }) => {
      for (const q of misspelled) {
        const err = asserts.assertThrows(() => t.select(q), OqlError);
        asserts.assertEquals(err.code, 'INVALID_COLUMN_REF');
      }
    };

    it('refuses @Alias.col on every SQL dialect; @meta.a stays text', () => {
      for (
        const t of [
          new SQLiteTranslator(),
          new PostgresTranslator(),
          new MariaTranslator(),
        ]
      ) {
        refuses(t);
        const { params } = t.select(
          withJoin({ where: { '@name': '@meta.a' } }),
        );
        asserts.assertEquals(Object.values(params ?? {}), ['@meta.a']);
      }
    });

    it('refuses @Alias.col on MongoDB; @meta.a reads the field', () => {
      const t = new MongoTranslator();
      refuses(t);
      const { params } = t.select(
        withJoin({
          expressions: {
            c: { $$_expression: 'COALESCE', args: ['@meta.a', 'none'] },
          },
          projection: { '@id': true, '@c': 'c' },
        }),
      ) as MongoAggregateAction;
      asserts.assertEquals(
        params.pipeline.find((stage) => '$addFields' in stage),
        { $addFields: { c: { $ifNull: ['$meta.a', 'none'] } } },
      );
    });
  });

  describe('nested $exists', () => {
    // users → orders → items → marks: each node correlates to its parent.
    const marks = { table: 'marks', on: { '@itemId': '@id' } };
    const items = {
      table: 'items',
      on: { '@orderId': '@id' },
      where: { $or: [{ '@sku': 'A' }, { $nexists: marks }] },
    };
    const select = {
      type: 'SELECT',
      table: 'users',
      columns: ['id'],
      projection: { '@id': true },
      where: {
        $exists: {
          table: 'orders',
          on: { '@userId': '@id' },
          where: { $exists: items },
        },
      },
    } as unknown as Query<'SELECT'>;

    it('correlates to its parent subquery at every level on SQL', () => {
      asserts.assertEquals(
        new SQLiteTranslator().select(select).sql,
        'SELECT "id" AS "id" FROM "users" WHERE EXISTS (SELECT 1 FROM "orders" AS "__exists__" ' +
          'WHERE "__exists__"."userId" = "users"."id" AND EXISTS (SELECT 1 FROM "items" AS "__exists_1__" ' +
          'WHERE "__exists_1__"."orderId" = "__exists__"."id" AND (("__exists_1__"."sku" = :p_0:) OR ' +
          '(NOT EXISTS (SELECT 1 FROM "marks" AS "__exists_2__" ' +
          'WHERE "__exists_2__"."itemId" = "__exists_1__"."id")))))',
      );
    });

    it('refuses a parent correlation on MongoDB', () => {
      const err = asserts.assertThrows(
        () => new MongoTranslator().select(select),
        DialectUnsupportedError,
      );
      asserts.assertEquals(
        err.feature,
        "a nested '$exists' correlated to its parent subquery by '@id'",
      );
    });
  });
});
