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
  //#region ADD Expression Tests

  await t.step('assertAddExpression - valid with numbers', () => {
    assertAddExpression({ type: 'ADD', args: [5, 3] });
  });

  await t.step('assertAddExpression - valid with single number', () => {
    assertAddExpression({ type: 'ADD', args: [42] });
  });

  await t.step('assertAddExpression - valid with multiple numbers', () => {
    assertAddExpression({ type: 'ADD', args: [1, 2, 3, 4, 5] });
  });

  await t.step('assertAddExpression - valid with columns', () => {
    assertAddExpression(
      { type: 'ADD', args: ['@price', '@tax'] },
      ['price', 'tax'],
    );
  });

  await t.step('assertAddExpression - invalid: wrong type', () => {
    asserts.assertThrows(
      () => assertAddExpression({ type: 'SUBTRACT' } as any),
      TypeError,
      "Expected 'ADD'",
    );
  });

  await t.step('assertAddExpression - invalid: missing args', () => {
    asserts.assertThrows(
      () => assertAddExpression({ type: 'ADD' } as any),
      TypeError,
      "Missing 'args'",
    );
  });

  await t.step('assertAddExpression - invalid: args not array', () => {
    asserts.assertThrows(
      () => assertAddExpression({ type: 'ADD', args: 'invalid' } as any),
      TypeError,
      'must be an array',
    );
  });

  await t.step('assertAddExpression - invalid: empty args', () => {
    asserts.assertThrows(
      () => assertAddExpression({ type: 'ADD', args: [] } as any),
      TypeError,
      'at least 1',
    );
  });

  await t.step('isAddExpression - valid and invalid', () => {
    asserts.assert(isAddExpression({ type: 'ADD', args: [5, 3] }));
    asserts.assert(!isAddExpression({ type: 'SUBTRACT', args: [5, 3] }));
    asserts.assert(!isAddExpression({ type: 'ADD' } as any));
  });

  //#endregion

  //#region SUBTRACT Expression Tests

  await t.step('assertSubtractExpression - valid with numbers', () => {
    assertSubtractExpression({ type: 'SUBTRACT', args: [10, 3] });
  });

  await t.step('assertSubtractExpression - valid with columns', () => {
    assertSubtractExpression(
      { type: 'SUBTRACT', args: ['@total', '@discount'] },
      ['total', 'discount'],
    );
  });

  await t.step('assertSubtractExpression - invalid: missing args', () => {
    asserts.assertThrows(
      () => assertSubtractExpression({ type: 'SUBTRACT' } as any),
      TypeError,
      "Missing 'args'",
    );
  });

  await t.step('isSubtractExpression - valid and invalid', () => {
    asserts.assert(
      isSubtractExpression({ type: 'SUBTRACT', args: [10, 3] }),
    );
    asserts.assert(!isSubtractExpression({ type: 'ADD', args: [10, 3] }));
  });

  //#endregion

  //#region MULTIPLY Expression Tests

  await t.step('assertMultiplyExpression - valid with numbers', () => {
    assertMultiplyExpression({ type: 'MULTIPLY', args: [5, 4] });
  });

  await t.step('assertMultiplyExpression - valid with columns', () => {
    assertMultiplyExpression(
      { type: 'MULTIPLY', args: ['@quantity', '@price'] },
      ['quantity', 'price'],
    );
  });

  await t.step('isMultiplyExpression - valid and invalid', () => {
    asserts.assert(
      isMultiplyExpression({ type: 'MULTIPLY', args: [5, 4] }),
    );
    asserts.assert(
      !isMultiplyExpression({ type: 'DIVIDE', args: [5, 4] }),
    );
  });

  //#endregion

  //#region DIVIDE Expression Tests

  await t.step('assertDivideExpression - valid with numbers', () => {
    assertDivideExpression({ type: 'DIVIDE', args: [20, 5] });
  });

  await t.step('assertDivideExpression - valid with columns', () => {
    assertDivideExpression(
      { type: 'DIVIDE', args: ['@total', '@count'] },
      ['total', 'count'],
    );
  });

  await t.step('isDivideExpression - valid and invalid', () => {
    asserts.assert(isDivideExpression({ type: 'DIVIDE', args: [20, 5] }));
    asserts.assert(
      !isDivideExpression({ type: 'MULTIPLY', args: [20, 5] }),
    );
  });

  //#endregion

  //#region MODULO Expression Tests

  await t.step('assertModuloExpression - valid with numbers', () => {
    assertModuloExpression({ type: 'MODULO', args: [17, 5] });
  });

  await t.step('assertModuloExpression - valid with columns', () => {
    assertModuloExpression(
      { type: 'MODULO', args: ['@value', '@divisor'] },
      ['value', 'divisor'],
    );
  });

  await t.step('isModuloExpression - valid and invalid', () => {
    asserts.assert(isModuloExpression({ type: 'MODULO', args: [17, 5] }));
    asserts.assert(!isModuloExpression({ type: 'ADD', args: [17, 5] }));
  });

  //#endregion

  //#region ABS Expression Tests

  await t.step('assertAbsExpression - valid with number', () => {
    assertAbsExpression({ type: 'ABS', args: [-42] });
  });

  await t.step('assertAbsExpression - valid with column', () => {
    assertAbsExpression({ type: 'ABS', args: ['@balance'] }, ['balance']);
  });

  await t.step('assertAbsExpression - invalid: missing arg', () => {
    asserts.assertThrows(
      () => assertAbsExpression({ type: 'ABS' } as any),
      TypeError,
      'arg',
    );
  });

  await t.step('assertAbsExpression - invalid: string arg', () => {
    asserts.assertThrows(
      () => assertAbsExpression({ type: 'ABS', arg: 'invalid' } as any),
      TypeError,
    );
  });

  await t.step('isAbsExpression - valid and invalid', () => {
    asserts.assert(isAbsExpression({ type: 'ABS', args: [-42] }));
    asserts.assert(!isAbsExpression({ type: 'CEIL', args: [3.14] }));
    asserts.assert(!isAbsExpression({ type: 'ABS' } as any));
  });

  //#endregion

  //#region CEIL Expression Tests

  await t.step('assertCeilExpression - valid with number', () => {
    assertCeilExpression({ type: 'CEIL', args: [3.14] });
  });

  await t.step('assertCeilExpression - valid with column', () => {
    assertCeilExpression({ type: 'CEIL', args: ['@price'] }, ['price']);
  });

  await t.step('isCeilExpression - valid and invalid', () => {
    asserts.assert(isCeilExpression({ type: 'CEIL', args: [3.14] }));
    asserts.assert(!isCeilExpression({ type: 'FLOOR', args: [3.14] }));
  });

  //#endregion

  //#region FLOOR Expression Tests

  await t.step('assertFloorExpression - valid with number', () => {
    assertFloorExpression({ type: 'FLOOR', args: [3.99] });
  });

  await t.step('assertFloorExpression - valid with column', () => {
    assertFloorExpression({ type: 'FLOOR', args: ['@value'] }, ['value']);
  });

  await t.step('isFloorExpression - valid and invalid', () => {
    asserts.assert(isFloorExpression({ type: 'FLOOR', args: [3.99] }));
    asserts.assert(!isFloorExpression({ type: 'ROUND', args: [3.99] }));
  });

  //#endregion

  //#region ROUND Expression Tests

  await t.step('assertRoundExpression - valid with number', () => {
    assertRoundExpression({ type: 'ROUND', args: [3.67] });
  });

  await t.step('assertRoundExpression - valid with column', () => {
    assertRoundExpression({ type: 'ROUND', args: ['@amount'] }, ['amount']);
  });

  await t.step('isRoundExpression - valid and invalid', () => {
    asserts.assert(isRoundExpression({ type: 'ROUND', args: [3.67] }));
    asserts.assert(!isRoundExpression({ type: 'CEIL', args: [3.67] }));
  });

  //#endregion

  //#region POWER Expression Tests

  await t.step('assertPowerExpression - valid with numbers', () => {
    assertPowerExpression({ type: 'POWER', args: { base: 2, exponent: 8 } });
  });

  await t.step('assertPowerExpression - valid with columns', () => {
    assertPowerExpression(
      { type: 'POWER', args: { base: '@base', exponent: '@exp' } },
      ['base', 'exp'],
    );
  });

  await t.step('assertPowerExpression - invalid: missing args', () => {
    asserts.assertThrows(
      () => assertPowerExpression({ type: 'POWER' } as any),
      TypeError,
      "Missing 'args'",
    );
  });

  await t.step('assertPowerExpression - invalid: args not object', () => {
    asserts.assertThrows(
      () => assertPowerExpression({ type: 'POWER', args: 'invalid' } as any),
      TypeError,
      'must be an object',
    );
  });

  await t.step('assertPowerExpression - invalid: missing base', () => {
    asserts.assertThrows(
      () =>
        assertPowerExpression({ type: 'POWER', args: { exponent: 8 } } as any),
      TypeError,
      'base',
    );
  });

  await t.step('assertPowerExpression - invalid: missing exponent', () => {
    asserts.assertThrows(
      () => assertPowerExpression({ type: 'POWER', args: { base: 2 } } as any),
      TypeError,
      'exponent',
    );
  });

  await t.step('isPowerExpression - valid and invalid', () => {
    asserts.assert(
      isPowerExpression({ type: 'POWER', args: { base: 2, exponent: 8 } }),
    );
    asserts.assert(!isPowerExpression({ type: 'SQRT', arg: 16 }));
  });

  //#endregion

  //#region SQRT Expression Tests

  await t.step('assertSqrtExpression - valid with number', () => {
    assertSqrtExpression({ type: 'SQRT', args: [16] });
  });

  await t.step('assertSqrtExpression - valid with column', () => {
    assertSqrtExpression({ type: 'SQRT', args: ['@area'] }, ['area']);
  });

  await t.step('isSqrtExpression - valid and invalid', () => {
    asserts.assert(isSqrtExpression({ type: 'SQRT', args: [16] }));
    asserts.assert(!isSqrtExpression({ type: 'ABS', args: [16] }));
  });

  //#endregion

  //#region LENGTH Expression Tests

  await t.step('assertLengthExpression - valid with string', () => {
    assertLengthExpression({ type: 'LENGTH', args: 'hello' });
  });

  await t.step('assertLengthExpression - valid with column', () => {
    assertLengthExpression({ type: 'LENGTH', args: '@name' }, ['name']);
  });

  await t.step('assertLengthExpression - invalid: missing arg', () => {
    asserts.assertThrows(
      () => assertLengthExpression({ type: 'LENGTH' } as any),
      TypeError,
      'arg',
    );
  });

  await t.step('assertLengthExpression - invalid: numeric arg', () => {
    asserts.assertThrows(
      () => assertLengthExpression({ type: 'LENGTH', args: 123 } as any),
      TypeError,
    );
  });

  await t.step('isLengthExpression - valid and invalid', () => {
    asserts.assert(isLengthExpression({ type: 'LENGTH', args: 'hello' }));
    asserts.assert(!isLengthExpression({ type: 'LOWER', args: 'hello' }));
  });

  //#endregion

  //#region DATE_DIFF Expression Tests

  const date1 = new Date('2024-01-01');
  const date2 = new Date('2024-01-15');

  await t.step('assertDateDiffExpression - valid with Date literals', () => {
    assertDateDiffExpression({
      type: 'DATE_DIFF',
      args: { from: date1, to: date2, unit: 'DAYS' },
    });
  });

  await t.step('assertDateDiffExpression - valid with columns', () => {
    assertDateDiffExpression(
      {
        type: 'DATE_DIFF',
        args: { from: '@createdAt', to: '@updatedAt', unit: 'HOURS' },
      },
      ['createdAt', 'updatedAt'],
    );
  });

  await t.step('assertDateDiffExpression - valid with all time units', () => {
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

  await t.step('assertDateDiffExpression - invalid: missing args', () => {
    asserts.assertThrows(
      () => assertDateDiffExpression({ type: 'DATE_DIFF' } as any),
      TypeError,
      "Missing 'args'",
    );
  });

  await t.step('assertDateDiffExpression - invalid: args not object', () => {
    asserts.assertThrows(
      () =>
        assertDateDiffExpression({ type: 'DATE_DIFF', args: 'invalid' } as any),
      TypeError,
      'must be an object',
    );
  });

  await t.step('assertDateDiffExpression - invalid: missing from', () => {
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

  await t.step('assertDateDiffExpression - invalid: missing to', () => {
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

  await t.step('assertDateDiffExpression - invalid: missing unit', () => {
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

  await t.step('assertDateDiffExpression - invalid: invalid unit', () => {
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

  await t.step('isDateDiffExpression - valid and invalid', () => {
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

  //#endregion

  //#region Numeric Expression Top-Level Tests

  await t.step('assertNumericExpression - delegates to ADD', () => {
    assertNumericExpression({ type: 'ADD', args: [5, 3] });
  });

  await t.step('assertNumericExpression - delegates to SUBTRACT', () => {
    assertNumericExpression({ type: 'SUBTRACT', args: [10, 3] });
  });

  await t.step('assertNumericExpression - delegates to MULTIPLY', () => {
    assertNumericExpression({ type: 'MULTIPLY', args: [5, 4] });
  });

  await t.step('assertNumericExpression - delegates to DIVIDE', () => {
    assertNumericExpression({ type: 'DIVIDE', args: [20, 5] });
  });

  await t.step('assertNumericExpression - delegates to MODULO', () => {
    assertNumericExpression({ type: 'MODULO', args: [17, 5] });
  });

  await t.step('assertNumericExpression - delegates to ABS', () => {
    assertNumericExpression({ type: 'ABS', args: [-42] });
  });

  await t.step('assertNumericExpression - delegates to CEIL', () => {
    assertNumericExpression({ type: 'CEIL', args: [3.14] });
  });

  await t.step('assertNumericExpression - delegates to FLOOR', () => {
    assertNumericExpression({ type: 'FLOOR', args: [3.99] });
  });

  await t.step('assertNumericExpression - delegates to ROUND', () => {
    assertNumericExpression({ type: 'ROUND', args: [3.67] });
  });

  await t.step('assertNumericExpression - delegates to POWER', () => {
    assertNumericExpression({
      type: 'POWER',
      args: { base: 2, exponent: 8 },
    });
  });

  await t.step('assertNumericExpression - delegates to SQRT', () => {
    assertNumericExpression({ type: 'SQRT', args: [16] });
  });

  await t.step('assertNumericExpression - delegates to LENGTH', () => {
    assertNumericExpression({ type: 'LENGTH', args: 'hello' });
  });

  await t.step('assertNumericExpression - delegates to DATE_DIFF', () => {
    assertNumericExpression({
      type: 'DATE_DIFF',
      args: { from: new Date(), to: new Date(), unit: 'DAYS' },
    });
  });

  await t.step('assertNumericExpression - invalid: unknown type', () => {
    asserts.assertThrows(
      () => assertNumericExpression({ type: 'UNKNOWN' } as any),
      TypeError,
      'Expected a Numeric expression type',
    );
  });

  await t.step('assertNumericExpression - invalid: date expression', () => {
    asserts.assertThrows(
      () => assertNumericExpression({ type: 'NOW' } as any),
      TypeError,
      'Expected a Numeric expression type',
    );
  });

  await t.step('assertNumericExpression - invalid: string expression', () => {
    asserts.assertThrows(
      () => assertNumericExpression({ type: 'UUID' } as any),
      TypeError,
      'Expected a Numeric expression type',
    );
  });

  await t.step('isNumericExpression - valid numeric expressions', () => {
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

  await t.step('isNumericExpression - invalid expressions', () => {
    asserts.assert(!isNumericExpression({ type: 'NOW' }));
    asserts.assert(!isNumericExpression({ type: 'UUID' }));
    asserts.assert(!isNumericExpression({ type: 'CONCAT', args: ['a', 'b'] }));
    asserts.assert(!isNumericExpression({ type: 'UNKNOWN' } as any));
    asserts.assert(!isNumericExpression('not an object' as any));
  });

  //#endregion

  //#region Integration Tests

  await t.step('Integration: complex nested numeric expressions', () => {
    const expr = {
      type: 'ADD',
      args: ['@quantity', '@bonus'],
    };

    assertNumericExpression(expr, ['quantity', 'bonus']);
  });

  await t.step('Integration: validate with column list', () => {
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

  await t.step('Integration: type narrowing with isNumericExpression', () => {
    const expr: unknown = { type: 'ADD', args: [5, 3] };

    if (isNumericExpression(expr)) {
      // Type is narrowed to NumericExpression
      asserts.assert(expr.type === 'ADD');
    } else {
      asserts.fail('Expected numeric expression');
    }
  });

  await t.step('Integration: all expression types work', () => {
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
  //#endregion
});
