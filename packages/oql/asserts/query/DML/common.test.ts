/**
 * @fileoverview Tests for shared DML validators.
 * @module
 */

import { describe, it } from '@tundralibs/compat/test';
import * as asserts from '@std/asserts';
import { validateDataEntry, validateExpressions } from './common.ts';

// =============================================================================
// Test Data
// =============================================================================

const TEST_COLUMNS = ['id', 'name', 'email', 'age', 'count', 'price'];

// =============================================================================
// Test Suites
// =============================================================================

describe('oql.asserts.Query.DML.Common', () => {
  describe('validateExpressions', () => {
    describe('Valid expressions', () => {
      it('should return empty array when expressions is undefined', () => {
        const result = validateExpressions({}, TEST_COLUMNS, 'test');
        asserts.assertEquals(result, []);
      });

      it('should accept single expression', () => {
        const result = validateExpressions(
          {
            expressions: {
              fullName: { $$_expression: 'CONCAT', args: ['@name', ' Smith'] },
            },
          },
          TEST_COLUMNS,
          'test',
        );
        asserts.assertEquals(result, ['fullName']);
      });

      it('should accept multiple expressions', () => {
        const result = validateExpressions(
          {
            expressions: {
              total: { $$_expression: 'ADD', args: ['@price', 10] },
              doubled: { $$_expression: 'MULTIPLY', args: ['@count', 2] },
            },
          },
          TEST_COLUMNS,
          'test',
        );
        asserts.assertEquals(result.sort(), ['doubled', 'total']);
      });

      it('should accept nested expressions', () => {
        const result = validateExpressions(
          {
            expressions: {
              complex: {
                $$_expression: 'ADD',
                args: [
                  { $$_expression: 'MULTIPLY', args: ['@price', 2] },
                  10,
                ],
              },
            },
          },
          TEST_COLUMNS,
          'test',
        );
        asserts.assertEquals(result, ['complex']);
      });

      it('should return all expression keys', () => {
        const result = validateExpressions(
          {
            expressions: {
              expr1: { $$_expression: 'UPPER', args: '@name' },
              expr2: { $$_expression: 'LOWER', args: '@email' },
              expr3: { $$_expression: 'ADD', args: ['@age', 1] },
            },
          },
          TEST_COLUMNS,
          'test',
        );
        asserts.assertEquals(result.length, 3);
        asserts.assert(result.includes('expr1'));
        asserts.assert(result.includes('expr2'));
        asserts.assert(result.includes('expr3'));
      });
    });

    describe('Invalid expressions', () => {
      it('should throw for non-object expressions', () => {
        asserts.assertThrows(
          () =>
            validateExpressions(
              { expressions: 'invalid' },
              TEST_COLUMNS,
              'test',
            ),
          TypeError,
          'must be a non-null object',
        );
      });

      it('should throw for null expressions', () => {
        asserts.assertThrows(
          () =>
            validateExpressions(
              { expressions: null },
              TEST_COLUMNS,
              'test',
            ),
          TypeError,
          'must be a non-null object',
        );
      });

      it('should throw for array expressions', () => {
        asserts.assertThrows(
          () =>
            validateExpressions(
              { expressions: [] },
              TEST_COLUMNS,
              'test',
            ),
          TypeError,
          'must be a non-null object',
        );
      });

      it('should throw for empty expressions object', () => {
        asserts.assertThrows(
          () =>
            validateExpressions(
              { expressions: {} },
              TEST_COLUMNS,
              'test',
            ),
          TypeError,
          'cannot be empty if provided',
        );
      });

      it('should throw for expression key starting with @', () => {
        asserts.assertThrows(
          () =>
            validateExpressions(
              {
                expressions: {
                  '@invalid': { $$_expression: 'UPPER', args: ['@name'] },
                },
              },
              TEST_COLUMNS,
              'test',
            ),
          TypeError,
          "expression key '@invalid' must not start with '@'",
        );
      });

      it('should throw for invalid expression value', () => {
        asserts.assertThrows(
          () =>
            validateExpressions(
              {
                expressions: {
                  badExpr: 'not an expression',
                },
              },
              TEST_COLUMNS,
              'test',
            ),
          TypeError,
          "expression 'badExpr' is invalid",
        );
      });

      it('should throw for expression with invalid type', () => {
        asserts.assertThrows(
          () =>
            validateExpressions(
              {
                expressions: {
                  badExpr: { $$_expression: 'INVALID_TYPE', args: [] },
                },
              },
              TEST_COLUMNS,
              'test',
            ),
          TypeError,
          "expression 'badExpr' is invalid",
        );
      });

      it('should include context in error message', () => {
        asserts.assertThrows(
          () =>
            validateExpressions(
              { expressions: null },
              TEST_COLUMNS,
              'SELECT',
            ),
          TypeError,
          'Invalid SELECT query',
        );
      });
    });
  });

  describe('validateDataEntry', () => {
    describe('Valid data entries', () => {
      it('should accept null value', () => {
        validateDataEntry('name', null, TEST_COLUMNS, 'test');
      });

      it('should accept undefined value', () => {
        validateDataEntry('name', undefined, TEST_COLUMNS, 'test');
      });

      it('should accept Date value', () => {
        validateDataEntry('createdAt', new Date(), ['createdAt'], 'test');
      });

      it('should accept string value', () => {
        validateDataEntry('name', 'John Doe', TEST_COLUMNS, 'test');
      });

      it('should accept number value', () => {
        validateDataEntry('age', 25, TEST_COLUMNS, 'test');
      });

      it('should accept boolean value', () => {
        validateDataEntry('active', true, ['active'], 'test');
      });

      it('should accept bigint value', () => {
        validateDataEntry('big', 9007199254740993n, ['big'], 'test');
      });

      it('should accept expression value with column references', () => {
        validateDataEntry(
          'count',
          { $$_expression: 'ADD', args: ['@count', 1] },
          TEST_COLUMNS,
          'test',
        );
      });

      it('should accept expression value without column references in UPDATE', () => {
        validateDataEntry(
          'price',
          { $$_expression: 'MULTIPLY', args: [100, 2] },
          TEST_COLUMNS,
          'test',
          { allowColumnReferences: true },
        );
      });

      it('should accept nested expression with column reference', () => {
        validateDataEntry(
          'total',
          {
            $$_expression: 'ADD',
            args: [
              { $$_expression: 'MULTIPLY', args: ['@price', 2] },
              10,
            ],
          },
          ['total', 'price'],
          'test',
        );
      });
    });

    describe('Invalid data entries - key validation', () => {
      it('should throw for key not in columns list', () => {
        asserts.assertThrows(
          () => validateDataEntry('invalid', 'value', TEST_COLUMNS, 'test'),
          TypeError,
          "key 'invalid' is not in columns list",
        );
      });

      it('should include context in error message', () => {
        asserts.assertThrows(
          () => validateDataEntry('invalid', 'value', TEST_COLUMNS, 'INSERT'),
          TypeError,
          'Invalid INSERT',
        );
      });
    });

    describe('Invalid data entries - value validation', () => {
      it('should throw for invalid expression', () => {
        asserts.assertThrows(
          () =>
            validateDataEntry(
              'name',
              { $$_expression: 'INVALID_TYPE', args: [] },
              TEST_COLUMNS,
              'test',
            ),
          TypeError,
          'has invalid expression',
        );
      });

      it('should accept object without `type` field as literal payload (JSON column)', () => {
        // Objects without a `type` discriminator are treated as literal
        // payloads (typical case: JSON / JSONB column values). Mirrors
        // the translator's _renderInsertValue / _translateValue check.
        validateDataEntry(
          'profile',
          { displayName: 'Alice', bio: 'hello' },
          ['profile'],
          'test',
        );
      });

      it('should accept nested literal object payload', () => {
        validateDataEntry(
          'metadata',
          { nested: { deeper: { values: [1, 2, 3] } }, count: 5 },
          ['metadata'],
          'test',
        );
      });

      it('should accept literal object across allowColumnReferences modes (INSERT)', () => {
        validateDataEntry(
          'payload',
          { kind: 'invoice', amount: 100 },
          ['payload'],
          'test',
          { allowColumnReferences: false },
        );
      });

      it('should still throw for object with `$$_expression` field but invalid expression', () => {
        // Objects WITH `$$_expression` are validated as Expressions —
        // typos / unknown expression types are caught.
        asserts.assertThrows(
          () =>
            validateDataEntry(
              'name',
              { $$_expression: 'NOT_A_REAL_EXPRESSION', args: [] },
              TEST_COLUMNS,
              'test',
            ),
          TypeError,
          'has invalid expression',
        );
      });

      it('should throw for unsupported value type (plain array)', () => {
        // Plain arrays without expression type are not valid
        asserts.assertThrows(
          () =>
            validateDataEntry(
              'name',
              ['not', 'an', 'expression'],
              TEST_COLUMNS,
              'test',
            ),
          TypeError,
        );
      });

      it('should throw for unsupported value type (function)', () => {
        asserts.assertThrows(
          () =>
            validateDataEntry(
              'name',
              () => 'function',
              TEST_COLUMNS,
              'test',
            ),
          TypeError,
          'must be a primitive value, Date, Expression, or literal object',
        );
      });

      it('should throw for unsupported value type (symbol)', () => {
        asserts.assertThrows(
          () =>
            validateDataEntry(
              'name',
              Symbol('symbol'),
              TEST_COLUMNS,
              'test',
            ),
          TypeError,
          'must be a primitive value, Date, Expression, or literal object',
        );
      });
    });

    describe('Column reference restrictions for INSERT', () => {
      it('should throw for direct column reference when not allowed', () => {
        asserts.assertThrows(
          () =>
            validateDataEntry(
              'name',
              { $$_expression: 'UPPER', args: '@email' },
              TEST_COLUMNS,
              'test',
              { allowColumnReferences: false },
            ),
          TypeError,
          'Column references (e.g., @columnName) are not allowed in INSERT expressions',
        );
      });

      it('should throw for nested column reference when not allowed', () => {
        asserts.assertThrows(
          () =>
            validateDataEntry(
              'total',
              {
                $$_expression: 'ADD',
                args: [
                  { $$_expression: 'MULTIPLY', args: ['@price', 2] },
                  10,
                ],
              },
              ['total', 'price'],
              'test',
              { allowColumnReferences: false },
            ),
          TypeError,
          'Column references (e.g., @columnName) are not allowed',
        );
      });

      it('should throw for column reference in nested expression when not allowed', () => {
        asserts.assertThrows(
          () =>
            validateDataEntry(
              'name',
              {
                $$_expression: 'CONCAT',
                args: ['@email', ' - ', 'suffix'],
              },
              TEST_COLUMNS,
              'test',
              { allowColumnReferences: false },
            ),
          TypeError,
          'Column references (e.g., @columnName) are not allowed',
        );
      });

      it('should accept expression without column references when not allowed', () => {
        validateDataEntry(
          'computed',
          { $$_expression: 'ADD', args: [100, 50] },
          ['computed'],
          'test',
          { allowColumnReferences: false },
        );
      });

      it('should accept string literal starting with @ when not allowed', () => {
        // String literals are primitives, not column references
        validateDataEntry(
          'name',
          '@literal',
          TEST_COLUMNS,
          'test',
          { allowColumnReferences: false },
        );
      });
    });

    describe('Default behavior (allowColumnReferences)', () => {
      it('should default to allowing column references', () => {
        // Should not throw
        validateDataEntry(
          'count',
          { $$_expression: 'ADD', args: ['@count', 1] },
          TEST_COLUMNS,
          'test',
        );
      });

      it('should allow column references when explicitly enabled', () => {
        validateDataEntry(
          'count',
          { $$_expression: 'ADD', args: ['@count', 1] },
          TEST_COLUMNS,
          'test',
          { allowColumnReferences: true },
        );
      });
    });

    describe('Edge cases', () => {
      it('should handle zero as valid number', () => {
        validateDataEntry('age', 0, TEST_COLUMNS, 'test');
      });

      it('should handle empty string as valid value', () => {
        validateDataEntry('name', '', TEST_COLUMNS, 'test');
      });

      it('should handle negative numbers', () => {
        validateDataEntry('balance', -100, ['balance'], 'test');
      });

      it('should handle float numbers', () => {
        validateDataEntry('price', 99.99, TEST_COLUMNS, 'test');
      });

      it('should handle false as valid boolean', () => {
        validateDataEntry('active', false, ['active'], 'test');
      });

      it('should include key name in error messages', () => {
        // Plain objects without `$$_expression` are accepted as literal
        // payloads (e.g. JSON column values), so we exercise the error
        // path via a value with an invalid Expression discriminator to
        // confirm the key name surfaces in the message.
        asserts.assertThrows(
          () =>
            validateDataEntry(
              'email',
              { $$_expression: 'NOT_A_REAL_EXPRESSION', args: [] },
              TEST_COLUMNS,
              'test',
            ),
          TypeError,
          'email has invalid expression',
        );
      });
    });
  });
});
