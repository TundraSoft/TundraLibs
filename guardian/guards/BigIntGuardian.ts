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

  /**
   * Validates BigInt is within a range (inclusive).
   *
   * @param min - Minimum value (inclusive)
   * @param max - Maximum value (inclusive)
   * @param errorMessage - Optional custom error message
   * @returns This BigIntGuardian (mutated) or new instance if immutable
   */
  range(min: bigint, max: bigint, errorMessage?: string): BigIntGuardian {
    return this.process((num: bigint) => {
      if (num < min || num > max) {
        throw new GuardianError(
          errorMessage || `BigInt must be between ${min} and ${max} (inclusive)`,
          {
            expected: `${min} <= value <= ${max}`,
            got: num,
            comparison: "range",
            type: "validation",
          },
        );
      }
      return num;
    }) as BigIntGuardian;
  }

  /**
   * Validates BigInt is between two values (inclusive).
   *
   * @param min - Minimum value (inclusive)
   * @param max - Maximum value (inclusive)
   * @param errorMessage - Optional custom error message
   * @returns This BigIntGuardian (mutated) or new instance if immutable
   */
  between(min: bigint, max: bigint, errorMessage?: string): BigIntGuardian {
    return this.range(min, max, errorMessage);
  }

  /**
   * Validates BigInt is greater than the specified value.
   *
   * @param value - Value to compare against
   * @param errorMessage - Optional custom error message
   * @returns This BigIntGuardian (mutated) or new instance if immutable
   */
  greaterThan(value: bigint, errorMessage?: string): BigIntGuardian {
    return this.process((num: bigint) => {
      if (num <= value) {
        throw new GuardianError(
          errorMessage || `BigInt must be greater than ${value}`,
          {
            expected: `> ${value}`,
            got: num,
            comparison: "greaterThan",
            type: "validation",
          },
        );
      }
      return num;
    }) as BigIntGuardian;
  }

  /**
   * Validates BigInt is less than the specified value.
   *
   * @param value - Value to compare against
   * @param errorMessage - Optional custom error message
   * @returns This BigIntGuardian (mutated) or new instance if immutable
   */
  lessThan(value: bigint, errorMessage?: string): BigIntGuardian {
    return this.process((num: bigint) => {
      if (num >= value) {
        throw new GuardianError(
          errorMessage || `BigInt must be less than ${value}`,
          {
            expected: `< ${value}`,
            got: num,
            comparison: "lessThan",
            type: "validation",
          },
        );
      }
      return num;
    }) as BigIntGuardian;
  }

  /**
   * Validates BigInt is greater than or equal to the specified value.
   *
   * @param value - Value to compare against
   * @param errorMessage - Optional custom error message
   * @returns This BigIntGuardian (mutated) or new instance if immutable
   */
  greaterThanOrEqual(value: bigint, errorMessage?: string): BigIntGuardian {
    return this.process((num: bigint) => {
      if (num < value) {
        throw new GuardianError(
          errorMessage || `BigInt must be greater than or equal to ${value}`,
          {
            expected: `>= ${value}`,
            got: num,
            comparison: "greaterThanOrEqual",
            type: "validation",
          },
        );
      }
      return num;
    }) as BigIntGuardian;
  }

  /**
   * Validates BigInt is less than or equal to the specified value.
   *
   * @param value - Value to compare against
   * @param errorMessage - Optional custom error message
   * @returns This BigIntGuardian (mutated) or new instance if immutable
   */
  lessThanOrEqual(value: bigint, errorMessage?: string): BigIntGuardian {
    return this.process((num: bigint) => {
      if (num > value) {
        throw new GuardianError(
          errorMessage || `BigInt must be less than or equal to ${value}`,
          {
            expected: `<= ${value}`,
            got: num,
            comparison: "lessThanOrEqual",
            type: "validation",
          },
        );
      }
      return num;
    }) as BigIntGuardian;
  }

  /**
   * Validates BigInt is even.
   *
   * @param errorMessage - Optional custom error message
   * @returns This BigIntGuardian (mutated) or new instance if immutable
   */
  even(errorMessage?: string): BigIntGuardian {
    return this.process((num: bigint) => {
      if (num % 2n !== 0n) {
        throw new GuardianError(
          errorMessage || "BigInt must be even",
          {
            expected: "even BigInt",
            got: num,
            comparison: "even",
            type: "validation",
          },
        );
      }
      return num;
    }) as BigIntGuardian;
  }

  /**
   * Validates BigInt is odd.
   *
   * @param errorMessage - Optional custom error message
   * @returns This BigIntGuardian (mutated) or new instance if immutable
   */
  odd(errorMessage?: string): BigIntGuardian {
    return this.process((num: bigint) => {
      if (num % 2n === 0n) {
        throw new GuardianError(
          errorMessage || "BigInt must be odd",
          {
            expected: "odd BigInt",
            got: num,
            comparison: "odd",
            type: "validation",
          },
        );
      }
      return num;
    }) as BigIntGuardian;
  }

  /**
   * Validates BigInt is a multiple of the specified value.
   *
   * @param divisor - The divisor to check against
   * @param errorMessage - Optional custom error message
   * @returns This BigIntGuardian (mutated) or new instance if immutable
   */
  multipleOf(divisor: bigint, errorMessage?: string): BigIntGuardian {
    return this.process((num: bigint) => {
      if (num % divisor !== 0n) {
        throw new GuardianError(
          errorMessage || `BigInt must be a multiple of ${divisor}`,
          {
            expected: `multiple of ${divisor}`,
            got: num,
            comparison: "multipleOf",
            type: "validation",
          },
        );
      }
      return num;
    }) as BigIntGuardian;
  }

  /**
   * Helper function to check if a BigInt is prime.
   */
  private _isPrime(num: bigint): boolean {
    if (num < 2n) return false;
    if (num === 2n) return true;
    if (num % 2n === 0n) return false;
    
    const limit = this._bigIntSqrt(num);
    for (let i = 3n; i <= limit; i += 2n) {
      if (num % i === 0n) return false;
    }
    return true;
  }

  /**
   * Helper function to calculate square root of BigInt.
   */
  private _bigIntSqrt(num: bigint): bigint {
    if (num < 0n) throw new Error('Square root of negative number');
    if (num < 2n) return num;
    
    let x = num;
    let y = (x + 1n) / 2n;
    
    while (y < x) {
      x = y;
      y = (x + num / x) / 2n;
    }
    
    return x;
  }

  /**
   * Helper function to check if a BigInt is a perfect power.
   */
  private _isPerfectPower(num: bigint, base?: bigint): boolean {
    if (num < 1n) return false;
    if (num === 1n) return true;
    
    if (base !== undefined) {
      if (base <= 1n) return false;
      
      let power = base;
      while (power < num) {
        power *= base;
      }
      return power === num;
    } else {
      // Check if num is a perfect power of any base >= 2
      for (let candidateBase = 2n; candidateBase <= this._bigIntSqrt(num); candidateBase++) {
        let power = candidateBase;
        while (power < num) {
          power *= candidateBase;
        }
        if (power === num) return true;
      }
      return false;
    }
  }

  /**
   * Validates BigInt is prime.
   *
   * @param errorMessage - Optional custom error message
   * @returns This BigIntGuardian (mutated) or new instance if immutable
   */
  prime(errorMessage?: string): BigIntGuardian {
    return this.process((num: bigint) => {
      if (!this._isPrime(num)) {
        throw new GuardianError(
          errorMessage || "BigInt must be prime",
          {
            expected: "prime BigInt",
            got: num,
            comparison: "prime",
            type: "validation",
          },
        );
      }
      return num;
    }) as BigIntGuardian;
  }

  /**
   * Validates BigInt is not prime.
   *
   * @param errorMessage - Optional custom error message
   * @returns This BigIntGuardian (mutated) or new instance if immutable
   */
  notPrime(errorMessage?: string): BigIntGuardian {
    return this.process((num: bigint) => {
      if (this._isPrime(num)) {
        throw new GuardianError(
          errorMessage || "BigInt must not be prime",
          {
            expected: "non-prime BigInt",
            got: num,
            comparison: "notPrime",
            type: "validation",
          },
        );
      }
      return num;
    }) as BigIntGuardian;
  }

  /**
   * Validates BigInt is a perfect power.
   *
   * @param base - Optional base to check against
   * @param errorMessage - Optional custom error message
   * @returns This BigIntGuardian (mutated) or new instance if immutable
   */
  power(base?: bigint, errorMessage?: string): BigIntGuardian {
    return this.process((num: bigint) => {
      if (!this._isPerfectPower(num, base)) {
        const baseStr = base ? ` of ${base}` : '';
        throw new GuardianError(
          errorMessage || `BigInt must be a perfect power${baseStr}`,
          {
            expected: `perfect power${baseStr}`,
            got: num,
            comparison: "power",
            type: "validation",
          },
        );
      }
      return num;
    }) as BigIntGuardian;
  }

  /**
   * Validates BigInt is not zero.
   *
   * @param errorMessage - Optional custom error message
   * @returns This BigIntGuardian (mutated) or new instance if immutable
   */
  nonZero(errorMessage?: string): BigIntGuardian {
    return this.process((num: bigint) => {
      if (num === 0n) {
        throw new GuardianError(
          errorMessage || "BigInt must not be zero",
          {
            expected: "non-zero BigInt",
            got: num,
            comparison: "nonZero",
            type: "validation",
          },
        );
      }
      return num;
    }) as BigIntGuardian;
  }

  /**
   * Gets the bit length of the BigInt.
   *
   * @param expectedLength - Optional expected bit length
   * @param errorMessage - Optional custom error message
   * @returns This BigIntGuardian (mutated) or new instance if immutable
   */
  bitLength(expectedLength?: number, errorMessage?: string): BigIntGuardian {
    return this.process((num: bigint) => {
      const actualLength = num.toString(2).length;
      
      if (expectedLength !== undefined && actualLength !== expectedLength) {
        throw new GuardianError(
          errorMessage || `BigInt must have bit length ${expectedLength}`,
          {
            expected: `bit length ${expectedLength}`,
            got: `bit length ${actualLength}`,
            comparison: "bitLength",
            type: "validation",
          },
        );
      }
      return num;
    }) as BigIntGuardian;
  }

  /**
   * Adds another BigInt.
   *
   * @param value - Value to add
   * @returns This BigIntGuardian (mutated) or new instance if immutable
   */
  add(value: bigint): BigIntGuardian {
    return this.process((num: bigint) => {
      return num + value;
    }) as BigIntGuardian;
  }

  /**
   * Subtracts another BigInt.
   *
   * @param value - Value to subtract
   * @returns This BigIntGuardian (mutated) or new instance if immutable
   */
  subtract(value: bigint): BigIntGuardian {
    return this.process((num: bigint) => {
      return num - value;
    }) as BigIntGuardian;
  }

  /**
   * Multiplies by another BigInt.
   *
   * @param value - Value to multiply by
   * @returns This BigIntGuardian (mutated) or new instance if immutable
   */
  multiply(value: bigint): BigIntGuardian {
    return this.process((num: bigint) => {
      return num * value;
    }) as BigIntGuardian;
  }

  /**
   * Divides by another BigInt.
   *
   * @param value - Value to divide by
   * @param errorMessage - Optional custom error message
   * @returns This BigIntGuardian (mutated) or new instance if immutable
   */
  divide(value: bigint, errorMessage?: string): BigIntGuardian {
    return this.process((num: bigint) => {
      if (value === 0n) {
        throw new GuardianError(
          errorMessage || "Cannot divide by zero",
          {
            expected: "non-zero divisor",
            got: "zero divisor",
            comparison: "division",
            type: "validation",
          },
        );
      }
      return num / value;
    }) as BigIntGuardian;
  }

  /**
   * Gets modulo of BigInt.
   *
   * @param value - Modulo value
   * @param errorMessage - Optional custom error message
   * @returns This BigIntGuardian (mutated) or new instance if immutable
   */
  mod(value: bigint, errorMessage?: string): BigIntGuardian {
    return this.process((num: bigint) => {
      if (value === 0n) {
        throw new GuardianError(
          errorMessage || "Cannot modulo by zero",
          {
            expected: "non-zero modulo",
            got: "zero modulo",
            comparison: "modulo",
            type: "validation",
          },
        );
      }
      return num % value;
    }) as BigIntGuardian;
  }

  /**
   * Gets square root of BigInt.
   *
   * @param errorMessage - Optional custom error message
   * @returns This BigIntGuardian (mutated) or new instance if immutable
   */
  squareRoot(errorMessage?: string): BigIntGuardian {
    return this.process((num: bigint) => {
      if (num < 0n) {
        throw new GuardianError(
          errorMessage || "Cannot calculate square root of negative BigInt",
          {
            expected: "non-negative BigInt",
            got: num,
            comparison: "squareRoot",
            type: "validation",
          },
        );
      }
      return this._bigIntSqrt(num);
    }) as BigIntGuardian;
  }

  /**
   * Clamps BigInt to a range.
   *
   * @param min - Minimum value to clamp to
   * @param max - Maximum value to clamp to
   * @returns This BigIntGuardian (mutated) or new instance if immutable
   */
  clamp(min: bigint, max: bigint): BigIntGuardian {
    return this.process((num: bigint) => {
      if (num < min) return min;
      if (num > max) return max;
      return num;
    }) as BigIntGuardian;
  }

  /**
   * Converts BigInt to hexadecimal string.
   *
   * @returns New StringGuardian with hex string
   */
  toHex(): StringGuardian {
    return this.process((num: bigint) => {
      return num.toString(16);
    }, StringGuardian) as StringGuardian;
  }

  /**
   * Converts BigInt to binary string.
   *
   * @returns New StringGuardian with binary string
   */
  toBinary(): StringGuardian {
    return this.process((num: bigint) => {
      return num.toString(2);
    }, StringGuardian) as StringGuardian;
  }

  /**
   * Converts BigInt to octal string.
   *
   * @returns New StringGuardian with octal string
   */
  toOctal(): StringGuardian {
    return this.process((num: bigint) => {
      return num.toString(8);
    }, StringGuardian) as StringGuardian;
  }

  /**
   * Converts BigInt to string with specified radix.
   *
   * @param radix - Radix for conversion (2-36)
   * @param errorMessage - Optional custom error message
   * @returns New StringGuardian with string conversion
   */
  override toString(radix?: number, errorMessage?: string): StringGuardian {
    return this.process((num: bigint) => {
      if (radix !== undefined && (radix < 2 || radix > 36)) {
        throw new GuardianError(
          errorMessage || "Radix must be between 2 and 36",
          {
            expected: "radix between 2 and 36",
            got: radix,
            comparison: "radix",
            type: "validation",
          },
        );
      }
      return num.toString(radix);
    }, StringGuardian) as StringGuardian;
  }

  //#endregion
}
