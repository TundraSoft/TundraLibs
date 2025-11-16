import { BaseGuardian } from '../BaseGuardian.ts';
import { GuardianError } from '../GuardianError.ts';
import type { GuardianMetaData } from '../types/mod.ts';

/**
 * Guardian for number validation and transformation.
 * Provides fluent API for building number validation pipelines.
 *
 * @example
 * ```ts
 * const schema = new NumberGuardian()
 *   .min(0)
 *   .max(100)
 *   .integer();
 *
 * const result = schema.parse(42); // 42
 * ```
 *
 * @since 1.0.0
 */
export class NumberGuardian extends BaseGuardian<number> {
  /**
   * Creates a new NumberGuardian instance.
   *
   * @param metaData - Optional metadata for this guardian
   */
  constructor(metaData?: GuardianMetaData) {
    super((input: unknown) => {
      if (typeof input !== 'number') {
        throw new GuardianError('Expected number but got ${got}', {
          expected: 'number',
          got: typeof input,
          comparison: 'type',
          type: 'number',
        });
      }
      if (isNaN(input)) {
        throw new GuardianError('Number cannot be NaN', {
          expected: 'valid number',
          got: 'NaN',
          comparison: 'nan',
          type: 'number',
        });
      }
      return input;
    }, metaData);
  }

  //#region Range Validation Methods

  /**
   * Validates minimum value.
   *
   * @param value - Minimum allowed value
   * @param errorMessage - Optional custom error message
   * @returns New NumberGuardian with minimum value validation
   *
   * @example
   * ```ts
   * const schema = new NumberGuardian().min(0);
   * schema.parse(-1); // throws GuardianError
   * schema.parse(5); // 5
   * ```
   */
  min(value: number, errorMessage?: string): NumberGuardian {
    return this.step((num: number) => {
      if (num < value) {
        throw new GuardianError(
          errorMessage || 'Number must be at least ${expected}',
          {
            expected: value,
            got: num,
            comparison: 'min',
            type: 'number',
          },
        );
      }
      return num;
    }, `Minimum value validation (${value})`) as NumberGuardian;
  }

  /**
   * Validates maximum value.
   *
   * @param value - Maximum allowed value
   * @param errorMessage - Optional custom error message
   * @returns New NumberGuardian with maximum value validation
   *
   * @example
   * ```ts
   * const schema = new NumberGuardian().max(100);
   * schema.parse(101); // throws GuardianError
   * schema.parse(50); // 50
   * ```
   */
  max(value: number, errorMessage?: string): NumberGuardian {
    return this.step((num: number) => {
      if (num > value) {
        throw new GuardianError(
          errorMessage || 'Number must be at most ${expected}',
          {
            expected: value,
            got: num,
            comparison: 'max',
            type: 'number',
          },
        );
      }
      return num;
    }, `Maximum value validation (${value})`) as NumberGuardian;
  }

  //#endregion

  //#region Sign Validation Methods

  /**
   * Validates that number is positive (> 0).
   *
   * @param errorMessage - Optional custom error message
   * @returns New NumberGuardian with positive validation
   */
  positive(errorMessage?: string): NumberGuardian {
    return this.step((num: number) => {
      if (num <= 0) {
        throw new GuardianError(
          errorMessage || 'Number must be positive',
          {
            expected: '> 0',
            got: num,
            comparison: 'positive',
            type: 'number',
          },
        );
      }
      return num;
    }, 'Positive validation') as NumberGuardian;
  }

  /**
   * Validates that number is negative (< 0).
   *
   * @param errorMessage - Optional custom error message
   * @returns New NumberGuardian with negative validation
   */
  negative(errorMessage?: string): NumberGuardian {
    return this.step((num: number) => {
      if (num >= 0) {
        throw new GuardianError(
          errorMessage || 'Number must be negative',
          {
            expected: '< 0',
            got: num,
            comparison: 'negative',
            type: 'number',
          },
        );
      }
      return num;
    }, 'Negative validation') as NumberGuardian;
  }

  /**
   * Validates that number is non-negative (>= 0).
   *
   * @param errorMessage - Optional custom error message
   * @returns New NumberGuardian with non-negative validation
   */
  nonNegative(errorMessage?: string): NumberGuardian {
    return this.step((num: number) => {
      if (num < 0) {
        throw new GuardianError(
          errorMessage || 'Number must be non-negative',
          {
            expected: '>= 0',
            got: num,
            comparison: 'nonNegative',
            type: 'number',
          },
        );
      }
      return num;
    }, 'Non-negative validation') as NumberGuardian;
  }

  /**
   * Validates that number is non-positive (<= 0).
   *
   * @param errorMessage - Optional custom error message
   * @returns New NumberGuardian with non-positive validation
   */
  nonPositive(errorMessage?: string): NumberGuardian {
    return this.step((num: number) => {
      if (num > 0) {
        throw new GuardianError(
          errorMessage || 'Number must be non-positive',
          {
            expected: '<= 0',
            got: num,
            comparison: 'nonPositive',
            type: 'number',
          },
        );
      }
      return num;
    }, 'Non-positive validation') as NumberGuardian;
  }

  //#endregion

  //#region Type Validation Methods

  /**
   * Validates that number is an integer.
   *
   * @param errorMessage - Optional custom error message
   * @returns New NumberGuardian with integer validation
   *
   * @example
   * ```ts
   * const schema = new NumberGuardian().integer();
   * schema.parse(3.14); // throws GuardianError
   * schema.parse(42); // 42
   * ```
   */
  integer(errorMessage?: string): NumberGuardian {
    return this.step((num: number) => {
      if (!Number.isInteger(num)) {
        throw new GuardianError(
          errorMessage || 'Number must be an integer',
          {
            expected: 'integer',
            got: num,
            comparison: 'integer',
            type: 'number',
          },
        );
      }
      return num;
    }, 'Integer validation') as NumberGuardian;
  }

  /**
   * Validates that number is finite (not Infinity or -Infinity).
   *
   * @param errorMessage - Optional custom error message
   * @returns New NumberGuardian with finite validation
   */
  finite(errorMessage?: string): NumberGuardian {
    return this.step((num: number) => {
      if (!Number.isFinite(num)) {
        throw new GuardianError(
          errorMessage || 'Number must be finite',
          {
            expected: 'finite number',
            got: num,
            comparison: 'finite',
            type: 'number',
          },
        );
      }
      return num;
    }, 'Finite validation') as NumberGuardian;
  }

  /**
   * Validates that number is safe integer (within JavaScript's safe integer range).
   *
   * @param errorMessage - Optional custom error message
   * @returns New NumberGuardian with safe integer validation
   */
  safeInteger(errorMessage?: string): NumberGuardian {
    return this.step((num: number) => {
      if (!Number.isSafeInteger(num)) {
        throw new GuardianError(
          errorMessage || 'Number must be a safe integer',
          {
            expected:
              `between ${Number.MIN_SAFE_INTEGER} and ${Number.MAX_SAFE_INTEGER}`,
            got: num,
            comparison: 'safeInteger',
            type: 'number',
          },
        );
      }
      return num;
    }, 'Safe integer validation') as NumberGuardian;
  }

  /**
   * Validates that number is a multiple of the given value.
   *
   * @param divisor - The divisor to check against
   * @param errorMessage - Optional custom error message
   * @returns New NumberGuardian with multiple validation
   *
   * @example
   * ```ts
   * const schema = new NumberGuardian().multipleOf(5);
   * schema.parse(7); // throws GuardianError
   * schema.parse(10); // 10
   * ```
   */
  multipleOf(divisor: number, errorMessage?: string): NumberGuardian {
    return this.step((num: number) => {
      if (num % divisor !== 0) {
        throw new GuardianError(
          errorMessage || `Number must be a multiple of ${divisor}`,
          {
            expected: `multiple of ${divisor}`,
            got: num,
            comparison: 'multipleOf',
            type: 'number',
          },
        );
      }
      return num;
    }, `Multiple of ${divisor} validation`) as NumberGuardian;
  }

  //#endregion

  //#region Mathematical Transformation Methods

  /**
   * Rounds the number to the nearest integer.
   *
   * @returns New NumberGuardian that rounds to nearest integer
   *
   * @example
   * ```ts
   * const schema = new NumberGuardian().round();
   * schema.parse(3.7); // 4
   * schema.parse(3.2); // 3
   * ```
   */
  round(): NumberGuardian {
    return this.step(
      (num: number) => Math.round(num),
      'Round to nearest integer',
    ) as NumberGuardian;
  }

  /**
   * Floors the number (rounds down to nearest integer).
   *
   * @returns New NumberGuardian that floors the number
   */
  floor(): NumberGuardian {
    return this.step(
      (num: number) => Math.floor(num),
      'Floor to integer',
    ) as NumberGuardian;
  }

  /**
   * Ceils the number (rounds up to nearest integer).
   *
   * @returns New NumberGuardian that ceils the number
   */
  ceil(): NumberGuardian {
    return this.step(
      (num: number) => Math.ceil(num),
      'Ceil to integer',
    ) as NumberGuardian;
  }

  /**
   * Truncates the number (removes decimal part).
   *
   * @returns New NumberGuardian that truncates the number
   */
  trunc(): NumberGuardian {
    return this.step(
      (num: number) => Math.trunc(num),
      'Truncate decimal part',
    ) as NumberGuardian;
  }

  /**
   * Gets absolute value of the number.
   *
   * @returns New NumberGuardian with absolute value
   */
  abs(): NumberGuardian {
    return this.step(
      (num: number) => Math.abs(num),
      'Absolute value',
    ) as NumberGuardian;
  }

  //#endregion

  //#region Type Transformation Methods

  /**
   * Transforms number to string.
   *
   * @param radix - Optional radix for string conversion (default: 10)
   * @returns New StringGuardian with string transformation
   *
   * @example
   * ```ts
   * const schema = new NumberGuardian().toString();
   * schema.parse(123); // '123'
   *
   * const hexSchema = new NumberGuardian().toString(16);
   * schema.parse(255); // 'ff'
   * ```
   */
  override toString(
    radix?: number,
    description?: string,
  ): BaseGuardian<string> {
    return this.mutate((num: number) => {
      return num.toString(radix);
    }, description || 'Convert number to string');
  }

  /**
   * Transforms number to BigInt.
   *
   * @param errorMessage - Optional custom error message
   * @returns New BaseGuardian<bigint> with BigInt transformation
   *
   * @example
   * ```ts
   * const schema = new NumberGuardian().toBigInt();
   * schema.parse(123); // 123n
   * schema.parse(3.14); // throws GuardianError (must be integer)
   * ```
   */
  toBigInt(errorMessage?: string): BaseGuardian<bigint> {
    return this.mutate((num: number) => {
      if (!Number.isInteger(num)) {
        throw new GuardianError(
          errorMessage || 'Cannot convert non-integer to BigInt',
          {
            expected: 'integer',
            got: num,
            comparison: 'conversion',
            type: 'bigint',
          },
        );
      }
      return BigInt(num);
    }, 'Number to BigInt transformation');
  }

  /**
   * Transforms number to Date (treating number as milliseconds since epoch).
   *
   * @param errorMessage - Optional custom error message
   * @returns New BaseGuardian<Date> with Date transformation
   */
  toDate(errorMessage?: string): BaseGuardian<Date> {
    return this.mutate((num: number) => {
      const date = new Date(num);
      if (isNaN(date.getTime())) {
        throw new GuardianError(
          errorMessage || 'Cannot convert number to date',
          {
            expected: 'valid timestamp',
            got: num,
            comparison: 'conversion',
            type: 'date',
          },
        );
      }
      return date;
    }, 'Number to date transformation (as timestamp)');
  }

  //#endregion
}
