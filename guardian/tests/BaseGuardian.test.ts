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

  openapi() {
    return {
      type: 'number' as const,
      description: 'Test number guardian',
    };
  }
}

class ThrowingGuardian extends BaseGuardian<(value: unknown) => number> {
  static createThrowing() {
    return new ThrowingGuardian((value: unknown): number => {
      if (typeof value !== 'number') {
        throw new Error('Custom error message');
      }
      return value;
    }).proxy();
  }

  openapi() {
    return {
      type: 'number' as const,
      description: 'Test throwing guardian',
    };
  }
}

class AsyncGuardian extends BaseGuardian<(v: unknown) => Promise<number>> {
  static createAsync() {
    return new AsyncGuardian(
      async (value: unknown): Promise<number> => {
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

  openapi() {
    return {
      type: 'number' as const,
      description: 'Test async guardian',
    };
  }
}

Deno.test('guardian.baseGuardian', async (t) => {
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

        openapi() {
          return {
            type: 'number' as const,
            description: 'Test async guardian',
          };
        }
      }

      // Create an async guardian
      const asyncGuardian = AsyncTestGuardian.create();

      const transformed = asyncGuardian.transform(async (n) => {
        await Promise.resolve(); // Simulate async operation
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

  await t.step('nullable method', () => {
    // Create a more permissive guardian for null testing
    class PermissiveGuardian extends BaseGuardian<(value: unknown) => unknown> {
      static create() {
        return new PermissiveGuardian((value: unknown): unknown => {
          return value; // Pass through any value
        }).proxy();
      }

      openapi() {
        return {
          type: 'object' as const,
          description: 'Test permissive guardian',
          additionalProperties: true,
        };
      }
    }

    const guardian = PermissiveGuardian.create();
    const nullable = guardian.nullable();

    assertEquals(nullable(10), 10);
    assertEquals(nullable(0), 0);
    assertEquals(nullable('hello'), 'hello');
    assertEquals(nullable(undefined), null);
    assertEquals(nullable(null), null); // null passes through without calling guardian
  });

  await t.step('nullable with type-strict guardian', () => {
    const guardian = TestGuardian.create();
    const nullable = guardian.nullable();

    assertEquals(nullable(42), 42);
    assertEquals(nullable(0), 0);
    assertEquals(nullable(null), null); // null short-circuits before type checking

    // Non-null, non-number values should still throw
    assertThrows(
      () => nullable('not a number'),
      GuardianError,
    );
    // assertThrows(
    //   () => nullable(undefined),
    //   GuardianError,
    // );
  });

  await t.step('nullable preserves transformations', () => {
    const guardian = TestGuardian.create()
      .transform((n) => n * 2)
      .nullable();

    assertEquals(guardian(5), 10); // 5 * 2 = 10
    assertEquals(guardian(null), null); // null short-circuits
    assertThrows(() => guardian('not a number'), GuardianError);
  });

  await t.step('nullable works with chaining', () => {
    const guardian = TestGuardian.create()
      .test((n) => n > 0, 'Must be positive')
      .nullable();

    assertEquals(guardian(5), 5);
    assertEquals(guardian(null), null); // null bypasses validation
    assertThrows(() => guardian(-5), GuardianError, 'Must be positive');
    assertThrows(() => guardian('string'), GuardianError);
  });

  await t.step('nullable with complex validation chain', () => {
    const guardian = TestGuardian.create()
      .transform((n) => n + 1)
      .test((n) => n < 10, 'Too large')
      .nullable();

    assertEquals(guardian(5), 6); // 5 + 1 = 6
    assertEquals(guardian(null), null); // null bypasses everything
    assertThrows(() => guardian(20), GuardianError, 'Too large'); // 20 + 1 = 21 > 10
  });

  // await t.step('combining nullable with optional', () => {
  //   // Create a guardian that's both nullable and optional
  //   // Order matters: optional should be applied last to handle undefined
  //   const guardian = TestGuardian.create()
  //     .optional(100) // Handle undefined first
  //     .nullable(); // Then allow null

  //   assertEquals(guardian(42), 42); // Valid number
  //   assertEquals(guardian(undefined), 100); // Undefined uses optional default
  //   assertEquals(guardian(null), null); // Null passes through nullable
  // });

  await t.step('nullable vs optional behavior differences', () => {
    const nullableGuardian = TestGuardian.create().nullable();
    const optionalGuardian = TestGuardian.create().optional(999);

    // Both should handle their respective "special" values
    assertEquals(nullableGuardian(null), null);
    assertEquals(optionalGuardian(undefined), 999);

    // But they should behave differently for the other's special value
    // assertThrows(() => nullableGuardian(undefined), GuardianError); // undefined not handled by nullable

    // Now that treatNullAsUndefined is removed, null should pass through to the guardian
    // which will throw because TestGuardian expects numbers
    assertThrows(() => optionalGuardian(null), GuardianError); // null passes through and fails type check
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

  await t.step('validate method', async (t) => {
    await t.step('returns success tuple for valid input', () => {
      const guardian = TestGuardian.create();
      const [error, result] = guardian.validate(42);

      assertEquals(error, null);
      assertEquals(result, 42);
    });

    await t.step('returns error tuple for invalid input', () => {
      const guardian = TestGuardian.create();
      const [error, result] = guardian.validate('not a number');

      assertEquals(result, undefined);
      assertEquals(error instanceof GuardianError, true);
      assertEquals(error?.got, 'not a number');
      assertEquals(error?.expected, 'number');
    });

    await t.step('handles chained validations in validate', () => {
      const guardian = TestGuardian.create()
        .test((n) => n > 0, 'Must be positive')
        .test((n) => n < 100, 'Must be less than 100');

      // Valid case
      const [error1, result1] = guardian.validate(50);
      assertEquals(error1, null);
      assertEquals(result1, 50);

      // Invalid case - negative number
      const [error2, result2] = guardian.validate(-5);
      assertEquals(result2, undefined);
      assertEquals(error2 instanceof GuardianError, true);
      assertEquals(error2?.message.includes('Must be positive'), true);

      // Invalid case - too large
      const [error3, result3] = guardian.validate(150);
      assertEquals(result3, undefined);
      assertEquals(error3 instanceof GuardianError, true);
      assertEquals(error3?.message.includes('Must be less than 100'), true);
    });

    await t.step('handles transformation in validate', () => {
      const guardian = TestGuardian.create()
        .transform((n) => n * 2)
        .test((n) => n > 10, 'Doubled value must be > 10');

      // Valid case
      const [error1, result1] = guardian.validate(10);
      assertEquals(error1, null);
      assertEquals(result1, 20); // 10 * 2

      // Invalid case - transformation makes it fail the test
      const [error2, result2] = guardian.validate(3);
      assertEquals(result2, undefined);
      assertEquals(error2 instanceof GuardianError, true);
      assertEquals(
        error2?.message.includes('Doubled value must be > 10'),
        true,
      );
    });

    await t.step('wraps non-GuardianError exceptions', () => {
      const guardian = ThrowingGuardian.createThrowing();
      const [error, result] = guardian.validate('not a number');

      assertEquals(result, undefined);
      assertEquals(error instanceof GuardianError, true);
      assertEquals(error?.message, 'Custom error message');
      assertEquals(error?.context.got, 'not a number');
      assertEquals(error?.context.comparison, 'validate');
    });

    await t.step('handles async guardians correctly', () => {
      const asyncGuardian = AsyncGuardian.createAsync();

      const [error, result] = asyncGuardian.validate(42);

      assertEquals(result, undefined);
      assertEquals(error instanceof GuardianError, true);
      assertEquals(
        error?.message,
        'Guardian validation cannot return a Promise',
      );
    });

    await t.step('preserves GuardianError properties', () => {
      const guardian = TestGuardian.create()
        .in([1, 2, 3], 'Must be 1, 2, or 3');

      const [error, result] = guardian.validate(5);

      assertEquals(result, undefined);
      assertEquals(error instanceof GuardianError, true);
      assertEquals(error?.context.got, 5);
      assertEquals(error?.message.includes('Must be 1, 2, or 3'), true);
    });

    await t.step('handles optional guardians', () => {
      const guardian = TestGuardian.create().optional(999);

      // Valid defined value
      const [error1, result1] = guardian.validate(42);
      assertEquals(error1, null);
      assertEquals(result1, 42);

      // Undefined value uses default
      const [error2, result2] = guardian.validate(undefined);
      assertEquals(error2, null);
      assertEquals(result2, 999);
    });

    await t.step('handles nullable guardians', () => {
      const guardian = TestGuardian.create().nullable();

      // Valid defined value
      const [error1, result1] = guardian.validate(42);
      assertEquals(error1, null);
      assertEquals(result1, 42);

      // Null value passes through
      const [error2, result2] = guardian.validate(null);
      assertEquals(error2, null);
      assertEquals(result2, null);

      // Invalid value still throws
      const [error3, result3] = guardian.validate('not a number');
      assertEquals(result3, undefined);
      assertEquals(error3 instanceof GuardianError, true);
    });

    await t.step('nullable with transformation in validate', () => {
      const guardian = TestGuardian.create()
        .transform((n) => n * 3)
        .nullable();

      // Valid case
      const [error1, result1] = guardian.validate(5);
      assertEquals(error1, null);
      assertEquals(result1, 15); // 5 * 3

      // Null case
      const [error2, result2] = guardian.validate(null);
      assertEquals(error2, null);
      assertEquals(result2, null);

      // Invalid case
      const [error3, result3] = guardian.validate('string');
      assertEquals(result3, undefined);
      assertEquals(error3 instanceof GuardianError, true);
    });

    await t.step('complex chained validation with validate', () => {
      const guardian = TestGuardian.create()
        .transform((n) => n + 10)
        .test((n) => n % 2 === 0, 'Result must be even')
        .in([12, 14, 16, 18, 20], 'Must be in allowed range');

      // Valid case: 2 + 10 = 12 (even and in range)
      const [error1, result1] = guardian.validate(2);
      assertEquals(error1, null);
      assertEquals(result1, 12);

      // Invalid case: 3 + 10 = 13 (odd)
      const [error2, result2] = guardian.validate(3);
      assertEquals(result2, undefined);
      assertEquals(error2 instanceof GuardianError, true);
      assertEquals(error2?.message.includes('Result must be even'), true);

      // Invalid case: 6 + 10 = 16 (even but let's test range) - this would pass
      // Let's use 4 + 10 = 14 (even and in range) - this would pass
      // Let's use 12 + 10 = 22 (even but not in range)
      const [error3, result3] = guardian.validate(12);
      assertEquals(result3, undefined);
      assertEquals(error3 instanceof GuardianError, true);
      assertEquals(error3?.message.includes('Must be in allowed range'), true);
    });
  });
});
