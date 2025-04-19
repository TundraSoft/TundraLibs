import { BaseGuardian } from '../BaseGuardian.ts';
import { GuardianError } from '../GuardianError.ts';
import type { FunctionType, GuardianProxy } from '../types/mod.ts';
import { getType } from '../helpers/mod.ts';
/**
 * BigIntGuardian provides validation and transformation utilities for bigint values.
 * It extends BaseGuardian to provide a chainable API for bigint processing.
 *
 * @example
 * ```ts
 * const positiveBigInt = BigIntGuardian.create()
 *   .positive();
 *
 * // Validate a bigint
 * const validatedBigInt = positiveBigInt(42n); // Returns: 42n
 * positiveBigInt(-5n); // Throws: "Expected positive BigInt, got -5"
 * ```
 */
export class BigIntGuardian extends BaseGuardian<FunctionType<bigint>> {
  /**
   * Creates a new BigIntGuardian instance that validates if a value is a bigint.
   * This method also handles conversion from numbers and strings when possible.
   *
   * @param error - Custom error message to use when validation fails
   * @returns A proxy that acts as both the guardian function and method provider
   *
   * @example
   * ```ts
   * const bigIntGuard = BigIntGuardian.create();
   * const num = bigIntGuard(123n); // Returns: 123n
   * bigIntGuard(123); // Returns: 123n (automatic conversion)
   * bigIntGuard("123"); // Returns: 123n (automatic conversion)
   * bigIntGuard("abc"); // Throws: "Expected bigint, got string"
   * ```
   */
  static create(error?: string): GuardianProxy<BigIntGuardian> {
    return new BigIntGuardian((value: unknown): bigint => {
      if (typeof value === 'bigint') return value;

      // Support conversion from number if it's an integer
      if (
        typeof value === 'number' && Number.isInteger(value) &&
        Number.isFinite(value)
      ) {
        return BigInt(value);
      }

      // Support conversion from string if it's a valid bigint string
      if (typeof value === 'string' && /^[-+]?\d+$/.test(value)) {
        try {
          return BigInt(value);
        } catch {
          // Fall through to error
        }
      }

      throw new GuardianError(
        {
          got: value,
          expected: 'bigint',
          comparison: 'type',
          type: getType(value),
        },
        error || 'Expected value to be bigint, got ${type}',
      );
    }).proxy();
  }

  //#region Transformations
  /**
   * Returns the absolute value of the bigint.
   *
   * @returns A new Guardian instance with the absolute value transformation applied
   *
   * @example
   * ```ts
   * BigIntGuardian.create()(-5n).abs(); // Returns: 5n
   * ```
   */
  public abs(): GuardianProxy<this> {
    return this.transform((value) => value < 0n ? -value : value);
  }

  /**
   * Negates the bigint (multiplies by -1).
   *
   * @returns A new Guardian instance with the negation transformation applied
   *
   * @example
   * ```ts
   * BigIntGuardian.create()(5n).negate(); // Returns: -5n
   * ```
   */
  public negate(): GuardianProxy<this> {
    return this.transform((value) => -value);
  }

  /**
   * Performs a bitwise AND operation with the specified operand.
   *
   * @param operand - The bigint to AND with the current value
   * @returns A new Guardian instance with the bitwise AND transformation applied
   *
   * @example
   * ```ts
   * BigIntGuardian.create()(5n).bitwiseAnd(3n); // Returns: 1n
   * ```
   */
  public bitwiseAnd(operand: bigint): GuardianProxy<this> {
    return this.transform((value) => value & operand);
  }

  /**
   * Performs a bitwise OR operation with the specified operand.
   *
   * @param operand - The bigint to OR with the current value
   * @returns A new Guardian instance with the bitwise OR transformation applied
   *
   * @example
   * ```ts
   * BigIntGuardian.create()(5n).bitwiseOr(3n); // Returns: 7n
   * ```
   */
  public bitwiseOr(operand: bigint): GuardianProxy<this> {
    return this.transform((value) => value | operand);
  }

  /**
   * Performs a bitwise XOR operation with the specified operand.
   *
   * @param operand - The bigint to XOR with the current value
   * @returns A new Guardian instance with the bitwise XOR transformation applied
   *
   * @example
   * ```ts
   * BigIntGuardian.create()(5n).bitwiseXor(3n); // Returns: 6n
   * ```
   */
  public bitwiseXor(operand: bigint): GuardianProxy<this> {
    return this.transform((value) => value ^ operand);
  }

  /**
   * Performs a bitwise NOT operation on the bigint.
   *
   * @returns A new Guardian instance with the bitwise NOT transformation applied
   *
   * @example
   * ```ts
   * BigIntGuardian.create()(5n).bitwiseNot(); // Returns: -6n
   * ```
   */
  public bitwiseNot(): GuardianProxy<this> {
    return this.transform((value) => ~value);
  }

  /**
   * Performs a left shift operation by the specified number of bits.
   *
   * @param shift - The number of bits to shift left by
   * @returns A new Guardian instance with the left shift transformation applied
   *
   * @example
   * ```ts
   * BigIntGuardian.create()(1n).leftShift(2); // Returns: 4n
   * ```
   */
  public leftShift(shift: number): GuardianProxy<this> {
    return this.transform((value) => value << BigInt(shift));
  }

  /**
   * Performs a right shift operation by the specified number of bits.
   *
   * @param shift - The number of bits to shift right by
   * @returns A new Guardian instance with the right shift transformation applied
   *
   * @example
   * ```ts
   * BigIntGuardian.create()(4n).rightShift(2); // Returns: 1n
   * ```
   */
  public rightShift(shift: number): GuardianProxy<this> {
    return this.transform((value) => value >> BigInt(shift));
  }

  /**
   * Calculates the modulo (remainder) with the specified divisor.
   * Unlike the native % operator, this ensures the result is always positive.
   *
   * @param divisor - The divisor to use for the modulo operation
   * @returns A new Guardian instance with the modulo transformation applied
   *
   * @example
   * ```ts
   * BigIntGuardian.create()(5n).mod(3n); // Returns: 2n
   * BigIntGuardian.create()(-5n).mod(3n); // Returns: 1n (positive result)
   * ```
   */
  public mod(divisor: bigint): GuardianProxy<this> {
    return this.transform((value) => {
      const result = value % divisor;
      return result >= 0n ? result : result + divisor;
    });
  }

  /**
   * Raises the bigint to the power of the specified exponent.
   *
   * @param exponent - The exponent to raise the bigint to (must be non-negative)
   * @returns A new Guardian instance with the power transformation applied
   * @throws If the exponent is negative (not supported for bigint)
   *
   * @example
   * ```ts
   * BigIntGuardian.create()(2n).pow(3n); // Returns: 8n
   * ```
   */
  public pow(exponent: bigint): GuardianProxy<this> {
    if (exponent < 0n) {
      throw new Error('Negative exponents not supported for BigInt');
    }
    return this.transform((value) => {
      return value ** exponent;
    });
  }
  //#endregion Transformations

  //#region Validations
  /**
   * Validates that the bigint is greater than or equal to the specified minimum value.
   *
   * @param min - The minimum value (inclusive) that the bigint must be
   * @param error - Custom error message to use when validation fails
   * @returns A new Guardian instance with the minimum validation applied
   *
   * @example
   * ```ts
   * BigIntGuardian.create()(5n).min(10n); // Throws: "Expected value (5) to be greater than or equal to 10"
   * ```
   */
  public min(min: bigint, error?: string): GuardianProxy<this> {
    return this.test(
      (value) => value >= min,
      error ||
        'Expected value (${got}) to be greater than or equal to ${expected}',
      min,
    );
  }

  /**
   * Validates that the bigint is less than or equal to the specified maximum value.
   *
   * @param max - The maximum value (inclusive) that the bigint must be
   * @param error - Custom error message to use when validation fails
   * @returns A new Guardian instance with the maximum validation applied
   *
   * @example
   * ```ts
   * BigIntGuardian.create()(15n).max(10n); // Throws: "Expected value (15) to be less than or equal to 10"
   * ```
   */
  public max(max: bigint, error?: string): GuardianProxy<this> {
    return this.test(
      (value) => value <= max,
      error ||
        'Expected value (${got}) to be less than or equal to ${expected}',
      max,
    );
  }

  /**
   * Validates that the bigint is within the specified range (inclusive).
   *
   * @param min - The minimum value (inclusive) that the bigint must be
   * @param max - The maximum value (inclusive) that the bigint must be
   * @param error - Custom error message to use when validation fails
   * @returns A new Guardian instance with the range validation applied
   *
   * @example
   * ```ts
   * BigIntGuardian.create()(15n).range(0n, 10n); // Throws: "Expected value (15) to be between 0 and 10"
   * ```
   */
  public range(min: bigint, max: bigint, error?: string): GuardianProxy<this> {
    return this.test(
      (value) => value >= min && value <= max,
      error ||
        'Expected value (${got}) to be between ${expected}',
      [min, max],
    );
  }

  /**
   * Validates that the bigint is positive (greater than zero).
   *
   * @param error - Custom error message to use when validation fails
   * @returns A new Guardian instance with the positive validation applied
   *
   * @example
   * ```ts
   * BigIntGuardian.create()(-5n).positive(); // Throws: "Expected positive BigInt, got -5"
   * ```
   */
  public positive(error?: string): GuardianProxy<this> {
    return this.test(
      (value) => value > 0n,
      error || 'Expected positive BigInt, got ${got}',
    );
  }

  /**
   * Validates that the bigint is negative (less than zero).
   *
   * @param error - Custom error message to use when validation fails
   * @returns A new Guardian instance with the negative validation applied
   *
   * @example
   * ```ts
   * BigIntGuardian.create()(5n).negative(); // Throws: "Expected negative BigInt, got 5"
   * ```
   */
  public negative(error?: string): GuardianProxy<this> {
    return this.test(
      (value) => value < 0n,
      error || 'Expected negative BigInt, got ${got}',
    );
  }

  /**
   * Validates that the bigint is not zero.
   *
   * @param error - Custom error message to use when validation fails
   * @returns A new Guardian instance with the non-zero validation applied
   *
   * @example
   * ```ts
   * BigIntGuardian.create()(0n).nonZero(); // Throws: "Expected non-zero BigInt"
   * ```
   */
  public nonZero(error?: string): GuardianProxy<this> {
    return this.test(
      (value) => value !== 0n,
      error || 'Expected non-zero BigInt',
    );
  }

  /**
   * Validates that the bigint is even.
   *
   * @param error - Custom error message to use when validation fails
   * @returns A new Guardian instance with the even validation applied
   *
   * @example
   * ```ts
   * BigIntGuardian.create()(3n).even(); // Throws: "Expected even BigInt, got 3"
   * ```
   */
  public even(error?: string): GuardianProxy<this> {
    return this.test(
      (value) => value % 2n === 0n,
      error || 'Expected even BigInt, got ${got}',
    );
  }

  /**
   * Validates that the bigint is odd.
   *
   * @param error - Custom error message to use when validation fails
   * @returns A new Guardian instance with the odd validation applied
   *
   * @example
   * ```ts
   * BigIntGuardian.create()(2n).odd(); // Throws: "Expected odd BigInt, got 2"
   * ```
   */
  public odd(error?: string): GuardianProxy<this> {
    return this.test(
      (value) => value % 2n === 1n || value % 2n === -1n,
      error || 'Expected odd BigInt, got ${got}',
    );
  }

  /**
   * Validates that the bigint is a prime number.
   * Prime numbers are natural numbers greater than 1 that have no positive divisors other than 1 and themselves.
   *
   * @param error - Custom error message to use when validation fails
   * @returns A new Guardian instance with the prime validation applied
   *
   * @example
   * ```ts
   * BigIntGuardian.create()(4n).prime(); // Throws: "Expected prime BigInt, got 4"
   * ```
   */
  public prime(error?: string): GuardianProxy<this> {
    return this.test(
      (value) => {
        if (value < 2n) return false;
        if (value === 2n) return true;
        if (value % 2n === 0n) return false;

        // Use a more efficient algorithm with sqrt boundary
        for (let i = 3n; i * i <= value; i += 2n) {
          if (value % i === 0n) return false;
        }
        return true;
      },
      error || 'Expected prime BigInt, got ${got}',
    );
  }

  /**
   * Validates that the bigint is a multiple of the specified base.
   *
   * @param base - The base value to check if the bigint is a multiple of
   * @param error - Custom error message to use when validation fails
   * @returns A new Guardian instance with the multipleOf validation applied
   *
   * @example
   * ```ts
   * BigIntGuardian.create()(7n).multipleOf(2n); // Throws: "Expected value (7) to be multiple of 2"
   * ```
   */
  public multipleOf(base: bigint, error?: string): GuardianProxy<this> {
    return this.test(
      (value) => value % base === 0n,
      error || 'Expected value (${got}) to be multiple of ${expected}',
      base,
    );
  }

  /**
   * Validates that the bigint is divisible by the specified divisor.
   *
   * @param divisor - The divisor that the bigint must be divisible by
   * @param error - Custom error message to use when validation fails
   * @returns A new Guardian instance with the divisibility validation applied
   *
   * @example
   * ```ts
   * BigIntGuardian.create()(5n).divisibleBy(2n); // Throws: "Expected value (5) to be divisible by 2"
   * ```
   */
  public divisibleBy(divisor: bigint, error?: string): GuardianProxy<this> {
    return this.test(
      (value) => value % divisor === 0n,
      error || 'Expected value (${got}) to be divisible by ${expected}',
      divisor,
    );
  }

  /**
   * Validates that the bigint fits within the specified number of bits.
   *
   * @param bits - The maximum number of bits the bigint should fit within
   * @param error - Custom error message to use when validation fails
   * @returns A new Guardian instance with the bit length validation applied
   *
   * @example
   * ```ts
   * BigIntGuardian.create()(256n).bitLength(8); // Throws: "Expected value (256) to fit within 8 bits"
   * ```
   */
  public bitLength(bits: number, error?: string): GuardianProxy<this> {
    return this.test(
      (value) => {
        const absValue = value < 0n ? -value : value;
        return absValue < (1n << BigInt(bits));
      },
      error || 'Expected value (${got}) to fit within ${expected} bits',
      bits,
    );
  }
  //#endregion Validations
}
