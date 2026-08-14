/**
 * Type-level and round-trip coverage for {@link FilterOperator}.
 *
 * Every `satisfies` in this file is itself an assertion: the suite
 * fails to type-check if the filter type rejects a shape it is meant
 * to accept. The translator calls then confirm the accepted shapes
 * reach SQL intact, so a type is never widened past what the runtime
 * supports.
 *
 * @module types/filter/FilterOperator.test
 */

import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import type { Query } from '../mod.ts';
import { PostgresTranslator } from '../../translator/mod.ts';

type User = { id: number; email: string; status: string; createdAt: Date };

const pg = new PostgresTranslator();

/**
 * The translator's public surface takes the defaulted `Query`, whose
 * filter keys come from a catch-all index signature. A query written
 * against a declared schema is structurally narrower, so the cast is
 * only bridging the generic — the value is unchanged.
 */
const translate = (q: unknown) => pg.select(q as Query<'SELECT'>);

describe('oql.types.FilterOperator', () => {
  it('accepts a direct value as equality on a declared column', () => {
    const query = {
      type: 'SELECT',
      table: 'users',
      columns: ['id', 'email', 'status'],
      projection: { '@id': true, '@email': true },
      where: { '@status': 'active' },
    } satisfies Query<'SELECT', User>;

    const { sql, params } = translate(query);
    asserts.assertStringIncludes(sql, 'WHERE "status" = :p_0:');
    asserts.assertEquals(params, { p_0: 'active' });
  });

  it('accepts direct values and operator objects side by side', () => {
    const cutoff = new Date('2024-01-01T00:00:00.000Z');
    const query = {
      type: 'SELECT',
      table: 'users',
      columns: ['id', 'email', 'status', 'createdAt'],
      projection: { '@id': true },
      where: {
        '@status': 'active',
        '@createdAt': { $gte: cutoff },
      },
    } satisfies Query<'SELECT', User>;

    const { sql, params } = translate(query);
    asserts.assertStringIncludes(sql, '"status" = :p_0:');
    asserts.assertStringIncludes(sql, '"createdAt" >= :p_1:');
    asserts.assertEquals(params, { p_0: 'active', p_1: cutoff });
  });

  it('accepts a direct value on a numeric column', () => {
    const query = {
      type: 'SELECT',
      table: 'users',
      columns: ['id', 'email'],
      projection: { '@email': true },
      where: { '@id': 42 },
    } satisfies Query<'SELECT', User>;

    const { sql, params } = translate(query);
    asserts.assertStringIncludes(sql, 'WHERE "id" = :p_0:');
    asserts.assertEquals(params, { p_0: 42 });
  });

  it('still accepts operator objects on a query with no declared schema', () => {
    // Regression guard for the catch-all fallback: a query built
    // against the defaulted `TableType` has no concrete column keys,
    // so `FilterOperator` keeps its index signature. Dropping it
    // unconditionally would reject every filter key here.
    const query = {
      type: 'SELECT',
      table: 'users',
      columns: ['id', 'status'],
      projection: { '@id': true },
      where: { '@status': { $eq: 'active' } },
    } satisfies Query<'SELECT'>;

    const { sql, params } = translate(query);
    asserts.assertStringIncludes(sql, 'WHERE "status" = :p_0:');
    asserts.assertEquals(params, { p_0: 'active' });
  });

  it('accepts a direct value nested inside $and / $or', () => {
    const query = {
      type: 'SELECT',
      table: 'users',
      columns: ['id', 'email', 'status'],
      projection: { '@id': true },
      where: {
        $or: [
          { '@status': 'active' },
          { '@email': 'root@example.com' },
        ],
      },
    } satisfies Query<'SELECT', User>;

    const { sql, params } = translate(query);
    asserts.assertStringIncludes(sql, '"status" = :p_0:');
    asserts.assertStringIncludes(sql, '"email" = :p_1:');
    asserts.assertEquals(params, {
      p_0: 'active',
      p_1: 'root@example.com',
    });
  });
});
