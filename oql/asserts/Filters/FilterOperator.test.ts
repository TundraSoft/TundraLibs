/**
 * Test suite for FilterOperator and QueryFilter validators
 *
 * Comprehensive tests for FilterOperator and QueryFilter validators with 100% coverage.
 */
import * as asserts from '$asserts';
import {
  assertFilterOperator,
  assertQueryFilter,
  isFilterOperator,
  isQueryFilter,
} from './FilterOperator.ts';

Deno.test('oql.asserts.Filters.FilterOperator', async (t) => {
  await t.step('assertFilterOperator', async (u) => {
    await u.step('valid: single column with direct value', () => {
      assertFilterOperator<{ id: number }>({ '@id': 10 });
    });

    await u.step('valid: multiple columns with operators', () => {
      assertFilterOperator<{ id: number; name: string }>({
        '@id': { $gt: 5 },
        '@name': { $like: '%test%' },
      });
    });

    await u.step('valid: column with null', () => {
      assertFilterOperator<{ value: string | null }>({ '@value': null });
    });

    await u.step('valid: nested column identifier', () => {
      assertFilterOperator<{ id: number }>({ '@user.@id': 5 });
    });

    await u.step('valid: with Operators', () => {
      assertFilterOperator<{ age: number }>({
        '@age': { $gte: 18, $lt: 65 },
      });
    });

    await u.step('valid: with array operator', () => {
      assertFilterOperator<{ status: string }>({
        '@status': { $in: ['active', 'pending'] },
      });
    });

    await u.step('valid: with string operator', () => {
      assertFilterOperator<{ email: string }>({
        '@email': { $ilike: '%@example.com' },
      });
    });

    await u.step('invalid: not an object', () => {
      asserts.assertThrows(
        () => assertFilterOperator<{ id: number }>('invalid' as any),
        TypeError,
        'Expected an object',
      );
    });

    await u.step('invalid: empty object', () => {
      asserts.assertThrows(
        () => assertFilterOperator<{ id: number }>({} as any),
        TypeError,
        'cannot be empty',
      );
    });

    await u.step('invalid: invalid column identifier', () => {
      asserts.assertThrows(
        () => assertFilterOperator<{ id: number }>({ 'id': 10 } as any),
        TypeError,
        "must start with '@'",
      );
    });

    await u.step('invalid: column not in list', () => {
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

    await u.step('invalid: malformed column identifier', () => {
      asserts.assertThrows(
        () =>
          assertFilterOperator<{ id: number }>({
            '@@invalid': 10,
          } as any),
        TypeError,
        'not a valid column identifier',
      );
    });

    await u.step('invalid: invalid operator', () => {
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

  await t.step('isFilterOperator', async (u) => {
    await u.step('valid values', () => {
      asserts.assertEquals(
        isFilterOperator<{ id: number }>({ '@id': 10 }),
        true,
      );
      asserts.assertEquals(
        isFilterOperator<{ age: number }>({ '@age': { $gt: 18 } }),
        true,
      );
    });

    await u.step('invalid values', () => {
      asserts.assertEquals(isFilterOperator<{ id: number }>('invalid'), false);
      asserts.assertEquals(isFilterOperator<{ id: number }>({}), false);
      asserts.assertEquals(
        isFilterOperator<{ id: number }>({ 'id': 10 } as any),
        false,
      );
    });
  });

  await t.step('assertQueryFilter', async (u) => {
    await u.step('valid: $and with filters', () => {
      assertQueryFilter<{ id: number; name: string }>({
        $and: [
          { '@id': { $gt: 5 } },
          { '@name': { $like: '%test%' } },
        ],
      });
    });

    await u.step('valid: $or with filters', () => {
      assertQueryFilter<{ status: string; active: boolean }>({
        $or: [
          { '@status': 'pending' },
          { '@active': true },
        ],
      });
    });

    await u.step('valid: nested logical operators', () => {
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

    await u.step('valid: simple FilterOperator', () => {
      assertQueryFilter<{ id: number }>({ '@id': 10 });
    });

    await u.step('valid: FilterOperator with operators', () => {
      assertQueryFilter<{ age: number; name: string }>({
        '@age': { $gte: 18 },
        '@name': { $like: '%test%' },
      });
    });

    await u.step('valid: FilterOperator with $and', () => {
      assertQueryFilter<{ id: number; name: string; age: number }>({
        '@id': { $gt: 0 },
        $and: [
          { '@name': { $like: '%test%' } },
          { '@age': { $gte: 18 } },
        ],
      });
    });

    await u.step('valid: complex nested structure', () => {
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

    await u.step('valid: deeply nested structure', () => {
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

    await u.step('invalid: $and not an array', () => {
      asserts.assertThrows(
        () =>
          assertQueryFilter<{ id: number }>({
            $and: { '@id': 10 } as any,
          }),
        TypeError,
        'must be an array',
      );
    });

    await u.step('invalid: $and empty array', () => {
      asserts.assertThrows(
        () =>
          assertQueryFilter<{ id: number }>({
            $and: [],
          }),
        TypeError,
        'array cannot be empty',
      );
    });

    await u.step('invalid: $and with invalid filter', () => {
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

    await u.step('invalid: $or with malformed element', () => {
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

    await u.step('invalid: FilterOperator with invalid column', () => {
      asserts.assertThrows(
        () =>
          assertQueryFilter<{ id: number }>({
            'id': 10 as any,
          }),
        TypeError,
        "must start with '@'",
      );
    });

    await u.step('invalid: not an object', () => {
      asserts.assertThrows(
        () => assertQueryFilter<{ id: number }>('invalid' as any),
        TypeError,
        'Expected an object',
      );
    });

    await u.step('invalid: empty object', () => {
      asserts.assertThrows(
        () => assertQueryFilter<{ id: number }>({} as any),
        TypeError,
        'cannot be empty',
      );
    });

    await u.step('invalid: invalid filter properties', () => {
      asserts.assertThrows(
        () =>
          assertQueryFilter<{ name: string }>({
            'invalid': 'test',
          } as any),
        TypeError,
        'Filter properties are invalid',
      );
    });
  });

  await t.step('isQueryFilter', async (u) => {
    await u.step('valid values', () => {
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

    await u.step('invalid values', () => {
      asserts.assertEquals(isQueryFilter<{ id: number }>('invalid'), false);
      asserts.assertEquals(isQueryFilter<{ id: number }>({}), false);
      asserts.assertEquals(
        isQueryFilter<{ id: number }>({ $and: [] }),
        false,
      );
    });
  });
});
