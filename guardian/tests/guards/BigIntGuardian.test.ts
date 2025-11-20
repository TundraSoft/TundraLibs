import * as asserts from "$asserts";
import { BigIntGuardian, GuardianError } from "../../mod.ts";

Deno.test("guardian.BigIntGuardian", async (t) => {
  await t.step("basic functionality", async (t) => {
    await t.step("should validate bigint type", () => {
      const guardian = new BigIntGuardian();

      asserts.assertEquals(guardian.parse(42n), 42n);
      asserts.assertEquals(guardian.parse(0n), 0n);
      asserts.assertEquals(guardian.parse(-123n), -123n);
      asserts.assertEquals(
        guardian.parse(BigInt(Number.MAX_SAFE_INTEGER)),
        BigInt(Number.MAX_SAFE_INTEGER),
      );

      asserts.assertThrows(() => guardian.parse(42), GuardianError);
      asserts.assertThrows(() => guardian.parse("42"), GuardianError);
      asserts.assertThrows(() => guardian.parse(null), GuardianError);
      asserts.assertThrows(() => guardian.parse(undefined), GuardianError);
    });

    await t.step("should preserve bigint values", () => {
      const guardian = new BigIntGuardian();

      asserts.assertEquals(guardian.parse(123n), 123n);
      asserts.assertEquals(guardian.parse(-456n), -456n);
    });
  });

  await t.step("range validations", async (t) => {
    await t.step("should validate minimum value", () => {
      const guardian = new BigIntGuardian().min(10n);

      asserts.assertEquals(guardian.parse(10n), 10n);
      asserts.assertEquals(guardian.parse(15n), 15n);
      asserts.assertEquals(guardian.parse(100n), 100n);

      asserts.assertThrows(() => guardian.parse(9n), GuardianError);
      asserts.assertThrows(() => guardian.parse(-5n), GuardianError);
    });

    await t.step("should validate maximum value", () => {
      const guardian = new BigIntGuardian().max(100n);

      asserts.assertEquals(guardian.parse(100n), 100n);
      asserts.assertEquals(guardian.parse(50n), 50n);
      asserts.assertEquals(guardian.parse(-10n), -10n);

      asserts.assertThrows(() => guardian.parse(101n), GuardianError);
      asserts.assertThrows(() => guardian.parse(200n), GuardianError);
    });

    await t.step("should combine min and max", () => {
      const guardian = new BigIntGuardian().min(10n).max(100n);

      asserts.assertEquals(guardian.parse(10n), 10n);
      asserts.assertEquals(guardian.parse(50n), 50n);
      asserts.assertEquals(guardian.parse(100n), 100n);

      asserts.assertThrows(() => guardian.parse(9n), GuardianError);
      asserts.assertThrows(() => guardian.parse(101n), GuardianError);
    });
  });

  await t.step("sign validations", async (t) => {
    await t.step("should validate positive bigints", () => {
      const guardian = new BigIntGuardian().positive();

      asserts.assertEquals(guardian.parse(1n), 1n);
      asserts.assertEquals(guardian.parse(100n), 100n);

      asserts.assertThrows(() => guardian.parse(0n), GuardianError);
      asserts.assertThrows(() => guardian.parse(-1n), GuardianError);
    });

    await t.step("should validate negative bigints", () => {
      const guardian = new BigIntGuardian().negative();

      asserts.assertEquals(guardian.parse(-1n), -1n);
      asserts.assertEquals(guardian.parse(-100n), -100n);

      asserts.assertThrows(() => guardian.parse(0n), GuardianError);
      asserts.assertThrows(() => guardian.parse(1n), GuardianError);
    });

    await t.step("should validate non-negative bigints", () => {
      const guardian = new BigIntGuardian().nonNegative();

      asserts.assertEquals(guardian.parse(0n), 0n);
      asserts.assertEquals(guardian.parse(1n), 1n);
      asserts.assertEquals(guardian.parse(100n), 100n);

      asserts.assertThrows(() => guardian.parse(-1n), GuardianError);
      asserts.assertThrows(() => guardian.parse(-100n), GuardianError);
    });
  });

  await t.step("mathematical transformations", async (t) => {
    await t.step("should get absolute value", () => {
      const guardian = new BigIntGuardian().abs();

      asserts.assertEquals(guardian.parse(42n), 42n);
      asserts.assertEquals(guardian.parse(-42n), 42n);
      asserts.assertEquals(guardian.parse(0n), 0n);
    });
  });

  await t.step("type transformations", async (t) => {
    await t.step("should convert bigint to string", () => {
      const guardian = new BigIntGuardian().toString();

      asserts.assertEquals(guardian.parse(123n), "123");
      asserts.assertEquals(guardian.parse(-456n), "-456");
      asserts.assertEquals(guardian.parse(0n), "0");
    });

    await t.step("should convert bigint to string with radix", () => {
      const guardian = new BigIntGuardian().toString(16);

      asserts.assertEquals(guardian.parse(255n), "ff");
      asserts.assertEquals(guardian.parse(16n), "10");
    });

    await t.step("should convert bigint to number safely", () => {
      const guardian = new BigIntGuardian().toNumber();

      asserts.assertEquals(guardian.parse(42n), 42);
      asserts.assertEquals(guardian.parse(-123n), -123);
      asserts.assertEquals(guardian.parse(0n), 0);
    });

    await t.step("should reject unsafe bigint to number conversion", () => {
      const guardian = new BigIntGuardian().toNumber();
      const hugeBigInt = BigInt(Number.MAX_SAFE_INTEGER) + 1n;

      asserts.assertThrows(() => guardian.parse(hugeBigInt), GuardianError);
      asserts.assertThrows(
        () => guardian.parse(BigInt(Number.MIN_SAFE_INTEGER) - 1n),
        GuardianError,
      );
    });
  });

  await t.step("chained validations", async (t) => {
    await t.step("should chain multiple validations", () => {
      const guardian = new BigIntGuardian()
        .positive()
        .min(10n)
        .max(1000n);

      asserts.assertEquals(guardian.parse(42n), 42n);
      asserts.assertEquals(guardian.parse(500n), 500n);

      asserts.assertThrows(() => guardian.parse(-5n), GuardianError);
      asserts.assertThrows(() => guardian.parse(5n), GuardianError);
      asserts.assertThrows(() => guardian.parse(1001n), GuardianError);
    });

    await t.step("should chain transformations", () => {
      const guardian = new BigIntGuardian()
        .positive()
        .abs()
        .toString();

      asserts.assertEquals(guardian.parse(42n), "42");

      // Note: abs() won't help negative numbers pass positive() validation
      asserts.assertThrows(() => guardian.parse(-42n), GuardianError);
    });
  });

  await t.step("safe parsing", async (t) => {
    await t.step("should return success result for valid input", () => {
      const guardian = new BigIntGuardian();
      const [error, result] = guardian.safeParse(42n);

      asserts.assertEquals(error, null);
      asserts.assertEquals(result, 42n);
    });

    await t.step("should return error result for invalid input", () => {
      const guardian = new BigIntGuardian();
      const [error, result] = guardian.safeParse(42);

      asserts.assertEquals(error instanceof GuardianError, true);
      asserts.assertEquals(result, undefined);
    });
  });

  await t.step("error handling", async (t) => {
    await t.step("should provide detailed error messages", () => {
      const guardian = new BigIntGuardian();

      asserts.assertThrows(
        () => guardian.parse(42),
        GuardianError,
        "Expected bigint but got number",
      );
      asserts.assertThrows(
        () => guardian.parse("42"),
        GuardianError,
        "Expected bigint but got string",
      );
    });

    await t.step("should support custom error messages", () => {
      const guardian = new BigIntGuardian().positive(
        "Must be a positive big number",
      );

      asserts.assertThrows(
        () => guardian.parse(-42n),
        GuardianError,
        "Must be a positive big number",
      );
    });
  });

  await t.step("large number handling", async (t) => {
    await t.step("should handle very large numbers", () => {
      const guardian = new BigIntGuardian().positive();
      const veryLarge = BigInt("123456789012345678901234567890");

      asserts.assertEquals(guardian.parse(veryLarge), veryLarge);
    });

    await t.step(
      "should handle mathematical operations on large numbers",
      () => {
        const guardian = new BigIntGuardian().abs().toString();
        const veryLarge = -BigInt("123456789012345678901234567890");

        asserts.assertEquals(
          guardian.parse(veryLarge),
          "123456789012345678901234567890",
        );
      },
    );
  });

  await t.step("new validation methods", async (t) => {
    await t.step("range validation", () => {
      const guardian = new BigIntGuardian().range(10n, 100n);

      asserts.assertEquals(guardian.parse(50n), 50n);
      asserts.assertEquals(guardian.parse(10n), 10n);
      asserts.assertEquals(guardian.parse(100n), 100n);

      asserts.assertThrows(() => guardian.parse(9n), GuardianError);
      asserts.assertThrows(() => guardian.parse(101n), GuardianError);
    });

    await t.step("between validation", () => {
      const guardian = new BigIntGuardian().between(5n, 15n);

      asserts.assertEquals(guardian.parse(10n), 10n);
      asserts.assertEquals(guardian.parse(5n), 5n);
      asserts.assertEquals(guardian.parse(15n), 15n);

      asserts.assertThrows(() => guardian.parse(4n), GuardianError);
      asserts.assertThrows(() => guardian.parse(16n), GuardianError);
    });

    await t.step("comparison validations", () => {
      const gtGuardian = new BigIntGuardian().greaterThan(10n);
      asserts.assertEquals(gtGuardian.parse(11n), 11n);
      asserts.assertThrows(() => gtGuardian.parse(10n), GuardianError);

      const ltGuardian = new BigIntGuardian().lessThan(10n);
      asserts.assertEquals(ltGuardian.parse(9n), 9n);
      asserts.assertThrows(() => ltGuardian.parse(10n), GuardianError);

      const gteGuardian = new BigIntGuardian().greaterThanOrEqual(10n);
      asserts.assertEquals(gteGuardian.parse(10n), 10n);
      asserts.assertEquals(gteGuardian.parse(11n), 11n);
      asserts.assertThrows(() => gteGuardian.parse(9n), GuardianError);

      const lteGuardian = new BigIntGuardian().lessThanOrEqual(10n);
      asserts.assertEquals(lteGuardian.parse(10n), 10n);
      asserts.assertEquals(lteGuardian.parse(9n), 9n);
      asserts.assertThrows(() => lteGuardian.parse(11n), GuardianError);
    });

    await t.step("even/odd validation", () => {
      const evenGuardian = new BigIntGuardian().even();
      asserts.assertEquals(evenGuardian.parse(2n), 2n);
      asserts.assertEquals(evenGuardian.parse(0n), 0n);
      asserts.assertEquals(evenGuardian.parse(-4n), -4n);
      asserts.assertThrows(() => evenGuardian.parse(3n), GuardianError);

      const oddGuardian = new BigIntGuardian().odd();
      asserts.assertEquals(oddGuardian.parse(3n), 3n);
      asserts.assertEquals(oddGuardian.parse(1n), 1n);
      asserts.assertEquals(oddGuardian.parse(-5n), -5n);
      asserts.assertThrows(() => oddGuardian.parse(2n), GuardianError);
    });

    await t.step("multiple of validation", () => {
      const guardian = new BigIntGuardian().multipleOf(5n);

      asserts.assertEquals(guardian.parse(10n), 10n);
      asserts.assertEquals(guardian.parse(15n), 15n);
      asserts.assertEquals(guardian.parse(0n), 0n);
      asserts.assertEquals(guardian.parse(-5n), -5n);

      asserts.assertThrows(() => guardian.parse(7n), GuardianError);
      asserts.assertThrows(() => guardian.parse(12n), GuardianError);
    });

    await t.step("prime validation", () => {
      const primeGuardian = new BigIntGuardian().prime();

      asserts.assertEquals(primeGuardian.parse(2n), 2n);
      asserts.assertEquals(primeGuardian.parse(3n), 3n);
      asserts.assertEquals(primeGuardian.parse(5n), 5n);
      asserts.assertEquals(primeGuardian.parse(7n), 7n);
      asserts.assertEquals(primeGuardian.parse(11n), 11n);
      asserts.assertEquals(primeGuardian.parse(13n), 13n);

      asserts.assertThrows(() => primeGuardian.parse(1n), GuardianError);
      asserts.assertThrows(() => primeGuardian.parse(4n), GuardianError);
      asserts.assertThrows(() => primeGuardian.parse(9n), GuardianError);
      asserts.assertThrows(() => primeGuardian.parse(15n), GuardianError);

      const notPrimeGuardian = new BigIntGuardian().notPrime();
      asserts.assertEquals(notPrimeGuardian.parse(4n), 4n);
      asserts.assertEquals(notPrimeGuardian.parse(9n), 9n);
      asserts.assertThrows(() => notPrimeGuardian.parse(2n), GuardianError);
      asserts.assertThrows(() => notPrimeGuardian.parse(3n), GuardianError);
    });

    await t.step("power validation", () => {
      const powerGuardian = new BigIntGuardian().power();

      asserts.assertEquals(powerGuardian.parse(1n), 1n); // Any number^0 = 1
      asserts.assertEquals(powerGuardian.parse(4n), 4n); // 2^2
      asserts.assertEquals(powerGuardian.parse(8n), 8n); // 2^3
      asserts.assertEquals(powerGuardian.parse(9n), 9n); // 3^2
      asserts.assertEquals(powerGuardian.parse(16n), 16n); // 2^4 or 4^2

      asserts.assertThrows(() => powerGuardian.parse(3n), GuardianError);
      asserts.assertThrows(() => powerGuardian.parse(5n), GuardianError);

      // Test specific base
      const powerOf2Guardian = new BigIntGuardian().power(2n);
      asserts.assertEquals(powerOf2Guardian.parse(4n), 4n); // 2^2
      asserts.assertEquals(powerOf2Guardian.parse(8n), 8n); // 2^3
      asserts.assertThrows(() => powerOf2Guardian.parse(9n), GuardianError); // Not a power of 2
    });

    await t.step("non-zero validation", () => {
      const guardian = new BigIntGuardian().nonZero();

      asserts.assertEquals(guardian.parse(1n), 1n);
      asserts.assertEquals(guardian.parse(-1n), -1n);
      asserts.assertEquals(guardian.parse(100n), 100n);

      asserts.assertThrows(() => guardian.parse(0n), GuardianError);
    });

    await t.step("bit length validation", () => {
      const guardian = new BigIntGuardian().bitLength(4);

      asserts.assertEquals(guardian.parse(8n), 8n); // 1000 in binary = 4 bits
      asserts.assertEquals(guardian.parse(15n), 15n); // 1111 in binary = 4 bits

      asserts.assertThrows(() => guardian.parse(7n), GuardianError); // 111 in binary = 3 bits
      asserts.assertThrows(() => guardian.parse(16n), GuardianError); // 10000 in binary = 5 bits

      // Test without expected length (should just validate)
      const noLengthGuardian = new BigIntGuardian().bitLength();
      asserts.assertEquals(noLengthGuardian.parse(123n), 123n);
    });
  });

  await t.step("mathematical operations", async (t) => {
    await t.step("addition", () => {
      const guardian = new BigIntGuardian().add(10n);

      asserts.assertEquals(guardian.parse(5n), 15n);
      asserts.assertEquals(guardian.parse(-3n), 7n);
      asserts.assertEquals(guardian.parse(0n), 10n);
    });

    await t.step("subtraction", () => {
      const guardian = new BigIntGuardian().subtract(10n);

      asserts.assertEquals(guardian.parse(15n), 5n);
      asserts.assertEquals(guardian.parse(3n), -7n);
      asserts.assertEquals(guardian.parse(10n), 0n);
    });

    await t.step("multiplication", () => {
      const guardian = new BigIntGuardian().multiply(3n);

      asserts.assertEquals(guardian.parse(5n), 15n);
      asserts.assertEquals(guardian.parse(-2n), -6n);
      asserts.assertEquals(guardian.parse(0n), 0n);
    });

    await t.step("division", () => {
      const guardian = new BigIntGuardian().divide(2n);

      asserts.assertEquals(guardian.parse(10n), 5n);
      asserts.assertEquals(guardian.parse(-6n), -3n);
      asserts.assertEquals(guardian.parse(0n), 0n);

      const zeroGuardian = new BigIntGuardian().divide(0n);
      asserts.assertThrows(() => zeroGuardian.parse(10n), GuardianError);
    });

    await t.step("modulo", () => {
      const guardian = new BigIntGuardian().mod(3n);

      asserts.assertEquals(guardian.parse(10n), 1n);
      asserts.assertEquals(guardian.parse(9n), 0n);
      asserts.assertEquals(guardian.parse(8n), 2n);

      const zeroGuardian = new BigIntGuardian().mod(0n);
      asserts.assertThrows(() => zeroGuardian.parse(10n), GuardianError);
    });

    await t.step("square root", () => {
      const guardian = new BigIntGuardian().squareRoot();

      asserts.assertEquals(guardian.parse(9n), 3n);
      asserts.assertEquals(guardian.parse(16n), 4n);
      asserts.assertEquals(guardian.parse(25n), 5n);
      asserts.assertEquals(guardian.parse(0n), 0n);

      asserts.assertThrows(() => guardian.parse(-4n), GuardianError);
    });

    await t.step("clamp", () => {
      const guardian = new BigIntGuardian().clamp(5n, 15n);

      asserts.assertEquals(guardian.parse(10n), 10n); // Within range
      asserts.assertEquals(guardian.parse(3n), 5n); // Below min, clamped to min
      asserts.assertEquals(guardian.parse(20n), 15n); // Above max, clamped to max
      asserts.assertEquals(guardian.parse(5n), 5n); // At min
      asserts.assertEquals(guardian.parse(15n), 15n); // At max
    });
  });

  await t.step("format conversions", async (t) => {
    await t.step("to hex", () => {
      const guardian = new BigIntGuardian().toHex();

      asserts.assertEquals(guardian.parse(255n), "ff");
      asserts.assertEquals(guardian.parse(16n), "10");
      asserts.assertEquals(guardian.parse(0n), "0");
    });

    await t.step("to binary", () => {
      const guardian = new BigIntGuardian().toBinary();

      asserts.assertEquals(guardian.parse(8n), "1000");
      asserts.assertEquals(guardian.parse(7n), "111");
      asserts.assertEquals(guardian.parse(0n), "0");
    });

    await t.step("to octal", () => {
      const guardian = new BigIntGuardian().toOctal();

      asserts.assertEquals(guardian.parse(64n), "100");
      asserts.assertEquals(guardian.parse(8n), "10");
      asserts.assertEquals(guardian.parse(0n), "0");
    });

    await t.step("to string with radix", () => {
      asserts.assertEquals(new BigIntGuardian().toString(16).parse(255n), "ff");
      asserts.assertEquals(new BigIntGuardian().toString(2).parse(8n), "1000");
      asserts.assertEquals(new BigIntGuardian().toString(8).parse(64n), "100");

      // Test invalid radix
      const invalidRadixGuardian = new BigIntGuardian().toString(37);
      asserts.assertThrows(() => invalidRadixGuardian.parse(10n), GuardianError);
    });
  });
});
