/**
 * Type-level and round-trip coverage for nested arithmetic
 * {@link Expressions}.
 *
 * Each `satisfies` is an assertion in its own right — the suite stops
 * compiling if the expression type rejects a nesting the runtime
 * accepts. Every case is then pushed through both `assertQuery` and
 * `PostgresTranslator`, so the type is only as wide as the validator
 * and the emitter actually are.
 *
 * @module types/expressions/Expressions.test
 */

import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import type { Query } from '../mod.ts';
import { assertQuery } from '../../asserts/mod.ts';
import { PostgresTranslator } from '../../translator/mod.ts';

type Product = { name: string; price: number; quantity: number };

const pg = new PostgresTranslator();

/** Bridges the declared-schema query to the translator's defaulted one. */
const translate = (q: unknown) => pg.select(q as Query<'SELECT'>);

describe('oql.types.Expressions', () => {
  it('accepts an expression nested in an arithmetic args array', () => {
    const query = {
      type: 'SELECT',
      table: 'products',
      columns: ['name', 'price', 'quantity'],
      expressions: {
        discountedPrice: {
          $$_expression: 'SUBTRACT',
          args: [
            '@price',
            { $$_expression: 'MULTIPLY', args: ['@price', 0.1] },
          ],
        },
      },
      projection: { '@name': true, '@discountedPrice': 'salePrice' },
    } satisfies Query<'SELECT', Product>;

    // The runtime validator has to agree with the widened type.
    assertQuery(query);

    const { sql, params } = translate(query);
    asserts.assertStringIncludes(
      sql,
      '("price" - ("price" * :p_0:)) AS "salePrice"',
    );
    asserts.assertEquals(params, { p_0: 0.1 });
  });

  it('accepts an expression nested in POWER object args', () => {
    const query = {
      type: 'SELECT',
      table: 'products',
      columns: ['name', 'price', 'quantity'],
      expressions: {
        score: {
          $$_expression: 'POWER',
          args: {
            base: { $$_expression: 'ADD', args: ['@price', 1] },
            exponent: 2,
          },
        },
      },
      projection: { '@name': true, '@score': true },
    } satisfies Query<'SELECT', Product>;

    assertQuery(query);

    const { sql, params } = translate(query);
    asserts.assertStringIncludes(sql, 'POWER(("price" + :p_0:), :p_1:)');
    asserts.assertEquals(params, { p_0: 1, p_1: 2 });
  });

  it('accepts nesting several levels deep', () => {
    const query = {
      type: 'SELECT',
      table: 'products',
      columns: ['name', 'price', 'quantity'],
      expressions: {
        weighted: {
          $$_expression: 'ADD',
          args: [
            '@price',
            {
              $$_expression: 'MULTIPLY',
              args: [
                '@quantity',
                { $$_expression: 'DIVIDE', args: ['@price', 2] },
              ],
            },
          ],
        },
      },
      projection: { '@name': true, '@weighted': true },
    } satisfies Query<'SELECT', Product>;

    assertQuery(query);

    const { sql } = translate(query);
    asserts.assertStringIncludes(
      sql,
      '("price" + ("quantity" * ("price" / :p_0:)))',
    );
  });

  it('rejects a non-numeric nested expression at runtime', () => {
    // The type admits only `NumericExpressions` in an arithmetic arg,
    // matching `assertNumericExpression`. This is the runtime half of
    // that contract — hence the cast, which a caller could not write
    // without deliberately stepping around the type.
    const query = {
      type: 'SELECT',
      table: 'products',
      columns: ['name', 'price'],
      expressions: {
        bogus: {
          $$_expression: 'ADD',
          args: [
            '@price',
            { $$_expression: 'CONCAT', args: ['@name', 'x'] },
          ],
        },
      },
      projection: { '@name': true, '@bogus': true },
    };

    asserts.assertThrows(() => assertQuery(query));
  });
});
