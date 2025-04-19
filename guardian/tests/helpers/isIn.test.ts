import { assertEquals, assertThrows } from '$asserts';
import { isIn } from '../../helpers/mod.ts';

Deno.test('Guardian.helpers.isIn', async (t) => {
  await t.step('passes value when it is one of allowed values', () => {
    const oneOfTest = isIn([1, 2, 3]);
    assertEquals(oneOfTest(1), 1);
    assertEquals(oneOfTest(2), 2);
    assertEquals(oneOfTest(3), 3);
  });

  await t.step('throws error when value is not one of allowed values', () => {
    const oneOfTest = isIn([1, 2, 3]);

    assertThrows(
      () => oneOfTest(4),
      Error,
      'Expected value to be in (1, 2, 3), got 4',
    );
  });

  await t.step('should not work with empty array', () => {
    assertThrows(
      () => isIn([]),
      Error,
      'Argument "expected" must be a non-empty array',
    );
  });

  await t.step('works with strings', () => {
    const oneOfTest = isIn(['red', 'green', 'blue']);
    assertEquals(oneOfTest('red'), 'red');
    assertEquals(oneOfTest('green'), 'green');
    assertEquals(oneOfTest('blue'), 'blue');

    assertThrows(
      () => oneOfTest('yellow'),
      Error,
      'Expected value to be in (red, green, blue), got yellow',
    );
  });

  await t.step('supports custom error message', () => {
    const customMessage = 'Invalid color choice';
    const oneOfTest = isIn(['red', 'green', 'blue'], customMessage);

    assertThrows(
      () => oneOfTest('yellow'),
      Error,
      customMessage,
    );
  });

  await t.step('works with mixed types in array', () => {
    const oneOfTest = isIn([1, 'two', true]);
    assertEquals(oneOfTest(1), 1);
    assertEquals(oneOfTest('two'), 'two');
    assertEquals(oneOfTest(true), true);

    assertThrows(
      () => oneOfTest(false),
      Error,
      'Expected value to be in (1, two, true)',
    );
  });

  await t.step('handles null and undefined values in allowed list', () => {
    const oneOfTest = isIn([1, null, undefined]);
    assertEquals(oneOfTest(1), 1);
    assertEquals(oneOfTest(null), null);
    assertEquals(oneOfTest(undefined), undefined);

    assertThrows(
      () => oneOfTest('string' as unknown as number),
      Error,
      'Expected value to be in (1, , ), got string',
    );
  });
});
