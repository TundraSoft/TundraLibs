import * as asserts from '$asserts';
import {
  assertCurrentDateExpression,
  assertCurrentTimeExpression,
  assertCurrentTimestampExpression,
  assertCurrentTimestampTZExpression,
  assertDateAddExpression,
  assertDateExpression,
  assertNowExpression,
  isCurrentDateExpression,
  isCurrentTimeExpression,
  isCurrentTimestampExpression,
  isCurrentTimestampTZExpression,
  isDateAddExpression,
  isDateExpression,
  isNowExpression,
} from './Date.ts';

Deno.test('oql.asserts.Expressions.Date', async (t) => {
  //#region NOW Expression Tests

  await t.step('assertNowExpression - valid NOW expression', () => {
    assertNowExpression({ type: 'NOW' });
  });

  await t.step('assertNowExpression - invalid: wrong type', () => {
    asserts.assertThrows(
      () => assertNowExpression({ type: 'ADD' } as any),
      TypeError,
      "Expected 'NOW'",
    );
  });

  await t.step('isNowExpression - valid and invalid', () => {
    asserts.assertEquals(isNowExpression({ type: 'NOW' }), true);
    asserts.assertEquals(isNowExpression({ type: 'ADD' }), false);
  });

  //#endregion NOW Expression Tests

  //#region CURRENT_DATE Expression Tests

  await t.step('assertCurrentDateExpression - valid', () => {
    assertCurrentDateExpression({ type: 'CURRENT_DATE' });
  });

  await t.step('assertCurrentDateExpression - invalid: wrong type', () => {
    asserts.assertThrows(
      () => assertCurrentDateExpression({ type: 'NOW' } as any),
      TypeError,
      "Expected 'CURRENT_DATE'",
    );
  });

  await t.step('isCurrentDateExpression - valid and invalid', () => {
    asserts.assertEquals(
      isCurrentDateExpression({ type: 'CURRENT_DATE' }),
      true,
    );
    asserts.assertEquals(isCurrentDateExpression({ type: 'NOW' }), false);
  });

  //#endregion CURRENT_DATE Expression Tests

  //#region CURRENT_TIME Expression Tests

  await t.step('assertCurrentTimeExpression - valid', () => {
    assertCurrentTimeExpression({ type: 'CURRENT_TIME' });
  });

  await t.step('assertCurrentTimeExpression - invalid: wrong type', () => {
    asserts.assertThrows(
      () => assertCurrentTimeExpression({ type: 'NOW' } as any),
      TypeError,
      "Expected 'CURRENT_TIME'",
    );
  });

  await t.step('isCurrentTimeExpression - valid and invalid', () => {
    asserts.assertEquals(
      isCurrentTimeExpression({ type: 'CURRENT_TIME' }),
      true,
    );
    asserts.assertEquals(isCurrentTimeExpression({ type: 'NOW' }), false);
  });

  //#endregion CURRENT_TIME Expression Tests

  //#region CURRENT_TIMESTAMP Expression Tests

  await t.step('assertCurrentTimestampExpression - valid', () => {
    assertCurrentTimestampExpression({ type: 'CURRENT_TIMESTAMP' });
  });

  await t.step('assertCurrentTimestampExpression - invalid: wrong type', () => {
    asserts.assertThrows(
      () => assertCurrentTimestampExpression({ type: 'NOW' } as any),
      TypeError,
      "Expected 'CURRENT_TIMESTAMP'",
    );
  });

  await t.step('isCurrentTimestampExpression - valid and invalid', () => {
    asserts.assertEquals(
      isCurrentTimestampExpression({ type: 'CURRENT_TIMESTAMP' }),
      true,
    );
    asserts.assertEquals(
      isCurrentTimestampExpression({ type: 'NOW' }),
      false,
    );
  });

  //#endregion CURRENT_TIMESTAMP Expression Tests

  //#region CURRENT_TIMESTAMPTZ Expression Tests

  await t.step('assertCurrentTimestampTZExpression - valid', () => {
    assertCurrentTimestampTZExpression({ type: 'CURRENT_TIMESTAMPTZ' });
  });

  await t.step(
    'assertCurrentTimestampTZExpression - invalid: wrong type',
    () => {
      asserts.assertThrows(
        () => assertCurrentTimestampTZExpression({ type: 'NOW' } as any),
        TypeError,
        "Expected 'CURRENT_TIMESTAMPTZ'",
      );
    },
  );

  await t.step('isCurrentTimestampTZExpression - valid and invalid', () => {
    asserts.assertEquals(
      isCurrentTimestampTZExpression({ type: 'CURRENT_TIMESTAMPTZ' }),
      true,
    );
    asserts.assertEquals(
      isCurrentTimestampTZExpression({ type: 'NOW' }),
      false,
    );
  });

  //#endregion CURRENT_TIMESTAMPTZ Expression Tests

  //#region DATE_ADD Expression Tests

  await t.step('assertDateAddExpression - valid with Date literal', () => {
    assertDateAddExpression({
      type: 'DATE_ADD',
      args: {
        date: new Date('2024-01-01'),
        amount: 7,
        unit: 'DAYS',
      },
    });
  });

  await t.step('assertDateAddExpression - valid with column reference', () => {
    assertDateAddExpression(
      {
        type: 'DATE_ADD',
        args: {
          date: '@createdAt',
          amount: 30,
          unit: 'DAYS',
        },
      },
      ['createdAt'],
    );
  });

  await t.step('assertDateAddExpression - valid with all time units', () => {
    const units = ['DAYS', 'MONTHS', 'YEARS', 'HOURS', 'MINUTES', 'SECONDS'];

    for (const unit of units) {
      assertDateAddExpression({
        type: 'DATE_ADD',
        args: {
          date: new Date(),
          amount: 1,
          unit: unit as any,
        },
      });
    }
  });

  await t.step('assertDateAddExpression - valid with negative amount', () => {
    assertDateAddExpression({
      type: 'DATE_ADD',
      args: {
        date: new Date(),
        amount: -7,
        unit: 'DAYS',
      },
    });
  });

  await t.step('assertDateAddExpression - invalid: missing args', () => {
    asserts.assertThrows(
      () => assertDateAddExpression({ type: 'DATE_ADD' } as any),
      TypeError,
      "Missing 'args'",
    );
  });

  await t.step('assertDateAddExpression - invalid: args not object', () => {
    asserts.assertThrows(
      () =>
        assertDateAddExpression({ type: 'DATE_ADD', args: 'invalid' } as any),
      TypeError,
      'args key must be an object',
    );
  });

  await t.step('assertDateAddExpression - invalid: missing date', () => {
    asserts.assertThrows(
      () =>
        assertDateAddExpression({
          type: 'DATE_ADD',
          args: { amount: 7, unit: 'DAYS' },
        } as any),
      TypeError,
      "Missing 'date'",
    );
  });

  await t.step('assertDateAddExpression - invalid: missing amount', () => {
    asserts.assertThrows(
      () =>
        assertDateAddExpression({
          type: 'DATE_ADD',
          args: { date: new Date(), unit: 'DAYS' },
        } as any),
      TypeError,
      "Missing 'amount'",
    );
  });

  await t.step('assertDateAddExpression - invalid: missing unit', () => {
    asserts.assertThrows(
      () =>
        assertDateAddExpression({
          type: 'DATE_ADD',
          args: { date: new Date(), amount: 7 },
        } as any),
      TypeError,
      "Missing 'unit'",
    );
  });

  await t.step('assertDateAddExpression - invalid: invalid unit', () => {
    asserts.assertThrows(
      () =>
        assertDateAddExpression({
          type: 'DATE_ADD',
          args: { date: new Date(), amount: 7, unit: 'WEEKS' },
        } as any),
      TypeError,
      'Invalid time unit',
    );
  });

  await t.step('assertDateAddExpression - invalid: invalid date type', () => {
    asserts.assertThrows(
      () =>
        assertDateAddExpression({
          type: 'DATE_ADD',
          args: { date: 123, amount: 7, unit: 'DAYS' },
        } as any),
      TypeError,
      'date must be a Date object or ColumnIdentifier',
    );
  });

  await t.step('assertDateAddExpression - invalid: invalid amount type', () => {
    asserts.assertThrows(
      () =>
        assertDateAddExpression({
          type: 'DATE_ADD',
          args: { date: new Date(), amount: 'seven', unit: 'DAYS' },
        } as any),
      TypeError,
      "must start with '@'",
    );
  });

  await t.step(
    'assertDateAddExpression - invalid: column not in list',
    () => {
      asserts.assertThrows(
        () =>
          assertDateAddExpression(
            {
              type: 'DATE_ADD',
              args: { date: '@invalidColumn', amount: 7, unit: 'DAYS' },
            },
            ['createdAt', 'updatedAt'],
          ),
        TypeError,
        'not in the provided column list',
      );
    },
  );

  await t.step('isDateAddExpression - valid and invalid', () => {
    asserts.assertEquals(
      isDateAddExpression({
        type: 'DATE_ADD',
        args: { date: new Date(), amount: 7, unit: 'DAYS' },
      }),
      true,
    );

    asserts.assertEquals(
      isDateAddExpression({
        type: 'DATE_ADD',
        args: { date: new Date(), amount: 7 },
      }),
      false,
    );
  });

  //#endregion DATE_ADD Expression Tests

  //#region assertDateExpression Tests

  await t.step(
    'assertDateExpression - delegates to specific validators',
    () => {
      assertDateExpression({ type: 'NOW' });
      assertDateExpression({ type: 'CURRENT_DATE' });
      assertDateExpression({ type: 'CURRENT_TIME' });
      assertDateExpression({ type: 'CURRENT_TIMESTAMP' });
      assertDateExpression({ type: 'CURRENT_TIMESTAMPTZ' });
      assertDateExpression({
        type: 'DATE_ADD',
        args: { date: new Date(), amount: 7, unit: 'DAYS' },
      });
    },
  );

  await t.step('assertDateExpression - invalid: unknown date type', () => {
    asserts.assertThrows(
      () => assertDateExpression({ type: 'INVALID_DATE_TYPE' } as any),
      TypeError,
      "Expected a Date expression type, got 'INVALID_DATE_TYPE'",
    );
  });

  await t.step('assertDateExpression - invalid: numeric expression', () => {
    asserts.assertThrows(
      () => assertDateExpression({ type: 'ADD', args: [1, 2] } as any),
      TypeError,
      "Expected a Date expression type, got 'ADD'",
    );
  });

  await t.step('isDateExpression - valid date expressions', () => {
    asserts.assertEquals(isDateExpression({ type: 'NOW' }), true);
    asserts.assertEquals(
      isDateExpression({ type: 'CURRENT_DATE' }),
      true,
    );
    asserts.assertEquals(
      isDateExpression({
        type: 'DATE_ADD',
        args: { date: new Date(), amount: 7, unit: 'DAYS' },
      }),
      true,
    );
  });

  await t.step('isDateExpression - invalid expressions', () => {
    asserts.assertEquals(
      isDateExpression({ type: 'ADD', args: [1, 2] }),
      false,
    );
    asserts.assertEquals(isDateExpression({ type: 'CONCAT' }), false);
    asserts.assertEquals(isDateExpression({ type: 'INVALID' }), false);
  });

  //#endregion assertDateExpression Tests

  //#region Integration Tests

  await t.step('Integration: filter date expressions', () => {
    const expressions: unknown[] = [
      { type: 'NOW' },
      { type: 'ADD', args: [1, 2] },
      { type: 'CURRENT_DATE' },
      { type: 'CONCAT', args: ['a', 'b'] },
      {
        type: 'DATE_ADD',
        args: { date: new Date(), amount: 7, unit: 'DAYS' },
      },
      'invalid',
    ];

    const dateExpressions = expressions.filter((x) => isDateExpression(x));

    asserts.assertEquals(dateExpressions.length, 3);
    asserts.assertEquals(dateExpressions[0], { type: 'NOW' });
    asserts.assertEquals(dateExpressions[1], { type: 'CURRENT_DATE' });
  });

  await t.step('Integration: validate query with date expressions', () => {
    const columns = ['createdAt', 'updatedAt', 'deletedAt'];

    // Valid date column usage
    assertDateExpression(
      {
        type: 'DATE_ADD',
        args: { date: '@createdAt', amount: 30, unit: 'DAYS' },
      },
      columns,
    );

    // Invalid column
    asserts.assertThrows(
      () =>
        assertDateExpression(
          {
            type: 'DATE_ADD',
            args: { date: '@invalidColumn', amount: 30, unit: 'DAYS' },
          },
          columns,
        ),
      TypeError,
    );
  });

  await t.step('Integration: type narrowing with isDateExpression', () => {
    const expr: unknown = { type: 'NOW' };

    if (isDateExpression(expr)) {
      // TypeScript narrows to date expression
      asserts.assertEquals(expr.type, 'NOW');
    }
  });

  //#endregion Integration Tests
});
