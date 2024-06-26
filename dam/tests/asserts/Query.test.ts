import { assertEquals } from '../../../dev.dependencies.ts';
import { assertColumnIdentifier, assertAggregates, assertDateExpression, assertNumberExpression, assertStringExpression, assertJSONExpression, assertExpression } from '../../mod.ts';

Deno.test('DAM > asserts > Query', async (t) => {
  await t.step('Column Identifier', () => {
    assertEquals(assertColumnIdentifier('$a'), true);
    assertEquals(assertColumnIdentifier('a'), false);
    assertEquals(assertColumnIdentifier('$v', ['a', 'b', 'c']), false);
    assertEquals(assertColumnIdentifier('$a', ['a', 'b', 'c']), true);
    assertEquals(assertColumnIdentifier('$MAIN.$a', ['a', 'b', 'c']), true);
    assertEquals(assertColumnIdentifier('$SUB.$a', ['a', 'b', 'c', 'SUB.$a']), true);
    assertEquals(assertColumnIdentifier('$SUB.$a', ['a', 'b', 'c']), false);
  });

  await t.step('Aggregates', () => {
    assertEquals(assertAggregates({ $aggr: 'SUM', $args: '$a' }), true);
    assertEquals(assertAggregates({ $aggr: 'SUM', $args: 'adf' }), false);
    assertEquals(assertAggregates({ $aggr: 'SUM', $args: { $expr: 'ADD', $args: [1, 2, '$a']} }, ['a']), true);
    assertEquals(assertAggregates({ $aggr: 'SUM', $args: { $expr: 'TODAY'} }, ['a']), false);

    assertEquals(assertAggregates({ $aggr: 'AVG', $args: '$a' }), true);
    assertEquals(assertAggregates({ $aggr: 'AVG', $args: 'adf' }), false);
    assertEquals(assertAggregates({ $aggr: 'AVG', $args: { $expr: 'ADD', $args: [1, 2, '$a']} }, ['a']), true);
    assertEquals(assertAggregates({ $aggr: 'AVG', $args: { $expr: 'TODAY'} }, ['a']), false);

    assertEquals(assertAggregates({ $aggr: 'MIN', $args: '$a' }), true);
    assertEquals(assertAggregates({ $aggr: 'MAX', $args: '$a' }), true);
    assertEquals(assertAggregates({ $aggr: 'DISTINCT', $args: ['$a'] }), true);
    assertEquals(assertAggregates({ $aggr: 'COUNT', $args: '$a' }), true);
    assertEquals(assertAggregates({ $aggr: 'COUNT', $args: '*' }), true);
    assertEquals(assertAggregates({ $aggr: 'COUNT', $args: { $aggr: 'DISTINCT', $args: ['$a']} }), true);
    
    assertEquals(assertAggregates({ $aggr: 'COUNT', $args: { $aggr: 'SUM', $args: ['$a']} }), false);
  });

  await t.step('Expressions', async (t) => {
    await t.step('Date', () => {
      assertEquals(assertDateExpression({ $expr: 'NOW' }), true);
      assertEquals(assertDateExpression({ $expr: 'CURRENT_DATE' }), true);
      assertEquals(assertDateExpression({ $expr: 'CURRENT_TIME' }), true);
      assertEquals(assertDateExpression({ $expr: 'CURRENT_TIMESTAMP' }), true);
      assertEquals(assertDateExpression({ $expr: 'DATE_ADD', $args: ['YEAR', { $expr: 'NOW'}, 1] }), true);
      assertEquals(assertDateExpression({ $expr: 'DATE_ADD', $args: ['MONTH', { $expr: 'NOW'}, 1] }), true);
      assertEquals(assertDateExpression({ $expr: 'DATE_ADD', $args: ['DAY', { $expr: 'NOW'}, 1] }), true);
      assertEquals(assertDateExpression({ $expr: 'DATE_ADD', $args: ['HOUR', { $expr: 'NOW'}, 1] }), true);
      assertEquals(assertDateExpression({ $expr: 'DATE_ADD', $args: ['MINUTE', { $expr: 'NOW'}, 1] }), true);
      assertEquals(assertDateExpression({ $expr: 'DATE_ADD', $args: ['SECOND', { $expr: 'NOW'}, 1] }), true);

      assertEquals(assertDateExpression({ $expr: 'DATE_ADD', $args: ['YEAR', { $expr: 'NOW'}, '1'] }), false);
      assertEquals(assertDateExpression({ $expr: 'DATE_ADD', $args: ['YEARD', { $expr: 'NOW'}, 1] }, ['a']), false);
      assertEquals(assertDateExpression({ $expr: 'DATE_ADD', $args: ['YEAR', { $expr: 'NOW'}, 1] }, ['a']), true);
      assertEquals(assertDateExpression({ $expr: 'DATE_ADD', $args: ['YEAR', { $expr: 'NOW'}, '$a'] }, ['a']), true);
      
    });

    await t.step('Number', () => {
      assertEquals(assertNumberExpression({ $expr: 'ADD', $args: [1, 2] }), true);
      assertEquals(assertNumberExpression({ $expr: 'ADD', $args: ['$a', '$b'] }), true);
      assertEquals(assertNumberExpression({ $expr: 'ADD', $args: ['$a', '$b'] }, ['a', 'b', 'c']), true);
      assertEquals(assertNumberExpression({ $expr: 'ADD', $args: ['$a', '$MAIN.$b'] }, ['a', 'b', 'c']), true);
      assertEquals(assertNumberExpression({ $expr: 'ADD', $args: ['$a', '$C.$a'] }, ['a', 'b', '$C.$a']), true);
      assertEquals(assertNumberExpression({ $expr: 'ADD', $args: ['$d', '$c'] }, ['a', 'b', 'c']), false);
      assertEquals(assertNumberExpression({ $expr: 'ADD', $args: ['d', 'c'] }, ['a', 'b', 'c']), false);
      
      assertEquals(assertNumberExpression({ $expr: 'SUB', $args: [1, 2] }), true);
      assertEquals(assertNumberExpression({ $expr: 'SUB', $args: ['$a', '$b'] }), true);
      assertEquals(assertNumberExpression({ $expr: 'SUB', $args: ['$a', '$b'] }, ['a', 'b', 'c']), true);
      assertEquals(assertNumberExpression({ $expr: 'SUB', $args: ['$a', '$MAIN.$b'] }, ['a', 'b', 'c']), true);
      assertEquals(assertNumberExpression({ $expr: 'SUB', $args: ['$a', '$C.$a'] }, ['a', 'b', '$C.$a']), true);
      assertEquals(assertNumberExpression({ $expr: 'SUB', $args: ['$d', '$c'] }, ['a', 'b', 'c']), false);
      assertEquals(assertNumberExpression({ $expr: 'SUB', $args: ['d', 'c'] }, ['a', 'b', 'c']), false);

      assertEquals(assertNumberExpression({ $expr: 'MUL', $args: [1, 2] }), true);
      assertEquals(assertNumberExpression({ $expr: 'MUL', $args: ['$a', '$b'] }), true);
      assertEquals(assertNumberExpression({ $expr: 'MUL', $args: ['$a', '$b'] }, ['a', 'b', 'c']), true);
      assertEquals(assertNumberExpression({ $expr: 'MUL', $args: ['$a', '$MAIN.$b'] }, ['a', 'b', 'c']), true);
      assertEquals(assertNumberExpression({ $expr: 'MUL', $args: ['$a', '$C.$a'] }, ['a', 'b', '$C.$a']), true);
      assertEquals(assertNumberExpression({ $expr: 'MUL', $args: ['$d', '$c'] }, ['a', 'b', 'c']), false);
      assertEquals(assertNumberExpression({ $expr: 'MUL', $args: ['d', 'c'] }, ['a', 'b', 'c']), false);

      assertEquals(assertNumberExpression({ $expr: 'DIV', $args: [1, 2] }), true);
      assertEquals(assertNumberExpression({ $expr: 'DIV', $args: ['$a', '$b'] }), true);
      assertEquals(assertNumberExpression({ $expr: 'DIV', $args: ['$a', '$b'] }, ['a', 'b', 'c']), true);
      assertEquals(assertNumberExpression({ $expr: 'DIV', $args: ['$a', '$MAIN.$b'] }, ['a', 'b', 'c']), true);
      assertEquals(assertNumberExpression({ $expr: 'DIV', $args: ['$a', '$C.$a'] }, ['a', 'b', '$C.$a']), true);
      assertEquals(assertNumberExpression({ $expr: 'DIV', $args: ['$d', '$c'] }, ['a', 'b', 'c']), false);
      assertEquals(assertNumberExpression({ $expr: 'DIV', $args: ['d', 'c'] }, ['a', 'b', 'c']), false);

      assertEquals(assertNumberExpression({ $expr: 'MOD', $args: [1, 2] }), true);
      assertEquals(assertNumberExpression({ $expr: 'MOD', $args: ['$a', '$b'] }), true);
      assertEquals(assertNumberExpression({ $expr: 'MOD', $args: ['$a', '$b'] }, ['a', 'b', 'c']), true);
      assertEquals(assertNumberExpression({ $expr: 'MOD', $args: ['$a', '$MAIN.$b'] }, ['a', 'b', 'c']), true);
      assertEquals(assertNumberExpression({ $expr: 'MOD', $args: ['$a', '$C.$a'] }, ['a', 'b', '$C.$a']), true);
      assertEquals(assertNumberExpression({ $expr: 'MOD', $args: ['$d', '$c'] }, ['a', 'b', 'c']), false);
      assertEquals(assertNumberExpression({ $expr: 'MOD', $args: ['d', 'c'] }, ['a', 'b', 'c']), false);

      assertEquals(assertNumberExpression({ $expr: 'ABS', $args: 1 }), true);
      assertEquals(assertNumberExpression({ $expr: 'ABS', $args: '$a' }), true);
      assertEquals(assertNumberExpression({ $expr: 'ABS', $args: '$a' }, ['a']), true);
      assertEquals(assertNumberExpression({ $expr: 'ABS', $args: '$MAIN.$a' }, ['a', 'b']), true);
      assertEquals(assertNumberExpression({ $expr: 'ABS', $args: '$C.$a' }, ['a', 'b', '$C.$a']), true);
      assertEquals(assertNumberExpression({ $expr: 'ABS', $args: '$g' }, ['a', 'b', 'c', 'd']), false);
      assertEquals(assertNumberExpression({ $expr: 'ABS', $args: 'a' }, ['a']), false);

      assertEquals(assertNumberExpression({ $expr: 'CEIL', $args: 1 }), true);
      assertEquals(assertNumberExpression({ $expr: 'CEIL', $args: '$a' }), true);
      assertEquals(assertNumberExpression({ $expr: 'CEIL', $args: '$a' }, ['a']), true);
      assertEquals(assertNumberExpression({ $expr: 'CEIL', $args: '$MAIN.$a' }, ['a', 'b']), true);
      assertEquals(assertNumberExpression({ $expr: 'CEIL', $args: '$C.$a' }, ['a', 'b', '$C.$a']), true);
      assertEquals(assertNumberExpression({ $expr: 'CEIL', $args: '$g' }, ['a', 'b', 'c', 'd']), false);
      assertEquals(assertNumberExpression({ $expr: 'CEIL', $args: 'a' }, ['a']), false);

      assertEquals(assertNumberExpression({ $expr: 'FLOOR', $args: 1 }), true);
      assertEquals(assertNumberExpression({ $expr: 'FLOOR', $args: '$a' }), true);
      assertEquals(assertNumberExpression({ $expr: 'FLOOR', $args: '$a' }, ['a']), true);
      assertEquals(assertNumberExpression({ $expr: 'FLOOR', $args: '$MAIN.$a' }, ['a', 'b']), true);
      assertEquals(assertNumberExpression({ $expr: 'FLOOR', $args: '$C.$a' }, ['a', 'b', '$C.$a']), true);
      assertEquals(assertNumberExpression({ $expr: 'FLOOR', $args: '$g' }, ['a', 'b', 'c', 'd']), false);
      assertEquals(assertNumberExpression({ $expr: 'FLOOR', $args: 'a' }, ['a']), false);

      assertEquals(assertNumberExpression({ $expr: 'LENGTH', $args: 'a' }), true);
      assertEquals(assertNumberExpression({ $expr: 'LENGTH', $args: '$a' }), true);
      assertEquals(assertNumberExpression({ $expr: 'LENGTH', $args: '$a' }, ['a']), true);
      assertEquals(assertNumberExpression({ $expr: 'LENGTH', $args: '$MAIN.$a' }, ['a', 'b']), true);
      assertEquals(assertNumberExpression({ $expr: 'LENGTH', $args: '$C.$a' }, ['a', 'b', '$C.$a']), true);
      // THIS IS A BUG 
      assertEquals(assertNumberExpression({ $expr: 'LENGTH', $args: '$g' }, ['a', 'b', 'c', 'd']), true);
      assertEquals(assertNumberExpression({ $expr: 'LENGTH', $args: 1 }, ['a']), false);

      assertEquals(assertNumberExpression({ $expr: 'DATE_DIFF', $args: ['YEAR', { $expr: 'NOW'}, { $expr: 'NOW'}] }), true);
      assertEquals(assertNumberExpression({ $expr: 'DATE_DIFF', $args: ['MONTH', { $expr: 'NOW'}, { $expr: 'NOW'}] }), true);
      assertEquals(assertNumberExpression({ $expr: 'DATE_DIFF', $args: ['DAY', { $expr: 'NOW'}, { $expr: 'NOW'}] }), true);
      assertEquals(assertNumberExpression({ $expr: 'DATE_DIFF', $args: ['HOUR', { $expr: 'NOW'}, { $expr: 'NOW'}] }), true);
      assertEquals(assertNumberExpression({ $expr: 'DATE_DIFF', $args: ['MINUTE', { $expr: 'NOW'}, { $expr: 'NOW'}] }), true);
      assertEquals(assertNumberExpression({ $expr: 'DATE_DIFF', $args: ['SECOND', { $expr: 'NOW'}, { $expr: 'NOW'}] }), true);
      assertEquals(assertNumberExpression({ $expr: 'DATE_DIFF', $args: ['YEAR', { $expr: 'NOW'}, { $expr: 'NOW'}] }, ['a']), true);
      assertEquals(assertNumberExpression({ $expr: 'DATE_DIFF', $args: ['YEAR', { $expr: 'NOW'}, '$a'] }, ['a', 'b']), true);
      assertEquals(assertNumberExpression({ $expr: 'DATE_DIFF', $args: ['YEAR', { $expr: 'NOW'}, '$MAIN.$a'] }, ['a']), true);
      assertEquals(assertNumberExpression({ $expr: 'DATE_DIFF', $args: ['YEAR', { $expr: 'NOW'}, '$C.$a'] }, ['a', 'b', '$C.$a']), true);
      assertEquals(assertNumberExpression({ $expr: 'DATE_DIFF', $args: ['YEAR', { $expr: 'NOW'}, '$g'] }, ['a', 'b', 'c', 'd']), false);
      assertEquals(assertNumberExpression({ $expr: 'DATE_DIFF', $args: ['YEAR', { $expr: 'NOW'}, 'a'] }, ['a']), false);
      
      assertEquals(assertNumberExpression({ $expr: 'DATE_DIFF', $args: ['SECONDF', { $expr: 'NOW'}, { $expr: 'NOW'}] }), false);
    });

    await t.step('String', () => {
      assertEquals(assertStringExpression({ $expr: 'UUID' }), true);

      assertEquals(assertStringExpression({ $expr: 'CONCAT', $args: ['a', 'b'] }), true);
      assertEquals(assertStringExpression({ $expr: 'CONCAT', $args: ['$a', '$b'] }), true);
      assertEquals(assertStringExpression({ $expr: 'CONCAT', $args: ['$a', '$b'] }, ['a', 'b', 'c']), true);
      assertEquals(assertStringExpression({ $expr: 'CONCAT', $args: ['$a', '$MAIN.$b'] }, ['a', 'b', 'c']), true);
      assertEquals(assertStringExpression({ $expr: 'CONCAT', $args: ['$a', '$C.$a'] }, ['a', 'b', '$C.$a']), true);
      assertEquals(assertStringExpression({ $expr: 'CONCAT', $args: 'sdf' }), false);
      assertEquals(assertStringExpression({ $expr: 'CONCAT', $args: ['d', { $expr: 'CONCAT', $args: ['sdf', 'df'] }] }), false); // Non string expression
      assertEquals(assertStringExpression({ $expr: 'CONCAT', $args: ['$d', '$c'] }, ['a', 'b', 'c']), true); // THIS MAY BE A BUG. 
      assertEquals(assertStringExpression({ $expr: 'CONCAT', $args: ['d', 1] }, ['a', 'b', 'c']), false); // Adding number
      assertEquals(assertStringExpression({ $expr: 'CONCAT', $args: ['d', { $expr: 'LENGTH', $args: 'sdf' }] }), false); // Non string expression


    });

    await t.step('JSON', () => {
      assertEquals(assertJSONExpression({ $expr: 'JSON_VALUE', $args: ['$a', ['a', 'b', 'c']] }), true);
      assertEquals(assertJSONExpression({ $expr: 'JSON_VALUE', $args: ['$a', ['a', 'b', 'c']] }, ['a', 'b', 'c']), true);
      assertEquals(assertJSONExpression({ $expr: 'JSON_VALUE', $args: ['$MAIN.$a', ['a', 'b', 'c']] }, ['a', 'b', 'c']), true);
      assertEquals(assertJSONExpression({ $expr: 'JSON_VALUE', $args: ['$B.$c', ['a', 'b', 'c']] }, ['a', '$B.$c', 'c']), true);
      assertEquals(assertJSONExpression({ $expr: 'JSON_VALUE', $args: ['a', ['a', 'b', 'c']] }, ['a', 'b', 'c']), false);
    });


  });
})