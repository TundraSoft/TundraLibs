import { assertEquals, assertStringIncludes } from '$asserts';
import { GuardianError } from '../GuardianError.ts';

Deno.test('GuardianError', async (t) => {
  await t.step('constructs with basic message', () => {
    const error = new GuardianError({
      got: 'string',
      expected: 'number',
      comparison: 'type',
    });

    assertStringIncludes(error.message, 'Expected value to be number');
    assertStringIncludes(error.message, 'but got string');
  });

  await t.step('includes path and key information', () => {
    const error = new GuardianError({
      got: 'string',
      expected: 'number',
      comparison: 'type',
      path: 'user.details',
      key: 'age',
    });

    assertStringIncludes(error.message, "at 'user.details.age'");
    assertEquals(error.path, 'user.details');
    assertEquals(error.key, 'age');
    assertEquals(error.location, 'user.details.age');
  });

  await t.step('formats different value types correctly', () => {
    // Number
    const error1 = new GuardianError({ got: 42, expected: 'string' });
    assertStringIncludes(error1.message, 'but got 42');

    // Boolean
    const error2 = new GuardianError({ got: true, expected: 'string' });
    assertStringIncludes(error2.message, 'but got TRUE');

    // Object
    const error3 = new GuardianError({ got: { a: 1 }, expected: 'string' });
    assertStringIncludes(error3.message, 'but got {"a":1}');

    // Array
    const error4 = new GuardianError({ got: [1, 2, 3], expected: 'string' });
    assertStringIncludes(error4.message, 'but got (1, 2, 3)');

    // Date
    const date = new Date('2023-01-01');
    const error5 = new GuardianError({ got: date, expected: 'string' });
    assertStringIncludes(error5.message, 'but got 2023-01-01');

    // RegExp
    const error6 = new GuardianError({ got: /test/, expected: 'string' });
    assertStringIncludes(error6.message, 'but got /test/');

    // null and undefined
    const error7 = new GuardianError({ got: null, expected: 'string' });
    assertStringIncludes(error7.message, 'but got null');

    // const error8 = new GuardianError({ got: undefined, expected: 'string' });
    // assertStringIncludes(error8.message, 'but got undefined');
  });

  await t.step('uses custom message when provided', () => {
    const error = new GuardianError(
      { got: 'foo', expected: 'bar' },
      'Custom ${got} message with ${expected}',
    );

    assertEquals(error.message, 'Custom foo message with bar');
  });

  await t.step('formats array expectation correctly', () => {
    const error = new GuardianError({
      got: 'red',
      expected: ['red', 'green', 'blue'],
      comparison: 'notIn',
    });

    assertStringIncludes(
      error.message,
      'Expected value not to be (red, green, blue)',
    );
  });

  await t.step('provides access to expected and got values', () => {
    const error = new GuardianError({
      got: 'string',
      expected: 'number',
    });

    assertEquals(error.got, 'string');
    assertEquals(error.expected, 'number');
  });

  await t.step('handles errors without got or expected', () => {
    const error1 = new GuardianError({
      comparison: 'validation',
    });

    assertStringIncludes(error1.message, 'Validation failed');

    const error2 = new GuardianError({
      got: 'bad value',
    });

    assertStringIncludes(error2.message, 'Unexpected value: bad value');
  });

  await t.step('provides access to location, got and expected values', () => {
    const error = new GuardianError({
      got: 'string',
      expected: 'number',
      path: 'user.details',
      key: 'age',
    });

    // Test location (combination of path and key)
    assertEquals(error.location, 'user.details.age');

    // Test direct access to got value
    assertEquals(error.got, 'string');

    // Test direct access to expected value
    assertEquals(error.expected, 'number');

    // Test with array expected value
    const error2 = new GuardianError({
      got: 'red',
      expected: ['blue', 'green', 'yellow'],
      comparison: 'in',
    });

    assertEquals(error2.got, 'red');
    assertEquals(error2.expected, '(blue, green, yellow)');
  });

  await t.step('provides location info even with just key or path', () => {
    const errorWithJustKey = new GuardianError({
      got: 'string',
      expected: 'number',
      key: 'name',
    });

    assertEquals(errorWithJustKey.location, 'name');

    const errorWithJustPath = new GuardianError({
      got: 'string',
      expected: 'number',
      path: 'user.profile',
    });

    assertEquals(errorWithJustPath.location, 'user.profile');
  });

  await t.step('formats expected and got values in error messages', () => {
    // Test complex objects
    const complexObject = { id: 1, name: 'Test', nested: { value: true } };
    const error = new GuardianError({
      got: complexObject,
      expected: 'simple object',
    });

    // Ensure got value is preserved correctly
    assertEquals(error.got, '{"id":1,"name":"Test","nested":{"value":true}}');

    // Check error message contains serialized representation
    assertStringIncludes(error.message, JSON.stringify(complexObject));

    // Test with array values
    const arrayValue = [1, 2, 3, 4, 5];
    const error2 = new GuardianError({
      got: arrayValue,
      expected: 'string',
    });

    assertEquals(error2.got, '(1, 2, 3, 4, 5)');
    assertStringIncludes(error2.message, '(1, 2, 3, 4, 5)');
  });
});
