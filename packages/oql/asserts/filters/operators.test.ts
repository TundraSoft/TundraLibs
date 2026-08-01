/**
 * Test suite for Operators validators
 *
 * Comprehensive tests for Operators validator with 100% coverage.
 */
import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { assertOperators, isOperators } from './operators.ts';

describe('oql.asserts.Filters.Operators', () => {
  describe('assertOperators', () => {
    it('valid: null value', () => {
      assertOperators<{ id: number }>(null);
    });

    it('valid: string primitive', () => {
      assertOperators<{ name: string }>('test');
    });

    it('valid: number primitive', () => {
      assertOperators<{ age: number }>(42);
    });

    it('valid: boolean primitive', () => {
      assertOperators<{ active: boolean }>(true);
    });

    it('valid: bigint primitive', () => {
      assertOperators<{ count: bigint }>(123n);
    });

    it('valid: Date object', () => {
      assertOperators<{ created: Date }>(new Date());
    });

    it('valid: array of primitives', () => {
      assertOperators<{ tags: string[] }>(['a', 'b', 'c']);
    });

    it('valid: $eq with string', () => {
      assertOperators<{ name: string }>({ $eq: 'test' }, 'string');
    });

    it('valid: $eq with number', () => {
      assertOperators<{ age: number }>({ $eq: 42 }, 'number');
    });

    it('valid: $ne with boolean', () => {
      assertOperators<{ active: boolean }>({ $ne: false }, 'boolean');
    });

    it('invalid: $eq with null is rejected (use $null instead)', () => {
      // SQL `= NULL` / `<> NULL` are always unknown. Callers must use
      // the dedicated `$null: true` / `$null: false` operators for
      // null comparisons.
      asserts.assertThrows(
        () => assertOperators<{ value: string | null }>({ $eq: null }),
        TypeError,
        "'$eq' operator value cannot be null",
      );
    });

    it('valid: $eq with Expression', () => {
      // Expression objects (with `$$_expression`) are allowed in
      // comparison-operator value slots, per the type definition.
      assertOperators<{ total: number }>(
        { $eq: { $$_expression: 'MULTIPLY', args: ['@subtotal', 1.05] } },
        'number',
      );
    });

    it('valid: $eq with different type (no strict checking)', () => {
      assertOperators<{ age: number }>({ $eq: 'string' } as any, 'number');
    });

    it('valid: $in with array', () => {
      assertOperators<{ status: string }>(
        { $in: ['active', 'pending'] },
        'string',
      );
    });

    it('valid: $nin with numbers', () => {
      assertOperators<{ level: number }>({ $nin: [1, 2, 3] }, 'number');
    });

    it('valid: $nin with different types (no strict checking)', () => {
      assertOperators<{ level: number }>(
        { $nin: ['a', 'b'] } as any,
        'number',
      );
    });

    it('valid: $gt with number', () => {
      assertOperators<{ age: number }>({ $gt: 18 }, 'number');
    });

    it('valid: $gte with bigint', () => {
      assertOperators<{ count: bigint }>({ $gte: 100n }, 'bigint');
    });

    it('valid: $lt with Date', () => {
      assertOperators<{ created: Date }>({ $lt: new Date() }, 'date');
    });

    it('valid: $lte with number', () => {
      assertOperators<{ score: number }>({ $lte: 100 }, 'number');
    });

    it('valid: $gt with different type (no strict checking)', () => {
      assertOperators<{ age: number }>({ $gt: '18' } as any, 'number');
    });

    it('valid: $like with pattern', () => {
      assertOperators<{ name: string }>({ $like: '%test%' }, 'string');
    });

    it('valid: $ilike with pattern', () => {
      assertOperators<{ email: string }>({ $ilike: '%@example.com' }, 'string');
    });

    it('valid: $startsWith', () => {
      assertOperators<{ name: string }>({ $startsWith: 'Mr.' }, 'string');
    });

    it('valid: $endsWith', () => {
      assertOperators<{ filename: string }>({ $endsWith: '.txt' }, 'string');
    });

    it('valid: $contains', () => {
      assertOperators<{ description: string }>(
        { $contains: 'keyword' },
        'string',
      );
    });

    it('valid: $null true', () => {
      assertOperators<{ value: string | null }>({ $null: true });
    });

    it('valid: $null false', () => {
      assertOperators<{ value: string | null }>({ $null: false });
    });

    it('valid: multiple operators', () => {
      assertOperators<{ age: number }>({ $gte: 18, $lt: 65 }, 'number');
    });

    it('valid: multiple operators (no conflict checking)', () => {
      assertOperators<{ age: number }>({ $eq: 25, $ne: 25 } as any, 'number');
    });

    it('invalid: empty array', () => {
      asserts.assertThrows(
        () => assertOperators<{ tags: string[] }>([] as any),
        TypeError,
        'Array cannot be empty',
      );
    });

    it('invalid: array with non-primitive', () => {
      asserts.assertThrows(
        () => assertOperators<{ data: any[] }>([{ x: 1 }] as any),
        TypeError,
        'must be a primitive value',
      );
    });

    it('invalid: object without operators', () => {
      asserts.assertThrows(
        () => assertOperators<{ data: any }>({ plain: 'object' } as any),
        TypeError,
        'Unknown operator',
      );
    });

    it('invalid: empty operator object', () => {
      asserts.assertThrows(
        () => assertOperators<{ id: number }>({} as any),
        TypeError,
        'cannot be empty',
      );
    });

    it('invalid: non-object type', () => {
      asserts.assertThrows(
        () => assertOperators<{ id: number }>(Symbol() as any),
        TypeError,
        'Expected null, primitive value, array, or operator object',
      );
    });

    it('invalid: $in not an array', () => {
      asserts.assertThrows(
        () => assertOperators<{ status: string }>({ $in: 'not-array' } as any),
        TypeError,
        'must have an array value',
      );
    });

    it('invalid: $in empty array', () => {
      asserts.assertThrows(
        () => assertOperators<{ status: string }>({ $in: [] } as any),
        TypeError,
        'array cannot be empty',
      );
    });

    it('invalid: $in with object in array', () => {
      asserts.assertThrows(
        () =>
          assertOperators<{ status: string }>(
            { $in: ['active', { nested: 'object' }] } as any,
          ),
        TypeError,
        'must be a primitive value',
      );
    });

    it('invalid: $between with wrong array length', () => {
      asserts.assertThrows(
        () =>
          assertOperators<{ age: number }>(
            { $between: [1, 2, 3] } as any,
            'number',
          ),
        TypeError,
        'must have exactly 2 elements',
      );

      asserts.assertThrows(
        () =>
          assertOperators<{ age: number }>({ $between: [1] } as any, 'number'),
        TypeError,
        'must have exactly 2 elements',
      );
    });

    it('invalid: comparison operator with non-primitive value', () => {
      asserts.assertThrows(
        () =>
          assertOperators<{ data: any }>({ $eq: { nested: 'object' } } as any),
        TypeError,
        'must have a primitive value',
      );

      asserts.assertThrows(
        () => assertOperators<{ data: any }>({ $ne: ['array'] } as any),
        TypeError,
        'must have a primitive value',
      );

      asserts.assertThrows(
        () => assertOperators<{ data: any }>({ $gt: {} } as any, 'number'),
        TypeError,
        'must have a primitive value',
      );
    });

    it('invalid: $lt with boolean', () => {
      asserts.assertThrows(
        () =>
          assertOperators<{ active: boolean }>({ $lt: true } as any, 'boolean'),
        TypeError,
        'only valid for numeric or date columns',
      );
    });

    it('invalid: $like with non-string', () => {
      asserts.assertThrows(
        () =>
          assertOperators<{ name: string }>({ $like: 123 } as any, 'string'),
        TypeError,
        'must have a string value',
      );
    });

    it('invalid: $like on number type', () => {
      asserts.assertThrows(
        () =>
          assertOperators<{ age: number }>({ $like: '%18%' } as any, 'number'),
        TypeError,
        'only valid for string columns',
      );
    });

    it('invalid: $null not boolean', () => {
      asserts.assertThrows(
        () =>
          assertOperators<{ value: string | null }>({ $null: 'yes' } as any),
        TypeError,
        'must be a boolean',
      );
    });
  });

  describe('isOperators', () => {
    it('valid values', () => {
      asserts.assertEquals(isOperators<{ id: number }>(null), true);
      asserts.assertEquals(isOperators<{ name: string }>('test'), true);
      asserts.assertEquals(isOperators<{ age: number }>(42, 'number'), true);
      asserts.assertEquals(isOperators<{ tags: string[] }>(['a', 'b']), true);
      asserts.assertEquals(
        isOperators<{ age: number }>({ $gt: 18 }, 'number'),
        true,
      );
    });

    it('invalid values', () => {
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
