import { BaseGuardian } from "../BaseGuardian.ts";
import { GuardianError } from "../GuardianError.ts";
import type { GuardianMetaData, GuardianTransform } from "../types/mod.ts";
import { NumberGuardian } from "./NumberGuardian.ts";
import { StringGuardian } from "./StringGuardian.ts";

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
  protected override readonly _type = "number";

  /**
   * Creates a new BigIntGuardian instance.
   *
   * @param initialTransform - Optional composed transformation from previous guardian
   * @param metaData - Optional metadata for this guardian
   */
  /**
   * Creates a new BigIntGuardian instance.
   *
   * @param initialTransform - Optional composed transformation from previous guardian
   * @param metaData - Optional metadata for this guardian
   */
  constructor(initialTransform?: GuardianTransform<unknown, bigint>, metaData?: GuardianMetaData) {
    const defaultBigIntValidation = (input: unknown) => {
      if (typeof input !== "bigint") {
        throw new GuardianError("Expected bigint but got ${got}", {
          expected: "bigint",
          got: typeof input,
          comparison: "type",
          type: "bigint",
        });
      }
      return input;
    };

    let finalTransform: GuardianTransform<unknown, bigint>;
    if (initialTransform) {
      // Chain the provided transform with default validation
      finalTransform = (input: unknown) => {
        const transformedValue = initialTransform(input);
        return defaultBigIntValidation(transformedValue);
      };
    } else {
      finalTransform = defaultBigIntValidation;
    }

    super(finalTransform, metaData);
  }

  //#region Range Validation Methods

  /**
   * Validates minimum value.
   *
   * @param value - Minimum allowed value
   * @param errorMessage - Optional custom error message
   * @returns This BigIntGuardian (mutated) or new instance if immutable mode
   *
   * @example
   * ```ts
   * const schema = new BigIntGuardian().min(0n);
   * schema.parse(-1n); // throws GuardianError
   * schema.parse(5n); // 5n
   * ```
   */
  min(value: bigint, errorMessage?: string): BigIntGuardian {
    return this.process((num: bigint) => {
      if (num < value) {
        throw new GuardianError(
          errorMessage || `BigInt must be at least ${value}`,
          {
            expected: `>= ${value}`,
            got: num,
            comparison: "min",
            type: "validation",
          },
        );
      }
      return num;
    }) as BigIntGuardian;
  }

  /**
   * Validates maximum value.
   *
   * @param value - Maximum allowed value
   * @param errorMessage - Optional custom error message
   * @returns This BigIntGuardian (mutated) or new instance if immutable mode
   */
  max(value: bigint, errorMessage?: string): BigIntGuardian {
    return this.process((num: bigint) => {
      if (num > value) {
        throw new GuardianError(
          errorMessage || `BigInt must be at most ${value}`,
          {
            expected: `<= ${value}`,
            got: num,
            comparison: "max",
            type: "validation",
          },
        );
      }
      return num;
    }) as BigIntGuardian;
  }

  //#endregion

  //#region Sign Validation Methods

  /**
   * Validates that BigInt is positive (> 0n).
   *
   * @param errorMessage - Optional custom error message
   * @returns This BigIntGuardian (mutated) or new instance if immutable mode
   */
  positive(errorMessage?: string): BigIntGuardian {
    return this.process((num: bigint) => {
      if (num <= 0n) {
        throw new GuardianError(
          errorMessage || "BigInt must be positive (> 0)",
          {
            expected: "> 0",
            got: num,
            comparison: "positive",
            type: "validation",
          },
        );
      }
      return num;
    }) as BigIntGuardian;
  }

  /**
   * Validates that BigInt is negative (< 0n).
   *
   * @param errorMessage - Optional custom error message
   * @returns This BigIntGuardian (mutated) or new instance if immutable mode
   */
  negative(errorMessage?: string): BigIntGuardian {
    return this.process((num: bigint) => {
      if (num >= 0n) {
        throw new GuardianError(
          errorMessage || "BigInt must be negative (< 0)",
          {
            expected: "< 0",
            got: num,
            comparison: "negative",
            type: "validation",
          },
        );
      }
      return num;
    }) as BigIntGuardian;
  }

  /**
   * Validates that BigInt is non-negative (>= 0n).
   *
   * @param errorMessage - Optional custom error message
   * @returns This BigIntGuardian (mutated) or new instance if immutable mode
   */
  nonNegative(errorMessage?: string): BigIntGuardian {
    return this.process((num: bigint) => {
      if (num < 0n) {
        throw new GuardianError(
          errorMessage || "BigInt must be non-negative (>= 0)",
          {
            expected: ">= 0",
            got: num,
            comparison: "nonNegative",
            type: "validation",
          },
        );
      }
      return num;
    }) as BigIntGuardian;
  }

  //#endregion

  //#region Mathematical Transformation Methods

  /**
   * Gets absolute value of the BigInt.
   *
   * @returns New BigIntGuardian with absolute value
   */
  abs(): BigIntGuardian {
    return this.process(
      (num: bigint) => num < 0n ? -num : num,
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
    __description?: string,
  ): StringGuardian {
    return this.process(
      (num: bigint) => num.toString(radix),
      StringGuardian
    ) as StringGuardian;
  }

  /**
   * Transforms BigInt to number (with potential precision loss warning).
   *
   * @param errorMessage - Optional custom error message
   * @returns New NumberGuardian with number transformation
   *
   * @example
   * ```ts
   * const schema = new BigIntGuardian().toNumber();
   * schema.parse(123n); // 123
   * schema.parse(BigInt(Number.MAX_SAFE_INTEGER) + 1n); // throws GuardianError
   * ```
   */
  toNumber(errorMessage?: string): NumberGuardian {
    return this.process((num: bigint) => {
      if (
        num > BigInt(Number.MAX_SAFE_INTEGER) ||
        num < BigInt(Number.MIN_SAFE_INTEGER)
      ) {
        throw new GuardianError(
          errorMessage || "BigInt too large to convert safely to number",
          {
            expected:
              `between ${Number.MIN_SAFE_INTEGER} and ${Number.MAX_SAFE_INTEGER}`,
            got: num,
            comparison: "conversion",
            type: "number",
          },
        );
      }
      return Number(num);
    }, NumberGuardian) as NumberGuardian;
  }

  //#endregion
}
