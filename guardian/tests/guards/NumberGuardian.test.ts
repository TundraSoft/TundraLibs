import * as asserts from "$asserts";
import { GuardianError, NumberGuardian } from "../../mod.ts";

Deno.test("guardian.NumberGuardian", async (t) => {
  await t.step("basic functionality", async (t) => {
    await t.step("should validate number type", () => {
      const schema = new NumberGuardian();

      asserts.assertEquals(schema.parse(123), 123);
      asserts.assertEquals(schema.parse(3.14), 3.14);
      asserts.assertEquals(schema.parse(-42), -42);
      asserts.assertEquals(schema.parse(0), 0);

      asserts.assertThrows(() => schema.parse("123"), GuardianError);
      asserts.assertThrows(() => schema.parse(null), GuardianError);
      asserts.assertThrows(() => schema.parse(undefined), GuardianError);
      asserts.assertThrows(() => schema.parse(true), GuardianError);
    });

    await t.step("should reject NaN", () => {
      const schema = new NumberGuardian();
      asserts.assertThrows(() => schema.parse(NaN), GuardianError);
    });

    await t.step("should accept Infinity", () => {
      const schema = new NumberGuardian();
      asserts.assertEquals(schema.parse(Infinity), Infinity);
      asserts.assertEquals(schema.parse(-Infinity), -Infinity);
    });
  });

  await t.step("range validations", async (t) => {
    await t.step("should validate minimum value", () => {
      const schema = new NumberGuardian().min(10);

      asserts.assertEquals(schema.parse(10), 10);
      asserts.assertEquals(schema.parse(15), 15);
      asserts.assertThrows(() => schema.parse(5), GuardianError);
      asserts.assertThrows(() => schema.parse(-5), GuardianError);
    });

    await t.step("should validate maximum value", () => {
      const schema = new NumberGuardian().max(100);

      asserts.assertEquals(schema.parse(100), 100);
      asserts.assertEquals(schema.parse(50), 50);
      asserts.assertThrows(() => schema.parse(101), GuardianError);
      asserts.assertThrows(() => schema.parse(200), GuardianError);
    });

    await t.step("should combine min and max", () => {
      const schema = new NumberGuardian().min(10).max(100);

      asserts.assertEquals(schema.parse(50), 50);
      asserts.assertThrows(() => schema.parse(5), GuardianError);
      asserts.assertThrows(() => schema.parse(150), GuardianError);
    });

    await t.step("should validate range (inclusive)", () => {
      const schema = new NumberGuardian().range(10, 100);

      asserts.assertEquals(schema.parse(10), 10);
      asserts.assertEquals(schema.parse(50), 50);
      asserts.assertEquals(schema.parse(100), 100);
      asserts.assertThrows(() => schema.parse(9), GuardianError);
      asserts.assertThrows(() => schema.parse(101), GuardianError);
    });
  });

  await t.step("sign validations", async (t) => {
    await t.step("should validate positive numbers", () => {
      const schema = new NumberGuardian().positive();

      asserts.assertEquals(schema.parse(1), 1);
      asserts.assertEquals(schema.parse(0.1), 0.1);
      asserts.assertThrows(() => schema.parse(0), GuardianError);
      asserts.assertThrows(() => schema.parse(-1), GuardianError);
    });

    await t.step("should validate negative numbers", () => {
      const schema = new NumberGuardian().negative();

      asserts.assertEquals(schema.parse(-1), -1);
      asserts.assertEquals(schema.parse(-0.1), -0.1);
      asserts.assertThrows(() => schema.parse(0), GuardianError);
      asserts.assertThrows(() => schema.parse(1), GuardianError);
    });
  });

  await t.step("integer and finite validations", async (t) => {
    await t.step("should validate integers", () => {
      const schema = new NumberGuardian().integer();

      asserts.assertEquals(schema.parse(42), 42);
      asserts.assertEquals(schema.parse(-10), -10);
      asserts.assertEquals(schema.parse(0), 0);
      asserts.assertThrows(() => schema.parse(3.14), GuardianError);
      asserts.assertThrows(() => schema.parse(0.1), GuardianError);
    });

    await t.step("should validate finite numbers", () => {
      const schema = new NumberGuardian().finite();

      asserts.assertEquals(schema.parse(123), 123);
      asserts.assertEquals(schema.parse(-456), -456);
      asserts.assertThrows(() => schema.parse(Infinity), GuardianError);
      asserts.assertThrows(() => schema.parse(-Infinity), GuardianError);
    });

    await t.step("should validate safe integers", () => {
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

  await t.step("multipleOf validation", async (t) => {
    await t.step("should validate multiples", () => {
      const schema = new NumberGuardian().multipleOf(5);

      asserts.assertEquals(schema.parse(0), 0);
      asserts.assertEquals(schema.parse(5), 5);
      asserts.assertEquals(schema.parse(10), 10);
      asserts.assertEquals(schema.parse(-15), -15);
      asserts.assertThrows(() => schema.parse(3), GuardianError);
      asserts.assertThrows(() => schema.parse(7), GuardianError);
    });

    await t.step("should work with decimal multiples", () => {
      const schema = new NumberGuardian().multipleOf(0.5);

      asserts.assertEquals(schema.parse(1.5), 1.5);
      asserts.assertEquals(schema.parse(2.0), 2.0);
      asserts.assertThrows(() => schema.parse(1.3), GuardianError);
    });
  });

  await t.step("advanced validations", async (t) => {
    await t.step("should validate odd numbers", () => {
      const schema = new NumberGuardian().odd();

      asserts.assertEquals(schema.parse(1), 1);
      asserts.assertEquals(schema.parse(3), 3);
      asserts.assertEquals(schema.parse(-5), -5);
      asserts.assertThrows(() => schema.parse(2), GuardianError);
      asserts.assertThrows(() => schema.parse(0), GuardianError);
      asserts.assertThrows(() => schema.parse(3.5), GuardianError); // not integer
    });

    await t.step("should validate even numbers", () => {
      const schema = new NumberGuardian().even();

      asserts.assertEquals(schema.parse(0), 0);
      asserts.assertEquals(schema.parse(2), 2);
      asserts.assertEquals(schema.parse(-4), -4);
      asserts.assertThrows(() => schema.parse(1), GuardianError);
      asserts.assertThrows(() => schema.parse(3), GuardianError);
      asserts.assertThrows(() => schema.parse(2.5), GuardianError); // not integer
    });

    await t.step("should validate prime numbers", () => {
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

    await t.step("should validate non-zero numbers", () => {
      const schema = new NumberGuardian().nonZero();

      asserts.assertEquals(schema.parse(1), 1);
      asserts.assertEquals(schema.parse(-1), -1);
      asserts.assertEquals(schema.parse(0.1), 0.1);
      asserts.assertEquals(schema.parse(-0.1), -0.1);
      asserts.assertThrows(() => schema.parse(0), GuardianError);
    });

    await t.step("should validate port numbers", () => {
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

    await t.step("should validate timestamp numbers", () => {
      const schema = new NumberGuardian().timestamp();

      const now = Date.now();
      asserts.assertEquals(schema.parse(now), now);
      asserts.assertEquals(schema.parse(0), 0); // Unix epoch
      asserts.assertEquals(schema.parse(1609459200000), 1609459200000); // Jan 1, 2021

      asserts.assertThrows(() => schema.parse(-1), GuardianError); // negative
      asserts.assertThrows(() => schema.parse(3.14), GuardianError); // not integer
    });
  });

  await t.step("mathematical transformations", async (t) => {
    await t.step("should round numbers", () => {
      const schema = new NumberGuardian().round();

      asserts.assertEquals(schema.parse(3.7), 4);
      asserts.assertEquals(schema.parse(3.2), 3);
      asserts.assertEquals(schema.parse(-2.7), -3);
      asserts.assertEquals(schema.parse(-2.2), -2);
    });

    await t.step("should floor numbers", () => {
      const schema = new NumberGuardian().floor();

      asserts.assertEquals(schema.parse(3.7), 3);
      asserts.assertEquals(schema.parse(3.2), 3);
      asserts.assertEquals(schema.parse(-2.7), -3);
      asserts.assertEquals(schema.parse(-2.2), -3);
    });

    await t.step("should ceil numbers", () => {
      const schema = new NumberGuardian().ceil();

      asserts.assertEquals(schema.parse(3.7), 4);
      asserts.assertEquals(schema.parse(3.2), 4);
      asserts.assertEquals(schema.parse(-2.7), -2);
      asserts.assertEquals(schema.parse(-2.2), -2);
    });

    await t.step("should truncate numbers", () => {
      const schema = new NumberGuardian().trunc();

      asserts.assertEquals(schema.parse(3.7), 3);
      asserts.assertEquals(schema.parse(3.2), 3);
      asserts.assertEquals(schema.parse(-2.7), -2);
      asserts.assertEquals(schema.parse(-2.2), -2);
    });

    await t.step("should get absolute value", () => {
      const schema = new NumberGuardian().abs();

      asserts.assertEquals(schema.parse(5), 5);
      asserts.assertEquals(schema.parse(-5), 5);
      asserts.assertEquals(schema.parse(0), 0);
    });

    await t.step("should negate numbers", () => {
      const schema = new NumberGuardian().negate();

      asserts.assertEquals(schema.parse(5), -5);
      asserts.assertEquals(schema.parse(-3), 3);
      asserts.assertEquals(schema.parse(0), -0);
      asserts.assertEquals(schema.parse(3.14), -3.14);
    });

    await t.step("should clamp numbers to range", () => {
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

    await t.step("should round to fixed decimal places", () => {
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

  await t.step("type transformations", async (t) => {
    await t.step("should convert number to string", () => {
      const schema = new NumberGuardian().toString();

      asserts.assertEquals(schema.parse(123), "123");
      asserts.assertEquals(schema.parse(3.14), "3.14");
      asserts.assertEquals(schema.parse(-42), "-42");
    });

    await t.step("should convert number to string with radix", () => {
      const schema = new NumberGuardian().toString(16);

      asserts.assertEquals(schema.parse(255), "ff");
      asserts.assertEquals(schema.parse(16), "10");
    });

    await t.step("should convert number to BigInt", () => {
      const schema = new NumberGuardian().toBigInt();

      asserts.assertEquals(schema.parse(123), 123n);
      asserts.assertEquals(schema.parse(-42), -42n);
      asserts.assertThrows(() => schema.parse(3.14), GuardianError);
    });

    await t.step("should convert number to Date", () => {
      const schema = new NumberGuardian().toDate();
      const timestamp = Date.now();

      const date = schema.parse(timestamp);
      asserts.assert(date instanceof Date);
      asserts.assertEquals(date.getTime(), timestamp);

      asserts.assertThrows(() => schema.parse(NaN), GuardianError);
    });
  });

  await t.step("chained validations", async (t) => {
    await t.step("should chain multiple validations", () => {
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

    await t.step("should chain transformations", () => {
      const schema = new NumberGuardian().abs().round();

      asserts.assertEquals(schema.parse(-3.7), 4);
      asserts.assertEquals(schema.parse(2.2), 2);
    });
  });

  await t.step("safe parsing", async (t) => {
    await t.step("should return success result for valid input", () => {
      const schema = new NumberGuardian().positive();
      const result = schema.safeParse(42);

      const [error, data] = result;
      asserts.assertEquals(error, null);
      asserts.assertEquals(data, 42);
    });

    await t.step("should return error result for invalid input", () => {
      const schema = new NumberGuardian().positive();
      const result = schema.safeParse(-1);

      const [error, data] = result;
      asserts.assert(error instanceof GuardianError);
      asserts.assertEquals(data, undefined);
    });
  });

  await t.step("error handling", async (t) => {
    await t.step("should provide detailed error messages", () => {
      const schema = new NumberGuardian().min(10);

      asserts.assertThrows(
        () => schema.parse(5),
        GuardianError,
        "Number must be at least 10",
      );
    });

    await t.step("should support custom error messages", () => {
      const schema = new NumberGuardian().min(10, "Too small!");

      asserts.assertThrows(
        () => schema.parse(5),
        GuardianError,
        "Too small!",
      );
    });
  });

  await t.step("nullable and optional", async (t) => {
    await t.step("should handle nullable numbers", () => {
      const schema = new NumberGuardian().positive().nullable();

      asserts.assertEquals(schema.parse(5), 5);
      asserts.assertEquals(schema.parse(null), null);
      asserts.assertThrows(() => schema.parse(undefined), GuardianError); // undefined not allowed in nullable
      asserts.assertThrows(() => schema.parse(-1), GuardianError); // still validates positive
      asserts.assertThrows(() => schema.parse("123"), GuardianError); // still validates type
    });

    await t.step("should handle optional numbers", () => {
      const schema = new NumberGuardian().positive().optional();

      asserts.assertEquals(schema.parse(5), 5);
      asserts.assertEquals(schema.parse(undefined), undefined);
      asserts.assertThrows(() => schema.parse(null), GuardianError); // null not allowed in optional
      asserts.assertThrows(() => schema.parse(-1), GuardianError); // still validates positive
    });

    await t.step("should handle optional with default", () => {
      const schema = new NumberGuardian().positive().optional(42);

      asserts.assertEquals(schema.parse(5), 5);
      asserts.assertEquals(schema.parse(undefined), 42);
      asserts.assertThrows(() => schema.parse(null), GuardianError);
      asserts.assertThrows(() => schema.parse(-1), GuardianError);
    });

    await t.step("should handle optional with function default", () => {
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

    await t.step("should handle nullable and optional separately", () => {
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

    await t.step("should handle nullable().optional() chaining", () => {
      const schema = new NumberGuardian().positive().nullable().optional(100);

      asserts.assertEquals(schema.parse(5), 5); // valid number
      asserts.assertEquals(schema.parse(null), null); // null preserved
      asserts.assertEquals(schema.parse(undefined), 100); // default used
      asserts.assertThrows(() => schema.parse(-1), GuardianError); // validation still works
    });

    await t.step("should handle optional().nullable() chaining", () => {
      const schema = new NumberGuardian().positive().optional(100).nullable();

      asserts.assertEquals(schema.parse(5), 5); // valid number
      asserts.assertEquals(schema.parse(null), null); // null preserved
      asserts.assertEquals(schema.parse(undefined), 100); // default used
      asserts.assertThrows(() => schema.parse(-1), GuardianError); // validation still works
    });

    await t.step("should work with transformations", () => {
      // Test nullable with transformations
      const nullableSchema = new NumberGuardian().abs().nullable();
      asserts.assertEquals(nullableSchema.parse(-5), 5); // abs transformation applied
      asserts.assertEquals(nullableSchema.parse(null), null);

      // Test optional with transformations
      const optionalSchema = new NumberGuardian().abs().optional(10);
      asserts.assertEquals(optionalSchema.parse(-5), 5); // abs transformation applied
      asserts.assertEquals(optionalSchema.parse(undefined), 10);
    });

    await t.step("should work with validations", () => {
      const schema = new NumberGuardian().range(1, 100).nullable();

      asserts.assertEquals(schema.parse(50), 50);
      asserts.assertEquals(schema.parse(null), null);
      asserts.assertThrows(() => schema.parse(0), GuardianError); // fails range validation
      asserts.assertThrows(() => schema.parse(101), GuardianError); // fails range validation
    });
  });

  await t.step("complex chaining scenarios", async (t) => {
    await t.step("should chain new methods with existing ones", () => {
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

    await t.step("should chain transformations with validations", () => {
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

  await t.step("new validation methods", async (t) => {
    await t.step("power validation", () => {
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

    await t.step("power validation with specific base", () => {
      const schema = new NumberGuardian().power(2);

      asserts.assertEquals(schema.parse(4), 4); // 2^2
      asserts.assertEquals(schema.parse(8), 8); // 2^3
      asserts.assertEquals(schema.parse(16), 16); // 2^4

      asserts.assertThrows(() => schema.parse(9), GuardianError); // 3^2, not 2^x
      asserts.assertThrows(() => schema.parse(5), GuardianError);
    });

    await t.step("between validation", () => {
      const schema = new NumberGuardian().between(5, 10);

      asserts.assertEquals(schema.parse(5), 5);
      asserts.assertEquals(schema.parse(7.5), 7.5);
      asserts.assertEquals(schema.parse(10), 10);

      asserts.assertThrows(() => schema.parse(4.9), GuardianError);
      asserts.assertThrows(() => schema.parse(10.1), GuardianError);
    });

    await t.step("between validation exclusive", () => {
      const schema = new NumberGuardian().between(5, 10, false);

      asserts.assertEquals(schema.parse(7.5), 7.5);
      asserts.assertEquals(schema.parse(6), 6);

      asserts.assertThrows(() => schema.parse(5), GuardianError); // exclusive
      asserts.assertThrows(() => schema.parse(10), GuardianError); // exclusive
      asserts.assertThrows(() => schema.parse(4.9), GuardianError);
    });

    await t.step("latitude validation", () => {
      const schema = new NumberGuardian().latitude();

      asserts.assertEquals(schema.parse(0), 0);
      asserts.assertEquals(schema.parse(45.5), 45.5);
      asserts.assertEquals(schema.parse(-90), -90);
      asserts.assertEquals(schema.parse(90), 90);

      asserts.assertThrows(() => schema.parse(90.1), GuardianError);
      asserts.assertThrows(() => schema.parse(-90.1), GuardianError);
      asserts.assertThrows(() => schema.parse(180), GuardianError);
    });

    await t.step("longitude validation", () => {
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

  await t.step("new transformation methods", async (t) => {
    await t.step("formatCurrency transformation", () => {
      const schema = new NumberGuardian().formatCurrency();

      // Note: This returns a number, not a string
      const result = schema.parse(1234.56);
      asserts.assertEquals(typeof result, "number");
      asserts.assertEquals(result, 1234.56);
    });

    await t.step("formatCurrency with different locale", () => {
      const schema = new NumberGuardian().formatCurrency("de-DE", "EUR");

      const result = schema.parse(1234.56);
      asserts.assertEquals(typeof result, "number");
      asserts.assertEquals(result, 1234.56);
    });

    await t.step("formatPercentage transformation", () => {
      const schema = new NumberGuardian().formatPercentage();

      asserts.assertEquals(schema.parse(0.1234), 12.34);
      asserts.assertEquals(schema.parse(0.5), 50);
      asserts.assertEquals(schema.parse(1), 100);
    });

    await t.step("formatPercentage with custom decimals", () => {
      const schema = new NumberGuardian().formatPercentage(0);

      asserts.assertEquals(schema.parse(0.1234), 12);
      asserts.assertEquals(schema.parse(0.5678), 57);
    });

    await t.step("addCommas transformation", () => {
      const schema = new NumberGuardian().addCommas();

      // This returns a number (commas are for display, not storage)
      asserts.assertEquals(schema.parse(1234), 1234);
      asserts.assertEquals(schema.parse(1234567.89), 1234567.89);
    });

    await t.step("padZeros transformation", () => {
      const schema = new NumberGuardian().padZeros(5);

      asserts.assertEquals(schema.parse(123), 123);
      asserts.assertEquals(schema.parse(-123), -123);
      asserts.assertEquals(schema.parse(123456), 123456); // longer than pad length
    });

    await t.step("padZeros with different lengths", () => {
      const shortSchema = new NumberGuardian().padZeros(3);
      const longSchema = new NumberGuardian().padZeros(8);

      asserts.assertEquals(shortSchema.parse(12), 12);
      asserts.assertEquals(longSchema.parse(123), 123);
    });
  });

  await t.step("nullable and optional scenarios for new methods", async (t) => {
    await t.step("nullable power validation", () => {
      const schema = new NumberGuardian().power().nullable();

      asserts.assertEquals(schema.parse(null), null);
      asserts.assertEquals(schema.parse(4), 4);
      asserts.assertThrows(() => schema.parse(undefined), GuardianError);
      asserts.assertThrows(() => schema.parse(5), GuardianError);
    });

    await t.step("optional between validation", () => {
      const schema = new NumberGuardian().between(5, 10).optional();

      asserts.assertEquals(schema.parse(undefined), undefined);
      asserts.assertEquals(schema.parse(7), 7);
      asserts.assertThrows(() => schema.parse(null), GuardianError);
      asserts.assertThrows(() => schema.parse(15), GuardianError);
    });

    await t.step("optional with default formatPercentage", () => {
      const schema = new NumberGuardian().formatPercentage().optional(50);

      asserts.assertEquals(schema.parse(undefined), 5000); // 50 * 100
      asserts.assertEquals(schema.parse(0.25), 25);
    });

    await t.step("nullable latitude validation", () => {
      const schema = new NumberGuardian().latitude().nullable();

      asserts.assertEquals(schema.parse(null), null);
      asserts.assertEquals(schema.parse(45.5), 45.5);
      asserts.assertThrows(() => schema.parse(undefined), GuardianError);
      asserts.assertThrows(() => schema.parse(91), GuardianError);
    });
  });

  await t.step("chaining with new methods", async (t) => {
    await t.step("complex validation chain", () => {
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

    await t.step("transformation chain", () => {
      const schema = new NumberGuardian()
        .abs()
        .clamp(0, 100)
        .formatPercentage(1);

      asserts.assertEquals(schema.parse(-0.123), 12.3);
      asserts.assertEquals(schema.parse(0.567), 56.7);
      asserts.assertEquals(schema.parse(2), 200); // clamped to 100, then 200%
    });

    await t.step("geographic coordinate validation", () => {
      const latSchema = new NumberGuardian().latitude().toFixed(6);
      const lngSchema = new NumberGuardian().longitude().toFixed(6);

      asserts.assertEquals(latSchema.parse(45.123456789), 45.123457);
      asserts.assertEquals(lngSchema.parse(-122.123456789), -122.123457);

      asserts.assertThrows(() => latSchema.parse(91), GuardianError);
      asserts.assertThrows(() => lngSchema.parse(181), GuardianError);
    });
  });
});
