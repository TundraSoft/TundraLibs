import { assertEquals, assertRejects } from '$asserts';
import { nullable } from '../../helpers/mod.ts';
import { GuardianError } from '../../GuardianError.ts';

Deno.test('guardian.helpers.nullable', async (t) => {
  await t.step(
    'passes through null value without calling guardian',
    () => {
      // Mock guardian that would throw an error if called with null
      const mockGuardian = (value: string): string => {
        if (typeof value !== 'string') {
          throw new Error('Expected string');
        }
        return value.toUpperCase();
      };

      const nullableGuardian = nullable(mockGuardian);
      assertEquals(nullableGuardian(null), null);
    },
  );

  await t.step('calls guardian function with non-null values', () => {
    const guardian = (value: string): string => value.toUpperCase();
    const nullableGuardian = nullable(guardian);

    assertEquals(nullableGuardian('hello'), 'HELLO');
    assertEquals(nullableGuardian(null), null);
  });

  await t.step('works with various non-null values', () => {
    const guardian = (value: unknown): string => {
      if (typeof value === 'string') return value.toUpperCase();
      if (typeof value === 'number') return value.toString();
      throw new Error('Invalid type');
    };

    const nullableGuardian = nullable(guardian);

    assertEquals(nullableGuardian('hello'), 'HELLO');
    assertEquals(nullableGuardian(123), '123');
    assertEquals(nullableGuardian(null), null);
  });

  await t.step('works with async guardians', async () => {
    const asyncGuardian = async (value: string): Promise<string> => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      return value.toUpperCase();
    };

    const nullableAsyncGuardian = nullable(asyncGuardian);

    assertEquals(nullableAsyncGuardian(null), null); // Synchronous null return
    assertEquals(await nullableAsyncGuardian('hello'), 'HELLO');
  });

  await t.step('handles undefined differently than null', () => {
    const guardian = (value: string | undefined): string => {
      if (value === undefined) return 'UNDEFINED';
      return value.toUpperCase();
    };

    const nullableGuardian = nullable(guardian);

    assertEquals(nullableGuardian(null), null); // null short-circuits
    assertEquals(nullableGuardian(undefined), 'UNDEFINED'); // undefined passes through to guardian
    assertEquals(nullableGuardian('hello'), 'HELLO');
  });

  await t.step(
    'propagates errors from guardian for non-null values',
    async () => {
      const errorGuardian = (value: string): string => {
        if (value.length < 3) throw new Error('String too short');
        return value;
      };

      const nullableGuardian = nullable(errorGuardian);

      assertEquals(nullableGuardian(null), null);
      assertEquals(nullableGuardian('valid'), 'valid');

      await assertRejects(
        async () => await nullableGuardian('ab'),
        Error,
        'Error while validating nullable value - ab',
      );
    },
  );

  await t.step('preserves error context from guardian', async () => {
    const errorWithContext = (value: number): number => {
      if (value < 0) {
        const error = new GuardianError({
          got: value,
          expected: 'positive number',
          comparison: 'min',
        });
        throw error;
      }
      return value;
    };

    const nullableGuardian = nullable(errorWithContext);

    // null should pass through without error
    assertEquals(nullableGuardian(null), null);

    // Positive number should work
    assertEquals(nullableGuardian(5), 5);

    // Negative number should preserve GuardianError
    try {
      nullableGuardian(-10);
      throw new Error('Should have thrown');
    } catch (error) {
      assertEquals(error instanceof GuardianError, true);
      assertEquals((error as GuardianError).context.comparison, 'min');
    }
  });

  await t.step('works with complex type transformations', () => {
    interface User {
      name: string;
      age: number;
    }

    const userGuardian = (value: unknown): User => {
      if (
        typeof value === 'object' && value !== null &&
        'name' in value && 'age' in value &&
        typeof (value as any).name === 'string' &&
        typeof (value as any).age === 'number'
      ) {
        return value as User;
      }
      throw new Error('Invalid user object');
    };

    const nullableUserGuardian = nullable(userGuardian);

    const validUser = { name: 'John', age: 30 };
    assertEquals(nullableUserGuardian(validUser), validUser);
    assertEquals(nullableUserGuardian(null), null);
  });

  await t.step('handles async guardian errors properly', async () => {
    const asyncErrorGuardian = async (value: number): Promise<number> => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      if (value < 0) throw new Error('Negative number');
      return value * 2;
    };

    const nullableAsyncGuardian = nullable(asyncErrorGuardian);

    assertEquals(nullableAsyncGuardian(null), null); // Synchronous null
    assertEquals(await nullableAsyncGuardian(5), 10); // Valid async

    await assertRejects(
      async () => await nullableAsyncGuardian(-5),
      Error,
      'Negative number',
    );
  });

  await t.step('works with guardians that return falsy values', () => {
    const falsyGuardian = (value: unknown): number => {
      if (typeof value === 'number') return value;
      throw new Error('Not a number');
    };

    const nullableGuardian = nullable(falsyGuardian);

    assertEquals(nullableGuardian(0), 0); // Falsy but valid number
    assertEquals(nullableGuardian(-0), -0);
    assertEquals(nullableGuardian(NaN), NaN);
    assertEquals(nullableGuardian(null), null); // null short-circuits
  });

  await t.step('maintains guardian context in wrapped errors', async () => {
    const contextGuardian = (value: string): string => {
      if (value === 'error') {
        throw new Error('Context test error');
      }
      return value;
    };

    const nullableGuardian = nullable(contextGuardian);

    try {
      nullableGuardian('error');
      throw new Error('Should have thrown');
    } catch (error) {
      assertEquals(error instanceof GuardianError, true);
      assertEquals((error as GuardianError).context.got, 'error');
      assertEquals((error as GuardianError).context.comparison, 'nullable');
      assertEquals(
        (error as GuardianError).message,
        'Error while validating nullable value - error',
      );
    }
  });

  await t.step('works with empty string and other edge cases', () => {
    const stringGuardian = (value: unknown): string => {
      if (typeof value === 'string') return value;
      throw new Error('Not a string');
    };

    const nullableGuardian = nullable(stringGuardian);

    assertEquals(nullableGuardian(''), ''); // Empty string
    assertEquals(nullableGuardian('   '), '   '); // Whitespace
    assertEquals(nullableGuardian('0'), '0'); // String zero
    assertEquals(nullableGuardian(null), null); // null
  });

  await t.step('handles guardian that explicitly checks for null', () => {
    const explicitNullCheckGuardian = (value: unknown): string => {
      if (value === null) throw new Error('Null not allowed');
      if (typeof value === 'string') return value;
      throw new Error('Invalid type');
    };

    const nullableGuardian = nullable(explicitNullCheckGuardian);

    // The nullable wrapper should intercept null before the guardian sees it
    assertEquals(nullableGuardian(null), null);
    assertEquals(nullableGuardian('hello'), 'hello');
  });

  await t.step('supports chaining with other nullable guardians', () => {
    const trimGuardian = (value: string): string => value.trim();
    const upperGuardian = (value: string): string => value.toUpperCase();

    const chainedNullable = nullable(
      (value: unknown) => {
        if (value === null) return null;
        if (typeof value !== 'string') throw new Error('Not a string');

        // Apply transformations in sequence
        const trimmed = trimGuardian(value);
        const uppercased = upperGuardian(trimmed);
        return uppercased;
      },
    );

    assertEquals(chainedNullable('  hello  '), 'HELLO');
    assertEquals(chainedNullable(null), null);
  });
});
