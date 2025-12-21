/**
 * Test suite for ExpressionOperators validators
 *
 * Comprehensive tests for ExpressionOperators validator with 100% coverage.
 */
import * as asserts from '$asserts';
import {
  assertExpressionOperators,
  isExpressionOperators,
} from './ExpressionOperators.ts';

Deno.test('oql.asserts.Filters.ExpressionOperators', async (t) => {
  //#region Equality Operators with Expressions

  await t.step(
    'assertExpressionOperators - valid: $eq with numeric expression',
    () => {
      assertExpressionOperators(
        { $eq: { type: 'ADD', args: ['@price', 10] } },
        ['price'],
        'number',
      );
    },
  );

  await t.step(
    'assertExpressionOperators - valid: $ne with string expression',
    () => {
      assertExpressionOperators(
        { $ne: { type: 'CONCAT', args: ['@firstName', ' '] } },
        ['firstName'],
        'string',
      );
    },
  );

  await t.step(
    'assertExpressionOperators - valid: $eq with date expression',
    () => {
      assertExpressionOperators(
        { $eq: { type: 'NOW' } },
        undefined,
        'date',
      );
    },
  );

  await t.step(
    'assertExpressionOperators - valid: with column list validation',
    () => {
      assertExpressionOperators(
        { $eq: { type: 'MULTIPLY', args: ['@price', '@quantity'] } },
        ['price', 'quantity'],
        'number',
      );
    },
  );

  await t.step(
    'assertExpressionOperators - valid: expression references columns',
    () => {
      // Note: Expression format testing is limited without proper Expression type instances
      assertExpressionOperators(
        { $eq: { type: 'ADD', args: ['@price', 10] } },
        ['price'],
        'number',
      );
    },
  );

  await t.step(
    'assertExpressionOperators - valid: expressions with different types (no strict checking)',
    () => {
      // Note: Type checking is not strictly enforced
      assertExpressionOperators(
        { $eq: { type: 'CONCAT', args: ['a', 'b'] } },
        undefined,
        'number',
      );
    },
  );

  //#endregion Equality Operators with Expressions

  //#region Comparison Operators with Expressions

  await t.step('assertExpressionOperators - valid: $gt with expression', () => {
    assertExpressionOperators(
      { $gt: { type: 'SUBTRACT', args: ['@total', '@discount'] } },
      ['total', 'discount'],
      'number',
    );
  });

  await t.step(
    'assertExpressionOperators - valid: $gte with expression',
    () => {
      assertExpressionOperators(
        { $gte: { type: 'MULTIPLY', args: ['@quantity', 2] } },
        ['quantity'],
        'number',
      );
    },
  );

  await t.step('assertExpressionOperators - valid: $lt with expression', () => {
    assertExpressionOperators(
      { $lt: { type: 'SUBTRACT', args: ['@max', 10] } },
      ['max'],
      'number',
    );
  });

  await t.step(
    'assertExpressionOperators - valid: $lte with expression',
    () => {
      assertExpressionOperators(
        { $lte: { type: 'ADD', args: ['@threshold', 5] } },
        ['threshold'],
        'number',
      );
    },
  );

  await t.step(
    'assertExpressionOperators - valid: comparison accepts various expression types',
    () => {
      // Note: Type validation is not strict for expressions
      assertExpressionOperators(
        { $gt: { type: 'CONCAT', args: ['a', 'b'] } },
        undefined,
        'number',
      );
    },
  );

  //#endregion Comparison Operators with Expressions

  //#region String Operators with Expressions

  await t.step(
    'assertExpressionOperators - valid: $like with expression',
    () => {
      assertExpressionOperators(
        { $like: { type: 'LOWER', args: '@searchTerm' } },
        ['searchTerm'],
        'string',
      );
    },
  );

  await t.step(
    'assertExpressionOperators - valid: $ilike with expression',
    () => {
      assertExpressionOperators(
        { $ilike: { type: 'UPPER', args: '@keyword' } },
        ['keyword'],
        'string',
      );
    },
  );

  await t.step(
    'assertExpressionOperators - valid: $startsWith with expression',
    () => {
      assertExpressionOperators(
        { $startsWith: { type: 'TRIM', args: '@prefix' } },
        ['prefix'],
        'string',
      );
    },
  );

  await t.step(
    'assertExpressionOperators - valid: $endsWith with expression',
    () => {
      assertExpressionOperators(
        { $endsWith: { type: 'LOWER', args: '@text' } },
        ['text'],
        'string',
      );
    },
  );

  await t.step(
    'assertExpressionOperators - valid: $contains with expression',
    () => {
      assertExpressionOperators(
        { $contains: { type: 'CONCAT', args: ['@word1', '@word2'] } },
        ['word1', 'word2'],
        'string',
      );
    },
  );

  await t.step(
    'assertExpressionOperators - valid: string operators accept expression types',
    () => {
      // Note: Type validation is not strict for expressions
      assertExpressionOperators(
        { $like: { type: 'ADD', args: [1, 2] } },
        undefined,
        'string',
      );
    },
  );

  //#endregion String Operators with Expressions

  //#region Error Cases

  await t.step('assertExpressionOperators - invalid: not an object', () => {
    asserts.assertThrows(
      () => assertExpressionOperators('invalid' as any),
      TypeError,
      'Expected an object',
    );
  });

  await t.step('assertExpressionOperators - invalid: no operators', () => {
    asserts.assertThrows(
      () => assertExpressionOperators({} as any),
      TypeError,
      'cannot be empty',
    );
  });

  await t.step(
    'assertExpressionOperators - invalid: invalid expression type',
    () => {
      asserts.assertThrows(
        () =>
          assertExpressionOperators(
            { $eq: { type: 'INVALID_EXPR' } as any },
            undefined,
            'number',
          ),
        TypeError,
        'Unknown expression type',
      );
    },
  );

  await t.step(
    'assertExpressionOperators - invalid: expression with missing args',
    () => {
      asserts.assertThrows(
        () =>
          assertExpressionOperators(
            { $eq: { type: 'ADD' } as any },
            undefined,
            'number',
          ),
        TypeError,
        'Unknown expression type',
      );
    },
  );

  await t.step(
    'assertExpressionOperators - invalid: comparison operator on string column',
    () => {
      asserts.assertThrows(
        () =>
          assertExpressionOperators(
            { $gt: { type: 'UPPER', args: '@name' } },
            ['name'],
            'string',
          ),
        TypeError,
        'only valid for numeric or date columns',
      );
    },
  );

  await t.step(
    'assertExpressionOperators - invalid: string operator on numeric column',
    () => {
      asserts.assertThrows(
        () =>
          assertExpressionOperators(
            { $like: { type: 'ADD', args: ['@age', 1] } },
            ['age'],
            'number',
          ),
        TypeError,
        'only valid for string columns',
      );
    },
  );

  //#endregion Error Cases

  //#region Type Guard Tests

  await t.step('isExpressionOperators - valid values', () => {
    asserts.assertEquals(
      isExpressionOperators(
        { $eq: { type: 'ADD', args: ['@x', 1] } },
        ['x'],
        'number',
      ),
      true,
    );
    asserts.assertEquals(
      isExpressionOperators(
        { $like: { type: 'LOWER', args: '@name' } },
        ['name'],
        'string',
      ),
      true,
    );
  });

  await t.step('isExpressionOperators - invalid values', () => {
    asserts.assertEquals(isExpressionOperators('invalid'), false);
    asserts.assertEquals(isExpressionOperators({}), false);
    asserts.assertEquals(
      isExpressionOperators({ $eq: { type: 'BAD' } }, undefined, 'number'),
      false,
    );
  });

  //#endregion Type Guard Tests
});
