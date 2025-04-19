import { assertEquals, assertThrows } from '$asserts';
import { isNotIn } from '../../helpers/mod.ts';

Deno.test('Guardian.helpers.isNotIn', async (t) => {
  await t.step('passes value when it is not one of allowed values', () => {
    const oneOfTest = isNotIn([1, 2, 3]);
    assertEquals(oneOfTest(4), 4);
    assertEquals(oneOfTest(5), 5);
    assertEquals(oneOfTest(6), 6);
  });

  await t.step('throws error when value is not one of allowed values', () => {
    const oneOfTest = isNotIn([1, 2, 3]);

    assertThrows(
      () => oneOfTest(1),
      Error,
      'Expected value to be not in (1, 2, 3), got 1',
    );
  });

  await t.step('should not work with empty array', () => {
    assertThrows(
      () => isNotIn([]),
      Error,
      'Argument "expected" must be a non-empty array',
    );
  });

  await t.step('works with strings', () => {
    const oneOfTest = isNotIn(['red', 'green', 'blue']);
    assertEquals(oneOfTest('reds'), 'reds');
    assertEquals(oneOfTest('greens'), 'greens');
    assertEquals(oneOfTest('blues'), 'blues');

    assertThrows(
      () => oneOfTest('red'),
      Error,
      'Expected value to be not in (red, green, blue), got red',
    );
  });

  await t.step('supports custom error message', () => {
    const customMessage = 'Invalid color choice';
    const oneOfTest = isNotIn(['red', 'green', 'blue'], customMessage);

    assertThrows(
      () => oneOfTest('red'),
      Error,
      customMessage,
    );
  });

  await t.step('works with mixed types in array', () => {
    const oneOfTest = isNotIn([1, 'two', true]);
    assertEquals(oneOfTest(2), 2);
    assertEquals(oneOfTest('two2'), 'two2');
    assertEquals(oneOfTest(false), false);

    assertThrows(
      () => oneOfTest(true),
      Error,
      'Expected value to be not in (1, two, true), got true',
    );
  });

  await t.step('handles null and undefined values in allowed list', () => {
    const oneOfTest = isNotIn([1, null, undefined]);

    // These should throw errors since they are in the disallowed list
    assertThrows(
      () => oneOfTest(1),
      Error,
      'Expected value to be not in (1, , ), got 1',
    );

    assertThrows(
      () => oneOfTest(null),
      Error,
      'Expected value to be not in (1, , ), got null',
    );

    assertThrows(
      () => oneOfTest(undefined),
      Error,
      'Expected value to be not in (1, , ), got undefined',
    );

    // This should pass since 'string' is not in the disallowed list
    assertEquals(
      oneOfTest('string' as unknown as number),
      'string' as unknown as number,
    );
  });
});
