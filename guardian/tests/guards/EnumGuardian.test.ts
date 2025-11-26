import * as asserts from '$asserts';
import { EnumGuardian, GuardianError } from '../../mod.ts';

Deno.test('guardian.EnumGuardian', async (t) => {
  await t.step('basic functionality', async (u) => {
    await u.step('should validate enum values', () => {
      const colors = ['red', 'green', 'blue'] as const;
      const guardian = new EnumGuardian(colors);

      asserts.assertEquals(guardian.parse('red'), 'red');
      asserts.assertEquals(guardian.parse('green'), 'green');
      asserts.assertEquals(guardian.parse('blue'), 'blue');

      asserts.assertThrows(() => guardian.parse('yellow'), GuardianError);
      asserts.assertThrows(() => guardian.parse('purple'), GuardianError);
      asserts.assertThrows(() => guardian.parse(123), GuardianError);
      asserts.assertThrows(() => guardian.parse(null), GuardianError);
    });

    await u.step('should work with number enums', () => {
      const numbers = [1, 2, 3] as const;
      const guardian = new EnumGuardian(numbers);

      asserts.assertEquals(guardian.parse(1), 1);
      asserts.assertEquals(guardian.parse(2), 2);
      asserts.assertEquals(guardian.parse(3), 3);

      asserts.assertThrows(() => guardian.parse(4), GuardianError);
      asserts.assertThrows(() => guardian.parse('1'), GuardianError);
    });

    await u.step('should require at least one allowed value', () => {
      asserts.assertThrows(() => new EnumGuardian([]), Error);
    });

    await u.step('should expose allowed values', () => {
      const values = ['a', 'b', 'c'] as const;
      const guardian = new EnumGuardian(values);

      asserts.assertEquals(guardian.allowedValues, values);
    });
  });

  await t.step('validation methods', async (u) => {
    await u.step('should exclude specific values', () => {
      const colors = ['red', 'green', 'blue', 'yellow'] as const;
      const guardian = new EnumGuardian(colors).exclude(['yellow']);

      asserts.assertEquals(guardian.parse('red'), 'red');
      asserts.assertEquals(guardian.parse('green'), 'green');
      asserts.assertEquals(guardian.parse('blue'), 'blue');

      asserts.assertThrows(() => guardian.parse('yellow'), GuardianError);
    });

    await u.step('should support custom error message for exclusion', () => {
      const colors = ['red', 'green', 'blue', 'yellow'] as const;
      const guardian = new EnumGuardian(colors).exclude(
        ['yellow'],
        'Yellow is not allowed',
      );

      asserts.assertThrows(
        () => guardian.parse('yellow'),
        GuardianError,
        'Yellow is not allowed',
      );
    });
  });

  await t.step('transformations', async (u) => {
    await u.step('should transform to string', () => {
      const numbers = [1, 2, 3] as const;
      const guardian = new EnumGuardian(numbers).toString();

      asserts.assertEquals(guardian.parse(1), '1');
      asserts.assertEquals(guardian.parse(2), '2');
      asserts.assertEquals(guardian.parse(3), '3');
    });

    await u.step('should map values', () => {
      const colors = ['red', 'green', 'blue'] as const;
      const guardian = new EnumGuardian(colors).map((color) =>
        color.toUpperCase()
      );

      asserts.assertEquals(guardian.parse('red'), 'RED');
      asserts.assertEquals(guardian.parse('green'), 'GREEN');
      asserts.assertEquals(guardian.parse('blue'), 'BLUE');
    });

    await u.step('should map to different types', () => {
      const status = ['active', 'inactive'] as const;
      const guardian = new EnumGuardian(status).map((s) =>
        s === 'active' ? 1 : 0
      );

      asserts.assertEquals(guardian.parse('active'), 1);
      asserts.assertEquals(guardian.parse('inactive'), 0);
    });
  });

  await t.step('chained validations', async (u) => {
    await u.step('should chain exclusions and transformations', () => {
      const colors = ['red', 'green', 'blue', 'yellow'] as const;
      const guardian = new EnumGuardian(colors)
        .exclude(['yellow'])
        .map((color) => color.toUpperCase());

      asserts.assertEquals(guardian.parse('red'), 'RED');
      asserts.assertThrows(() => guardian.parse('yellow'), GuardianError);
    });
  });

  await t.step('safe parsing', async (u) => {
    await u.step('should return success result for valid input', () => {
      const colors = ['red', 'green', 'blue'] as const;
      const guardian = new EnumGuardian(colors);
      const [error, result] = guardian.safeParse('red');

      asserts.assertEquals(error, null);
      asserts.assertEquals(result, 'red');
    });

    await u.step('should return error result for invalid input', () => {
      const colors = ['red', 'green', 'blue'] as const;
      const guardian = new EnumGuardian(colors);
      const [error, result] = guardian.safeParse('yellow');

      asserts.assertEquals(error instanceof GuardianError, true);
      asserts.assertEquals(result, undefined);
    });
  });

  await t.step('error handling', async (u) => {
    await u.step('should provide detailed error messages', () => {
      const colors = ['red', 'green', 'blue'] as const;
      const guardian = new EnumGuardian(colors);

      asserts.assertThrows(
        () => guardian.parse('yellow'),
        GuardianError,
        'Value must be one of: red, green, blue',
      );
    });
  });

  await t.step('real world usage', async (u) => {
    await u.step('should work with TypeScript enums', () => {
      // Simulate enum usage
      const UserRole = {
        ADMIN: 'admin',
        USER: 'user',
        MODERATOR: 'moderator',
      } as const;

      const guardian = new EnumGuardian(Object.values(UserRole));

      asserts.assertEquals(guardian.parse('admin'), 'admin');
      asserts.assertEquals(guardian.parse('user'), 'user');
      asserts.assertEquals(guardian.parse('moderator'), 'moderator');

      asserts.assertThrows(() => guardian.parse('guest'), GuardianError);
    });
  });

  await t.step('nullable and optional chaining', async (u) => {
    const colors = ['red', 'green', 'blue'] as const;

    await u.step(
      'nullable().optional() allows null, undefined, and valid enum values',
      () => {
        const guard = new EnumGuardian(colors).nullable().optional();

        asserts.assertEquals(guard.parse(null), null);
        asserts.assertEquals(guard.parse(undefined), undefined);
        asserts.assertEquals(guard.parse('red'), 'red');
        asserts.assertEquals(guard.parse('green'), 'green');
        asserts.assertEquals(guard.parse('blue'), 'blue');
      },
    );

    await u.step(
      'optional().nullable() allows undefined, null, and valid enum values',
      () => {
        const guard = new EnumGuardian(colors).optional().nullable();

        asserts.assertEquals(guard.parse(undefined), undefined);
        asserts.assertEquals(guard.parse(null), null);
        asserts.assertEquals(guard.parse('red'), 'red');
        asserts.assertEquals(guard.parse('green'), 'green');
        asserts.assertEquals(guard.parse('blue'), 'blue');
      },
    );

    await u.step('nullable().optional() rejects invalid enum values', () => {
      const guard = new EnumGuardian(colors).nullable().optional();

      asserts.assertThrows(() => guard.parse('yellow'), GuardianError);
      asserts.assertThrows(() => guard.parse('purple'), GuardianError);
      asserts.assertThrows(() => guard.parse(123), GuardianError);
    });

    await u.step('optional().nullable() rejects invalid enum values', () => {
      const guard = new EnumGuardian(colors).optional().nullable();

      asserts.assertThrows(() => guard.parse('yellow'), GuardianError);
      asserts.assertThrows(() => guard.parse('purple'), GuardianError);
      asserts.assertThrows(() => guard.parse(123), GuardianError);
    });
  });
});
