import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
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
} from './date.ts';

describe('oql.asserts.Expressions.Date', () => {
  describe('NOW', () => {
    it('valid: NOW expression', () => {
      assertNowExpression({ $$_expression: 'NOW' });
    });

    it('invalid: wrong type', () => {
      asserts.assertThrows(
        () => assertNowExpression({ $$_expression: 'ADD' } as any),
        TypeError,
        "Expected 'NOW'",
      );
    });

    it('valid: isNowExpression', () => {
      asserts.assertEquals(isNowExpression({ $$_expression: 'NOW' }), true);
      asserts.assertEquals(isNowExpression({ $$_expression: 'ADD' }), false);
    });
  });

  describe('CURRENT_DATE', () => {
    it('valid: CURRENT_DATE expression', () => {
      assertCurrentDateExpression({ $$_expression: 'CURRENT_DATE' });
    });

    it('invalid: wrong type', () => {
      asserts.assertThrows(
        () => assertCurrentDateExpression({ $$_expression: 'NOW' } as any),
        TypeError,
        "Expected 'CURRENT_DATE'",
      );
    });

    it('valid: isCurrentDateExpression', () => {
      asserts.assertEquals(
        isCurrentDateExpression({ $$_expression: 'CURRENT_DATE' }),
        true,
      );
      asserts.assertEquals(
        isCurrentDateExpression({ $$_expression: 'NOW' }),
        false,
      );
    });
  });

  describe('CURRENT_TIME', () => {
    it('valid: CURRENT_TIME expression', () => {
      assertCurrentTimeExpression({ $$_expression: 'CURRENT_TIME' });
    });

    it('invalid: wrong type', () => {
      asserts.assertThrows(
        () => assertCurrentTimeExpression({ $$_expression: 'NOW' } as any),
        TypeError,
        "Expected 'CURRENT_TIME'",
      );
    });

    it('valid: isCurrentTimeExpression', () => {
      asserts.assertEquals(
        isCurrentTimeExpression({ $$_expression: 'CURRENT_TIME' }),
        true,
      );
      asserts.assertEquals(
        isCurrentTimeExpression({ $$_expression: 'NOW' }),
        false,
      );
    });
  });

  describe('CURRENT_TIMESTAMP', () => {
    it('valid: CURRENT_TIMESTAMP expression', () => {
      assertCurrentTimestampExpression({ $$_expression: 'CURRENT_TIMESTAMP' });
    });

    it('invalid: wrong type', () => {
      asserts.assertThrows(
        () => assertCurrentTimestampExpression({ $$_expression: 'NOW' } as any),
        TypeError,
        "Expected 'CURRENT_TIMESTAMP'",
      );
    });

    it('valid: isCurrentTimestampExpression', () => {
      asserts.assertEquals(
        isCurrentTimestampExpression({ $$_expression: 'CURRENT_TIMESTAMP' }),
        true,
      );
      asserts.assertEquals(
        isCurrentTimestampExpression({ $$_expression: 'NOW' }),
        false,
      );
    });
  });

  describe('CURRENT_TIMESTAMPTZ', () => {
    it('valid: CURRENT_TIMESTAMPTZ expression', () => {
      assertCurrentTimestampTZExpression({
        $$_expression: 'CURRENT_TIMESTAMPTZ',
      });
    });

    it('invalid: wrong type', () => {
      asserts.assertThrows(
        () =>
          assertCurrentTimestampTZExpression({ $$_expression: 'NOW' } as any),
        TypeError,
        "Expected 'CURRENT_TIMESTAMPTZ'",
      );
    });

    it('valid: isCurrentTimestampTZExpression', () => {
      asserts.assertEquals(
        isCurrentTimestampTZExpression({
          $$_expression: 'CURRENT_TIMESTAMPTZ',
        }),
        true,
      );
      asserts.assertEquals(
        isCurrentTimestampTZExpression({ $$_expression: 'NOW' }),
        false,
      );
    });
  });

  describe('DATE_ADD', () => {
    it('valid: with Date literal', () => {
      assertDateAddExpression({
        $$_expression: 'DATE_ADD',
        args: {
          date: new Date('2024-01-01'),
          amount: 7,
          unit: 'DAYS',
        },
      });
    });

    it('valid: with column reference', () => {
      assertDateAddExpression(
        {
          $$_expression: 'DATE_ADD',
          args: {
            date: '@createdAt',
            amount: 30,
            unit: 'DAYS',
          },
        },
        ['createdAt'],
      );
    });

    it('valid: with all time units', () => {
      const units = ['DAYS', 'MONTHS', 'YEARS', 'HOURS', 'MINUTES', 'SECONDS'];

      for (const unit of units) {
        assertDateAddExpression({
          $$_expression: 'DATE_ADD',
          args: {
            date: new Date(),
            amount: 1,
            unit: unit as any,
          },
        });
      }
    });

    it('valid: with negative amount', () => {
      assertDateAddExpression({
        $$_expression: 'DATE_ADD',
        args: {
          date: new Date(),
          amount: -7,
          unit: 'DAYS',
        },
      });
    });

    it('valid: isDateAddExpression', () => {
      asserts.assertEquals(
        isDateAddExpression({
          $$_expression: 'DATE_ADD',
          args: { date: new Date(), amount: 7, unit: 'DAYS' },
        }),
        true,
      );

      asserts.assertEquals(
        isDateAddExpression({
          $$_expression: 'DATE_ADD',
          args: { date: new Date(), amount: 7 },
        }),
        false,
      );
    });

    it('invalid: missing args', () => {
      asserts.assertThrows(
        () => assertDateAddExpression({ $$_expression: 'DATE_ADD' } as any),
        TypeError,
        "Missing 'args'",
      );
    });

    it('invalid: args not object', () => {
      asserts.assertThrows(
        () =>
          assertDateAddExpression(
            { $$_expression: 'DATE_ADD', args: 'invalid' } as any,
          ),
        TypeError,
        'args key must be an object',
      );
    });

    it('invalid: missing date', () => {
      asserts.assertThrows(
        () =>
          assertDateAddExpression({
            $$_expression: 'DATE_ADD',
            args: { amount: 7, unit: 'DAYS' },
          } as any),
        TypeError,
        "Missing 'date'",
      );
    });

    it('invalid: missing amount', () => {
      asserts.assertThrows(
        () =>
          assertDateAddExpression({
            $$_expression: 'DATE_ADD',
            args: { date: new Date(), unit: 'DAYS' },
          } as any),
        TypeError,
        "Missing 'amount'",
      );
    });

    it('invalid: missing unit', () => {
      asserts.assertThrows(
        () =>
          assertDateAddExpression({
            $$_expression: 'DATE_ADD',
            args: { date: new Date(), amount: 7 },
          } as any),
        TypeError,
        "Missing 'unit'",
      );
    });

    it('invalid: invalid unit', () => {
      asserts.assertThrows(
        () =>
          assertDateAddExpression({
            $$_expression: 'DATE_ADD',
            args: { date: new Date(), amount: 7, unit: 'WEEKS' },
          } as any),
        TypeError,
        'Invalid time unit',
      );
    });

    it('invalid: invalid date type', () => {
      asserts.assertThrows(
        () =>
          assertDateAddExpression({
            $$_expression: 'DATE_ADD',
            args: { date: 123, amount: 7, unit: 'DAYS' },
          } as any),
        TypeError,
        'date must be a Date object or ColumnIdentifier',
      );
    });

    it('invalid: invalid amount type', () => {
      asserts.assertThrows(
        () =>
          assertDateAddExpression({
            $$_expression: 'DATE_ADD',
            args: { date: new Date(), amount: 'seven', unit: 'DAYS' },
          } as any),
        TypeError,
        'amount must be a number or ColumnIdentifier',
      );
    });

    it('invalid: amount is boolean', () => {
      asserts.assertThrows(
        () =>
          assertDateAddExpression({
            $$_expression: 'DATE_ADD',
            args: { date: new Date(), amount: true, unit: 'DAYS' },
          } as any),
        TypeError,
        'amount must be a number or ColumnIdentifier',
      );
    });

    it('invalid: column not in list', () => {
      asserts.assertThrows(
        () =>
          assertDateAddExpression(
            {
              $$_expression: 'DATE_ADD',
              args: { date: '@invalidColumn', amount: 7, unit: 'DAYS' },
            },
            ['createdAt', 'updatedAt'],
          ),
        TypeError,
        'date must be a Date object or ColumnIdentifier',
      );
    });
  });

  describe('assertDateExpression', () => {
    it('valid: delegates to specific validators', () => {
      assertDateExpression({ $$_expression: 'NOW' });
      assertDateExpression({ $$_expression: 'CURRENT_DATE' });
      assertDateExpression({ $$_expression: 'CURRENT_TIME' });
      assertDateExpression({ $$_expression: 'CURRENT_TIMESTAMP' });
      assertDateExpression({ $$_expression: 'CURRENT_TIMESTAMPTZ' });
      assertDateExpression({
        $$_expression: 'DATE_ADD',
        args: { date: new Date(), amount: 7, unit: 'DAYS' },
      });
    });

    it('invalid: unknown date type', () => {
      asserts.assertThrows(
        () =>
          assertDateExpression({ $$_expression: 'INVALID_DATE_TYPE' } as any),
        TypeError,
        "Expected a Date expression type, got 'INVALID_DATE_TYPE'",
      );
    });

    it('invalid: numeric expression', () => {
      asserts.assertThrows(
        () =>
          assertDateExpression({ $$_expression: 'ADD', args: [1, 2] } as any),
        TypeError,
        "Expected a Date expression type, got 'ADD'",
      );
    });
  });

  describe('isDateExpression', () => {
    it('valid: date expressions', () => {
      asserts.assertEquals(isDateExpression({ $$_expression: 'NOW' }), true);
      asserts.assertEquals(
        isDateExpression({ $$_expression: 'CURRENT_DATE' }),
        true,
      );
      asserts.assertEquals(
        isDateExpression({
          $$_expression: 'DATE_ADD',
          args: { date: new Date(), amount: 7, unit: 'DAYS' },
        }),
        true,
      );
    });

    it('invalid: expressions', () => {
      asserts.assertEquals(
        isDateExpression({ $$_expression: 'ADD', args: [1, 2] }),
        false,
      );
      asserts.assertEquals(
        isDateExpression({ $$_expression: 'CONCAT' }),
        false,
      );
      asserts.assertEquals(
        isDateExpression({ $$_expression: 'INVALID' }),
        false,
      );
    });
  });

  describe('integration tests', () => {
    it('filter date expressions', () => {
      const expressions: unknown[] = [
        { $$_expression: 'NOW' },
        { $$_expression: 'ADD', args: [1, 2] },
        { $$_expression: 'CURRENT_DATE' },
        { $$_expression: 'CONCAT', args: ['a', 'b'] },
        {
          $$_expression: 'DATE_ADD',
          args: { date: new Date(), amount: 7, unit: 'DAYS' },
        },
        'invalid',
      ];

      const dateExpressions = expressions.filter((x) => isDateExpression(x));

      asserts.assertEquals(dateExpressions.length, 3);
      asserts.assertEquals(dateExpressions[0], { $$_expression: 'NOW' });
      asserts.assertEquals(dateExpressions[1], {
        $$_expression: 'CURRENT_DATE',
      });
    });

    it('validate query with date expressions', () => {
      const columns = ['createdAt', 'updatedAt', 'deletedAt'];

      assertDateExpression(
        {
          $$_expression: 'DATE_ADD',
          args: { date: '@createdAt', amount: 30, unit: 'DAYS' },
        },
        columns,
      );

      asserts.assertThrows(
        () =>
          assertDateExpression(
            {
              $$_expression: 'DATE_ADD',
              args: { date: '@invalidColumn', amount: 30, unit: 'DAYS' },
            },
            columns,
          ),
        TypeError,
      );
    });

    it('type narrowing with isDateExpression', () => {
      const expr: unknown = { $$_expression: 'NOW' };

      if (isDateExpression(expr)) {
        asserts.assertEquals(expr.$$_expression, 'NOW');
      }
    });
  });
});
