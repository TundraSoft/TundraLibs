import { assertEquals, assertThrows } from '$asserts';
import { GuardianError } from '../../GuardianError.ts';
import { BooleanGuardian } from '../../guards/mod.ts';

Deno.test('BooleanGuardian', async (t) => {
  await t.step('create', async (t) => {
    await t.step('passes through boolean values', () => {
      const guard = BooleanGuardian.create();
      assertEquals(guard(true), true);
      assertEquals(guard(false), false);
    });

    await t.step('coerces string values to boolean', () => {
      const guard = BooleanGuardian.create();
      assertEquals(guard('true'), true);
      assertEquals(guard('TRUE'), true);
      assertEquals(guard('false'), false);
      assertEquals(guard('FALSE'), false);
    });

    await t.step('coerces number values to boolean', () => {
      const guard = BooleanGuardian.create();
      assertEquals(guard(1), true);
      assertEquals(guard(0), false);
    });

    await t.step('coerces string number values to boolean', () => {
      const guard = BooleanGuardian.create();
      assertEquals(guard('1'), true);
      assertEquals(guard('0'), false);
    });

    await t.step('throws for invalid values', () => {
      const guard = BooleanGuardian.create();
      assertThrows(
        () => guard('invalid'),
        GuardianError,
        'Expected value to be boolean, got string',
      );
      assertThrows(
        () => guard({}),
        GuardianError,
        'Expected value to be boolean, got object',
      );
      assertThrows(
        () => guard([]),
        GuardianError,
        'Expected value to be boolean, got array',
      );
      assertThrows(
        () => guard(null),
        GuardianError,
        'Expected value to be boolean, got null',
      );
      assertThrows(
        () => guard(undefined),
        GuardianError,
        'Expected value to be boolean, got undefined',
      );
    });

    await t.step('uses custom error message when provided', () => {
      const guard = BooleanGuardian.create('Custom error');
      assertThrows(() => guard('invalid'), Error, 'Custom error');
    });
  });

  await t.step('true', async (t) => {
    await t.step('passes when value is true', () => {
      const guard = BooleanGuardian.create().true();
      assertEquals(guard(true), true);
    });

    await t.step('throws when value is false', () => {
      const guard = BooleanGuardian.create().true();
      assertThrows(
        () => guard(false),
        Error,
        'Expected value to be TRUE, got false',
      );
    });

    await t.step('throws with coerced values that become false', () => {
      const guard = BooleanGuardian.create().true();
      assertThrows(
        () => guard('false'),
        Error,
        'Expected value to be TRUE, got false',
      );
      assertThrows(
        () => guard('FALSE'),
        Error,
        'Expected value to be TRUE, got false',
      );
      assertThrows(
        () => guard('0'),
        Error,
        'Expected value to be TRUE, got false',
      );
      assertThrows(
        () => guard(0),
        Error,
        'Expected value to be TRUE, got false',
      );
    });

    await t.step('uses custom error message when provided', () => {
      const guard = BooleanGuardian.create().true('Must be true');
      assertThrows(() => guard(false), Error, 'Must be true');
    });
  });

  await t.step('false', async (t) => {
    await t.step('passes when value is false', () => {
      const guard = BooleanGuardian.create().false();
      assertEquals(guard(false), false);
    });

    await t.step('throws when value is true', () => {
      const guard = BooleanGuardian.create().false();
      assertThrows(
        () => guard(true),
        Error,
        'Expected value to be FALSE, got true',
      );
    });

    await t.step('throws with coerced values that become true', () => {
      const guard = BooleanGuardian.create().false();
      assertThrows(
        () => guard('true'),
        Error,
        'Expected value to be FALSE, got true',
      );
      assertThrows(
        () => guard('TRUE'),
        Error,
        'Expected value to be FALSE, got true',
      );
      assertThrows(
        () => guard('1'),
        Error,
        'Expected value to be FALSE, got true',
      );
      assertThrows(
        () => guard(1),
        Error,
        'Expected value to be FALSE, got true',
      );
    });

    await t.step('uses custom error message when provided', () => {
      const guard = BooleanGuardian.create().false('Must be false');
      assertThrows(() => guard(true), Error, 'Must be false');
    });
  });
});
