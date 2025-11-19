import * as asserts from '$asserts';
import { BigIntGuardian, GuardianError } from '../../mod.ts';

Deno.test('guardian.BigIntGuardian', async (t) => {
  await t.step('basic functionality', async (t) => {
    await t.step('should validate bigint type', () => {
      const guardian = new BigIntGuardian();

      asserts.assertEquals(guardian.parse(42n), 42n);
      asserts.assertEquals(guardian.parse(0n), 0n);
      asserts.assertEquals(guardian.parse(-123n), -123n);
      asserts.assertEquals(
        guardian.parse(BigInt(Number.MAX_SAFE_INTEGER)),
        BigInt(Number.MAX_SAFE_INTEGER),
      );

      asserts.assertThrows(() => guardian.parse(42), GuardianError);
      asserts.assertThrows(() => guardian.parse('42'), GuardianError);
      asserts.assertThrows(() => guardian.parse(null), GuardianError);
      asserts.assertThrows(() => guardian.parse(undefined), GuardianError);
    });

    await t.step('should preserve bigint values', () => {
      const guardian = new BigIntGuardian();

      asserts.assertEquals(guardian.parse(123n), 123n);
      asserts.assertEquals(guardian.parse(-456n), -456n);
    });
  });

  await t.step('range validations', async (t) => {
    await t.step('should validate minimum value', () => {
      const guardian = new BigIntGuardian().min(10n);

      asserts.assertEquals(guardian.parse(10n), 10n);
      asserts.assertEquals(guardian.parse(15n), 15n);
      asserts.assertEquals(guardian.parse(100n), 100n);

      asserts.assertThrows(() => guardian.parse(9n), GuardianError);
      asserts.assertThrows(() => guardian.parse(-5n), GuardianError);
    });

    await t.step('should validate maximum value', () => {
      const guardian = new BigIntGuardian().max(100n);

      asserts.assertEquals(guardian.parse(100n), 100n);
      asserts.assertEquals(guardian.parse(50n), 50n);
      asserts.assertEquals(guardian.parse(-10n), -10n);

      asserts.assertThrows(() => guardian.parse(101n), GuardianError);
      asserts.assertThrows(() => guardian.parse(200n), GuardianError);
    });

    await t.step('should combine min and max', () => {
      const guardian = new BigIntGuardian().min(10n).max(100n);

      asserts.assertEquals(guardian.parse(10n), 10n);
      asserts.assertEquals(guardian.parse(50n), 50n);
      asserts.assertEquals(guardian.parse(100n), 100n);

      asserts.assertThrows(() => guardian.parse(9n), GuardianError);
      asserts.assertThrows(() => guardian.parse(101n), GuardianError);
    });
  });

  await t.step('sign validations', async (t) => {
    await t.step('should validate positive bigints', () => {
      const guardian = new BigIntGuardian().positive();

      asserts.assertEquals(guardian.parse(1n), 1n);
      asserts.assertEquals(guardian.parse(100n), 100n);

      asserts.assertThrows(() => guardian.parse(0n), GuardianError);
      asserts.assertThrows(() => guardian.parse(-1n), GuardianError);
    });

    await t.step('should validate negative bigints', () => {
      const guardian = new BigIntGuardian().negative();

      asserts.assertEquals(guardian.parse(-1n), -1n);
      asserts.assertEquals(guardian.parse(-100n), -100n);

      asserts.assertThrows(() => guardian.parse(0n), GuardianError);
      asserts.assertThrows(() => guardian.parse(1n), GuardianError);
    });

    await t.step('should validate non-negative bigints', () => {
      const guardian = new BigIntGuardian().nonNegative();

      asserts.assertEquals(guardian.parse(0n), 0n);
      asserts.assertEquals(guardian.parse(1n), 1n);
      asserts.assertEquals(guardian.parse(100n), 100n);

      asserts.assertThrows(() => guardian.parse(-1n), GuardianError);
      asserts.assertThrows(() => guardian.parse(-100n), GuardianError);
    });
  });

  await t.step('mathematical transformations', async (t) => {
    await t.step('should get absolute value', () => {
      const guardian = new BigIntGuardian().abs();

      asserts.assertEquals(guardian.parse(42n), 42n);
      asserts.assertEquals(guardian.parse(-42n), 42n);
      asserts.assertEquals(guardian.parse(0n), 0n);
    });
  });

  await t.step('type transformations', async (t) => {
    await t.step('should convert bigint to string', () => {
      const guardian = new BigIntGuardian().toString();

      asserts.assertEquals(guardian.parse(123n), '123');
      asserts.assertEquals(guardian.parse(-456n), '-456');
      asserts.assertEquals(guardian.parse(0n), '0');
    });

    await t.step('should convert bigint to string with radix', () => {
      const guardian = new BigIntGuardian().toString(16);

      asserts.assertEquals(guardian.parse(255n), 'ff');
      asserts.assertEquals(guardian.parse(16n), '10');
    });

    await t.step('should convert bigint to number safely', () => {
      const guardian = new BigIntGuardian().toNumber();

      asserts.assertEquals(guardian.parse(42n), 42);
      asserts.assertEquals(guardian.parse(-123n), -123);
      asserts.assertEquals(guardian.parse(0n), 0);
    });

    await t.step('should reject unsafe bigint to number conversion', () => {
      const guardian = new BigIntGuardian().toNumber();
      const hugeBigInt = BigInt(Number.MAX_SAFE_INTEGER) + 1n;

      asserts.assertThrows(() => guardian.parse(hugeBigInt), GuardianError);
      asserts.assertThrows(
        () => guardian.parse(BigInt(Number.MIN_SAFE_INTEGER) - 1n),
        GuardianError,
      );
    });
  });

  await t.step('chained validations', async (t) => {
    await t.step('should chain multiple validations', () => {
      const guardian = new BigIntGuardian()
        .positive()
        .min(10n)
        .max(1000n);

      asserts.assertEquals(guardian.parse(42n), 42n);
      asserts.assertEquals(guardian.parse(500n), 500n);

      asserts.assertThrows(() => guardian.parse(-5n), GuardianError);
      asserts.assertThrows(() => guardian.parse(5n), GuardianError);
      asserts.assertThrows(() => guardian.parse(1001n), GuardianError);
    });

    await t.step('should chain transformations', () => {
      const guardian = new BigIntGuardian()
        .positive()
        .abs()
        .toString();

      asserts.assertEquals(guardian.parse(42n), '42');

      // Note: abs() won't help negative numbers pass positive() validation
      asserts.assertThrows(() => guardian.parse(-42n), GuardianError);
    });
  });

  await t.step('safe parsing', async (t) => {
    await t.step('should return success result for valid input', () => {
      const guardian = new BigIntGuardian();
      const [error, result] = guardian.safeParse(42n);

      asserts.assertEquals(error, null);
      asserts.assertEquals(result, 42n);
    });

    await t.step('should return error result for invalid input', () => {
      const guardian = new BigIntGuardian();
      const [error, result] = guardian.safeParse(42);

      asserts.assertEquals(error instanceof GuardianError, true);
      asserts.assertEquals(result, undefined);
    });
  });

  await t.step('error handling', async (t) => {
    await t.step('should provide detailed error messages', () => {
      const guardian = new BigIntGuardian();

      asserts.assertThrows(
        () => guardian.parse(42),
        GuardianError,
        'Expected bigint but got number',
      );
      asserts.assertThrows(
        () => guardian.parse('42'),
        GuardianError,
        'Expected bigint but got string',
      );
    });

    await t.step('should support custom error messages', () => {
      const guardian = new BigIntGuardian().positive(
        'Must be a positive big number',
      );

      asserts.assertThrows(
        () => guardian.parse(-42n),
        GuardianError,
        'Must be a positive big number',
      );
    });
  });

  await t.step('large number handling', async (t) => {
    await t.step('should handle very large numbers', () => {
      const guardian = new BigIntGuardian().positive();
      const veryLarge = BigInt('123456789012345678901234567890');

      asserts.assertEquals(guardian.parse(veryLarge), veryLarge);
    });

    await t.step(
      'should handle mathematical operations on large numbers',
      () => {
        const guardian = new BigIntGuardian().abs().toString();
        const veryLarge = -BigInt('123456789012345678901234567890');

        asserts.assertEquals(
          guardian.parse(veryLarge),
          '123456789012345678901234567890',
        );
      },
    );
  });
});
