import * as asserts from '$asserts';
import {
  assertBaseExpression,
  isBaseExpression,
  validateTimeUnits,
} from './Base.ts';

Deno.test('oql.asserts.Expressions.Base', async (t) => {
  //#region assertBaseExpression Tests

  await t.step('assertBaseExpression - valid Expression object', () => {
    assertBaseExpression({ type: 'NOW' });
    assertBaseExpression({ type: 'ADD', args: [] });
    assertBaseExpression({ type: 'CONCAT', args: [] });
    assertBaseExpression({ type: 'COUNT' });
  });

  await t.step('assertBaseExpression - valid with type check', () => {
    assertBaseExpression({ type: 'NOW' }, 'NOW');
    assertBaseExpression({ type: 'ADD', args: [1, 2] }, 'ADD');
    assertBaseExpression({ type: 'CONCAT', args: ['a', 'b'] }, 'CONCAT');
  });

  await t.step('assertBaseExpression - invalid: not an object', () => {
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

  await t.step('assertBaseExpression - invalid: missing type', () => {
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

  await t.step('assertBaseExpression - invalid: wrong type', () => {
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

  await t.step('assertBaseExpression - type check is optional', () => {
    // Should not throw when type is not specified
    assertBaseExpression({ type: 'ANYTHING' });
    assertBaseExpression({ type: 'CUSTOM_TYPE', custom: true });
  });

  //#endregion assertBaseExpression Tests

  //#region isBaseExpression Tests

  await t.step('isBaseExpression - valid Expression objects', () => {
    asserts.assertEquals(isBaseExpression({ type: 'NOW' }), true);
    asserts.assertEquals(isBaseExpression({ type: 'ADD', args: [] }), true);
    asserts.assertEquals(
      isBaseExpression({ type: 'CURRENT_DATE' }),
      true,
    );
    asserts.assertEquals(isBaseExpression({ type: 'ANY_TYPE' }), true);
  });

  await t.step('isBaseExpression - valid with type check', () => {
    asserts.assertEquals(isBaseExpression({ type: 'NOW' }, 'NOW'), true);
    asserts.assertEquals(isBaseExpression({ type: 'ADD' }, 'ADD'), true);
    asserts.assertEquals(isBaseExpression({ type: 'NOW' }, 'ADD'), false);
  });

  await t.step('isBaseExpression - invalid objects', () => {
    asserts.assertEquals(isBaseExpression({ args: [] }), false);
    asserts.assertEquals(isBaseExpression('not an object'), false);
    asserts.assertEquals(isBaseExpression(123), false);
    asserts.assertEquals(isBaseExpression(null), false);
    asserts.assertEquals(isBaseExpression(undefined), false);
    asserts.assertEquals(isBaseExpression([]), false);
  });

  await t.step('Type guard narrowing with isBaseExpression', () => {
    const value: unknown = { type: 'NOW' };
    if (isBaseExpression(value)) {
      // TypeScript should narrow to Expressions type
      asserts.assertEquals(value.type, 'NOW');
    }
  });

  //#endregion isBaseExpression Tests

  //#region validateTimeUnits Tests

  await t.step('validateTimeUnits - valid TimeUnits', () => {
    validateTimeUnits('DAYS');
    validateTimeUnits('MONTHS');
    validateTimeUnits('YEARS');
    validateTimeUnits('HOURS');
    validateTimeUnits('MINUTES');
    validateTimeUnits('SECONDS');
  });

  await t.step('validateTimeUnits - invalid: wrong string', () => {
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

  await t.step('validateTimeUnits - invalid: not a string', () => {
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

  await t.step('validateTimeUnits - case sensitive', () => {
    // Should accept uppercase only
    validateTimeUnits('DAYS');
    validateTimeUnits('HOURS');

    // Should reject lowercase or mixed case
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

  //#endregion validateTimeUnits Tests

  //#region Edge Cases

  await t.step('Edge case: expression with extra properties', () => {
    // Should accept expressions with additional properties
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

  await t.step('Edge case: type property with non-string value', () => {
    // Type exists but is not a string - should still pass base validation
    assertBaseExpression({ type: 123 as any });
    assertBaseExpression({ type: null as any });
  });

  await t.step('Edge case: empty type string', () => {
    assertBaseExpression({ type: '' });
    asserts.assertEquals(isBaseExpression({ type: '' }), true);
  });

  await t.step('Edge case: validateTimeUnits with empty string', () => {
    asserts.assertThrows(
      () => validateTimeUnits(''),
      TypeError,
      'Invalid time unit',
    );
  });

  //#endregion Edge Cases

  //#region Integration Tests

  await t.step('Integration: validate expression pipeline', () => {
    // Simulate a validation pipeline
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

  await t.step('Integration: validate time units in DATE_ADD', () => {
    // Simulate DATE_ADD validation
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

    // Invalid unit
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

  await t.step(
    'Integration: type-specific validation with assertBaseExpression',
    () => {
      // First validate base structure, then do type-specific validation
      const expr1 = { type: 'ADD', args: [1, 2, 3] };
      assertBaseExpression(expr1);
      asserts.assert(isBaseExpression(expr1, 'ADD'));

      const expr2 = { type: 'NOW' };
      assertBaseExpression(expr2);
      asserts.assert(isBaseExpression(expr2, 'NOW'));
      asserts.assert(!isBaseExpression(expr2, 'ADD'));
    },
  );

  //#endregion Integration Tests
});
