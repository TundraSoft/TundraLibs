import { BaseGuardian } from "../BaseGuardian.ts";
import { GuardianError } from "../GuardianError.ts";
import type { GuardianMetaData, GuardianTransform } from "../types/mod.ts";
import { DateGuardian } from "./DateGuardian.ts";
import { StringGuardian } from "./StringGuardian.ts";
import { BigIntGuardian } from "./BigIntGuardian.ts";

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
   * @param initialTransform - Optional composed transformation from previous guardian
   */
  constructor(metaData?: GuardianMetaData, initialTransform?: GuardianTransform<unknown, number>) {
    const defaultNumberValidation = (input: unknown) => {
      if (typeof input !== "number") {
        throw new GuardianError("Expected number but got ${got}", {
          expected: "number",
          got: typeof input,
          comparison: "type",
          type: "number",
        });
      }
      if (isNaN(input)) {
        throw new GuardianError("Number cannot be NaN", {
          expected: "valid number",
          got: "NaN",
          comparison: "nan",
          type: "number",
        });
      }
      return input;
    };

    let finalTransform: GuardianTransform<unknown, number>;
    if (initialTransform) {
      // Chain: initialTransform -> then number validation
      finalTransform = (input: unknown) => {
        const result = initialTransform(input);
        return defaultNumberValidation(result);
      };
    } else {
      // Just number validation
      finalTransform = defaultNumberValidation;
    }

    super(finalTransform, metaData);
  }

  //#region Range Validation Methods

  /**
   * Validates minimum value.
   *
   * @param value - Minimum allowed value
   * @param errorMessage - Optional custom error message
   * @returns This NumberGuardian (mutated) or new instance if immutable
   *
   * @example
   * ```ts
   * const schema = new NumberGuardian().min(0);
   * schema.parse(-1); // throws GuardianError
   * schema.parse(5); // 5
   * ```
   */
  min(value: number, errorMessage?: string): NumberGuardian {
    return this.process((num: number) => {
      if (num < value) {
        throw new GuardianError(
          errorMessage || `Number must be at least ${value}`,
          {
            expected: `>= ${value}`,
            got: num,
            comparison: "min",
            type: "validation",
          },
        );
      }
      return num;
    }) as NumberGuardian;
  }

  /**
   * Validates maximum value.
   *
   * @param value - Maximum allowed value
   * @param errorMessage - Optional custom error message
   * @returns This NumberGuardian (mutated) or new instance if immutable
   *
   * @example
   * ```ts
   * const schema = new NumberGuardian().max(100);
   * schema.parse(101); // throws GuardianError
   * schema.parse(50); // 50
   * ```
   */
  max(value: number, errorMessage?: string): NumberGuardian {
    return this.process((num: number) => {
      if (num > value) {
        throw new GuardianError(
          errorMessage || `Number must be at most ${value}`,
          {
            expected: `<= ${value}`,
            got: num,
            comparison: "max",
            type: "validation",
          },
        );
      }
      return num;
    }) as NumberGuardian;
  }

  //#endregion

  //#region Sign Validation Methods

  /**
   * Validates that number is positive (> 0).
   *
   * @param errorMessage - Optional custom error message
   * @returns This NumberGuardian (mutated) or new instance if immutable
   */
  positive(errorMessage?: string): NumberGuardian {
    return this.process((num: number) => {
      if (num <= 0) {
        throw new GuardianError(
          errorMessage || "Number must be positive (> 0)",
          {
            expected: "> 0",
            got: num,
            comparison: "positive",
            type: "validation",
          },
        );
      }
      return num;
    }) as NumberGuardian;
  }

  /**
   * Validates that number is negative (< 0).
   *
   * @param errorMessage - Optional custom error message
   * @returns This NumberGuardian (mutated) or new instance if immutable
   */
  negative(errorMessage?: string): NumberGuardian {
    return this.process((num: number) => {
      if (num >= 0) {
        throw new GuardianError(
          errorMessage || "Number must be negative (< 0)",
          {
            expected: "< 0",
            got: num,
            comparison: "negative",
            type: "validation",
          },
        );
      }
      return num;
    }) as NumberGuardian;
  }

  /**
   * Validates that number is non-negative (>= 0).
   *
   * @param errorMessage - Optional custom error message
   * @returns This NumberGuardian (mutated) or new instance if immutable
   */
  nonNegative(errorMessage?: string): NumberGuardian {
    return this.process((num: number) => {
      if (num < 0) {
        throw new GuardianError(
          errorMessage || "Number must be non-negative (>= 0)",
          {
            expected: ">= 0",
            got: num,
            comparison: "nonNegative",
            type: "validation",
          },
        );
      }
      return num;
    }) as NumberGuardian;
  }

  /**
   * Validates that number is non-positive (<= 0).
   *
   * @param errorMessage - Optional custom error message
   * @returns This NumberGuardian (mutated) or new instance if immutable
   */
  nonPositive(errorMessage?: string): NumberGuardian {
    return this.process((num: number) => {
      if (num > 0) {
        throw new GuardianError(
          errorMessage || "Number must be non-positive (<= 0)",
          {
            expected: "<= 0",
            got: num,
            comparison: "nonPositive",
            type: "validation",
          },
        );
      }
      return num;
    }) as NumberGuardian;
  }

  //#endregion

  //#region Type Validation Methods

  /**
   * Validates that number is an integer.
   *
   * @param errorMessage - Optional custom error message
   * @returns This NumberGuardian (mutated) or new instance if immutable
   *
   * @example
   * ```ts
   * const schema = new NumberGuardian().integer();
   * schema.parse(3.14); // throws GuardianError
   * schema.parse(42); // 42
   * ```
   */
  integer(errorMessage?: string): NumberGuardian {
    return this.process((num: number) => {
      if (!Number.isInteger(num)) {
        throw new GuardianError(errorMessage || "Number must be an integer", {
          expected: "integer",
          got: num,
          comparison: "integer",
          type: "validation",
        });
      }
      return num;
    }) as NumberGuardian;
  }

  /**
   * Validates that number is finite (not Infinity or -Infinity).
   *
   * @param errorMessage - Optional custom error message
   * @returns This NumberGuardian (mutated) or new instance if immutable
   */
  finite(errorMessage?: string): NumberGuardian {
    return this.process((num: number) => {
      if (!Number.isFinite(num)) {
        throw new GuardianError(errorMessage || "Number must be finite", {
          expected: "finite number",
          got: num,
          comparison: "finite",
          type: "validation",
        });
      }
      return num;
    }) as NumberGuardian;
  }

  /**
   * Validates that number is safe integer (within JavaScript's safe integer range).
   *
   * @param errorMessage - Optional custom error message
   * @returns New NumberGuardian with safe integer validation
   */
  safeInteger(errorMessage?: string): NumberGuardian {
    return this.process((num: number) => {
      if (!Number.isSafeInteger(num)) {
        throw new GuardianError(
          errorMessage ||
            `Number must be a safe integer (between ${Number.MIN_SAFE_INTEGER} and ${Number.MAX_SAFE_INTEGER})`,
          {
            expected:
              `safe integer (${Number.MIN_SAFE_INTEGER} to ${Number.MAX_SAFE_INTEGER})`,
            got: num,
            comparison: "safeInteger",
            type: "validation",
          },
        );
      }
      return num;
    }) as NumberGuardian;
  }

  /**
   * Validates that number is a multiple of the given value.
   *
   * @param divisor - The divisor to check against
   * @param errorMessage - Optional custom error message
   * @returns This NumberGuardian (mutated) or new instance if immutable
   *
   * @example
   * ```ts
   * const schema = new NumberGuardian().multipleOf(5);
   * schema.parse(7); // throws GuardianError
   * schema.parse(10); // 10
   * ```
   */
  multipleOf(divisor: number, errorMessage?: string): NumberGuardian {
    return this.process((num: number) => {
      if (num % divisor !== 0) {
        throw new GuardianError(
          errorMessage || `Number must be a multiple of ${divisor}`,
          {
            expected: `multiple of ${divisor}`,
            got: num,
            comparison: "multipleOf",
            type: "validation",
          },
        );
      }
      return num;
    }) as NumberGuardian;
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
    return this.process(
      (num: number) => Math.round(num),
    ) as NumberGuardian;
  }

  /**
   * Floors the number (rounds down to nearest integer).
   *
   * @returns New NumberGuardian that floors the number
   */
  floor(): NumberGuardian {
    return this.process(
      (num: number) => Math.floor(num),
    ) as NumberGuardian;
  }

  /**
   * Ceils the number (rounds up to nearest integer).
   *
   * @returns New NumberGuardian that ceils the number
   */
  ceil(): NumberGuardian {
    return this.process(
      (num: number) => Math.ceil(num),
    ) as NumberGuardian;
  }

  /**
   * Truncates the number (removes decimal part).
   *
   * @returns New NumberGuardian that truncates the number
   */
  trunc(): NumberGuardian {
    return this.process(
      (num: number) => Math.trunc(num),
    ) as NumberGuardian;
  }

  /**
   * Gets absolute value of the number.
   *
   * @returns New NumberGuardian with absolute value
   */
  abs(): NumberGuardian {
    return this.process(
      (num: number) => Math.abs(num),
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
    __description?: string,
  ): StringGuardian {
    return this.process((num: number) => {
      return num.toString(radix);
    }, StringGuardian) as StringGuardian;
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
  toBigInt(errorMessage?: string): BigIntGuardian {
    return this.process((num: number) => {
      if (!Number.isInteger(num)) {
        throw new GuardianError(
          errorMessage || "Cannot convert non-integer to BigInt",
          {
            expected: "integer",
            got: num,
            comparison: "conversion",
            type: "bigint",
          },
        );
      }
      return BigInt(num);
    }, BigIntGuardian) as BigIntGuardian;
  }

  /**
   * Transforms number to Date (treating number as milliseconds since epoch).
   *
   * @param errorMessage - Optional custom error message
   * @returns New DateGuardian with Date transformation
   */
  toDate(errorMessage?: string): DateGuardian {
    return this.process((num: number) => {
      const date = new Date(num);
      if (isNaN(date.getTime())) {
        throw new GuardianError(
          errorMessage || "Cannot convert number to date",
          {
            expected: "valid timestamp",
            got: num,
            comparison: "conversion",
            type: "date",
          },
        );
      }
      return date;
    }, DateGuardian) as DateGuardian;
  }

  //#endregion
}
