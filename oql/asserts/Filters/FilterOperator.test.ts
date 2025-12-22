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
  //#region FilterOperator - Simple Filters

  await t.step(
    'assertFilterOperator - valid: single column with direct value',
    () => {
      assertFilterOperator<{ id: number }>({ '@id': 10 });
    },
  );

  await t.step(
    'assertFilterOperator - valid: multiple columns with operators',
    () => {
      assertFilterOperator<{ id: number; name: string }>({
        '@id': { $gt: 5 },
        '@name': { $like: '%test%' },
      });
    },
  );

  await t.step('assertFilterOperator - valid: column with null', () => {
    assertFilterOperator<{ value: string | null }>({ '@value': null });
  });

  await t.step('assertFilterOperator - valid: nested column identifier', () => {
    assertFilterOperator<{ id: number }>({ '@user.@id': 5 });
  });

  await t.step('assertFilterOperator - invalid: not an object', () => {
    asserts.assertThrows(
      () => assertFilterOperator<{ id: number }>('invalid' as any),
      TypeError,
      'Expected an object',
    );
  });

  await t.step('assertFilterOperator - invalid: empty object', () => {
    asserts.assertThrows(
      () => assertFilterOperator<{ id: number }>({} as any),
      TypeError,
      'cannot be empty',
    );
  });

  await t.step(
    'assertFilterOperator - invalid: invalid column identifier',
    () => {
      asserts.assertThrows(
        () => assertFilterOperator<{ id: number }>({ 'id': 10 } as any),
        TypeError,
        "must start with '@'",
      );
    },
  );

  await t.step('assertFilterOperator - invalid: column not in list', () => {
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

  //#endregion FilterOperator - Simple Filters

  //#region FilterOperator - Operators

  await t.step('assertFilterOperator - valid: with Operators', () => {
    assertFilterOperator<{ age: number }>({
      '@age': { $gte: 18, $lt: 65 },
    });
  });

  await t.step('assertFilterOperator - valid: with array operator', () => {
    assertFilterOperator<{ status: string }>({
      '@status': { $in: ['active', 'pending'] },
    });
  });

  await t.step('assertFilterOperator - valid: with string operator', () => {
    assertFilterOperator<{ email: string }>({
      '@email': { $ilike: '%@example.com' },
    });
  });

  await t.step('assertFilterOperator - invalid: invalid operator', () => {
    asserts.assertThrows(
      () =>
        assertFilterOperator<{ age: number }>({
          '@age': { $invalid: 18 } as any,
        }),
      TypeError,
      'must be valid Operators',
    );
  });

  //#endregion FilterOperator - Operators

  //#region FilterOperator - Validation

  //#region FilterOperator - Validation

  await t.step(
    'assertFilterOperator - invalid: malformed column identifier',
    () => {
      asserts.assertThrows(
        () =>
          assertFilterOperator<{ id: number }>({
            '@@invalid': 10,
          } as any),
        TypeError,
        'not a valid column identifier',
      );
    },
  );

  //#endregion FilterOperator - Expression Operators

  //#region FilterOperator Type Guard

  await t.step('isFilterOperator - valid values', () => {
    asserts.assertEquals(
      isFilterOperator<{ id: number }>({ '@id': 10 }),
      true,
    );
    asserts.assertEquals(
      isFilterOperator<{ age: number }>({ '@age': { $gt: 18 } }),
      true,
    );
  });

  await t.step('isFilterOperator - invalid values', () => {
    asserts.assertEquals(isFilterOperator<{ id: number }>('invalid'), false);
    asserts.assertEquals(isFilterOperator<{ id: number }>({}), false);
    asserts.assertEquals(
      isFilterOperator<{ id: number }>({ 'id': 10 } as any),
      false,
    );
  });

  //#endregion FilterOperator Type Guard

  //#region QueryFilter - Logical Operators

  await t.step('assertQueryFilter - valid: $and with filters', () => {
    assertQueryFilter<{ id: number; name: string }>({
      $and: [
        { '@id': { $gt: 5 } },
        { '@name': { $like: '%test%' } },
      ],
    });
  });

  await t.step('assertQueryFilter - valid: $or with filters', () => {
    assertQueryFilter<{ status: string; active: boolean }>({
      $or: [
        { '@status': 'pending' },
        { '@active': true },
      ],
    });
  });

  await t.step('assertQueryFilter - valid: nested logical operators', () => {
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

  await t.step('assertQueryFilter - invalid: $and not an array', () => {
    asserts.assertThrows(
      () =>
        assertQueryFilter<{ id: number }>({
          $and: { '@id': 10 } as any,
        }),
      TypeError,
      'must be an array',
    );
  });

  await t.step('assertQueryFilter - invalid: $and empty array', () => {
    asserts.assertThrows(
      () =>
        assertQueryFilter<{ id: number }>({
          $and: [],
        }),
      TypeError,
      'array cannot be empty',
    );
  });

  await t.step('assertQueryFilter - invalid: $and with invalid filter', () => {
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

  await t.step(
    'assertQueryFilter - invalid: $or with malformed element',
    () => {
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
    },
  );

  //#endregion QueryFilter - Logical Operators

  //#region QueryFilter - FilterOperator

  await t.step('assertQueryFilter - valid: simple FilterOperator', () => {
    assertQueryFilter<{ id: number }>({ '@id': 10 });
  });

  await t.step(
    'assertQueryFilter - valid: FilterOperator with operators',
    () => {
      assertQueryFilter<{ age: number; name: string }>({
        '@age': { $gte: 18 },
        '@name': { $like: '%test%' },
      });
    },
  );

  await t.step(
    'assertQueryFilter - invalid: FilterOperator with invalid column',
    () => {
      asserts.assertThrows(
        () =>
          assertQueryFilter<{ id: number }>({
            'id': 10 as any,
          }),
        TypeError,
        "must start with '@'",
      );
    },
  );

  //#endregion QueryFilter - FilterOperator

  //#region QueryFilter - Mixed Cases

  await t.step('assertQueryFilter - valid: FilterOperator with $and', () => {
    assertQueryFilter<{ id: number; name: string; age: number }>({
      '@id': { $gt: 0 },
      $and: [
        { '@name': { $like: '%test%' } },
        { '@age': { $gte: 18 } },
      ],
    });
  });

  await t.step('assertQueryFilter - valid: complex nested structure', () => {
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

  await t.step('assertQueryFilter - invalid: not an object', () => {
    asserts.assertThrows(
      () => assertQueryFilter<{ id: number }>('invalid' as any),
      TypeError,
      'Expected an object',
    );
  });

  await t.step('assertQueryFilter - invalid: empty object', () => {
    asserts.assertThrows(
      () => assertQueryFilter<{ id: number }>({} as any),
      TypeError,
      'cannot be empty',
    );
  });

  await t.step('assertQueryFilter - invalid: invalid filter properties', () => {
    asserts.assertThrows(
      () =>
        assertQueryFilter<{ name: string }>({
          'invalid': 'test',
        } as any),
      TypeError,
      'Filter properties are invalid',
    );
  });

  //#endregion QueryFilter - Mixed Cases

  //#region QueryFilter Type Guard

  await t.step('isQueryFilter - valid values', () => {
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

  await t.step('isQueryFilter - invalid values', () => {
    asserts.assertEquals(isQueryFilter<{ id: number }>('invalid'), false);
    asserts.assertEquals(isQueryFilter<{ id: number }>({}), false);
    asserts.assertEquals(
      isQueryFilter<{ id: number }>({ $and: [] }),
      false,
    );
  });

  //#endregion QueryFilter Type Guard

  //#region Recursion Tests

  await t.step('assertQueryFilter - valid: deeply nested structure', () => {
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

  //#endregion Recursion Tests
});
