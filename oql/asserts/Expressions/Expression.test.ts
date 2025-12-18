import * as asserts from '$asserts';
import { assertExpression, isExpression } from './Expression.ts';

Deno.test('oql.asserts.Expressions.mod', async (t) => {
  //#region assertExpression - Date Expressions

  await t.step('assertExpression - delegates to NOW', () => {
    assertExpression({ type: 'NOW' });
  });

  await t.step('assertExpression - delegates to CURRENT_DATE', () => {
    assertExpression({ type: 'CURRENT_DATE' });
  });

  await t.step('assertExpression - delegates to CURRENT_TIME', () => {
    assertExpression({ type: 'CURRENT_TIME' });
  });

  await t.step('assertExpression - delegates to CURRENT_TIMESTAMP', () => {
    assertExpression({ type: 'CURRENT_TIMESTAMP' });
  });

  await t.step('assertExpression - delegates to CURRENT_TIMESTAMPTZ', () => {
    assertExpression({ type: 'CURRENT_TIMESTAMPTZ' });
  });

  await t.step('assertExpression - delegates to DATE_ADD', () => {
    assertExpression({
      type: 'DATE_ADD',
      args: { date: new Date(), amount: 7, unit: 'DAYS' },
    });
  });

  //#endregion assertExpression - Date Expressions

  //#region assertExpression - Numeric Expressions

  await t.step('assertExpression - delegates to ADD', () => {
    assertExpression({ type: 'ADD', args: [1, 2, 3] });
  });

  await t.step('assertExpression - delegates to SUBTRACT', () => {
    assertExpression({ type: 'SUBTRACT', args: [10, 3, 2] });
  });

  await t.step('assertExpression - delegates to MULTIPLY', () => {
    assertExpression({ type: 'MULTIPLY', args: [2, 3, 4] });
  });

  await t.step('assertExpression - delegates to DIVIDE', () => {
    assertExpression({ type: 'DIVIDE', args: [10, 2] });
  });

  await t.step('assertExpression - delegates to MODULO', () => {
    assertExpression({ type: 'MODULO', args: [10, 3] });
  });

  await t.step('assertExpression - delegates to ABS', () => {
    assertExpression({ type: 'ABS', args: [-42] });
  });

  await t.step('assertExpression - delegates to CEIL', () => {
    assertExpression({ type: 'CEIL', args: [4.5] });
  });

  await t.step('assertExpression - delegates to FLOOR', () => {
    assertExpression({ type: 'FLOOR', args: [4.8] });
  });

  await t.step('assertExpression - delegates to ROUND', () => {
    assertExpression({ type: 'ROUND', args: [4.5] });
  });

  await t.step('assertExpression - delegates to POWER', () => {
    assertExpression({ type: 'POWER', args: { base: 2, exponent: 3 } });
  });

  await t.step('assertExpression - delegates to SQRT', () => {
    assertExpression({ type: 'SQRT', args: [16] });
  });

  await t.step('assertExpression - delegates to LENGTH', () => {
    assertExpression({ type: 'LENGTH', args: 'Hello World' });
  });

  await t.step('assertExpression - delegates to DATE_DIFF', () => {
    assertExpression({
      type: 'DATE_DIFF',
      args: { from: new Date(), to: new Date(), unit: 'DAYS' },
    });
  });

  //#endregion assertExpression - Numeric Expressions

  //#region assertExpression - String Expressions

  await t.step('assertExpression - delegates to UUID', () => {
    assertExpression({ type: 'UUID' });
  });

  await t.step('assertExpression - delegates to CONCAT', () => {
    assertExpression({ type: 'CONCAT', args: ['Hello', ' ', 'World'] });
  });

  await t.step('assertExpression - delegates to LOWER', () => {
    assertExpression({ type: 'LOWER', args: 'HELLO' });
  });

  await t.step('assertExpression - delegates to UPPER', () => {
    assertExpression({ type: 'UPPER', args: 'hello' });
  });

  await t.step('assertExpression - delegates to TRIM', () => {
    assertExpression({ type: 'TRIM', args: '  hello  ' });
  });

  await t.step('assertExpression - delegates to LTRIM', () => {
    assertExpression({ type: 'LTRIM', args: '  hello' });
  });

  await t.step('assertExpression - delegates to RTRIM', () => {
    assertExpression({ type: 'RTRIM', args: 'hello  ' });
  });

  await t.step('assertExpression - delegates to SUBSTR', () => {
    assertExpression({
      type: 'SUBSTR',
      args: { string: 'Hello World', start: 0, length: 5 },
    });
  });

  await t.step('assertExpression - delegates to REPLACE', () => {
    assertExpression({
      type: 'REPLACE',
      args: { string: 'Hello World', search: 'World', replace: 'There' },
    });
  });

  await t.step('assertExpression - delegates to LPAD', () => {
    assertExpression({
      type: 'LPAD',
      args: { string: '42', length: 5, fill: '0' },
    });
  });

  await t.step('assertExpression - delegates to RPAD', () => {
    assertExpression({
      type: 'RPAD',
      args: { string: '42', length: 5, fill: '0' },
    });
  });

  await t.step('assertExpression - delegates to ENCRYPT', () => {
    assertExpression({
      type: 'ENCRYPT',
      args: { secret: 'my-key', data: 'sensitive' },
    });
  });

  await t.step('assertExpression - delegates to DECRYPT', () => {
    assertExpression({
      type: 'DECRYPT',
      args: { secret: 'my-key', data: 'encrypted-data' },
    });
  });

  await t.step('assertExpression - delegates to HASH', () => {
    assertExpression({ type: 'HASH', args: 'password123' });
  });

  //#endregion assertExpression - String Expressions

  //#region assertExpression - Invalid Cases

  await t.step('assertExpression - invalid: unknown type', () => {
    asserts.assertThrows(
      () => assertExpression({ type: 'INVALID_TYPE' } as any),
      TypeError,
      "Unknown expression type 'INVALID_TYPE'",
    );
  });

  await t.step('assertExpression - invalid: not an object', () => {
    asserts.assertThrows(
      () => assertExpression('not an object' as any),
      TypeError,
      'Expected object',
    );
  });

  await t.step('assertExpression - invalid: null', () => {
    asserts.assertThrows(
      () => assertExpression(null as any),
      TypeError,
      'Expected object',
    );
  });

  await t.step('assertExpression - invalid: missing type', () => {
    asserts.assertThrows(
      () => assertExpression({ args: [] } as any),
      TypeError,
      "Missing 'type' property",
    );
  });

  //#endregion assertExpression - Invalid Cases

  //#region assertExpression - With Column Validation

  await t.step('assertExpression - valid with column list (numeric)', () => {
    const columns = ['price', 'tax', 'quantity'];

    assertExpression(
      { type: 'ADD', args: ['@price', '@tax'] },
      columns,
    );

    assertExpression(
      { type: 'MULTIPLY', args: ['@price', '@quantity'] },
      columns,
    );
  });

  await t.step('assertExpression - valid with column list (string)', () => {
    const columns = ['first_name', 'last_name', 'email'];

    assertExpression(
      { type: 'CONCAT', args: ['@first_name', ' ', '@last_name'] },
      columns,
    );

    assertExpression(
      { type: 'LOWER', args: '@email' },
      columns,
    );
  });

  await t.step('assertExpression - valid with column list (date)', () => {
    const columns = ['created_at', 'updated_at'];

    assertExpression(
      {
        type: 'DATE_ADD',
        args: { date: '@created_at', amount: 7, unit: 'DAYS' },
      },
      columns,
    );

    assertExpression(
      {
        type: 'DATE_DIFF',
        args: { from: '@created_at', to: '@updated_at', unit: 'HOURS' },
      },
      columns,
    );
  });

  await t.step('assertExpression - invalid: column not in list', () => {
    const columns = ['price', 'tax'];

    asserts.assertThrows(
      () =>
        assertExpression(
          { type: 'ADD', args: ['@price', '@invalid'] },
          columns,
        ),
      TypeError,
    );
  });

  //#endregion assertExpression - With Column Validation

  //#region isExpression Tests

  await t.step('isExpression - valid date expressions', () => {
    asserts.assertEquals(isExpression({ type: 'NOW' }), true);
    asserts.assertEquals(isExpression({ type: 'CURRENT_DATE' }), true);
    asserts.assertEquals(
      isExpression({
        type: 'DATE_ADD',
        args: { date: new Date(), amount: 7, unit: 'DAYS' },
      }),
      true,
    );
  });

  await t.step('isExpression - valid numeric expressions', () => {
    asserts.assertEquals(isExpression({ type: 'ADD', args: [1, 2] }), true);
    asserts.assertEquals(
      isExpression({ type: 'MULTIPLY', args: [3, 4] }),
      true,
    );
    asserts.assertEquals(isExpression({ type: 'ABS', args: [-42] }), true);
    asserts.assertEquals(isExpression({ type: 'SQRT', args: [16] }), true);
    asserts.assertEquals(
      isExpression({ type: 'LENGTH', args: 'test' }),
      true,
    );
  });

  await t.step('isExpression - valid string expressions', () => {
    asserts.assertEquals(isExpression({ type: 'UUID' }), true);
    asserts.assertEquals(
      isExpression({ type: 'CONCAT', args: ['a', 'b'] }),
      true,
    );
    asserts.assertEquals(
      isExpression({ type: 'LOWER', args: 'test' }),
      true,
    );
    asserts.assertEquals(
      isExpression({ type: 'UPPER', args: 'TEST' }),
      true,
    );
    asserts.assertEquals(isExpression({ type: 'HASH', args: 'data' }), true);
  });

  await t.step('isExpression - invalid expressions', () => {
    asserts.assertEquals(isExpression({ type: 'INVALID' }), false);
    asserts.assertEquals(isExpression('not an object'), false);
    asserts.assertEquals(isExpression(null), false);
    asserts.assertEquals(isExpression({ args: [] }), false);
    asserts.assertEquals(isExpression(123), false);
  });

  await t.step('isExpression - with column validation', () => {
    const columns = ['price', 'quantity'];

    asserts.assertEquals(
      isExpression({ type: 'ADD', args: ['@price', '@quantity'] }, columns),
      true,
    );

    asserts.assertEquals(
      isExpression({ type: 'ADD', args: ['@invalid'] }, columns),
      false,
    );
  });

  //#endregion isExpression Tests

  //#region Integration Tests

  await t.step('Integration: filter all expression types', () => {
    const expressions: unknown[] = [
      { type: 'NOW' },
      { type: 'ADD', args: [1, 2] },
      { type: 'CONCAT', args: ['a', 'b'] },
      'invalid',
      null,
      { type: 'INVALID' },
      { type: 'MULTIPLY', args: [3, 4] },
      { type: 'UUID' },
      { type: 'CURRENT_DATE' },
      123,
    ];

    const validExpressions = expressions.filter((x) => isExpression(x));

    asserts.assertEquals(validExpressions.length, 6);
  });

  await t.step('Integration: validate mixed expressions with columns', () => {
    const columns = [
      'price',
      'quantity',
      'discount',
      'first_name',
      'last_name',
      'created_at',
    ];

    // Numeric expression
    assertExpression(
      { type: 'MULTIPLY', args: ['@price', '@quantity'] },
      columns,
    );

    // String expression
    assertExpression(
      { type: 'CONCAT', args: ['@first_name', ' ', '@last_name'] },
      columns,
    );

    // Date expression
    assertExpression(
      {
        type: 'DATE_ADD',
        args: { date: '@created_at', amount: 30, unit: 'DAYS' },
      },
      columns,
    );

    // Invalid column in any category
    asserts.assertThrows(
      () =>
        assertExpression(
          { type: 'ADD', args: ['@invalid_column'] },
          columns,
        ),
      TypeError,
    );
  });

  await t.step('Integration: type narrowing works correctly', () => {
    const expr1: unknown = { type: 'NOW' };
    if (isExpression(expr1)) {
      // TypeScript narrows to Expressions union
      asserts.assertEquals(expr1.type, 'NOW');
    }

    const expr2: unknown = { type: 'ADD', args: [1, 2, 3] };
    if (isExpression(expr2)) {
      asserts.assertEquals(expr2.type, 'ADD');
    }

    const expr3: unknown = { type: 'CONCAT', args: ['a', 'b'] };
    if (isExpression(expr3)) {
      asserts.assertEquals(expr3.type, 'CONCAT');
    }
  });

  await t.step('Integration: comprehensive category delegation', () => {
    // All date expression types
    const dateTypes = [
      'NOW',
      'CURRENT_DATE',
      'CURRENT_TIME',
      'CURRENT_TIMESTAMP',
      'CURRENT_TIMESTAMPTZ',
    ];
    for (const type of dateTypes) {
      asserts.assertEquals(isExpression({ type }), true);
    }

    // Sample of numeric expression types
    const numericTypes = [
      'ADD',
      'SUBTRACT',
      'MULTIPLY',
      'DIVIDE',
      'MODULO',
      'ABS',
      'CEIL',
      'FLOOR',
      'ROUND',
      'SQRT',
    ];
    for (const type of numericTypes) {
      const expr = type === 'SUBTRACT' || type === 'DIVIDE' || type === 'MODULO'
        ? { type, args: [10, 2] }
        : { type, args: [5] };
      asserts.assertEquals(isExpression(expr), true);
    }

    // Sample of string expression types
    const stringTypes = ['UUID', 'LOWER', 'UPPER', 'TRIM', 'LTRIM', 'RTRIM'];
    for (const type of stringTypes) {
      const expr = type === 'UUID' ? { type } : { type, args: 'test' };
      asserts.assertEquals(isExpression(expr), true);
    }
  });

  await t.step('Integration: complex nested validation', () => {
    const columns = [
      'base_price',
      'discount_percent',
      'tax_rate',
      'quantity',
      'product_name',
      'category',
      'created_at',
    ];

    // Numeric calculations
    assertExpression(
      {
        type: 'MULTIPLY',
        args: ['@base_price', '@quantity'],
      },
      columns,
    );

    // String manipulations
    assertExpression(
      {
        type: 'CONCAT',
        args: ['@category', ' - ', '@product_name'],
      },
      columns,
    );

    // Date operations
    assertExpression(
      {
        type: 'DATE_ADD',
        args: { date: '@created_at', amount: 90, unit: 'DAYS' },
      },
      columns,
    );

    // All should fail with invalid column
    const invalidCases = [
      { type: 'ADD', args: ['@invalid'] },
      { type: 'LOWER', args: '@invalid' },
      {
        type: 'DATE_ADD',
        args: { date: '@invalid', amount: 1, unit: 'DAYS' },
      },
    ];

    for (const invalidCase of invalidCases) {
      asserts.assertThrows(
        () => assertExpression(invalidCase as any, columns),
        TypeError,
      );
    }
  });

  await t.step('Integration: edge cases and boundary conditions', () => {
    // Empty arrays should fail where required
    asserts.assertEquals(isExpression({ type: 'ADD', args: [] }), false);
    asserts.assertEquals(isExpression({ type: 'CONCAT', args: [] }), false);

    // Minimum valid args
    asserts.assertEquals(isExpression({ type: 'ADD', args: [1] }), true);
    asserts.assertEquals(isExpression({ type: 'CONCAT', args: ['a'] }), true);

    // Type checking with no args (valid for some types)
    asserts.assertEquals(isExpression({ type: 'NOW' }), true);
    asserts.assertEquals(isExpression({ type: 'UUID' }), true);

    // Invalid structures
    asserts.assertEquals(isExpression({ type: 'POWER', args: [2, 3] }), false); // Should be object
    asserts.assertEquals(
      isExpression({ type: 'POWER', args: { base: 2, exponent: 3 } }),
      true,
    );
  });

  //#endregion Integration Tests
});
