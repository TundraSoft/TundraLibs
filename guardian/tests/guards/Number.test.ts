import { assertEquals, assertThrows } from '$asserts';
import { GuardianError } from '../../GuardianError.ts';
import { NumberGuardian } from '../../guards/Number.ts';

Deno.test('NumberGuardian', async (t) => {
  await t.step('create', async (t) => {
    await t.step('passes through number values', () => {
      const guard = NumberGuardian.create();
      assertEquals(guard(123), 123);
      assertEquals(guard(0), 0);
      assertEquals(guard(-10.5), -10.5);
      assertEquals(guard(Infinity), Infinity);
    });

    await t.step('coerces valid string values to numbers', () => {
      const guard = NumberGuardian.create();
      assertEquals(guard('123'), 123);
      assertEquals(guard('0'), 0);
      assertEquals(guard('-10.5'), -10.5);
    });

    await t.step('throws for invalid values', () => {
      const guard = NumberGuardian.create();
      assertThrows(() => guard('not a number'), GuardianError);
      assertThrows(() => guard('123abc'), GuardianError);
      assertThrows(() => guard({}), GuardianError);
      assertThrows(() => guard([]), GuardianError);
      assertThrows(() => guard(null), GuardianError);
      assertThrows(() => guard(undefined), GuardianError);
      assertThrows(() => guard(NaN), GuardianError);
    });
  });

  await t.step('min validation', async (t) => {
    await t.step('passes when value is >= minimum', () => {
      const guard = NumberGuardian.create().min(5);
      assertEquals(guard(5), 5);
      assertEquals(guard(10), 10);
    });

    await t.step('throws when value is < minimum', () => {
      const guard = NumberGuardian.create().min(5);
      assertThrows(() => guard(4), GuardianError);
      assertThrows(() => guard(0), GuardianError);
      assertThrows(() => guard(-10), GuardianError);
    });
  });

  await t.step('max validation', async (t) => {
    await t.step('passes when value is <= maximum', () => {
      const guard = NumberGuardian.create().max(5);
      assertEquals(guard(5), 5);
      assertEquals(guard(3), 3);
    });

    await t.step('throws when value is > maximum', () => {
      const guard = NumberGuardian.create().max(5);
      assertThrows(() => guard(6), GuardianError);
      assertThrows(() => guard(10), GuardianError);
    });
  });

  await t.step('range validation', async (t) => {
    await t.step('passes when value is within range', () => {
      const guard = NumberGuardian.create().range(5, 10);
      assertEquals(guard(5), 5);
      assertEquals(guard(7), 7);
      assertEquals(guard(10), 10);
    });

    await t.step('throws when value is outside range', () => {
      const guard = NumberGuardian.create().range(5, 10);
      assertThrows(() => guard(4), GuardianError);
      assertThrows(() => guard(11), GuardianError);
    });
  });

  await t.step('integer validation', async (t) => {
    await t.step('passes for integer values', () => {
      const guard = NumberGuardian.create().integer();
      assertEquals(guard(5), 5);
      assertEquals(guard(0), 0);
      assertEquals(guard(-10), -10);
    });

    await t.step('throws for non-integer values', () => {
      const guard = NumberGuardian.create().integer();
      assertThrows(() => guard(5.5), GuardianError);
      assertThrows(() => guard(-10.1), GuardianError);
    });
  });

  await t.step('positive validation', async (t) => {
    await t.step('passes for positive values', () => {
      const guard = NumberGuardian.create().positive();
      assertEquals(guard(5), 5);
      assertEquals(guard(0.1), 0.1);
    });

    await t.step('throws for zero or negative values', () => {
      const guard = NumberGuardian.create().positive();
      assertThrows(() => guard(0), GuardianError);
      assertThrows(() => guard(-5), GuardianError);
    });
  });

  await t.step('negative validation', async (t) => {
    await t.step('passes for negative values', () => {
      const guard = NumberGuardian.create().negative();
      assertEquals(guard(-5), -5);
      assertEquals(guard(-0.1), -0.1);
    });

    await t.step('throws for zero or positive values', () => {
      const guard = NumberGuardian.create().negative();
      assertThrows(() => guard(0), GuardianError);
      assertThrows(() => guard(5), GuardianError);
    });
  });

  await t.step('multiple chained validations', () => {
    const guard = NumberGuardian.create()
      .min(0)
      .max(100)
      .integer();

    assertEquals(guard(50), 50);
    assertThrows(() => guard(-1), GuardianError);
    assertThrows(() => guard(101), GuardianError);
    assertThrows(() => guard(50.5), GuardianError);
  });

  await t.step('port validation', () => {
    const portGuard = NumberGuardian.create()
      .integer()
      .range(1, 65535);

    assertEquals(portGuard(80), 80);
    assertEquals(portGuard(8080), 8080);
    assertThrows(() => portGuard(0), GuardianError);
    assertThrows(() => portGuard(70000), GuardianError);
    assertThrows(() => portGuard(1.5), GuardianError);
  });

  await t.step('multipleOf validation', () => {
    const guard = NumberGuardian.create().multipleOf(5);
    assertEquals(guard(0), 0);
    assertEquals(guard(5), 5);
    assertEquals(guard(10), 10);
    assertThrows(() => guard(7), GuardianError);
  });

  await t.step('ceil transformation', () => {
    const guard = NumberGuardian.create().ceil();
    assertEquals(guard(3.14), 4);
    assertEquals(guard(3), 3);
    assertEquals(guard(-3.14), -3);
  });

  await t.step('floor transformation', () => {
    const guard = NumberGuardian.create().floor();
    assertEquals(guard(3.14), 3);
    assertEquals(guard(3), 3);
    assertEquals(guard(-3.14), -4);
  });

  await t.step('abs transformation', () => {
    const guard = NumberGuardian.create().abs();
    assertEquals(guard(5), 5);
    assertEquals(guard(-5), 5);
    assertEquals(guard(0), 0);
  });

  await t.step('negate transformation', () => {
    const guard = NumberGuardian.create().negate();
    assertEquals(guard(5), -5);
    assertEquals(guard(-5), 5);
    assertEquals(guard(0), 0);
  });

  await t.step('clamp transformation', () => {
    const guard = NumberGuardian.create().clamp(0, 10);
    assertEquals(guard(5), 5);
    assertEquals(guard(-5), 0);
    assertEquals(guard(15), 10);
  });

  await t.step('toFixed transformation', () => {
    const guard = NumberGuardian.create().toFixed(2);
    assertEquals(guard(3.14159), 3.14);
    assertEquals(guard(3), 3);
    assertEquals(guard(3.1), 3.1);
  });

  await t.step('toBigInt transformation', () => {
    const guard = NumberGuardian.create().toBigInt();
    assertEquals(guard(123), 123n);
    assertEquals(guard(0), 0n);
    assertThrows(() => guard(3.14), Error);
  });

  await t.step('toString transformation', () => {
    const guard = NumberGuardian.create().toString();
    assertEquals(guard(123), '123');
    assertEquals(guard(123.45), '123.45');

    const hexGuard = NumberGuardian.create().toString(16);
    assertEquals(hexGuard(255), 'ff');
  });

  await t.step('toDate transformation', () => {
    const timestamp = 1609459200000; // 2021-01-01
    const guard = NumberGuardian.create().toDate();
    const result = guard(timestamp);
    assertEquals(result instanceof Date, true);
    assertEquals(result.getTime(), timestamp);
  });

  await t.step('odd validation', () => {
    const guard = NumberGuardian.create().odd();
    assertEquals(guard(1), 1);
    assertEquals(guard(3), 3);
    assertEquals(guard(-5), -5);
    assertThrows(() => guard(2), GuardianError);
    assertThrows(() => guard(0), GuardianError);
  });

  await t.step('even validation', () => {
    const guard = NumberGuardian.create().even();
    assertEquals(guard(2), 2);
    assertEquals(guard(0), 0);
    assertEquals(guard(-4), -4);
    assertThrows(() => guard(1), GuardianError);
    assertThrows(() => guard(3), GuardianError);
  });

  await t.step('prime validation', () => {
    const guard = NumberGuardian.create().prime();
    assertEquals(guard(2), 2);
    assertEquals(guard(3), 3);
    assertEquals(guard(5), 5);
    assertEquals(guard(11), 11);
    assertThrows(() => guard(4), GuardianError);
    assertThrows(() => guard(1), GuardianError);
    assertThrows(() => guard(0), GuardianError);
    assertThrows(() => guard(-3), GuardianError);
  });

  await t.step('finite validation', () => {
    const guard = NumberGuardian.create().finite();
    assertEquals(guard(123), 123);
    assertEquals(guard(-123), -123);
    assertThrows(() => guard(Infinity), GuardianError);
    assertThrows(() => guard(-Infinity), GuardianError);
  });

  await t.step('safe validation', () => {
    const guard = NumberGuardian.create().safe();
    assertEquals(guard(123), 123);
    assertEquals(guard(Number.MAX_SAFE_INTEGER), Number.MAX_SAFE_INTEGER);
    assertThrows(() => guard(Number.MAX_SAFE_INTEGER + 1), GuardianError);
  });

  await t.step('nonZero validation', () => {
    const guard = NumberGuardian.create().nonZero();
    assertEquals(guard(123), 123);
    assertEquals(guard(-123), -123);
    assertThrows(() => guard(0), GuardianError);
  });

  await t.step('divisibleBy validation', () => {
    const guard = NumberGuardian.create().divisibleBy(3);
    assertEquals(guard(3), 3);
    assertEquals(guard(6), 6);
    assertEquals(guard(0), 0);
    assertThrows(() => guard(4), GuardianError);
    assertThrows(() => guard(5), GuardianError);
  });

  await t.step('percentage validation', () => {
    const guard = NumberGuardian.create().percentage();
    assertEquals(guard(0), 0);
    assertEquals(guard(50), 50);
    assertEquals(guard(100), 100);
    assertThrows(() => guard(-1), GuardianError);
    assertThrows(() => guard(101), GuardianError);
  });

  await t.step('isTimestamp validation', () => {
    const guard = NumberGuardian.create().isTimestamp();
    const now = Date.now();
    assertEquals(guard(now), now);
    assertEquals(guard(0), 0);

    // A number that doesn't convert cleanly to a valid timestamp
    assertThrows(() => guard(Number.MAX_SAFE_INTEGER), GuardianError);
  });
});
