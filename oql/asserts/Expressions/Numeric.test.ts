import * as asserts from '$asserts';
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
} from './Numeric.ts';

Deno.test('oql.asserts.Expressions.Numeric', async (t) => {
  await t.step('ADD', async (u) => {
    await u.step('valid: with numbers', () => {
      assertAddExpression({ type: 'ADD', args: [5, 3] });
    });

    await u.step('valid: with single number', () => {
      assertAddExpression({ type: 'ADD', args: [42] });
    });

    await u.step('valid: with multiple numbers', () => {
      assertAddExpression({ type: 'ADD', args: [1, 2, 3, 4, 5] });
    });

    await u.step('valid: with columns', () => {
      assertAddExpression(
        { type: 'ADD', args: ['@price', '@tax'] },
        ['price', 'tax'],
      );
    });

    await u.step('valid: isAddExpression', () => {
      asserts.assert(isAddExpression({ type: 'ADD', args: [5, 3] }));
      asserts.assert(!isAddExpression({ type: 'SUBTRACT', args: [5, 3] }));
      asserts.assert(!isAddExpression({ type: 'ADD' } as any));
    });

    await u.step('invalid: wrong type', () => {
      asserts.assertThrows(
        () => assertAddExpression({ type: 'SUBTRACT' } as any),
        TypeError,
        "Expected 'ADD'",
      );
    });

    await u.step('invalid: missing args', () => {
      asserts.assertThrows(
        () => assertAddExpression({ type: 'ADD' } as any),
        TypeError,
        "Missing 'args'",
      );
    });

    await u.step('invalid: args not array', () => {
      asserts.assertThrows(
        () => assertAddExpression({ type: 'ADD', args: 'invalid' } as any),
        TypeError,
        'must be an array',
      );
    });

    await u.step('invalid: empty args', () => {
      asserts.assertThrows(
        () => assertAddExpression({ type: 'ADD', args: [] } as any),
        TypeError,
        'at least 1',
      );
    });
  });

  await t.step('SUBTRACT', async (u) => {
    await u.step('valid: with numbers', () => {
      assertSubtractExpression({ type: 'SUBTRACT', args: [10, 3] });
    });

    await u.step('valid: with columns', () => {
      assertSubtractExpression(
        { type: 'SUBTRACT', args: ['@total', '@discount'] },
        ['total', 'discount'],
      );
    });

    await u.step('valid: isSubtractExpression', () => {
      asserts.assert(
        isSubtractExpression({ type: 'SUBTRACT', args: [10, 3] }),
      );
      asserts.assert(!isSubtractExpression({ type: 'ADD', args: [10, 3] }));
    });

    await u.step('invalid: missing args', () => {
      asserts.assertThrows(
        () => assertSubtractExpression({ type: 'SUBTRACT' } as any),
        TypeError,
        "Missing 'args'",
      );
    });
  });

  await t.step('MULTIPLY', async (u) => {
    await u.step('valid: with numbers', () => {
      assertMultiplyExpression({ type: 'MULTIPLY', args: [5, 4] });
    });

    await u.step('valid: with columns', () => {
      assertMultiplyExpression(
        { type: 'MULTIPLY', args: ['@quantity', '@price'] },
        ['quantity', 'price'],
      );
    });

    await u.step('valid: isMultiplyExpression', () => {
      asserts.assert(
        isMultiplyExpression({ type: 'MULTIPLY', args: [5, 4] }),
      );
      asserts.assert(
        !isMultiplyExpression({ type: 'DIVIDE', args: [5, 4] }),
      );
    });
  });

  await t.step('DIVIDE', async (u) => {
    await u.step('valid: with numbers', () => {
      assertDivideExpression({ type: 'DIVIDE', args: [20, 5] });
    });

    await u.step('valid: with columns', () => {
      assertDivideExpression(
        { type: 'DIVIDE', args: ['@total', '@count'] },
        ['total', 'count'],
      );
    });

    await u.step('valid: isDivideExpression', () => {
      asserts.assert(isDivideExpression({ type: 'DIVIDE', args: [20, 5] }));
      asserts.assert(
        !isDivideExpression({ type: 'MULTIPLY', args: [20, 5] }),
      );
    });
  });

  await t.step('MODULO', async (u) => {
    await u.step('valid: with numbers', () => {
      assertModuloExpression({ type: 'MODULO', args: [17, 5] });
    });

    await u.step('valid: with columns', () => {
      assertModuloExpression(
        { type: 'MODULO', args: ['@value', '@divisor'] },
        ['value', 'divisor'],
      );
    });

    await u.step('valid: isModuloExpression', () => {
      asserts.assert(isModuloExpression({ type: 'MODULO', args: [17, 5] }));
      asserts.assert(!isModuloExpression({ type: 'ADD', args: [17, 5] }));
    });
  });

  await t.step('ABS', async (u) => {
    await u.step('valid: with number', () => {
      assertAbsExpression({ type: 'ABS', args: [-42] });
    });

    await u.step('valid: with column', () => {
      assertAbsExpression({ type: 'ABS', args: ['@balance'] }, ['balance']);
    });

    await u.step('valid: isAbsExpression', () => {
      asserts.assert(isAbsExpression({ type: 'ABS', args: [-42] }));
      asserts.assert(!isAbsExpression({ type: 'CEIL', args: [3.14] }));
      asserts.assert(!isAbsExpression({ type: 'ABS' } as any));
    });

    await u.step('invalid: missing arg', () => {
      asserts.assertThrows(
        () => assertAbsExpression({ type: 'ABS' } as any),
        TypeError,
        'arg',
      );
    });

    await u.step('invalid: string arg', () => {
      asserts.assertThrows(
        () => assertAbsExpression({ type: 'ABS', arg: 'invalid' } as any),
        TypeError,
      );
    });

    await u.step('invalid: string literal arg', () => {
      asserts.assertThrows(
        () => assertAbsExpression({ type: 'ABS', args: ['noAtSign'] } as any),
        TypeError,
        'must be a number or column identifier',
      );
    });

    await u.step('invalid: boolean arg', () => {
      asserts.assertThrows(
        () => assertAbsExpression({ type: 'ABS', args: [true] } as any),
        TypeError,
        'must be a number, bigint, column identifier, or nested expression',
      );
    });

    await u.step('invalid: invalid column in list', () => {
      asserts.assertThrows(
        () =>
          assertAbsExpression({ type: 'ABS', args: ['@invalid'] }, ['valid']),
        TypeError,
        'Invalid column identifier',
      );
    });
  });

  await t.step('CEIL', async (u) => {
    await u.step('valid: with number', () => {
      assertCeilExpression({ type: 'CEIL', args: [3.14] });
    });

    await u.step('valid: with column', () => {
      assertCeilExpression({ type: 'CEIL', args: ['@price'] }, ['price']);
    });

    await u.step('valid: isCeilExpression', () => {
      asserts.assert(isCeilExpression({ type: 'CEIL', args: [3.14] }));
      asserts.assert(!isCeilExpression({ type: 'FLOOR', args: [3.14] }));
    });
  });

  await t.step('FLOOR', async (u) => {
    await u.step('valid: with number', () => {
      assertFloorExpression({ type: 'FLOOR', args: [3.99] });
    });

    await u.step('valid: with column', () => {
      assertFloorExpression({ type: 'FLOOR', args: ['@value'] }, ['value']);
    });

    await u.step('valid: isFloorExpression', () => {
      asserts.assert(isFloorExpression({ type: 'FLOOR', args: [3.99] }));
      asserts.assert(!isFloorExpression({ type: 'ROUND', args: [3.99] }));
    });
  });

  await t.step('ROUND', async (u) => {
    await u.step('valid: with number', () => {
      assertRoundExpression({ type: 'ROUND', args: [3.67] });
    });

    await u.step('valid: with column', () => {
      assertRoundExpression({ type: 'ROUND', args: ['@amount'] }, ['amount']);
    });

    await u.step('valid: isRoundExpression', () => {
      asserts.assert(isRoundExpression({ type: 'ROUND', args: [3.67] }));
      asserts.assert(!isRoundExpression({ type: 'CEIL', args: [3.67] }));
    });
  });

  await t.step('POWER', async (u) => {
    await u.step('valid: with numbers', () => {
      assertPowerExpression({ type: 'POWER', args: { base: 2, exponent: 8 } });
    });

    await u.step('valid: with columns', () => {
      assertPowerExpression(
        { type: 'POWER', args: { base: '@base', exponent: '@exp' } },
        ['base', 'exp'],
      );
    });

    await u.step('valid: isPowerExpression', () => {
      asserts.assert(
        isPowerExpression({ type: 'POWER', args: { base: 2, exponent: 8 } }),
      );
      asserts.assert(!isPowerExpression({ type: 'SQRT', arg: 16 }));
    });

    await u.step('invalid: missing args', () => {
      asserts.assertThrows(
        () => assertPowerExpression({ type: 'POWER' } as any),
        TypeError,
        "Missing 'args'",
      );
    });

    await u.step('invalid: args not object', () => {
      asserts.assertThrows(
        () => assertPowerExpression({ type: 'POWER', args: 'invalid' } as any),
        TypeError,
        'must be an object',
      );
    });

    await u.step('invalid: missing base', () => {
      asserts.assertThrows(
        () =>
          assertPowerExpression(
            { type: 'POWER', args: { exponent: 8 } } as any,
          ),
        TypeError,
        'base',
      );
    });

    await u.step('invalid: missing exponent', () => {
      asserts.assertThrows(
        () =>
          assertPowerExpression({ type: 'POWER', args: { base: 2 } } as any),
        TypeError,
        'exponent',
      );
    });
  });

  await t.step('SQRT', async (u) => {
    await u.step('valid: with number', () => {
      assertSqrtExpression({ type: 'SQRT', args: [16] });
    });

    await u.step('valid: with column', () => {
      assertSqrtExpression({ type: 'SQRT', args: ['@area'] }, ['area']);
    });

    await u.step('valid: isSqrtExpression', () => {
      asserts.assert(isSqrtExpression({ type: 'SQRT', args: [16] }));
      asserts.assert(!isSqrtExpression({ type: 'ABS', args: [16] }));
    });
  });

  await t.step('LENGTH', async (u) => {
    await u.step('valid: with string', () => {
      assertLengthExpression({ type: 'LENGTH', args: 'hello' });
    });

    await u.step('valid: with column', () => {
      assertLengthExpression({ type: 'LENGTH', args: '@name' }, ['name']);
    });

    await u.step('valid: isLengthExpression', () => {
      asserts.assert(isLengthExpression({ type: 'LENGTH', args: 'hello' }));
      asserts.assert(!isLengthExpression({ type: 'LOWER', args: 'hello' }));
    });

    await u.step('invalid: missing arg', () => {
      asserts.assertThrows(
        () => assertLengthExpression({ type: 'LENGTH' } as any),
        TypeError,
        'arg',
      );
    });

    await u.step('invalid: numeric arg', () => {
      asserts.assertThrows(
        () => assertLengthExpression({ type: 'LENGTH', args: 123 } as any),
        TypeError,
      );
    });

    await u.step('invalid: invalid column', () => {
      asserts.assertThrows(
        () =>
          assertLengthExpression({ type: 'LENGTH', args: '@invalid' }, [
            'valid',
          ]),
        TypeError,
        'Invalid column identifier',
      );
    });
  });

  await t.step('DATE_DIFF', async (u) => {
    const date1 = new Date('2024-01-01');
    const date2 = new Date('2024-01-15');

    await u.step('valid: with Date literals', () => {
      assertDateDiffExpression({
        type: 'DATE_DIFF',
        args: { from: date1, to: date2, unit: 'DAYS' },
      });
    });

    await u.step('valid: with columns', () => {
      assertDateDiffExpression(
        {
          type: 'DATE_DIFF',
          args: { from: '@createdAt', to: '@updatedAt', unit: 'HOURS' },
        },
        ['createdAt', 'updatedAt'],
      );
    });

    await u.step('valid: with all time units', () => {
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
          type: 'DATE_DIFF',
          args: { from: date1, to: date2, unit },
        });
      }
    });

    await u.step('valid: isDateDiffExpression', () => {
      asserts.assert(
        isDateDiffExpression({
          type: 'DATE_DIFF',
          args: { from: date1, to: date2, unit: 'DAYS' },
        }),
      );
      asserts.assert(
        !isDateDiffExpression({
          type: 'DATE_ADD',
          args: { date: date1, amount: 7, unit: 'DAYS' },
        }),
      );
      asserts.assert(!isDateDiffExpression({ type: 'DATE_DIFF' } as any));
    });

    await u.step('invalid: missing args', () => {
      asserts.assertThrows(
        () => assertDateDiffExpression({ type: 'DATE_DIFF' } as any),
        TypeError,
        "Missing 'args'",
      );
    });

    await u.step('invalid: args not object', () => {
      asserts.assertThrows(
        () =>
          assertDateDiffExpression(
            { type: 'DATE_DIFF', args: 'invalid' } as any,
          ),
        TypeError,
        'must be an object',
      );
    });

    await u.step('invalid: missing from', () => {
      asserts.assertThrows(
        () =>
          assertDateDiffExpression({
            type: 'DATE_DIFF',
            args: { to: date2, unit: 'DAYS' },
          } as any),
        TypeError,
        'from',
      );
    });

    await u.step('invalid: missing to', () => {
      asserts.assertThrows(
        () =>
          assertDateDiffExpression({
            type: 'DATE_DIFF',
            args: { from: date1, unit: 'DAYS' },
          } as any),
        TypeError,
        'to',
      );
    });

    await u.step('invalid: missing unit', () => {
      asserts.assertThrows(
        () =>
          assertDateDiffExpression({
            type: 'DATE_DIFF',
            args: { from: date1, to: date2 },
          } as any),
        TypeError,
        'unit',
      );
    });

    await u.step('invalid: invalid unit', () => {
      asserts.assertThrows(
        () =>
          assertDateDiffExpression({
            type: 'DATE_DIFF',
            args: { from: date1, to: date2, unit: 'INVALID' },
          } as any),
        TypeError,
        'Expected one of',
      );
    });

    await u.step('invalid: from is string literal', () => {
      asserts.assertThrows(
        () =>
          assertDateDiffExpression({
            type: 'DATE_DIFF',
            args: { from: 'notColumn', to: date2, unit: 'DAYS' },
          } as any),
        TypeError,
        'must be a Date or column identifier',
      );
    });

    await u.step('invalid: from is number', () => {
      asserts.assertThrows(
        () =>
          assertDateDiffExpression({
            type: 'DATE_DIFF',
            args: { from: 123, to: date2, unit: 'DAYS' },
          } as any),
        TypeError,
        'must be a Date or column identifier',
      );
    });

    await u.step('invalid: from column not in list', () => {
      asserts.assertThrows(
        () =>
          assertDateDiffExpression({
            type: 'DATE_DIFF',
            args: { from: '@invalid', to: date2, unit: 'DAYS' },
          }, ['valid']),
        TypeError,
        'Invalid column identifier',
      );
    });
  });

  await t.step('assertNumericExpression', async (u) => {
    await u.step('valid: delegates to ADD', () => {
      assertNumericExpression({ type: 'ADD', args: [5, 3] });
    });

    await u.step('valid: delegates to SUBTRACT', () => {
      assertNumericExpression({ type: 'SUBTRACT', args: [10, 3] });
    });

    await u.step('valid: delegates to MULTIPLY', () => {
      assertNumericExpression({ type: 'MULTIPLY', args: [5, 4] });
    });

    await u.step('valid: delegates to DIVIDE', () => {
      assertNumericExpression({ type: 'DIVIDE', args: [20, 5] });
    });

    await u.step('valid: delegates to MODULO', () => {
      assertNumericExpression({ type: 'MODULO', args: [17, 5] });
    });

    await u.step('valid: delegates to ABS', () => {
      assertNumericExpression({ type: 'ABS', args: [-42] });
    });

    await u.step('valid: delegates to CEIL', () => {
      assertNumericExpression({ type: 'CEIL', args: [3.14] });
    });

    await u.step('valid: delegates to FLOOR', () => {
      assertNumericExpression({ type: 'FLOOR', args: [3.99] });
    });

    await u.step('valid: delegates to ROUND', () => {
      assertNumericExpression({ type: 'ROUND', args: [3.67] });
    });

    await u.step('valid: delegates to POWER', () => {
      assertNumericExpression({
        type: 'POWER',
        args: { base: 2, exponent: 8 },
      });
    });

    await u.step('valid: delegates to SQRT', () => {
      assertNumericExpression({ type: 'SQRT', args: [16] });
    });

    await u.step('valid: delegates to LENGTH', () => {
      assertNumericExpression({ type: 'LENGTH', args: 'hello' });
    });

    await u.step('valid: delegates to DATE_DIFF', () => {
      assertNumericExpression({
        type: 'DATE_DIFF',
        args: { from: new Date(), to: new Date(), unit: 'DAYS' },
      });
    });

    await u.step('invalid: unknown type', () => {
      asserts.assertThrows(
        () => assertNumericExpression({ type: 'UNKNOWN' } as any),
        TypeError,
        'Expected a Numeric expression type',
      );
    });

    await u.step('invalid: date expression', () => {
      asserts.assertThrows(
        () => assertNumericExpression({ type: 'NOW' } as any),
        TypeError,
        'Expected a Numeric expression type',
      );
    });

    await u.step('invalid: string expression', () => {
      asserts.assertThrows(
        () => assertNumericExpression({ type: 'UUID' } as any),
        TypeError,
        'Expected a Numeric expression type',
      );
    });
  });

  await t.step('isNumericExpression', async (u) => {
    await u.step('valid: numeric expressions', () => {
      asserts.assert(isNumericExpression({ type: 'ADD', args: [5, 3] }));
      asserts.assert(isNumericExpression({ type: 'SUBTRACT', args: [10, 3] }));
      asserts.assert(isNumericExpression({ type: 'MULTIPLY', args: [5, 4] }));
      asserts.assert(isNumericExpression({ type: 'DIVIDE', args: [20, 5] }));
      asserts.assert(isNumericExpression({ type: 'MODULO', args: [17, 5] }));
      asserts.assert(isNumericExpression({ type: 'ABS', args: [-42] }));
      asserts.assert(isNumericExpression({ type: 'CEIL', args: [3.14] }));
      asserts.assert(isNumericExpression({ type: 'FLOOR', args: [3.99] }));
      asserts.assert(isNumericExpression({ type: 'ROUND', args: [3.67] }));
      asserts.assert(
        isNumericExpression({ type: 'POWER', args: { base: 2, exponent: 8 } }),
      );
      asserts.assert(isNumericExpression({ type: 'SQRT', args: [16] }));
      asserts.assert(isNumericExpression({ type: 'LENGTH', args: 'hello' }));
      asserts.assert(isNumericExpression({
        type: 'DATE_DIFF',
        args: { from: new Date(), to: new Date(), unit: 'DAYS' },
      }));
    });

    await u.step('invalid: expressions', () => {
      asserts.assert(!isNumericExpression({ type: 'NOW' }));
      asserts.assert(!isNumericExpression({ type: 'UUID' }));
      asserts.assert(
        !isNumericExpression({ type: 'CONCAT', args: ['a', 'b'] }),
      );
      asserts.assert(!isNumericExpression({ type: 'UNKNOWN' } as any));
      asserts.assert(!isNumericExpression('not an object' as any));
    });
  });

  await t.step('integration tests', async (u) => {
    await u.step('complex nested numeric expressions', () => {
      const expr = {
        type: 'ADD',
        args: ['@quantity', '@bonus'],
      };

      assertNumericExpression(expr, ['quantity', 'bonus']);
    });

    await u.step('validate with column list', () => {
      const columns = ['price', 'taxRate', 'discount'];

      assertNumericExpression(
        { type: 'ADD', args: ['@price', 10] },
        columns,
      );

      asserts.assertThrows(
        () =>
          assertNumericExpression(
            { type: 'ADD', args: ['@invalid', 10] },
            columns,
          ),
        TypeError,
      );
    });

    await u.step('type narrowing with isNumericExpression', () => {
      const expr: unknown = { type: 'ADD', args: [5, 3] };

      if (isNumericExpression(expr)) {
        asserts.assert(expr.type === 'ADD');
      } else {
        asserts.fail('Expected numeric expression');
      }
    });

    await u.step('all expression types work', () => {
      const expressions = [
        { type: 'ADD' as const, args: [1, 2] },
        { type: 'SUBTRACT' as const, args: [10, 3] },
        { type: 'MULTIPLY' as const, args: [5, 4] },
        { type: 'DIVIDE' as const, args: [20, 5] },
        { type: 'MODULO' as const, args: [17, 5] },
        { type: 'ABS' as const, args: [-42] },
        { type: 'CEIL' as const, args: [3.14] },
        { type: 'FLOOR' as const, args: [3.99] },
        { type: 'ROUND' as const, args: [3.67] },
        { type: 'POWER' as const, args: { base: 2, exponent: 8 } },
        { type: 'SQRT' as const, args: [16] },
        { type: 'LENGTH' as const, args: 'test' },
        {
          type: 'DATE_DIFF' as const,
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
