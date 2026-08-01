import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat';
import { GuardianError, NumberGuardian } from '../../mod.ts';

describe('guardian.NumberGuardian', () => {
  describe('basic functionality', () => {
    it('should validate number type', () => {
      const schema = new NumberGuardian();

      asserts.assertEquals(schema.parse(123), 123);
      asserts.assertEquals(schema.parse(3.14), 3.14);
      asserts.assertEquals(schema.parse(-42), -42);
      asserts.assertEquals(schema.parse(0), 0);

      // Coerce-by-default: numeric strings / booleans / bigints / dates flow through.
      asserts.assertEquals(schema.parse('123'), 123);
      asserts.assertEquals(schema.parse('3.14'), 3.14);
      asserts.assertEquals(schema.parse(true), 1);
      asserts.assertEquals(schema.parse(false), 0);
      asserts.assertEquals(schema.parse(42n), 42);

      // Non-coercible inputs still throw.
      asserts.assertThrows(() => schema.parse(null), GuardianError);
      asserts.assertThrows(() => schema.parse(undefined), GuardianError);
      asserts.assertThrows(() => schema.parse('abc'), GuardianError);
      asserts.assertThrows(() => schema.parse(''), GuardianError);
      asserts.assertThrows(() => schema.parse({}), GuardianError);
      asserts.assertThrows(() => schema.parse([]), GuardianError);
    });

    it('should reject NaN', () => {
      const schema = new NumberGuardian();
      asserts.assertThrows(() => schema.parse(Number.NaN), GuardianError);
    });

    it('should reject Infinity and -Infinity (must be finite)', () => {
      const schema = new NumberGuardian();
      asserts.assertThrows(() => schema.parse(Infinity), GuardianError);
      asserts.assertThrows(() => schema.parse(-Infinity), GuardianError);
      // Coerced from a string too.
      asserts.assertThrows(() => schema.parse('Infinity'), GuardianError);
    });

    it('rejects non-finite values through downstream validators', () => {
      asserts.assertThrows(
        () => new NumberGuardian().positive().min(5).parse(Infinity),
        GuardianError,
      );
    });
  });

  describe('range validations', () => {
    it('should validate minimum value', () => {
      const schema = new NumberGuardian().min(10);

      asserts.assertEquals(schema.parse(10), 10);
      asserts.assertEquals(schema.parse(15), 15);
      asserts.assertThrows(() => schema.parse(5), GuardianError);
      asserts.assertThrows(() => schema.parse(-5), GuardianError);
    });

    it('should validate maximum value', () => {
      const schema = new NumberGuardian().max(100);

      asserts.assertEquals(schema.parse(100), 100);
      asserts.assertEquals(schema.parse(50), 50);
      asserts.assertThrows(() => schema.parse(101), GuardianError);
      asserts.assertThrows(() => schema.parse(200), GuardianError);
    });

    it('should combine min and max', () => {
      const schema = new NumberGuardian().min(10).max(100);

      asserts.assertEquals(schema.parse(50), 50);
      asserts.assertThrows(() => schema.parse(5), GuardianError);
      asserts.assertThrows(() => schema.parse(150), GuardianError);
    });

    it('should validate range (inclusive)', () => {
      const schema = new NumberGuardian().range(10, 100);

      asserts.assertEquals(schema.parse(10), 10);
      asserts.assertEquals(schema.parse(50), 50);
      asserts.assertEquals(schema.parse(100), 100);
      asserts.assertThrows(() => schema.parse(9), GuardianError);
      asserts.assertThrows(() => schema.parse(101), GuardianError);
    });
  });

  describe('sign validations', () => {
    it('should validate positive numbers', () => {
      const schema = new NumberGuardian().positive();

      asserts.assertEquals(schema.parse(1), 1);
      asserts.assertEquals(schema.parse(0.1), 0.1);
      asserts.assertThrows(() => schema.parse(0), GuardianError);
      asserts.assertThrows(() => schema.parse(-1), GuardianError);
    });

    it('should validate negative numbers', () => {
      const schema = new NumberGuardian().negative();

      asserts.assertEquals(schema.parse(-1), -1);
      asserts.assertEquals(schema.parse(-0.1), -0.1);
      asserts.assertThrows(() => schema.parse(0), GuardianError);
      asserts.assertThrows(() => schema.parse(1), GuardianError);
    });
  });

  describe('integer and finite validations', () => {
    it('should validate integers', () => {
      const schema = new NumberGuardian().integer();

      asserts.assertEquals(schema.parse(42), 42);
      asserts.assertEquals(schema.parse(-10), -10);
      asserts.assertEquals(schema.parse(0), 0);
      asserts.assertThrows(() => schema.parse(3.14), GuardianError);
      asserts.assertThrows(() => schema.parse(0.1), GuardianError);
    });

    it('should validate finite numbers', () => {
      const schema = new NumberGuardian().finite();

      asserts.assertEquals(schema.parse(123), 123);
      asserts.assertEquals(schema.parse(-456), -456);
      asserts.assertThrows(() => schema.parse(Infinity), GuardianError);
      asserts.assertThrows(() => schema.parse(-Infinity), GuardianError);
    });

    it('should validate safe integers', () => {
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

  describe('multipleOf validation', () => {
    it('should validate multiples', () => {
      const schema = new NumberGuardian().multipleOf(5);

      asserts.assertEquals(schema.parse(0), 0);
      asserts.assertEquals(schema.parse(5), 5);
      asserts.assertEquals(schema.parse(10), 10);
      asserts.assertEquals(schema.parse(-15), -15);
      asserts.assertThrows(() => schema.parse(3), GuardianError);
      asserts.assertThrows(() => schema.parse(7), GuardianError);
    });

    it('should work with decimal multiples', () => {
      const schema = new NumberGuardian().multipleOf(0.5);

      asserts.assertEquals(schema.parse(1.5), 1.5);
      asserts.assertEquals(schema.parse(2), 2);
      asserts.assertThrows(() => schema.parse(1.3), GuardianError);
    });

    it('handles float divisors that break exact modulo (epsilon)', () => {
      // `0.3 % 0.1` is `0.0999…` in IEEE-754, so the old exact-modulo
      // check rejected this even though 0.3 IS a multiple of 0.1.
      const schema = new NumberGuardian().multipleOf(0.1);
      asserts.assertEquals(schema.parse(0.3), 0.3);
      asserts.assertEquals(schema.parse(0.6), 0.6);
      asserts.assertEquals(schema.parse(1), 1);
      asserts.assertThrows(() => schema.parse(0.35), GuardianError);
    });

    it('throws at construction when divisor is 0 or non-finite', () => {
      // `n % 0` is NaN, which would reject every value — surface it as a
      // config-time programming error instead.
      asserts.assertThrows(
        () => new NumberGuardian().multipleOf(0),
        Error,
        'non-zero finite',
      );
      asserts.assertThrows(
        () => new NumberGuardian().multipleOf(Infinity),
        Error,
        'non-zero finite',
      );
    });
  });

  describe('advanced validations', () => {
    it('should validate odd numbers', () => {
      const schema = new NumberGuardian().odd();

      asserts.assertEquals(schema.parse(1), 1);
      asserts.assertEquals(schema.parse(3), 3);
      asserts.assertEquals(schema.parse(-5), -5);
      asserts.assertThrows(() => schema.parse(2), GuardianError);
      asserts.assertThrows(() => schema.parse(0), GuardianError);
      asserts.assertThrows(() => schema.parse(3.5), GuardianError); // not integer
    });

    it('should validate even numbers', () => {
      const schema = new NumberGuardian().even();

      asserts.assertEquals(schema.parse(0), 0);
      asserts.assertEquals(schema.parse(2), 2);
      asserts.assertEquals(schema.parse(-4), -4);
      asserts.assertThrows(() => schema.parse(1), GuardianError);
      asserts.assertThrows(() => schema.parse(3), GuardianError);
      asserts.assertThrows(() => schema.parse(2.5), GuardianError); // not integer
    });

    it('should validate prime numbers', () => {
      const schema = new NumberGuardian().prime();

      asserts.assertEquals(schema.parse(2), 2);
      asserts.assertEquals(schema.parse(3), 3);
      asserts.assertEquals(schema.parse(5), 5);
      asserts.assertEquals(schema.parse(7), 7);
      asserts.assertEquals(schema.parse(11), 11);
      asserts.assertEquals(schema.parse(13), 13);

      asserts.assertThrows(() => schema.parse(1), GuardianError); // not prime
      asserts.assertThrows(() => schema.parse(4), GuardianError); // not prime
      asserts.assertThrows(() => schema.parse(6), GuardianError); // not prime
      asserts.assertThrows(() => schema.parse(8), GuardianError); // not prime
      asserts.assertThrows(() => schema.parse(9), GuardianError); // not prime
      asserts.assertThrows(() => schema.parse(15), GuardianError); // not prime
      asserts.assertThrows(() => schema.parse(2.5), GuardianError); // not integer
    });

    it('should validate non-zero numbers', () => {
      const schema = new NumberGuardian().nonZero();

      asserts.assertEquals(schema.parse(1), 1);
      asserts.assertEquals(schema.parse(-1), -1);
      asserts.assertEquals(schema.parse(0.1), 0.1);
      asserts.assertEquals(schema.parse(-0.1), -0.1);
      asserts.assertThrows(() => schema.parse(0), GuardianError);
    });

    it('should validate port numbers', () => {
      const schema = new NumberGuardian().validPort();

      asserts.assertEquals(schema.parse(0), 0);
      asserts.assertEquals(schema.parse(80), 80);
      asserts.assertEquals(schema.parse(443), 443);
      asserts.assertEquals(schema.parse(8080), 8080);
      asserts.assertEquals(schema.parse(65535), 65535);

      asserts.assertThrows(() => schema.parse(-1), GuardianError);
      asserts.assertThrows(() => schema.parse(65536), GuardianError);
      asserts.assertThrows(() => schema.parse(80.5), GuardianError); // not integer
    });

    it('should validate timestamp numbers', () => {
      const schema = new NumberGuardian().timestamp();

      const now = Date.now();
      asserts.assertEquals(schema.parse(now), now);
      asserts.assertEquals(schema.parse(0), 0); // Unix epoch
      asserts.assertEquals(schema.parse(1609459200000), 1609459200000); // Jan 1, 2021

      asserts.assertThrows(() => schema.parse(-1), GuardianError); // negative
      asserts.assertThrows(() => schema.parse(3.14), GuardianError); // not integer
    });
  });

  describe('mathematical transformations', () => {
    it('should round numbers', () => {
      const schema = new NumberGuardian().round();

      asserts.assertEquals(schema.parse(3.7), 4);
      asserts.assertEquals(schema.parse(3.2), 3);
      asserts.assertEquals(schema.parse(-2.7), -3);
      asserts.assertEquals(schema.parse(-2.2), -2);
    });

    it('should floor numbers', () => {
      const schema = new NumberGuardian().floor();

      asserts.assertEquals(schema.parse(3.7), 3);
      asserts.assertEquals(schema.parse(3.2), 3);
      asserts.assertEquals(schema.parse(-2.7), -3);
      asserts.assertEquals(schema.parse(-2.2), -3);
    });

    it('should ceil numbers', () => {
      const schema = new NumberGuardian().ceil();

      asserts.assertEquals(schema.parse(3.7), 4);
      asserts.assertEquals(schema.parse(3.2), 4);
      asserts.assertEquals(schema.parse(-2.7), -2);
      asserts.assertEquals(schema.parse(-2.2), -2);
    });

    it('should truncate numbers', () => {
      const schema = new NumberGuardian().trunc();

      asserts.assertEquals(schema.parse(3.7), 3);
      asserts.assertEquals(schema.parse(3.2), 3);
      asserts.assertEquals(schema.parse(-2.7), -2);
      asserts.assertEquals(schema.parse(-2.2), -2);
    });

    it('should get absolute value', () => {
      const schema = new NumberGuardian().abs();

      asserts.assertEquals(schema.parse(5), 5);
      asserts.assertEquals(schema.parse(-5), 5);
      asserts.assertEquals(schema.parse(0), 0);
    });

    it('should negate numbers', () => {
      const schema = new NumberGuardian().negate();

      asserts.assertEquals(schema.parse(5), -5);
      asserts.assertEquals(schema.parse(-3), 3);
      asserts.assertEquals(schema.parse(0), -0);
      asserts.assertEquals(schema.parse(3.14), -3.14);
    });

    it('should clamp numbers to range', () => {
      const schema = new NumberGuardian().clamp(0, 100);

      // Values within range remain unchanged
      asserts.assertEquals(schema.parse(50), 50);
      asserts.assertEquals(schema.parse(0), 0);
      asserts.assertEquals(schema.parse(100), 100);

      // Values outside range get clamped
      asserts.assertEquals(schema.parse(-10), 0); // clamped to min
      asserts.assertEquals(schema.parse(150), 100); // clamped to max
      asserts.assertEquals(schema.parse(-999), 0);
      asserts.assertEquals(schema.parse(999), 100);
    });

    it('should round to fixed decimal places', () => {
      const schema2 = new NumberGuardian().toFixed(2);
      const schema0 = new NumberGuardian().toFixed(0);

      asserts.assertEquals(schema2.parse(3.14159), 3.14);
      asserts.assertEquals(schema2.parse(3.146), 3.15); // rounds up
      asserts.assertEquals(schema2.parse(5), 5);
      asserts.assertEquals(schema2.parse(2.999), 3);

      asserts.assertEquals(schema0.parse(3.14), 3);
      asserts.assertEquals(schema0.parse(3.7), 4);
    });
  });

  describe('type transformations', () => {
    it('should convert number to string', () => {
      const schema = new NumberGuardian().toString();

      asserts.assertEquals(schema.parse(123), '123');
      asserts.assertEquals(schema.parse(3.14), '3.14');
      asserts.assertEquals(schema.parse(-42), '-42');
    });

    it('should convert number to string with radix', () => {
      const schema = new NumberGuardian().toString(16);

      asserts.assertEquals(schema.parse(255), 'ff');
      asserts.assertEquals(schema.parse(16), '10');
    });

    it('should convert number to BigInt', () => {
      const schema = new NumberGuardian().toBigInt();

      asserts.assertEquals(schema.parse(123), 123n);
      asserts.assertEquals(schema.parse(-42), -42n);
      asserts.assertThrows(() => schema.parse(3.14), GuardianError);
    });

    it('should convert number to Date', () => {
      const schema = new NumberGuardian().toDate();
      const timestamp = Date.now();

      const date = schema.parse(timestamp);
      asserts.assert(date instanceof Date);
      asserts.assertEquals(date.getTime(), timestamp);

      asserts.assertThrows(() => schema.parse(Number.NaN), GuardianError);
    });
  });

  describe('chained validations', () => {
    it('should chain multiple validations', () => {
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

    it('should chain transformations', () => {
      const schema = new NumberGuardian().abs().round();

      asserts.assertEquals(schema.parse(-3.7), 4);
      asserts.assertEquals(schema.parse(2.2), 2);
    });
  });

  describe('safe parsing', () => {
    it('should return success result for valid input', () => {
      const schema = new NumberGuardian().positive();
      const result = schema.safeParse(42);

      const [error, data] = result;
      asserts.assertEquals(error, null);
      asserts.assertEquals(data, 42);
    });

    it('should return error result for invalid input', () => {
      const schema = new NumberGuardian().positive();
      const result = schema.safeParse(-1);

      const [error, data] = result;
      asserts.assert(error instanceof GuardianError);
      asserts.assertEquals(data, undefined);
    });
  });

  describe('error handling', () => {
    it('should provide detailed error messages', () => {
      const schema = new NumberGuardian().min(10);

      asserts.assertThrows(
        () => schema.parse(5),
        GuardianError,
        'Number must be at least 10',
      );
    });

    it('should support custom error messages', () => {
      const schema = new NumberGuardian().min(10, 'Too small!');

      asserts.assertThrows(
        () => schema.parse(5),
        GuardianError,
        'Too small!',
      );
    });
  });

  describe('nullable and optional', () => {
    it('should handle nullable numbers', () => {
      const schema = new NumberGuardian().positive().nullable();

      asserts.assertEquals(schema.parse(5), 5);
      asserts.assertEquals(schema.parse(null), null);
      asserts.assertThrows(() => schema.parse(undefined), GuardianError); // undefined not allowed in nullable
      asserts.assertThrows(() => schema.parse(-1), GuardianError); // still validates positive
      // Coerce-by-default: '123' coerces to 123 and passes positive().
      asserts.assertEquals(schema.parse('123'), 123);
      // Non-coercible inputs still throw.
      asserts.assertThrows(() => schema.parse('abc'), GuardianError);
      asserts.assertThrows(() => schema.parse({}), GuardianError);
    });

    it('should handle optional numbers', () => {
      const schema = new NumberGuardian().positive().optional();

      asserts.assertEquals(schema.parse(5), 5);
      asserts.assertEquals(schema.parse(undefined), undefined);
      asserts.assertThrows(() => schema.parse(null), GuardianError); // null not allowed in optional
      asserts.assertThrows(() => schema.parse(-1), GuardianError); // still validates positive
    });

    it('should handle optional with default', () => {
      const schema = new NumberGuardian().positive().optional(42);

      asserts.assertEquals(schema.parse(5), 5);
      asserts.assertEquals(schema.parse(undefined), 42);
      asserts.assertThrows(() => schema.parse(null), GuardianError);
      asserts.assertThrows(() => schema.parse(-1), GuardianError);
    });

    it('should handle optional with function default', () => {
      let callCount = 0;
      const schema = new NumberGuardian().positive().optional(() => {
        callCount++;
        return 100;
      });

      asserts.assertEquals(schema.parse(5), 5);
      asserts.assertEquals(callCount, 0); // function not called for valid input

      asserts.assertEquals(schema.parse(undefined), 100);
      asserts.assertEquals(callCount, 1); // function called for undefined

      asserts.assertEquals(schema.parse(undefined), 100);
      asserts.assertEquals(callCount, 2); // function called again
    });

    it('should handle nullable and optional separately', () => {
      // Test nullable
      const nullableSchema = new NumberGuardian().positive().nullable();
      asserts.assertEquals(nullableSchema.parse(5), 5);
      asserts.assertEquals(nullableSchema.parse(null), null);
      asserts.assertThrows(() => nullableSchema.parse(-1), GuardianError);

      // Test optional
      const optionalSchema = new NumberGuardian().positive().optional(99);
      asserts.assertEquals(optionalSchema.parse(5), 5);
      asserts.assertEquals(optionalSchema.parse(undefined), 99);
      asserts.assertThrows(() => optionalSchema.parse(-1), GuardianError);
    });

    it('should handle nullable().optional() chaining', () => {
      const schema = new NumberGuardian().positive().nullable().optional(100);

      asserts.assertEquals(schema.parse(5), 5); // valid number
      asserts.assertEquals(schema.parse(null), null); // null preserved
      asserts.assertEquals(schema.parse(undefined), 100); // default used
      asserts.assertThrows(() => schema.parse(-1), GuardianError); // validation still works
    });

    it('should handle optional().nullable() chaining', () => {
      const schema = new NumberGuardian().positive().optional(100).nullable();

      asserts.assertEquals(schema.parse(5), 5); // valid number
      asserts.assertEquals(schema.parse(null), null); // null preserved
      asserts.assertEquals(schema.parse(undefined), 100); // default used
      asserts.assertThrows(() => schema.parse(-1), GuardianError); // validation still works
    });

    it('should work with transformations', () => {
      // Test nullable with transformations
      const nullableSchema = new NumberGuardian().abs().nullable();
      asserts.assertEquals(nullableSchema.parse(-5), 5); // abs transformation applied
      asserts.assertEquals(nullableSchema.parse(null), null);

      // Test optional with transformations
      const optionalSchema = new NumberGuardian().abs().optional(10);
      asserts.assertEquals(optionalSchema.parse(-5), 5); // abs transformation applied
      asserts.assertEquals(optionalSchema.parse(undefined), 10);
    });

    it('should work with validations', () => {
      const schema = new NumberGuardian().range(1, 100).nullable();

      asserts.assertEquals(schema.parse(50), 50);
      asserts.assertEquals(schema.parse(null), null);
      asserts.assertThrows(() => schema.parse(0), GuardianError); // fails range validation
      asserts.assertThrows(() => schema.parse(101), GuardianError); // fails range validation
    });
  });

  describe('complex chaining scenarios', () => {
    it('should chain new methods with existing ones', () => {
      const schema = new NumberGuardian()
        .range(1, 1000)
        .odd()
        .prime()
        .nonZero();

      asserts.assertEquals(schema.parse(3), 3);
      asserts.assertEquals(schema.parse(5), 5);
      asserts.assertEquals(schema.parse(7), 7);

      asserts.assertThrows(() => schema.parse(2), GuardianError); // even, not odd
      asserts.assertThrows(() => schema.parse(9), GuardianError); // not prime
      asserts.assertThrows(() => schema.parse(0), GuardianError); // not in range
    });

    it('should chain transformations with validations', () => {
      const schema = new NumberGuardian()
        .abs() // transform: make positive
        .clamp(0, 100) // transform: limit to 0-100
        .toFixed(1) // transform: round to 1 decimal
        .positive(); // validate: must be > 0

      asserts.assertEquals(schema.parse(-50.789), 50.8); // abs -> clamp -> toFixed
      asserts.assertEquals(schema.parse(150.234), 100); // clamp -> toFixed
      asserts.assertEquals(schema.parse(25.666), 25.7); // toFixed

      // The clamp ensures we never get 0, so positive validation always passes
      // unless input was exactly 0 after abs
      const zeroSchema = new NumberGuardian().abs().positive();
      asserts.assertThrows(() => zeroSchema.parse(0), GuardianError);
    });
  });

  describe('new validation methods', () => {
    it('power validation', () => {
      const schema = new NumberGuardian().power();

      // Perfect powers (any base)
      asserts.assertEquals(schema.parse(1), 1); // 1 is considered a perfect power (1^n for any n)
      asserts.assertEquals(schema.parse(4), 4); // 2^2
      asserts.assertEquals(schema.parse(8), 8); // 2^3
      asserts.assertEquals(schema.parse(9), 9); // 3^2
      asserts.assertEquals(schema.parse(16), 16); // 2^4 or 4^2

      // Non-perfect powers
      asserts.assertThrows(() => schema.parse(5), GuardianError);
      asserts.assertThrows(() => schema.parse(6), GuardianError);
      asserts.assertThrows(() => schema.parse(7), GuardianError);

      // Invalid inputs
      asserts.assertThrows(() => schema.parse(3.14), GuardianError);
      asserts.assertThrows(() => schema.parse(-4), GuardianError);
      asserts.assertThrows(() => schema.parse(0), GuardianError);
    });

    it('power validation with specific base', () => {
      const schema = new NumberGuardian().power(2);

      asserts.assertEquals(schema.parse(4), 4); // 2^2
      asserts.assertEquals(schema.parse(8), 8); // 2^3
      asserts.assertEquals(schema.parse(16), 16); // 2^4

      asserts.assertThrows(() => schema.parse(9), GuardianError); // 3^2, not 2^x
      asserts.assertThrows(() => schema.parse(5), GuardianError);
    });

    it('between validation', () => {
      const schema = new NumberGuardian().between(5, 10);

      asserts.assertEquals(schema.parse(5), 5);
      asserts.assertEquals(schema.parse(7.5), 7.5);
      asserts.assertEquals(schema.parse(10), 10);

      asserts.assertThrows(() => schema.parse(4.9), GuardianError);
      asserts.assertThrows(() => schema.parse(10.1), GuardianError);
    });

    it('between validation exclusive', () => {
      const schema = new NumberGuardian().between(5, 10, false);

      asserts.assertEquals(schema.parse(7.5), 7.5);
      asserts.assertEquals(schema.parse(6), 6);

      asserts.assertThrows(() => schema.parse(5), GuardianError); // exclusive
      asserts.assertThrows(() => schema.parse(10), GuardianError); // exclusive
      asserts.assertThrows(() => schema.parse(4.9), GuardianError);
    });

    it('latitude validation', () => {
      const schema = new NumberGuardian().latitude();

      asserts.assertEquals(schema.parse(0), 0);
      asserts.assertEquals(schema.parse(45.5), 45.5);
      asserts.assertEquals(schema.parse(-90), -90);
      asserts.assertEquals(schema.parse(90), 90);

      asserts.assertThrows(() => schema.parse(90.1), GuardianError);
      asserts.assertThrows(() => schema.parse(-90.1), GuardianError);
      asserts.assertThrows(() => schema.parse(180), GuardianError);
    });

    it('longitude validation', () => {
      const schema = new NumberGuardian().longitude();

      asserts.assertEquals(schema.parse(0), 0);
      asserts.assertEquals(schema.parse(45.5), 45.5);
      asserts.assertEquals(schema.parse(-180), -180);
      asserts.assertEquals(schema.parse(180), 180);

      asserts.assertThrows(() => schema.parse(180.1), GuardianError);
      asserts.assertThrows(() => schema.parse(-180.1), GuardianError);
      asserts.assertThrows(() => schema.parse(200), GuardianError);
    });
  });

  describe('new transformation methods', () => {
    it('formatCurrency returns a localized currency string', () => {
      const schema = new NumberGuardian().formatCurrency();

      const result = schema.parse(1234.56);
      asserts.assertEquals(typeof result, 'string');
      asserts.assertEquals(result, '$1,234.56');
      // Output type is a string — the emitted schema must agree.
      asserts.assertEquals(schema.toOpenAPI().type, 'string');
    });

    it('formatCurrency with different locale', () => {
      const schema = new NumberGuardian().formatCurrency('de-DE', 'EUR');

      const result = schema.parse(1234.56) as string;
      asserts.assertEquals(typeof result, 'string');
      // de-DE groups with '.' and uses ',' as the decimal separator.
      // Assert the grouped amount rather than exact symbol spacing,
      // which varies with the runtime's ICU version.
      asserts.assertStringIncludes(result, '1.234,56');
      asserts.assertStringIncludes(result, '€');
    });

    it('formatPercentage transformation', () => {
      const schema = new NumberGuardian().formatPercentage();

      asserts.assertEquals(schema.parse(0.1234), 12.34);
      asserts.assertEquals(schema.parse(0.5), 50);
      asserts.assertEquals(schema.parse(1), 100);
    });

    it('formatPercentage with custom decimals', () => {
      const schema = new NumberGuardian().formatPercentage(0);

      asserts.assertEquals(schema.parse(0.1234), 12);
      asserts.assertEquals(schema.parse(0.5678), 57);
    });

    it('addCommas groups thousands into a string', () => {
      const schema = new NumberGuardian().addCommas();

      asserts.assertEquals(schema.parse(1234567), '1,234,567');
      asserts.assertEquals(schema.parse(1234), '1,234');
      asserts.assertEquals(schema.parse(1234567.89), '1,234,567.89');
      asserts.assertEquals(schema.toOpenAPI().type, 'string');
    });

    it('padZeros left-pads the digits into a string', () => {
      const schema = new NumberGuardian().padZeros(5);

      asserts.assertEquals(schema.parse(123), '00123');
      // Sign is preserved and does not count toward the length.
      asserts.assertEquals(schema.parse(-123), '-00123');
      // Longer than the pad length is returned unpadded.
      asserts.assertEquals(schema.parse(123456), '123456');
      asserts.assertEquals(schema.toOpenAPI().type, 'string');
    });

    it('padZeros with different lengths', () => {
      const shortSchema = new NumberGuardian().padZeros(3);
      const longSchema = new NumberGuardian().padZeros(8);

      asserts.assertEquals(shortSchema.parse(12), '012');
      asserts.assertEquals(longSchema.parse(123), '00000123');
    });
  });

  describe('nullable and optional scenarios for new methods', () => {
    it('nullable power validation', () => {
      const schema = new NumberGuardian().power().nullable();

      asserts.assertEquals(schema.parse(null), null);
      asserts.assertEquals(schema.parse(4), 4);
      asserts.assertThrows(() => schema.parse(undefined), GuardianError);
      asserts.assertThrows(() => schema.parse(5), GuardianError);
    });

    it('optional between validation', () => {
      const schema = new NumberGuardian().between(5, 10).optional();

      asserts.assertEquals(schema.parse(undefined), undefined);
      asserts.assertEquals(schema.parse(7), 7);
      asserts.assertThrows(() => schema.parse(null), GuardianError);
      asserts.assertThrows(() => schema.parse(15), GuardianError);
    });

    it('optional with default formatPercentage', () => {
      const schema = new NumberGuardian().formatPercentage().optional(50);

      asserts.assertEquals(schema.parse(undefined), 5000); // 50 * 100
      asserts.assertEquals(schema.parse(0.25), 25);
    });

    it('nullable latitude validation', () => {
      const schema = new NumberGuardian().latitude().nullable();

      asserts.assertEquals(schema.parse(null), null);
      asserts.assertEquals(schema.parse(45.5), 45.5);
      asserts.assertThrows(() => schema.parse(undefined), GuardianError);
      asserts.assertThrows(() => schema.parse(91), GuardianError);
    });
  });

  describe('chaining with new methods', () => {
    it('complex validation chain', () => {
      const schema = new NumberGuardian()
        .positive()
        .between(1, 1000)
        .integer()
        .power(2);

      asserts.assertEquals(schema.parse(4), 4);
      asserts.assertEquals(schema.parse(16), 16);
      asserts.assertEquals(schema.parse(256), 256);

      asserts.assertThrows(() => schema.parse(-4), GuardianError); // negative
      asserts.assertThrows(() => schema.parse(3), GuardianError); // not power of 2
      asserts.assertThrows(() => schema.parse(1024), GuardianError); // > 1000
      asserts.assertThrows(() => schema.parse(4.5), GuardianError); // not integer
    });

    it('transformation chain', () => {
      const schema = new NumberGuardian()
        .abs()
        .clamp(0, 100)
        .formatPercentage(1);

      asserts.assertEquals(schema.parse(-0.123), 12.3);
      asserts.assertEquals(schema.parse(0.567), 56.7);
      asserts.assertEquals(schema.parse(2), 200); // clamped to 100, then 200%
    });

    it('geographic coordinate validation', () => {
      const latSchema = new NumberGuardian().latitude().toFixed(6);
      const lngSchema = new NumberGuardian().longitude().toFixed(6);

      asserts.assertEquals(latSchema.parse(45.123456789), 45.123457);
      asserts.assertEquals(lngSchema.parse(-122.123456789), -122.123457);

      asserts.assertThrows(() => latSchema.parse(91), GuardianError);
      asserts.assertThrows(() => lngSchema.parse(181), GuardianError);
    });
  });

  // ============================================================================
  // COMPREHENSIVE EDGE CASE TESTS - Added for Production Readiness
  // ============================================================================

  describe('Metadata and describe', () => {
    it('should set metadata via describe', () => {
      const guard = new NumberGuardian().describe({
        title: 'Age',
        description: 'User age',
      });

      asserts.assertEquals(guard.metaData?.title, 'Age');
      asserts.assertEquals(guard.metaData?.description, 'User age');
    });

    it('should not override protected flags with describe', () => {
      const guard = new NumberGuardian()
        .nullable()
        .describe({
          title: 'Test',
          isNullable: false as any,
        });

      asserts.assertEquals(guard.parse(null), null);
    });

    it('should merge metadata across describe calls', () => {
      const guard = new NumberGuardian();

      const withTitle = guard.describe({ title: 'Step 1' });
      const withDesc = withTitle.describe({ description: 'Number field' });

      asserts.assertEquals(withDesc.metaData?.title, 'Step 1');
      asserts.assertEquals(withDesc.metaData?.description, 'Number field');
    });
  });

  describe('Special number values comprehensive', () => {
    it('should handle NaN separately', () => {
      const guard = new NumberGuardian();
      asserts.assertThrows(() => guard.parse(Number.NaN), GuardianError);
    });

    it('should reject Infinity (default validation requires finite)', () => {
      const guard = new NumberGuardian();
      asserts.assertThrows(() => guard.parse(Infinity), GuardianError);
      asserts.assertThrows(() => guard.parse(-Infinity), GuardianError);
    });

    it('should handle zero edge cases', () => {
      const guard = new NumberGuardian();
      asserts.assertEquals(guard.parse(0), 0);
      asserts.assertEquals(guard.parse(-0), -0);
      asserts.assert(Object.is(guard.parse(-0), -0));
    });

    it('should handle very small numbers', () => {
      const guard = new NumberGuardian();
      asserts.assertEquals(guard.parse(Number.EPSILON), Number.EPSILON);
      asserts.assertEquals(guard.parse(Number.MIN_VALUE), Number.MIN_VALUE);
    });

    it('should handle very large numbers', () => {
      const guard = new NumberGuardian();
      asserts.assertEquals(guard.parse(Number.MAX_VALUE), Number.MAX_VALUE);
      asserts.assertEquals(
        guard.parse(Number.MAX_SAFE_INTEGER),
        Number.MAX_SAFE_INTEGER,
      );
    });

    it('should handle floating point precision', () => {
      const guard = new NumberGuardian();
      const result = guard.parse(0.1 + 0.2);
      // Known floating point issue
      asserts.assert(Math.abs(result - 0.3) < Number.EPSILON);
    });
  });

  describe('SafeParse comprehensive', () => {
    it('should handle safeParse with valid numbers', () => {
      const guard = new NumberGuardian();

      const [error, data] = guard.safeParse(123);
      asserts.assertEquals(error, null);
      asserts.assertEquals(data, 123);
    });

    it('should handle safeParse with invalid numbers', () => {
      const guard = new NumberGuardian();

      const [error, data] = guard.safeParse('not a number');
      asserts.assertInstanceOf(error, GuardianError);
      asserts.assertEquals(data, undefined);
    });

    it('should handle safeParse with constraints', () => {
      const guard = new NumberGuardian().min(10);

      const [error1, data1] = guard.safeParse(20);
      asserts.assertEquals(error1, null);
      asserts.assertEquals(data1, 20);

      const [error2, data2] = guard.safeParse(5);
      asserts.assertInstanceOf(error2, GuardianError);
      asserts.assertEquals(data2, undefined);
    });

    it('should handle safeParse with transformations', () => {
      const guard = new NumberGuardian().process((val) => val * 2);

      const [error, data] = guard.safeParse(5);
      asserts.assertEquals(error, null);
      asserts.assertEquals(data, 10);
    });
  });

  describe('Error scenarios comprehensive', () => {
    it('should reject non-coercible types', () => {
      const guard = new NumberGuardian();

      // Coerce-by-default: these flow through.
      asserts.assertEquals(guard.parse('123'), 123);
      asserts.assertEquals(guard.parse(true), 1);

      // Genuinely non-coercible inputs still throw.
      asserts.assertThrows(() => guard.parse({}), GuardianError);
      asserts.assertThrows(() => guard.parse([]), GuardianError);
      asserts.assertThrows(() => guard.parse(null), GuardianError);
      asserts.assertThrows(() => guard.parse('not-a-number'), GuardianError);
    });

    it('should provide clear error messages for type errors', () => {
      const guard = new NumberGuardian();

      try {
        guard.parse('not a number');
        asserts.fail('Should have thrown');
      } catch (error) {
        asserts.assertInstanceOf(error, GuardianError);
        asserts.assert(
          error.message.includes('number') || error.message.includes('Number'),
        );
      }
    });

    it('should provide clear error messages for range violations', () => {
      const guard = new NumberGuardian().min(10).max(100);

      try {
        guard.parse(5);
        asserts.fail('Should have thrown');
      } catch (error) {
        asserts.assertInstanceOf(error, GuardianError);
        asserts.assert(
          error.message.includes('10') || error.message.includes('min'),
        );
      }
    });

    it('should provide clear error messages for integer violations', () => {
      const guard = new NumberGuardian().integer();

      try {
        guard.parse(3.14);
        asserts.fail('Should have thrown');
      } catch (error) {
        asserts.assertInstanceOf(error, GuardianError);
        asserts.assert(
          error.message.includes('integer') || error.message.includes('whole'),
        );
      }
    });
  });

  describe('Async parseAsync comprehensive', () => {
    it('should handle parseAsync with sync operations', async () => {
      const guard = new NumberGuardian();

      const result = await guard.parseAsync(123);
      asserts.assertEquals(result, 123);
    });

    it('should handle parseAsync with async transformations', async () => {
      const guard = new NumberGuardian().process(async (val) => {
        await new Promise((resolve) => setTimeout(resolve, 1));
        return val * 3;
      });

      const result = await guard.parseAsync(10);
      asserts.assertEquals(result, 30);
    });

    it('should handle parseAsync errors', async () => {
      const guard = new NumberGuardian().min(10);

      let caught = false;
      try {
        await guard.parseAsync(5);
      } catch (error) {
        caught = true;
        asserts.assertInstanceOf(error, GuardianError);
      }
      asserts.assert(caught);
    });
  });

  describe('OpenAPI generation comprehensive', () => {
    it('should generate correct OpenAPI schema', () => {
      const guard = new NumberGuardian();
      const schema = guard.toOpenAPI();

      asserts.assertEquals(schema.type, 'number');
    });

    it('should include min/max in OpenAPI', () => {
      const guard = new NumberGuardian().min(10).max(100);
      const schema = guard.toOpenAPI();

      asserts.assertEquals(schema.minimum, 10);
      asserts.assertEquals(schema.maximum, 100);
    });

    it('should indicate integer type in OpenAPI', () => {
      const guard = new NumberGuardian().integer();
      const schema = guard.toOpenAPI();

      // Integer constraint is tracked but type remains 'number'
      asserts.assertEquals(schema.type, 'number');
      // Can verify integer validation works
      asserts.assertEquals(guard.parse(5), 5);
      asserts.assertThrows(() => guard.parse(5.5), GuardianError);
    });

    it('should include metadata in OpenAPI schema', () => {
      const guard = new NumberGuardian().describe({
        title: 'Quantity',
        description: 'Item quantity',
        default: 1,
      });

      const schema = guard.toOpenAPI();

      asserts.assertEquals(schema.title, 'Quantity');
      asserts.assertEquals(schema.description, 'Item quantity');
      asserts.assertEquals(schema.default, 1);
    });

    it('should handle nullable in OpenAPI', () => {
      const guard = new NumberGuardian().nullable();
      const schema = guard.toOpenAPI();

      asserts.assertEquals(schema.nullable, true);
    });

    it('should handle multipleOf in OpenAPI', () => {
      const guard = new NumberGuardian().multipleOf(5);
      const schema = guard.toOpenAPI();

      asserts.assertEquals(schema.multipleOf, 5);
    });
  });

  describe('Complex chaining scenarios', () => {
    it('should handle all constraints together', () => {
      const guard = new NumberGuardian()
        .min(0)
        .max(100)
        .integer()
        .multipleOf(5)
        .positive();

      asserts.assertEquals(guard.parse(5), 5);
      asserts.assertEquals(guard.parse(50), 50);
      asserts.assertThrows(() => guard.parse(0), GuardianError); // not positive
      asserts.assertThrows(() => guard.parse(3), GuardianError); // not multiple of 5
      asserts.assertThrows(() => guard.parse(105), GuardianError); // > 100
    });

    it('should handle transformations after validations', () => {
      const guard = new NumberGuardian()
        .positive()
        .integer()
        .process((val) => val * 2)
        .process((val) => val + 10);

      asserts.assertEquals(guard.parse(5), 20); // 5 * 2 + 10
    });
  });

  describe('Immutability of metadata constraints (regression)', () => {
    it('.integer() must not mutate the source guardian metadata', () => {
      // Regression: a previous implementation set
      // `this._metaData.format = 'integer'` before calling
      // `this.process(...)`, leaking the constraint back to the
      // caller's variable. The new instance must carry the format;
      // the source must not.
      const base = new NumberGuardian();
      const integers = base.integer();

      asserts.assertEquals(integers.metaData?.format, 'integer');
      asserts.assertEquals(base.metaData?.format, undefined);
    });

    it('.multipleOf() must not mutate the source guardian metadata', () => {
      const base = new NumberGuardian();
      const ofThree = base.multipleOf(3);

      asserts.assertEquals(ofThree.metaData?.multipleOf, 3);
      asserts.assertEquals(base.metaData?.multipleOf, undefined);
    });
  });

  describe('unixSeconds / unixMillis', () => {
    it('unixSeconds accepts seconds-scale integers', () => {
      const guard = new NumberGuardian().unixSeconds();
      asserts.assertEquals(guard.parse(0), 0);
      asserts.assertEquals(guard.parse(1700000000), 1700000000);
    });

    it('unixSeconds rejects millis-scale or negative values', () => {
      const guard = new NumberGuardian().unixSeconds();
      // Millis-scale (13-digit) is out of bounds.
      asserts.assertThrows(() => guard.parse(1700000000000), GuardianError);
      asserts.assertThrows(() => guard.parse(-1), GuardianError);
      asserts.assertThrows(() => guard.parse(1.5), GuardianError);
    });

    it('unixMillis accepts millis-scale integers in modern range', () => {
      const guard = new NumberGuardian().unixMillis();
      const now = Date.now();
      asserts.assertEquals(guard.parse(now), now);
      asserts.assertEquals(guard.parse(1700000000000), 1700000000000);
    });

    it('unixMillis rejects seconds-scale values (likely a unit confusion)', () => {
      const guard = new NumberGuardian().unixMillis();
      // Seconds-scale (10-digit) is below the lower bound — it'd be
      // before year 2001 if interpreted as ms.
      asserts.assertThrows(() => guard.parse(1700000000), GuardianError);
      asserts.assertThrows(() => guard.parse(0), GuardianError);
    });

    it('sets the format hint on the schema', () => {
      asserts.assertEquals(
        new NumberGuardian().unixSeconds().toOpenAPI().format,
        'unix-seconds',
      );
      asserts.assertEquals(
        new NumberGuardian().unixMillis().toOpenAPI().format,
        'unix-millis',
      );
    });
  });

  describe('percentage / probability / port / fullYear / bps / naturalNumber / bigDecimal / evenlyDivisible', () => {
    it('percentage: 0..100 by default', () => {
      const guard = new NumberGuardian().percentage();
      asserts.assertEquals(guard.parse(50), 50);
      asserts.assertEquals(guard.parse(0), 0);
      asserts.assertEquals(guard.parse(100), 100);
      asserts.assertThrows(() => guard.parse(150), GuardianError);
      asserts.assertThrows(() => guard.parse(-1), GuardianError);
    });

    it('percentage { allowOver: true } allows > 100', () => {
      const guard = new NumberGuardian().percentage({ allowOver: true });
      asserts.assertEquals(guard.parse(150), 150);
      asserts.assertThrows(() => guard.parse(-1), GuardianError);
    });

    it('probability: 0..1 inclusive', () => {
      const guard = new NumberGuardian().probability();
      asserts.assertEquals(guard.parse(0.5), 0.5);
      asserts.assertEquals(guard.parse(1), 1);
      asserts.assertThrows(() => guard.parse(1.1), GuardianError);
    });

    it('port: alias of validPort (0..65535)', () => {
      const guard = new NumberGuardian().port();
      asserts.assertEquals(guard.parse(8080), 8080);
      asserts.assertEquals(guard.parse(0), 0);
      asserts.assertEquals(guard.parse(65535), 65535);
      asserts.assertThrows(() => guard.parse(65536), GuardianError);
      asserts.assertThrows(() => guard.parse(-1), GuardianError);
    });

    it('fullYear: default 1900..2099', () => {
      const guard = new NumberGuardian().fullYear();
      asserts.assertEquals(guard.parse(2026), 2026);
      asserts.assertThrows(() => guard.parse(1899), GuardianError);
    });

    it('fullYear honours custom min/max', () => {
      const guard = new NumberGuardian().fullYear({ min: 2000, max: 2100 });
      asserts.assertEquals(guard.parse(2050), 2050);
      asserts.assertThrows(() => guard.parse(1999), GuardianError);
    });

    it('bps: 0..10000', () => {
      const guard = new NumberGuardian().bps();
      asserts.assertEquals(guard.parse(2500), 2500);
      asserts.assertThrows(() => guard.parse(10001), GuardianError);
    });

    it('naturalNumber: non-negative integer', () => {
      const guard = new NumberGuardian().naturalNumber();
      asserts.assertEquals(guard.parse(0), 0);
      asserts.assertEquals(guard.parse(42), 42);
      asserts.assertThrows(() => guard.parse(-1), GuardianError);
      asserts.assertThrows(() => guard.parse(1.5), GuardianError);
    });

    it('bigDecimal: enforces exact scale', () => {
      const guard = new NumberGuardian().bigDecimal({ scale: 2 });
      asserts.assertEquals(guard.parse(19.99), 19.99);
      asserts.assertEquals(guard.parse(20), 20);
      asserts.assertThrows(() => guard.parse(19.999), GuardianError);
    });

    it('bigDecimal: enforces precision when provided', () => {
      const guard = new NumberGuardian().bigDecimal({
        scale: 2,
        precision: 4,
      });
      asserts.assertEquals(guard.parse(99.99), 99.99);
      asserts.assertThrows(() => guard.parse(999.99), GuardianError); // 5 digits
    });

    it('evenlyDivisible: must be a multiple of every divisor', () => {
      const guard = new NumberGuardian().evenlyDivisible([2, 3]);
      asserts.assertEquals(guard.parse(12), 12);
      asserts.assertEquals(guard.parse(6), 6);
      asserts.assertThrows(() => guard.parse(8), GuardianError); // not /3
    });

    it('evenlyDivisible throws on empty divisor list', () => {
      asserts.assertThrows(() => new NumberGuardian().evenlyDivisible([]));
    });
  });
});
