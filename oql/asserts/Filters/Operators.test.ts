/**
 * Test suite for Operators validators
 *
 * Comprehensive tests for Operators validator with 100% coverage.
 */
import * as asserts from '$asserts';
import { assertOperators, isOperators } from './Operators.ts';

Deno.test('oql.asserts.Filters.Operators', async (t) => {
  await t.step('assertOperators', async (u) => {
    await u.step('valid: null value', () => {
      assertOperators<{ id: number }>(null);
    });

    await u.step('valid: string primitive', () => {
      assertOperators<{ name: string }>('test');
    });

    await u.step('valid: number primitive', () => {
      assertOperators<{ age: number }>(42);
    });

    await u.step('valid: boolean primitive', () => {
      assertOperators<{ active: boolean }>(true);
    });

    await u.step('valid: bigint primitive', () => {
      assertOperators<{ count: bigint }>(123n);
    });

    await u.step('valid: Date object', () => {
      assertOperators<{ created: Date }>(new Date());
    });

    await u.step('valid: array of primitives', () => {
      assertOperators<{ tags: string[] }>(['a', 'b', 'c']);
    });

    await u.step('valid: $eq with string', () => {
      assertOperators<{ name: string }>({ $eq: 'test' }, 'string');
    });

    await u.step('valid: $eq with number', () => {
      assertOperators<{ age: number }>({ $eq: 42 }, 'number');
    });

    await u.step('valid: $ne with boolean', () => {
      assertOperators<{ active: boolean }>({ $ne: false }, 'boolean');
    });

    await u.step('valid: $eq with null', () => {
      assertOperators<{ value: string | null }>({ $eq: null });
    });

    await u.step('valid: $eq with different type (no strict checking)', () => {
      assertOperators<{ age: number }>({ $eq: 'string' } as any, 'number');
    });

    await u.step('valid: $in with array', () => {
      assertOperators<{ status: string }>(
        { $in: ['active', 'pending'] },
        'string',
      );
    });

    await u.step('valid: $nin with numbers', () => {
      assertOperators<{ level: number }>({ $nin: [1, 2, 3] }, 'number');
    });

    await u.step(
      'valid: $nin with different types (no strict checking)',
      () => {
        assertOperators<{ level: number }>(
          { $nin: ['a', 'b'] } as any,
          'number',
        );
      },
    );

    await u.step('valid: $gt with number', () => {
      assertOperators<{ age: number }>({ $gt: 18 }, 'number');
    });

    await u.step('valid: $gte with bigint', () => {
      assertOperators<{ count: bigint }>({ $gte: 100n }, 'bigint');
    });

    await u.step('valid: $lt with Date', () => {
      assertOperators<{ created: Date }>({ $lt: new Date() }, 'date');
    });

    await u.step('valid: $lte with number', () => {
      assertOperators<{ score: number }>({ $lte: 100 }, 'number');
    });

    await u.step('valid: $gt with different type (no strict checking)', () => {
      assertOperators<{ age: number }>({ $gt: '18' } as any, 'number');
    });

    await u.step('valid: $like with pattern', () => {
      assertOperators<{ name: string }>({ $like: '%test%' }, 'string');
    });

    await u.step('valid: $ilike with pattern', () => {
      assertOperators<{ email: string }>({ $ilike: '%@example.com' }, 'string');
    });

    await u.step('valid: $startsWith', () => {
      assertOperators<{ name: string }>({ $startsWith: 'Mr.' }, 'string');
    });

    await u.step('valid: $endsWith', () => {
      assertOperators<{ filename: string }>({ $endsWith: '.txt' }, 'string');
    });

    await u.step('valid: $contains', () => {
      assertOperators<{ description: string }>(
        { $contains: 'keyword' },
        'string',
      );
    });

    await u.step('valid: $null true', () => {
      assertOperators<{ value: string | null }>({ $null: true });
    });

    await u.step('valid: $null false', () => {
      assertOperators<{ value: string | null }>({ $null: false });
    });

    await u.step('valid: multiple operators', () => {
      assertOperators<{ age: number }>({ $gte: 18, $lt: 65 }, 'number');
    });

    await u.step('valid: multiple operators (no conflict checking)', () => {
      assertOperators<{ age: number }>({ $eq: 25, $ne: 25 } as any, 'number');
    });

    await u.step('invalid: empty array', () => {
      asserts.assertThrows(
        () => assertOperators<{ tags: string[] }>([] as any),
        TypeError,
        'Array cannot be empty',
      );
    });

    await u.step('invalid: array with non-primitive', () => {
      asserts.assertThrows(
        () => assertOperators<{ data: any[] }>([{ x: 1 }] as any),
        TypeError,
        'must be a primitive value',
      );
    });

    await u.step('invalid: object without operators', () => {
      asserts.assertThrows(
        () => assertOperators<{ data: any }>({ plain: 'object' } as any),
        TypeError,
        'Unknown operator',
      );
    });

    await u.step('invalid: empty operator object', () => {
      asserts.assertThrows(
        () => assertOperators<{ id: number }>({} as any),
        TypeError,
        'cannot be empty',
      );
    });

    await u.step('invalid: non-object type', () => {
      asserts.assertThrows(
        () => assertOperators<{ id: number }>(Symbol() as any),
        TypeError,
        'Expected null, primitive value, array, or operator object',
      );
    });

    await u.step('invalid: $in not an array', () => {
      asserts.assertThrows(
        () => assertOperators<{ status: string }>({ $in: 'not-array' } as any),
        TypeError,
        'must have an array value',
      );
    });

    await u.step('invalid: $in empty array', () => {
      asserts.assertThrows(
        () => assertOperators<{ status: string }>({ $in: [] } as any),
        TypeError,
        'array cannot be empty',
      );
    });

    await u.step('invalid: $in with object in array', () => {
      asserts.assertThrows(
        () =>
          assertOperators<{ status: string }>(
            { $in: ['active', { nested: 'object' }] } as any,
          ),
        TypeError,
        'must be a primitive value',
      );
    });

    await u.step('invalid: $lt with boolean', () => {
      asserts.assertThrows(
        () =>
          assertOperators<{ active: boolean }>({ $lt: true } as any, 'boolean'),
        TypeError,
        'only valid for numeric or date columns',
      );
    });

    await u.step('invalid: $like with non-string', () => {
      asserts.assertThrows(
        () =>
          assertOperators<{ name: string }>({ $like: 123 } as any, 'string'),
        TypeError,
        'must have a string value',
      );
    });

    await u.step('invalid: $like on number type', () => {
      asserts.assertThrows(
        () =>
          assertOperators<{ age: number }>({ $like: '%18%' } as any, 'number'),
        TypeError,
        'only valid for string columns',
      );
    });

    await u.step('invalid: $null not boolean', () => {
      asserts.assertThrows(
        () =>
          assertOperators<{ value: string | null }>({ $null: 'yes' } as any),
        TypeError,
        'must be a boolean',
      );
    });
  });

  await t.step('isOperators', async (u) => {
    await u.step('valid values', () => {
      asserts.assertEquals(isOperators<{ id: number }>(null), true);
      asserts.assertEquals(isOperators<{ name: string }>('test'), true);
      asserts.assertEquals(isOperators<{ age: number }>(42, 'number'), true);
      asserts.assertEquals(isOperators<{ tags: string[] }>(['a', 'b']), true);
      asserts.assertEquals(
        isOperators<{ age: number }>({ $gt: 18 }, 'number'),
        true,
      );
    });

    await u.step('invalid values', () => {
      asserts.assertEquals(isOperators<{ tags: string[] }>([]), false);
      asserts.assertEquals(
        isOperators<{ data: any }>({ plain: 'object' } as any),
        false,
      );
      asserts.assertEquals(
        isOperators<{ age: number }>({ $gt: '18' } as any, 'number'),
        true,
      );
    });
  });
});
