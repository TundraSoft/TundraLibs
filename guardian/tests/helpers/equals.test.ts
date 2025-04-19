import { assertEquals, assertThrows } from '$asserts';
import { equals } from '../../helpers/mod.ts';

Deno.test('Guardian.helpers.equals', async (t) => {
  await t.step('passes value when it equals expected value', () => {
    const equalsTest = equals(5);
    assertEquals(equalsTest(5), 5);
  });

  await t.step('throws error when value does not equal expected value', () => {
    const equalsTest = equals(5);

    assertThrows(
      () => equalsTest(10),
      Error,
      'Expected value to be 5, but got 10',
    );
  });

  await t.step('compares null and undefined correctly', () => {
    const nullTest = equals(null);
    assertEquals(nullTest(null), null);

    const undefinedTest = equals(undefined);
    assertEquals(undefinedTest(undefined), undefined);

    assertThrows(
      () => nullTest(undefined!),
      Error,
    );

    assertThrows(
      () => undefinedTest(null!),
      Error,
    );
  });

  await t.step('supports custom error messages', () => {
    const customMessage = 'Value must be 5';
    const equalsTest = equals(5, customMessage);

    assertThrows(
      () => equalsTest(10),
      Error,
      customMessage,
    );
  });

  await t.step('works with strings', () => {
    const equalsTest = equals('hello');
    assertEquals(equalsTest('hello'), 'hello');

    assertThrows(
      () => equalsTest('world'),
      Error,
      'Expected value to be hello, but got world',
    );
  });

  await t.step('works with boolean values', () => {
    const trueTest = equals(true);
    assertEquals(trueTest(true), true);

    assertThrows(
      () => trueTest(false),
      Error,
      'Expected value to be true',
    );
  });

  await t.step('works with objects', () => {
    // Note: For objects, this will check reference equality, not deep equality
    const obj = { test: 1 };
    const objTest = equals(obj);
    assertEquals(objTest(obj), obj);

    assertThrows(
      () => objTest({ test: 1 }),
      Error,
      'Expected value to be {"test":1}, but got {"test":1}',
    );
  });
});
