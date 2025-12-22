import * as asserts from '$asserts';
import { assertExpression, isExpression } from './Expression.ts';

Deno.test('oql.asserts.Expressions.mod', async (t) => {
  await t.step('assertExpression', async (u) => {
    await u.step('valid: Date expressions', () => {
      assertExpression({ type: 'NOW' });
      assertExpression({ type: 'CURRENT_DATE' });
      assertExpression({ type: 'CURRENT_TIME' });
      assertExpression({ type: 'CURRENT_TIMESTAMP' });
      assertExpression({ type: 'CURRENT_TIMESTAMPTZ' });
      assertExpression({
        type: 'DATE_ADD',
        args: { date: new Date(), amount: 7, unit: 'DAYS' },
      });
    });

    await u.step('valid: Numeric expressions', () => {
      assertExpression({ type: 'ADD', args: [1, 2, 3] });
      assertExpression({ type: 'SUBTRACT', args: [10, 3, 2] });
      assertExpression({ type: 'MULTIPLY', args: [2, 3, 4] });
      assertExpression({ type: 'DIVIDE', args: [10, 2] });
      assertExpression({ type: 'MODULO', args: [10, 3] });
      assertExpression({ type: 'ABS', args: [-42] });
      assertExpression({ type: 'CEIL', args: [4.5] });
      assertExpression({ type: 'FLOOR', args: [4.8] });
      assertExpression({ type: 'ROUND', args: [4.5] });
      assertExpression({ type: 'POWER', args: { base: 2, exponent: 3 } });
      assertExpression({ type: 'SQRT', args: [16] });
      assertExpression({ type: 'LENGTH', args: 'Hello World' });
      assertExpression({
        type: 'DATE_DIFF',
        args: { from: new Date(), to: new Date(), unit: 'DAYS' },
      });
    });

    await u.step('valid: String expressions', () => {
      assertExpression({ type: 'UUID' });
      assertExpression({ type: 'CONCAT', args: ['Hello', ' ', 'World'] });
      assertExpression({ type: 'LOWER', args: 'HELLO' });
      assertExpression({ type: 'UPPER', args: 'hello' });
      assertExpression({ type: 'TRIM', args: '  hello  ' });
      assertExpression({ type: 'LTRIM', args: '  hello' });
      assertExpression({ type: 'RTRIM', args: 'hello  ' });
      assertExpression({
        type: 'SUBSTR',
        args: { string: 'Hello World', start: 0, length: 5 },
      });
      assertExpression({
        type: 'REPLACE',
        args: { string: 'Hello World', search: 'World', replace: 'There' },
      });
      assertExpression({
        type: 'LPAD',
        args: { string: '42', length: 5, fill: '0' },
      });
      assertExpression({
        type: 'RPAD',
        args: { string: '42', length: 5, fill: '0' },
      });
      assertExpression({
        type: 'ENCRYPT',
        args: { secret: 'my-key', data: 'sensitive' },
      });
      assertExpression({
        type: 'DECRYPT',
        args: { secret: 'my-key', data: 'encrypted-data' },
      });
      assertExpression({ type: 'HASH', args: 'password123' });
    });

    await u.step('invalid: unknown type', () => {
      asserts.assertThrows(
        () => assertExpression({ type: 'INVALID_TYPE' } as any),
        TypeError,
        "Unknown expression type 'INVALID_TYPE'",
      );
    });

    await u.step('invalid: not an object', () => {
      asserts.assertThrows(
        () => assertExpression('not an object' as any),
        TypeError,
        'Expected object',
      );
    });

    await u.step('invalid: null', () => {
      asserts.assertThrows(
        () => assertExpression(null as any),
        TypeError,
        'Expected object',
      );
    });

    await u.step('invalid: missing type', () => {
      asserts.assertThrows(
        () => assertExpression({ args: [] } as any),
        TypeError,
        "Missing 'type' property",
      );
    });
  });

  await t.step('assertExpression with column validation', async (u) => {
    await u.step('valid: numeric with column list', () => {
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

    await u.step('valid: string with column list', () => {
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

    await u.step('valid: date with column list', () => {
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

    await u.step('invalid: column not in list', () => {
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
  });

  await t.step('isExpression', async (u) => {
    await u.step('valid: date expressions', () => {
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

    await u.step('valid: numeric expressions', () => {
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

    await u.step('valid: string expressions', () => {
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

    await u.step('invalid: expressions', () => {
      asserts.assertEquals(isExpression({ type: 'INVALID' }), false);
      asserts.assertEquals(isExpression('not an object'), false);
      asserts.assertEquals(isExpression(null), false);
      asserts.assertEquals(isExpression({ args: [] }), false);
      asserts.assertEquals(isExpression(123), false);
    });

    await u.step('valid: with column validation', () => {
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
  });

  await t.step('integration tests', async (u) => {
    await u.step('filter all expression types', () => {
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

    await u.step('validate mixed expressions with columns', () => {
      const columns = [
        'price',
        'quantity',
        'discount',
        'first_name',
        'last_name',
        'created_at',
      ];

      assertExpression(
        { type: 'MULTIPLY', args: ['@price', '@quantity'] },
        columns,
      );

      assertExpression(
        { type: 'CONCAT', args: ['@first_name', ' ', '@last_name'] },
        columns,
      );

      assertExpression(
        {
          type: 'DATE_ADD',
          args: { date: '@created_at', amount: 30, unit: 'DAYS' },
        },
        columns,
      );

      asserts.assertThrows(
        () =>
          assertExpression(
            { type: 'ADD', args: ['@invalid_column'] },
            columns,
          ),
        TypeError,
      );
    });

    await u.step('type narrowing works correctly', () => {
      const expr1: unknown = { type: 'NOW' };
      if (isExpression(expr1)) {
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

    await u.step('comprehensive category delegation', () => {
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
        const expr =
          type === 'SUBTRACT' || type === 'DIVIDE' || type === 'MODULO'
            ? { type, args: [10, 2] }
            : { type, args: [5] };
        asserts.assertEquals(isExpression(expr), true);
      }

      const stringTypes = ['UUID', 'LOWER', 'UPPER', 'TRIM', 'LTRIM', 'RTRIM'];
      for (const type of stringTypes) {
        const expr = type === 'UUID' ? { type } : { type, args: 'test' };
        asserts.assertEquals(isExpression(expr), true);
      }
    });

    await u.step('complex nested validation', () => {
      const columns = [
        'base_price',
        'discount_percent',
        'tax_rate',
        'quantity',
        'product_name',
        'category',
        'created_at',
      ];

      assertExpression(
        {
          type: 'MULTIPLY',
          args: ['@base_price', '@quantity'],
        },
        columns,
      );

      assertExpression(
        {
          type: 'CONCAT',
          args: ['@category', ' - ', '@product_name'],
        },
        columns,
      );

      assertExpression(
        {
          type: 'DATE_ADD',
          args: { date: '@created_at', amount: 90, unit: 'DAYS' },
        },
        columns,
      );

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

    await u.step('edge cases and boundary conditions', () => {
      asserts.assertEquals(isExpression({ type: 'ADD', args: [] }), false);
      asserts.assertEquals(isExpression({ type: 'CONCAT', args: [] }), false);

      asserts.assertEquals(isExpression({ type: 'ADD', args: [1] }), true);
      asserts.assertEquals(isExpression({ type: 'CONCAT', args: ['a'] }), true);

      asserts.assertEquals(isExpression({ type: 'NOW' }), true);
      asserts.assertEquals(isExpression({ type: 'UUID' }), true);

      asserts.assertEquals(
        isExpression({ type: 'POWER', args: [2, 3] }),
        false,
      );
      asserts.assertEquals(
        isExpression({ type: 'POWER', args: { base: 2, exponent: 3 } }),
        true,
      );
    });
  });
});
