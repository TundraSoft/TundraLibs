import { asserts } from '../../../dev.dependencies.ts';
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
    asserts.assertEquals(assertColumnIdentifier('$a'), true);
    asserts.assertEquals(assertColumnIdentifier('a'), false);
    asserts.assertEquals(assertColumnIdentifier('$v', ['a', 'b', 'c']), false);
    asserts.assertEquals(assertColumnIdentifier('$a', ['a', 'b', 'c']), true);
    asserts.assertEquals(
      assertColumnIdentifier('$MAIN.$a', ['a', 'b', 'c']),
      true,
    );
    asserts.assertEquals(
      assertColumnIdentifier('$SUB.$a', ['a', 'b', 'c', 'SUB.$a']),
      true,
    );
    asserts.assertEquals(
      assertColumnIdentifier('$SUB.$a', ['a', 'b', 'c']),
      false,
    );
  });

  await t.step('Aggregates', () => {
    asserts.assertEquals(assertAggregates({ $aggr: 'SUM', $args: '$a' }), true);
    asserts.assertEquals(
      assertAggregates({ $aggr: 'SUM', $args: 'adf' }),
      false,
    );
    asserts.assertEquals(
      assertAggregates({
        $aggr: 'SUM',
        $args: { $expr: 'ADD', $args: [1, 2, '$a'] },
      }, ['a']),
      true,
    );
    asserts.assertEquals(
      assertAggregates({ $aggr: 'SUM', $args: { $expr: 'TODAY' } }, ['a']),
      false,
    );

    asserts.assertEquals(assertAggregates({ $aggr: 'AVG', $args: '$a' }), true);
    asserts.assertEquals(
      assertAggregates({ $aggr: 'AVG', $args: 'adf' }),
      false,
    );
    asserts.assertEquals(
      assertAggregates({
        $aggr: 'AVG',
        $args: { $expr: 'ADD', $args: [1, 2, '$a'] },
      }, ['a']),
      true,
    );
    asserts.assertEquals(
      assertAggregates({ $aggr: 'AVG', $args: { $expr: 'TODAY' } }, ['a']),
      false,
    );

    asserts.assertEquals(assertAggregates({ $aggr: 'MIN', $args: '$a' }), true);
    asserts.assertEquals(assertAggregates({ $aggr: 'MAX', $args: '$a' }), true);
    asserts.assertEquals(
      assertAggregates({ $aggr: 'DISTINCT', $args: ['$a'] }),
      true,
    );
    asserts.assertEquals(
      assertAggregates({ $aggr: 'COUNT', $args: '$a' }),
      true,
    );
    asserts.assertEquals(
      assertAggregates({ $aggr: 'COUNT', $args: '*' }),
      true,
    );
    asserts.assertEquals(
      assertAggregates({
        $aggr: 'COUNT',
        $args: { $aggr: 'DISTINCT', $args: ['$a'] },
      }),
      true,
    );

    asserts.assertEquals(
      assertAggregates({
        $aggr: 'COUNT',
        $args: { $aggr: 'SUM', $args: ['$a'] },
      }),
      false,
    );

    asserts.assertEquals(
      assertAggregates({ $aggr: 'JSON_ROW', $args: ['$a', '$b', '$c'] }),
      true,
    );
    asserts.assertEquals(
      assertAggregates({ $aggr: 'JSON_ROW', $args: ['$a', '$b', '$c'] }, [
        'a',
        'b',
        'c',
      ]),
      true,
    );
    asserts.assertEquals(
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
      asserts.assertEquals(assertExpression({ $expr: 'NOW' }), true);
      asserts.assertEquals(assertExpression({ $expr: 'CURRENT_DATE' }), true);
      asserts.assertEquals(assertExpression({ $expr: 'CURRENT_TIME' }), true);
      asserts.assertEquals(
        assertExpression({ $expr: 'CURRENT_TIMESTAMP' }),
        true,
      );
      //#region DATE_ADD
      asserts.assertEquals(
        assertExpression({
          $expr: 'DATE_ADD',
          $args: ['YEAR', { $expr: 'NOW' }, 1],
        }),
        true,
      );
      asserts.assertEquals(
        assertExpression({
          $expr: 'DATE_ADD',
          $args: ['MONTH', { $expr: 'NOW' }, 1],
        }),
        true,
      );
      asserts.assertEquals(
        assertExpression({
          $expr: 'DATE_ADD',
          $args: ['DAY', { $expr: 'NOW' }, 1],
        }),
        true,
      );
      asserts.assertEquals(
        assertExpression({
          $expr: 'DATE_ADD',
          $args: ['HOUR', { $expr: 'NOW' }, 1],
        }),
        true,
      );
      asserts.assertEquals(
        assertExpression({
          $expr: 'DATE_ADD',
          $args: ['MINUTE', { $expr: 'NOW' }, 1],
        }),
        true,
      );
      asserts.assertEquals(
        assertExpression({
          $expr: 'DATE_ADD',
          $args: ['SECOND', { $expr: 'NOW' }, 1],
        }),
        true,
      );

      asserts.assertEquals(
        assertExpression({
          $expr: 'DATE_ADD',
          $args: ['YEAR', { $expr: 'NOW' }, '1'],
        }),
        false,
      );
      asserts.assertEquals(
        assertExpression({
          $expr: 'DATE_ADD',
          $args: ['YEARD', { $expr: 'NOW' }, 1],
        }, ['a']),
        false,
      );
      asserts.assertEquals(
        assertExpression({
          $expr: 'DATE_ADD',
          $args: ['YEAR', { $expr: 'NOW' }, 1],
        }, ['a']),
        true,
      );
      asserts.assertEquals(
        assertExpression({
          $expr: 'DATE_ADD',
          $args: ['YEAR', { $expr: 'NOW' }, '$a'],
        }, ['a']),
        true,
      );
      asserts.assertEquals(
        assertExpression({
          $expr: 'DATE_ADD',
          $args: ['YEAR', new Date(), '$a'],
        }, ['a']),
        true,
      );

      asserts.assertEquals(
        assertExpression({
          $expr: 'DATE_ADD',
          $args: ['YEAR', '$a', 1],
        }, ['a']),
        true,
      );
      //#endregion DATE_ADD
    });

    await t.step('Number', () => {
      asserts.assertEquals(
        assertExpression({ $expr: 'ADD', $args: [1, 2] }),
        true,
      );
      asserts.assertEquals(
        assertExpression({ $expr: 'ADD', $args: ['$a', '$b'] }),
        true,
      );
      asserts.assertEquals(
        assertExpression({ $expr: 'ADD', $args: ['$a', '$b'] }, [
          'a',
          'b',
          'c',
        ]),
        true,
      );
      asserts.assertEquals(
        assertExpression({ $expr: 'ADD', $args: ['$a', '$MAIN.$b'] }, [
          'a',
          'b',
          'c',
        ]),
        true,
      );
      asserts.assertEquals(
        assertExpression({ $expr: 'ADD', $args: ['$a', '$C.$a'] }, [
          'a',
          'b',
          '$C.$a',
        ]),
        true,
      );
      asserts.assertEquals(
        assertExpression({ $expr: 'ADD', $args: ['$d', '$c'] }, [
          'a',
          'b',
          'c',
        ]),
        false,
      );
      asserts.assertEquals(
        assertExpression({ $expr: 'ADD', $args: ['d', 'c'] }, [
          'a',
          'b',
          'c',
        ]),
        false,
      );

      asserts.assertEquals(
        assertExpression({ $expr: 'SUB', $args: [1, 2] }),
        true,
      );
      asserts.assertEquals(
        assertExpression({ $expr: 'SUB', $args: ['$a', '$b'] }),
        true,
      );
      asserts.assertEquals(
        assertExpression({ $expr: 'SUB', $args: ['$a', '$b'] }, [
          'a',
          'b',
          'c',
        ]),
        true,
      );
      asserts.assertEquals(
        assertExpression({ $expr: 'SUB', $args: ['$a', '$MAIN.$b'] }, [
          'a',
          'b',
          'c',
        ]),
        true,
      );
      asserts.assertEquals(
        assertExpression({ $expr: 'SUB', $args: ['$a', '$C.$a'] }, [
          'a',
          'b',
          '$C.$a',
        ]),
        true,
      );
      asserts.assertEquals(
        assertExpression({ $expr: 'SUB', $args: ['$d', '$c'] }, [
          'a',
          'b',
          'c',
        ]),
        false,
      );
      asserts.assertEquals(
        assertExpression({ $expr: 'SUB', $args: ['d', 'c'] }, [
          'a',
          'b',
          'c',
        ]),
        false,
      );

      asserts.assertEquals(
        assertExpression({ $expr: 'MUL', $args: [1, 2] }),
        true,
      );
      asserts.assertEquals(
        assertExpression({ $expr: 'MUL', $args: ['$a', '$b'] }),
        true,
      );
      asserts.assertEquals(
        assertExpression({ $expr: 'MUL', $args: ['$a', '$b'] }, [
          'a',
          'b',
          'c',
        ]),
        true,
      );
      asserts.assertEquals(
        assertExpression({ $expr: 'MUL', $args: ['$a', '$MAIN.$b'] }, [
          'a',
          'b',
          'c',
        ]),
        true,
      );
      asserts.assertEquals(
        assertExpression({ $expr: 'MUL', $args: ['$a', '$C.$a'] }, [
          'a',
          'b',
          '$C.$a',
        ]),
        true,
      );
      asserts.assertEquals(
        assertExpression({ $expr: 'MUL', $args: ['$d', '$c'] }, [
          'a',
          'b',
          'c',
        ]),
        false,
      );
      asserts.assertEquals(
        assertExpression({ $expr: 'MUL', $args: ['d', 'c'] }, [
          'a',
          'b',
          'c',
        ]),
        false,
      );

      asserts.assertEquals(
        assertExpression({ $expr: 'DIV', $args: [1, 2] }),
        true,
      );
      asserts.assertEquals(
        assertExpression({ $expr: 'DIV', $args: ['$a', '$b'] }),
        true,
      );
      asserts.assertEquals(
        assertExpression({ $expr: 'DIV', $args: ['$a', '$b'] }, [
          'a',
          'b',
          'c',
        ]),
        true,
      );
      asserts.assertEquals(
        assertExpression({ $expr: 'DIV', $args: ['$a', '$MAIN.$b'] }, [
          'a',
          'b',
          'c',
        ]),
        true,
      );
      asserts.assertEquals(
        assertExpression({ $expr: 'DIV', $args: ['$a', '$C.$a'] }, [
          'a',
          'b',
          '$C.$a',
        ]),
        true,
      );
      asserts.assertEquals(
        assertExpression({ $expr: 'DIV', $args: ['$d', '$c'] }, [
          'a',
          'b',
          'c',
        ]),
        false,
      );
      asserts.assertEquals(
        assertExpression({ $expr: 'DIV', $args: ['d', 'c'] }, [
          'a',
          'b',
          'c',
        ]),
        false,
      );

      asserts.assertEquals(
        assertExpression({ $expr: 'MOD', $args: [1, 2] }),
        true,
      );
      asserts.assertEquals(
        assertExpression({ $expr: 'MOD', $args: ['$a', '$b'] }),
        true,
      );
      asserts.assertEquals(
        assertExpression({ $expr: 'MOD', $args: ['$a', '$b'] }, [
          'a',
          'b',
          'c',
        ]),
        true,
      );
      asserts.assertEquals(
        assertExpression({ $expr: 'MOD', $args: ['$a', '$MAIN.$b'] }, [
          'a',
          'b',
          'c',
        ]),
        true,
      );
      asserts.assertEquals(
        assertExpression({ $expr: 'MOD', $args: ['$a', '$C.$a'] }, [
          'a',
          'b',
          '$C.$a',
        ]),
        true,
      );
      asserts.assertEquals(
        assertExpression({ $expr: 'MOD', $args: ['$d', '$c'] }, [
          'a',
          'b',
          'c',
        ]),
        false,
      );
      asserts.assertEquals(
        assertExpression({ $expr: 'MOD', $args: ['d', 'c'] }, [
          'a',
          'b',
          'c',
        ]),
        false,
      );

      asserts.assertEquals(assertExpression({ $expr: 'ABS', $args: 1 }), true);
      asserts.assertEquals(
        assertExpression({ $expr: 'ABS', $args: '$a' }),
        true,
      );
      asserts.assertEquals(
        assertExpression({ $expr: 'ABS', $args: '$a' }, ['a']),
        true,
      );
      asserts.assertEquals(
        assertExpression({ $expr: 'ABS', $args: '$MAIN.$a' }, ['a', 'b']),
        true,
      );
      asserts.assertEquals(
        assertExpression({ $expr: 'ABS', $args: '$C.$a' }, [
          'a',
          'b',
          '$C.$a',
        ]),
        true,
      );
      asserts.assertEquals(
        assertExpression({ $expr: 'ABS', $args: '$g' }, [
          'a',
          'b',
          'c',
          'd',
        ]),
        false,
      );
      asserts.assertEquals(
        assertExpression({ $expr: 'ABS', $args: 'a' }, ['a']),
        false,
      );

      asserts.assertEquals(assertExpression({ $expr: 'CEIL', $args: 1 }), true);
      asserts.assertEquals(
        assertExpression({ $expr: 'CEIL', $args: '$a' }),
        true,
      );
      asserts.assertEquals(
        assertExpression({ $expr: 'CEIL', $args: '$a' }, ['a']),
        true,
      );
      asserts.assertEquals(
        assertExpression({ $expr: 'CEIL', $args: '$MAIN.$a' }, [
          'a',
          'b',
        ]),
        true,
      );
      asserts.assertEquals(
        assertExpression({ $expr: 'CEIL', $args: '$C.$a' }, [
          'a',
          'b',
          '$C.$a',
        ]),
        true,
      );
      asserts.assertEquals(
        assertExpression({ $expr: 'CEIL', $args: '$g' }, [
          'a',
          'b',
          'c',
          'd',
        ]),
        false,
      );
      asserts.assertEquals(
        assertExpression({ $expr: 'CEIL', $args: 'a' }, ['a']),
        false,
      );

      asserts.assertEquals(
        assertExpression({ $expr: 'FLOOR', $args: 1 }),
        true,
      );
      asserts.assertEquals(
        assertExpression({ $expr: 'FLOOR', $args: '$a' }),
        true,
      );
      asserts.assertEquals(
        assertExpression({ $expr: 'FLOOR', $args: '$a' }, ['a']),
        true,
      );
      asserts.assertEquals(
        assertExpression({ $expr: 'FLOOR', $args: '$MAIN.$a' }, [
          'a',
          'b',
        ]),
        true,
      );
      asserts.assertEquals(
        assertExpression({ $expr: 'FLOOR', $args: '$C.$a' }, [
          'a',
          'b',
          '$C.$a',
        ]),
        true,
      );
      asserts.assertEquals(
        assertExpression({ $expr: 'FLOOR', $args: '$g' }, [
          'a',
          'b',
          'c',
          'd',
        ]),
        false,
      );
      asserts.assertEquals(
        assertExpression({ $expr: 'FLOOR', $args: 'a' }, ['a']),
        false,
      );

      asserts.assertEquals(
        assertExpression({ $expr: 'ROUND', $args: 1 }),
        true,
      );
      asserts.assertEquals(
        assertExpression({ $expr: 'ROUND', $args: '$a' }),
        true,
      );
      asserts.assertEquals(
        assertExpression({ $expr: 'ROUND', $args: '$a' }, ['a']),
        true,
      );
      asserts.assertEquals(
        assertExpression({ $expr: 'ROUND', $args: '$MAIN.$a' }, [
          'a',
          'b',
        ]),
        true,
      );
      asserts.assertEquals(
        assertExpression({ $expr: 'ROUND', $args: '$C.$a' }, [
          'a',
          'b',
          '$C.$a',
        ]),
        true,
      );
      asserts.assertEquals(
        assertExpression({ $expr: 'ROUND', $args: '$g' }, [
          'a',
          'b',
          'c',
          'd',
        ]),
        false,
      );
      asserts.assertEquals(
        assertExpression({ $expr: 'ROUND', $args: 'a' }, ['a']),
        false,
      );

      asserts.assertEquals(
        assertExpression({ $expr: 'LENGTH', $args: 'a' }),
        true,
      );
      asserts.assertEquals(
        assertExpression({ $expr: 'LENGTH', $args: '$a' }),
        true,
      );
      asserts.assertEquals(
        assertExpression({ $expr: 'LENGTH', $args: '$a' }, ['a']),
        true,
      );
      asserts.assertEquals(
        assertExpression({ $expr: 'LENGTH', $args: '$MAIN.$a' }, [
          'a',
          'b',
        ]),
        true,
      );
      asserts.assertEquals(
        assertExpression({ $expr: 'LENGTH', $args: '$C.$a' }, [
          'a',
          'b',
          '$C.$a',
        ]),
        true,
      );
      // This is actually a bug, where the column is missing but since input can be string we accept it.
      asserts.assertEquals(
        assertExpression({ $expr: 'LENGTH', $args: '$g' }, [
          'a',
          'b',
          'c',
          'd',
        ]),
        true,
      );
      asserts.assertEquals(
        assertExpression({ $expr: 'LENGTH', $args: 1 }, ['a']),
        false,
      );

      asserts.assertEquals(
        assertExpression({
          $expr: 'DATE_DIFF',
          $args: ['YEAR', { $expr: 'NOW' }, { $expr: 'NOW' }],
        }),
        true,
      );
      asserts.assertEquals(
        assertExpression({
          $expr: 'DATE_DIFF',
          $args: ['MONTH', { $expr: 'NOW' }, { $expr: 'NOW' }],
        }),
        true,
      );
      asserts.assertEquals(
        assertExpression({
          $expr: 'DATE_DIFF',
          $args: ['DAY', { $expr: 'NOW' }, { $expr: 'NOW' }],
        }),
        true,
      );
      asserts.assertEquals(
        assertExpression({
          $expr: 'DATE_DIFF',
          $args: ['HOUR', { $expr: 'NOW' }, { $expr: 'NOW' }],
        }),
        true,
      );
      asserts.assertEquals(
        assertExpression({
          $expr: 'DATE_DIFF',
          $args: ['MINUTE', { $expr: 'NOW' }, { $expr: 'NOW' }],
        }),
        true,
      );
      asserts.assertEquals(
        assertExpression({
          $expr: 'DATE_DIFF',
          $args: ['SECOND', { $expr: 'NOW' }, { $expr: 'NOW' }],
        }),
        true,
      );
      asserts.assertEquals(
        assertExpression({
          $expr: 'DATE_DIFF',
          $args: ['YEAR', { $expr: 'NOW' }, { $expr: 'NOW' }],
        }, ['a']),
        true,
      );
      asserts.assertEquals(
        assertExpression({
          $expr: 'DATE_DIFF',
          $args: ['YEAR', { $expr: 'NOW' }, '$a'],
        }, ['a', 'b']),
        true,
      );
      asserts.assertEquals(
        assertExpression({
          $expr: 'DATE_DIFF',
          $args: ['YEAR', { $expr: 'NOW' }, '$MAIN.$a'],
        }, ['a']),
        true,
      );
      asserts.assertEquals(
        assertExpression({
          $expr: 'DATE_DIFF',
          $args: ['YEAR', { $expr: 'NOW' }, '$C.$a'],
        }, ['a', 'b', '$C.$a']),
        true,
      );
      asserts.assertEquals(
        assertExpression({
          $expr: 'DATE_DIFF',
          $args: ['YEAR', new Date(), '$C.$a'],
        }, ['a', 'b', '$C.$a']),
        true,
      );
      asserts.assertEquals(
        assertExpression({
          $expr: 'DATE_DIFF',
          $args: ['YEAR', '$C.$a', new Date()],
        }, ['a', 'b', '$C.$a']),
        true,
      );
      asserts.assertEquals(
        assertExpression({
          $expr: 'DATE_DIFF',
          $args: ['YEAR', new Date(), new Date()],
        }, ['a', 'b', '$C.$a']),
        true,
      );
      asserts.assertEquals(
        assertExpression({
          $expr: 'DATE_DIFF',
          $args: ['YEAR', { $expr: 'NOW' }, '$g'],
        }, ['a', 'b', 'c', 'd']),
        false,
      );
      asserts.assertEquals(
        assertExpression({
          $expr: 'DATE_DIFF',
          $args: ['YEAR', { $expr: 'NOW' }, 'a'],
        }, ['a']),
        false,
      );

      asserts.assertEquals(
        assertExpression({
          $expr: 'DATE_DIFF',
          $args: ['SECONDF', { $expr: 'NOW' }, { $expr: 'NOW' }],
        }),
        false,
      );
    });

    await t.step('String', () => {
      asserts.assertEquals(assertExpression({ $expr: 'UUID' }), true);

      asserts.assertEquals(
        assertExpression({ $expr: 'CONCAT', $args: ['a', 'b'] }),
        true,
      );
      asserts.assertEquals(
        assertExpression({ $expr: 'CONCAT', $args: ['$a', '$b'] }),
        true,
      );
      asserts.assertEquals(
        assertExpression({ $expr: 'CONCAT', $args: ['$a', '$b'] }, [
          'a',
          'b',
          'c',
        ]),
        true,
      );
      asserts.assertEquals(
        assertExpression({ $expr: 'CONCAT', $args: ['$a', '$MAIN.$b'] }, [
          'a',
          'b',
          'c',
        ]),
        true,
      );
      asserts.assertEquals(
        assertExpression({ $expr: 'CONCAT', $args: ['$a', '$C.$a'] }, [
          'a',
          'b',
          '$C.$a',
        ]),
        true,
      );
      asserts.assertEquals(
        assertExpression({ $expr: 'CONCAT', $args: 'sdf' }),
        false,
      );
      asserts.assertEquals(
        assertExpression({
          $expr: 'CONCAT',
          $args: ['d', { $expr: 'CONCAT', $args: ['sdf', 'df'] }],
        }),
        false,
      ); // Non string expression
      // This is actually a bug, where the column is missing but since input can be string we accept it.
      asserts.assertEquals(
        assertExpression({ $expr: 'CONCAT', $args: ['$d', '$c'] }, [
          'a',
          'b',
          'c',
        ]),
        true,
      );
      asserts.assertEquals(
        assertExpression({ $expr: 'CONCAT', $args: ['d', 1] }, [
          'a',
          'b',
          'c',
        ]),
        false,
      ); // Adding number
      asserts.assertEquals(
        assertExpression({
          $expr: 'CONCAT',
          $args: ['d', { $expr: 'LENGTH', $args: 'sdf' }],
        }),
        false,
      ); // Non string expression

      asserts.assertEquals(
        assertExpression({ $expr: 'LOWER', $args: 'a' }),
        true,
      );
      asserts.assertEquals(
        assertExpression({ $expr: 'UPPER', $args: 'a' }),
        true,
      );
      asserts.assertEquals(
        assertExpression({ $expr: 'TRIM', $args: 'a' }),
        true,
      );

      asserts.assertEquals(
        assertExpression({ $expr: 'LOWER', $args: '$a' }),
        true,
      );
      asserts.assertEquals(
        assertExpression({ $expr: 'UPPER', $args: '$a' }),
        true,
      );
      asserts.assertEquals(
        assertExpression({ $expr: 'TRIM', $args: '$a' }),
        true,
      );

      asserts.assertEquals(
        assertExpression({ $expr: 'LOWER', $args: '$a' }, ['a']),
        true,
      );
      asserts.assertEquals(
        assertExpression({ $expr: 'UPPER', $args: '$a' }, ['a']),
        true,
      );
      asserts.assertEquals(
        assertExpression({ $expr: 'TRIM', $args: '$a' }, ['a']),
        true,
      );

      // This is actually a bug, where the column is missing but since input can be string we accept it.
      asserts.assertEquals(
        assertExpression({ $expr: 'LOWER', $args: '$a' }, ['v']),
        true,
      );
      // This is actually a bug, where the column is missing but since input can be string we accept it.
      asserts.assertEquals(
        assertExpression({ $expr: 'UPPER', $args: '$a' }, ['v']),
        true,
      );
      // This is actually a bug, where the column is missing but since input can be string we accept it.
      asserts.assertEquals(
        assertExpression({ $expr: 'TRIM', $args: '$a' }, ['v']),
        true,
      );

      asserts.assertEquals(
        assertExpression({
          $expr: 'REPLACE',
          $args: ['Hello World', 'Hello', 'Ola'],
        }),
        true,
      );
      asserts.assertEquals(
        assertExpression({
          $expr: 'REPLACE',
          $args: ['Hello World', '$a', 'Ola'],
        }),
        true,
      );
      asserts.assertEquals(
        assertExpression({
          $expr: 'REPLACE',
          $args: ['Hello World', '$a', 'Ola'],
        }, ['a', 'b']),
        true,
      );
      asserts.assertEquals(
        assertExpression({
          $expr: 'REPLACE',
          $args: ['Hello World', '$a', '$a'],
        }, ['a', 'b']),
        true,
      );

      asserts.assertEquals(
        assertExpression({
          $expr: 'SUBSTRING',
          $args: ['Hello World', 1, 2],
        }, ['a']),
        true,
      );
      asserts.assertEquals(
        assertExpression({
          $expr: 'SUBSTRING',
          $args: ['Hello World', '$a', 2],
        }, ['a']),
        true,
      );
      asserts.assertEquals(
        assertExpression({
          $expr: 'SUBSTRING',
          $args: ['Hello World', 1, '$a'],
        }, ['a']),
        true,
      );
      // This is actually a bug, where the column is missing but since input can be string we accept it.
      asserts.assertEquals(
        assertExpression({
          $expr: 'SUBSTRING',
          $args: ['Hello World', '$a', '$b'],
        }, ['a']),
        false,
      );
    });

    await t.step('JSON', () => {
      asserts.assertEquals(
        assertExpression({
          $expr: 'JSON_VALUE',
          $args: ['$a', ['a', 'b', 'c']],
        }),
        true,
      );
      asserts.assertEquals(
        assertExpression({
          $expr: 'JSON_VALUE',
          $args: ['$a', ['a', 'b', 'c']],
        }, ['a', 'b', 'c']),
        true,
      );
      asserts.assertEquals(
        assertExpression({
          $expr: 'JSON_VALUE',
          $args: ['$MAIN.$a', ['a', 'b', 'c']],
        }, ['a', 'b', 'c']),
        true,
      );
      asserts.assertEquals(
        assertExpression({
          $expr: 'JSON_VALUE',
          $args: ['$B.$c', ['a', 'b', 'c']],
        }, ['a', '$B.$c', 'c']),
        true,
      );
      asserts.assertEquals(
        assertExpression({
          $expr: 'JSON_VALUE',
          $args: ['a', ['a', 'b', 'c']],
        }, ['a', 'b', 'c']),
        false,
      );
    });
  });

  await t.step('Filter', () => {
    asserts.assertEquals(assertBaseOperators('sdf'), true);
    asserts.assertEquals(assertBaseOperators(1), true);
    asserts.assertEquals(assertBaseOperators(1n), true);
    asserts.assertEquals(assertBaseOperators(true), true);
    asserts.assertEquals(assertBaseOperators(null), true);
    asserts.assertEquals(assertBaseOperators(new Date()), true);
    asserts.assertEquals(assertBaseOperators([1, 2, 3]), true);
    asserts.assertEquals(assertBaseOperators({ $eq: 1 }), true);
    asserts.assertEquals(assertBaseOperators({ $eq: 'str' }), true);
    asserts.assertEquals(assertBaseOperators({ $eq: new Date() }), true);
    asserts.assertEquals(assertBaseOperators({ $eq: true }), true);
    asserts.assertEquals(assertBaseOperators({ $ne: { $expr: 'NOW' } }), true);
    asserts.assertEquals(assertBaseOperators({ $ne: 'str' }), true);
    asserts.assertEquals(assertBaseOperators({ $ne: new Date() }), true);
    asserts.assertEquals(assertBaseOperators({ $ne: true }), true);
    asserts.assertEquals(assertBaseOperators({ $null: true }), true);
    asserts.assertEquals(assertBaseOperators({ $null: false }), true);
    asserts.assertEquals(assertBaseOperators({ $in: [1, 2, 3] }), true);
    asserts.assertEquals(
      assertBaseOperators({
        $in: ['str1', new Date(), true, { $expr: 'UUID' }],
      }),
      true,
    );
    asserts.assertEquals(assertBaseOperators({ $nin: [1, 2, 3] }), true);
    asserts.assertEquals(
      assertBaseOperators({
        $nin: ['str1', new Date(), true, { $expr: 'UUID' }],
      }),
      true,
    );
    asserts.assertEquals(
      assertBaseOperators({
        $some: ['str1', new Date(), true, { $expr: 'UUID' }],
      }),
      false,
    );

    asserts.assertEquals(assertMathOperators({ $gt: 1 }), true);
    asserts.assertEquals(assertMathOperators({ $gte: 1 }), true);
    asserts.assertEquals(assertMathOperators({ $lt: 1 }), true);
    asserts.assertEquals(assertMathOperators({ $lte: 1 }), true);
    asserts.assertEquals(assertMathOperators({ $between: [1, 2] }), true);

    asserts.assertEquals(assertMathOperators({ $gt: '$a' }), true);
    asserts.assertEquals(assertMathOperators({ $gte: '$a' }), true);
    asserts.assertEquals(assertMathOperators({ $lt: '$a' }), true);
    asserts.assertEquals(assertMathOperators({ $lte: '$a' }), true);
    asserts.assertEquals(assertMathOperators({ $between: ['$a', '$a'] }), true);
    asserts.assertEquals(
      assertMathOperators({ $gt: { $expr: 'ADD', $args: [1, 2] } }),
      true,
    );
    asserts.assertEquals(
      assertMathOperators({ $gte: { $expr: 'ADD', $args: [1, 2] } }),
      true,
    );
    asserts.assertEquals(
      assertMathOperators({ $lt: { $expr: 'ADD', $args: [1, 2] } }),
      true,
    );
    asserts.assertEquals(
      assertMathOperators({ $lte: { $expr: 'ADD', $args: [1, 2] } }),
      true,
    );
    asserts.assertEquals(
      assertMathOperators({
        $between: [{ $expr: 'ADD', $args: [1, 2] }, {
          $expr: 'ADD',
          $args: [1, 2],
        }],
      }),
      true,
    );

    asserts.assertEquals(assertMathOperators({ $gt: 1n }), true);
    asserts.assertEquals(assertMathOperators({ $gte: 1n }), true);
    asserts.assertEquals(assertMathOperators({ $lt: 1n }), true);
    asserts.assertEquals(assertMathOperators({ $lte: 1n }), true);
    asserts.assertEquals(assertMathOperators({ $between: [1n, 2n] }), true);

    asserts.assertEquals(assertMathOperators({ $gt: new Date() }), true);
    asserts.assertEquals(assertMathOperators({ $gte: new Date() }), true);
    asserts.assertEquals(assertMathOperators({ $lt: new Date() }), true);
    asserts.assertEquals(assertMathOperators({ $lte: new Date() }), true);
    asserts.assertEquals(
      assertMathOperators({ $between: [new Date(), new Date()] }),
      true,
    );
    asserts.assertEquals(
      assertMathOperators({ $between: [{ $expr: 'NOW' }, { $expr: 'NOW' }] }),
      true,
    );

    asserts.assertEquals(assertMathOperators({ $gt: 'sdf' }), false);
    asserts.assertEquals(assertMathOperators({ $gte: 'sdf' }), false);
    asserts.assertEquals(assertMathOperators({ $lt: 'sdf' }), false);
    asserts.assertEquals(assertMathOperators({ $lte: 'sdf' }), false);
    asserts.assertEquals(
      assertMathOperators({ $between: ['sdf', 'sdf'] }),
      false,
    );

    asserts.assertEquals(assertStringOperators({ $like: 'sdf' }), true);
    asserts.assertEquals(assertStringOperators({ $nlike: 'sdf' }), true);
    asserts.assertEquals(assertStringOperators({ $ilike: 'sdf' }), true);
    asserts.assertEquals(assertStringOperators({ $nilike: 'sdf' }), true);
    asserts.assertEquals(assertStringOperators({ $contains: 'sdf' }), true);
    asserts.assertEquals(assertStringOperators({ $ncontains: 'sdf' }), true);
    asserts.assertEquals(assertStringOperators({ $startsWith: 'sdf' }), true);
    asserts.assertEquals(assertStringOperators({ $nstartsWith: 'sdf' }), true);
    asserts.assertEquals(assertStringOperators({ $endsWith: 'sdf' }), true);
    asserts.assertEquals(assertStringOperators({ $nendsWith: 'sdf' }), true);

    asserts.assertEquals(
      assertStringOperators({ $like: '$sdf' }, ['dsf', 'sdf']),
      true,
    );
    asserts.assertEquals(
      assertStringOperators({ $nlike: '$sdf' }, ['dsf', 'sdf']),
      true,
    );
    asserts.assertEquals(
      assertStringOperators({ $ilike: '$sdf' }, ['dsf', 'sdf']),
      true,
    );
    asserts.assertEquals(
      assertStringOperators({ $nilike: '$sdf' }, ['dsf', 'sdf']),
      true,
    );
    asserts.assertEquals(
      assertStringOperators({ $contains: '$sdf' }, ['dsf', 'sdf']),
      true,
    );
    asserts.assertEquals(
      assertStringOperators({ $ncontains: '$sdf' }, ['dsf', 'sdf']),
      true,
    );
    asserts.assertEquals(
      assertStringOperators({ $startsWith: '$sdf' }, ['dsf', 'sdf']),
      true,
    );
    asserts.assertEquals(
      assertStringOperators({ $nstartsWith: '$sdf' }, ['dsf', 'sdf']),
      true,
    );
    asserts.assertEquals(
      assertStringOperators({ $endsWith: '$sdf' }, ['dsf', 'sdf']),
      true,
    );
    asserts.assertEquals(
      assertStringOperators({ $nendsWith: '$sdf' }, ['dsf', 'sdf']),
      true,
    );

    asserts.assertEquals(
      assertStringOperators({
        $like: { $expr: 'CONCAT', $args: ['$sdf', 'd'] },
      }, ['dsf', 'sdf']),
      true,
    );
    asserts.assertEquals(
      assertStringOperators({
        $nlike: { $expr: 'CONCAT', $args: ['$sdf', 'd'] },
      }, ['dsf', 'sdf']),
      true,
    );
    asserts.assertEquals(
      assertStringOperators({
        $ilike: { $expr: 'CONCAT', $args: ['$sdf', 'd'] },
      }, ['dsf', 'sdf']),
      true,
    );
    asserts.assertEquals(
      assertStringOperators({
        $nilike: { $expr: 'CONCAT', $args: ['$sdf', 'd'] },
      }, ['dsf', 'sdf']),
      true,
    );
    asserts.assertEquals(
      assertStringOperators({
        $contains: { $expr: 'CONCAT', $args: ['$sdf', 'd'] },
      }, ['dsf', 'sdf']),
      true,
    );
    asserts.assertEquals(
      assertStringOperators({
        $ncontains: { $expr: 'CONCAT', $args: ['$sdf', 'd'] },
      }, ['dsf', 'sdf']),
      true,
    );
    asserts.assertEquals(
      assertStringOperators({
        $startsWith: { $expr: 'CONCAT', $args: ['$sdf', 'd'] },
      }, ['dsf', 'sdf']),
      true,
    );
    asserts.assertEquals(
      assertStringOperators({
        $nstartsWith: { $expr: 'CONCAT', $args: ['$sdf', 'd'] },
      }, ['dsf', 'sdf']),
      true,
    );
    asserts.assertEquals(
      assertStringOperators({
        $endsWith: { $expr: 'CONCAT', $args: ['$sdf', 'd'] },
      }, ['dsf', 'sdf']),
      true,
    );
    asserts.assertEquals(
      assertStringOperators({
        $nendsWith: { $expr: 'CONCAT', $args: ['$sdf', 'd'] },
      }, ['dsf', 'sdf']),
      true,
    );

    // These are actually a bug, where the column is missing but since input can be string we accept it.
    asserts.assertEquals(
      assertStringOperators({ $like: '$sdfd' }, ['dsf', 'sdf']),
      true,
    );
    asserts.assertEquals(
      assertStringOperators({ $nlike: '$sdfd' }, ['dsf', 'sdf']),
      true,
    );
    asserts.assertEquals(
      assertStringOperators({ $ilike: '$sdfd' }, ['dsf', 'sdf']),
      true,
    );
    asserts.assertEquals(
      assertStringOperators({ $nilike: '$sdfd' }, ['dsf', 'sdf']),
      true,
    );
    asserts.assertEquals(
      assertStringOperators({ $contains: '$sdfd' }, ['dsf', 'sdf']),
      true,
    );
    asserts.assertEquals(
      assertStringOperators({ $ncontains: '$sdfd' }, ['dsf', 'sdf']),
      true,
    );
    asserts.assertEquals(
      assertStringOperators({ $startsWith: '$sdfd' }, ['dsf', 'sdf']),
      true,
    );
    asserts.assertEquals(
      assertStringOperators({ $nstartsWith: '$sdfd' }, ['dsf', 'sdf']),
      true,
    );
    asserts.assertEquals(
      assertStringOperators({ $endsWith: '$sdfd' }, ['dsf', 'sdf']),
      true,
    );
    asserts.assertEquals(
      assertStringOperators({ $nendsWith: '$sdfd' }, ['dsf', 'sdf']),
      true,
    );

    asserts.assertEquals(
      assertStringOperators({
        $like: { $expr: 'SUBSTRING', $args: ['asdf', 1, 2] },
      }, ['dsf', 'sdf']),
      true,
    );

    asserts.assertEquals(
      assertQueryFilters({ $and: [{ _id: { $eq: 1 } }, { _id: { $ne: 2 } }] }),
      true,
    );
    asserts.assertEquals(
      assertQueryFilters({ $or: [{ _id: { $eq: 1 } }, { _id: { $ne: 2 } }] }),
      true,
    );
    asserts.assertEquals(
      assertQueryFilters({
        $and: [{ _id: { $eq: 1 } }, { _id: { $ne: 2 } }],
        $or: [{ _id: { $eq: 1 } }, { _id: { $ne: 2 } }],
      }),
      true,
    );
    asserts.assertEquals(
      assertQueryFilters({
        name: 'asdf',
        email: { $in: ['test@email.com', 'sdf@gmail.com'] },
        $and: [{ _id: { $eq: 1 } }, { _id: { $ne: 2 } }],
        $or: [{ _id: { $eq: 1 } }, { _id: { $ne: 2 } }],
      }),
      true,
    );
    asserts.assertEquals(
      assertQueryFilters({ $or: { name: { $eq: 'some' }, lastName: 'thing' } }),
      true,
    );
    asserts.assertEquals(
      assertQueryFilters({
        $and: { name: { $eq: 'some' }, lastName: 'thing' },
      }),
      true,
    );
  });

  await t.step('Builder', async (s) => {
    await s.step('Insert', () => {
      asserts.assertEquals(
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

      asserts.assertEquals(
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
      asserts.assertEquals(
        assertInsertQueryBuilder({
          type: 'INSERT',
          source: 'table',
          schema: 'schema',
          columns: ['col1', 'col2', 'col3'],
        }),
        false,
      );

      // Value not an array
      asserts.assertEquals(
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
      asserts.assertEquals(
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
      asserts.assertEquals(
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
      asserts.assertEquals(
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
      asserts.assertEquals(
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
      asserts.assertEquals(
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
      asserts.assertEquals(
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
      asserts.assertEquals(
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
      asserts.assertEquals(
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

      asserts.assertEquals(
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

      asserts.assertEquals(
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
      asserts.assertEquals(
        assertUpdateQueryBuilder({
          type: 'UPDATE',
          source: 'table',
          schema: 'schema',
          columns: ['col1', 'col2', 'col3'],
        }),
        false,
      );

      // Values as an array
      asserts.assertEquals(
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
      asserts.assertEquals(
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
      asserts.assertEquals(
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
      asserts.assertEquals(
        assertUpdateQueryBuilder({
          type: 'UPDATE',
          schema: 'schema',
          columns: ['col1', 'col2', 'col3'],
          values: { col1: 2, col3: '3' },
        }),
        false,
      );

      // Columns missing
      asserts.assertEquals(
        assertUpdateQueryBuilder({
          type: 'UPDATE',
          source: 'table',
          values: { col1: 2, col3: '3' },
        }),
        false,
      );

      // Wrong type
      asserts.assertEquals(
        assertUpdateQueryBuilder({
          type: 'UPDATER',
          table: 'table',
          columns: ['col1', 'col2', 'col3'],
          values: { col1: 2, col3: '3' },
        }),
        false,
      );

      // Expression column duplicate of column
      asserts.assertEquals(
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
      asserts.assertEquals(
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
      asserts.assertEquals(
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

      asserts.assertEquals(
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

      asserts.assertEquals(
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
      asserts.assertEquals(
        assertDeleteQueryBuilder({
          type: 'DELETE',
          schema: 'schema',
          columns: ['col1', 'col2', 'col3'],
        }),
        false,
      );

      // Columns missing
      asserts.assertEquals(
        assertDeleteQueryBuilder({
          type: 'DELETE',
          source: 'table',
        }),
        false,
      );

      // Wrong type
      asserts.assertEquals(
        assertDeleteQueryBuilder({
          type: 'DELETER',
          table: 'table',
          columns: ['col1', 'col2', 'col3'],
        }),
        false,
      );

      // Expression column duplicate of column
      asserts.assertEquals(
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
      asserts.assertEquals(
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
