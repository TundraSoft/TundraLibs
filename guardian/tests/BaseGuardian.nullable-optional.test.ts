import * as asserts from '$asserts';
import { Guardian } from '../Guardian.ts';
import { GuardianError } from '../GuardianError.ts';

Deno.test('guardian.BaseGuardian.nullable', async (t) => {
  await t.step('basic nullable functionality', async (t) => {
    await t.step('should accept null values', () => {
      const nullableString = Guardian.string().nullable();
      asserts.assertEquals(nullableString.parse(null), null);
    });

    await t.step('should accept valid values', () => {
      const nullableString = Guardian.string().nullable();
      asserts.assertEquals(nullableString.parse('hello'), 'hello');
    });

    await t.step('should reject undefined when only nullable', () => {
      const nullableString = Guardian.string().nullable();
      asserts.assertThrows(
        () => nullableString.parse(undefined),
        GuardianError,
        'Expected string but got undefined',
      );
    });

    await t.step('should reject invalid types', () => {
      const nullableString = Guardian.string().nullable();
      asserts.assertThrows(
        () => nullableString.parse(42),
        GuardianError,
        'Expected string but got number',
      );
    });
  });

  await t.step('nullable with validations', async (t) => {
    await t.step('should pass null through without running validations', () => {
      const nullableString = Guardian.string().minLength(5).nullable();
      asserts.assertEquals(nullableString.parse(null), null);
    });

    await t.step('should run validations on non-null values', () => {
      const nullableString = Guardian.string().minLength(5).nullable();
      asserts.assertEquals(nullableString.parse('hello world'), 'hello world');
    });

    await t.step('should fail validations on non-null invalid values', () => {
      const nullableString = Guardian.string().minLength(5).nullable();
      asserts.assertThrows(
        () => nullableString.parse('hi'),
        GuardianError,
        'String must be at least 5 characters long',
      );
    });
  });

  await t.step('safe parsing with nullable', async (t) => {
    await t.step('should return success for null', () => {
      const nullableString = Guardian.string().nullable();
      const [error, data] = nullableString.safeParse(null);
      asserts.assertEquals(error, null);
      asserts.assertEquals(data, null);
    });

    await t.step('should return success for valid value', () => {
      const nullableString = Guardian.string().nullable();
      const [error, data] = nullableString.safeParse('hello');
      asserts.assertEquals(error, null);
      asserts.assertEquals(data, 'hello');
    });

    await t.step('should return error for invalid value', () => {
      const nullableString = Guardian.string().nullable();
      const [error, data] = nullableString.safeParse(42);
      asserts.assertInstanceOf(error, GuardianError);
      asserts.assertEquals(data, undefined);
    });
  });
});

Deno.test('guardian.BaseGuardian.optional', async (t) => {
  await t.step('basic optional functionality', async (t) => {
    await t.step('should handle undefined without default', () => {
      const optionalString = Guardian.string().optional();
      // Optional without default should accept undefined
      const result = optionalString.parse(undefined);
      asserts.assertEquals(result, undefined);
    });

    await t.step('should use default value for undefined', () => {
      const optionalString = Guardian.string().optional('default');
      asserts.assertEquals(optionalString.parse(undefined), 'default');
    });

    await t.step('should accept valid values', () => {
      const optionalString = Guardian.string().optional('default');
      asserts.assertEquals(optionalString.parse('hello'), 'hello');
    });

    await t.step('should reject null when only optional', () => {
      const optionalString = Guardian.string().optional('default');
      asserts.assertThrows(
        () => optionalString.parse(null),
        GuardianError,
        'Expected string but got object',
      );
    });
  });

  await t.step('optional with function defaults', async (t) => {
    await t.step('should call sync function for default', () => {
      let called = false;
      const optionalString = Guardian.string().optional(() => {
        called = true;
        return 'function-default';
      });

      const result = optionalString.parse(undefined);
      asserts.assertEquals(result, 'function-default');
      asserts.assertEquals(called, true);
    });

    await t.step('should not call function when value is provided', () => {
      let called = false;
      const optionalString = Guardian.string().optional(() => {
        called = true;
        return 'function-default';
      });

      const result = optionalString.parse('provided');
      asserts.assertEquals(result, 'provided');
      asserts.assertEquals(called, false);
    });

    await t.step('should handle async function defaults', async () => {
      const optionalString = Guardian.string().optional(async () => {
        await new Promise((resolve) => setTimeout(resolve, 1));
        return 'async-default';
      });

      const result = await optionalString.parseAsync(undefined);
      asserts.assertEquals(result, 'async-default');
    });
  });

  await t.step('optional with null as default', async (t) => {
    await t.step('should use null as default and fail type validation', () => {
      const optionalString = Guardian.string().optional(null as any);
      asserts.assertThrows(
        () => optionalString.parse(undefined),
        GuardianError,
        'Expected string but got object',
      );
    });
  });
});

Deno.test('guardian.BaseGuardian.nullable.optional', async (t) => {
  await t.step('combined nullable and optional', async (t) => {
    await t.step('should accept null values', () => {
      const schema = Guardian.string().nullable().optional('default');
      asserts.assertEquals(schema.parse(null), null);
    });

    await t.step('should use default for undefined', () => {
      const schema = Guardian.string().nullable().optional('default');
      asserts.assertEquals(schema.parse(undefined), 'default');
    });

    await t.step('should accept valid values', () => {
      const schema = Guardian.string().nullable().optional('default');
      asserts.assertEquals(schema.parse('hello'), 'hello');
    });

    await t.step('should reject invalid types', () => {
      const schema = Guardian.string().nullable().optional('default');
      asserts.assertThrows(
        () => schema.parse(42),
        GuardianError,
        'Expected string but got number',
      );
    });
  });

  await t.step('optional with null default then nullable', async (t) => {
    await t.step('should handle null default correctly', () => {
      const schema = Guardian.string().nullable().optional(null as any);
      const result = schema.parse(undefined);
      asserts.assertEquals(result, null);
    });
  });

  await t.step('async optional with nullable', async (t) => {
    await t.step('should handle async defaults with nullable', async () => {
      const schema = Guardian.string().nullable().optional(async () => {
        await new Promise((resolve) => setTimeout(resolve, 1));
        return 'async-result';
      });

      const result = await schema.parseAsync(undefined);
      asserts.assertEquals(result, 'async-result');

      const nullResult = await schema.parseAsync(null);
      asserts.assertEquals(nullResult, null);
    });

    await t.step('should handle async defaults returning null', async () => {
      const schema = Guardian.string().nullable().optional(async () => {
        await new Promise((resolve) => setTimeout(resolve, 1));
        return null as any;
      });

      const result = await schema.parseAsync(undefined);
      asserts.assertEquals(result, null);
    });
  });
});

Deno.test('guardian.BaseGuardian.default validation behavior', async (t) => {
  await t.step('should reject null by default', () => {
    const stringGuard = Guardian.string();
    asserts.assertThrows(
      () => stringGuard.parse(null),
      GuardianError,
      'Expected string but got object',
    );
  });

  await t.step('should reject undefined by default', () => {
    const stringGuard = Guardian.string();
    asserts.assertThrows(
      () => stringGuard.parse(undefined),
      GuardianError,
      'Expected string but got undefined',
    );
  });

  await t.step('should work with different guardian types', async (t) => {
    await t.step('nullable number', () => {
      const nullableNumber = Guardian.number().nullable();
      asserts.assertEquals(nullableNumber.parse(null), null);
      asserts.assertEquals(nullableNumber.parse(42), 42);
    });

    await t.step('optional boolean', () => {
      const optionalBoolean = Guardian.boolean().optional(true);
      asserts.assertEquals(optionalBoolean.parse(undefined), true);
      asserts.assertEquals(optionalBoolean.parse(false), false);
    });

    await t.step('nullable optional array', () => {
      const schema = Guardian.array().nullable().optional([]);
      asserts.assertEquals(schema.parse(null), null);
      asserts.assertEquals(schema.parse(undefined), []);
      asserts.assertEquals(schema.parse([1, 2, 3]), [1, 2, 3]);
    });
  });
});
