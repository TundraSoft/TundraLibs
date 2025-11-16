import { BaseGuardian } from '../BaseGuardian.ts';
import { GuardianError } from '../GuardianError.ts';
import type { GuardianMetaData } from '../types/mod.ts';

/**
 * Guardian for BigInt validation and transformation.
 * Provides fluent API for building BigInt validation pipelines.
 *
 * @example
 * ```ts
 * const schema = new BigIntGuardian()
 *   .min(0n)
 *   .max(1000n);
 *
 * const result = schema.parse(42n); // 42n
 * ```
 *
 * @since 1.0.0
 */
export class BigIntGuardian extends BaseGuardian<bigint> {
  /**
   * Creates a new BigIntGuardian instance.
   *
   * @param metaData - Optional metadata for this guardian
   */
  constructor(metaData?: GuardianMetaData) {
    super((input: unknown) => {
      if (typeof input !== 'bigint') {
        throw new GuardianError('Expected bigint but got ${got}', {
          expected: 'bigint',
          got: typeof input,
          comparison: 'type',
          type: 'bigint',
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
   * @returns New BigIntGuardian with minimum value validation
   *
   * @example
   * ```ts
   * const schema = new BigIntGuardian().min(0n);
   * schema.parse(-1n); // throws GuardianError
   * schema.parse(5n); // 5n
   * ```
   */
  min(value: bigint, errorMessage?: string): BigIntGuardian {
    return this.step(
      (num: bigint) => {
        if (num < value) {
          throw new Error(); // Just throw any error, step will wrap it
        }
        return num;
      },
      errorMessage || `BigInt must be at least ${value}`,
      'gte',
    ) as BigIntGuardian;
  }

  /**
   * Validates maximum value.
   *
   * @param value - Maximum allowed value
   * @param errorMessage - Optional custom error message
   * @returns New BigIntGuardian with maximum value validation
   */
  max(value: bigint, errorMessage?: string): BigIntGuardian {
    return this.step(
      (num: bigint) => {
        if (num > value) {
          throw new Error(); // Just throw any error, step will wrap it
        }
        return num;
      },
      errorMessage || `BigInt must be at most ${value}`,
      'lte',
    ) as BigIntGuardian;
  }

  //#endregion

  //#region Sign Validation Methods

  /**
   * Validates that BigInt is positive (> 0n).
   *
   * @param errorMessage - Optional custom error message
   * @returns New BigIntGuardian with positive validation
   */
  positive(errorMessage?: string): BigIntGuardian {
    return this.step(
      (num: bigint) => {
        if (num <= 0n) {
          throw new Error(); // Just throw any error, step will wrap it
        }
        return num;
      },
      errorMessage || 'BigInt must be positive (> 0)',
      'gt',
    ) as BigIntGuardian;
  }

  /**
   * Validates that BigInt is negative (< 0n).
   *
   * @param errorMessage - Optional custom error message
   * @returns New BigIntGuardian with negative validation
   */
  negative(errorMessage?: string): BigIntGuardian {
    return this.step(
      (num: bigint) => {
        if (num >= 0n) {
          throw new Error(); // Just throw any error, step will wrap it
        }
        return num;
      },
      errorMessage || 'BigInt must be negative (< 0)',
      'lt',
    ) as BigIntGuardian;
  }

  /**
   * Validates that BigInt is non-negative (>= 0n).
   *
   * @param errorMessage - Optional custom error message
   * @returns New BigIntGuardian with non-negative validation
   */
  nonNegative(errorMessage?: string): BigIntGuardian {
    return this.step(
      (num: bigint) => {
        if (num < 0n) {
          throw new Error(); // Just throw any error, step will wrap it
        }
        return num;
      },
      errorMessage || 'BigInt must be non-negative (>= 0)',
      'gte',
    ) as BigIntGuardian;
  }

  //#endregion

  //#region Mathematical Transformation Methods

  /**
   * Gets absolute value of the BigInt.
   *
   * @returns New BigIntGuardian with absolute value
   */
  abs(): BigIntGuardian {
    return this.step(
      (num: bigint) => num < 0n ? -num : num,
      'Absolute value',
    ) as BigIntGuardian;
  }

  //#endregion

  //#region Type Transformation Methods

  /**
   * Transforms BigInt to string.
   *
   * @param radix - Optional radix for string conversion (default: 10)
   * @returns New BaseGuardian<string> with string transformation
   *
   * @example
   * ```ts
   * const schema = new BigIntGuardian().toString();
   * schema.parse(123n); // '123'
   *
   * const hexSchema = new BigIntGuardian().toString(16);
   * schema.parse(255n); // 'ff'
   * ```
   */
  override toString(
    radix?: number,
    description?: string,
  ): BaseGuardian<string> {
    return this.mutate(
      (num: bigint) => num.toString(radix),
      description || 'Convert bigint to string',
    );
  }

  /**
   * Transforms BigInt to number (with potential precision loss warning).
   *
   * @param errorMessage - Optional custom error message
   * @returns New BaseGuardian<number> with number transformation
   *
   * @example
   * ```ts
   * const schema = new BigIntGuardian().toNumber();
   * schema.parse(123n); // 123
   * schema.parse(BigInt(Number.MAX_SAFE_INTEGER) + 1n); // throws GuardianError
   * ```
   */
  toNumber(errorMessage?: string): BaseGuardian<number> {
    return this.mutate((num: bigint) => {
      if (
        num > BigInt(Number.MAX_SAFE_INTEGER) ||
        num < BigInt(Number.MIN_SAFE_INTEGER)
      ) {
        throw new GuardianError(
          errorMessage || 'BigInt too large to convert safely to number',
          {
            expected:
              `between ${Number.MIN_SAFE_INTEGER} and ${Number.MAX_SAFE_INTEGER}`,
            got: num,
            comparison: 'conversion',
            type: 'number',
          },
        );
      }
      return Number(num);
    }, 'BigInt to number transformation (safe conversion)');
  }

  //#endregion
}
