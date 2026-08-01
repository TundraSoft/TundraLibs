import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat';
import { BigIntGuardian, GuardianError } from '../../mod.ts';

describe('guardian.BigIntGuardian', () => {
  describe('basic functionality', () => {
    it('should validate bigint type', () => {
      const guardian = new BigIntGuardian();

      asserts.assertEquals(guardian.parse(42n), 42n);
      asserts.assertEquals(guardian.parse(0n), 0n);
      asserts.assertEquals(guardian.parse(-123n), -123n);
      asserts.assertEquals(
        guardian.parse(BigInt(Number.MAX_SAFE_INTEGER)),
        BigInt(Number.MAX_SAFE_INTEGER),
      );

      // Coerce-by-default: integer numbers, integer strings, booleans flow through.
      asserts.assertEquals(guardian.parse(42), 42n);
      asserts.assertEquals(guardian.parse('42'), 42n);
      asserts.assertEquals(guardian.parse(true), 1n);
      asserts.assertEquals(guardian.parse(false), 0n);

      // Non-integer numbers, garbage strings, and null/undefined still throw.
      asserts.assertThrows(() => guardian.parse(3.14), GuardianError);
      asserts.assertThrows(() => guardian.parse('abc'), GuardianError);
      asserts.assertThrows(() => guardian.parse(null), GuardianError);
      asserts.assertThrows(() => guardian.parse(undefined), GuardianError);
      asserts.assertThrows(() => guardian.parse({}), GuardianError);
    });

    it('should preserve bigint values', () => {
      const guardian = new BigIntGuardian();

      asserts.assertEquals(guardian.parse(123n), 123n);
      asserts.assertEquals(guardian.parse(-456n), -456n);
    });
  });

  describe('range validations', () => {
    it('should validate minimum value', () => {
      const guardian = new BigIntGuardian().min(10n);

      asserts.assertEquals(guardian.parse(10n), 10n);
      asserts.assertEquals(guardian.parse(15n), 15n);
      asserts.assertEquals(guardian.parse(100n), 100n);
      asserts.assertThrows(() => guardian.parse(9n), GuardianError);
      asserts.assertThrows(() => guardian.parse(-5n), GuardianError);
    });

    it('should validate maximum value', () => {
      const guardian = new BigIntGuardian().max(100n);

      asserts.assertEquals(guardian.parse(100n), 100n);
      asserts.assertEquals(guardian.parse(50n), 50n);
      asserts.assertEquals(guardian.parse(-10n), -10n);

      asserts.assertThrows(() => guardian.parse(101n), GuardianError);
      asserts.assertThrows(() => guardian.parse(200n), GuardianError);
    });

    it('should combine min and max', () => {
      const guardian = new BigIntGuardian().min(10n).max(100n);

      asserts.assertEquals(guardian.parse(10n), 10n);
      asserts.assertEquals(guardian.parse(50n), 50n);
      asserts.assertEquals(guardian.parse(100n), 100n);

      asserts.assertThrows(() => guardian.parse(9n), GuardianError);
      asserts.assertThrows(() => guardian.parse(101n), GuardianError);
    });
  });

  describe('sign validations', () => {
    it('should validate positive bigints', () => {
      const guardian = new BigIntGuardian().positive();

      asserts.assertEquals(guardian.parse(1n), 1n);
      asserts.assertEquals(guardian.parse(100n), 100n);

      asserts.assertThrows(() => guardian.parse(0n), GuardianError);
      asserts.assertThrows(() => guardian.parse(-1n), GuardianError);
    });

    it('should validate negative bigints', () => {
      const guardian = new BigIntGuardian().negative();

      asserts.assertEquals(guardian.parse(-1n), -1n);
      asserts.assertEquals(guardian.parse(-100n), -100n);

      asserts.assertThrows(() => guardian.parse(0n), GuardianError);
      asserts.assertThrows(() => guardian.parse(1n), GuardianError);
    });

    it('should validate non-negative bigints', () => {
      const guardian = new BigIntGuardian().nonNegative();

      asserts.assertEquals(guardian.parse(0n), 0n);
      asserts.assertEquals(guardian.parse(1n), 1n);
      asserts.assertEquals(guardian.parse(100n), 100n);

      asserts.assertThrows(() => guardian.parse(-1n), GuardianError);
      asserts.assertThrows(() => guardian.parse(-100n), GuardianError);
    });
  });

  describe('mathematical transformations', () => {
    it('should get absolute value', () => {
      const guardian = new BigIntGuardian().abs();

      asserts.assertEquals(guardian.parse(42n), 42n);
      asserts.assertEquals(guardian.parse(-42n), 42n);
      asserts.assertEquals(guardian.parse(0n), 0n);
    });
  });

  describe('type transformations', () => {
    it('should convert bigint to string', () => {
      const guardian = new BigIntGuardian().toString();

      asserts.assertEquals(guardian.parse(123n), '123');
      asserts.assertEquals(guardian.parse(-456n), '-456');
      asserts.assertEquals(guardian.parse(0n), '0');
    });

    it('should convert bigint to string with radix', () => {
      const guardian = new BigIntGuardian().toString(16);

      asserts.assertEquals(guardian.parse(255n), 'ff');
      asserts.assertEquals(guardian.parse(16n), '10');
    });

    it('should convert bigint to number safely', () => {
      const guardian = new BigIntGuardian().toNumber();

      asserts.assertEquals(guardian.parse(42n), 42);
      asserts.assertEquals(guardian.parse(-123n), -123);
      asserts.assertEquals(guardian.parse(0n), 0);
    });

    it('should reject unsafe bigint to number conversion', () => {
      const guardian = new BigIntGuardian().toNumber();
      const hugeBigInt = BigInt(Number.MAX_SAFE_INTEGER) + 1n;

      asserts.assertThrows(() => guardian.parse(hugeBigInt), GuardianError);
      asserts.assertThrows(
        () => guardian.parse(BigInt(Number.MIN_SAFE_INTEGER) - 1n),
        GuardianError,
      );
    });
  });

  describe('chained validations', () => {
    it('should chain multiple validations', () => {
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

    it('should chain transformations', () => {
      const guardian = new BigIntGuardian()
        .positive()
        .abs()
        .toString();

      asserts.assertEquals(guardian.parse(42n), '42');

      // Note: abs() won't help negative numbers pass positive() validation
      asserts.assertThrows(() => guardian.parse(-42n), GuardianError);
    });
  });

  describe('safe parsing', () => {
    it('should return success result for valid input', () => {
      const guardian = new BigIntGuardian();
      const [error, result] = guardian.safeParse(42n);

      asserts.assertEquals(error, null);
      asserts.assertEquals(result, 42n);
    });

    it('should return error result for invalid input', () => {
      const guardian = new BigIntGuardian();

      // Coerce-by-default: integer number coerces successfully.
      const [okErr, okData] = guardian.safeParse(42);
      asserts.assertEquals(okErr, null);
      asserts.assertEquals(okData, 42n);

      // Non-integer / non-coercible input still errors.
      const [error, result] = guardian.safeParse(3.14);
      asserts.assertEquals(error instanceof GuardianError, true);
      asserts.assertEquals(result, undefined);
    });
  });

  describe('error handling', () => {
    it('should provide detailed error messages', () => {
      const guardian = new BigIntGuardian();

      // Non-integer numbers throw — no silent truncation.
      asserts.assertThrows(
        () => guardian.parse(3.14),
        GuardianError,
        'non-integer',
      );
      // Garbage strings throw.
      asserts.assertThrows(
        () => guardian.parse('not-a-number'),
        GuardianError,
        'Cannot coerce',
      );
    });

    it('should support custom error messages', () => {
      const guardian = new BigIntGuardian().positive(
        'Must be a positive big number',
      );

      asserts.assertThrows(
        () => guardian.parse(-42n),
        GuardianError,
        'Must be a positive big number',
      );
    });
  });

  describe('large number handling', () => {
    it('should handle very large numbers', () => {
      const guardian = new BigIntGuardian().positive();
      const veryLarge = BigInt('123456789012345678901234567890');

      asserts.assertEquals(guardian.parse(veryLarge), veryLarge);
    });

    it(
      'should handle mathematical operations on large numbers',
      () => {
        const guardian = new BigIntGuardian().abs().toString();
        const veryLarge = -BigInt('123456789012345678901234567890');

        asserts.assertEquals(
          guardian.parse(veryLarge),
          '123456789012345678901234567890',
        );
      },
    );
  });

  describe('new validation methods', () => {
    it('range validation', () => {
      const guardian = new BigIntGuardian().range(10n, 100n);

      asserts.assertEquals(guardian.parse(50n), 50n);
      asserts.assertEquals(guardian.parse(10n), 10n);
      asserts.assertEquals(guardian.parse(100n), 100n);

      asserts.assertThrows(() => guardian.parse(9n), GuardianError);
      asserts.assertThrows(() => guardian.parse(101n), GuardianError);
    });

    it('between validation', () => {
      const guardian = new BigIntGuardian().between(5n, 15n);

      asserts.assertEquals(guardian.parse(10n), 10n);
      asserts.assertEquals(guardian.parse(5n), 5n);
      asserts.assertEquals(guardian.parse(15n), 15n);

      asserts.assertThrows(() => guardian.parse(4n), GuardianError);
      asserts.assertThrows(() => guardian.parse(16n), GuardianError);
    });

    it('comparison validations', () => {
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

    it('even/odd validation', () => {
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

    it('multiple of validation', () => {
      const guardian = new BigIntGuardian().multipleOf(5n);

      asserts.assertEquals(guardian.parse(10n), 10n);
      asserts.assertEquals(guardian.parse(15n), 15n);
      asserts.assertEquals(guardian.parse(0n), 0n);
      asserts.assertEquals(guardian.parse(-5n), -5n);

      asserts.assertThrows(() => guardian.parse(7n), GuardianError);
      asserts.assertThrows(() => guardian.parse(12n), GuardianError);
    });

    it('prime validation', () => {
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

    it('power validation', () => {
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

    it('non-zero validation', () => {
      const guardian = new BigIntGuardian().nonZero();

      asserts.assertEquals(guardian.parse(1n), 1n);
      asserts.assertEquals(guardian.parse(-1n), -1n);
      asserts.assertEquals(guardian.parse(100n), 100n);

      asserts.assertThrows(() => guardian.parse(0n), GuardianError);
    });

    it('bit length validation', () => {
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

  describe('mathematical operations', () => {
    it('addition', () => {
      const guardian = new BigIntGuardian().add(10n);

      asserts.assertEquals(guardian.parse(5n), 15n);
      asserts.assertEquals(guardian.parse(-3n), 7n);
      asserts.assertEquals(guardian.parse(0n), 10n);
    });

    it('subtraction', () => {
      const guardian = new BigIntGuardian().subtract(10n);

      asserts.assertEquals(guardian.parse(15n), 5n);
      asserts.assertEquals(guardian.parse(3n), -7n);
      asserts.assertEquals(guardian.parse(10n), 0n);
    });

    it('multiplication', () => {
      const guardian = new BigIntGuardian().multiply(3n);

      asserts.assertEquals(guardian.parse(5n), 15n);
      asserts.assertEquals(guardian.parse(-2n), -6n);
      asserts.assertEquals(guardian.parse(0n), 0n);
    });

    it('division', () => {
      const guardian = new BigIntGuardian().divide(2n);

      asserts.assertEquals(guardian.parse(10n), 5n);
      asserts.assertEquals(guardian.parse(-6n), -3n);
      asserts.assertEquals(guardian.parse(0n), 0n);

      const zeroGuardian = new BigIntGuardian().divide(0n);
      asserts.assertThrows(() => zeroGuardian.parse(10n), GuardianError);
    });

    it('modulo', () => {
      const guardian = new BigIntGuardian().mod(3n);

      asserts.assertEquals(guardian.parse(10n), 1n);
      asserts.assertEquals(guardian.parse(9n), 0n);
      asserts.assertEquals(guardian.parse(8n), 2n);

      const zeroGuardian = new BigIntGuardian().mod(0n);
      asserts.assertThrows(() => zeroGuardian.parse(10n), GuardianError);
    });

    it('square root', () => {
      const guardian = new BigIntGuardian().squareRoot();

      asserts.assertEquals(guardian.parse(9n), 3n);
      asserts.assertEquals(guardian.parse(16n), 4n);
      asserts.assertEquals(guardian.parse(25n), 5n);
      asserts.assertEquals(guardian.parse(0n), 0n);

      asserts.assertThrows(() => guardian.parse(-4n), GuardianError);
    });

    it('clamp', () => {
      const guardian = new BigIntGuardian().clamp(5n, 15n);

      asserts.assertEquals(guardian.parse(10n), 10n); // Within range
      asserts.assertEquals(guardian.parse(3n), 5n); // Below min, clamped to min
      asserts.assertEquals(guardian.parse(20n), 15n); // Above max, clamped to max
      asserts.assertEquals(guardian.parse(5n), 5n); // At min
      asserts.assertEquals(guardian.parse(15n), 15n); // At max
    });
  });

  describe('format conversions', () => {
    it('to hex', () => {
      const guardian = new BigIntGuardian().toHex();

      asserts.assertEquals(guardian.parse(255n), 'ff');
      asserts.assertEquals(guardian.parse(16n), '10');
      asserts.assertEquals(guardian.parse(0n), '0');
    });

    it('to binary', () => {
      const guardian = new BigIntGuardian().toBinary();

      asserts.assertEquals(guardian.parse(8n), '1000');
      asserts.assertEquals(guardian.parse(7n), '111');
      asserts.assertEquals(guardian.parse(0n), '0');
    });

    it('to octal', () => {
      const guardian = new BigIntGuardian().toOctal();

      asserts.assertEquals(guardian.parse(64n), '100');
      asserts.assertEquals(guardian.parse(8n), '10');
      asserts.assertEquals(guardian.parse(0n), '0');
    });

    it('to string with radix', () => {
      asserts.assertEquals(new BigIntGuardian().toString(16).parse(255n), 'ff');
      asserts.assertEquals(new BigIntGuardian().toString(2).parse(8n), '1000');
      asserts.assertEquals(new BigIntGuardian().toString(8).parse(64n), '100');

      // Test invalid radix
      const invalidRadixGuardian = new BigIntGuardian().toString(37);
      asserts.assertThrows(
        () => invalidRadixGuardian.parse(10n),
        GuardianError,
      );
    });
  });

  describe('nullable and optional', () => {
    it('should handle nullable bigints', () => {
      const schema = new BigIntGuardian().positive().nullable();
      asserts.assertEquals(schema.parse(5n), 5n);
      asserts.assertEquals(schema.parse(null), null);
      asserts.assertThrows(() => schema.parse(-1n), GuardianError);
    });

    it('should handle optional bigints', () => {
      const schema = new BigIntGuardian().positive().optional(100n);
      asserts.assertEquals(schema.parse(5n), 5n);
      asserts.assertEquals(schema.parse(undefined), 100n);
      asserts.assertThrows(() => schema.parse(-1n), GuardianError);
    });

    it('should handle nullable().optional() chaining', () => {
      const schema = new BigIntGuardian().positive().nullable().optional(100n);
      asserts.assertEquals(schema.parse(5n), 5n);
      asserts.assertEquals(schema.parse(null), null);
      asserts.assertEquals(schema.parse(undefined), 100n);
    });

    it('should handle optional().nullable() chaining', () => {
      const schema = new BigIntGuardian().positive().optional(100n).nullable();
      asserts.assertEquals(schema.parse(5n), 5n);
      asserts.assertEquals(schema.parse(null), null);
      asserts.assertEquals(schema.parse(undefined), 100n);
    });
  });

  // ============================================================================
  // COMPREHENSIVE EDGE CASE TESTS - Added for Production Readiness
  // ============================================================================

  describe('Metadata and describe', () => {
    it('should set metadata via describe', () => {
      const guard = new BigIntGuardian().describe({
        title: 'User ID',
        description: 'Large integer user identifier',
      });

      asserts.assertEquals(guard.metaData?.title, 'User ID');
      asserts.assertEquals(
        guard.metaData?.description,
        'Large integer user identifier',
      );
    });

    it('should not override protected flags with describe', () => {
      const guard = new BigIntGuardian()
        .nullable()
        .describe({
          title: 'Test',
          isNullable: false as any,
        });

      asserts.assertEquals(guard.parse(null), null);
    });

    it('should merge metadata across describe calls', () => {
      const guard = new BigIntGuardian();

      const withTitle = guard.describe({ title: 'Step 1' });
      const withDesc = withTitle.describe({ description: 'Big integer' });

      asserts.assertEquals(withDesc.metaData?.title, 'Step 1');
      asserts.assertEquals(withDesc.metaData?.description, 'Big integer');
    });
  });

  describe('Extreme values', () => {
    it('should handle very large positive bigints', () => {
      const guard = new BigIntGuardian();
      const huge = BigInt('9'.repeat(100));

      asserts.assertEquals(guard.parse(huge), huge);
    });

    it('should handle very large negative bigints', () => {
      const guard = new BigIntGuardian();
      const huge = -BigInt('9'.repeat(100));

      asserts.assertEquals(guard.parse(huge), huge);
    });

    it('should handle zero', () => {
      const guard = new BigIntGuardian();
      asserts.assertEquals(guard.parse(0n), 0n);
    });

    it('should handle positive and negative validations with large values', () => {
      const huge = BigInt('9'.repeat(50));

      const positiveGuard = new BigIntGuardian().positive();
      asserts.assertEquals(positiveGuard.parse(huge), huge);
      asserts.assertThrows(() => positiveGuard.parse(-huge), GuardianError);

      const negativeGuard = new BigIntGuardian().negative();
      asserts.assertEquals(negativeGuard.parse(-huge), -huge);
      asserts.assertThrows(() => negativeGuard.parse(huge), GuardianError);
    });
  });

  describe('Chaining validations comprehensively', () => {
    it('should chain min, max, and positive', () => {
      const guard = new BigIntGuardian().min(10n).max(100n).positive();

      asserts.assertEquals(guard.parse(50n), 50n);
      asserts.assertThrows(() => guard.parse(5n), GuardianError);
      asserts.assertThrows(() => guard.parse(101n), GuardianError);
      asserts.assertThrows(() => guard.parse(-5n), GuardianError);
    });

    it('should chain multiple constraints', () => {
      const guard = new BigIntGuardian()
        .min(0n)
        .max(1000n)
        .nonNegative()
        .process((val) => val * 2n);

      asserts.assertEquals(guard.parse(100n), 200n);
      asserts.assertThrows(() => guard.parse(-1n), GuardianError);
      asserts.assertThrows(() => guard.parse(1001n), GuardianError);
    });

    it('should respect constraint order', () => {
      const guard = new BigIntGuardian().positive().min(10n);

      asserts.assertEquals(guard.parse(20n), 20n);
      asserts.assertThrows(() => guard.parse(5n), GuardianError);
      asserts.assertThrows(() => guard.parse(-5n), GuardianError);
    });
  });

  describe('Process and transformations', () => {
    it('should transform bigint to number', () => {
      const guard = new BigIntGuardian().process((val) => Number(val));

      asserts.assertEquals(guard.parse(123n), 123);
      asserts.assertEquals(typeof guard.parse(456n), 'number');
    });

    it('should transform bigint to string', () => {
      const guard = new BigIntGuardian().process((val) => val.toString());

      asserts.assertEquals(guard.parse(789n), '789');
    });

    it('should chain multiple transformations', () => {
      const guard = new BigIntGuardian()
        .process((val) => val * 2n)
        .process((val) => val + 10n);

      asserts.assertEquals(guard.parse(5n), 20n);
    });

    it('should handle async transformations', async () => {
      const guard = new BigIntGuardian().process(async (val) => {
        await new Promise((resolve) => setTimeout(resolve, 1));
        return val * 2n;
      });

      const result = await guard.parseAsync(5n);
      asserts.assertEquals(result, 10n);
    });
  });

  describe('SafeParse comprehensive', () => {
    it('should handle safeParse with valid values', () => {
      const guard = new BigIntGuardian();

      const [error, data] = guard.safeParse(123n);
      asserts.assertEquals(error, null);
      asserts.assertEquals(data, 123n);
    });

    it('should handle safeParse with invalid values', () => {
      const guard = new BigIntGuardian();

      // Coerce-by-default: integer number → bigint.
      const [okErr, okData] = guard.safeParse(123);
      asserts.assertEquals(okErr, null);
      asserts.assertEquals(okData, 123n);

      // Non-integer numbers still error.
      const [error, data] = guard.safeParse(123.45);
      asserts.assertInstanceOf(error, GuardianError);
      asserts.assertEquals(data, undefined);
    });

    it('should handle safeParse with constraints', () => {
      const guard = new BigIntGuardian().min(10n);

      const [error1, data1] = guard.safeParse(20n);
      asserts.assertEquals(error1, null);
      asserts.assertEquals(data1, 20n);

      const [error2, data2] = guard.safeParse(5n);
      asserts.assertInstanceOf(error2, GuardianError);
      asserts.assertEquals(data2, undefined);
    });

    it('should handle safeParse with transformations', () => {
      const guard = new BigIntGuardian().process((val) => val * 2n);

      const [error, data] = guard.safeParse(5n);
      asserts.assertEquals(error, null);
      asserts.assertEquals(data, 10n);
    });
  });

  describe('Error scenarios comprehensive', () => {
    it('should reject non-coercible types', () => {
      const guard = new BigIntGuardian();

      // Integer numbers, integer strings, and booleans coerce successfully.
      asserts.assertEquals(guard.parse(123), 123n);
      asserts.assertEquals(guard.parse('123'), 123n);
      asserts.assertEquals(guard.parse(true), 1n);

      // Non-integer numbers and non-coercible inputs still throw.
      asserts.assertThrows(() => guard.parse(123.45), GuardianError);
      asserts.assertThrows(() => guard.parse({}), GuardianError);
      asserts.assertThrows(() => guard.parse([]), GuardianError);
      asserts.assertThrows(() => guard.parse('not-a-number'), GuardianError);
    });

    it('should provide clear error messages for type errors', () => {
      const guard = new BigIntGuardian();

      try {
        guard.parse(3.14);
        asserts.fail('Should have thrown');
      } catch (error) {
        asserts.assertInstanceOf(error, GuardianError);
        asserts.assert(error.message.includes('bigint'));
      }
    });

    it('should provide clear error messages for range violations', () => {
      const guard = new BigIntGuardian().min(10n).max(100n);

      try {
        guard.parse(5n);
        asserts.fail('Should have thrown');
      } catch (error) {
        asserts.assertInstanceOf(error, GuardianError);
        asserts.assert(
          error.message.includes('10') || error.message.includes('min'),
        );
      }
    });
  });

  describe('Async parseAsync comprehensive', () => {
    it('should handle parseAsync with sync operations', async () => {
      const guard = new BigIntGuardian();

      const result = await guard.parseAsync(123n);
      asserts.assertEquals(result, 123n);
    });

    it('should handle parseAsync with async transformations', async () => {
      const guard = new BigIntGuardian().process(async (val) => {
        await new Promise((resolve) => setTimeout(resolve, 1));
        return val * 3n;
      });

      const result = await guard.parseAsync(10n);
      asserts.assertEquals(result, 30n);
    });

    it('should handle parseAsync errors', async () => {
      const guard = new BigIntGuardian().min(10n);

      let caught = false;
      try {
        await guard.parseAsync(5n);
      } catch (error) {
        caught = true;
        asserts.assertInstanceOf(error, GuardianError);
      }
      asserts.assert(caught);
    });
  });

  describe('OpenAPI generation', () => {
    it('should generate correct OpenAPI schema', () => {
      const guard = new BigIntGuardian();
      const schema = guard.toOpenAPI();

      asserts.assertEquals(schema.type, 'integer');
      asserts.assertEquals(schema.format, 'int64');
    });

    it('should include min/max in OpenAPI', () => {
      const guard = new BigIntGuardian().min(10n).max(100n);
      const schema = guard.toOpenAPI();

      // OpenAPI converts bigint to number for JSON compatibility
      asserts.assertEquals(schema.minimum, 10);
      asserts.assertEquals(schema.maximum, 100);
    });

    it('should include metadata in OpenAPI schema', () => {
      const guard = new BigIntGuardian().describe({
        title: 'Counter',
        description: 'A large counter value',
        default: 0,
      });

      const schema = guard.toOpenAPI();

      asserts.assertEquals(schema.title, 'Counter');
      asserts.assertEquals(schema.description, 'A large counter value');
      asserts.assertEquals(schema.default, 0);
    });

    it('should handle nullable in OpenAPI', () => {
      const guard = new BigIntGuardian().nullable();
      const schema = guard.toOpenAPI();

      asserts.assertEquals(schema.nullable, true);
    });
  });

  describe('Edge cases with positive/negative/nonNegative', () => {
    it('should handle zero with nonNegative', () => {
      const guard = new BigIntGuardian().nonNegative();

      asserts.assertEquals(guard.parse(0n), 0n);
      asserts.assertEquals(guard.parse(1n), 1n);
      asserts.assertThrows(() => guard.parse(-1n), GuardianError);
    });

    it('should reject zero with positive', () => {
      const guard = new BigIntGuardian().positive();

      asserts.assertEquals(guard.parse(1n), 1n);
      asserts.assertThrows(() => guard.parse(0n), GuardianError);
    });

    it('should reject zero with negative', () => {
      const guard = new BigIntGuardian().negative();

      asserts.assertEquals(guard.parse(-1n), -1n);
      asserts.assertThrows(() => guard.parse(0n), GuardianError);
    });

    it('should handle conflicting positive and negative', () => {
      // Both validations apply - nothing can pass
      const guard = new BigIntGuardian().positive().negative();

      asserts.assertThrows(() => guard.parse(1n), GuardianError);
      asserts.assertThrows(() => guard.parse(-1n), GuardianError);
      asserts.assertThrows(() => guard.parse(0n), GuardianError);
    });
  });

  describe('Immutability of metadata constraints (regression)', () => {
    it('.min() must not mutate the source guardian metadata', () => {
      // Regression: previously `min` set `this._metaData.minimum`
      // before calling `this.process(...)`, leaking the bound back
      // to the source.
      const base = new BigIntGuardian();
      const positives = base.min(0n);

      asserts.assertEquals(positives.metaData?.minimum, 0);
      asserts.assertEquals(base.metaData?.minimum, undefined);
    });

    it('.max() must not mutate the source guardian metadata', () => {
      const base = new BigIntGuardian();
      const small = base.max(100n);

      asserts.assertEquals(small.metaData?.maximum, 100);
      asserts.assertEquals(base.metaData?.maximum, undefined);
    });
  });

  describe('uint / int — fixed-width bigint ranges', () => {
    it('uint(N) accepts values in [0, 2^N)', () => {
      const u8 = new BigIntGuardian().uint(8);
      asserts.assertEquals(u8.parse(0n), 0n);
      asserts.assertEquals(u8.parse(255n), 255n);
      asserts.assertThrows(() => u8.parse(256n), GuardianError);
      asserts.assertThrows(() => u8.parse(-1n), GuardianError);
    });

    it('int(N) accepts values in [-2^(N-1), 2^(N-1))', () => {
      const i8 = new BigIntGuardian().int(8);
      asserts.assertEquals(i8.parse(-128n), -128n);
      asserts.assertEquals(i8.parse(127n), 127n);
      asserts.assertThrows(() => i8.parse(128n), GuardianError);
      asserts.assertThrows(() => i8.parse(-129n), GuardianError);
    });

    it('uint / int reject non-positive integer bit widths', () => {
      asserts.assertThrows(() => new BigIntGuardian().uint(0));
      asserts.assertThrows(() => new BigIntGuardian().uint(-1));
      asserts.assertThrows(() => new BigIntGuardian().int(1.5));
    });
  });
});
