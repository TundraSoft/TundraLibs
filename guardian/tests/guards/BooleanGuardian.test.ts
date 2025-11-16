import * as asserts from '$asserts';
import { BooleanGuardian, Guardian, GuardianError } from '../../mod.ts';

Deno.test('guardian.BooleanGuardian', async (t) => {
  await t.step('basic functionality', async (t) => {
    await t.step('should validate boolean type', () => {
      const guardian = new BooleanGuardian();

      asserts.assertEquals(guardian.parse(true), true);
      asserts.assertEquals(guardian.parse(false), false);

      asserts.assertThrows(() => guardian.parse('true'), GuardianError);
      asserts.assertThrows(() => guardian.parse(1), GuardianError);
      asserts.assertThrows(() => guardian.parse(0), GuardianError);
      asserts.assertThrows(() => guardian.parse(null), GuardianError);
      asserts.assertThrows(() => guardian.parse(undefined), GuardianError);
    });

    await t.step('should preserve boolean values', () => {
      const guardian = new BooleanGuardian();

      asserts.assertEquals(guardian.parse(true), true);
      asserts.assertEquals(guardian.parse(false), false);
    });
  });

  await t.step('specific value validations', async (t) => {
    await t.step('should validate true values', () => {
      const guardian = new BooleanGuardian().true();

      asserts.assertEquals(guardian.parse(true), true);

      asserts.assertThrows(
        () => guardian.parse(false),
        GuardianError,
        'Expected true but got false',
      );
    });

    await t.step('should validate false values', () => {
      const guardian = new BooleanGuardian().false();

      asserts.assertEquals(guardian.parse(false), false);

      asserts.assertThrows(
        () => guardian.parse(true),
        GuardianError,
        'Expected false but got true',
      );
    });

    await t.step('should support custom error messages', () => {
      const guardian = new BooleanGuardian().true('Must be enabled');

      asserts.assertThrows(
        () => guardian.parse(false),
        GuardianError,
        'Must be enabled',
      );
    });
  });

  await t.step('transformations', async (t) => {
    await t.step('should transform to string', () => {
      const guardian = new BooleanGuardian().toString();

      asserts.assertEquals(guardian.parse(true), 'true');
      asserts.assertEquals(guardian.parse(false), 'false');
    });

    await t.step('should transform to number', () => {
      const guardian = new BooleanGuardian().toNumber();

      asserts.assertEquals(guardian.parse(true), 1);
      asserts.assertEquals(guardian.parse(false), 0);
    });
  });

  await t.step('chained validations', async (t) => {
    await t.step('should chain validations', () => {
      const guardian = new BooleanGuardian().true().toString();

      asserts.assertEquals(guardian.parse(true), 'true');

      asserts.assertThrows(() => guardian.parse(false), GuardianError);
    });
  });

  await t.step('safe parsing', async (t) => {
    await t.step('should return success result for valid input', () => {
      const guardian = new BooleanGuardian();
      const [error, result] = guardian.safeParse(true);

      asserts.assertEquals(error, null);
      asserts.assertEquals(result, true);
    });

    await t.step('should return error result for invalid input', () => {
      const guardian = new BooleanGuardian();
      const [error, result] = guardian.safeParse('true');

      asserts.assertEquals(error instanceof GuardianError, true);
      asserts.assertEquals(result, undefined);
    });
  });

  await t.step('error handling', async (t) => {
    await t.step('should provide detailed error messages', () => {
      const guardian = new BooleanGuardian();

      asserts.assertThrows(
        () => guardian.parse('true'),
        GuardianError,
        'Expected boolean but got string',
      );
      asserts.assertThrows(
        () => guardian.parse(1),
        GuardianError,
        'Expected boolean but got number',
      );
    });

    await t.step('should support custom error messages', () => {
      const guardian = new BooleanGuardian().true('Custom error message');

      asserts.assertThrows(
        () => guardian.parse(false),
        GuardianError,
        'Custom error message',
      );
    });
  });
});
