import { assertEquals, assertThrows } from '$asserts';
import { GuardianError } from '../../GuardianError.ts';
import { notEquals } from '../../helpers/mod.ts';

Deno.test('Guardian.helpers.notEquals', async (t) => {
  await t.step(
    'passes value when it does not equal the forbidden value',
    () => {
      const notEqualsTest = notEquals(5);
      assertEquals(notEqualsTest(10), 10);
    },
  );

  await t.step('throws error when value equals the forbidden value', () => {
    const notEqualsTest = notEquals(5);

    assertThrows(
      () => notEqualsTest(5),
      GuardianError,
      'Expected value to not be 5, but got 5',
    );
  });

  await t.step('compares null and undefined correctly', () => {
    const notNullTest = notEquals(null);
    assertEquals(notNullTest(undefined!), undefined);
    assertEquals(
      notNullTest('value' as unknown as null),
      'value' as unknown as null,
    );

    assertThrows(
      () => notNullTest(null),
      GuardianError,
      'Expected value to not be null, but got null',
    );

    const notUndefinedTest = notEquals(undefined);
    assertEquals(notUndefinedTest(null!), null);
    assertEquals(
      notUndefinedTest('value' as unknown as undefined),
      'value' as unknown as undefined,
    );

    assertThrows(
      () => notUndefinedTest(undefined),
      Error,
      'Expected value to not be undefined, but got undefined',
    );
  });

  await t.step('supports custom error messages', () => {
    const customMessage = 'Value must not be 5';
    const notEqualsTest = notEquals(5, customMessage);

    assertThrows(
      () => notEqualsTest(5),
      Error,
      customMessage,
    );
  });

  await t.step('works with strings', () => {
    const notEqualsTest = notEquals('hello');
    assertEquals(notEqualsTest('world'), 'world');

    assertThrows(
      () => notEqualsTest('hello'),
      GuardianError,
      'Expected value to not be hello, but got hello',
    );
  });

  await t.step('works with boolean values', () => {
    const notFalseTest = notEquals(false);
    assertEquals(notFalseTest(true), true);

    assertThrows(
      () => notFalseTest(false),
      GuardianError,
      'Expected value to not be false, but got false',
    );
  });
});
