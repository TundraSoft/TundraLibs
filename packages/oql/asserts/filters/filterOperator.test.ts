/**
 * Test suite for FilterOperator and QueryFilter validators
 *
 * Comprehensive tests for FilterOperator and QueryFilter validators with 100% coverage.
 */
import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import {
  assertFilterOperator,
  assertQueryFilter,
  isFilterOperator,
  isQueryFilter,
} from './filterOperator.ts';
import type { Query, QueryFilter } from '../../types/mod.ts';

describe('oql.asserts.Filters.FilterOperator', () => {
  describe('assertFilterOperator', () => {
    it('valid: single column with direct value', () => {
      assertFilterOperator<{ id: number }>({ '@id': 10 });
    });

    it('valid: multiple columns with operators', () => {
      assertFilterOperator<{ id: number; name: string }>({
        '@id': { $gt: 5 },
        '@name': { $like: '%test%' },
      });
    });

    it('valid: column with null', () => {
      assertFilterOperator<{ value: string | null }>({ '@value': null });
    });

    it('valid: nested column identifier', () => {
      assertFilterOperator<{ id: number }>({ '@user.@id': 5 });
    });

    it('valid: with Operators', () => {
      assertFilterOperator<{ age: number }>({
        '@age': { $gte: 18, $lt: 65 },
      });
    });

    it('valid: with array operator', () => {
      assertFilterOperator<{ status: string }>({
        '@status': { $in: ['active', 'pending'] },
      });
    });

    it('valid: with string operator', () => {
      assertFilterOperator<{ email: string }>({
        '@email': { $ilike: '%@example.com' },
      });
    });

    it('invalid: not an object', () => {
      asserts.assertThrows(
        () => assertFilterOperator<{ id: number }>('invalid' as any),
        TypeError,
        'Expected an object',
      );
    });

    it('invalid: empty object', () => {
      asserts.assertThrows(
        () => assertFilterOperator<{ id: number }>({} as any),
        TypeError,
        'cannot be empty',
      );
    });

    it('invalid: invalid column identifier', () => {
      asserts.assertThrows(
        () => assertFilterOperator<{ id: number }>({ 'id': 10 } as any),
        TypeError,
        "must start with '@'",
      );
    });

    it('invalid: column not in list', () => {
      asserts.assertThrows(
        () =>
          assertFilterOperator<{ id: number }>(
            { '@other': 10 },
            ['id', 'name'],
          ),
        TypeError,
        'not a valid column identifier',
      );
    });

    it('invalid: malformed column identifier', () => {
      asserts.assertThrows(
        () =>
          assertFilterOperator<{ id: number }>({
            '@@invalid': 10,
          } as any),
        TypeError,
        'not a valid column identifier',
      );
    });

    it('invalid: invalid operator', () => {
      asserts.assertThrows(
        () =>
          assertFilterOperator<{ age: number }>({
            '@age': { $invalid: 18 } as any,
          }),
        TypeError,
        'must be valid Operators',
      );
    });
  });

  describe('isFilterOperator', () => {
    it('valid values', () => {
      asserts.assertEquals(
        isFilterOperator<{ id: number }>({ '@id': 10 }),
        true,
      );
      asserts.assertEquals(
        isFilterOperator<{ age: number }>({ '@age': { $gt: 18 } }),
        true,
      );
    });

    it('invalid values', () => {
      asserts.assertEquals(isFilterOperator<{ id: number }>('invalid'), false);
      asserts.assertEquals(isFilterOperator<{ id: number }>({}), false);
      asserts.assertEquals(
        isFilterOperator<{ id: number }>({ 'id': 10 } as any),
        false,
      );
    });
  });

  describe('assertQueryFilter', () => {
    it('valid: $and with filters', () => {
      assertQueryFilter<{ id: number; name: string }>({
        $and: [
          { '@id': { $gt: 5 } },
          { '@name': { $like: '%test%' } },
        ],
      });
    });

    it('valid: $or with filters', () => {
      assertQueryFilter<{ status: string; active: boolean }>({
        $or: [
          { '@status': 'pending' },
          { '@active': true },
        ],
      });
    });

    it('valid: nested logical operators', () => {
      assertQueryFilter<{ age: number; status: string; country: string }>({
        $and: [
          { '@age': { $gte: 18 } },
          {
            $or: [
              { '@status': 'active' },
              { '@country': 'US' },
            ],
          },
        ],
      });
    });

    it('valid: simple FilterOperator', () => {
      assertQueryFilter<{ id: number }>({ '@id': 10 });
    });

    it('valid: FilterOperator with operators', () => {
      assertQueryFilter<{ age: number; name: string }>({
        '@age': { $gte: 18 },
        '@name': { $like: '%test%' },
      });
    });

    it('valid: FilterOperator with $and', () => {
      assertQueryFilter<{ id: number; name: string; age: number }>({
        '@id': { $gt: 0 },
        $and: [
          { '@name': { $like: '%test%' } },
          { '@age': { $gte: 18 } },
        ],
      });
    });

    it('valid: complex nested structure', () => {
      assertQueryFilter<
        { age: number; status: string; country: string; level: number }
      >({
        $and: [
          { '@age': { $gte: 18 } },
          {
            $or: [
              { '@status': { $in: ['active', 'pending'] } },
              {
                $and: [
                  { '@country': 'US' },
                  { '@level': { $gt: 5 } },
                ],
              },
            ],
          },
        ],
      });
    });

    it('valid: deeply nested structure', () => {
      assertQueryFilter<{ a: number; b: number; c: number; d: number }>({
        $and: [
          {
            $or: [
              {
                $and: [
                  { '@a': 1 },
                  { '@b': 2 },
                ],
              },
              {
                $and: [
                  { '@c': 3 },
                  { '@d': 4 },
                ],
              },
            ],
          },
        ],
      });
    });

    it('invalid: $and not an array', () => {
      asserts.assertThrows(
        () =>
          assertQueryFilter<{ id: number }>({
            $and: { '@id': 10 } as any,
          }),
        TypeError,
        'must be an array',
      );
    });

    it('invalid: $and empty array', () => {
      asserts.assertThrows(
        () =>
          assertQueryFilter<{ id: number }>({
            $and: [],
          }),
        TypeError,
        'array cannot be empty',
      );
    });

    it('invalid: $and with invalid filter', () => {
      asserts.assertThrows(
        () =>
          assertQueryFilter<{ id: number }>({
            $and: [
              { '@id': 10 },
              { 'invalid': 20 } as any,
            ],
          }),
        TypeError,
        "must start with '@'",
      );
    });

    it('invalid: $or with malformed element', () => {
      asserts.assertThrows(
        () =>
          assertQueryFilter<{ status: string }>({
            $or: [
              { '@status': 'active' },
              'invalid' as any,
            ],
          }),
        TypeError,
        'element at index',
      );
    });

    it('invalid: FilterOperator with invalid column', () => {
      asserts.assertThrows(
        () =>
          assertQueryFilter<{ id: number }>({
            'id': 10 as any,
          }),
        TypeError,
        "must start with '@'",
      );
    });

    it('invalid: not an object', () => {
      asserts.assertThrows(
        () => assertQueryFilter<{ id: number }>('invalid' as any),
        TypeError,
        'Expected an object',
      );
    });

    it('invalid: empty object', () => {
      asserts.assertThrows(
        () => assertQueryFilter<{ id: number }>({} as any),
        TypeError,
        'cannot be empty',
      );
    });

    it('invalid: invalid filter properties', () => {
      asserts.assertThrows(
        () =>
          assertQueryFilter<{ name: string }>({
            'invalid': 'test',
          } as any),
        TypeError,
        'Filter properties are invalid',
      );
    });

    it('valid: $exists subquery filter', () => {
      assertQueryFilter<{ id: number }>({
        $exists: {
          table: 'orders',
          on: { '@userId': '@id' },
          where: { '@status': 'paid' },
        },
      });
    });

    it('valid: $nexists subquery filter', () => {
      assertQueryFilter<{ id: number }>({
        $nexists: { table: 'bans', on: { '@userId': '@id' } },
      });
    });

    it('valid: $exists combined with column filters and $or', () => {
      assertQueryFilter<{ id: number; role: string }>({
        '@role': 'admin',
        $or: [
          { '@id': { $gt: 10 } },
          { $exists: { table: 'orders', on: { '@userId': '@id' } } },
        ],
      });
    });

    it('invalid: $exists with a bad spec surfaces the exists error', () => {
      asserts.assertThrows(
        () =>
          assertQueryFilter<{ id: number }>({
            $exists: { table: 'orders' },
          } as any),
        TypeError,
        "'$exists' is invalid",
      );
    });

    it('invalid: $nexists must be an object', () => {
      asserts.assertThrows(
        () =>
          assertQueryFilter<{ id: number }>({
            $nexists: 'orders',
          } as any),
        TypeError,
        "'$nexists' is invalid",
      );
    });
  });

  describe('isQueryFilter', () => {
    it('valid values', () => {
      asserts.assertEquals(
        isQueryFilter<{ id: number }>({ '@id': 10 }),
        true,
      );
      asserts.assertEquals(
        isQueryFilter<{ id: number; name: string }>({
          $and: [{ '@id': 10 }, { '@name': 'test' }],
        }),
        true,
      );
    });

    it('invalid values', () => {
      asserts.assertEquals(isQueryFilter<{ id: number }>('invalid'), false);
      asserts.assertEquals(isQueryFilter<{ id: number }>({}), false);
      asserts.assertEquals(
        isQueryFilter<{ id: number }>({ $and: [] }),
        false,
      );
    });
  });

  /*
   * Type-level coverage for relation-aware filter typing.
   *
   * These tests do not perform runtime assertions — they verify that
   * `QueryFilter` and `Query<'SELECT'>.where` accept the documented
   * single-`@` joined-column syntax (`'@Relation.@column'`) at the
   * type level. The runtime asserts elsewhere in this file only check
   * the syntactic shape (key starts with `@`), so without these tests
   * a regression in the type chain (e.g. `FlattenEntity` losing its
   * idempotency for already-`@`-prefixed keys) would silently break
   * the typed filter for relations.
   *
   * Each test compiles only if the type system accepts/rejects the
   * shape as expected; `assertExists` is a trivial runtime check so
   * the surrounding `it` block reports a result.
   */
  describe('type-level: relation-aware filter shape', () => {
    type User = { id: number; name: string; status: string };
    type Profile = { userId: number; verified: boolean; bio: string };

    it('QueryFilter accepts single-@ joined ref on combined PT', () => {
      type Combined = User & { '@Profile.@verified': boolean };
      const filter: QueryFilter<Combined> = {
        '@status': 'active',
        '@Profile.@verified': true,
      };
      asserts.assertExists(filter);
    });

    it("Query<'SELECT'>.where accepts documented single-@ joined refs", () => {
      const q: Query<'SELECT', User, { Profile: Profile }> = {
        type: 'SELECT',
        table: 'users',
        columns: ['id'],
        projection: { '@id': true },
        where: {
          '@status': 'active',
          '@Profile.@verified': true,
        },
      };
      asserts.assertExists(q);
    });

    it("Query<'SELECT'>.where rejects wrong value type on joined ref", () => {
      const q: Query<'SELECT', User, { Profile: Profile }> = {
        type: 'SELECT',
        table: 'users',
        columns: ['id'],
        projection: { '@id': true },
        where: {
          // @ts-expect-error - verified is boolean, not string
          '@Profile.@verified': 'not-a-boolean',
        },
      };
      asserts.assertExists(q);
    });

    it("Query<'SELECT'>.where rejects nonexistent column on joined ref", () => {
      const q: Query<'SELECT', User, { Profile: Profile }> = {
        type: 'SELECT',
        table: 'users',
        columns: ['id'],
        projection: { '@id': true },
        where: {
          // @ts-expect-error - 'madeUp' is not a column on Profile
          '@Profile.@madeUp': true,
        },
      };
      asserts.assertExists(q);
    });
  });

  /*
   * Runtime coverage for JSON-path filter keys (`@col.@key`): accepted
   * when the first segment names a declared JSON-path root, restricted
   * to the equality / null / membership / LIKE operator families, and
   * always losing to an exact (join-qualified) column-list match.
   */
  describe('JSON path keys', () => {
    const COLUMNS = ['id', 'profile'];
    const ROOTS = ['id', 'profile'];

    it('accepts a single-level JSON path with $eq', () => {
      assertFilterOperator(
        { '@profile.@name': { $eq: 'bob' } },
        COLUMNS,
        ROOTS,
      );
    });

    it('accepts a deep JSON path', () => {
      assertFilterOperator(
        { '@profile.@address.@city': 'Berlin' },
        COLUMNS,
        ROOTS,
      );
    });

    it('accepts direct value, array shorthand, and null on a JSON path', () => {
      assertFilterOperator({ '@profile.@name': 'bob' }, COLUMNS, ROOTS);
      assertFilterOperator({ '@profile.@tag': ['a', 'b'] }, COLUMNS, ROOTS);
      assertFilterOperator({ '@profile.@gone': null }, COLUMNS, ROOTS);
    });

    it('accepts every allowed operator on a JSON path', () => {
      assertFilterOperator(
        {
          '@profile.@name': {
            $eq: 'a',
            $ne: 'b',
            $in: ['c'],
            $nin: ['d'],
            $like: 'e%',
            $nlike: 'f%',
            $ilike: 'g%',
            $nilike: 'h%',
            $startsWith: 'i',
            $endsWith: 'j',
            $contains: 'k',
          },
          '@profile.@gone': { $null: true },
        },
        COLUMNS,
        ROOTS,
      );
    });

    it('rejects $gt on a JSON path', () => {
      asserts.assertThrows(
        () =>
          assertFilterOperator(
            { '@profile.@age': { $gt: 5 } },
            COLUMNS,
            ROOTS,
          ),
        TypeError,
        "Operator '$gt' is not supported on JSON path '@profile.@age'",
      );
    });

    it('rejects $between on a JSON path', () => {
      asserts.assertThrows(
        () =>
          assertFilterOperator(
            { '@profile.@age': { $between: [1, 2] } },
            COLUMNS,
            ROOTS,
          ),
        TypeError,
        "Operator '$between' is not supported on JSON path '@profile.@age'",
      );
    });

    it('exact column-list match keeps the full operator set (join precedence)', () => {
      // `user.age` is a joined column in the list — the exact match wins
      // over the JSON-path interpretation even though `user` could also
      // be read as a root, so $gt stays valid.
      assertFilterOperator(
        { '@user.@age': { $gt: 5 } },
        ['id', 'user', 'user.age'],
        ['id', 'user'],
      );
    });

    it('still rejects dotted keys without jsonPathRoots (old behavior)', () => {
      asserts.assertThrows(
        () => assertFilterOperator({ '@profile.@name': 'bob' }, COLUMNS),
        TypeError,
        'not a valid column identifier',
      );
    });

    it('rejects a first segment that is not a declared root', () => {
      asserts.assertThrows(
        () => assertFilterOperator({ '@ghost.@name': 'bob' }, COLUMNS, ROOTS),
        TypeError,
        'not a valid column identifier',
      );
    });

    it('rejects a malformed JSON path even when the root matches', () => {
      asserts.assertThrows(
        () => assertFilterOperator({ '@profile.name': 'bob' }, COLUMNS, ROOTS),
        TypeError,
        'not a valid column identifier',
      );
    });

    it('assertQueryFilter forwards roots into $and / $or branches', () => {
      assertQueryFilter(
        {
          $and: [
            { '@profile.@name': { $eq: 'bob' } },
            { $or: [{ '@id': 1 }, { '@profile.@kind': 'x' }] },
          ],
        },
        COLUMNS,
        undefined,
        undefined,
        ROOTS,
      );
      asserts.assertThrows(
        () =>
          assertQueryFilter(
            { $and: [{ '@profile.@age': { $lt: 3 } }] },
            COLUMNS,
            undefined,
            undefined,
            ROOTS,
          ),
        TypeError,
        "Operator '$lt' is not supported on JSON path '@profile.@age'",
      );
    });

    it('isQueryFilter mirrors the assert', () => {
      asserts.assertEquals(
        isQueryFilter(
          { '@profile.@name': 'bob' },
          COLUMNS,
          undefined,
          undefined,
          ROOTS,
        ),
        true,
      );
      asserts.assertEquals(
        isQueryFilter(
          { '@profile.@age': { $gte: 1 } },
          COLUMNS,
          undefined,
          undefined,
          ROOTS,
        ),
        false,
      );
    });
  });

  /*
   * Type-level coverage for JSON (open-Record) column filtering.
   *
   * `Record<string, unknown>` (the underlying TS type for a JSON
   * column) has `string extends keyof T` — an open index signature.
   * `FlattenEntity` must NOT recurse into open records, otherwise the
   * column-level key `'@profile'` disappears from the filter shape and
   * only path-like keys (`'@profile.@something'`) remain. These tests
   * verify the column is filterable at the top level with the basic
   * operators OQL supports for record-typed values: null match, exact
   * match, $null, $eq, $ne, $in, $nin.
   */
  describe('type-level: JSON (open-Record) column filter shape', () => {
    type Row = { id: number; profile: Record<string, unknown> };

    it('accepts null literal on JSON column', () => {
      const f: QueryFilter<Row> = { '@profile': null };
      asserts.assertExists(f);
    });

    it('accepts exact-record match on JSON column', () => {
      const f: QueryFilter<Row> = { '@profile': { name: 'bob' } };
      asserts.assertExists(f);
    });

    it('accepts $null operator on JSON column', () => {
      const f: QueryFilter<Row> = { '@profile': { $null: true } };
      asserts.assertExists(f);
    });

    it('accepts $eq / $ne / $in / $nin on JSON column', () => {
      const f1: QueryFilter<Row> = { '@profile': { $eq: { name: 'bob' } } };
      const f2: QueryFilter<Row> = { '@profile': { $ne: { name: 'bob' } } };
      const f3: QueryFilter<Row> = {
        '@profile': { $in: [{ a: 1 }, { b: 2 }] },
      };
      const f4: QueryFilter<Row> = {
        '@profile': { $nin: [{ a: 1 }] },
      };
      asserts.assertExists(f1);
      asserts.assertExists(f2);
      asserts.assertExists(f3);
      asserts.assertExists(f4);
    });

    it('exposes @profile (not just @profile.@<key>) in the keyspace', () => {
      // Negative compile-time witness: if FlattenEntity were to recurse
      // into Record<string, unknown>, this assignment would fail because
      // the bare '@profile' key would not exist in the filter shape.
      type _Keys = keyof QueryFilter<Row>;
      const k: _Keys = '@profile';
      asserts.assertEquals(k, '@profile');
    });
  });
});
