/**
 * Unit coverage for the JSON-path branch of
 * {@link AbstractTranslator._translateFilter} — the disambiguation
 * precedence (join alias → base table name → declared column) and the
 * translate-time operator restriction. Exercised through a thin test
 * subclass because the method is `protected` and the public query path
 * runs the asserts first, which would mask the translator's own guards.
 *
 * @module translator/JsonPathFilter.test
 */

import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import type { QueryFilter } from '../types/mod.ts';
import { SQLiteTranslator } from './SQLiteTranslator.ts';
import { Parameters } from './Parameters.ts';
import { DialectUnsupportedError, OqlError } from '../errors/mod.ts';
import { AbstractTranslator } from './AbstractTranslator.ts';

/** Exposes the protected filter translator for direct assertion. */
class TestTranslator extends SQLiteTranslator {
  public translateFilter(
    filter: QueryFilter,
    scope: string[],
    hasJoins: boolean,
    outerTable?: string,
  ): string {
    return this._translateFilter(
      filter,
      scope,
      new Parameters(),
      hasJoins,
      outerTable === undefined ? undefined : { outerTable },
    );
  }
}

const t = new TestTranslator();

describe('oql.translator.JsonPathFilter', () => {
  it('emits an extraction when the first segment is a declared column', () => {
    asserts.assertEquals(
      t.translateFilter(
        { '@profile.@name': { $eq: 'bob' } } as QueryFilter,
        ['id', 'profile'],
        false,
      ),
      `json_extract("profile", '$.name') = :p_0:`,
    );
  });

  it('qualifies the column with the base alias when joins are present', () => {
    asserts.assertEquals(
      t.translateFilter(
        { '@meta.@rank': 'gold' } as QueryFilter,
        ['__base__.id', '__base__.meta', 'Author.name'],
        true,
      ),
      `json_extract(__base__."meta", '$.rank') = :p_0:`,
    );
  });

  it('precedence 1: a join alias wins over a same-named column', () => {
    asserts.assertEquals(
      t.translateFilter(
        { '@profile.@name': 'bob' } as QueryFilter,
        ['__base__.id', '__base__.profile', 'profile.name'],
        true,
      ),
      '"profile"."name" = :p_0:',
    );
  });

  it('precedence 1: the alias prefix wins even for an undeclared joined column', () => {
    // `profile.bio` is not in scope, but `profile.` entries are — the
    // qualified interpretation still applies (existing blind
    // qualification; the asserts layer rejects this on the public path).
    asserts.assertEquals(
      t.translateFilter(
        { '@profile.@bio': 'x' } as QueryFilter,
        ['__base__.id', '__base__.profile', 'profile.name'],
        true,
      ),
      '"profile"."bio" = :p_0:',
    );
  });

  it('precedence 2: the base table name wins over a same-named column', () => {
    asserts.assertEquals(
      t.translateFilter(
        { '@users.@x': 1 } as QueryFilter,
        ['id', 'users'],
        false,
        'users',
      ),
      '"users"."x" = :p_0:',
    );
  });

  it('precedence 4: an unknown first segment keeps the existing blind qualification', () => {
    // The asserts layer is the gate for unknown refs on the public path;
    // the translator's own resolution is unchanged.
    asserts.assertEquals(
      t.translateFilter(
        { '@ghost.@x': 1 } as QueryFilter,
        ['id', 'profile'],
        false,
      ),
      '"ghost"."x" = :p_0:',
    );
  });

  it('rejects $gt on a JSON path at translate time', () => {
    const err = asserts.assertThrows(
      () =>
        t.translateFilter(
          { '@profile.@age': { $gt: 5 } } as QueryFilter,
          ['id', 'profile'],
          false,
        ),
      OqlError,
      "Operator '$gt' is not supported on JSON path '@profile.@age'",
    );
    asserts.assertEquals(
      (err as OqlError).code,
      'JSON_PATH_UNSUPPORTED_OPERATOR',
    );
  });

  it('rejects $between on a JSON path at translate time', () => {
    const err = asserts.assertThrows(
      () =>
        t.translateFilter(
          { '@profile.@age': { $between: [1, 2] } } as QueryFilter,
          ['id', 'profile'],
          false,
        ),
      OqlError,
      "Operator '$between' is not supported on JSON path '@profile.@age'",
    );
    asserts.assertEquals(
      (err as OqlError).code,
      'JSON_PATH_UNSUPPORTED_OPERATOR',
    );
  });

  it('rejects a non-identifier path segment (defence-in-depth)', () => {
    // Hand-built input bypassing the asserts must not reach the SQL
    // string literal — segments are re-validated at translate time.
    const err = asserts.assertThrows(
      () =>
        t.translateFilter(
          { "@profile.@na'me": 'x' } as QueryFilter,
          ['id', 'profile'],
          false,
        ),
      OqlError,
    );
    asserts.assertEquals((err as OqlError).code, 'INVALID_COLUMN_REF');
  });
});

describe('oql.translator.JsonPathFilter guards', () => {
  const t = new TestTranslator();

  it('base _renderJsonPath throws DialectUnsupportedError (subclass contract)', () => {
    // A dialect that does not override _renderJsonPath must fail loudly on
    // first use, not emit broken SQL. Reach the base implementation directly
    // (every shipped dialect overrides it).
    const base = AbstractTranslator.prototype as unknown as {
      _renderJsonPath: (c: string, p: string[]) => string;
    };
    const err = asserts.assertThrows(
      () => base._renderJsonPath.call(t, '"profile"', ['name']),
      DialectUnsupportedError,
    );
    asserts.assertStringIncludes(err.message, 'JSON path');
  });

  it('__matchJsonPathKey returns null for non-@ and single-segment keys', () => {
    const m = t as unknown as {
      __matchJsonPathKey: (
        key: string,
        scope: string[],
        hasJoins: boolean,
      ) => unknown;
    };
    asserts.assertEquals(m.__matchJsonPathKey('plain', [], false), null);
    asserts.assertEquals(m.__matchJsonPathKey('@profile', [], false), null);
  });
});
