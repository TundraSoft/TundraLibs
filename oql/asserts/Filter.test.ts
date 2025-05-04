import * as asserts from '$asserts';
import {
  assertAndFilter,
  assertBetweenFilter,
  assertFilter,
  assertInFilter,
  assertNullFilter,
  assertOrFilter,
  assertQueryFilters,
  assertStringPatternFilter,
} from './Filter.ts';

Deno.test('OQL.asserts.Filter', async (a) => {
  await a.step('BasicFilters', async (b) => {
    await b.step('should validate direct value filters', () => {
      // Should pass for basic types
      assertFilter('test');
      assertFilter(123);
      assertFilter(true);
      assertFilter(null);
      assertFilter(new Date());

      // Should fail for undefined
      asserts.assertThrows(
        () => assertFilter(undefined),
        TypeError,
        'Filter must be a scalar value',
      );
    });

    await b.step('should validate array shorthand', () => {
      // Should pass
      assertFilter(['test']);
      assertFilter([123]);

      // Should fail for invalid arrays
      asserts.assertThrows(
        () => assertFilter(['test', 'test2']),
        TypeError,
        'must have exactly one element',
      );
    });
  });

  await a.step('FilterOperators', async (b) => {
    await b.step('should validate equality filters', () => {
      // Should pass
      assertFilter({ $eq: 'test' });
      assertFilter({ $eq: 123 });

      // Should fail for undefined
      asserts.assertThrows(
        () => assertFilter({ $eq: undefined }),
        TypeError,
        'cannot be undefined',
      );
    });

    await b.step('should validate nullability filters', () => {
      // Should pass
      assertNullFilter(true);
      assertNullFilter(false);

      // Should fail for non-booleans
      asserts.assertThrows(
        () => assertNullFilter('yes'),
        TypeError,
        'must be a boolean',
      );
    });

    await b.step('should validate in filters', () => {
      // Should pass
      assertInFilter([1, 2, 3]);
      assertInFilter(['a', 'b', 'c']);

      // Should fail for non-arrays
      asserts.assertThrows(
        () => assertInFilter('not-an-array'),
        TypeError,
        'must be an array',
      );
    });

    await b.step('should validate string pattern filters', () => {
      // Should pass
      assertStringPatternFilter('pattern', '$like');

      // Should fail for non-strings
      asserts.assertThrows(
        () => assertStringPatternFilter(123, '$like'),
        TypeError,
        'must be a string',
      );
    });

    await b.step('should validate between filters', () => {
      // Should pass
      assertBetweenFilter([1, 10]);

      // Should fail for invalid array length
      asserts.assertThrows(
        () => assertBetweenFilter([1]),
        TypeError,
        '$between filter must be an array with exactly 2 elements, got 1',
      );
    });
  });

  await a.step('ComplexFilters', async (b) => {
    await b.step('should validate object filters', () => {
      // Should pass with various operators
      assertFilter({ $eq: 'test' });
      assertFilter({ $ne: 123 });
      assertFilter({ $null: false });
      assertFilter({ $in: [1, 2, 3] });
      assertFilter({ $like: '%test%' });
      assertFilter({ $gt: 10 });

      // Should fail for invalid operators
      asserts.assertThrows(
        () => assertFilter({ $invalidOp: 'test' }),
        TypeError,
        'Unknown filter operator',
      );
    });

    await b.step('should validate logical operators', () => {
      // Should pass
      assertOrFilter([
        { $eq: 'test' },
        { $eq: 'test2' },
      ]);

      assertAndFilter([
        { $gt: 10 },
        { $lt: 20 },
      ]);

      // Should fail for non-arrays
      asserts.assertThrows(
        () => assertOrFilter('not-an-array'),
        TypeError,
        'must be an array',
      );
    });

    await b.step('should validate query filters', () => {
      // Should pass
      assertQueryFilters({
        name: { $like: '%John%' },
        age: { $gt: 18 },
      });

      // With logical operators
      assertQueryFilters({
        $or: [
          { name: 'John' },
          { name: 'Jane' },
        ],
        age: { $gt: 18 },
      });

      // Should fail for non-objects
      asserts.assertThrows(
        () => assertQueryFilters('not-an-object'),
        TypeError,
        'must be an object',
      );
    });

    await b.step('should validate expressions as filter values', () => {
      // Should pass
      assertFilter({ $expr: 'UUID' });
      assertFilter({ $expr: 'NOW' });
    });
  });
});
