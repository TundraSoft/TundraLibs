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
});
