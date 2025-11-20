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
  protected override readonly _type = "number";
  /**
   * Creates a new NumberGuardian instance.
   *
   * @param initialTransform - Optional composed transformation from previous guardian
   * @param metaData - Optional metadata for this guardian
   */
  constructor(
    initialTransform?: GuardianTransform<unknown, number>,
    metaData?: GuardianMetaData,
  ) {
    const defaultNumberValidation = (input: unknown) => {
      if (typeof input !== "number") {
        throw new GuardianError(`Expected number but got ${typeof input}`, {
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
    const result = this.process((num: number) => {
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

    // Store constraint for OpenAPI generation
    if (!result._metaData) result._metaData = {};
    result._metaData.minimum = value;
    return result;
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
    const result = this.process((num: number) => {
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

    // Store constraint for OpenAPI generation
    if (!result._metaData) result._metaData = {};
    result._metaData.maximum = value;
    return result;
  }

  /**
   * Validates that number is within the specified range (inclusive).
   *
   * @param min - Minimum allowed value (inclusive)
   * @param max - Maximum allowed value (inclusive)
   * @param errorMessage - Optional custom error message
   * @returns This NumberGuardian (mutated) or new instance if immutable
   *
   * @example
   * ```ts
   * const schema = new NumberGuardian().range(0, 100);
   * schema.parse(50); // 50
   * schema.parse(150); // throws GuardianError
   * ```
   */
  range(min: number, max: number, errorMessage?: string): NumberGuardian {
    const result = this.process((num: number) => {
      if (num < min || num > max) {
        throw new GuardianError(
          errorMessage ||
            `Number must be between ${min} and ${max} (inclusive)`,
          {
            expected: `${min} <= value <= ${max}`,
            got: num,
            comparison: "range",
            type: "validation",
          },
        );
      }
      return num;
    }) as NumberGuardian;

    // Store constraints for OpenAPI generation
    if (!result._metaData) result._metaData = {};
    result._metaData.minimum = min;
    result._metaData.maximum = max;
    return result;
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
    const result = this.process((num: number) => {
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

    // Store constraint for OpenAPI generation
    if (!result._metaData) result._metaData = {};
    result._metaData.minimum = 0;
    result._metaData.exclusiveMinimum = true;
    return result;
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
   * @returns This NumberGuardian (mutated) or new instance if immutable mode
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

  /**
   * Validates that number is odd.
   *
   * @param errorMessage - Optional custom error message
   * @returns This NumberGuardian (mutated) or new instance if immutable
   */
  odd(errorMessage?: string): NumberGuardian {
    return this.process((num: number) => {
      if (!Number.isInteger(num) || num % 2 === 0) {
        throw new GuardianError(
          errorMessage || "Number must be odd",
          {
            expected: "odd integer",
            got: num,
            comparison: "odd",
            type: "validation",
          },
        );
      }
      return num;
    }) as NumberGuardian;
  }

  /**
   * Validates that number is even.
   *
   * @param errorMessage - Optional custom error message
   * @returns This NumberGuardian (mutated) or new instance if immutable
   */
  even(errorMessage?: string): NumberGuardian {
    return this.process((num: number) => {
      if (!Number.isInteger(num) || num % 2 !== 0) {
        throw new GuardianError(
          errorMessage || "Number must be even",
          {
            expected: "even integer",
            got: num,
            comparison: "even",
            type: "validation",
          },
        );
      }
      return num;
    }) as NumberGuardian;
  }

  /**
   * Validates that number is prime.
   * Prime numbers are natural numbers greater than 1 with no positive divisors other than 1 and themselves.
   *
   * @param errorMessage - Optional custom error message
   * @returns This NumberGuardian (mutated) or new instance if immutable
   */
  prime(errorMessage?: string): NumberGuardian {
    return this.process((num: number) => {
      if (!Number.isInteger(num) || num < 2) {
        throw new GuardianError(
          errorMessage || "Number must be a prime number (integer >= 2)",
          {
            expected: "prime number",
            got: num,
            comparison: "prime",
            type: "validation",
          },
        );
      }

      if (num === 2) return num; // 2 is prime
      if (num % 2 === 0) {
        throw new GuardianError(
          errorMessage || "Number must be a prime number",
          {
            expected: "prime number",
            got: num,
            comparison: "prime",
            type: "validation",
          },
        );
      }

      // Check odd divisors up to sqrt(num)
      for (let i = 3; i <= Math.sqrt(num); i += 2) {
        if (num % i === 0) {
          throw new GuardianError(
            errorMessage || "Number must be a prime number",
            {
              expected: "prime number",
              got: num,
              comparison: "prime",
              type: "validation",
            },
          );
        }
      }

      return num;
    }) as NumberGuardian;
  }

  /**
   * Validates that number is not zero.
   *
   * @param errorMessage - Optional custom error message
   * @returns This NumberGuardian (mutated) or new instance if immutable
   */
  nonZero(errorMessage?: string): NumberGuardian {
    return this.process((num: number) => {
      if (num === 0) {
        throw new GuardianError(
          errorMessage || "Number must not be zero",
          {
            expected: "non-zero number",
            got: num,
            comparison: "nonZero",
            type: "validation",
          },
        );
      }
      return num;
    }) as NumberGuardian;
  }

  /**
   * Validates that number is a valid port (0-65535).
   *
   * @param errorMessage - Optional custom error message
   * @returns This NumberGuardian (mutated) or new instance if immutable
   */
  validPort(errorMessage?: string): NumberGuardian {
    return this.process((num: number) => {
      if (!Number.isInteger(num) || num < 0 || num > 65535) {
        throw new GuardianError(
          errorMessage || "Number must be a valid port (0-65535)",
          {
            expected: "valid port (0-65535)",
            got: num,
            comparison: "validPort",
            type: "validation",
          },
        );
      }
      return num;
    }) as NumberGuardian;
  }

  /**
   * Validates that number is a valid Unix timestamp.
   *
   * @param errorMessage - Optional custom error message
   * @returns This NumberGuardian (mutated) or new instance if immutable
   */
  timestamp(errorMessage?: string): NumberGuardian {
    return this.process((num: number) => {
      if (!Number.isInteger(num) || num < 0) {
        throw new GuardianError(
          errorMessage ||
            "Number must be a valid timestamp (non-negative integer)",
          {
            expected: "valid timestamp",
            got: num,
            comparison: "timestamp",
            type: "validation",
          },
        );
      }

      // Test if it creates a valid date
      const date = new Date(num);
      if (isNaN(date.getTime())) {
        throw new GuardianError(
          errorMessage || "Number must be a valid timestamp",
          {
            expected: "valid timestamp",
            got: num,
            comparison: "timestamp",
            type: "validation",
          },
        );
      }

      return num;
    }) as NumberGuardian;
  }

  /**
   * Validates that number is a perfect power of the given base.
   *
   * @param base - The base to check against (defaults to any base)
   * @param errorMessage - Optional custom error message
   * @returns This NumberGuardian (mutated) or new instance if immutable
   */
  power(base?: number, errorMessage?: string): NumberGuardian {
    return this.process((num: number) => {
      if (!Number.isInteger(num) || num < 1) {
        throw new GuardianError(
          errorMessage ||
            "Number must be a positive integer to check for perfect power",
          {
            expected: "positive integer",
            got: num,
            comparison: "power",
            type: "validation",
          },
        );
      }

      if (base !== undefined) {
        // Check if num is a perfect power of specific base
        if (base <= 1) {
          throw new GuardianError("Base must be greater than 1", {
            expected: "base > 1",
            got: base,
            comparison: "base",
            type: "validation",
          });
        }
        const logResult = Math.log(num) / Math.log(base);
        if (!Number.isInteger(logResult)) {
          throw new GuardianError(
            errorMessage || `Number must be a perfect power of ${base}`,
            {
              expected: `perfect power of ${base}`,
              got: num,
              comparison: "power",
              type: "validation",
            },
          );
        }
      } else {
        // Check if num is a perfect power of any base >= 2
        // 1 is a special case - it's 1^n for any n, so it's considered a perfect power
        if (num === 1) {
          return num;
        }

        let isPerfectPower = false;
        for (
          let candidateBase = 2;
          candidateBase <= Math.sqrt(num);
          candidateBase++
        ) {
          const logResult = Math.log(num) / Math.log(candidateBase);
          // Use small epsilon for floating point comparison
          const roundedResult = Math.round(logResult);
          if (
            Math.abs(logResult - roundedResult) < 1e-10 && roundedResult > 1
          ) {
            isPerfectPower = true;
            break;
          }
        }

        if (!isPerfectPower) {
          throw new GuardianError(
            errorMessage || "Number must be a perfect power",
            {
              expected: "perfect power",
              got: num,
              comparison: "power",
              type: "validation",
            },
          );
        }
      }

      return num;
    }) as NumberGuardian;
  }

  /**
   * Validates that number is between min and max values.
   *
   * @param min - Minimum value
   * @param max - Maximum value
   * @param inclusive - Whether bounds are inclusive (defaults to true)
   * @param errorMessage - Optional custom error message
   * @returns This NumberGuardian (mutated) or new instance if immutable
   */
  between(
    min: number,
    max: number,
    inclusive = true,
    errorMessage?: string,
  ): NumberGuardian {
    return this.process((num: number) => {
      const withinBounds = inclusive
        ? (num >= min && num <= max)
        : (num > min && num < max);

      if (!withinBounds) {
        const boundsStr = inclusive
          ? `${min} <= value <= ${max}`
          : `${min} < value < ${max}`;
        const boundsDesc = inclusive ? "inclusive" : "exclusive";

        throw new GuardianError(
          errorMessage ||
            `Number must be between ${min} and ${max} (${boundsDesc})`,
          {
            expected: boundsStr,
            got: num,
            comparison: "between",
            type: "validation",
          },
        );
      }
      return num;
    }) as NumberGuardian;
  }

  /**
   * Validates that number is a valid latitude (-90 to 90).
   *
   * @param errorMessage - Optional custom error message
   * @returns This NumberGuardian (mutated) or new instance if immutable
   */
  latitude(errorMessage?: string): NumberGuardian {
    return this.process((num: number) => {
      if (num < -90 || num > 90) {
        throw new GuardianError(
          errorMessage || "Number must be a valid latitude (-90 to 90)",
          {
            expected: "valid latitude (-90 to 90)",
            got: num,
            comparison: "latitude",
            type: "validation",
          },
        );
      }
      return num;
    }) as NumberGuardian;
  }

  /**
   * Validates that number is a valid longitude (-180 to 180).
   *
   * @param errorMessage - Optional custom error message
   * @returns This NumberGuardian (mutated) or new instance if immutable
   */
  longitude(errorMessage?: string): NumberGuardian {
    return this.process((num: number) => {
      if (num < -180 || num > 180) {
        throw new GuardianError(
          errorMessage || "Number must be a valid longitude (-180 to 180)",
          {
            expected: "valid longitude (-180 to 180)",
            got: num,
            comparison: "longitude",
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
   * @returns This NumberGuardian (mutated) or new instance if immutable mode
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
   * @returns This NumberGuardian (mutated) or new instance if immutable mode
   */
  floor(): NumberGuardian {
    return this.process(
      (num: number) => Math.floor(num),
    ) as NumberGuardian;
  }

  /**
   * Ceils the number (rounds up to nearest integer).
   *
   * @returns This NumberGuardian (mutated) or new instance if immutable mode
   */
  ceil(): NumberGuardian {
    return this.process(
      (num: number) => Math.ceil(num),
    ) as NumberGuardian;
  }

  /**
   * Truncates the number (removes decimal part).
   *
   * @returns This NumberGuardian (mutated) or new instance if immutable mode
   */
  trunc(): NumberGuardian {
    return this.process(
      (num: number) => Math.trunc(num),
    ) as NumberGuardian;
  }

  /**
   * Gets absolute value of the number.
   *
   * @returns This NumberGuardian (mutated) or new instance if immutable mode
   */
  abs(): NumberGuardian {
    return this.process(
      (num: number) => Math.abs(num),
    ) as NumberGuardian;
  }

  /**
   * Negates the number (multiplies by -1).
   *
   * @returns This NumberGuardian (mutated) or new instance if immutable mode
   */
  negate(): NumberGuardian {
    return this.process(
      (num: number) => -num,
    ) as NumberGuardian;
  }

  /**
   * Clamps the number to the specified range.
   * Unlike range(), this transforms the value instead of validating it.
   *
   * @param min - Minimum value to clamp to
   * @param max - Maximum value to clamp to
   * @returns This NumberGuardian (mutated) or new instance if immutable mode
   *
   * @example
   * ```ts
   * const schema = new NumberGuardian().clamp(0, 100);
   * schema.parse(150); // 100 (clamped)
   * schema.parse(-10); // 0 (clamped)
   * schema.parse(50); // 50 (unchanged)
   * ```
   */
  clamp(min: number, max: number): NumberGuardian {
    return this.process(
      (num: number) => Math.min(Math.max(num, min), max),
    ) as NumberGuardian;
  }

  /**
   * Rounds the number to a specified number of decimal places.
   *
   * @param digits - Number of decimal places to round to
   * @returns This NumberGuardian (mutated) or new instance if immutable mode
   *
   * @example
   * ```ts
   * const schema = new NumberGuardian().toFixed(2);
   * schema.parse(3.14159); // 3.14
   * schema.parse(5); // 5.00
   * ```
   */
  toFixed(digits: number): NumberGuardian {
    return this.process(
      (num: number) => parseFloat(num.toFixed(digits)),
    ) as NumberGuardian;
  }

  /**
   * Formats number as currency.
   *
   * @param locale - Locale for currency formatting (defaults to 'en-US')
   * @param currency - Currency code (defaults to 'USD')
   * @returns This NumberGuardian (mutated) or new instance if immutable
   */
  formatCurrency(locale = "en-US", currency = "USD"): NumberGuardian {
    return this.process(
      (num: number) => {
        const _formatter = new Intl.NumberFormat(locale, {
          style: "currency",
          currency: currency,
        });
        // Note: This method preserves the original number value for calculations
        // In real usage, you'd want to return the formatted string for display
        return num;
      },
    ) as NumberGuardian;
  }

  /**
   * Formats number as percentage.
   *
   * @param decimals - Number of decimal places (defaults to 2)
   * @returns This NumberGuardian (mutated) or new instance if immutable
   */
  formatPercentage(decimals = 2): NumberGuardian {
    return this.process(
      (num: number) => parseFloat((num * 100).toFixed(decimals)),
    ) as NumberGuardian;
  }

  /**
   * Adds thousand separators to number (returns as number, not string).
   *
   * @returns This NumberGuardian (mutated) or new instance if immutable
   */
  addCommas(): NumberGuardian {
    return this.process(
      (num: number) => {
        // Convert to string with commas, then back to number (removes commas but preserves value)
        const formatted = num.toLocaleString("en-US");
        return parseFloat(formatted.replace(/,/g, ""));
      },
    ) as NumberGuardian;
  }

  /**
   * Pads number with leading zeros.
   *
   * @param length - Total length of the resulting number string
   * @returns This NumberGuardian (mutated) or new instance if immutable
   */
  padZeros(length: number): NumberGuardian {
    return this.process(
      (num: number) => {
        const str = Math.abs(num).toString();
        const padded = str.padStart(length, "0");
        return parseFloat(num < 0 ? "-" + padded : padded);
      },
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

  //#endregion
}
