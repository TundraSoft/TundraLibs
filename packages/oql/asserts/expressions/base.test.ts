import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import {
  assertBaseExpression,
  isBaseExpression,
  validateTimeUnits,
} from './base.ts';

describe('oql.asserts.Expressions.Base', () => {
  describe('assertBaseExpression', () => {
    it('valid: Expression object', () => {
      assertBaseExpression({ $$_expression: 'NOW' });
      assertBaseExpression({ $$_expression: 'ADD', args: [] });
      assertBaseExpression({ $$_expression: 'CONCAT', args: [] });
      assertBaseExpression({ $$_expression: 'COUNT' });
    });

    it('valid: with type check', () => {
      assertBaseExpression({ $$_expression: 'NOW' }, 'NOW');
      assertBaseExpression({ $$_expression: 'ADD', args: [1, 2] }, 'ADD');
      assertBaseExpression(
        { $$_expression: 'CONCAT', args: ['a', 'b'] },
        'CONCAT',
      );
    });

    it('valid: type check is optional', () => {
      assertBaseExpression({ $$_expression: 'ANYTHING' });
      assertBaseExpression({ $$_expression: 'CUSTOM_TYPE', custom: true });
    });

    it('invalid: not an object', () => {
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
        "Missing '$$_expression' property",
      );
    });

    it('invalid: missing type', () => {
      asserts.assertThrows(
        () => assertBaseExpression({ args: [] }),
        TypeError,
        "Missing '$$_expression' property",
      );

      asserts.assertThrows(
        () => assertBaseExpression({ data: 'test' }),
        TypeError,
        "Missing '$$_expression' property",
      );
    });

    it('invalid: wrong type', () => {
      asserts.assertThrows(
        () => assertBaseExpression({ $$_expression: 'NOW' }, 'ADD'),
        TypeError,
        "Expected 'ADD', got 'NOW'",
      );

      asserts.assertThrows(
        () => assertBaseExpression({ $$_expression: 'CONCAT' }, 'LOWER'),
        TypeError,
        "Expected 'LOWER', got 'CONCAT'",
      );
    });
  });

  describe('isBaseExpression', () => {
    it('valid: Expression objects', () => {
      asserts.assertEquals(isBaseExpression({ $$_expression: 'NOW' }), true);
      asserts.assertEquals(
        isBaseExpression({ $$_expression: 'ADD', args: [] }),
        true,
      );
      asserts.assertEquals(
        isBaseExpression({ $$_expression: 'CURRENT_DATE' }),
        true,
      );
      asserts.assertEquals(
        isBaseExpression({ $$_expression: 'ANY_TYPE' }),
        true,
      );
    });

    it('valid: with type check', () => {
      asserts.assertEquals(
        isBaseExpression({ $$_expression: 'NOW' }, 'NOW'),
        true,
      );
      asserts.assertEquals(
        isBaseExpression({ $$_expression: 'ADD' }, 'ADD'),
        true,
      );
      asserts.assertEquals(
        isBaseExpression({ $$_expression: 'NOW' }, 'ADD'),
        false,
      );
    });

    it('invalid: objects', () => {
      asserts.assertEquals(isBaseExpression({ args: [] }), false);
      asserts.assertEquals(isBaseExpression('not an object'), false);
      asserts.assertEquals(isBaseExpression(123), false);
      asserts.assertEquals(isBaseExpression(null), false);
      asserts.assertEquals(isBaseExpression(undefined), false);
      asserts.assertEquals(isBaseExpression([]), false);
    });

    it('valid: type guard narrowing', () => {
      const value: unknown = { $$_expression: 'NOW' };
      if (isBaseExpression(value)) {
        asserts.assertEquals(value.$$_expression, 'NOW');
      }
    });
  });

  describe('validateTimeUnits', () => {
    it('valid: TimeUnits', () => {
      validateTimeUnits('DAYS');
      validateTimeUnits('MONTHS');
      validateTimeUnits('YEARS');
      validateTimeUnits('HOURS');
      validateTimeUnits('MINUTES');
      validateTimeUnits('SECONDS');
    });

    it('valid: case sensitive', () => {
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

    it('invalid: wrong string', () => {
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

    it('invalid: not a string', () => {
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

    it('invalid: empty string', () => {
      asserts.assertThrows(
        () => validateTimeUnits(''),
        TypeError,
        'Invalid time unit',
      );
    });
  });

  describe('edge cases', () => {
    it('expression with extra properties', () => {
      assertBaseExpression({
        $$_expression: 'ADD',
        args: [1, 2],
        metadata: 'extra',
      });
      asserts.assertEquals(
        isBaseExpression({ $$_expression: 'NOW', extra: true }),
        true,
      );
    });

    it('$$_expression property with non-string value', () => {
      // assertBaseExpression only checks for the discriminator's presence,
      // not its value type — strict per-type validators handle that.
      assertBaseExpression({ $$_expression: 123 as any });
      assertBaseExpression({ $$_expression: null as any });
    });

    it('empty type string', () => {
      assertBaseExpression({ $$_expression: '' });
      asserts.assertEquals(isBaseExpression({ $$_expression: '' }), true);
    });
  });

  describe('integration tests', () => {
    it('validate expression pipeline', () => {
      const expressions: unknown[] = [
        { $$_expression: 'ADD', args: [1, 2] },
        { $$_expression: 'NOW' },
        'invalid',
        { args: [] },
        { $$_expression: 'CONCAT', args: ['a', 'b'] },
      ];

      const validExpressions = expressions.filter((x) => isBaseExpression(x));

      asserts.assertEquals(validExpressions.length, 3);
      asserts.assertEquals(validExpressions, [
        { $$_expression: 'ADD', args: [1, 2] },
        { $$_expression: 'NOW' },
        { $$_expression: 'CONCAT', args: ['a', 'b'] },
      ]);
    });

    it('validate time units in DATE_ADD', () => {
      const dateAddExpression = {
        $$_expression: 'DATE_ADD',
        args: {
          date: '@createdAt',
          amount: 7,
          unit: 'DAYS',
        },
      };

      assertBaseExpression(dateAddExpression, 'DATE_ADD');
      validateTimeUnits(dateAddExpression.args.unit);

      const invalidExpression = {
        $$_expression: 'DATE_ADD',
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

    it('type-specific validation with assertBaseExpression', () => {
      const expr1 = { $$_expression: 'ADD', args: [1, 2, 3] };
      assertBaseExpression(expr1);
      asserts.assert(isBaseExpression(expr1, 'ADD'));

      const expr2 = { $$_expression: 'NOW' };
      assertBaseExpression(expr2);
      asserts.assert(isBaseExpression(expr2, 'NOW'));
      asserts.assert(!isBaseExpression(expr2, 'ADD'));
    });
  });
});
