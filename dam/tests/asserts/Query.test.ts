import { assertEquals } from '../../../dev.dependencies.ts';
import {
  assertAggregates,
  assertBaseOperators,
  assertColumnIdentifier,
  assertDeleteQueryBuilder,
  assertExpression,
  assertInsertQueryBuilder,
  assertMathOperators,
  assertQueryFilters,
  assertStringOperators,
  assertUpdateQueryBuilder,
} from '../../mod.ts';

Deno.test('DAM > asserts > Query', async (t) => {
  await t.step('Column Identifier', () => {
    assertEquals(assertColumnIdentifier('$a'), true);
    assertEquals(assertColumnIdentifier('a'), false);
    assertEquals(assertColumnIdentifier('$v', ['a', 'b', 'c']), false);
    assertEquals(assertColumnIdentifier('$a', ['a', 'b', 'c']), true);
    assertEquals(assertColumnIdentifier('$MAIN.$a', ['a', 'b', 'c']), true);
    assertEquals(
      assertColumnIdentifier('$SUB.$a', ['a', 'b', 'c', 'SUB.$a']),
      true,
    );
    assertEquals(assertColumnIdentifier('$SUB.$a', ['a', 'b', 'c']), false);
  });

  await t.step('Aggregates', () => {
    assertEquals(assertAggregates({ $aggr: 'SUM', $args: '$a' }), true);
    assertEquals(assertAggregates({ $aggr: 'SUM', $args: 'adf' }), false);
    assertEquals(
      assertAggregates({
        $aggr: 'SUM',
        $args: { $expr: 'ADD', $args: [1, 2, '$a'] },
      }, ['a']),
      true,
    );
    assertEquals(
      assertAggregates({ $aggr: 'SUM', $args: { $expr: 'TODAY' } }, ['a']),
      false,
    );

    assertEquals(assertAggregates({ $aggr: 'AVG', $args: '$a' }), true);
    assertEquals(assertAggregates({ $aggr: 'AVG', $args: 'adf' }), false);
    assertEquals(
      assertAggregates({
        $aggr: 'AVG',
        $args: { $expr: 'ADD', $args: [1, 2, '$a'] },
      }, ['a']),
      true,
    );
    assertEquals(
      assertAggregates({ $aggr: 'AVG', $args: { $expr: 'TODAY' } }, ['a']),
      false,
    );

    assertEquals(assertAggregates({ $aggr: 'MIN', $args: '$a' }), true);
    assertEquals(assertAggregates({ $aggr: 'MAX', $args: '$a' }), true);
    assertEquals(assertAggregates({ $aggr: 'DISTINCT', $args: ['$a'] }), true);
    assertEquals(assertAggregates({ $aggr: 'COUNT', $args: '$a' }), true);
    assertEquals(assertAggregates({ $aggr: 'COUNT', $args: '*' }), true);
    assertEquals(
      assertAggregates({
        $aggr: 'COUNT',
        $args: { $aggr: 'DISTINCT', $args: ['$a'] },
      }),
      true,
    );

    assertEquals(
      assertAggregates({
        $aggr: 'COUNT',
        $args: { $aggr: 'SUM', $args: ['$a'] },
      }),
      false,
    );

    assertEquals(
      assertAggregates({ $aggr: 'JSON_ROW', $args: ['$a', '$b', '$c'] }),
      true,
    );
    assertEquals(
      assertAggregates({ $aggr: 'JSON_ROW', $args: ['$a', '$b', '$c'] }, [
        'a',
        'b',
        'c',
      ]),
      true,
    );
    assertEquals(
      assertAggregates({ $aggr: 'JSON_ROW', $args: ['$a', '$SUB.$b', '$c'] }, [
        'a',
        '$SUB.$b',
        'c',
      ]),
      true,
    );
  });

  await t.step('Expressions', async (t) => {
    await t.step('Date', () => {
      assertEquals(assertExpression({ $expr: 'NOW' }), true);
      assertEquals(assertExpression({ $expr: 'CURRENT_DATE' }), true);
      assertEquals(assertExpression({ $expr: 'CURRENT_TIME' }), true);
      assertEquals(assertExpression({ $expr: 'CURRENT_TIMESTAMP' }), true);
      //#region DATE_ADD
      assertEquals(
        assertExpression({
          $expr: 'DATE_ADD',
          $args: ['YEAR', { $expr: 'NOW' }, 1],
        }),
        true,
      );
      assertEquals(
        assertExpression({
          $expr: 'DATE_ADD',
          $args: ['MONTH', { $expr: 'NOW' }, 1],
        }),
        true,
      );
      assertEquals(
        assertExpression({
          $expr: 'DATE_ADD',
          $args: ['DAY', { $expr: 'NOW' }, 1],
        }),
        true,
      );
      assertEquals(
        assertExpression({
          $expr: 'DATE_ADD',
          $args: ['HOUR', { $expr: 'NOW' }, 1],
        }),
        true,
      );
      assertEquals(
        assertExpression({
          $expr: 'DATE_ADD',
          $args: ['MINUTE', { $expr: 'NOW' }, 1],
        }),
        true,
      );
      assertEquals(
        assertExpression({
          $expr: 'DATE_ADD',
          $args: ['SECOND', { $expr: 'NOW' }, 1],
        }),
        true,
      );

      assertEquals(
        assertExpression({
          $expr: 'DATE_ADD',
          $args: ['YEAR', { $expr: 'NOW' }, '1'],
        }),
        false,
      );
      assertEquals(
        assertExpression({
          $expr: 'DATE_ADD',
          $args: ['YEARD', { $expr: 'NOW' }, 1],
        }, ['a']),
        false,
      );
      assertEquals(
        assertExpression({
          $expr: 'DATE_ADD',
          $args: ['YEAR', { $expr: 'NOW' }, 1],
        }, ['a']),
        true,
      );
      assertEquals(
        assertExpression({
          $expr: 'DATE_ADD',
          $args: ['YEAR', { $expr: 'NOW' }, '$a'],
        }, ['a']),
        true,
      );
      assertEquals(
        assertExpression({
          $expr: 'DATE_ADD',
          $args: ['YEAR', new Date(), '$a'],
        }, ['a']),
        true,
      );
      //#endregion DATE_ADD
    });

    await t.step('Number', () => {
      assertEquals(
        assertExpression({ $expr: 'ADD', $args: [1, 2] }),
        true,
      );
      assertEquals(
        assertExpression({ $expr: 'ADD', $args: ['$a', '$b'] }),
        true,
      );
      assertEquals(
        assertExpression({ $expr: 'ADD', $args: ['$a', '$b'] }, [
          'a',
          'b',
          'c',
        ]),
        true,
      );
      assertEquals(
        assertExpression({ $expr: 'ADD', $args: ['$a', '$MAIN.$b'] }, [
          'a',
          'b',
          'c',
        ]),
        true,
      );
      assertEquals(
        assertExpression({ $expr: 'ADD', $args: ['$a', '$C.$a'] }, [
          'a',
          'b',
          '$C.$a',
        ]),
        true,
      );
      assertEquals(
        assertExpression({ $expr: 'ADD', $args: ['$d', '$c'] }, [
          'a',
          'b',
          'c',
        ]),
        false,
      );
      assertEquals(
        assertExpression({ $expr: 'ADD', $args: ['d', 'c'] }, [
          'a',
          'b',
          'c',
        ]),
        false,
      );

      assertEquals(
        assertExpression({ $expr: 'SUB', $args: [1, 2] }),
        true,
      );
      assertEquals(
        assertExpression({ $expr: 'SUB', $args: ['$a', '$b'] }),
        true,
      );
      assertEquals(
        assertExpression({ $expr: 'SUB', $args: ['$a', '$b'] }, [
          'a',
          'b',
          'c',
        ]),
        true,
      );
      assertEquals(
        assertExpression({ $expr: 'SUB', $args: ['$a', '$MAIN.$b'] }, [
          'a',
          'b',
          'c',
        ]),
        true,
      );
      assertEquals(
        assertExpression({ $expr: 'SUB', $args: ['$a', '$C.$a'] }, [
          'a',
          'b',
          '$C.$a',
        ]),
        true,
      );
      assertEquals(
        assertExpression({ $expr: 'SUB', $args: ['$d', '$c'] }, [
          'a',
          'b',
          'c',
        ]),
        false,
      );
      assertEquals(
        assertExpression({ $expr: 'SUB', $args: ['d', 'c'] }, [
          'a',
          'b',
          'c',
        ]),
        false,
      );

      assertEquals(
        assertExpression({ $expr: 'MUL', $args: [1, 2] }),
        true,
      );
      assertEquals(
        assertExpression({ $expr: 'MUL', $args: ['$a', '$b'] }),
        true,
      );
      assertEquals(
        assertExpression({ $expr: 'MUL', $args: ['$a', '$b'] }, [
          'a',
          'b',
          'c',
        ]),
        true,
      );
      assertEquals(
        assertExpression({ $expr: 'MUL', $args: ['$a', '$MAIN.$b'] }, [
          'a',
          'b',
          'c',
        ]),
        true,
      );
      assertEquals(
        assertExpression({ $expr: 'MUL', $args: ['$a', '$C.$a'] }, [
          'a',
          'b',
          '$C.$a',
        ]),
        true,
      );
      assertEquals(
        assertExpression({ $expr: 'MUL', $args: ['$d', '$c'] }, [
          'a',
          'b',
          'c',
        ]),
        false,
      );
      assertEquals(
        assertExpression({ $expr: 'MUL', $args: ['d', 'c'] }, [
          'a',
          'b',
          'c',
        ]),
        false,
      );

      assertEquals(
        assertExpression({ $expr: 'DIV', $args: [1, 2] }),
        true,
      );
      assertEquals(
        assertExpression({ $expr: 'DIV', $args: ['$a', '$b'] }),
        true,
      );
      assertEquals(
        assertExpression({ $expr: 'DIV', $args: ['$a', '$b'] }, [
          'a',
          'b',
          'c',
        ]),
        true,
      );
      assertEquals(
        assertExpression({ $expr: 'DIV', $args: ['$a', '$MAIN.$b'] }, [
          'a',
          'b',
          'c',
        ]),
        true,
      );
      assertEquals(
        assertExpression({ $expr: 'DIV', $args: ['$a', '$C.$a'] }, [
          'a',
          'b',
          '$C.$a',
        ]),
        true,
      );
      assertEquals(
        assertExpression({ $expr: 'DIV', $args: ['$d', '$c'] }, [
          'a',
          'b',
          'c',
        ]),
        false,
      );
      assertEquals(
        assertExpression({ $expr: 'DIV', $args: ['d', 'c'] }, [
          'a',
          'b',
          'c',
        ]),
        false,
      );

      assertEquals(
        assertExpression({ $expr: 'MOD', $args: [1, 2] }),
        true,
      );
      assertEquals(
        assertExpression({ $expr: 'MOD', $args: ['$a', '$b'] }),
        true,
      );
      assertEquals(
        assertExpression({ $expr: 'MOD', $args: ['$a', '$b'] }, [
          'a',
          'b',
          'c',
        ]),
        true,
      );
      assertEquals(
        assertExpression({ $expr: 'MOD', $args: ['$a', '$MAIN.$b'] }, [
          'a',
          'b',
          'c',
        ]),
        true,
      );
      assertEquals(
        assertExpression({ $expr: 'MOD', $args: ['$a', '$C.$a'] }, [
          'a',
          'b',
          '$C.$a',
        ]),
        true,
      );
      assertEquals(
        assertExpression({ $expr: 'MOD', $args: ['$d', '$c'] }, [
          'a',
          'b',
          'c',
        ]),
        false,
      );
      assertEquals(
        assertExpression({ $expr: 'MOD', $args: ['d', 'c'] }, [
          'a',
          'b',
          'c',
        ]),
        false,
      );

      assertEquals(assertExpression({ $expr: 'ABS', $args: 1 }), true);
      assertEquals(assertExpression({ $expr: 'ABS', $args: '$a' }), true);
      assertEquals(
        assertExpression({ $expr: 'ABS', $args: '$a' }, ['a']),
        true,
      );
      assertEquals(
        assertExpression({ $expr: 'ABS', $args: '$MAIN.$a' }, ['a', 'b']),
        true,
      );
      assertEquals(
        assertExpression({ $expr: 'ABS', $args: '$C.$a' }, [
          'a',
          'b',
          '$C.$a',
        ]),
        true,
      );
      assertEquals(
        assertExpression({ $expr: 'ABS', $args: '$g' }, [
          'a',
          'b',
          'c',
          'd',
        ]),
        false,
      );
      assertEquals(
        assertExpression({ $expr: 'ABS', $args: 'a' }, ['a']),
        false,
      );

      assertEquals(assertExpression({ $expr: 'CEIL', $args: 1 }), true);
      assertEquals(
        assertExpression({ $expr: 'CEIL', $args: '$a' }),
        true,
      );
      assertEquals(
        assertExpression({ $expr: 'CEIL', $args: '$a' }, ['a']),
        true,
      );
      assertEquals(
        assertExpression({ $expr: 'CEIL', $args: '$MAIN.$a' }, [
          'a',
          'b',
        ]),
        true,
      );
      assertEquals(
        assertExpression({ $expr: 'CEIL', $args: '$C.$a' }, [
          'a',
          'b',
          '$C.$a',
        ]),
        true,
      );
      assertEquals(
        assertExpression({ $expr: 'CEIL', $args: '$g' }, [
          'a',
          'b',
          'c',
          'd',
        ]),
        false,
      );
      assertEquals(
        assertExpression({ $expr: 'CEIL', $args: 'a' }, ['a']),
        false,
      );

      assertEquals(assertExpression({ $expr: 'FLOOR', $args: 1 }), true);
      assertEquals(
        assertExpression({ $expr: 'FLOOR', $args: '$a' }),
        true,
      );
      assertEquals(
        assertExpression({ $expr: 'FLOOR', $args: '$a' }, ['a']),
        true,
      );
      assertEquals(
        assertExpression({ $expr: 'FLOOR', $args: '$MAIN.$a' }, [
          'a',
          'b',
        ]),
        true,
      );
      assertEquals(
        assertExpression({ $expr: 'FLOOR', $args: '$C.$a' }, [
          'a',
          'b',
          '$C.$a',
        ]),
        true,
      );
      assertEquals(
        assertExpression({ $expr: 'FLOOR', $args: '$g' }, [
          'a',
          'b',
          'c',
          'd',
        ]),
        false,
      );
      assertEquals(
        assertExpression({ $expr: 'FLOOR', $args: 'a' }, ['a']),
        false,
      );

      assertEquals(
        assertExpression({ $expr: 'LENGTH', $args: 'a' }),
        true,
      );
      assertEquals(
        assertExpression({ $expr: 'LENGTH', $args: '$a' }),
        true,
      );
      assertEquals(
        assertExpression({ $expr: 'LENGTH', $args: '$a' }, ['a']),
        true,
      );
      assertEquals(
        assertExpression({ $expr: 'LENGTH', $args: '$MAIN.$a' }, [
          'a',
          'b',
        ]),
        true,
      );
      assertEquals(
        assertExpression({ $expr: 'LENGTH', $args: '$C.$a' }, [
          'a',
          'b',
          '$C.$a',
        ]),
        true,
      );
      // This is actually a bug, where the column is missing but since input can be string we accept it.
      assertEquals(
        assertExpression({ $expr: 'LENGTH', $args: '$g' }, [
          'a',
          'b',
          'c',
          'd',
        ]),
        true,
      );
      assertEquals(
        assertExpression({ $expr: 'LENGTH', $args: 1 }, ['a']),
        false,
      );

      assertEquals(
        assertExpression({
          $expr: 'DATE_DIFF',
          $args: ['YEAR', { $expr: 'NOW' }, { $expr: 'NOW' }],
        }),
        true,
      );
      assertEquals(
        assertExpression({
          $expr: 'DATE_DIFF',
          $args: ['MONTH', { $expr: 'NOW' }, { $expr: 'NOW' }],
        }),
        true,
      );
      assertEquals(
        assertExpression({
          $expr: 'DATE_DIFF',
          $args: ['DAY', { $expr: 'NOW' }, { $expr: 'NOW' }],
        }),
        true,
      );
      assertEquals(
        assertExpression({
          $expr: 'DATE_DIFF',
          $args: ['HOUR', { $expr: 'NOW' }, { $expr: 'NOW' }],
        }),
        true,
      );
      assertEquals(
        assertExpression({
          $expr: 'DATE_DIFF',
          $args: ['MINUTE', { $expr: 'NOW' }, { $expr: 'NOW' }],
        }),
        true,
      );
      assertEquals(
        assertExpression({
          $expr: 'DATE_DIFF',
          $args: ['SECOND', { $expr: 'NOW' }, { $expr: 'NOW' }],
        }),
        true,
      );
      assertEquals(
        assertExpression({
          $expr: 'DATE_DIFF',
          $args: ['YEAR', { $expr: 'NOW' }, { $expr: 'NOW' }],
        }, ['a']),
        true,
      );
      assertEquals(
        assertExpression({
          $expr: 'DATE_DIFF',
          $args: ['YEAR', { $expr: 'NOW' }, '$a'],
        }, ['a', 'b']),
        true,
      );
      assertEquals(
        assertExpression({
          $expr: 'DATE_DIFF',
          $args: ['YEAR', { $expr: 'NOW' }, '$MAIN.$a'],
        }, ['a']),
        true,
      );
      assertEquals(
        assertExpression({
          $expr: 'DATE_DIFF',
          $args: ['YEAR', { $expr: 'NOW' }, '$C.$a'],
        }, ['a', 'b', '$C.$a']),
        true,
      );
      assertEquals(
        assertExpression({
          $expr: 'DATE_DIFF',
          $args: ['YEAR', new Date(), '$C.$a'],
        }, ['a', 'b', '$C.$a']),
        true,
      );
      assertEquals(
        assertExpression({
          $expr: 'DATE_DIFF',
          $args: ['YEAR', '$C.$a', new Date()],
        }, ['a', 'b', '$C.$a']),
        true,
      );
      assertEquals(
        assertExpression({
          $expr: 'DATE_DIFF',
          $args: ['YEAR', new Date(), new Date()],
        }, ['a', 'b', '$C.$a']),
        true,
      );
      assertEquals(
        assertExpression({
          $expr: 'DATE_DIFF',
          $args: ['YEAR', { $expr: 'NOW' }, '$g'],
        }, ['a', 'b', 'c', 'd']),
        false,
      );
      assertEquals(
        assertExpression({
          $expr: 'DATE_DIFF',
          $args: ['YEAR', { $expr: 'NOW' }, 'a'],
        }, ['a']),
        false,
      );

      assertEquals(
        assertExpression({
          $expr: 'DATE_DIFF',
          $args: ['SECONDF', { $expr: 'NOW' }, { $expr: 'NOW' }],
        }),
        false,
      );
    });

    await t.step('String', () => {
      assertEquals(assertExpression({ $expr: 'UUID' }), true);

      assertEquals(
        assertExpression({ $expr: 'CONCAT', $args: ['a', 'b'] }),
        true,
      );
      assertEquals(
        assertExpression({ $expr: 'CONCAT', $args: ['$a', '$b'] }),
        true,
      );
      assertEquals(
        assertExpression({ $expr: 'CONCAT', $args: ['$a', '$b'] }, [
          'a',
          'b',
          'c',
        ]),
        true,
      );
      assertEquals(
        assertExpression({ $expr: 'CONCAT', $args: ['$a', '$MAIN.$b'] }, [
          'a',
          'b',
          'c',
        ]),
        true,
      );
      assertEquals(
        assertExpression({ $expr: 'CONCAT', $args: ['$a', '$C.$a'] }, [
          'a',
          'b',
          '$C.$a',
        ]),
        true,
      );
      assertEquals(
        assertExpression({ $expr: 'CONCAT', $args: 'sdf' }),
        false,
      );
      assertEquals(
        assertExpression({
          $expr: 'CONCAT',
          $args: ['d', { $expr: 'CONCAT', $args: ['sdf', 'df'] }],
        }),
        false,
      ); // Non string expression
      // This is actually a bug, where the column is missing but since input can be string we accept it.
      assertEquals(
        assertExpression({ $expr: 'CONCAT', $args: ['$d', '$c'] }, [
          'a',
          'b',
          'c',
        ]),
        true,
      );
      assertEquals(
        assertExpression({ $expr: 'CONCAT', $args: ['d', 1] }, [
          'a',
          'b',
          'c',
        ]),
        false,
      ); // Adding number
      assertEquals(
        assertExpression({
          $expr: 'CONCAT',
          $args: ['d', { $expr: 'LENGTH', $args: 'sdf' }],
        }),
        false,
      ); // Non string expression

      assertEquals(
        assertExpression({ $expr: 'LOWER', $args: 'a' }),
        true,
      );
      assertEquals(
        assertExpression({ $expr: 'UPPER', $args: 'a' }),
        true,
      );
      assertEquals(assertExpression({ $expr: 'TRIM', $args: 'a' }), true);

      assertEquals(
        assertExpression({ $expr: 'LOWER', $args: '$a' }),
        true,
      );
      assertEquals(
        assertExpression({ $expr: 'UPPER', $args: '$a' }),
        true,
      );
      assertEquals(
        assertExpression({ $expr: 'TRIM', $args: '$a' }),
        true,
      );

      assertEquals(
        assertExpression({ $expr: 'LOWER', $args: '$a' }, ['a']),
        true,
      );
      assertEquals(
        assertExpression({ $expr: 'UPPER', $args: '$a' }, ['a']),
        true,
      );
      assertEquals(
        assertExpression({ $expr: 'TRIM', $args: '$a' }, ['a']),
        true,
      );

      // This is actually a bug, where the column is missing but since input can be string we accept it.
      assertEquals(
        assertExpression({ $expr: 'LOWER', $args: '$a' }, ['v']),
        true,
      );
      // This is actually a bug, where the column is missing but since input can be string we accept it.
      assertEquals(
        assertExpression({ $expr: 'UPPER', $args: '$a' }, ['v']),
        true,
      );
      // This is actually a bug, where the column is missing but since input can be string we accept it.
      assertEquals(
        assertExpression({ $expr: 'TRIM', $args: '$a' }, ['v']),
        true,
      );

      assertEquals(
        assertExpression({
          $expr: 'REPLACE',
          $args: ['Hello World', 'Hello', 'Ola'],
        }),
        true,
      );
      assertEquals(
        assertExpression({
          $expr: 'REPLACE',
          $args: ['Hello World', '$a', 'Ola'],
        }),
        true,
      );
      assertEquals(
        assertExpression({
          $expr: 'REPLACE',
          $args: ['Hello World', '$a', 'Ola'],
        }, ['a', 'b']),
        true,
      );
      assertEquals(
        assertExpression({
          $expr: 'REPLACE',
          $args: ['Hello World', '$a', '$a'],
        }, ['a', 'b']),
        true,
      );

      assertEquals(
        assertExpression({
          $expr: 'SUBSTRING',
          $args: ['Hello World', 1, 2],
        }, ['a']),
        true,
      );
      assertEquals(
        assertExpression({
          $expr: 'SUBSTRING',
          $args: ['Hello World', '$a', 2],
        }, ['a']),
        true,
      );
      assertEquals(
        assertExpression({
          $expr: 'SUBSTRING',
          $args: ['Hello World', 1, '$a'],
        }, ['a']),
        true,
      );
      // This is actually a bug, where the column is missing but since input can be string we accept it.
      assertEquals(
        assertExpression({
          $expr: 'SUBSTRING',
          $args: ['Hello World', '$a', '$b'],
        }, ['a']),
        false,
      );
    });

    await t.step('JSON', () => {
      assertEquals(
        assertExpression({
          $expr: 'JSON_VALUE',
          $args: ['$a', ['a', 'b', 'c']],
        }),
        true,
      );
      assertEquals(
        assertExpression({
          $expr: 'JSON_VALUE',
          $args: ['$a', ['a', 'b', 'c']],
        }, ['a', 'b', 'c']),
        true,
      );
      assertEquals(
        assertExpression({
          $expr: 'JSON_VALUE',
          $args: ['$MAIN.$a', ['a', 'b', 'c']],
        }, ['a', 'b', 'c']),
        true,
      );
      assertEquals(
        assertExpression({
          $expr: 'JSON_VALUE',
          $args: ['$B.$c', ['a', 'b', 'c']],
        }, ['a', '$B.$c', 'c']),
        true,
      );
      assertEquals(
        assertExpression({
          $expr: 'JSON_VALUE',
          $args: ['a', ['a', 'b', 'c']],
        }, ['a', 'b', 'c']),
        false,
      );
    });
  });

  await t.step('Filter', () => {
    assertEquals(assertBaseOperators('sdf'), true);
    assertEquals(assertBaseOperators(1), true);
    assertEquals(assertBaseOperators(1n), true);
    assertEquals(assertBaseOperators(true), true);
    assertEquals(assertBaseOperators(null), true);
    assertEquals(assertBaseOperators(new Date()), true);
    assertEquals(assertBaseOperators([1, 2, 3]), true);
    assertEquals(assertBaseOperators({ $eq: 1 }), true);
    assertEquals(assertBaseOperators({ $ne: 1 }), true);
    assertEquals(assertBaseOperators({ $null: true }), true);
    assertEquals(assertBaseOperators({ $in: [1, 2, 3] }), true);
    assertEquals(assertBaseOperators({ $nin: [1, 2, 3] }), true);

    assertEquals(assertMathOperators({ $gt: 1 }), true);
    assertEquals(assertMathOperators({ $gte: 1 }), true);
    assertEquals(assertMathOperators({ $lt: 1 }), true);
    assertEquals(assertMathOperators({ $lte: 1 }), true);
    assertEquals(assertMathOperators({ $between: [1, 2] }), true);

    assertEquals(assertMathOperators({ $gt: '$a' }), true);
    assertEquals(assertMathOperators({ $gte: '$a' }), true);
    assertEquals(assertMathOperators({ $lt: '$a' }), true);
    assertEquals(assertMathOperators({ $lte: '$a' }), true);
    assertEquals(assertMathOperators({ $between: ['$a', '$a'] }), true);
    assertEquals(
      assertMathOperators({ $gt: { $expr: 'ADD', $args: [1, 2] } }),
      true,
    );
    assertEquals(
      assertMathOperators({ $gte: { $expr: 'ADD', $args: [1, 2] } }),
      true,
    );
    assertEquals(
      assertMathOperators({ $lt: { $expr: 'ADD', $args: [1, 2] } }),
      true,
    );
    assertEquals(
      assertMathOperators({ $lte: { $expr: 'ADD', $args: [1, 2] } }),
      true,
    );
    assertEquals(
      assertMathOperators({
        $between: [{ $expr: 'ADD', $args: [1, 2] }, {
          $expr: 'ADD',
          $args: [1, 2],
        }],
      }),
      true,
    );

    assertEquals(assertMathOperators({ $gt: 1n }), true);
    assertEquals(assertMathOperators({ $gte: 1n }), true);
    assertEquals(assertMathOperators({ $lt: 1n }), true);
    assertEquals(assertMathOperators({ $lte: 1n }), true);
    assertEquals(assertMathOperators({ $between: [1n, 2n] }), true);

    assertEquals(assertMathOperators({ $gt: new Date() }), true);
    assertEquals(assertMathOperators({ $gte: new Date() }), true);
    assertEquals(assertMathOperators({ $lt: new Date() }), true);
    assertEquals(assertMathOperators({ $lte: new Date() }), true);
    assertEquals(
      assertMathOperators({ $between: [new Date(), new Date()] }),
      true,
    );
    assertEquals(
      assertMathOperators({ $between: [{ $expr: 'NOW' }, { $expr: 'NOW' }] }),
      true,
    );

    assertEquals(assertMathOperators({ $gt: 'sdf' }), false);
    assertEquals(assertMathOperators({ $gte: 'sdf' }), false);
    assertEquals(assertMathOperators({ $lt: 'sdf' }), false);
    assertEquals(assertMathOperators({ $lte: 'sdf' }), false);
    assertEquals(assertMathOperators({ $between: ['sdf', 'sdf'] }), false);

    assertEquals(assertStringOperators({ $like: 'sdf' }), true);
    assertEquals(assertStringOperators({ $nlike: 'sdf' }), true);
    assertEquals(assertStringOperators({ $ilike: 'sdf' }), true);
    assertEquals(assertStringOperators({ $nilike: 'sdf' }), true);
    assertEquals(assertStringOperators({ $contains: 'sdf' }), true);
    assertEquals(assertStringOperators({ $ncontains: 'sdf' }), true);
    assertEquals(assertStringOperators({ $startsWith: 'sdf' }), true);
    assertEquals(assertStringOperators({ $nstartsWith: 'sdf' }), true);
    assertEquals(assertStringOperators({ $endsWith: 'sdf' }), true);
    assertEquals(assertStringOperators({ $nendsWith: 'sdf' }), true);

    assertEquals(
      assertStringOperators({ $like: '$sdf' }, ['dsf', 'sdf']),
      true,
    );
    assertEquals(
      assertStringOperators({ $nlike: '$sdf' }, ['dsf', 'sdf']),
      true,
    );
    assertEquals(
      assertStringOperators({ $ilike: '$sdf' }, ['dsf', 'sdf']),
      true,
    );
    assertEquals(
      assertStringOperators({ $nilike: '$sdf' }, ['dsf', 'sdf']),
      true,
    );
    assertEquals(
      assertStringOperators({ $contains: '$sdf' }, ['dsf', 'sdf']),
      true,
    );
    assertEquals(
      assertStringOperators({ $ncontains: '$sdf' }, ['dsf', 'sdf']),
      true,
    );
    assertEquals(
      assertStringOperators({ $startsWith: '$sdf' }, ['dsf', 'sdf']),
      true,
    );
    assertEquals(
      assertStringOperators({ $nstartsWith: '$sdf' }, ['dsf', 'sdf']),
      true,
    );
    assertEquals(
      assertStringOperators({ $endsWith: '$sdf' }, ['dsf', 'sdf']),
      true,
    );
    assertEquals(
      assertStringOperators({ $nendsWith: '$sdf' }, ['dsf', 'sdf']),
      true,
    );

    assertEquals(
      assertStringOperators({
        $like: { $expr: 'CONCAT', $args: ['$sdf', 'd'] },
      }, ['dsf', 'sdf']),
      true,
    );
    assertEquals(
      assertStringOperators({
        $nlike: { $expr: 'CONCAT', $args: ['$sdf', 'd'] },
      }, ['dsf', 'sdf']),
      true,
    );
    assertEquals(
      assertStringOperators({
        $ilike: { $expr: 'CONCAT', $args: ['$sdf', 'd'] },
      }, ['dsf', 'sdf']),
      true,
    );
    assertEquals(
      assertStringOperators({
        $nilike: { $expr: 'CONCAT', $args: ['$sdf', 'd'] },
      }, ['dsf', 'sdf']),
      true,
    );
    assertEquals(
      assertStringOperators({
        $contains: { $expr: 'CONCAT', $args: ['$sdf', 'd'] },
      }, ['dsf', 'sdf']),
      true,
    );
    assertEquals(
      assertStringOperators({
        $ncontains: { $expr: 'CONCAT', $args: ['$sdf', 'd'] },
      }, ['dsf', 'sdf']),
      true,
    );
    assertEquals(
      assertStringOperators({
        $startsWith: { $expr: 'CONCAT', $args: ['$sdf', 'd'] },
      }, ['dsf', 'sdf']),
      true,
    );
    assertEquals(
      assertStringOperators({
        $nstartsWith: { $expr: 'CONCAT', $args: ['$sdf', 'd'] },
      }, ['dsf', 'sdf']),
      true,
    );
    assertEquals(
      assertStringOperators({
        $endsWith: { $expr: 'CONCAT', $args: ['$sdf', 'd'] },
      }, ['dsf', 'sdf']),
      true,
    );
    assertEquals(
      assertStringOperators({
        $nendsWith: { $expr: 'CONCAT', $args: ['$sdf', 'd'] },
      }, ['dsf', 'sdf']),
      true,
    );

    // These are actually a bug, where the column is missing but since input can be string we accept it.
    assertEquals(
      assertStringOperators({ $like: '$sdfd' }, ['dsf', 'sdf']),
      true,
    );
    assertEquals(
      assertStringOperators({ $nlike: '$sdfd' }, ['dsf', 'sdf']),
      true,
    );
    assertEquals(
      assertStringOperators({ $ilike: '$sdfd' }, ['dsf', 'sdf']),
      true,
    );
    assertEquals(
      assertStringOperators({ $nilike: '$sdfd' }, ['dsf', 'sdf']),
      true,
    );
    assertEquals(
      assertStringOperators({ $contains: '$sdfd' }, ['dsf', 'sdf']),
      true,
    );
    assertEquals(
      assertStringOperators({ $ncontains: '$sdfd' }, ['dsf', 'sdf']),
      true,
    );
    assertEquals(
      assertStringOperators({ $startsWith: '$sdfd' }, ['dsf', 'sdf']),
      true,
    );
    assertEquals(
      assertStringOperators({ $nstartsWith: '$sdfd' }, ['dsf', 'sdf']),
      true,
    );
    assertEquals(
      assertStringOperators({ $endsWith: '$sdfd' }, ['dsf', 'sdf']),
      true,
    );
    assertEquals(
      assertStringOperators({ $nendsWith: '$sdfd' }, ['dsf', 'sdf']),
      true,
    );

    assertEquals(
      assertQueryFilters({ $and: [{ _id: { $eq: 1 } }, { _id: { $ne: 2 } }] }),
      true,
    );
    assertEquals(
      assertQueryFilters({ $or: [{ _id: { $eq: 1 } }, { _id: { $ne: 2 } }] }),
      true,
    );
    assertEquals(
      assertQueryFilters({
        $and: [{ _id: { $eq: 1 } }, { _id: { $ne: 2 } }],
        $or: [{ _id: { $eq: 1 } }, { _id: { $ne: 2 } }],
      }),
      true,
    );
    assertEquals(
      assertQueryFilters({
        name: 'asdf',
        email: { $in: ['test@email.com', 'sdf@gmail.com'] },
        $and: [{ _id: { $eq: 1 } }, { _id: { $ne: 2 } }],
        $or: [{ _id: { $eq: 1 } }, { _id: { $ne: 2 } }],
      }),
      true,
    );
    assertEquals(
      assertQueryFilters({ $or: { name: { $eq: 'some' }, lastName: 'thing' } }),
      true,
    );
    assertEquals(
      assertQueryFilters({
        $and: { name: { $eq: 'some' }, lastName: 'thing' },
      }),
      true,
    );
  });

  await t.step('Builder', async (s) => {
    await s.step('Insert', () => {
      assertEquals(
        assertInsertQueryBuilder({
          type: 'INSERT',
          source: 'table',
          schema: 'schema',
          columns: ['col1', 'col2', 'col3'],
          values: [
            { col1: 1, col2: '2', col3: true },
            { col1: 2, col2: '3' },
          ],
          expressions: {
            col4: {
              $expr: 'CONCAT',
              $args: ['col2', 'col3'],
            },
          },
        }),
        true,
      );

      assertEquals(
        assertInsertQueryBuilder({
          type: 'INSERT',
          source: 'table',
          schema: 'schema',
          columns: ['col1', 'col2', 'col3'],
          values: [
            { col1: 1, col2: '2' },
            { col1: 2, col2: '3' },
          ],
        }),
        true,
      );

      // Values missing
      assertEquals(
        assertInsertQueryBuilder({
          type: 'INSERT',
          source: 'table',
          schema: 'schema',
          columns: ['col1', 'col2', 'col3'],
        }),
        false,
      );

      // Value not an array
      assertEquals(
        assertInsertQueryBuilder({
          type: 'INSERT',
          source: 'table',
          schema: 'schema',
          columns: ['col1', 'col2', 'col3'],
          values: { col1: 1, col2: '2', col3: true },
        }),
        false,
      );

      // Undefined column in values
      assertEquals(
        assertInsertQueryBuilder({
          type: 'INSERT',
          source: 'table',
          schema: 'schema',
          columns: ['col1', 'col2', 'col3'],
          values: [
            { col1: 1, col2: '2', col3: true },
            { col1: 2, col34: '3' },
          ],
        }),
        false,
      );

      // Inserting value belonging to expression
      assertEquals(
        assertInsertQueryBuilder({
          type: 'INSERT',
          source: 'table',
          schema: 'schema',
          columns: ['col1', 'col2', 'col3'],
          expressions: {
            col4: {
              $expr: 'CONCAT',
              $args: ['col2', 'col3'],
            },
          },
          values: [
            { col1: 1, col4: '2', col3: true },
            { col1: 2, col3: '3' },
          ],
        }),
        false,
      );

      // Missing table
      assertEquals(
        assertInsertQueryBuilder({
          type: 'INSERT',
          schema: 'schema',
          columns: ['col1', 'col2', 'col3'],
          values: [
            { col1: 1, col2: '2', col3: true },
            { col1: 2, col2: '3' },
          ],
        }),
        false,
      );

      // Columns missing
      assertEquals(
        assertInsertQueryBuilder({
          type: 'INSERT',
          source: 'table',
          values: [
            { col1: 1, col2: '2', col3: true },
            { col1: 2, col2: '3' },
          ],
        }),
        false,
      );

      // Wrong type
      assertEquals(
        assertInsertQueryBuilder({
          type: 'INSERTER',
          table: 'table',
          columns: ['col1', 'col2', 'col3'],
          values: [
            { col1: 1, col2: '2', col3: true },
            { col1: 2, col2: '3' },
          ],
        }),
        false,
      );

      // Expression column duplicate of column
      assertEquals(
        assertInsertQueryBuilder({
          type: 'INSERT',
          source: 'table',
          columns: ['col1', 'col2', 'col3'],
          values: [
            { col1: 1, col2: '2', col3: true },
            { col1: 2, col2: '3' },
          ],
          expressions: {
            col1: {
              $expr: 'CONCAT',
              $args: ['col2', 'col3'],
            },
          },
        }),
        false,
      );

      // Invalid expression
      assertEquals(
        assertInsertQueryBuilder({
          type: 'INSERT',
          source: 'table',
          columns: ['col1', 'col2', 'col3'],
          values: [
            { col1: 1, col2: '2', col3: true },
            { col1: 2, col2: '3' },
          ],
          expressions: {
            col1: {
              $expr: 'SOME',
              $args: ['col2', 'col3'],
            },
          },
        }),
        false,
      );
    });

    await s.step('Update', () => {
      assertEquals(
        assertUpdateQueryBuilder({
          type: 'UPDATE',
          source: 'table',
          schema: 'schema',
          columns: ['col1', 'col2', 'col3'],
          values: { col1: 2, col3: '3' },
          expressions: {
            col4: {
              $expr: 'CONCAT',
              $args: ['col2', 'col3'],
            },
          },
        }),
        true,
      );

      assertEquals(
        assertUpdateQueryBuilder({
          type: 'UPDATE',
          source: 'table',
          schema: 'schema',
          columns: ['col1', 'col2', 'col3'],
          values: { col1: 2, col3: '3' },
          expressions: {
            col4: {
              $expr: 'CONCAT',
              $args: ['col2', 'col3'],
            },
          },
          where: {
            col1: { $eq: 1 },
            col4: { $eq: '23' },
          },
        }),
        true,
      );

      assertEquals(
        assertUpdateQueryBuilder({
          type: 'UPDATE',
          source: 'table',
          schema: 'schema',
          columns: ['col1', 'col2', 'col3'],
          values: { col1: 2, col3: '3' },
          where: {
            col1: { $eq: 1 },
          },
        }),
        true,
      );

      // Values missing
      assertEquals(
        assertUpdateQueryBuilder({
          type: 'UPDATE',
          source: 'table',
          schema: 'schema',
          columns: ['col1', 'col2', 'col3'],
        }),
        false,
      );

      // Values as an array
      assertEquals(
        assertUpdateQueryBuilder({
          type: 'UPDATE',
          source: 'table',
          schema: 'schema',
          columns: ['col1', 'col2', 'col3'],
          values: [{ col1: 'sdf' }],
        }),
        false,
      );

      // Undefined column in values
      assertEquals(
        assertUpdateQueryBuilder({
          type: 'UPDATE',
          source: 'table',
          schema: 'schema',
          columns: ['col1', 'col2', 'col3'],
          values: { col134: 2, col3: '3' },
        }),
        false,
      );

      // Updating value belonging to expression
      assertEquals(
        assertUpdateQueryBuilder({
          type: 'UPDATE',
          source: 'table',
          schema: 'schema',
          columns: ['col1', 'col2', 'col3'],
          expressions: {
            col4: {
              $expr: 'CONCAT',
              $args: ['col2', 'col3'],
            },
          },
          values: { col4: 2, col3: '3' },
        }),
        false,
      );

      // Missing table
      assertEquals(
        assertUpdateQueryBuilder({
          type: 'UPDATE',
          schema: 'schema',
          columns: ['col1', 'col2', 'col3'],
          values: { col1: 2, col3: '3' },
        }),
        false,
      );

      // Columns missing
      assertEquals(
        assertUpdateQueryBuilder({
          type: 'UPDATE',
          source: 'table',
          values: { col1: 2, col3: '3' },
        }),
        false,
      );

      // Wrong type
      assertEquals(
        assertUpdateQueryBuilder({
          type: 'UPDATER',
          table: 'table',
          columns: ['col1', 'col2', 'col3'],
          values: { col1: 2, col3: '3' },
        }),
        false,
      );

      // Expression column duplicate of column
      assertEquals(
        assertUpdateQueryBuilder({
          type: 'UPDATE',
          source: 'table',
          columns: ['col1', 'col2', 'col3'],
          values: { col1: 2, col3: '3' },
          expressions: {
            col1: {
              $expr: 'CONCAT',
              $args: ['col2', 'col3'],
            },
          },
        }),
        false,
      );

      // Invalid expression
      assertEquals(
        assertUpdateQueryBuilder({
          type: 'UPDATE',
          source: 'table',
          columns: ['col1', 'col2', 'col3'],
          values: { col1: 2, col3: '3' },
          expressions: {
            col1: {
              $expr: 'SOME',
              $args: ['col2', 'col3'],
            },
          },
        }),
        false,
      );
    });

    await s.step('Delete', () => {
      assertEquals(
        assertDeleteQueryBuilder({
          type: 'DELETE',
          source: 'table',
          schema: 'schema',
          columns: ['col1', 'col2', 'col3'],
          expressions: {
            col4: {
              $expr: 'CONCAT',
              $args: ['col2', 'col3'],
            },
          },
        }),
        true,
      );

      assertEquals(
        assertDeleteQueryBuilder({
          type: 'DELETE',
          source: 'table',
          schema: 'schema',
          columns: ['col1', 'col2', 'col3'],
          expressions: {
            col4: {
              $expr: 'CONCAT',
              $args: ['col2', 'col3'],
            },
          },
          where: {
            col1: { $eq: 1 },
            col4: { $eq: '23' },
          },
        }),
        true,
      );

      assertEquals(
        assertDeleteQueryBuilder({
          type: 'DELETE',
          source: 'table',
          schema: 'schema',
          columns: ['col1', 'col2', 'col3'],
          where: {
            col1: { $eq: 1 },
          },
        }),
        true,
      );

      // Missing table
      assertEquals(
        assertDeleteQueryBuilder({
          type: 'DELETE',
          schema: 'schema',
          columns: ['col1', 'col2', 'col3'],
        }),
        false,
      );

      // Columns missing
      assertEquals(
        assertDeleteQueryBuilder({
          type: 'DELETE',
          source: 'table',
        }),
        false,
      );

      // Wrong type
      assertEquals(
        assertDeleteQueryBuilder({
          type: 'DELETER',
          table: 'table',
          columns: ['col1', 'col2', 'col3'],
        }),
        false,
      );

      // Expression column duplicate of column
      assertEquals(
        assertDeleteQueryBuilder({
          type: 'DELETE',
          source: 'table',
          columns: ['col1', 'col2', 'col3'],
          expressions: {
            col1: {
              $expr: 'CONCAT',
              $args: ['col2', 'col3'],
            },
          },
        }),
        false,
      );

      // Invalid expression
      assertEquals(
        assertDeleteQueryBuilder({
          type: 'DELETE',
          source: 'table',
          columns: ['col1', 'col2', 'col3'],
          expressions: {
            col1: {
              $expr: 'SOME',
              $args: ['col2', 'col3'],
            },
          },
        }),
        false,
      );
    });
  });
});
