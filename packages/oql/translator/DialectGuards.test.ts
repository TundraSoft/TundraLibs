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
});
