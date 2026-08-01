import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import {
  assertAbsExpression,
  assertAddExpression,
  assertCeilExpression,
  assertDateDiffExpression,
  assertDivideExpression,
  assertFloorExpression,
  assertLengthExpression,
  assertModuloExpression,
  assertMultiplyExpression,
  assertNumericExpression,
  assertPowerExpression,
  assertRoundExpression,
  assertSqrtExpression,
  assertSubtractExpression,
  isAbsExpression,
  isAddExpression,
  isCeilExpression,
  isDateDiffExpression,
  isDivideExpression,
  isFloorExpression,
  isLengthExpression,
  isModuloExpression,
  isMultiplyExpression,
  isNumericExpression,
  isPowerExpression,
  isRoundExpression,
  isSqrtExpression,
  isSubtractExpression,
} from './numeric.ts';

describe('oql.asserts.Expressions.Numeric', () => {
  describe('ADD', () => {
    it('valid: with numbers', () => {
      assertAddExpression({ $$_expression: 'ADD', args: [5, 3] });
    });

    it('valid: with single number', () => {
      assertAddExpression({ $$_expression: 'ADD', args: [42] });
    });

    it('valid: with multiple numbers', () => {
      assertAddExpression({ $$_expression: 'ADD', args: [1, 2, 3, 4, 5] });
    });

    it('valid: with columns', () => {
      assertAddExpression(
        { $$_expression: 'ADD', args: ['@price', '@tax'] },
        ['price', 'tax'],
      );
    });

    it('valid: isAddExpression', () => {
      asserts.assert(isAddExpression({ $$_expression: 'ADD', args: [5, 3] }));
      asserts.assert(
        !isAddExpression({ $$_expression: 'SUBTRACT', args: [5, 3] }),
      );
      asserts.assert(!isAddExpression({ $$_expression: 'ADD' } as any));
    });

    it('invalid: wrong type', () => {
      asserts.assertThrows(
        () => assertAddExpression({ $$_expression: 'SUBTRACT' } as any),
        TypeError,
        "Expected 'ADD'",
      );
    });

    it('invalid: missing args', () => {
      asserts.assertThrows(
        () => assertAddExpression({ $$_expression: 'ADD' } as any),
        TypeError,
        "Missing 'args'",
      );
    });

    it('invalid: args not array', () => {
      asserts.assertThrows(
        () =>
          assertAddExpression({ $$_expression: 'ADD', args: 'invalid' } as any),
        TypeError,
        'must be an array',
      );
    });

    it('invalid: empty args', () => {
      asserts.assertThrows(
        () => assertAddExpression({ $$_expression: 'ADD', args: [] } as any),
        TypeError,
        'at least 1',
      );
    });
  });

  describe('SUBTRACT', () => {
    it('valid: with numbers', () => {
      assertSubtractExpression({ $$_expression: 'SUBTRACT', args: [10, 3] });
    });

    it('valid: with columns', () => {
      assertSubtractExpression(
        { $$_expression: 'SUBTRACT', args: ['@total', '@discount'] },
        ['total', 'discount'],
      );
    });

    it('valid: isSubtractExpression', () => {
      asserts.assert(
        isSubtractExpression({ $$_expression: 'SUBTRACT', args: [10, 3] }),
      );
      asserts.assert(
        !isSubtractExpression({ $$_expression: 'ADD', args: [10, 3] }),
      );
    });

    it('invalid: missing args', () => {
      asserts.assertThrows(
        () => assertSubtractExpression({ $$_expression: 'SUBTRACT' } as any),
        TypeError,
        "Missing 'args'",
      );
    });
  });

  describe('MULTIPLY', () => {
    it('valid: with numbers', () => {
      assertMultiplyExpression({ $$_expression: 'MULTIPLY', args: [5, 4] });
    });

    it('valid: with columns', () => {
      assertMultiplyExpression(
        { $$_expression: 'MULTIPLY', args: ['@quantity', '@price'] },
        ['quantity', 'price'],
      );
    });

    it('valid: isMultiplyExpression', () => {
      asserts.assert(
        isMultiplyExpression({ $$_expression: 'MULTIPLY', args: [5, 4] }),
      );
      asserts.assert(
        !isMultiplyExpression({ $$_expression: 'DIVIDE', args: [5, 4] }),
      );
    });
  });

  describe('DIVIDE', () => {
    it('valid: with numbers', () => {
      assertDivideExpression({ $$_expression: 'DIVIDE', args: [20, 5] });
    });

    it('valid: with columns', () => {
      assertDivideExpression(
        { $$_expression: 'DIVIDE', args: ['@total', '@count'] },
        ['total', 'count'],
      );
    });

    it('valid: isDivideExpression', () => {
      asserts.assert(
        isDivideExpression({ $$_expression: 'DIVIDE', args: [20, 5] }),
      );
      asserts.assert(
        !isDivideExpression({ $$_expression: 'MULTIPLY', args: [20, 5] }),
      );
    });
  });

  describe('MODULO', () => {
    it('valid: with numbers', () => {
      assertModuloExpression({ $$_expression: 'MODULO', args: [17, 5] });
    });

    it('valid: with columns', () => {
      assertModuloExpression(
        { $$_expression: 'MODULO', args: ['@value', '@divisor'] },
        ['value', 'divisor'],
      );
    });

    it('valid: isModuloExpression', () => {
      asserts.assert(
        isModuloExpression({ $$_expression: 'MODULO', args: [17, 5] }),
      );
      asserts.assert(
        !isModuloExpression({ $$_expression: 'ADD', args: [17, 5] }),
      );
    });
  });

  describe('ABS', () => {
    it('valid: with number', () => {
      assertAbsExpression({ $$_expression: 'ABS', args: [-42] });
    });

    it('valid: with column', () => {
      assertAbsExpression({ $$_expression: 'ABS', args: ['@balance'] }, [
        'balance',
      ]);
    });

    it('valid: isAbsExpression', () => {
      asserts.assert(isAbsExpression({ $$_expression: 'ABS', args: [-42] }));
      asserts.assert(!isAbsExpression({ $$_expression: 'CEIL', args: [3.14] }));
      asserts.assert(!isAbsExpression({ $$_expression: 'ABS' } as any));
    });

    it('invalid: missing arg', () => {
      asserts.assertThrows(
        () => assertAbsExpression({ $$_expression: 'ABS' } as any),
        TypeError,
        'arg',
      );
    });

    it('invalid: string arg', () => {
      asserts.assertThrows(
        () =>
          assertAbsExpression({ $$_expression: 'ABS', arg: 'invalid' } as any),
        TypeError,
      );
    });

    it('invalid: string literal arg', () => {
      asserts.assertThrows(
        () =>
          assertAbsExpression(
            { $$_expression: 'ABS', args: ['noAtSign'] } as any,
          ),
        TypeError,
        'must be a number or column identifier',
      );
    });

    it('invalid: boolean arg', () => {
      asserts.assertThrows(
        () =>
          assertAbsExpression({ $$_expression: 'ABS', args: [true] } as any),
        TypeError,
        'must be a number, bigint, column identifier, or nested expression',
      );
    });

    it('invalid: column not in list (rejected as string literal)', () => {
      // `@invalid` is not in columnList → not a column reference. Falls
      // through to the numeric check, where a string is invalid.
      asserts.assertThrows(
        () =>
          assertAbsExpression({ $$_expression: 'ABS', args: ['@invalid'] }, [
            'valid',
          ]),
        TypeError,
        'got string literal',
      );
    });
  });

  describe('CEIL', () => {
    it('valid: with number', () => {
      assertCeilExpression({ $$_expression: 'CEIL', args: [3.14] });
    });

    it('valid: with column', () => {
      assertCeilExpression({ $$_expression: 'CEIL', args: ['@price'] }, [
        'price',
      ]);
    });

    it('valid: isCeilExpression', () => {
      asserts.assert(isCeilExpression({ $$_expression: 'CEIL', args: [3.14] }));
      asserts.assert(
        !isCeilExpression({ $$_expression: 'FLOOR', args: [3.14] }),
      );
    });
  });

  describe('FLOOR', () => {
    it('valid: with number', () => {
      assertFloorExpression({ $$_expression: 'FLOOR', args: [3.99] });
    });

    it('valid: with column', () => {
      assertFloorExpression({ $$_expression: 'FLOOR', args: ['@value'] }, [
        'value',
      ]);
    });

    it('valid: isFloorExpression', () => {
      asserts.assert(
        isFloorExpression({ $$_expression: 'FLOOR', args: [3.99] }),
      );
      asserts.assert(
        !isFloorExpression({ $$_expression: 'ROUND', args: [3.99] }),
      );
    });
  });

  describe('ROUND', () => {
    it('valid: with number', () => {
      assertRoundExpression({ $$_expression: 'ROUND', args: [3.67] });
    });

    it('valid: with column', () => {
      assertRoundExpression({ $$_expression: 'ROUND', args: ['@amount'] }, [
        'amount',
      ]);
    });

    it('valid: isRoundExpression', () => {
      asserts.assert(
        isRoundExpression({ $$_expression: 'ROUND', args: [3.67] }),
      );
      asserts.assert(
        !isRoundExpression({ $$_expression: 'CEIL', args: [3.67] }),
      );
    });
  });

  describe('POWER', () => {
    it('valid: with numbers', () => {
      assertPowerExpression({
        $$_expression: 'POWER',
        args: { base: 2, exponent: 8 },
      });
    });

    it('valid: with columns', () => {
      assertPowerExpression(
        { $$_expression: 'POWER', args: { base: '@base', exponent: '@exp' } },
        ['base', 'exp'],
      );
    });

    it('valid: isPowerExpression', () => {
      asserts.assert(
        isPowerExpression({
          $$_expression: 'POWER',
          args: { base: 2, exponent: 8 },
        }),
      );
      asserts.assert(!isPowerExpression({ $$_expression: 'SQRT', arg: 16 }));
    });

    it('invalid: missing args', () => {
      asserts.assertThrows(
        () => assertPowerExpression({ $$_expression: 'POWER' } as any),
        TypeError,
        "Missing 'args'",
      );
    });

    it('invalid: args not object', () => {
      asserts.assertThrows(
        () =>
          assertPowerExpression(
            { $$_expression: 'POWER', args: 'invalid' } as any,
          ),
        TypeError,
        'must be an object',
      );
    });

    it('invalid: missing base', () => {
      asserts.assertThrows(
        () =>
          assertPowerExpression(
            { $$_expression: 'POWER', args: { exponent: 8 } } as any,
          ),
        TypeError,
        'base',
      );
    });

    it('invalid: missing exponent', () => {
      asserts.assertThrows(
        () =>
          assertPowerExpression(
            { $$_expression: 'POWER', args: { base: 2 } } as any,
          ),
        TypeError,
        'exponent',
      );
    });
  });

  describe('SQRT', () => {
    it('valid: with number', () => {
      assertSqrtExpression({ $$_expression: 'SQRT', args: [16] });
    });

    it('valid: with column', () => {
      assertSqrtExpression({ $$_expression: 'SQRT', args: ['@area'] }, [
        'area',
      ]);
    });

    it('valid: isSqrtExpression', () => {
      asserts.assert(isSqrtExpression({ $$_expression: 'SQRT', args: [16] }));
      asserts.assert(!isSqrtExpression({ $$_expression: 'ABS', args: [16] }));
    });
  });

  describe('LENGTH', () => {
    it('valid: with string', () => {
      assertLengthExpression({ $$_expression: 'LENGTH', args: 'hello' });
    });

    it('valid: with column', () => {
      assertLengthExpression({ $$_expression: 'LENGTH', args: '@name' }, [
        'name',
      ]);
    });

    it('valid: isLengthExpression', () => {
      asserts.assert(
        isLengthExpression({ $$_expression: 'LENGTH', args: 'hello' }),
      );
      asserts.assert(
        !isLengthExpression({ $$_expression: 'LOWER', args: 'hello' }),
      );
    });

    it('invalid: missing arg', () => {
      asserts.assertThrows(
        () => assertLengthExpression({ $$_expression: 'LENGTH' } as any),
        TypeError,
        'arg',
      );
    });

    it('invalid: numeric arg', () => {
      asserts.assertThrows(
        () =>
          assertLengthExpression({ $$_expression: 'LENGTH', args: 123 } as any),
        TypeError,
      );
    });

    it('valid: @-string not in column list is treated as literal in string context', () => {
      // LENGTH takes a string arg; an @-string that isn't in the
      // columnList is a literal string, which LENGTH accepts.
      assertLengthExpression(
        { $$_expression: 'LENGTH', args: '@invalid' },
        ['valid'],
      );
    });
  });

  describe('DATE_DIFF', () => {
    const date1 = new Date('2024-01-01');
    const date2 = new Date('2024-01-15');

    it('valid: with Date literals', () => {
      assertDateDiffExpression({
        $$_expression: 'DATE_DIFF',
        args: { from: date1, to: date2, unit: 'DAYS' },
      });
    });

    it('valid: with columns', () => {
      assertDateDiffExpression(
        {
          $$_expression: 'DATE_DIFF',
          args: { from: '@createdAt', to: '@updatedAt', unit: 'HOURS' },
        },
        ['createdAt', 'updatedAt'],
      );
    });

    it('valid: with all time units', () => {
      const units = [
        'SECONDS',
        'MINUTES',
        'HOURS',
        'DAYS',
        'MONTHS',
        'YEARS',
      ];
      for (const unit of units) {
        assertDateDiffExpression({
          $$_expression: 'DATE_DIFF',
          args: { from: date1, to: date2, unit },
        });
      }
    });

    it('valid: isDateDiffExpression', () => {
      asserts.assert(
        isDateDiffExpression({
          $$_expression: 'DATE_DIFF',
          args: { from: date1, to: date2, unit: 'DAYS' },
        }),
      );
      asserts.assert(
        !isDateDiffExpression({
          $$_expression: 'DATE_ADD',
          args: { date: date1, amount: 7, unit: 'DAYS' },
        }),
      );
      asserts.assert(
        !isDateDiffExpression({ $$_expression: 'DATE_DIFF' } as any),
      );
    });

    it('invalid: missing args', () => {
      asserts.assertThrows(
        () => assertDateDiffExpression({ $$_expression: 'DATE_DIFF' } as any),
        TypeError,
        "Missing 'args'",
      );
    });

    it('invalid: args not object', () => {
      asserts.assertThrows(
        () =>
          assertDateDiffExpression(
            { $$_expression: 'DATE_DIFF', args: 'invalid' } as any,
          ),
        TypeError,
        'must be an object',
      );
    });

    it('invalid: missing from', () => {
      asserts.assertThrows(
        () =>
          assertDateDiffExpression({
            $$_expression: 'DATE_DIFF',
            args: { to: date2, unit: 'DAYS' },
          } as any),
        TypeError,
        'from',
      );
    });

    it('invalid: missing to', () => {
      asserts.assertThrows(
        () =>
          assertDateDiffExpression({
            $$_expression: 'DATE_DIFF',
            args: { from: date1, unit: 'DAYS' },
          } as any),
        TypeError,
        'to',
      );
    });

    it('invalid: missing unit', () => {
      asserts.assertThrows(
        () =>
          assertDateDiffExpression({
            $$_expression: 'DATE_DIFF',
            args: { from: date1, to: date2 },
          } as any),
        TypeError,
        'unit',
      );
    });

    it('invalid: invalid unit', () => {
      asserts.assertThrows(
        () =>
          assertDateDiffExpression({
            $$_expression: 'DATE_DIFF',
            args: { from: date1, to: date2, unit: 'INVALID' },
          } as any),
        TypeError,
        'Expected one of',
      );
    });

    it('invalid: from is string literal', () => {
      asserts.assertThrows(
        () =>
          assertDateDiffExpression({
            $$_expression: 'DATE_DIFF',
            args: { from: 'notColumn', to: date2, unit: 'DAYS' },
          } as any),
        TypeError,
        'must be a Date or column identifier',
      );
    });

    it('invalid: from is number', () => {
      asserts.assertThrows(
        () =>
          assertDateDiffExpression({
            $$_expression: 'DATE_DIFF',
            args: { from: 123, to: date2, unit: 'DAYS' },
          } as any),
        TypeError,
        'must be a Date or column identifier',
      );
    });

    it('invalid: from column not in list', () => {
      // `@invalid` is not in columnList → not a column reference. Falls
      // through to the date check, where a string is invalid.
      asserts.assertThrows(
        () =>
          assertDateDiffExpression({
            $$_expression: 'DATE_DIFF',
            args: { from: '@invalid', to: date2, unit: 'DAYS' },
          }, ['valid']),
        TypeError,
        'must be a Date or column identifier',
      );
    });
  });

  describe('assertNumericExpression', () => {
    it('valid: delegates to ADD', () => {
      assertNumericExpression({ $$_expression: 'ADD', args: [5, 3] });
    });

    it('valid: delegates to SUBTRACT', () => {
      assertNumericExpression({ $$_expression: 'SUBTRACT', args: [10, 3] });
    });

    it('valid: delegates to MULTIPLY', () => {
      assertNumericExpression({ $$_expression: 'MULTIPLY', args: [5, 4] });
    });

    it('valid: delegates to DIVIDE', () => {
      assertNumericExpression({ $$_expression: 'DIVIDE', args: [20, 5] });
    });

    it('valid: delegates to MODULO', () => {
      assertNumericExpression({ $$_expression: 'MODULO', args: [17, 5] });
    });

    it('valid: delegates to ABS', () => {
      assertNumericExpression({ $$_expression: 'ABS', args: [-42] });
    });

    it('valid: delegates to CEIL', () => {
      assertNumericExpression({ $$_expression: 'CEIL', args: [3.14] });
    });

    it('valid: delegates to FLOOR', () => {
      assertNumericExpression({ $$_expression: 'FLOOR', args: [3.99] });
    });

    it('valid: delegates to ROUND', () => {
      assertNumericExpression({ $$_expression: 'ROUND', args: [3.67] });
    });

    it('valid: delegates to POWER', () => {
      assertNumericExpression({
        $$_expression: 'POWER',
        args: { base: 2, exponent: 8 },
      });
    });

    it('valid: delegates to SQRT', () => {
      assertNumericExpression({ $$_expression: 'SQRT', args: [16] });
    });

    it('valid: delegates to LENGTH', () => {
      assertNumericExpression({ $$_expression: 'LENGTH', args: 'hello' });
    });

    it('valid: delegates to DATE_DIFF', () => {
      assertNumericExpression({
        $$_expression: 'DATE_DIFF',
        args: { from: new Date(), to: new Date(), unit: 'DAYS' },
      });
    });

    it('invalid: unknown type', () => {
      asserts.assertThrows(
        () => assertNumericExpression({ $$_expression: 'UNKNOWN' } as any),
        TypeError,
        'Expected a Numeric expression type',
      );
    });

    it('invalid: date expression', () => {
      asserts.assertThrows(
        () => assertNumericExpression({ $$_expression: 'NOW' } as any),
        TypeError,
        'Expected a Numeric expression type',
      );
    });

    it('invalid: string expression', () => {
      asserts.assertThrows(
        () => assertNumericExpression({ $$_expression: 'UUID' } as any),
        TypeError,
        'Expected a Numeric expression type',
      );
    });
  });

  describe('isNumericExpression', () => {
    it('valid: numeric expressions', () => {
      asserts.assert(
        isNumericExpression({ $$_expression: 'ADD', args: [5, 3] }),
      );
      asserts.assert(
        isNumericExpression({ $$_expression: 'SUBTRACT', args: [10, 3] }),
      );
      asserts.assert(
        isNumericExpression({ $$_expression: 'MULTIPLY', args: [5, 4] }),
      );
      asserts.assert(
        isNumericExpression({ $$_expression: 'DIVIDE', args: [20, 5] }),
      );
      asserts.assert(
        isNumericExpression({ $$_expression: 'MODULO', args: [17, 5] }),
      );
      asserts.assert(
        isNumericExpression({ $$_expression: 'ABS', args: [-42] }),
      );
      asserts.assert(
        isNumericExpression({ $$_expression: 'CEIL', args: [3.14] }),
      );
      asserts.assert(
        isNumericExpression({ $$_expression: 'FLOOR', args: [3.99] }),
      );
      asserts.assert(
        isNumericExpression({ $$_expression: 'ROUND', args: [3.67] }),
      );
      asserts.assert(
        isNumericExpression({
          $$_expression: 'POWER',
          args: { base: 2, exponent: 8 },
        }),
      );
      asserts.assert(
        isNumericExpression({ $$_expression: 'SQRT', args: [16] }),
      );
      asserts.assert(
        isNumericExpression({ $$_expression: 'LENGTH', args: 'hello' }),
      );
      asserts.assert(isNumericExpression({
        $$_expression: 'DATE_DIFF',
        args: { from: new Date(), to: new Date(), unit: 'DAYS' },
      }));
    });

    it('invalid: expressions', () => {
      asserts.assert(!isNumericExpression({ $$_expression: 'NOW' }));
      asserts.assert(!isNumericExpression({ $$_expression: 'UUID' }));
      asserts.assert(
        !isNumericExpression({ $$_expression: 'CONCAT', args: ['a', 'b'] }),
      );
      asserts.assert(!isNumericExpression({ $$_expression: 'UNKNOWN' } as any));
      asserts.assert(!isNumericExpression('not an object' as any));
    });
  });

  describe('integration tests', () => {
    it('complex nested numeric expressions', () => {
      const expr = {
        $$_expression: 'ADD',
        args: ['@quantity', '@bonus'],
      };

      assertNumericExpression(expr, ['quantity', 'bonus']);
    });

    it('validate with column list', () => {
      const columns = ['price', 'taxRate', 'discount'];

      assertNumericExpression(
        { $$_expression: 'ADD', args: ['@price', 10] },
        columns,
      );

      asserts.assertThrows(
        () =>
          assertNumericExpression(
            { $$_expression: 'ADD', args: ['@invalid', 10] },
            columns,
          ),
        TypeError,
      );
    });

    it('type narrowing with isNumericExpression', () => {
      const expr: unknown = { $$_expression: 'ADD', args: [5, 3] };

      if (isNumericExpression(expr)) {
        asserts.assert(expr.$$_expression === 'ADD');
      } else {
        asserts.fail('Expected numeric expression');
      }
    });

    it('all expression types work', () => {
      const expressions = [
        { $$_expression: 'ADD' as const, args: [1, 2] },
        { $$_expression: 'SUBTRACT' as const, args: [10, 3] },
        { $$_expression: 'MULTIPLY' as const, args: [5, 4] },
        { $$_expression: 'DIVIDE' as const, args: [20, 5] },
        { $$_expression: 'MODULO' as const, args: [17, 5] },
        { $$_expression: 'ABS' as const, args: [-42] },
        { $$_expression: 'CEIL' as const, args: [3.14] },
        { $$_expression: 'FLOOR' as const, args: [3.99] },
        { $$_expression: 'ROUND' as const, args: [3.67] },
        { $$_expression: 'POWER' as const, args: { base: 2, exponent: 8 } },
        { $$_expression: 'SQRT' as const, args: [16] },
        { $$_expression: 'LENGTH' as const, args: 'test' },
        {
          $$_expression: 'DATE_DIFF' as const,
          args: { from: new Date(), to: new Date(), unit: 'DAYS' },
        },
      ];

      for (const expr of expressions) {
        assertNumericExpression(expr);
        asserts.assert(isNumericExpression(expr));
      }
    });
  });
});
