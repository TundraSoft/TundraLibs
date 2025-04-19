import { assertEquals, assertRejects, assertThrows } from '$asserts';
import { BaseGuardian } from '../BaseGuardian.ts';
import { GuardianError } from '../GuardianError.ts';

class TestGuardian extends BaseGuardian<(value: unknown) => number> {
  static create() {
    return new TestGuardian((value: unknown): number => {
      if (typeof value !== 'number') {
        throw new GuardianError({
          got: value,
          expected: 'number',
          comparison: 'type',
        });
      }
      return value;
    }).proxy();
  }
}

Deno.test('BaseGuardian', async (t) => {
  await t.step('proxy method allows function calls', () => {
    const guardian = TestGuardian.create();
    assertEquals(guardian(42), 42);
    assertThrows(() => guardian('not a number'), GuardianError);
  });

  await t.step('transform method', async (t) => {
    await t.step('transforms sync values correctly', () => {
      const guardian = TestGuardian.create();
      const doubled = guardian.transform((n) => n * 2);

      assertEquals(doubled(5), 10);
      assertThrows(() => doubled('not a number'), GuardianError);
    });

    await t.step('preserves async behavior with promises', async () => {
      // Create an AsyncTestGuardian class to handle async validation
      class AsyncTestGuardian
        extends BaseGuardian<(v: unknown) => Promise<number>> {
        static create() {
          return new AsyncTestGuardian(
            async (value: unknown): Promise<number> => {
              await new Promise((resolve) => setTimeout(resolve, 10));
              if (typeof value !== 'number') {
                throw new GuardianError({
                  got: value,
                  expected: 'number',
                });
              }
              return value;
            },
          ).proxy();
        }
      }

      // Create an async guardian
      const asyncGuardian = AsyncTestGuardian.create();

      const transformed = asyncGuardian.transform(async (n) => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return n * 2;
      });

      assertEquals(await transformed(5), 10);
      await assertRejects(() => transformed('not a number'), GuardianError);
    });
  });

  await t.step('test method', () => {
    const guardian = TestGuardian.create();
    const positive = guardian.test((n) => n > 0, 'Number must be positive');

    assertEquals(positive(5), 5);
    assertThrows(() => positive(-5), GuardianError, 'Number must be positive');
  });

  await t.step('equals method', () => {
    const guardian = TestGuardian.create();
    const equalsFive = guardian.equals(5, 'Must be 5');

    assertEquals(equalsFive(5), 5);
    assertThrows(() => equalsFive(10), GuardianError, 'Must be 5');
  });

  await t.step('notEquals method', () => {
    const guardian = TestGuardian.create();
    const notFive = guardian.notEquals(5, 'Must not be 5');

    assertEquals(notFive(10), 10);
    assertThrows(() => notFive(5), GuardianError, 'Must not be 5');
  });

  await t.step('in method', () => {
    const guardian = TestGuardian.create();
    const validValues = guardian.in([1, 2, 3], 'Must be 1, 2, or 3');

    assertEquals(validValues(2), 2);
    assertThrows(() => validValues(4), GuardianError, 'Must be 1, 2, or 3');
  });

  await t.step('notIn method', () => {
    const guardian = TestGuardian.create();
    const invalidValues = guardian.notIn([1, 2, 3], 'Must not be 1, 2, or 3');

    assertEquals(invalidValues(4), 4);
    assertThrows(
      () => invalidValues(2),
      GuardianError,
      'Must not be 1, 2, or 3',
    );
  });

  await t.step('optional method', () => {
    const guardian = TestGuardian.create();
    const optional = guardian.optional(42);

    assertEquals(optional(undefined), 42);
    assertEquals(optional(10), 10);
  });

  await t.step('complex chaining works correctly', () => {
    const guardian = TestGuardian.create()
      .transform((n) => n + 1)
      .test((n) => n < 100, 'Too large')
      .in([2, 3, 4, 5, 6], 'Invalid value')
      .notEquals(6, 'Cannot be 6');

    assertEquals(guardian(1), 2); // 1 + 1 = 2
    assertEquals(guardian(4), 5); // 4 + 1 = 5

    assertThrows(() => guardian(5), GuardianError, 'Cannot be 6'); // 5 + 1 = 6
    assertThrows(() => guardian(10), GuardianError, 'Invalid value'); // 10 + 1 = 11
    assertThrows(() => guardian(999), GuardianError, 'Too large'); // 999 + 1 = 1000
    assertThrows(() => guardian('string'), GuardianError); // Initial type check fails
  });
});
