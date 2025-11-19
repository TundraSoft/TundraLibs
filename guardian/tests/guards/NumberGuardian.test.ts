import * as asserts from '$asserts';
import { GuardianError, NumberGuardian } from '../../mod.ts';

Deno.test('guardian.NumberGuardian', async (t) => {
  await t.step('basic functionality', async (t) => {
    await t.step('should validate number type', () => {
      const schema = new NumberGuardian();

      asserts.assertEquals(schema.parse(123), 123);
      asserts.assertEquals(schema.parse(3.14), 3.14);
      asserts.assertEquals(schema.parse(-42), -42);
      asserts.assertEquals(schema.parse(0), 0);

      asserts.assertThrows(() => schema.parse('123'), GuardianError);
      asserts.assertThrows(() => schema.parse(null), GuardianError);
      asserts.assertThrows(() => schema.parse(undefined), GuardianError);
      asserts.assertThrows(() => schema.parse(true), GuardianError);
    });

    await t.step('should reject NaN', () => {
      const schema = new NumberGuardian();
      asserts.assertThrows(() => schema.parse(NaN), GuardianError);
    });

    await t.step('should accept Infinity', () => {
      const schema = new NumberGuardian();
      asserts.assertEquals(schema.parse(Infinity), Infinity);
      asserts.assertEquals(schema.parse(-Infinity), -Infinity);
    });
  });

  await t.step('range validations', async (t) => {
    await t.step('should validate minimum value', () => {
      const schema = new NumberGuardian().min(10);

      asserts.assertEquals(schema.parse(10), 10);
      asserts.assertEquals(schema.parse(15), 15);
      asserts.assertThrows(() => schema.parse(5), GuardianError);
      asserts.assertThrows(() => schema.parse(-5), GuardianError);
    });

    await t.step('should validate maximum value', () => {
      const schema = new NumberGuardian().max(100);

      asserts.assertEquals(schema.parse(100), 100);
      asserts.assertEquals(schema.parse(50), 50);
      asserts.assertThrows(() => schema.parse(101), GuardianError);
      asserts.assertThrows(() => schema.parse(200), GuardianError);
    });

    await t.step('should combine min and max', () => {
      const schema = new NumberGuardian().min(10).max(100);

      asserts.assertEquals(schema.parse(50), 50);
      asserts.assertThrows(() => schema.parse(5), GuardianError);
      asserts.assertThrows(() => schema.parse(150), GuardianError);
    });
  });

  await t.step('sign validations', async (t) => {
    await t.step('should validate positive numbers', () => {
      const schema = new NumberGuardian().positive();

      asserts.assertEquals(schema.parse(1), 1);
      asserts.assertEquals(schema.parse(0.1), 0.1);
      asserts.assertThrows(() => schema.parse(0), GuardianError);
      asserts.assertThrows(() => schema.parse(-1), GuardianError);
    });

    await t.step('should validate negative numbers', () => {
      const schema = new NumberGuardian().negative();

      asserts.assertEquals(schema.parse(-1), -1);
      asserts.assertEquals(schema.parse(-0.1), -0.1);
      asserts.assertThrows(() => schema.parse(0), GuardianError);
      asserts.assertThrows(() => schema.parse(1), GuardianError);
    });

    await t.step('should validate non-negative numbers', () => {
      const schema = new NumberGuardian().nonNegative();

      asserts.assertEquals(schema.parse(0), 0);
      asserts.assertEquals(schema.parse(1), 1);
      asserts.assertThrows(() => schema.parse(-1), GuardianError);
    });

    await t.step('should validate non-positive numbers', () => {
      const schema = new NumberGuardian().nonPositive();

      asserts.assertEquals(schema.parse(0), 0);
      asserts.assertEquals(schema.parse(-1), -1);
      asserts.assertThrows(() => schema.parse(1), GuardianError);
    });
  });

  await t.step('integer and finite validations', async (t) => {
    await t.step('should validate integers', () => {
      const schema = new NumberGuardian().integer();

      asserts.assertEquals(schema.parse(42), 42);
      asserts.assertEquals(schema.parse(-10), -10);
      asserts.assertEquals(schema.parse(0), 0);
      asserts.assertThrows(() => schema.parse(3.14), GuardianError);
      asserts.assertThrows(() => schema.parse(0.1), GuardianError);
    });

    await t.step('should validate finite numbers', () => {
      const schema = new NumberGuardian().finite();

      asserts.assertEquals(schema.parse(123), 123);
      asserts.assertEquals(schema.parse(-456), -456);
      asserts.assertThrows(() => schema.parse(Infinity), GuardianError);
      asserts.assertThrows(() => schema.parse(-Infinity), GuardianError);
    });

    await t.step('should validate safe integers', () => {
      const schema = new NumberGuardian().safeInteger();

      asserts.assertEquals(schema.parse(42), 42);
      asserts.assertEquals(
        schema.parse(Number.MAX_SAFE_INTEGER),
        Number.MAX_SAFE_INTEGER,
      );
      asserts.assertEquals(
        schema.parse(Number.MIN_SAFE_INTEGER),
        Number.MIN_SAFE_INTEGER,
      );
      asserts.assertThrows(() => schema.parse(3.14), GuardianError);
      asserts.assertThrows(
        () => schema.parse(Number.MAX_SAFE_INTEGER + 1),
        GuardianError,
      );
    });
  });

  await t.step('multipleOf validation', async (t) => {
    await t.step('should validate multiples', () => {
      const schema = new NumberGuardian().multipleOf(5);

      asserts.assertEquals(schema.parse(0), 0);
      asserts.assertEquals(schema.parse(5), 5);
      asserts.assertEquals(schema.parse(10), 10);
      asserts.assertEquals(schema.parse(-15), -15);
      asserts.assertThrows(() => schema.parse(3), GuardianError);
      asserts.assertThrows(() => schema.parse(7), GuardianError);
    });

    await t.step('should work with decimal multiples', () => {
      const schema = new NumberGuardian().multipleOf(0.5);

      asserts.assertEquals(schema.parse(1.5), 1.5);
      asserts.assertEquals(schema.parse(2.0), 2.0);
      asserts.assertThrows(() => schema.parse(1.3), GuardianError);
    });
  });

  await t.step('mathematical transformations', async (t) => {
    await t.step('should round numbers', () => {
      const schema = new NumberGuardian().round();

      asserts.assertEquals(schema.parse(3.7), 4);
      asserts.assertEquals(schema.parse(3.2), 3);
      asserts.assertEquals(schema.parse(-2.7), -3);
      asserts.assertEquals(schema.parse(-2.2), -2);
    });

    await t.step('should floor numbers', () => {
      const schema = new NumberGuardian().floor();

      asserts.assertEquals(schema.parse(3.7), 3);
      asserts.assertEquals(schema.parse(3.2), 3);
      asserts.assertEquals(schema.parse(-2.7), -3);
      asserts.assertEquals(schema.parse(-2.2), -3);
    });

    await t.step('should ceil numbers', () => {
      const schema = new NumberGuardian().ceil();

      asserts.assertEquals(schema.parse(3.7), 4);
      asserts.assertEquals(schema.parse(3.2), 4);
      asserts.assertEquals(schema.parse(-2.7), -2);
      asserts.assertEquals(schema.parse(-2.2), -2);
    });

    await t.step('should truncate numbers', () => {
      const schema = new NumberGuardian().trunc();

      asserts.assertEquals(schema.parse(3.7), 3);
      asserts.assertEquals(schema.parse(3.2), 3);
      asserts.assertEquals(schema.parse(-2.7), -2);
      asserts.assertEquals(schema.parse(-2.2), -2);
    });

    await t.step('should get absolute value', () => {
      const schema = new NumberGuardian().abs();

      asserts.assertEquals(schema.parse(5), 5);
      asserts.assertEquals(schema.parse(-5), 5);
      asserts.assertEquals(schema.parse(0), 0);
    });
  });

  await t.step('type transformations', async (t) => {
    await t.step('should convert number to string', () => {
      const schema = new NumberGuardian().toString();

      asserts.assertEquals(schema.parse(123), '123');
      asserts.assertEquals(schema.parse(3.14), '3.14');
      asserts.assertEquals(schema.parse(-42), '-42');
    });

    await t.step('should convert number to string with radix', () => {
      const schema = new NumberGuardian().toString(16);

      asserts.assertEquals(schema.parse(255), 'ff');
      asserts.assertEquals(schema.parse(16), '10');
    });

    await t.step('should convert number to BigInt', () => {
      const schema = new NumberGuardian().toBigInt();

      asserts.assertEquals(schema.parse(123), 123n);
      asserts.assertEquals(schema.parse(-42), -42n);
      asserts.assertThrows(() => schema.parse(3.14), GuardianError);
    });

    await t.step('should convert number to Date', () => {
      const schema = new NumberGuardian().toDate();
      const timestamp = Date.now();

      const date = schema.parse(timestamp);
      asserts.assert(date instanceof Date);
      asserts.assertEquals(date.getTime(), timestamp);

      asserts.assertThrows(() => schema.parse(NaN), GuardianError);
    });
  });

  await t.step('chained validations', async (t) => {
    await t.step('should chain multiple validations', () => {
      const schema = new NumberGuardian()
        .positive()
        .integer()
        .max(100)
        .min(1)
        .multipleOf(5);

      asserts.assertEquals(schema.parse(5), 5);
      asserts.assertEquals(schema.parse(50), 50);
      asserts.assertEquals(schema.parse(100), 100);

      asserts.assertThrows(() => schema.parse(0), GuardianError); // not positive
      asserts.assertThrows(() => schema.parse(3.5), GuardianError); // not integer
      asserts.assertThrows(() => schema.parse(150), GuardianError); // too large
      asserts.assertThrows(() => schema.parse(7), GuardianError); // not multiple of 5
    });

    await t.step('should chain transformations', () => {
      const schema = new NumberGuardian().abs().round();

      asserts.assertEquals(schema.parse(-3.7), 4);
      asserts.assertEquals(schema.parse(2.2), 2);
    });
  });

  await t.step('safe parsing', async (t) => {
    await t.step('should return success result for valid input', () => {
      const schema = new NumberGuardian().positive();
      const result = schema.safeParse(42);

      const [error, data] = result;
      asserts.assertEquals(error, null);
      asserts.assertEquals(data, 42);
    });

    await t.step('should return error result for invalid input', () => {
      const schema = new NumberGuardian().positive();
      const result = schema.safeParse(-1);

      const [error, data] = result;
      asserts.assert(error instanceof GuardianError);
      asserts.assertEquals(data, undefined);
    });
  });

  await t.step('error handling', async (t) => {
    await t.step('should provide detailed error messages', () => {
      const schema = new NumberGuardian().min(10);

      asserts.assertThrows(
        () => schema.parse(5),
        GuardianError,
        'Number must be at least 10',
      );
    });

    await t.step('should support custom error messages', () => {
      const schema = new NumberGuardian().min(10, 'Too small!');

      asserts.assertThrows(
        () => schema.parse(5),
        GuardianError,
        'Too small!',
      );
    });
  });
});
