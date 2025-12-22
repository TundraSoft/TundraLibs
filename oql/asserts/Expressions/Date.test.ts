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
  await t.step('NOW', async (u) => {
    await u.step('valid: NOW expression', () => {
      assertNowExpression({ type: 'NOW' });
    });

    await u.step('invalid: wrong type', () => {
      asserts.assertThrows(
        () => assertNowExpression({ type: 'ADD' } as any),
        TypeError,
        "Expected 'NOW'",
      );
    });

    await u.step('valid: isNowExpression', () => {
      asserts.assertEquals(isNowExpression({ type: 'NOW' }), true);
      asserts.assertEquals(isNowExpression({ type: 'ADD' }), false);
    });
  });

  await t.step('CURRENT_DATE', async (u) => {
    await u.step('valid: CURRENT_DATE expression', () => {
      assertCurrentDateExpression({ type: 'CURRENT_DATE' });
    });

    await u.step('invalid: wrong type', () => {
      asserts.assertThrows(
        () => assertCurrentDateExpression({ type: 'NOW' } as any),
        TypeError,
        "Expected 'CURRENT_DATE'",
      );
    });

    await u.step('valid: isCurrentDateExpression', () => {
      asserts.assertEquals(
        isCurrentDateExpression({ type: 'CURRENT_DATE' }),
        true,
      );
      asserts.assertEquals(isCurrentDateExpression({ type: 'NOW' }), false);
    });
  });

  await t.step('CURRENT_TIME', async (u) => {
    await u.step('valid: CURRENT_TIME expression', () => {
      assertCurrentTimeExpression({ type: 'CURRENT_TIME' });
    });

    await u.step('invalid: wrong type', () => {
      asserts.assertThrows(
        () => assertCurrentTimeExpression({ type: 'NOW' } as any),
        TypeError,
        "Expected 'CURRENT_TIME'",
      );
    });

    await u.step('valid: isCurrentTimeExpression', () => {
      asserts.assertEquals(
        isCurrentTimeExpression({ type: 'CURRENT_TIME' }),
        true,
      );
      asserts.assertEquals(isCurrentTimeExpression({ type: 'NOW' }), false);
    });
  });

  await t.step('CURRENT_TIMESTAMP', async (u) => {
    await u.step('valid: CURRENT_TIMESTAMP expression', () => {
      assertCurrentTimestampExpression({ type: 'CURRENT_TIMESTAMP' });
    });

    await u.step('invalid: wrong type', () => {
      asserts.assertThrows(
        () => assertCurrentTimestampExpression({ type: 'NOW' } as any),
        TypeError,
        "Expected 'CURRENT_TIMESTAMP'",
      );
    });

    await u.step('valid: isCurrentTimestampExpression', () => {
      asserts.assertEquals(
        isCurrentTimestampExpression({ type: 'CURRENT_TIMESTAMP' }),
        true,
      );
      asserts.assertEquals(
        isCurrentTimestampExpression({ type: 'NOW' }),
        false,
      );
    });
  });

  await t.step('CURRENT_TIMESTAMPTZ', async (u) => {
    await u.step('valid: CURRENT_TIMESTAMPTZ expression', () => {
      assertCurrentTimestampTZExpression({ type: 'CURRENT_TIMESTAMPTZ' });
    });

    await u.step('invalid: wrong type', () => {
      asserts.assertThrows(
        () => assertCurrentTimestampTZExpression({ type: 'NOW' } as any),
        TypeError,
        "Expected 'CURRENT_TIMESTAMPTZ'",
      );
    });

    await u.step('valid: isCurrentTimestampTZExpression', () => {
      asserts.assertEquals(
        isCurrentTimestampTZExpression({ type: 'CURRENT_TIMESTAMPTZ' }),
        true,
      );
      asserts.assertEquals(
        isCurrentTimestampTZExpression({ type: 'NOW' }),
        false,
      );
    });
  });

  await t.step('DATE_ADD', async (u) => {
    await u.step('valid: with Date literal', () => {
      assertDateAddExpression({
        type: 'DATE_ADD',
        args: {
          date: new Date('2024-01-01'),
          amount: 7,
          unit: 'DAYS',
        },
      });
    });

    await u.step('valid: with column reference', () => {
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

    await u.step('valid: with all time units', () => {
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

    await u.step('valid: with negative amount', () => {
      assertDateAddExpression({
        type: 'DATE_ADD',
        args: {
          date: new Date(),
          amount: -7,
          unit: 'DAYS',
        },
      });
    });

    await u.step('valid: isDateAddExpression', () => {
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

    await u.step('invalid: missing args', () => {
      asserts.assertThrows(
        () => assertDateAddExpression({ type: 'DATE_ADD' } as any),
        TypeError,
        "Missing 'args'",
      );
    });

    await u.step('invalid: args not object', () => {
      asserts.assertThrows(
        () =>
          assertDateAddExpression({ type: 'DATE_ADD', args: 'invalid' } as any),
        TypeError,
        'args key must be an object',
      );
    });

    await u.step('invalid: missing date', () => {
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

    await u.step('invalid: missing amount', () => {
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

    await u.step('invalid: missing unit', () => {
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

    await u.step('invalid: invalid unit', () => {
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

    await u.step('invalid: invalid date type', () => {
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

    await u.step('invalid: invalid amount type', () => {
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

    await u.step('invalid: amount is boolean', () => {
      asserts.assertThrows(
        () =>
          assertDateAddExpression({
            type: 'DATE_ADD',
            args: { date: new Date(), amount: true, unit: 'DAYS' },
          } as any),
        TypeError,
        'amount must be a number or ColumnIdentifier',
      );
    });

    await u.step('invalid: column not in list', () => {
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
    });
  });

  await t.step('assertDateExpression', async (u) => {
    await u.step('valid: delegates to specific validators', () => {
      assertDateExpression({ type: 'NOW' });
      assertDateExpression({ type: 'CURRENT_DATE' });
      assertDateExpression({ type: 'CURRENT_TIME' });
      assertDateExpression({ type: 'CURRENT_TIMESTAMP' });
      assertDateExpression({ type: 'CURRENT_TIMESTAMPTZ' });
      assertDateExpression({
        type: 'DATE_ADD',
        args: { date: new Date(), amount: 7, unit: 'DAYS' },
      });
    });

    await u.step('invalid: unknown date type', () => {
      asserts.assertThrows(
        () => assertDateExpression({ type: 'INVALID_DATE_TYPE' } as any),
        TypeError,
        "Expected a Date expression type, got 'INVALID_DATE_TYPE'",
      );
    });

    await u.step('invalid: numeric expression', () => {
      asserts.assertThrows(
        () => assertDateExpression({ type: 'ADD', args: [1, 2] } as any),
        TypeError,
        "Expected a Date expression type, got 'ADD'",
      );
    });
  });

  await t.step('isDateExpression', async (u) => {
    await u.step('valid: date expressions', () => {
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

    await u.step('invalid: expressions', () => {
      asserts.assertEquals(
        isDateExpression({ type: 'ADD', args: [1, 2] }),
        false,
      );
      asserts.assertEquals(isDateExpression({ type: 'CONCAT' }), false);
      asserts.assertEquals(isDateExpression({ type: 'INVALID' }), false);
    });
  });

  await t.step('integration tests', async (u) => {
    await u.step('filter date expressions', () => {
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

    await u.step('validate query with date expressions', () => {
      const columns = ['createdAt', 'updatedAt', 'deletedAt'];

      assertDateExpression(
        {
          type: 'DATE_ADD',
          args: { date: '@createdAt', amount: 30, unit: 'DAYS' },
        },
        columns,
      );

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

    await u.step('type narrowing with isDateExpression', () => {
      const expr: unknown = { type: 'NOW' };

      if (isDateExpression(expr)) {
        asserts.assertEquals(expr.type, 'NOW');
      }
    });
  });
});
