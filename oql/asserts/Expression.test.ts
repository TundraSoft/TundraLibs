import * as asserts from '$asserts';
import {
  assertAbsExpression,
  assertAddExpression,
  assertCeilExpression,
  assertConcatExpression,
  assertCurrentDateExpression,
  assertCurrentTimeExpression,
  assertCurrentTimestampExpression,
  assertDateAddExpression,
  assertDateDiffExpression,
  assertDateExpression,
  assertDecryptExpression,
  assertDivideExpression,
  assertEncryptExpression,
  assertExpression,
  assertFloorExpression,
  assertHashExpression,
  assertJSONExpression,
  assertLengthExpression,
  assertLowerExpression,
  assertModuloExpression,
  assertMultiplyExpression,
  assertNowExpression,
  assertNumberExpression,
  assertReplaceExpression,
  assertStringExpression,
  assertSubstrExpression,
  assertSubtractExpression,
  assertTrimExpression,
  assertUpperExpression,
  assertUUIDExpression,
} from './Expression.ts';

Deno.test('OQL.asserts.Expression', async (a) => {
  await a.step('BaseExpression', async (b) => {
    await b.step('should validate proper expression structure', () => {
      // Should pass
      assertExpression({ $expr: 'UUID' });

      // Should fail for invalid expressions
      asserts.assertThrows(
        () => assertExpression(null),
        TypeError,
        'Expression must be an object with $expr property',
      );

      asserts.assertThrows(
        () => assertExpression({}),
        TypeError,
        'must be an object with $expr property',
      );

      asserts.assertThrows(
        () => assertExpression({ $expr: 'INVALID_EXPR' }),
        TypeError,
        'having one of the following values',
      );
    });
  });

  await a.step('StringExpressions', async (b) => {
    await b.step('should validate UUID expression', () => {
      // Should pass
      assertUUIDExpression({ $expr: 'UUID' });

      // Should fail
      asserts.assertThrows(
        () => assertUUIDExpression({ $expr: 'UUID', extra: true }),
        TypeError,
        'should not have any other properties',
      );
    });

    await b.step('should validate CONCAT expression', () => {
      // Should pass
      assertConcatExpression({
        $expr: 'CONCAT',
        $args: ['$firstName', '$lastName'],
      });

      // With nested expressions
      assertConcatExpression({
        $expr: 'CONCAT',
        $args: [
          '$firstName',
          { $expr: 'LOWER', $args: '$lastName' },
        ],
      });

      // Should fail
      asserts.assertThrows(
        () => assertConcatExpression({ $expr: 'CONCAT' }),
        TypeError,
        'Expected $args to be an array',
      );
    });

    await b.step('should validate ENCRYPT/DECRYPT expressions', () => {
      // ENCRYPT should pass
      assertEncryptExpression({
        $expr: 'ENCRYPT',
        $args: ['sensitive data', 'secret key'],
      });

      // DECRYPT should pass
      assertDecryptExpression({
        $expr: 'DECRYPT',
        $args: ['encrypted data', 'secret key'],
      });

      // Should fail with wrong argument count
      asserts.assertThrows(
        () =>
          assertEncryptExpression({
            $expr: 'ENCRYPT',
            $args: ['only one arg'],
          }),
        TypeError,
        'elements',
      );
    });

    await b.step('should validate HASH expression', () => {
      // Should pass
      assertHashExpression({ $expr: 'HASH', $args: 'password123' });
      assertHashExpression({ $expr: 'HASH', $args: '$password' });

      // Should fail
      asserts.assertThrows(
        () => assertHashExpression({ $expr: 'HASH' }),
        TypeError,
        'Expected $args to be defined',
      );
    });

    await b.step('should validate LOWER/UPPER expressions', () => {
      // LOWER should pass
      assertLowerExpression({ $expr: 'LOWER', $args: '$name' });
      assertLowerExpression({ $expr: 'LOWER', $args: 'TEXT' });

      // UPPER should pass
      assertUpperExpression({ $expr: 'UPPER', $args: '$name' });
      assertUpperExpression({ $expr: 'UPPER', $args: 'text' });

      // Should fail
      asserts.assertThrows(
        () => assertLowerExpression({ $expr: 'LOWER' }),
        TypeError,
        'Expected $args to be defined',
      );
    });

    await b.step('should validate REPLACE expression', () => {
      // Should pass
      assertReplaceExpression({
        $expr: 'REPLACE',
        $args: ['Hello World', 'World', 'Universe'],
      });

      // Should fail with wrong argument count
      asserts.assertThrows(
        () =>
          assertReplaceExpression({
            $expr: 'REPLACE',
            $args: ['Hello World', 'World'],
          }),
        TypeError,
        '3 elements',
      );
    });

    await b.step('should validate SUBSTR expression', () => {
      // Should pass with 2 args
      assertSubstrExpression({
        $expr: 'SUBSTR',
        $args: ['Hello World', 0],
      });

      // Should pass with 3 args
      assertSubstrExpression({
        $expr: 'SUBSTR',
        $args: ['Hello World', 0, 5],
      });

      // Should fail with wrong argument count
      asserts.assertThrows(
        () =>
          assertSubstrExpression({
            $expr: 'SUBSTR',
            $args: ['Hello World'],
          }),
        TypeError,
        '2 or 3 elements',
      );
    });

    await b.step('should validate TRIM expression', () => {
      // Should pass
      assertTrimExpression({ $expr: 'TRIM', $args: '  text  ' });

      // Should fail
      asserts.assertThrows(
        () => assertTrimExpression({ $expr: 'TRIM' }),
        TypeError,
        'Expected $args to be defined',
      );
    });

    await b.step('should validate string expression type checking', () => {
      // Should pass
      assertStringExpression({ $expr: 'UUID' });
      assertStringExpression({ $expr: 'LOWER', $args: 'text' });

      // Should fail for non-string expressions
      asserts.assertThrows(
        () => assertStringExpression({ $expr: 'ADD', $args: [1, 2] }),
        TypeError,
        'Unknown string expression type',
      );
    });
  });

  await a.step('DateExpressions', async (b) => {
    await b.step('should validate current date/time expressions', () => {
      // Should pass
      assertNowExpression({ $expr: 'NOW' });
      assertCurrentDateExpression({ $expr: 'CURRENT_DATE' });
      assertCurrentTimeExpression({ $expr: 'CURRENT_TIME' });
      assertCurrentTimestampExpression({ $expr: 'CURRENT_TIMESTAMP' });

      // Should fail with extra properties
      asserts.assertThrows(
        () => assertNowExpression({ $expr: 'NOW', extra: true }),
        TypeError,
        'should not have any other properties',
      );
    });

    await b.step('should validate DATE_ADD expression', () => {
      // Should pass
      assertDateAddExpression({
        $expr: 'DATE_ADD',
        $args: [new Date(), 5],
      });

      // With column identifier
      assertDateAddExpression({
        $expr: 'DATE_ADD',
        $args: ['$createdAt', 5],
      });

      // Should fail
      asserts.assertThrows(
        () => assertDateAddExpression({ $expr: 'DATE_ADD' }),
        TypeError,
        'Expected $args to be an array',
      );

      asserts.assertThrows(
        () =>
          assertDateAddExpression({
            $expr: 'DATE_ADD',
            $args: ['not-a-date', 5],
          }),
        TypeError,
        'Expected first argument to be Date',
      );
    });

    await b.step('should validate date expression type checking', () => {
      // Should pass
      assertDateExpression({ $expr: 'NOW' });
      assertDateExpression({ $expr: 'CURRENT_DATE' });

      // Should fail for non-date expressions
      asserts.assertThrows(
        () => assertDateExpression({ $expr: 'ADD', $args: [1, 2] }),
        TypeError,
        'Unknown date expression type',
      );
    });
  });

  await a.step('NumberExpressions', async (b) => {
    await b.step('should validate DATE_DIFF expression', () => {
      // Should pass
      assertDateDiffExpression({
        $expr: 'DATE_DIFF',
        $args: ['DAYS', new Date(), new Date()],
      });

      assertDateDiffExpression({
        $expr: 'DATE_DIFF',
        $args: ['MONTHS', '$startDate', '$endDate'],
      });

      // Should fail
      asserts.assertThrows(
        () =>
          assertDateDiffExpression({
            $expr: 'DATE_DIFF',
            $args: ['INVALID_UNIT', new Date(), new Date()],
          }),
        TypeError,
        'Expected first argument to be one of',
      );
    });

    await b.step('should validate arithmetic operations', () => {
      // ADD should pass
      assertAddExpression({
        $expr: 'ADD',
        $args: [1, 2, 3],
      });

      // SUBTRACT should pass
      assertSubtractExpression({
        $expr: 'SUBTRACT',
        $args: [10, 5],
      });

      // MULTIPLY should pass
      assertMultiplyExpression({
        $expr: 'MULTIPLY',
        $args: [2, 3, 4],
      });

      // DIVIDE should pass
      assertDivideExpression({
        $expr: 'DIVIDE',
        $args: [10, 2],
      });

      // MODULO should pass
      assertModuloExpression({
        $expr: 'MODULO',
        $args: [10, 3],
      });

      // Should fail with too few arguments
      asserts.assertThrows(
        () =>
          assertAddExpression({
            $expr: 'ADD',
            $args: [1],
          }),
        TypeError,
        'at least 2 elements',
      );
    });

    await b.step('should validate ABS expression', () => {
      // Should pass
      assertAbsExpression({ $expr: 'ABS', $args: -5 });
      assertAbsExpression({ $expr: 'ABS', $args: '$negativeAmount' });

      // Should fail
      asserts.assertThrows(
        () => assertAbsExpression({ $expr: 'ABS' }),
        TypeError,
        'Expected $args to be defined',
      );
    });

    await b.step('should validate CEIL/FLOOR expressions', () => {
      // CEIL should pass
      assertCeilExpression({ $expr: 'CEIL', $args: 5.7 });

      // FLOOR should pass
      assertFloorExpression({ $expr: 'FLOOR', $args: 5.7 });

      // Should fail
      asserts.assertThrows(
        () => assertCeilExpression({ $expr: 'CEIL', $args: 'not-a-number' }),
        TypeError,
        'Expected $args to be number',
      );
    });

    await b.step('should validate LENGTH expression', () => {
      // Should pass
      assertLengthExpression({ $expr: 'LENGTH', $args: 'Hello World' });

      // Should fail
      asserts.assertThrows(
        () => assertLengthExpression({ $expr: 'LENGTH', $args: 123 }),
        TypeError,
        'Expected argument to be string',
      );
    });

    await b.step('should validate number expression type checking', () => {
      // Should pass
      assertNumberExpression({ $expr: 'ABS', $args: 5 });
      assertNumberExpression({ $expr: 'ADD', $args: [1, 2] });

      // Should fail for non-numeric expressions
      asserts.assertThrows(
        () => assertNumberExpression({ $expr: 'UUID' }),
        TypeError,
        'Unknown number expression type',
      );
    });
  });

  await a.step('JSONExpressions', async (b) => {
    await b.step('should validate JSON_VALUE expression', () => {
      // Should pass
      assertJSONExpression({
        $expr: 'JSON_VALUE',
        $args: ['$jsonColumn', ['path', 'to', 'property']],
      });

      // Should fail
      asserts.assertThrows(
        () =>
          assertJSONExpression({
            $expr: 'JSON_VALUE',
            $args: [123, ['path']],
          }),
        TypeError,
        'Expected first argument to be a column identifier',
      );

      asserts.assertThrows(
        () =>
          assertJSONExpression({
            $expr: 'JSON_VALUE',
            $args: ['$jsonColumn', [123]],
          }),
        TypeError,
        'Expected second argument to be an array of strings',
      );
    });
  });
});
