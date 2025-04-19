import { BaseGuardian } from '../BaseGuardian.ts';
import type { FunctionType, GuardianProxy } from '../types/mod.ts';
import { BigIntGuardian } from './BigInt.ts';
import { StringGuardian } from './String.ts';
import { DateGuardian } from './Date.ts';
import { GuardianError } from '../GuardianError.ts';
import { getType } from '../helpers/mod.ts';

/**
 * NumberGuardian provides validation and transformation utilities for number values.
 * It extends BaseGuardian to provide a chainable API for number processing.
 *
 * @example
 * ```ts
 * const positiveInteger = NumberGuardian.create()
 *   .positive()
 *   .integer();
 *
 * // Validate a number
 * const validatedNumber = positiveInteger(42); // Returns: 42
 * positiveInteger(-5); // Throws: "Expected positive number, got -5"
 * ```
 */
export class NumberGuardian extends BaseGuardian<FunctionType<number>> {
  /**
   * Creates a new NumberGuardian instance that validates if a value is a number.
   *
   * @param error - Custom error message to use when validation fails
   * @returns A proxy that acts as both the guardian function and method provider
   *
   * @example
   * ```ts
   * const numberGuard = NumberGuardian.create();
   * const num = numberGuard(123); // Returns: 123
   * numberGuard("abc"); // Throws: "Expected number, got string"
   * ```
   */
  static create(error?: string): GuardianProxy<NumberGuardian> {
    return new NumberGuardian((value: unknown): number => {
      // Already a number
      if (typeof value === 'number' && !Number.isNaN(value)) {
        return value;
      }

      // Try to parse string as number
      if (typeof value === 'string') {
        const parsedValue = Number(value.trim());
        if (!Number.isNaN(parsedValue)) {
          return parsedValue;
        }
      }

      // Value is not a valid number
      throw new GuardianError(
        {
          got: Array.isArray(value)
            ? 'array'
            : value === undefined
            ? 'undefined'
            : value === null
            ? null
            : typeof value,
          expected: 'number',
          comparison: 'type',
          type: getType(value),
        },
        error || 'Expected value to be a number, got ${type}',
      );
    }).proxy();
  }

  //#region Transformations
  /**
   * Rounds the number up to the nearest integer or specified decimal place.
   *
   * @returns A new Guardian instance with the ceiling transformation applied
   *
   * @example
   * ```ts
   * NumberGuardian.create()(3.14).ceil(); // Returns: 4
   * ```
   */
  public ceil(): GuardianProxy<this> {
    return this.transform((value) => Math.ceil(value));
  }

  /**
   * Rounds the number down to the nearest integer or specified decimal place.
   *
   * @returns A new Guardian instance with the floor transformation applied
   *
   * @example
   * ```ts
   * NumberGuardian.create()(3.14).floor(); // Returns: 3
   * ```
   */
  public floor(): GuardianProxy<this> {
    return this.transform((value) => Math.floor(value));
  }

  /**
   * Returns the absolute value of the number.
   *
   * @returns A new Guardian instance with the absolute value transformation applied
   *
   * @example
   * ```ts
   * NumberGuardian.create()(-5).abs(); // Returns: 5
   * ```
   */
  public abs(): GuardianProxy<this> {
    return this.transform((value) => Math.abs(value));
  }

  /**
   * Negates the number (multiplies by -1).
   *
   * @returns A new Guardian instance with the negation transformation applied
   *
   * @example
   * ```ts
   * NumberGuardian.create()(5).negate(); // Returns: -5
   * ```
   */
  public negate(): GuardianProxy<this> {
    return this.transform((value) => -value);
  }

  /**
   * Ensures the number is within the specified range by clamping it to min/max boundaries.
   *
   * @param min - The minimum value the number can be
   * @param max - The maximum value the number can be
   * @returns A new Guardian instance with the clamp transformation applied
   *
   * @example
   * ```ts
   * NumberGuardian.create()(10).clamp(0, 5); // Returns: 5
   * NumberGuardian.create()(-10).clamp(0, 5); // Returns: 0
   * ```
   */
  public clamp(min: number, max: number): GuardianProxy<this> {
    return this.transform((value) => Math.min(Math.max(value, min), max));
  }

  /**
   * Rounds the number to a specified number of decimal places.
   *
   * @param digits - The number of decimal places to round to
   * @returns A new Guardian instance with the fixed-precision transformation applied
   *
   * @example
   * ```ts
   * NumberGuardian.create()(3.14159).toFixed(2); // Returns: 3.14
   * ```
   */
  public toFixed(digits: number): GuardianProxy<this> {
    return this.transform((value) => parseFloat(value.toFixed(digits)));
  }

  /**
   * Converts the number to a BigInt.
   *
   * @returns A BigIntGuardian instance containing the converted value
   * @throws If the number is not an integer or is not finite
   *
   * @example
   * ```ts
   * NumberGuardian.create()(123).toBigInt(); // Returns BigIntGuardian with value 123n
   * ```
   */
  public toBigInt(): GuardianProxy<BigIntGuardian> {
    return this.transform((value) => BigInt(value), BigIntGuardian);
  }

  /**
   * Converts the number to a string using the specified radix.
   *
   * @param radix - The base to use for representing the number as a string (between 2 and 36)
   * @returns A StringGuardian instance containing the string representation
   *
   * @example
   * ```ts
   * NumberGuardian.create()(15).toString(16); // Returns StringGuardian with value "f"
   * ```
   */
  public override toString(radix?: number): GuardianProxy<StringGuardian> {
    return this.transform((value) => value.toString(radix), StringGuardian);
  }

  /**
   * Converts the number to a Date object (treating the number as milliseconds since Unix epoch).
   *
   * @returns A DateGuardian instance containing the Date representation
   *
   * @example
   * ```ts
   * NumberGuardian.create()(1609459200000).toDate(); // Returns DateGuardian with value Date(2021-01-01)
   * ```
   */
  public toDate(): GuardianProxy<DateGuardian> {
    return this.transform((value) => new Date(value), DateGuardian);
  }
  //#endregion Transformations

  //#region Validations
  /**
   * Validates that the number is greater than or equal to the specified minimum value.
   *
   * @param min - The minimum value (inclusive) that the number must be
   * @param error - Custom error message to use when validation fails
   * @returns A new Guardian instance with the minimum validation applied
   *
   * @example
   * ```ts
   * NumberGuardian.create()(5).min(10); // Throws: "Expected value (5) to be greater than or equal to 10"
   * ```
   */
  public min(min: number, error?: string): GuardianProxy<this> {
    return this.test(
      (value) => value >= min,
      error ||
        'Expected value (${got}) to be greater than or equal to ${expected}',
      min,
    );
  }

  /**
   * Validates that the number is less than or equal to the specified maximum value.
   *
   * @param max - The maximum value (inclusive) that the number must be
   * @param error - Custom error message to use when validation fails
   * @returns A new Guardian instance with the maximum validation applied
   *
   * @example
   * ```ts
   * NumberGuardian.create()(15).max(10); // Throws: "Expected value (15) to be less than or equal to 10"
   * ```
   */
  public max(max: number, error?: string): GuardianProxy<this> {
    return this.test(
      (value) => value <= max,
      error ||
        'Expected value (${got}) to be less than or equal to ${expected}',
      max,
    );
  }

  /**
   * Validates that the number is within the specified range (inclusive).
   *
   * @param min - The minimum value (inclusive) that the number must be
   * @param max - The maximum value (inclusive) that the number must be
   * @param error - Custom error message to use when validation fails
   * @returns A new Guardian instance with the range validation applied
   *
   * @example
   * ```ts
   * NumberGuardian.create()(15).range(0, 10); // Throws: "Expected value (15) to be between 0 and 10"
   * ```
   */
  public range(min: number, max: number, error?: string): GuardianProxy<this> {
    return this.test(
      (value) => value >= min && value <= max,
      error ||
        'Expected value (${got}) to be between ${expected}',
      [min, max],
    );
  }

  /**
   * Validates that the number is an integer (no decimal part).
   *
   * @param error - Custom error message to use when validation fails
   * @returns A new Guardian instance with the integer validation applied
   *
   * @example
   * ```ts
   * NumberGuardian.create()(3.14).integer(); // Throws: "Expected integer, got 3.14"
   * ```
   */
  public integer(error?: string): GuardianProxy<this> {
    return this.test(
      (value) => Number.isInteger(value),
      error || 'Expected integer, got ${got}',
    );
  }

  /**
   * Validates that the number is positive (greater than zero).
   *
   * @param error - Custom error message to use when validation fails
   * @returns A new Guardian instance with the positive validation applied
   *
   * @example
   * ```ts
   * NumberGuardian.create()(-5).positive(); // Throws: "Expected positive number, got -5"
   * ```
   */
  public positive(error?: string): GuardianProxy<this> {
    return this.test(
      (value) => value > 0,
      error || 'Expected positive number, got ${got}',
    );
  }

  /**
   * Validates that the number is negative (less than zero).
   *
   * @param error - Custom error message to use when validation fails
   * @returns A new Guardian instance with the negative validation applied
   *
   * @example
   * ```ts
   * NumberGuardian.create()(5).negative(); // Throws: "Expected negative number, got 5"
   * ```
   */
  public negative(error?: string): GuardianProxy<this> {
    return this.test(
      (value) => value < 0,
      error || 'Expected negative number, got ${got}',
    );
  }

  /**
   * Validates that the number is a multiple of the specified base.
   *
   * @param base - The base value to check if the number is a multiple of
   * @param error - Custom error message to use when validation fails
   * @returns A new Guardian instance with the multipleOf validation applied
   *
   * @example
   * ```ts
   * NumberGuardian.create()(7).multipleOf(2); // Throws: "Expected value (7) to be multiple of 2"
   * ```
   */
  public multipleOf(base: number, error?: string): GuardianProxy<this> {
    return this.test(
      (value) => value % base === 0,
      error || 'Expected value (${got}) to be multiple of ${expected}',
      base,
    );
  }

  /**
   * Validates that the number is odd.
   *
   * @param error - Custom error message to use when validation fails
   * @returns A new Guardian instance with the odd validation applied
   *
   * @example
   * ```ts
   * NumberGuardian.create()(2).odd(); // Throws: "Expected odd number, got 2"
   * ```
   */
  public odd(error?: string): GuardianProxy<this> {
    return this.test(
      (value) => value % 2 !== 0,
      error || 'Expected odd number, got ${got}',
    );
  }

  /**
   * Validates that the number is even.
   *
   * @param error - Custom error message to use when validation fails
   * @returns A new Guardian instance with the even validation applied
   *
   * @example
   * ```ts
   * NumberGuardian.create()(3).even(); // Throws: "Expected even number, got 3"
   * ```
   */
  public even(error?: string): GuardianProxy<this> {
    return this.test(
      (value) => value % 2 === 0,
      error || 'Expected even number, got ${got}',
    );
  }

  /**
   * Validates that the number is a prime number.
   * Prime numbers are natural numbers greater than 1 that have no positive divisors other than 1 and themselves.
   *
   * @param error - Custom error message to use when validation fails
   * @returns A new Guardian instance with the prime validation applied
   *
   * @example
   * ```ts
   * NumberGuardian.create()(4).prime(); // Throws: "Expected prime number, got 4"
   * ```
   */
  public prime(error?: string): GuardianProxy<this> {
    return this.test(
      (value) => {
        if (value < 2) return false;
        if (value === 2) return true;
        if (value % 2 === 0) return false;
        for (let i = 3; i <= Math.sqrt(value); i += 2) {
          if (value % i === 0) return false;
        }
        return true;
      },
      error || 'Expected prime number, got ${got}',
    );
  }

  /**
   * Validates that the number is finite (not Infinity or -Infinity).
   *
   * @param error - Custom error message to use when validation fails
   * @returns A new Guardian instance with the finite validation applied
   *
   * @example
   * ```ts
   * NumberGuardian.create()(Infinity).finite(); // Throws: "Expected finite number, got Infinity"
   * ```
   */
  public finite(error?: string): GuardianProxy<this> {
    return this.test(
      (value) => Number.isFinite(value),
      error || 'Expected finite number, got ${got}',
    );
  }

  /**
   * Validates that the number is a safe integer (between Number.MIN_SAFE_INTEGER and Number.MAX_SAFE_INTEGER).
   *
   * @param error - Custom error message to use when validation fails
   * @returns A new Guardian instance with the safe integer validation applied
   *
   * @example
   * ```ts
   * NumberGuardian.create()(Number.MAX_SAFE_INTEGER + 1).safe(); // Throws: "Expected safe integer, got 9007199254740992"
   * ```
   */
  public safe(error?: string): GuardianProxy<this> {
    return this.test(
      (value) => Number.isSafeInteger(value),
      error || 'Expected safe integer, got ${got}',
    );
  }

  /**
   * Validates that the number is not zero.
   *
   * @param error - Custom error message to use when validation fails
   * @returns A new Guardian instance with the non-zero validation applied
   *
   * @example
   * ```ts
   * NumberGuardian.create()(0).nonZero(); // Throws: "Expected non-zero number"
   * ```
   */
  public nonZero(error?: string): GuardianProxy<this> {
    return this.test(
      (value) => value !== 0,
      error || 'Expected non-zero number',
    );
  }

  /**
   * Validates that the number is divisible by the specified divisor.
   *
   * @param divisor - The divisor that the number must be divisible by
   * @param error - Custom error message to use when validation fails
   * @returns A new Guardian instance with the divisibility validation applied
   *
   * @example
   * ```ts
   * NumberGuardian.create()(5).divisibleBy(2); // Throws: "Expected value (5) to be divisible by 2"
   * ```
   */
  public divisibleBy(divisor: number, error?: string): GuardianProxy<this> {
    return this.test(
      (value) => value % divisor === 0,
      error || 'Expected value (${got}) to be divisible by ${expected}',
      divisor,
    );
  }

  /**
   * Validates that the number is a valid port number (between 0 and 65535).
   *
   * @param error - Custom error message to use when validation fails
   * @returns A new Guardian instance with the port validation applied
   *
   * @example
   * ```ts
   * NumberGuardian.create()(70000).port(); // Throws: "Expected valid port number (0-65535), got 70000"
   * ```
   */
  public port(error?: string): GuardianProxy<this> {
    return this.test(
      (value) => Number.isInteger(value) && value >= 0 && value <= 65535,
      error || 'Expected valid port number (0-65535), got ${got}',
    );
  }

  /**
   * Validates that the number is a percentage (between 0 and 100).
   *
   * @param error - Custom error message to use when validation fails
   * @returns A new Guardian instance with the percentage validation applied
   *
   * @example
   * ```ts
   * NumberGuardian.create()(110).percentage(); // Throws: "Expected value to be percentage (0-100), got 110"
   * ```
   */
  public percentage(error?: string): GuardianProxy<this> {
    return this.test(
      (value) => value >= 0 && value <= 100,
      error || 'Expected value to be percentage (0-100), got ${got}',
    );
  }

  /**
   * Validates that the number is a valid Unix timestamp (can be used to create a valid Date).
   *
   * @param error - Custom error message to use when validation fails
   * @returns A new Guardian instance with the timestamp validation applied
   *
   * @example
   * ```ts
   * NumberGuardian.create()(1609459200000).isTimestamp(); // Valid (Jan 1, 2021)
   * ```
   */
  public isTimestamp(error?: string): GuardianProxy<this> {
    return this.test(
      (value) => new Date(value).getTime() === value,
      error || 'Expected value to be a timestamp, got ${got}',
    );
  }
  //#endregion Validations
}
