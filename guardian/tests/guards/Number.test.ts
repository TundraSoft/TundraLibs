import { assertEquals, assertThrows } from '$asserts';
import { GuardianError } from '../../GuardianError.ts';
import { NumberGuardian } from '../../guards/mod.ts';

Deno.test('NumberGuardian', async (t) => {
  await t.step('create', async (t) => {
    await t.step('passes through number values', () => {
      const guard = NumberGuardian.create();
      assertEquals(guard(123), 123);
      assertEquals(guard(0), 0);
      assertEquals(guard(-10), -10);
      assertEquals(guard(3.14), 3.14);
    });

    await t.step('throws for non-number values', () => {
      const guard = NumberGuardian.create();
      assertThrows(
        () => guard('123'),
        GuardianError,
        'Expected value to be a number, got string',
      );
      assertThrows(
        () => guard(true),
        GuardianError,
        'Expected value to be a number, got boolean',
      );
      assertThrows(
        () => guard({}),
        GuardianError,
        'Expected value to be a number, got object',
      );
      assertThrows(
        () => guard([]),
        GuardianError,
        'Expected value to be a number, got array',
      );
      assertThrows(
        () => guard(null),
        GuardianError,
        'Expected value to be a number, got null',
      );
      assertThrows(
        () => guard(undefined),
        GuardianError,
        'Expected value to be a number, got undefined',
      );
      assertThrows(
        () => guard(NaN),
        GuardianError,
        'Expected value to be a number, got number',
      );
    });

    await t.step('uses custom error message when provided', () => {
      const guard = NumberGuardian.create('Custom error');
      assertThrows(() => guard('123'), Error, 'Custom error');
    });
  });

  // Transformation tests
  await t.step('transformations', async (t) => {
    await t.step('ceil', () => {
      const guard = NumberGuardian.create().ceil();
      assertEquals(guard(3.14), 4);
      assertEquals(guard(3), 3);
      assertEquals(guard(-3.14), -3);
    });

    await t.step('floor', () => {
      const guard = NumberGuardian.create().floor();
      assertEquals(guard(3.14), 3);
      assertEquals(guard(3), 3);
      assertEquals(guard(-3.14), -4);
    });

    await t.step('abs', () => {
      const guard = NumberGuardian.create().abs();
      assertEquals(guard(3.14), 3.14);
      assertEquals(guard(-3.14), 3.14);
      assertEquals(guard(0), 0);
    });

    await t.step('negate', () => {
      const guard = NumberGuardian.create().negate();
      assertEquals(guard(3.14), -3.14);
      assertEquals(guard(-3.14), 3.14);
      assertEquals(guard(0), -0);
    });

    await t.step('clamp', () => {
      const guard = NumberGuardian.create().clamp(0, 10);
      assertEquals(guard(5), 5);
      assertEquals(guard(-5), 0);
      assertEquals(guard(15), 10);
    });

    await t.step('toFixed', () => {
      const guard = NumberGuardian.create().toFixed(2);
      assertEquals(guard(3.14159), 3.14);
      assertEquals(guard(3), 3);
    });

    await t.step('chaining transformations', () => {
      const guard = NumberGuardian.create()
        .abs()
        .clamp(0, 10)
        .toFixed(1);
      assertEquals(guard(-15), 10.0);
      assertEquals(guard(3.14), 3.1);
    });
  });

  // Validation tests
  await t.step('validations', async (t) => {
    await t.step('min', async (t) => {
      await t.step('passes when value meets minimum', () => {
        const guard = NumberGuardian.create().min(5);
        assertEquals(guard(5), 5);
        assertEquals(guard(10), 10);
      });

      await t.step('throws when value is below minimum', () => {
        const guard = NumberGuardian.create().min(5);
        assertThrows(
          () => guard(4),
          Error,
          'Expected value (4) to be greater than or equal to 5',
        );
      });

      await t.step('uses custom error message when provided', () => {
        const guard = NumberGuardian.create().min(5, 'Value too small');
        assertThrows(() => guard(4), Error, 'Value too small');
      });
    });

    await t.step('max', async (t) => {
      await t.step('passes when value meets maximum', () => {
        const guard = NumberGuardian.create().max(10);
        assertEquals(guard(10), 10);
        assertEquals(guard(5), 5);
      });

      await t.step('throws when value exceeds maximum', () => {
        const guard = NumberGuardian.create().max(10);
        assertThrows(
          () => guard(11),
          Error,
          'Expected value (11) to be less than or equal to 10',
        );
      });

      await t.step('uses custom error message when provided', () => {
        const guard = NumberGuardian.create().max(10, 'Value too large');
        assertThrows(() => guard(11), Error, 'Value too large');
      });
    });

    await t.step('range', async (t) => {
      await t.step('passes when value is within range', () => {
        const guard = NumberGuardian.create().range(5, 10);
        assertEquals(guard(5), 5);
        assertEquals(guard(7), 7);
        assertEquals(guard(10), 10);
      });

      await t.step('throws when value is outside range', () => {
        const guard = NumberGuardian.create().range(5, 10);
        assertThrows(
          () => guard(4),
          Error,
          'Expected value (4) to be between (5, 10)',
        );
        assertThrows(
          () => guard(11),
          Error,
          'Expected value (11) to be between (5, 10)',
        );
      });

      await t.step('uses custom error message when provided', () => {
        const guard = NumberGuardian.create().range(
          5,
          10,
          'Value out of range',
        );
        assertThrows(() => guard(4), Error, 'Value out of range');
      });
    });

    await t.step('integer', async (t) => {
      await t.step('passes for integer values', () => {
        const guard = NumberGuardian.create().integer();
        assertEquals(guard(42), 42);
        assertEquals(guard(0), 0);
        assertEquals(guard(-10), -10);
      });

      await t.step('throws for non-integer values', () => {
        const guard = NumberGuardian.create().integer();
        assertThrows(() => guard(3.14), Error, 'Expected integer, got 3.14');
      });
    });

    await t.step('positive', async (t) => {
      await t.step('passes for positive values', () => {
        const guard = NumberGuardian.create().positive();
        assertEquals(guard(42), 42);
        assertEquals(guard(0.1), 0.1);
      });

      await t.step('throws for zero or negative values', () => {
        const guard = NumberGuardian.create().positive();
        assertThrows(() => guard(0), Error, 'Expected positive number, got 0');
        assertThrows(
          () => guard(-5),
          Error,
          'Expected positive number, got -5',
        );
      });
    });

    await t.step('negative', async (t) => {
      await t.step('passes for negative values', () => {
        const guard = NumberGuardian.create().negative();
        assertEquals(guard(-42), -42);
        assertEquals(guard(-0.1), -0.1);
      });

      await t.step('throws for zero or positive values', () => {
        const guard = NumberGuardian.create().negative();
        assertThrows(() => guard(0), Error, 'Expected negative number, got 0');
        assertThrows(() => guard(5), Error, 'Expected negative number, got 5');
      });
    });

    await t.step('multipleOf', async (t) => {
      await t.step('passes when value is multiple of base', () => {
        const guard = NumberGuardian.create().multipleOf(3);
        assertEquals(guard(0), 0);
        assertEquals(guard(3), 3);
        assertEquals(guard(6), 6);
        assertEquals(guard(-3), -3);
      });

      await t.step('throws when value is not multiple of base', () => {
        const guard = NumberGuardian.create().multipleOf(3);
        assertThrows(
          () => guard(4),
          Error,
          'Expected value (4) to be multiple of 3',
        );
      });
    });

    await t.step('odd', async (t) => {
      await t.step('passes for odd numbers', () => {
        const guard = NumberGuardian.create().odd();
        assertEquals(guard(1), 1);
        assertEquals(guard(3), 3);
        assertEquals(guard(-5), -5);
      });

      await t.step('throws for even numbers', () => {
        const guard = NumberGuardian.create().odd();
        assertThrows(() => guard(2), Error, 'Expected odd number, got 2');
        assertThrows(() => guard(0), Error, 'Expected odd number, got 0');
      });
    });

    await t.step('even', async (t) => {
      await t.step('passes for even numbers', () => {
        const guard = NumberGuardian.create().even();
        assertEquals(guard(2), 2);
        assertEquals(guard(0), 0);
        assertEquals(guard(-4), -4);
      });

      await t.step('throws for odd numbers', () => {
        const guard = NumberGuardian.create().even();
        assertThrows(() => guard(1), Error, 'Expected even number, got 1');
        assertThrows(() => guard(-3), Error, 'Expected even number, got -3');
      });
    });

    await t.step('prime', async (t) => {
      await t.step('passes for prime numbers', () => {
        const guard = NumberGuardian.create().prime();
        assertEquals(guard(2), 2);
        assertEquals(guard(3), 3);
        assertEquals(guard(5), 5);
        assertEquals(guard(7), 7);
        assertEquals(guard(11), 11);
      });

      await t.step('throws for non-prime numbers', () => {
        const guard = NumberGuardian.create().prime();
        assertThrows(() => guard(1), Error, 'Expected prime number, got 1');
        assertThrows(() => guard(4), Error, 'Expected prime number, got 4');
        assertThrows(() => guard(6), Error, 'Expected prime number, got 6');
      });
    });

    await t.step('finite', async (t) => {
      await t.step('passes for finite numbers', () => {
        const guard = NumberGuardian.create().finite();
        assertEquals(guard(42), 42);
        assertEquals(guard(-10), -10);
      });

      await t.step('throws for infinite numbers', () => {
        const guard = NumberGuardian.create().finite();
        assertThrows(
          () => guard(Infinity),
          Error,
          'Expected finite number, got Infinity',
        );
        assertThrows(
          () => guard(-Infinity),
          Error,
          'Expected finite number, got -Infinity',
        );
      });
    });

    await t.step('safe', async (t) => {
      await t.step('passes for safe integers', () => {
        const guard = NumberGuardian.create().safe();
        assertEquals(guard(42), 42);
        assertEquals(guard(Number.MAX_SAFE_INTEGER), Number.MAX_SAFE_INTEGER);
      });

      await t.step('throws for unsafe integers and non-integers', () => {
        const guard = NumberGuardian.create().safe();
        assertThrows(
          () => guard(Number.MAX_SAFE_INTEGER + 1),
          Error,
        );
        assertThrows(() => guard(3.14), Error);
      });
    });

    await t.step('port', async (t) => {
      await t.step('passes for valid port numbers', () => {
        const guard = NumberGuardian.create().port();
        assertEquals(guard(0), 0);
        assertEquals(guard(80), 80);
        assertEquals(guard(8080), 8080);
        assertEquals(guard(65535), 65535);
      });

      await t.step('throws for invalid port numbers', () => {
        const guard = NumberGuardian.create().port();
        assertThrows(() => guard(-1), Error);
        assertThrows(() => guard(65536), Error);
        assertThrows(() => guard(3.14), Error);
      });
    });

    await t.step('percentage', async (t) => {
      await t.step('passes for percentage values', () => {
        const guard = NumberGuardian.create().percentage();
        assertEquals(guard(0), 0);
        assertEquals(guard(50), 50);
        assertEquals(guard(100), 100);
      });

      await t.step('throws for non-percentage values', () => {
        const guard = NumberGuardian.create().percentage();
        assertThrows(() => guard(-1), Error);
        assertThrows(() => guard(101), Error);
      });
    });

    await t.step('isTimestamp', async (t) => {
      await t.step('passes for valid timestamp values', () => {
        const guard = NumberGuardian.create().isTimestamp();
        const now = Date.now();
        assertEquals(guard(now), now);
        assertEquals(guard(0), 0); // Unix epoch
      });

      await t.step('throws for invalid timestamp values', () => {
        const guard = NumberGuardian.create().isTimestamp();
        assertThrows(() => guard(-8640000000000001), Error); // Lower bound of valid dates
        assertThrows(() => guard(8640000000000001), Error); // Upper bound of valid dates
      });
    });

    await t.step('chaining validations', () => {
      const guard = NumberGuardian.create()
        .positive()
        .integer()
        .max(100);

      assertEquals(guard(42), 42);
      assertThrows(() => guard(-5), Error);
      assertThrows(() => guard(3.14), Error);
      assertThrows(() => guard(101), Error);
    });
  });
});
