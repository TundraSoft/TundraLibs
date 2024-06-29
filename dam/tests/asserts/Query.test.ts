import { assertEquals } from '../../../dev.dependencies.ts';
import {
  assertAggregates,
  assertColumnIdentifier,
  assertDateExpression,
  assertDeleteQueryBuilder,
  assertInsertQueryBuilder,
  // assertExpression,
  assertJSONExpression,
  assertNumberExpression,
  assertStringExpression,
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
      assertEquals(assertDateExpression({ $expr: 'NOW' }), true);
      assertEquals(assertDateExpression({ $expr: 'CURRENT_DATE' }), true);
      assertEquals(assertDateExpression({ $expr: 'CURRENT_TIME' }), true);
      assertEquals(assertDateExpression({ $expr: 'CURRENT_TIMESTAMP' }), true);
      assertEquals(
        assertDateExpression({
          $expr: 'DATE_ADD',
          $args: ['YEAR', { $expr: 'NOW' }, 1],
        }),
        true,
      );
      assertEquals(
        assertDateExpression({
          $expr: 'DATE_ADD',
          $args: ['MONTH', { $expr: 'NOW' }, 1],
        }),
        true,
      );
      assertEquals(
        assertDateExpression({
          $expr: 'DATE_ADD',
          $args: ['DAY', { $expr: 'NOW' }, 1],
        }),
        true,
      );
      assertEquals(
        assertDateExpression({
          $expr: 'DATE_ADD',
          $args: ['HOUR', { $expr: 'NOW' }, 1],
        }),
        true,
      );
      assertEquals(
        assertDateExpression({
          $expr: 'DATE_ADD',
          $args: ['MINUTE', { $expr: 'NOW' }, 1],
        }),
        true,
      );
      assertEquals(
        assertDateExpression({
          $expr: 'DATE_ADD',
          $args: ['SECOND', { $expr: 'NOW' }, 1],
        }),
        true,
      );

      assertEquals(
        assertDateExpression({
          $expr: 'DATE_ADD',
          $args: ['YEAR', { $expr: 'NOW' }, '1'],
        }),
        false,
      );
      assertEquals(
        assertDateExpression({
          $expr: 'DATE_ADD',
          $args: ['YEARD', { $expr: 'NOW' }, 1],
        }, ['a']),
        false,
      );
      assertEquals(
        assertDateExpression({
          $expr: 'DATE_ADD',
          $args: ['YEAR', { $expr: 'NOW' }, 1],
        }, ['a']),
        true,
      );
      assertEquals(
        assertDateExpression({
          $expr: 'DATE_ADD',
          $args: ['YEAR', { $expr: 'NOW' }, '$a'],
        }, ['a']),
        true,
      );
      assertEquals(
        assertDateExpression({
          $expr: 'DATE_ADD',
          $args: ['YEAR', new Date(), '$a'],
        }, ['a']),
        true,
      );
    });

    await t.step('Number', () => {
      assertEquals(
        assertNumberExpression({ $expr: 'ADD', $args: [1, 2] }),
        true,
      );
      assertEquals(
        assertNumberExpression({ $expr: 'ADD', $args: ['$a', '$b'] }),
        true,
      );
      assertEquals(
        assertNumberExpression({ $expr: 'ADD', $args: ['$a', '$b'] }, [
          'a',
          'b',
          'c',
        ]),
        true,
      );
      assertEquals(
        assertNumberExpression({ $expr: 'ADD', $args: ['$a', '$MAIN.$b'] }, [
          'a',
          'b',
          'c',
        ]),
        true,
      );
      assertEquals(
        assertNumberExpression({ $expr: 'ADD', $args: ['$a', '$C.$a'] }, [
          'a',
          'b',
          '$C.$a',
        ]),
        true,
      );
      assertEquals(
        assertNumberExpression({ $expr: 'ADD', $args: ['$d', '$c'] }, [
          'a',
          'b',
          'c',
        ]),
        false,
      );
      assertEquals(
        assertNumberExpression({ $expr: 'ADD', $args: ['d', 'c'] }, [
          'a',
          'b',
          'c',
        ]),
        false,
      );

      assertEquals(
        assertNumberExpression({ $expr: 'SUB', $args: [1, 2] }),
        true,
      );
      assertEquals(
        assertNumberExpression({ $expr: 'SUB', $args: ['$a', '$b'] }),
        true,
      );
      assertEquals(
        assertNumberExpression({ $expr: 'SUB', $args: ['$a', '$b'] }, [
          'a',
          'b',
          'c',
        ]),
        true,
      );
      assertEquals(
        assertNumberExpression({ $expr: 'SUB', $args: ['$a', '$MAIN.$b'] }, [
          'a',
          'b',
          'c',
        ]),
        true,
      );
      assertEquals(
        assertNumberExpression({ $expr: 'SUB', $args: ['$a', '$C.$a'] }, [
          'a',
          'b',
          '$C.$a',
        ]),
        true,
      );
      assertEquals(
        assertNumberExpression({ $expr: 'SUB', $args: ['$d', '$c'] }, [
          'a',
          'b',
          'c',
        ]),
        false,
      );
      assertEquals(
        assertNumberExpression({ $expr: 'SUB', $args: ['d', 'c'] }, [
          'a',
          'b',
          'c',
        ]),
        false,
      );

      assertEquals(
        assertNumberExpression({ $expr: 'MUL', $args: [1, 2] }),
        true,
      );
      assertEquals(
        assertNumberExpression({ $expr: 'MUL', $args: ['$a', '$b'] }),
        true,
      );
      assertEquals(
        assertNumberExpression({ $expr: 'MUL', $args: ['$a', '$b'] }, [
          'a',
          'b',
          'c',
        ]),
        true,
      );
      assertEquals(
        assertNumberExpression({ $expr: 'MUL', $args: ['$a', '$MAIN.$b'] }, [
          'a',
          'b',
          'c',
        ]),
        true,
      );
      assertEquals(
        assertNumberExpression({ $expr: 'MUL', $args: ['$a', '$C.$a'] }, [
          'a',
          'b',
          '$C.$a',
        ]),
        true,
      );
      assertEquals(
        assertNumberExpression({ $expr: 'MUL', $args: ['$d', '$c'] }, [
          'a',
          'b',
          'c',
        ]),
        false,
      );
      assertEquals(
        assertNumberExpression({ $expr: 'MUL', $args: ['d', 'c'] }, [
          'a',
          'b',
          'c',
        ]),
        false,
      );

      assertEquals(
        assertNumberExpression({ $expr: 'DIV', $args: [1, 2] }),
        true,
      );
      assertEquals(
        assertNumberExpression({ $expr: 'DIV', $args: ['$a', '$b'] }),
        true,
      );
      assertEquals(
        assertNumberExpression({ $expr: 'DIV', $args: ['$a', '$b'] }, [
          'a',
          'b',
          'c',
        ]),
        true,
      );
      assertEquals(
        assertNumberExpression({ $expr: 'DIV', $args: ['$a', '$MAIN.$b'] }, [
          'a',
          'b',
          'c',
        ]),
        true,
      );
      assertEquals(
        assertNumberExpression({ $expr: 'DIV', $args: ['$a', '$C.$a'] }, [
          'a',
          'b',
          '$C.$a',
        ]),
        true,
      );
      assertEquals(
        assertNumberExpression({ $expr: 'DIV', $args: ['$d', '$c'] }, [
          'a',
          'b',
          'c',
        ]),
        false,
      );
      assertEquals(
        assertNumberExpression({ $expr: 'DIV', $args: ['d', 'c'] }, [
          'a',
          'b',
          'c',
        ]),
        false,
      );

      assertEquals(
        assertNumberExpression({ $expr: 'MOD', $args: [1, 2] }),
        true,
      );
      assertEquals(
        assertNumberExpression({ $expr: 'MOD', $args: ['$a', '$b'] }),
        true,
      );
      assertEquals(
        assertNumberExpression({ $expr: 'MOD', $args: ['$a', '$b'] }, [
          'a',
          'b',
          'c',
        ]),
        true,
      );
      assertEquals(
        assertNumberExpression({ $expr: 'MOD', $args: ['$a', '$MAIN.$b'] }, [
          'a',
          'b',
          'c',
        ]),
        true,
      );
      assertEquals(
        assertNumberExpression({ $expr: 'MOD', $args: ['$a', '$C.$a'] }, [
          'a',
          'b',
          '$C.$a',
        ]),
        true,
      );
      assertEquals(
        assertNumberExpression({ $expr: 'MOD', $args: ['$d', '$c'] }, [
          'a',
          'b',
          'c',
        ]),
        false,
      );
      assertEquals(
        assertNumberExpression({ $expr: 'MOD', $args: ['d', 'c'] }, [
          'a',
          'b',
          'c',
        ]),
        false,
      );

      assertEquals(assertNumberExpression({ $expr: 'ABS', $args: 1 }), true);
      assertEquals(assertNumberExpression({ $expr: 'ABS', $args: '$a' }), true);
      assertEquals(
        assertNumberExpression({ $expr: 'ABS', $args: '$a' }, ['a']),
        true,
      );
      assertEquals(
        assertNumberExpression({ $expr: 'ABS', $args: '$MAIN.$a' }, ['a', 'b']),
        true,
      );
      assertEquals(
        assertNumberExpression({ $expr: 'ABS', $args: '$C.$a' }, [
          'a',
          'b',
          '$C.$a',
        ]),
        true,
      );
      assertEquals(
        assertNumberExpression({ $expr: 'ABS', $args: '$g' }, [
          'a',
          'b',
          'c',
          'd',
        ]),
        false,
      );
      assertEquals(
        assertNumberExpression({ $expr: 'ABS', $args: 'a' }, ['a']),
        false,
      );

      assertEquals(assertNumberExpression({ $expr: 'CEIL', $args: 1 }), true);
      assertEquals(
        assertNumberExpression({ $expr: 'CEIL', $args: '$a' }),
        true,
      );
      assertEquals(
        assertNumberExpression({ $expr: 'CEIL', $args: '$a' }, ['a']),
        true,
      );
      assertEquals(
        assertNumberExpression({ $expr: 'CEIL', $args: '$MAIN.$a' }, [
          'a',
          'b',
        ]),
        true,
      );
      assertEquals(
        assertNumberExpression({ $expr: 'CEIL', $args: '$C.$a' }, [
          'a',
          'b',
          '$C.$a',
        ]),
        true,
      );
      assertEquals(
        assertNumberExpression({ $expr: 'CEIL', $args: '$g' }, [
          'a',
          'b',
          'c',
          'd',
        ]),
        false,
      );
      assertEquals(
        assertNumberExpression({ $expr: 'CEIL', $args: 'a' }, ['a']),
        false,
      );

      assertEquals(assertNumberExpression({ $expr: 'FLOOR', $args: 1 }), true);
      assertEquals(
        assertNumberExpression({ $expr: 'FLOOR', $args: '$a' }),
        true,
      );
      assertEquals(
        assertNumberExpression({ $expr: 'FLOOR', $args: '$a' }, ['a']),
        true,
      );
      assertEquals(
        assertNumberExpression({ $expr: 'FLOOR', $args: '$MAIN.$a' }, [
          'a',
          'b',
        ]),
        true,
      );
      assertEquals(
        assertNumberExpression({ $expr: 'FLOOR', $args: '$C.$a' }, [
          'a',
          'b',
          '$C.$a',
        ]),
        true,
      );
      assertEquals(
        assertNumberExpression({ $expr: 'FLOOR', $args: '$g' }, [
          'a',
          'b',
          'c',
          'd',
        ]),
        false,
      );
      assertEquals(
        assertNumberExpression({ $expr: 'FLOOR', $args: 'a' }, ['a']),
        false,
      );

      assertEquals(
        assertNumberExpression({ $expr: 'LENGTH', $args: 'a' }),
        true,
      );
      assertEquals(
        assertNumberExpression({ $expr: 'LENGTH', $args: '$a' }),
        true,
      );
      assertEquals(
        assertNumberExpression({ $expr: 'LENGTH', $args: '$a' }, ['a']),
        true,
      );
      assertEquals(
        assertNumberExpression({ $expr: 'LENGTH', $args: '$MAIN.$a' }, [
          'a',
          'b',
        ]),
        true,
      );
      assertEquals(
        assertNumberExpression({ $expr: 'LENGTH', $args: '$C.$a' }, [
          'a',
          'b',
          '$C.$a',
        ]),
        true,
      );
      // THIS IS A BUG
      assertEquals(
        assertNumberExpression({ $expr: 'LENGTH', $args: '$g' }, [
          'a',
          'b',
          'c',
          'd',
        ]),
        true,
      );
      assertEquals(
        assertNumberExpression({ $expr: 'LENGTH', $args: 1 }, ['a']),
        false,
      );

      assertEquals(
        assertNumberExpression({
          $expr: 'DATE_DIFF',
          $args: ['YEAR', { $expr: 'NOW' }, { $expr: 'NOW' }],
        }),
        true,
      );
      assertEquals(
        assertNumberExpression({
          $expr: 'DATE_DIFF',
          $args: ['MONTH', { $expr: 'NOW' }, { $expr: 'NOW' }],
        }),
        true,
      );
      assertEquals(
        assertNumberExpression({
          $expr: 'DATE_DIFF',
          $args: ['DAY', { $expr: 'NOW' }, { $expr: 'NOW' }],
        }),
        true,
      );
      assertEquals(
        assertNumberExpression({
          $expr: 'DATE_DIFF',
          $args: ['HOUR', { $expr: 'NOW' }, { $expr: 'NOW' }],
        }),
        true,
      );
      assertEquals(
        assertNumberExpression({
          $expr: 'DATE_DIFF',
          $args: ['MINUTE', { $expr: 'NOW' }, { $expr: 'NOW' }],
        }),
        true,
      );
      assertEquals(
        assertNumberExpression({
          $expr: 'DATE_DIFF',
          $args: ['SECOND', { $expr: 'NOW' }, { $expr: 'NOW' }],
        }),
        true,
      );
      assertEquals(
        assertNumberExpression({
          $expr: 'DATE_DIFF',
          $args: ['YEAR', { $expr: 'NOW' }, { $expr: 'NOW' }],
        }, ['a']),
        true,
      );
      assertEquals(
        assertNumberExpression({
          $expr: 'DATE_DIFF',
          $args: ['YEAR', { $expr: 'NOW' }, '$a'],
        }, ['a', 'b']),
        true,
      );
      assertEquals(
        assertNumberExpression({
          $expr: 'DATE_DIFF',
          $args: ['YEAR', { $expr: 'NOW' }, '$MAIN.$a'],
        }, ['a']),
        true,
      );
      assertEquals(
        assertNumberExpression({
          $expr: 'DATE_DIFF',
          $args: ['YEAR', { $expr: 'NOW' }, '$C.$a'],
        }, ['a', 'b', '$C.$a']),
        true,
      );
      assertEquals(
        assertNumberExpression({
          $expr: 'DATE_DIFF',
          $args: ['YEAR', new Date(), '$C.$a'],
        }, ['a', 'b', '$C.$a']),
        true,
      );
      assertEquals(
        assertNumberExpression({
          $expr: 'DATE_DIFF',
          $args: ['YEAR', '$C.$a', new Date()],
        }, ['a', 'b', '$C.$a']),
        true,
      );
      assertEquals(
        assertNumberExpression({
          $expr: 'DATE_DIFF',
          $args: ['YEAR', new Date(), new Date()],
        }, ['a', 'b', '$C.$a']),
        true,
      );
      assertEquals(
        assertNumberExpression({
          $expr: 'DATE_DIFF',
          $args: ['YEAR', { $expr: 'NOW' }, '$g'],
        }, ['a', 'b', 'c', 'd']),
        false,
      );
      assertEquals(
        assertNumberExpression({
          $expr: 'DATE_DIFF',
          $args: ['YEAR', { $expr: 'NOW' }, 'a'],
        }, ['a']),
        false,
      );

      assertEquals(
        assertNumberExpression({
          $expr: 'DATE_DIFF',
          $args: ['SECONDF', { $expr: 'NOW' }, { $expr: 'NOW' }],
        }),
        false,
      );
    });

    await t.step('String', () => {
      assertEquals(assertStringExpression({ $expr: 'UUID' }), true);

      assertEquals(
        assertStringExpression({ $expr: 'CONCAT', $args: ['a', 'b'] }),
        true,
      );
      assertEquals(
        assertStringExpression({ $expr: 'CONCAT', $args: ['$a', '$b'] }),
        true,
      );
      assertEquals(
        assertStringExpression({ $expr: 'CONCAT', $args: ['$a', '$b'] }, [
          'a',
          'b',
          'c',
        ]),
        true,
      );
      assertEquals(
        assertStringExpression({ $expr: 'CONCAT', $args: ['$a', '$MAIN.$b'] }, [
          'a',
          'b',
          'c',
        ]),
        true,
      );
      assertEquals(
        assertStringExpression({ $expr: 'CONCAT', $args: ['$a', '$C.$a'] }, [
          'a',
          'b',
          '$C.$a',
        ]),
        true,
      );
      assertEquals(
        assertStringExpression({ $expr: 'CONCAT', $args: 'sdf' }),
        false,
      );
      assertEquals(
        assertStringExpression({
          $expr: 'CONCAT',
          $args: ['d', { $expr: 'CONCAT', $args: ['sdf', 'df'] }],
        }),
        false,
      ); // Non string expression
      assertEquals(
        assertStringExpression({ $expr: 'CONCAT', $args: ['$d', '$c'] }, [
          'a',
          'b',
          'c',
        ]),
        true,
      ); // THIS MAY BE A BUG.
      assertEquals(
        assertStringExpression({ $expr: 'CONCAT', $args: ['d', 1] }, [
          'a',
          'b',
          'c',
        ]),
        false,
      ); // Adding number
      assertEquals(
        assertStringExpression({
          $expr: 'CONCAT',
          $args: ['d', { $expr: 'LENGTH', $args: 'sdf' }],
        }),
        false,
      ); // Non string expression

      assertEquals(
        assertStringExpression({ $expr: 'LOWER', $args: 'a' }),
        true,
      );
      assertEquals(
        assertStringExpression({ $expr: 'UPPER', $args: 'a' }),
        true,
      );
      assertEquals(assertStringExpression({ $expr: 'TRIM', $args: 'a' }), true);

      assertEquals(
        assertStringExpression({ $expr: 'LOWER', $args: '$a' }),
        true,
      );
      assertEquals(
        assertStringExpression({ $expr: 'UPPER', $args: '$a' }),
        true,
      );
      assertEquals(
        assertStringExpression({ $expr: 'TRIM', $args: '$a' }),
        true,
      );

      assertEquals(
        assertStringExpression({ $expr: 'LOWER', $args: '$a' }, ['a']),
        true,
      );
      assertEquals(
        assertStringExpression({ $expr: 'UPPER', $args: '$a' }, ['a']),
        true,
      );
      assertEquals(
        assertStringExpression({ $expr: 'TRIM', $args: '$a' }, ['a']),
        true,
      );

      assertEquals(
        assertStringExpression({ $expr: 'LOWER', $args: '$a' }, ['v']),
        true,
      ); // Can be considered as bug
      assertEquals(
        assertStringExpression({ $expr: 'UPPER', $args: '$a' }, ['v']),
        true,
      ); // Can be considered as bug
      assertEquals(
        assertStringExpression({ $expr: 'TRIM', $args: '$a' }, ['v']),
        true,
      ); // Can be considered as bug

      assertEquals(
        assertStringExpression({
          $expr: 'REPLACE',
          $args: ['Hello World', 'Hello', 'Ola'],
        }),
        true,
      );
      assertEquals(
        assertStringExpression({
          $expr: 'REPLACE',
          $args: ['Hello World', '$a', 'Ola'],
        }),
        true,
      );
      assertEquals(
        assertStringExpression({
          $expr: 'REPLACE',
          $args: ['Hello World', '$a', 'Ola'],
        }, ['a', 'b']),
        true,
      );
      assertEquals(
        assertStringExpression({
          $expr: 'REPLACE',
          $args: ['Hello World', '$a', '$a'],
        }, ['a', 'b']),
        true,
      );

      assertEquals(
        assertStringExpression({
          $expr: 'SUBSTRING',
          $args: ['Hello World', 1, 2],
        }, ['a']),
        true,
      );
      assertEquals(
        assertStringExpression({
          $expr: 'SUBSTRING',
          $args: ['Hello World', '$a', 2],
        }, ['a']),
        true,
      );
      assertEquals(
        assertStringExpression({
          $expr: 'SUBSTRING',
          $args: ['Hello World', 1, '$a'],
        }, ['a']),
        true,
      );
      assertEquals(
        assertStringExpression({
          $expr: 'SUBSTRING',
          $args: ['Hello World', '$a', '$b'],
        }, ['a']),
        false,
      );
    });

    await t.step('JSON', () => {
      assertEquals(
        assertJSONExpression({
          $expr: 'JSON_VALUE',
          $args: ['$a', ['a', 'b', 'c']],
        }),
        true,
      );
      assertEquals(
        assertJSONExpression({
          $expr: 'JSON_VALUE',
          $args: ['$a', ['a', 'b', 'c']],
        }, ['a', 'b', 'c']),
        true,
      );
      assertEquals(
        assertJSONExpression({
          $expr: 'JSON_VALUE',
          $args: ['$MAIN.$a', ['a', 'b', 'c']],
        }, ['a', 'b', 'c']),
        true,
      );
      assertEquals(
        assertJSONExpression({
          $expr: 'JSON_VALUE',
          $args: ['$B.$c', ['a', 'b', 'c']],
        }, ['a', '$B.$c', 'c']),
        true,
      );
      assertEquals(
        assertJSONExpression({
          $expr: 'JSON_VALUE',
          $args: ['a', ['a', 'b', 'c']],
        }, ['a', 'b', 'c']),
        false,
      );
    });
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
