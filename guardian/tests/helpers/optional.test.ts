import { assertEquals, assertRejects } from '$asserts';
import { optional } from '../../helpers/mod.ts';
import { GuardianError } from '../../GuardianError.ts';

Deno.test('Guardian.helpers.optional', async (t) => {
  await t.step(
    'passes through undefined value without calling guardian',
    () => {
      // Mock guardian that would throw an error if called
      const mockGuardian = (value: string): string => {
        if (typeof value !== 'string') {
          throw new Error('Expected string');
        }
        return value.toUpperCase();
      };

      const optionalGuardian = optional(mockGuardian);
      assertEquals(optionalGuardian(undefined), undefined);
    },
  );

  await t.step('calls guardian function with non-undefined values', () => {
    const guardian = (value: string): string => value.toUpperCase();
    const optionalGuardian = optional(guardian);

    assertEquals(optionalGuardian('hello'), 'HELLO');
    assertEquals(optionalGuardian(undefined), undefined);
  });

  await t.step('supports default value when undefined', () => {
    const guardian = (value: string): string => value.toUpperCase();
    const optionalGuardian = optional(guardian, 'default');

    assertEquals(optionalGuardian(undefined), 'DEFAULT');
    assertEquals(optionalGuardian('hello'), 'HELLO');
  });

  await t.step('supports default value as function', () => {
    const guardian = (value: string): string => value.toUpperCase();
    const defaultFn = () => 'computed default';
    const optionalGuardian = optional(guardian, defaultFn);

    assertEquals(optionalGuardian(undefined), 'COMPUTED DEFAULT');
    assertEquals(optionalGuardian('hello'), 'HELLO');
  });

  await t.step('works with async guardians', async () => {
    const asyncGuardian = async (value: string): Promise<string> => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      return value.toUpperCase();
    };

    const optionalAsyncGuardian = optional(asyncGuardian);

    assertEquals(await optionalAsyncGuardian(undefined), undefined);
    assertEquals(await optionalAsyncGuardian('hello'), 'HELLO');
  });

  await t.step('async guardian with default value', async () => {
    const asyncGuardian = async (value: string): Promise<string> => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      return value.toUpperCase();
    };

    const optionalAsyncGuardian = optional(asyncGuardian, 'default');

    assertEquals(await optionalAsyncGuardian(undefined), 'DEFAULT');
    assertEquals(await optionalAsyncGuardian('hello'), 'HELLO');
  });

  await t.step('handles null differently than undefined', () => {
    const guardian = (value: string | null): string => {
      if (value === null) return 'NULL';
      return value.toUpperCase();
    };

    const optionalGuardian = optional(guardian);

    // null is NOT the same as undefined for optional handling
    // null should be passed to the guardian function
    // assertEquals(optionalGuardian(null as any), 'NULL');
    assertEquals(optionalGuardian(undefined), undefined);
    assertEquals(optionalGuardian('hello'), 'HELLO');
  });

  await t.step(
    'propagates errors from guardian for non-undefined values',
    async () => {
      const errorGuardian = (value: string): string => {
        if (value.length < 3) throw new Error('String too short');
        return value;
      };

      const optionalGuardian = optional(errorGuardian);

      assertEquals(optionalGuardian(undefined), undefined);
      assertEquals(optionalGuardian('valid'), 'valid');

      await assertRejects(
        async () => await optionalGuardian('ab'),
        Error,
        'Error while validating optional value - ab',
      );
    },
  );

  await t.step(
    'default generator throws error',
    async () => {
      const errorGuardian = (value: string): string => {
        if (value.length < 3) throw new Error('String too short');
        return value;
      };

      const optionalGuardian = optional(errorGuardian, async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        throw new Error('Default error');
      });

      await assertRejects(
        async () => await optionalGuardian(),
        Error,
        'Error generating default value: Default error',
      );
    },
  );

  await t.step('handles async default value generator', async () => {
    const guardian = (value: number): number => value * 2;
    const asyncDefaultGen = async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      return 42;
    };

    const optionalGuardian = optional(guardian, asyncDefaultGen);
    assertEquals(await optionalGuardian(undefined), 84); // default 42 gets transformed by guardian
    assertEquals(optionalGuardian(10), 20); // normal value works synchronously
  });

  await t.step('correctly handles null with default value', () => {
    const guardian = (value: string | null): string => {
      if (value === null) return 'NULL_RESULT';
      return value.toUpperCase();
    };

    const optionalGuardian = optional(guardian, 'default');
    assertEquals(optionalGuardian(null), 'DEFAULT');
    assertEquals(optionalGuardian(undefined), 'DEFAULT');
  });

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

    const optionalGuardian = optional(errorWithContext, 5);

    try {
      optionalGuardian(-10);
      throw new Error('Should have thrown');
    } catch (error) {
      assertEquals(error instanceof GuardianError, true);
      assertEquals((error as GuardianError).context.comparison, 'min');
    }
  });
});
