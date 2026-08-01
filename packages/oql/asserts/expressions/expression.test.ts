import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { assertExpression, isExpression } from './expression.ts';

describe('oql.asserts.Expressions.mod', () => {
  describe('assertExpression', () => {
    it('valid: Date expressions', () => {
      assertExpression({ $$_expression: 'NOW' });
      assertExpression({ $$_expression: 'CURRENT_DATE' });
      assertExpression({ $$_expression: 'CURRENT_TIME' });
      assertExpression({ $$_expression: 'CURRENT_TIMESTAMP' });
      assertExpression({ $$_expression: 'CURRENT_TIMESTAMPTZ' });
      assertExpression({
        $$_expression: 'DATE_ADD',
        args: { date: new Date(), amount: 7, unit: 'DAYS' },
      });
    });

    it('valid: Numeric expressions', () => {
      assertExpression({ $$_expression: 'ADD', args: [1, 2, 3] });
      assertExpression({ $$_expression: 'SUBTRACT', args: [10, 3, 2] });
      assertExpression({ $$_expression: 'MULTIPLY', args: [2, 3, 4] });
      assertExpression({ $$_expression: 'DIVIDE', args: [10, 2] });
      assertExpression({ $$_expression: 'MODULO', args: [10, 3] });
      assertExpression({ $$_expression: 'ABS', args: [-42] });
      assertExpression({ $$_expression: 'CEIL', args: [4.5] });
      assertExpression({ $$_expression: 'FLOOR', args: [4.8] });
      assertExpression({ $$_expression: 'ROUND', args: [4.5] });
      assertExpression({
        $$_expression: 'POWER',
        args: { base: 2, exponent: 3 },
      });
      assertExpression({ $$_expression: 'SQRT', args: [16] });
      assertExpression({ $$_expression: 'LENGTH', args: 'Hello World' });
      assertExpression({
        $$_expression: 'DATE_DIFF',
        args: { from: new Date(), to: new Date(), unit: 'DAYS' },
      });
    });

    it('valid: String expressions', () => {
      assertExpression({ $$_expression: 'UUID' });
      assertExpression({
        $$_expression: 'CONCAT',
        args: ['Hello', ' ', 'World'],
      });
      assertExpression({ $$_expression: 'LOWER', args: 'HELLO' });
      assertExpression({ $$_expression: 'UPPER', args: 'hello' });
      assertExpression({ $$_expression: 'TRIM', args: '  hello  ' });
      assertExpression({ $$_expression: 'LTRIM', args: '  hello' });
      assertExpression({ $$_expression: 'RTRIM', args: 'hello  ' });
      assertExpression({
        $$_expression: 'SUBSTR',
        args: { string: 'Hello World', start: 0, length: 5 },
      });
      assertExpression({
        $$_expression: 'REPLACE',
        args: { string: 'Hello World', search: 'World', replace: 'There' },
      });
      assertExpression({
        $$_expression: 'LPAD',
        args: { string: '42', length: 5, fill: '0' },
      });
      assertExpression({
        $$_expression: 'RPAD',
        args: { string: '42', length: 5, fill: '0' },
      });
      assertExpression({
        $$_expression: 'ENCRYPT',
        args: { secret: 'my-key', data: 'sensitive' },
      });
      assertExpression({
        $$_expression: 'DECRYPT',
        args: { secret: 'my-key', data: 'encrypted-data' },
      });
      assertExpression({ $$_expression: 'HASH', args: 'password123' });
    });

    it('invalid: unknown type', () => {
      asserts.assertThrows(
        () => assertExpression({ $$_expression: 'INVALID_TYPE' } as any),
        TypeError,
        "Unknown expression type 'INVALID_TYPE'",
      );
    });

    it('invalid: not an object', () => {
      asserts.assertThrows(
        () => assertExpression('not an object' as any),
        TypeError,
        'Expected object',
      );
    });

    it('invalid: null', () => {
      asserts.assertThrows(
        () => assertExpression(null as any),
        TypeError,
        'Expected object',
      );
    });

    it('invalid: missing type', () => {
      asserts.assertThrows(
        () => assertExpression({ args: [] } as any),
        TypeError,
        "Missing '$$_expression' property",
      );
    });
  });

  describe('assertExpression with column validation', () => {
    it('valid: numeric with column list', () => {
      const columns = ['price', 'tax', 'quantity'];

      assertExpression(
        { $$_expression: 'ADD', args: ['@price', '@tax'] },
        columns,
      );

      assertExpression(
        { $$_expression: 'MULTIPLY', args: ['@price', '@quantity'] },
        columns,
      );
    });

    it('valid: string with column list', () => {
      const columns = ['first_name', 'last_name', 'email'];

      assertExpression(
        { $$_expression: 'CONCAT', args: ['@first_name', ' ', '@last_name'] },
        columns,
      );

      assertExpression(
        { $$_expression: 'LOWER', args: '@email' },
        columns,
      );
    });

    it('valid: date with column list', () => {
      const columns = ['created_at', 'updated_at'];

      assertExpression(
        {
          $$_expression: 'DATE_ADD',
          args: { date: '@created_at', amount: 7, unit: 'DAYS' },
        },
        columns,
      );

      assertExpression(
        {
          $$_expression: 'DATE_DIFF',
          args: { from: '@created_at', to: '@updated_at', unit: 'HOURS' },
        },
        columns,
      );
    });

    it('invalid: column not in list', () => {
      const columns = ['price', 'tax'];

      asserts.assertThrows(
        () =>
          assertExpression(
            { $$_expression: 'ADD', args: ['@price', '@invalid'] },
            columns,
          ),
        TypeError,
      );
    });
  });

  describe('isExpression', () => {
    it('valid: date expressions', () => {
      asserts.assertEquals(isExpression({ $$_expression: 'NOW' }), true);
      asserts.assertEquals(
        isExpression({ $$_expression: 'CURRENT_DATE' }),
        true,
      );
      asserts.assertEquals(
        isExpression({
          $$_expression: 'DATE_ADD',
          args: { date: new Date(), amount: 7, unit: 'DAYS' },
        }),
        true,
      );
    });

    it('valid: numeric expressions', () => {
      asserts.assertEquals(
        isExpression({ $$_expression: 'ADD', args: [1, 2] }),
        true,
      );
      asserts.assertEquals(
        isExpression({ $$_expression: 'MULTIPLY', args: [3, 4] }),
        true,
      );
      asserts.assertEquals(
        isExpression({ $$_expression: 'ABS', args: [-42] }),
        true,
      );
      asserts.assertEquals(
        isExpression({ $$_expression: 'SQRT', args: [16] }),
        true,
      );
      asserts.assertEquals(
        isExpression({ $$_expression: 'LENGTH', args: 'test' }),
        true,
      );
    });

    it('valid: string expressions', () => {
      asserts.assertEquals(isExpression({ $$_expression: 'UUID' }), true);
      asserts.assertEquals(
        isExpression({ $$_expression: 'CONCAT', args: ['a', 'b'] }),
        true,
      );
      asserts.assertEquals(
        isExpression({ $$_expression: 'LOWER', args: 'test' }),
        true,
      );
      asserts.assertEquals(
        isExpression({ $$_expression: 'UPPER', args: 'TEST' }),
        true,
      );
      asserts.assertEquals(
        isExpression({ $$_expression: 'HASH', args: 'data' }),
        true,
      );
    });

    it('invalid: expressions', () => {
      asserts.assertEquals(isExpression({ $$_expression: 'INVALID' }), false);
      asserts.assertEquals(isExpression('not an object'), false);
      asserts.assertEquals(isExpression(null), false);
      asserts.assertEquals(isExpression({ args: [] }), false);
      asserts.assertEquals(isExpression(123), false);
    });

    it('valid: with column validation', () => {
      const columns = ['price', 'quantity'];

      asserts.assertEquals(
        isExpression(
          { $$_expression: 'ADD', args: ['@price', '@quantity'] },
          columns,
        ),
        true,
      );

      asserts.assertEquals(
        isExpression({ $$_expression: 'ADD', args: ['@invalid'] }, columns),
        false,
      );
    });
  });

  describe('integration tests', () => {
    it('filter all expression types', () => {
      const expressions: unknown[] = [
        { $$_expression: 'NOW' },
        { $$_expression: 'ADD', args: [1, 2] },
        { $$_expression: 'CONCAT', args: ['a', 'b'] },
        'invalid',
        null,
        { $$_expression: 'INVALID' },
        { $$_expression: 'MULTIPLY', args: [3, 4] },
        { $$_expression: 'UUID' },
        { $$_expression: 'CURRENT_DATE' },
        123,
      ];

      const validExpressions = expressions.filter((x) => isExpression(x));

      asserts.assertEquals(validExpressions.length, 6);
    });

    it('validate mixed expressions with columns', () => {
      const columns = [
        'price',
        'quantity',
        'discount',
        'first_name',
        'last_name',
        'created_at',
      ];

      assertExpression(
        { $$_expression: 'MULTIPLY', args: ['@price', '@quantity'] },
        columns,
      );

      assertExpression(
        { $$_expression: 'CONCAT', args: ['@first_name', ' ', '@last_name'] },
        columns,
      );

      assertExpression(
        {
          $$_expression: 'DATE_ADD',
          args: { date: '@created_at', amount: 30, unit: 'DAYS' },
        },
        columns,
      );

      asserts.assertThrows(
        () =>
          assertExpression(
            { $$_expression: 'ADD', args: ['@invalid_column'] },
            columns,
          ),
        TypeError,
      );
    });

    it('type narrowing works correctly', () => {
      const expr1: unknown = { $$_expression: 'NOW' };
      if (isExpression(expr1)) {
        asserts.assertEquals(expr1.$$_expression, 'NOW');
      }

      const expr2: unknown = { $$_expression: 'ADD', args: [1, 2, 3] };
      if (isExpression(expr2)) {
        asserts.assertEquals(expr2.$$_expression, 'ADD');
      }

      const expr3: unknown = { $$_expression: 'CONCAT', args: ['a', 'b'] };
      if (isExpression(expr3)) {
        asserts.assertEquals(expr3.$$_expression, 'CONCAT');
      }
    });

    it('comprehensive category delegation', () => {
      const dateTypes = [
        'NOW',
        'CURRENT_DATE',
        'CURRENT_TIME',
        'CURRENT_TIMESTAMP',
        'CURRENT_TIMESTAMPTZ',
      ];
      for (const t of dateTypes) {
        asserts.assertEquals(isExpression({ $$_expression: t }), true);
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
      for (const t of numericTypes) {
        const expr = t === 'SUBTRACT' || t === 'DIVIDE' || t === 'MODULO'
          ? { $$_expression: t, args: [10, 2] }
          : { $$_expression: t, args: [5] };
        asserts.assertEquals(isExpression(expr), true);
      }

      const stringTypes = ['UUID', 'LOWER', 'UPPER', 'TRIM', 'LTRIM', 'RTRIM'];
      for (const t of stringTypes) {
        const expr = t === 'UUID'
          ? { $$_expression: t }
          : { $$_expression: t, args: 'test' };
        asserts.assertEquals(isExpression(expr), true);
      }
    });

    it('complex nested validation', () => {
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
          $$_expression: 'MULTIPLY',
          args: ['@base_price', '@quantity'],
        },
        columns,
      );

      assertExpression(
        {
          $$_expression: 'CONCAT',
          args: ['@category', ' - ', '@product_name'],
        },
        columns,
      );

      assertExpression(
        {
          $$_expression: 'DATE_ADD',
          args: { date: '@created_at', amount: 90, unit: 'DAYS' },
        },
        columns,
      );

      const invalidCases = [
        { $$_expression: 'ADD', args: ['@invalid'] },
        {
          $$_expression: 'DATE_ADD',
          args: { date: '@invalid', amount: 1, unit: 'DAYS' },
        },
      ];

      for (const invalidCase of invalidCases) {
        asserts.assertThrows(
          () => assertExpression(invalidCase as any, columns),
          TypeError,
        );
      }

      // LOWER accepts strings; @invalid is treated as a literal string when
      // it's not in the column list, so this no longer throws.
      assertExpression({ $$_expression: 'LOWER', args: '@invalid' }, columns);
    });

    it('edge cases and boundary conditions', () => {
      asserts.assertEquals(
        isExpression({ $$_expression: 'ADD', args: [] }),
        false,
      );
      asserts.assertEquals(
        isExpression({ $$_expression: 'CONCAT', args: [] }),
        false,
      );

      asserts.assertEquals(
        isExpression({ $$_expression: 'ADD', args: [1] }),
        true,
      );
      asserts.assertEquals(
        isExpression({ $$_expression: 'CONCAT', args: ['a'] }),
        true,
      );

      asserts.assertEquals(isExpression({ $$_expression: 'NOW' }), true);
      asserts.assertEquals(isExpression({ $$_expression: 'UUID' }), true);

      asserts.assertEquals(
        isExpression({ $$_expression: 'POWER', args: [2, 3] }),
        false,
      );
      asserts.assertEquals(
        isExpression({
          $$_expression: 'POWER',
          args: { base: 2, exponent: 3 },
        }),
        true,
      );
    });
  });
});
