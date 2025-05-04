import * as asserts from '$asserts';
import {
  assertAggregate,
  assertAvgAggregate,
  assertCountAggregate,
  assertCountDistinctAggregate,
  assertDistinctAggregate,
  assertJSONRowAggregate,
  assertSumAggregate,
} from './Aggregate.ts';

Deno.test('OQL.asserts.Aggregate', async (a) => {
  await a.step('BaseAggregate', async (b) => {
    await b.step('should validate aggregate structure', () => {
      // Should pass
      assertAggregate({ $aggr: 'COUNT', $args: '1' });

      // Should fail
      asserts.assertThrows(
        () => assertAggregate(null),
        TypeError,
        'must be an object',
      );

      asserts.assertThrows(
        () => assertAggregate({}),
        TypeError,
        'Expected an object with $aggr property',
      );

      asserts.assertThrows(
        () => assertAggregate({ $aggr: 'INVALID_AGGR' }),
        TypeError,
        'Expected $aggr to be one of',
      );
    });
  });

  await a.step('NumericAggregates', async (b) => {
    await b.step('should validate SUM aggregate', () => {
      // Should pass
      assertSumAggregate({ $aggr: 'SUM', $args: '$amount' });

      // Should fail
      asserts.assertThrows(
        () => assertSumAggregate({ $aggr: 'SUM' }),
        TypeError,
        'Expected $args property to be defined',
      );

      asserts.assertThrows(
        () => assertSumAggregate({ $aggr: 'SUM', $args: 'amount' }),
        TypeError,
        'Expected $args property to be a column identifier',
      );
    });

    await b.step('should validate AVG aggregate', () => {
      // Should pass
      assertAvgAggregate({ $aggr: 'AVG', $args: '$score' });

      // Should fail
      asserts.assertThrows(
        () => assertAvgAggregate({ $aggr: 'AVG' }),
        TypeError,
        'Expected $args property to be defined',
      );

      asserts.assertThrows(
        () => assertAvgAggregate({ $aggr: 'AVG', $args: 123 }),
        TypeError,
        'Expected $args property to be a column identifier',
      );
    });
  });

  await a.step('CountAggregates', async (b) => {
    await b.step('should validate COUNT aggregate', () => {
      // Should pass
      assertCountAggregate({ $aggr: 'COUNT', $args: '1' });
      assertCountAggregate({ $aggr: 'COUNT', $args: '*' });

      // Should fail
      asserts.assertThrows(
        () => assertCountAggregate({ $aggr: 'COUNT', $args: '$column' }),
        TypeError,
        'Expected $args property to be "1" or "*"',
      );
    });

    await b.step('should validate COUNT_DISTINCT aggregate', () => {
      // Should pass
      assertCountDistinctAggregate({
        $aggr: 'COUNT_DISTINCT',
        $args: ['$userId'],
      });

      assertCountDistinctAggregate({
        $aggr: 'COUNT_DISTINCT',
        $args: ['$userId', '$role'],
      });

      // Should fail
      asserts.assertThrows(
        () =>
          assertCountDistinctAggregate({
            $aggr: 'COUNT_DISTINCT',
            $args: '$userId',
          }),
        TypeError,
        'Expected $args property to be an array',
      );

      asserts.assertThrows(
        () =>
          assertCountDistinctAggregate({
            $aggr: 'COUNT_DISTINCT',
            $args: [123],
          }),
        TypeError,
        'Expected $args property to be an array of column identifiers',
      );
    });

    await b.step('should validate DISTINCT aggregate', () => {
      // Should pass
      assertDistinctAggregate({
        $aggr: 'DISTINCT',
        $args: ['$category'],
      });

      // Should fail
      asserts.assertThrows(
        () =>
          assertDistinctAggregate({
            $aggr: 'DISTINCT',
            $args: 'category',
          }),
        TypeError,
        'Expected $args property to be an array',
      );
    });
  });

  await a.step('ComplexAggregates', async (b) => {
    await b.step('should validate JSON_ROW aggregate', () => {
      // Should pass
      assertJSONRowAggregate({
        $aggr: 'JSON_ROW',
        $args: {
          id: '$id',
          name: '$name',
          count: { $aggr: 'COUNT', $args: '*' },
        },
      });

      // Should fail - invalid key name
      asserts.assertThrows(
        () =>
          assertJSONRowAggregate({
            $aggr: 'JSON_ROW',
            $args: {
              ' 123invalid': '$id',
            },
          }),
        TypeError,
        'Expected key',
      );

      // Should fail - invalid value
      asserts.assertThrows(
        () =>
          assertJSONRowAggregate({
            $aggr: 'JSON_ROW',
            $args: {
              name: 123,
            },
          }),
        TypeError,
        'Expected value for key',
      );
    });
  });
});
