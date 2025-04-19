import { assertEquals, assertThrows } from '$asserts';
import { GuardianError } from '../../GuardianError.ts';
import { BigIntGuardian } from '../../guards/mod.ts';

Deno.test('BigIntGuardian', async (t) => {
  await t.step('create', async (t) => {
    await t.step('passes through bigint values', () => {
      const guard = BigIntGuardian.create();
      assertEquals(guard(123n), 123n);
      assertEquals(guard(0n), 0n);
      assertEquals(guard(-10n), -10n);
    });

    await t.step('coerces valid number values to bigint', () => {
      const guard = BigIntGuardian.create();
      assertEquals(guard(123), 123n);
      assertEquals(guard(0), 0n);
      assertEquals(guard(-10), -10n);
    });

    await t.step('coerces valid string values to bigint', () => {
      const guard = BigIntGuardian.create();
      assertEquals(guard('123'), 123n);
      assertEquals(guard('0'), 0n);
      assertEquals(guard('-10'), -10n);
    });

    await t.step('throws for invalid values', () => {
      const guard = BigIntGuardian.create();
      assertThrows(
        () => guard(3.14),
        Error,
        'Expected value to be bigint, got number',
      );
      assertThrows(
        () => guard('3.14'),
        GuardianError,
        'Expected value to be bigint',
      );
      assertThrows(
        () => guard('abc'),
        GuardianError,
        'Expected value to be bigint',
      );
      assertThrows(
        () => guard(true),
        GuardianError,
        'Expected value to be bigint',
      );
      assertThrows(
        () => guard({}),
        GuardianError,
        'Expected value to be bigint',
      );
      assertThrows(
        () => guard([]),
        GuardianError,
        'Expected value to be bigint',
      );
      assertThrows(
        () => guard(null),
        GuardianError,
        'Expected value to be bigint',
      );
      assertThrows(
        () => guard(undefined),
        GuardianError,
        'Expected value to be bigint',
      );
    });

    await t.step('uses custom error message when provided', () => {
      const guard = BigIntGuardian.create('Custom error');
      assertThrows(() => guard(3.14), Error, 'Custom error');
    });
  });

  // Transformation tests
  await t.step('transformations', async (t) => {
    await t.step('abs', () => {
      const guard = BigIntGuardian.create().abs();
      assertEquals(guard(123n), 123n);
      assertEquals(guard(-123n), 123n);
      assertEquals(guard(0n), 0n);
    });

    await t.step('negate', () => {
      const guard = BigIntGuardian.create().negate();
      assertEquals(guard(123n), -123n);
      assertEquals(guard(-123n), 123n);
      assertEquals(guard(0n), 0n);
    });

    await t.step('bitwiseAnd', () => {
      const guard = BigIntGuardian.create().bitwiseAnd(6n); // 110 in binary
      assertEquals(guard(3n), 2n); // 011 & 110 = 010 = 2
      assertEquals(guard(7n), 6n); // 111 & 110 = 110 = 6
    });

    await t.step('bitwiseOr', () => {
      const guard = BigIntGuardian.create().bitwiseOr(6n); // 110 in binary
      assertEquals(guard(3n), 7n); // 011 | 110 = 111 = 7
      assertEquals(guard(8n), 14n); // 1000 | 0110 = 1110 = 14
    });

    await t.step('bitwiseXor', () => {
      const guard = BigIntGuardian.create().bitwiseXor(6n); // 110 in binary
      assertEquals(guard(3n), 5n); // 011 ^ 110 = 101 = 5
      assertEquals(guard(5n), 3n); // 101 ^ 110 = 011 = 3
    });

    await t.step('bitwiseNot', () => {
      const guard = BigIntGuardian.create().bitwiseNot();
      assertEquals(guard(0n), -1n);
      assertEquals(guard(-1n), 0n);
      assertEquals(guard(5n), -6n); // ~0101 = ...1010 = -6
    });

    await t.step('leftShift', () => {
      const guard = BigIntGuardian.create().leftShift(2);
      assertEquals(guard(1n), 4n); // 1 << 2 = 4
      assertEquals(guard(5n), 20n); // 5 << 2 = 20
    });

    await t.step('rightShift', () => {
      const guard = BigIntGuardian.create().rightShift(2);
      assertEquals(guard(20n), 5n); // 20 >> 2 = 5
      assertEquals(guard(4n), 1n); // 4 >> 2 = 1
    });

    await t.step('mod', () => {
      const guard = BigIntGuardian.create().mod(5n);
      assertEquals(guard(7n), 2n); // 7 % 5 = 2
      assertEquals(guard(-7n), 3n); // -7 % 5 = 3 (positive result)
    });

    await t.step('pow', () => {
      const guard = BigIntGuardian.create().pow(2n);
      assertEquals(guard(3n), 9n); // 3^2 = 9
      assertEquals(guard(4n), 16n); // 4^2 = 16

      assertThrows(
        () => BigIntGuardian.create().pow(-1n),
        Error,
        'Negative exponents not supported for BigInt',
      );
    });

    await t.step('chaining transformations', () => {
      const guard = BigIntGuardian.create()
        .abs()
        .pow(2n)
        .mod(10n);
      assertEquals(guard(-3n), 9n); // |-3|^2 % 10 = 9
      assertEquals(guard(4n), 6n); // |4|^2 % 10 = 16 % 10 = 6
    });
  });

  // Validation tests
  await t.step('validations', async (t) => {
    await t.step('min', async (t) => {
      await t.step('passes when value meets minimum', () => {
        const guard = BigIntGuardian.create().min(5n);
        assertEquals(guard(5n), 5n);
        assertEquals(guard(10n), 10n);
      });

      await t.step('throws when value is below minimum', () => {
        const guard = BigIntGuardian.create().min(5n);
        assertThrows(
          () => guard(4n),
          Error,
          'Expected value (4) to be greater than or equal to 5',
        );
      });

      await t.step('uses custom error message when provided', () => {
        const guard = BigIntGuardian.create().min(5n, 'Value too small');
        assertThrows(() => guard(4n), Error, 'Value too small');
      });
    });

    await t.step('max', async (t) => {
      await t.step('passes when value meets maximum', () => {
        const guard = BigIntGuardian.create().max(10n);
        assertEquals(guard(10n), 10n);
        assertEquals(guard(5n), 5n);
      });

      await t.step('throws when value exceeds maximum', () => {
        const guard = BigIntGuardian.create().max(10n);
        assertThrows(
          () => guard(11n),
          Error,
          'Expected value (11) to be less than or equal to 10',
        );
      });

      await t.step('uses custom error message when provided', () => {
        const guard = BigIntGuardian.create().max(10n, 'Value too large');
        assertThrows(() => guard(11n), Error, 'Value too large');
      });
    });

    await t.step('range', async (t) => {
      await t.step('passes when value is within range', () => {
        const guard = BigIntGuardian.create().range(5n, 10n);
        assertEquals(guard(5n), 5n);
        assertEquals(guard(7n), 7n);
        assertEquals(guard(10n), 10n);
      });

      await t.step('throws when value is outside range', () => {
        const guard = BigIntGuardian.create().range(5n, 10n);
        assertThrows(
          () => guard(4n),
          Error,
          'Expected value (4) to be between (5, 10)',
        );
        assertThrows(
          () => guard(11n),
          Error,
          'Expected value (11) to be between (5, 10)',
        );
      });

      await t.step('uses custom error message when provided', () => {
        const guard = BigIntGuardian.create().range(
          5n,
          10n,
          'Value out of range',
        );
        assertThrows(() => guard(4n), Error, 'Value out of range');
      });
    });

    await t.step('positive', async (t) => {
      await t.step('passes for positive values', () => {
        const guard = BigIntGuardian.create().positive();
        assertEquals(guard(42n), 42n);
        assertEquals(guard(1n), 1n);
      });

      await t.step('throws for zero or negative values', () => {
        const guard = BigIntGuardian.create().positive();
        assertThrows(() => guard(0n), Error, 'Expected positive BigInt, got 0');
        assertThrows(
          () => guard(-5n),
          Error,
          'Expected positive BigInt, got -5',
        );
      });
    });

    await t.step('negative', async (t) => {
      await t.step('passes for negative values', () => {
        const guard = BigIntGuardian.create().negative();
        assertEquals(guard(-42n), -42n);
        assertEquals(guard(-1n), -1n);
      });

      await t.step('throws for zero or positive values', () => {
        const guard = BigIntGuardian.create().negative();
        assertThrows(() => guard(0n), Error, 'Expected negative BigInt, got 0');
        assertThrows(() => guard(5n), Error, 'Expected negative BigInt, got 5');
      });
    });

    await t.step('nonZero', async (t) => {
      await t.step('passes for non-zero values', () => {
        const guard = BigIntGuardian.create().nonZero();
        assertEquals(guard(1n), 1n);
        assertEquals(guard(-1n), -1n);
      });

      await t.step('throws for zero', () => {
        const guard = BigIntGuardian.create().nonZero();
        assertThrows(() => guard(0n), Error, 'Expected non-zero BigInt');
      });
    });

    await t.step('even', async (t) => {
      await t.step('passes for even numbers', () => {
        const guard = BigIntGuardian.create().even();
        assertEquals(guard(2n), 2n);
        assertEquals(guard(0n), 0n);
        assertEquals(guard(-4n), -4n);
      });

      await t.step('throws for odd numbers', () => {
        const guard = BigIntGuardian.create().even();
        assertThrows(() => guard(1n), Error, 'Expected even BigInt, got 1');
        assertThrows(() => guard(-3n), Error, 'Expected even BigInt, got -3');
      });
    });

    await t.step('odd', async (t) => {
      await t.step('passes for odd numbers', () => {
        const guard = BigIntGuardian.create().odd();
        assertEquals(guard(1n), 1n);
        assertEquals(guard(3n), 3n);
        assertEquals(guard(-5n), -5n);
      });

      await t.step('throws for even numbers', () => {
        const guard = BigIntGuardian.create().odd();
        assertThrows(() => guard(2n), Error, 'Expected odd BigInt, got 2');
        assertThrows(() => guard(0n), Error, 'Expected odd BigInt, got 0');
      });
    });

    await t.step('prime', async (t) => {
      await t.step('passes for prime numbers', () => {
        const guard = BigIntGuardian.create().prime();
        assertEquals(guard(2n), 2n);
        assertEquals(guard(3n), 3n);
        assertEquals(guard(5n), 5n);
        assertEquals(guard(7n), 7n);
        assertEquals(guard(11n), 11n);
      });

      await t.step('throws for non-prime numbers', () => {
        const guard = BigIntGuardian.create().prime();
        assertThrows(() => guard(1n), Error, 'Expected prime BigInt, got 1');
        assertThrows(() => guard(4n), Error, 'Expected prime BigInt, got 4');
        assertThrows(() => guard(6n), Error, 'Expected prime BigInt, got 6');
      });
    });

    await t.step('multipleOf', async (t) => {
      await t.step('passes when value is multiple of base', () => {
        const guard = BigIntGuardian.create().multipleOf(3n);
        assertEquals(guard(0n), 0n);
        assertEquals(guard(3n), 3n);
        assertEquals(guard(6n), 6n);
        assertEquals(guard(-3n), -3n);
      });

      await t.step('throws when value is not multiple of base', () => {
        const guard = BigIntGuardian.create().multipleOf(3n);
        assertThrows(
          () => guard(4n),
          Error,
          'Expected value (4) to be multiple of 3',
        );
      });
    });

    await t.step('divisibleBy', async (t) => {
      await t.step('passes when value is divisible by divisor', () => {
        const guard = BigIntGuardian.create().divisibleBy(3n);
        assertEquals(guard(0n), 0n);
        assertEquals(guard(3n), 3n);
        assertEquals(guard(6n), 6n);
        assertEquals(guard(-3n), -3n);
      });

      await t.step('throws when value is not divisible by divisor', () => {
        const guard = BigIntGuardian.create().divisibleBy(3n);
        assertThrows(
          () => guard(4n),
          Error,
          'Expected value (4) to be divisible by 3',
        );
      });
    });

    await t.step('bitLength', async (t) => {
      await t.step('passes when value fits within bit length', () => {
        const guard = BigIntGuardian.create().bitLength(8);
        assertEquals(guard(0n), 0n);
        assertEquals(guard(255n), 255n); // 2^8 - 1
        assertEquals(guard(-255n), -255n);
      });

      await t.step('throws when value exceeds bit length', () => {
        const guard = BigIntGuardian.create().bitLength(8);
        assertThrows(
          () => guard(256n),
          Error,
          'Expected value (256) to fit within 8 bits',
        );
      });
    });

    await t.step('chaining validations', () => {
      const guard = BigIntGuardian.create()
        .positive()
        .even()
        .max(100n);

      assertEquals(guard(42n), 42n);
      assertThrows(() => guard(-4n), Error);
      assertThrows(() => guard(3n), Error);
      assertThrows(() => guard(102n), Error);
    });
  });
});
