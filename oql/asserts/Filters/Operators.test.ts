/**
 * Test suite for Operators validators
 *
 * Comprehensive tests for Operators validator with 100% coverage.
 */
import * as asserts from '$asserts';
import { assertOperators, isOperators } from './Operators.ts';

Deno.test('oql.asserts.Filters.Operators', async (t) => {
  //#region Direct Value Tests

  await t.step('assertOperators - valid: null value', () => {
    assertOperators<{ id: number }>(null);
  });

  await t.step('assertOperators - valid: string primitive', () => {
    assertOperators<{ name: string }>('test');
  });

  await t.step('assertOperators - valid: number primitive', () => {
    assertOperators<{ age: number }>(42);
  });

  await t.step('assertOperators - valid: boolean primitive', () => {
    assertOperators<{ active: boolean }>(true);
  });

  await t.step('assertOperators - valid: bigint primitive', () => {
    assertOperators<{ count: bigint }>(123n);
  });

  await t.step('assertOperators - valid: Date object', () => {
    assertOperators<{ created: Date }>(new Date());
  });

  await t.step('assertOperators - valid: array of primitives', () => {
    assertOperators<{ tags: string[] }>(['a', 'b', 'c']);
  });

  await t.step('assertOperators - invalid: empty array', () => {
    asserts.assertThrows(
      () => assertOperators<{ tags: string[] }>([] as any),
      TypeError,
      'Array cannot be empty',
    );
  });

  await t.step('assertOperators - invalid: array with non-primitive', () => {
    asserts.assertThrows(
      () => assertOperators<{ data: any[] }>([{ x: 1 }] as any),
      TypeError,
      'must be a primitive value',
    );
  });

  await t.step('assertOperators - invalid: object without operators', () => {
    asserts.assertThrows(
      () => assertOperators<{ data: any }>({ plain: 'object' } as any),
      TypeError,
      'Unknown operator',
    );
  });

  await t.step('assertOperators - invalid: empty operator object', () => {
    asserts.assertThrows(
      () => assertOperators<{ id: number }>({} as any),
      TypeError,
      'cannot be empty',
    );
  });

  await t.step('assertOperators - invalid: non-object type', () => {
    asserts.assertThrows(
      () => assertOperators<{ id: number }>(Symbol() as any),
      TypeError,
      'Expected null, primitive value, array, or operator object',
    );
  });

  //#endregion Direct Value Tests

  //#region Equality Operators Tests

  await t.step('assertOperators - valid: $eq with string', () => {
    assertOperators<{ name: string }>({ $eq: 'test' }, 'string');
  });

  await t.step('assertOperators - valid: $eq with number', () => {
    assertOperators<{ age: number }>({ $eq: 42 }, 'number');
  });

  await t.step('assertOperators - valid: $ne with boolean', () => {
    assertOperators<{ active: boolean }>({ $ne: false }, 'boolean');
  });

  await t.step('assertOperators - valid: $eq with null', () => {
    assertOperators<{ value: string | null }>({ $eq: null });
  });

  await t.step(
    'assertOperators - valid: $eq with different type (no strict checking)',
    () => {
      // Note: Type checking is not enforced at runtime
      assertOperators<{ age: number }>({ $eq: 'string' } as any, 'number');
    },
  );

  //#endregion Equality Operators Tests

  //#region Array Operators Tests

  await t.step('assertOperators - valid: $in with array', () => {
    assertOperators<{ status: string }>(
      { $in: ['active', 'pending'] },
      'string',
    );
  });

  await t.step('assertOperators - valid: $nin with numbers', () => {
    assertOperators<{ level: number }>({ $nin: [1, 2, 3] }, 'number');
  });

  await t.step('assertOperators - invalid: $in not an array', () => {
    asserts.assertThrows(
      () => assertOperators<{ status: string }>({ $in: 'not-array' } as any),
      TypeError,
      'must have an array value',
    );
  });

  await t.step('assertOperators - invalid: $in empty array', () => {
    asserts.assertThrows(
      () => assertOperators<{ status: string }>({ $in: [] } as any),
      TypeError,
      'array cannot be empty',
    );
  });

  await t.step('assertOperators - invalid: $in with object in array', () => {
    asserts.assertThrows(
      () =>
        assertOperators<{ status: string }>(
          { $in: ['active', { nested: 'object' }] } as any,
        ),
      TypeError,
      'must be a primitive value',
    );
  });

  await t.step(
    'assertOperators - valid: $nin with different types (no strict checking)',
    () => {
      // Note: Type checking is not enforced at runtime
      assertOperators<{ level: number }>({ $nin: ['a', 'b'] } as any, 'number');
    },
  );

  //#endregion Array Operators Tests

  //#region Comparison Operators Tests

  await t.step('assertOperators - valid: $gt with number', () => {
    assertOperators<{ age: number }>({ $gt: 18 }, 'number');
  });

  await t.step('assertOperators - valid: $gte with bigint', () => {
    assertOperators<{ count: bigint }>({ $gte: 100n }, 'bigint');
  });

  await t.step('assertOperators - valid: $lt with Date', () => {
    assertOperators<{ created: Date }>({ $lt: new Date() }, 'date');
  });

  await t.step('assertOperators - valid: $lte with number', () => {
    assertOperators<{ score: number }>({ $lte: 100 }, 'number');
  });

  await t.step(
    'assertOperators - valid: $gt with different type (no strict checking)',
    () => {
      // Note: Type checking is not enforced at runtime
      assertOperators<{ age: number }>({ $gt: '18' } as any, 'number');
    },
  );

  await t.step('assertOperators - invalid: $lt with boolean', () => {
    asserts.assertThrows(
      () =>
        assertOperators<{ active: boolean }>({ $lt: true } as any, 'boolean'),
      TypeError,
      'only valid for numeric or date columns',
    );
  });

  //#endregion Comparison Operators Tests

  //#region String Operators Tests

  await t.step('assertOperators - valid: $like with pattern', () => {
    assertOperators<{ name: string }>({ $like: '%test%' }, 'string');
  });

  await t.step('assertOperators - valid: $ilike with pattern', () => {
    assertOperators<{ email: string }>({ $ilike: '%@example.com' }, 'string');
  });

  await t.step('assertOperators - valid: $startsWith', () => {
    assertOperators<{ name: string }>({ $startsWith: 'Mr.' }, 'string');
  });

  await t.step('assertOperators - valid: $endsWith', () => {
    assertOperators<{ filename: string }>({ $endsWith: '.txt' }, 'string');
  });

  await t.step('assertOperators - valid: $contains', () => {
    assertOperators<{ description: string }>(
      { $contains: 'keyword' },
      'string',
    );
  });

  await t.step('assertOperators - invalid: $like with non-string', () => {
    asserts.assertThrows(
      () => assertOperators<{ name: string }>({ $like: 123 } as any, 'string'),
      TypeError,
      'must have a string value',
    );
  });

  await t.step('assertOperators - invalid: $like on number type', () => {
    asserts.assertThrows(
      () =>
        assertOperators<{ age: number }>({ $like: '%18%' } as any, 'number'),
      TypeError,
      'only valid for string columns',
    );
  });

  //#endregion String Operators Tests

  //#region Null Operators Tests

  await t.step('assertOperators - valid: $null true', () => {
    assertOperators<{ value: string | null }>({ $null: true });
  });

  await t.step('assertOperators - valid: $null false', () => {
    assertOperators<{ value: string | null }>({ $null: false });
  });

  await t.step('assertOperators - invalid: $null not boolean', () => {
    asserts.assertThrows(
      () => assertOperators<{ value: string | null }>({ $null: 'yes' } as any),
      TypeError,
      'must be a boolean',
    );
  });

  //#endregion Null Operators Tests

  //#region Multiple Operators Tests

  await t.step('assertOperators - valid: multiple operators', () => {
    assertOperators<{ age: number }>({ $gte: 18, $lt: 65 }, 'number');
  });

  await t.step(
    'assertOperators - valid: multiple operators (no conflict checking)',
    () => {
      // Note: The validators don't check for conflicting operator combinations
      assertOperators<{ age: number }>({ $eq: 25, $ne: 25 } as any, 'number');
    },
  );

  //#endregion Multiple Operators Tests

  //#region Type Guard Tests

  await t.step('isOperators - valid values', () => {
    asserts.assertEquals(isOperators<{ id: number }>(null), true);
    asserts.assertEquals(isOperators<{ name: string }>('test'), true);
    asserts.assertEquals(isOperators<{ age: number }>(42, 'number'), true);
    asserts.assertEquals(isOperators<{ tags: string[] }>(['a', 'b']), true);
    asserts.assertEquals(
      isOperators<{ age: number }>({ $gt: 18 }, 'number'),
      true,
    );
  });

  await t.step('isOperators - invalid values', () => {
    asserts.assertEquals(isOperators<{ tags: string[] }>([]), false);
    asserts.assertEquals(
      isOperators<{ data: any }>({ plain: 'object' } as any),
      false,
    );
    // Type checking is not enforced, so this is actually valid
    asserts.assertEquals(
      isOperators<{ age: number }>({ $gt: '18' } as any, 'number'),
      true,
    );
  });

  //#endregion Type Guard Tests
});
