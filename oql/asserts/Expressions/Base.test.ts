import * as asserts from '$asserts';
import {
  assertBaseExpression,
  isBaseExpression,
  validateTimeUnits,
} from './Base.ts';

Deno.test('oql.asserts.Expressions.Base', async (t) => {
  await t.step('assertBaseExpression', async (u) => {
    await u.step('valid: Expression object', () => {
      assertBaseExpression({ type: 'NOW' });
      assertBaseExpression({ type: 'ADD', args: [] });
      assertBaseExpression({ type: 'CONCAT', args: [] });
      assertBaseExpression({ type: 'COUNT' });
    });

    await u.step('valid: with type check', () => {
      assertBaseExpression({ type: 'NOW' }, 'NOW');
      assertBaseExpression({ type: 'ADD', args: [1, 2] }, 'ADD');
      assertBaseExpression({ type: 'CONCAT', args: ['a', 'b'] }, 'CONCAT');
    });

    await u.step('valid: type check is optional', () => {
      assertBaseExpression({ type: 'ANYTHING' });
      assertBaseExpression({ type: 'CUSTOM_TYPE', custom: true });
    });

    await u.step('invalid: not an object', () => {
      asserts.assertThrows(
        () => assertBaseExpression('not an object'),
        TypeError,
        'Expected object',
      );

      asserts.assertThrows(
        () => assertBaseExpression(123),
        TypeError,
        'Expected object',
      );

      asserts.assertThrows(
        () => assertBaseExpression(null),
        TypeError,
        'Expected object',
      );

      asserts.assertThrows(
        () => assertBaseExpression(undefined),
        TypeError,
        'Expected object',
      );

      asserts.assertThrows(
        () => assertBaseExpression([]),
        TypeError,
        "Missing 'type' property",
      );
    });

    await u.step('invalid: missing type', () => {
      asserts.assertThrows(
        () => assertBaseExpression({ args: [] }),
        TypeError,
        "Missing 'type' property",
      );

      asserts.assertThrows(
        () => assertBaseExpression({ data: 'test' }),
        TypeError,
        "Missing 'type' property",
      );
    });

    await u.step('invalid: wrong type', () => {
      asserts.assertThrows(
        () => assertBaseExpression({ type: 'NOW' }, 'ADD'),
        TypeError,
        "Expected 'ADD', got 'NOW'",
      );

      asserts.assertThrows(
        () => assertBaseExpression({ type: 'CONCAT' }, 'LOWER'),
        TypeError,
        "Expected 'LOWER', got 'CONCAT'",
      );
    });
  });

  await t.step('isBaseExpression', async (u) => {
    await u.step('valid: Expression objects', () => {
      asserts.assertEquals(isBaseExpression({ type: 'NOW' }), true);
      asserts.assertEquals(isBaseExpression({ type: 'ADD', args: [] }), true);
      asserts.assertEquals(
        isBaseExpression({ type: 'CURRENT_DATE' }),
        true,
      );
      asserts.assertEquals(isBaseExpression({ type: 'ANY_TYPE' }), true);
    });

    await u.step('valid: with type check', () => {
      asserts.assertEquals(isBaseExpression({ type: 'NOW' }, 'NOW'), true);
      asserts.assertEquals(isBaseExpression({ type: 'ADD' }, 'ADD'), true);
      asserts.assertEquals(isBaseExpression({ type: 'NOW' }, 'ADD'), false);
    });

    await u.step('invalid: objects', () => {
      asserts.assertEquals(isBaseExpression({ args: [] }), false);
      asserts.assertEquals(isBaseExpression('not an object'), false);
      asserts.assertEquals(isBaseExpression(123), false);
      asserts.assertEquals(isBaseExpression(null), false);
      asserts.assertEquals(isBaseExpression(undefined), false);
      asserts.assertEquals(isBaseExpression([]), false);
    });

    await u.step('valid: type guard narrowing', () => {
      const value: unknown = { type: 'NOW' };
      if (isBaseExpression(value)) {
        asserts.assertEquals(value.type, 'NOW');
      }
    });
  });

  await t.step('validateTimeUnits', async (u) => {
    await u.step('valid: TimeUnits', () => {
      validateTimeUnits('DAYS');
      validateTimeUnits('MONTHS');
      validateTimeUnits('YEARS');
      validateTimeUnits('HOURS');
      validateTimeUnits('MINUTES');
      validateTimeUnits('SECONDS');
    });

    await u.step('valid: case sensitive', () => {
      validateTimeUnits('DAYS');
      validateTimeUnits('HOURS');

      asserts.assertThrows(
        () => validateTimeUnits('days'),
        TypeError,
        'Invalid time unit',
      );

      asserts.assertThrows(
        () => validateTimeUnits('Days'),
        TypeError,
        'Invalid time unit',
      );
    });

    await u.step('invalid: wrong string', () => {
      asserts.assertThrows(
        () => validateTimeUnits('INVALID'),
        TypeError,
        'Invalid time unit',
      );

      asserts.assertThrows(
        () => validateTimeUnits('days'),
        TypeError,
        'Invalid time unit',
      );

      asserts.assertThrows(
        () => validateTimeUnits('Day'),
        TypeError,
        'Invalid time unit',
      );

      asserts.assertThrows(
        () => validateTimeUnits('WEEK'),
        TypeError,
        'Invalid time unit',
      );
    });

    await u.step('invalid: not a string', () => {
      asserts.assertThrows(
        () => validateTimeUnits(123),
        TypeError,
        'Invalid time unit',
      );

      asserts.assertThrows(
        () => validateTimeUnits(null),
        TypeError,
        'Invalid time unit',
      );

      asserts.assertThrows(
        () => validateTimeUnits(undefined),
        TypeError,
        'Invalid time unit',
      );

      asserts.assertThrows(
        () => validateTimeUnits({ unit: 'DAYS' }),
        TypeError,
        'Invalid time unit',
      );
    });

    await u.step('invalid: empty string', () => {
      asserts.assertThrows(
        () => validateTimeUnits(''),
        TypeError,
        'Invalid time unit',
      );
    });
  });

  await t.step('edge cases', async (u) => {
    await u.step('expression with extra properties', () => {
      assertBaseExpression({
        type: 'ADD',
        args: [1, 2],
        metadata: 'extra',
      });
      asserts.assertEquals(
        isBaseExpression({ type: 'NOW', extra: true }),
        true,
      );
    });

    await u.step('type property with non-string value', () => {
      assertBaseExpression({ type: 123 as any });
      assertBaseExpression({ type: null as any });
    });

    await u.step('empty type string', () => {
      assertBaseExpression({ type: '' });
      asserts.assertEquals(isBaseExpression({ type: '' }), true);
    });
  });

  await t.step('integration tests', async (u) => {
    await u.step('validate expression pipeline', () => {
      const expressions: unknown[] = [
        { type: 'ADD', args: [1, 2] },
        { type: 'NOW' },
        'invalid',
        { args: [] },
        { type: 'CONCAT', args: ['a', 'b'] },
      ];

      const validExpressions = expressions.filter((x) => isBaseExpression(x));

      asserts.assertEquals(validExpressions.length, 3);
      asserts.assertEquals(validExpressions, [
        { type: 'ADD', args: [1, 2] },
        { type: 'NOW' },
        { type: 'CONCAT', args: ['a', 'b'] },
      ]);
    });

    await u.step('validate time units in DATE_ADD', () => {
      const dateAddExpression = {
        type: 'DATE_ADD',
        args: {
          date: '@createdAt',
          amount: 7,
          unit: 'DAYS',
        },
      };

      assertBaseExpression(dateAddExpression, 'DATE_ADD');
      validateTimeUnits(dateAddExpression.args.unit);

      const invalidExpression = {
        type: 'DATE_ADD',
        args: {
          date: '@createdAt',
          amount: 7,
          unit: 'WEEKS',
        },
      };

      assertBaseExpression(invalidExpression, 'DATE_ADD');
      asserts.assertThrows(
        () => validateTimeUnits(invalidExpression.args.unit),
        TypeError,
        'Invalid time unit',
      );
    });

    await u.step('type-specific validation with assertBaseExpression', () => {
      const expr1 = { type: 'ADD', args: [1, 2, 3] };
      assertBaseExpression(expr1);
      asserts.assert(isBaseExpression(expr1, 'ADD'));

      const expr2 = { type: 'NOW' };
      assertBaseExpression(expr2);
      asserts.assert(isBaseExpression(expr2, 'NOW'));
      asserts.assert(!isBaseExpression(expr2, 'ADD'));
    });
  });
});
