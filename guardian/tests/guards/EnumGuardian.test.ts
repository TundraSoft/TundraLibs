import * as asserts from '$asserts';
import { EnumGuardian, Guardian, GuardianError } from '../../mod.ts';

Deno.test('guardian.EnumGuardian', async (t) => {
  await t.step('basic functionality', async (t) => {
    await t.step('should validate enum values', () => {
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

    await t.step('should work with number enums', () => {
      const numbers = [1, 2, 3] as const;
      const guardian = new EnumGuardian(numbers);

      asserts.assertEquals(guardian.parse(1), 1);
      asserts.assertEquals(guardian.parse(2), 2);
      asserts.assertEquals(guardian.parse(3), 3);

      asserts.assertThrows(() => guardian.parse(4), GuardianError);
      asserts.assertThrows(() => guardian.parse('1'), GuardianError);
    });

    await t.step('should require at least one allowed value', () => {
      asserts.assertThrows(() => new EnumGuardian([]), Error);
    });

    await t.step('should expose allowed values', () => {
      const values = ['a', 'b', 'c'] as const;
      const guardian = new EnumGuardian(values);

      asserts.assertEquals(guardian.allowedValues, values);
    });
  });

  await t.step('validation methods', async (t) => {
    await t.step('should exclude specific values', () => {
      const colors = ['red', 'green', 'blue', 'yellow'] as const;
      const guardian = new EnumGuardian(colors).exclude(['yellow']);

      asserts.assertEquals(guardian.parse('red'), 'red');
      asserts.assertEquals(guardian.parse('green'), 'green');
      asserts.assertEquals(guardian.parse('blue'), 'blue');

      asserts.assertThrows(() => guardian.parse('yellow'), GuardianError);
    });

    await t.step('should support custom error message for exclusion', () => {
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

  await t.step('transformations', async (t) => {
    await t.step('should transform to string', () => {
      const numbers = [1, 2, 3] as const;
      const guardian = new EnumGuardian(numbers).toString();

      asserts.assertEquals(guardian.parse(1), '1');
      asserts.assertEquals(guardian.parse(2), '2');
      asserts.assertEquals(guardian.parse(3), '3');
    });

    await t.step('should map values', () => {
      const colors = ['red', 'green', 'blue'] as const;
      const guardian = new EnumGuardian(colors).map((color) =>
        color.toUpperCase()
      );

      asserts.assertEquals(guardian.parse('red'), 'RED');
      asserts.assertEquals(guardian.parse('green'), 'GREEN');
      asserts.assertEquals(guardian.parse('blue'), 'BLUE');
    });

    await t.step('should map to different types', () => {
      const status = ['active', 'inactive'] as const;
      const guardian = new EnumGuardian(status).map((s) =>
        s === 'active' ? 1 : 0
      );

      asserts.assertEquals(guardian.parse('active'), 1);
      asserts.assertEquals(guardian.parse('inactive'), 0);
    });
  });

  await t.step('chained validations', async (t) => {
    await t.step('should chain exclusions and transformations', () => {
      const colors = ['red', 'green', 'blue', 'yellow'] as const;
      const guardian = new EnumGuardian(colors)
        .exclude(['yellow'])
        .map((color) => color.toUpperCase());

      asserts.assertEquals(guardian.parse('red'), 'RED');
      asserts.assertThrows(() => guardian.parse('yellow'), GuardianError);
    });
  });

  await t.step('safe parsing', async (t) => {
    await t.step('should return success result for valid input', () => {
      const colors = ['red', 'green', 'blue'] as const;
      const guardian = new EnumGuardian(colors);
      const [error, result] = guardian.safeParse('red');

      asserts.assertEquals(error, null);
      asserts.assertEquals(result, 'red');
    });

    await t.step('should return error result for invalid input', () => {
      const colors = ['red', 'green', 'blue'] as const;
      const guardian = new EnumGuardian(colors);
      const [error, result] = guardian.safeParse('yellow');

      asserts.assertEquals(error instanceof GuardianError, true);
      asserts.assertEquals(result, undefined);
    });
  });

  await t.step('error handling', async (t) => {
    await t.step('should provide detailed error messages', () => {
      const colors = ['red', 'green', 'blue'] as const;
      const guardian = new EnumGuardian(colors);

      asserts.assertThrows(
        () => guardian.parse('yellow'),
        GuardianError,
        'Value must be one of: red, green, blue',
      );
    });
  });

  await t.step('real world usage', async (t) => {
    await t.step('should work with TypeScript enums', () => {
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
});
