/**
 * @fileoverview `BigIntGuardian` — coerce-by-default bigint validator
 * with range / sign / parity / divisibility checks and conversions
 * to / from number and string.
 *
 * @module
 */

import { BaseGuardian } from '../BaseGuardian.ts';
import { GuardianError } from '../errors/Base.ts';
import { coerceBigInt } from '../helpers/coerce.ts';
import { gateAsyncStepResult } from '../helpers/thenable.ts';
import type { GuardianMetaData, GuardianTransform } from '../types/mod.ts';
import { NumberGuardian } from './NumberGuardian.ts';
import { StringGuardian } from './StringGuardian.ts';

/**
 * BigInt validator. Coerces integer numbers, integer strings, and
 * booleans; rejects non-integer numbers (no silent truncation),
 * garbage strings, and null/undefined. See {@link Guardian.bigint}
 * for the standard factory.
 *
 * @example
 * ```ts
 * import { Guardian } from '@tundralibs/guardian';
 *
 * const Big = Guardian.bigint().positive();
 * Big.parse(42n);   // 42n
 * Big.parse(42);    // 42n   ← coerced
 * Big.parse('42');  // 42n   ← coerced
 * ```
 *
 * @see {@link Guardian.bigint}
 */
export class BigIntGuardian extends BaseGuardian<bigint> {
  /**
   * Emitted schema type. `bigint` is the runtime-accurate name;
   * `toOpenAPI` overrides it to `integer` + `int64` format, but
   * markdown and introspection see the real native type.
   */
  protected override readonly _type = 'bigint';

  /**
   * Creates a new BigIntGuardian instance.
   *
   * @param initialTransform - Optional composed transformation from previous guardian
   * @param metaData - Optional metadata for this guardian
   */
  constructor(
    initialTransform?: GuardianTransform<unknown, bigint>,
    metaData?: GuardianMetaData,
  ) {
    // Coerce-by-default. Integer numbers, integer strings, and
    // booleans coerce to bigint; non-integer numbers / garbage strings
    // throw rather than silently truncating.
    const defaultBigIntValidation = coerceBigInt;

    let finalTransform: GuardianTransform<unknown, bigint>;
    if (initialTransform) {
      // Chain the provided transform with default validation
      finalTransform = (input: unknown) => {
        const transformedValue = initialTransform(input);
        // A type-crossing transform reached via `.process(fn,
        // BigIntGuardian)` (e.g. `string().toBigInt()`,
        // `number().toBigInt()`) may sit on an async chain, in which
        // case `initialTransform` returns a Promise. Await it before
        // coercion — otherwise the synchronous coercion helper receives
        // a Promise object and throws "Cannot coerce object to bigint".
        // The guardian is already flagged `isAsync` upstream, so
        // `parseAsync` awaits this. Only a real Promise is a leaked async
        // step to thread through `.then()`; a non-Promise thenable-shaped
        // VALUE would be ADOPTED (and silently destroyed) if `.then()`
        // were called on it, so refuse it loudly instead.
        if (transformedValue instanceof Promise) {
          return transformedValue.then((v) => defaultBigIntValidation(v));
        }
        return defaultBigIntValidation(gateAsyncStepResult(transformedValue));
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
   * @returns A new BigIntGuardian with the validation applied (the receiver is never mutated)
   * @throws {GuardianError} If bigint is less than the specified minimum
   *
   * @example
   * ```ts
   * const schema = new BigIntGuardian().min(0n);
   * schema.parse(-1n); // throws GuardianError
   * schema.parse(5n); // 5n
   * ```
   */
  min(value: bigint, errorMessage?: string): this {
    const result = this.process((num: bigint) => {
      if (num < value) {
        throw new GuardianError(
          errorMessage || `BigInt must be at least ${value}`,
          {
            expected: `>= ${value}`,
            got: num,
            comparison: 'min',
            type: 'validation',
          },
        );
      }
      return num;
    }) as this;
    // Attach the constraint to the new instance, not the source —
    // mutating `this._metaData` would leak the bound back to the
    // caller's variable.
    result._metaData ??= {};
    result._metaData.minimum = Number(value);
    return result;
  }

  /**
   * Validates maximum value.
   *
   * @param value - Maximum allowed value
   * @param errorMessage - Optional custom error message
   * @returns A new BigIntGuardian with the validation applied (the receiver is never mutated)
   * @throws {GuardianError} If bigint exceeds the specified maximum
   */
  max(value: bigint, errorMessage?: string): this {
    const result = this.process((num: bigint) => {
      if (num > value) {
        throw new GuardianError(
          errorMessage || `BigInt must be at most ${value}`,
          {
            expected: `<= ${value}`,
            got: num,
            comparison: 'max',
            type: 'validation',
          },
        );
      }
      return num;
    }) as this;
    // Attach the constraint to the new instance — see `min()`.
    result._metaData ??= {};
    result._metaData.maximum = Number(value);
    return result;
  }

  //#endregion

  //#region Sign Validation Methods

  /**
   * Validates that BigInt is positive (> 0n).
   *
   * @param errorMessage - Optional custom error message
   * @returns A new BigIntGuardian with the validation applied (the receiver is never mutated)
   * @throws {GuardianError} If bigint is zero or negative
   */
  positive(errorMessage?: string): this {
    return this.process((num: bigint) => {
      if (num <= 0n) {
        throw new GuardianError(
          errorMessage || 'BigInt must be positive (> 0)',
          {
            expected: '> 0',
            got: num,
            comparison: 'positive',
            type: 'validation',
          },
        );
      }
      return num;
    }) as this;
  }

  /**
   * Validates that BigInt is negative (< 0n).
   *
   * @param errorMessage - Optional custom error message
   * @returns A new BigIntGuardian with the validation applied (the receiver is never mutated)
   * @throws {GuardianError} If bigint is zero or positive
   */
  negative(errorMessage?: string): this {
    return this.process((num: bigint) => {
      if (num >= 0n) {
        throw new GuardianError(
          errorMessage || 'BigInt must be negative (< 0)',
          {
            expected: '< 0',
            got: num,
            comparison: 'negative',
            type: 'validation',
          },
        );
      }
      return num;
    }) as this;
  }

  /**
   * Validates that BigInt is non-negative (>= 0n).
   *
   * @param errorMessage - Optional custom error message
   * @returns A new BigIntGuardian with the validation applied (the receiver is never mutated)
   * @throws {GuardianError} If bigint is negative
   */
  nonNegative(errorMessage?: string): this {
    return this.process((num: bigint) => {
      if (num < 0n) {
        throw new GuardianError(
          errorMessage || 'BigInt must be non-negative (>= 0)',
          {
            expected: '>= 0',
            got: num,
            comparison: 'nonNegative',
            type: 'validation',
          },
        );
      }
      return num;
    }) as this;
  }

  /**
   * Validates the value fits in an **unsigned** N-bit range:
   * `0 ≤ value < 2^bits`.
   *
   * @example
   * ```ts
   * import { Guardian } from '@tundralibs/guardian';
   *
   * Guardian.bigint().uint(8).parse(255n);   // ok
   * Guardian.bigint().uint(8).parse(256n);   // throws (>= 2^8)
   * ```
   */
  uint(bits: number, errorMessage?: string): this {
    if (!Number.isInteger(bits) || bits <= 0) {
      throw new Error('uint(bits): bits must be a positive integer');
    }
    const max = 1n << BigInt(bits);
    return this.process((num: bigint) => {
      if (num < 0n || num >= max) {
        throw new GuardianError(
          errorMessage ||
            `BigInt must fit in u${bits} (0..2^${bits}-1), got ${num}`,
          {
            expected: `u${bits}`,
            got: num.toString(),
            comparison: 'uint',
            type: 'validation',
          },
        );
      }
      return num;
    }) as this;
  }

  /**
   * Validates the value fits in a **signed** N-bit two's-complement
   * range: `-2^(bits-1) ≤ value < 2^(bits-1)`.
   *
   * @example
   * ```ts
   * import { Guardian } from '@tundralibs/guardian';
   *
   * Guardian.bigint().int(8).parse(127n);    // ok
   * Guardian.bigint().int(8).parse(128n);    // throws (>= 2^7)
   * Guardian.bigint().int(8).parse(-128n);   // ok
   * Guardian.bigint().int(8).parse(-129n);   // throws (< -2^7)
   * ```
   */
  int(bits: number, errorMessage?: string): this {
    if (!Number.isInteger(bits) || bits <= 0) {
      throw new Error('int(bits): bits must be a positive integer');
    }
    const limit = 1n << BigInt(bits - 1);
    return this.process((num: bigint) => {
      if (num < -limit || num >= limit) {
        throw new GuardianError(
          errorMessage ||
            `BigInt must fit in i${bits} (-2^${bits - 1}..2^${
              bits - 1
            }-1), got ${num}`,
          {
            expected: `i${bits}`,
            got: num.toString(),
            comparison: 'int',
            type: 'validation',
          },
        );
      }
      return num;
    }) as this;
  }

  //#endregion

  //#region Mathematical Transformation Methods

  /**
   * Gets absolute value of the BigInt.
   *
   * @returns New BigIntGuardian with absolute value
   */
  abs(): this {
    return this.process(
      (num: bigint) => num < 0n ? -num : num,
    ) as this;
  }

  //#endregion

  //#region Type Transformation Methods

  /**
   * Transforms BigInt to number (with potential precision loss warning).
   *
   * @param errorMessage - Optional custom error message
   * @returns New NumberGuardian with number transformation
   * @throws {GuardianError} If bigint is outside safe integer range for JavaScript numbers
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
    }, NumberGuardian) as NumberGuardian;
  }

  /**
   * Validates BigInt is within a range (inclusive).
   *
   * @param min - Minimum value (inclusive)
   * @param max - Maximum value (inclusive)
   * @param errorMessage - Optional custom error message
   * @returns A new BigIntGuardian with the validation applied (the receiver is never mutated)
   */
  range(min: bigint, max: bigint, errorMessage?: string): this {
    return this.process((num: bigint) => {
      if (num < min || num > max) {
        throw new GuardianError(
          errorMessage ||
            `BigInt must be between ${min} and ${max} (inclusive)`,
          {
            expected: `${min} <= value <= ${max}`,
            got: num,
            comparison: 'range',
            type: 'validation',
          },
        );
      }
      return num;
    }) as this;
  }

  /**
   * Validates BigInt is between two values (inclusive).
   *
   * @param min - Minimum value (inclusive)
   * @param max - Maximum value (inclusive)
   * @param errorMessage - Optional custom error message
   * @returns A new BigIntGuardian with the validation applied (the receiver is never mutated)
   */
  between(min: bigint, max: bigint, errorMessage?: string): this {
    return this.range(min, max, errorMessage);
  }

  /**
   * Validates BigInt is greater than the specified value.
   *
   * @param value - Value to compare against
   * @param errorMessage - Optional custom error message
   * @returns A new BigIntGuardian with the validation applied (the receiver is never mutated)
   */
  greaterThan(value: bigint, errorMessage?: string): this {
    return this.process((num: bigint) => {
      if (num <= value) {
        throw new GuardianError(
          errorMessage || `BigInt must be greater than ${value}`,
          {
            expected: `> ${value}`,
            got: num,
            comparison: 'greaterThan',
            type: 'validation',
          },
        );
      }
      return num;
    }) as this;
  }

  /**
   * Validates BigInt is less than the specified value.
   *
   * @param value - Value to compare against
   * @param errorMessage - Optional custom error message
   * @returns A new BigIntGuardian with the validation applied (the receiver is never mutated)
   */
  lessThan(value: bigint, errorMessage?: string): this {
    return this.process((num: bigint) => {
      if (num >= value) {
        throw new GuardianError(
          errorMessage || `BigInt must be less than ${value}`,
          {
            expected: `< ${value}`,
            got: num,
            comparison: 'lessThan',
            type: 'validation',
          },
        );
      }
      return num;
    }) as this;
  }

  /**
   * Validates BigInt is greater than or equal to the specified value.
   *
   * @param value - Value to compare against
   * @param errorMessage - Optional custom error message
   * @returns A new BigIntGuardian with the validation applied (the receiver is never mutated)
   */
  greaterThanOrEqual(value: bigint, errorMessage?: string): this {
    return this.process((num: bigint) => {
      if (num < value) {
        throw new GuardianError(
          errorMessage || `BigInt must be greater than or equal to ${value}`,
          {
            expected: `>= ${value}`,
            got: num,
            comparison: 'greaterThanOrEqual',
            type: 'validation',
          },
        );
      }
      return num;
    }) as this;
  }

  /**
   * Validates BigInt is less than or equal to the specified value.
   *
   * @param value - Value to compare against
   * @param errorMessage - Optional custom error message
   * @returns A new BigIntGuardian with the validation applied (the receiver is never mutated)
   */
  lessThanOrEqual(value: bigint, errorMessage?: string): this {
    return this.process((num: bigint) => {
      if (num > value) {
        throw new GuardianError(
          errorMessage || `BigInt must be less than or equal to ${value}`,
          {
            expected: `<= ${value}`,
            got: num,
            comparison: 'lessThanOrEqual',
            type: 'validation',
          },
        );
      }
      return num;
    }) as this;
  }

  /**
   * Validates BigInt is even.
   *
   * @param errorMessage - Optional custom error message
   * @returns A new BigIntGuardian with the validation applied (the receiver is never mutated)
   */
  even(errorMessage?: string): this {
    return this.process((num: bigint) => {
      if (num % 2n !== 0n) {
        throw new GuardianError(
          errorMessage || 'BigInt must be even',
          {
            expected: 'even BigInt',
            got: num,
            comparison: 'even',
            type: 'validation',
          },
        );
      }
      return num;
    }) as this;
  }

  /**
   * Validates BigInt is odd.
   *
   * @param errorMessage - Optional custom error message
   * @returns A new BigIntGuardian with the validation applied (the receiver is never mutated)
   */
  odd(errorMessage?: string): this {
    return this.process((num: bigint) => {
      if (num % 2n === 0n) {
        throw new GuardianError(
          errorMessage || 'BigInt must be odd',
          {
            expected: 'odd BigInt',
            got: num,
            comparison: 'odd',
            type: 'validation',
          },
        );
      }
      return num;
    }) as this;
  }

  /**
   * Validates BigInt is a multiple of the specified value.
   *
   * @param divisor - The divisor to check against
   * @param errorMessage - Optional custom error message
   * @returns A new BigIntGuardian with the validation applied (the receiver is never mutated)
   */
  multipleOf(divisor: bigint, errorMessage?: string): this {
    return this.process((num: bigint) => {
      if (num % divisor !== 0n) {
        throw new GuardianError(
          errorMessage || `BigInt must be a multiple of ${divisor}`,
          {
            expected: `multiple of ${divisor}`,
            got: num,
            comparison: 'multipleOf',
            type: 'validation',
          },
        );
      }
      return num;
    }) as this;
  }

  /**
   * Helper function to check if a BigInt is prime.
   */
  private __isPrime(num: bigint): boolean {
    if (num < 2n) return false;
    if (num === 2n) return true;
    if (num % 2n === 0n) return false;

    const limit = this.__bigIntSqrt(num);
    for (let i = 3n; i <= limit; i += 2n) {
      if (num % i === 0n) return false;
    }
    return true;
  }

  /**
   * Helper function to calculate square root of BigInt.
   */
  private __bigIntSqrt(num: bigint): bigint {
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
  private __isPerfectPower(num: bigint, base?: bigint): boolean { //NOSONAR
    if (num < 1n) return false;
    if (num === 1n) return true;

    if (base === undefined) {
      // Check if num is a perfect power of any base >= 2
      for (
        let candidateBase = 2n;
        candidateBase <= this.__bigIntSqrt(num);
        candidateBase++
      ) {
        let power = candidateBase;
        while (power < num) {
          power *= candidateBase;
        }
        if (power === num) return true;
      }
      return false;
    } else {
      if (base <= 1n) return false;
      let power = base;
      while (power < num) {
        power *= base;
      }
      return power === num;
    }
  }

  /**
   * Validates BigInt is prime.
   *
   * @param errorMessage - Optional custom error message
   * @returns A new BigIntGuardian with the validation applied (the receiver is never mutated)
   */
  prime(errorMessage?: string): this {
    return this.process((num: bigint) => {
      if (!this.__isPrime(num)) {
        throw new GuardianError(
          errorMessage || 'BigInt must be prime',
          {
            expected: 'prime BigInt',
            got: num,
            comparison: 'prime',
            type: 'validation',
          },
        );
      }
      return num;
    }) as this;
  }

  /**
   * Validates BigInt is not prime.
   *
   * @param errorMessage - Optional custom error message
   * @returns A new BigIntGuardian with the validation applied (the receiver is never mutated)
   */
  notPrime(errorMessage?: string): this {
    return this.process((num: bigint) => {
      if (this.__isPrime(num)) {
        throw new GuardianError(
          errorMessage || 'BigInt must not be prime',
          {
            expected: 'non-prime BigInt',
            got: num,
            comparison: 'notPrime',
            type: 'validation',
          },
        );
      }
      return num;
    }) as this;
  }

  /**
   * Validates BigInt is a perfect power.
   *
   * @param base - Optional base to check against
   * @param errorMessage - Optional custom error message
   * @returns A new BigIntGuardian with the validation applied (the receiver is never mutated)
   */
  power(base?: bigint, errorMessage?: string): this {
    return this.process((num: bigint) => {
      if (!this.__isPerfectPower(num, base)) {
        const baseStr = base ? ` of ${base}` : '';
        throw new GuardianError(
          errorMessage || `BigInt must be a perfect power${baseStr}`,
          {
            expected: `perfect power${baseStr}`,
            got: num,
            comparison: 'power',
            type: 'validation',
          },
        );
      }
      return num;
    }) as this;
  }

  /**
   * Validates BigInt is not zero.
   *
   * @param errorMessage - Optional custom error message
   * @returns A new BigIntGuardian with the validation applied (the receiver is never mutated)
   */
  nonZero(errorMessage?: string): this {
    return this.process((num: bigint) => {
      if (num === 0n) {
        throw new GuardianError(
          errorMessage || 'BigInt must not be zero',
          {
            expected: 'non-zero BigInt',
            got: num,
            comparison: 'nonZero',
            type: 'validation',
          },
        );
      }
      return num;
    }) as this;
  }

  /**
   * Gets the bit length of the BigInt.
   *
   * @param expectedLength - Optional expected bit length
   * @param errorMessage - Optional custom error message
   * @returns A new BigIntGuardian with the validation applied (the receiver is never mutated)
   */
  bitLength(expectedLength?: number, errorMessage?: string): this {
    return this.process((num: bigint) => {
      const actualLength = num.toString(2).length;

      if (expectedLength !== undefined && actualLength !== expectedLength) {
        throw new GuardianError(
          errorMessage || `BigInt must have bit length ${expectedLength}`,
          {
            expected: `bit length ${expectedLength}`,
            got: `bit length ${actualLength}`,
            comparison: 'bitLength',
            type: 'validation',
          },
        );
      }
      return num;
    }) as this;
  }

  /**
   * Adds another BigInt.
   *
   * @param value - Value to add
   * @returns A new BigIntGuardian with the validation applied (the receiver is never mutated)
   */
  add(value: bigint): this {
    return this.process((num: bigint) => {
      return num + value;
    }) as this;
  }

  /**
   * Subtracts another BigInt.
   *
   * @param value - Value to subtract
   * @returns A new BigIntGuardian with the validation applied (the receiver is never mutated)
   */
  subtract(value: bigint): this {
    return this.process((num: bigint) => {
      return num - value;
    }) as this;
  }

  /**
   * Multiplies by another BigInt.
   *
   * @param value - Value to multiply by
   * @returns A new BigIntGuardian with the validation applied (the receiver is never mutated)
   */
  multiply(value: bigint): this {
    return this.process((num: bigint) => {
      return num * value;
    }) as this;
  }

  /**
   * Divides by another BigInt.
   *
   * @param value - Value to divide by
   * @param errorMessage - Optional custom error message
   * @returns A new BigIntGuardian with the validation applied (the receiver is never mutated)
   */
  divide(value: bigint, errorMessage?: string): this {
    return this.process((num: bigint) => {
      if (value === 0n) {
        throw new GuardianError(
          errorMessage || 'Cannot divide by zero',
          {
            expected: 'non-zero divisor',
            got: 'zero divisor',
            comparison: 'division',
            type: 'validation',
          },
        );
      }
      return num / value;
    }) as this;
  }

  /**
   * Gets modulo of BigInt.
   *
   * @param value - Modulo value
   * @param errorMessage - Optional custom error message
   * @returns A new BigIntGuardian with the validation applied (the receiver is never mutated)
   */
  mod(value: bigint, errorMessage?: string): this {
    return this.process((num: bigint) => {
      if (value === 0n) {
        throw new GuardianError(
          errorMessage || 'Cannot modulo by zero',
          {
            expected: 'non-zero modulo',
            got: 'zero modulo',
            comparison: 'modulo',
            type: 'validation',
          },
        );
      }
      return num % value;
    }) as this;
  }

  /**
   * Gets square root of BigInt.
   *
   * @param errorMessage - Optional custom error message
   * @returns A new BigIntGuardian with the validation applied (the receiver is never mutated)
   */
  squareRoot(errorMessage?: string): this {
    return this.process((num: bigint) => {
      if (num < 0n) {
        throw new GuardianError(
          errorMessage || 'Cannot calculate square root of negative BigInt',
          {
            expected: 'non-negative BigInt',
            got: num,
            comparison: 'squareRoot',
            type: 'validation',
          },
        );
      }
      return this.__bigIntSqrt(num);
    }) as this;
  }

  /**
   * Clamps BigInt to a range.
   *
   * @param min - Minimum value to clamp to
   * @param max - Maximum value to clamp to
   * @returns A new BigIntGuardian with the validation applied (the receiver is never mutated)
   */
  clamp(min: bigint, max: bigint): this {
    return this.process((num: bigint) => {
      if (num < min) return min;
      if (num > max) return max;
      return num;
    }) as this;
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
          errorMessage || 'Radix must be between 2 and 36',
          {
            expected: 'radix between 2 and 36',
            got: radix,
            comparison: 'radix',
            type: 'validation',
          },
        );
      }
      return num.toString(radix);
    }, StringGuardian) as StringGuardian;
  }

  //#endregion

  //#region OpenAPI Generation

  /**
   * Generates OpenAPI schema for bigint as integer with int64 format.
   * Note: OpenAPI represents bigint as integer type with int64 format.
   *
   * @returns OpenAPI schema with integer type
   */
  override toOpenAPI(): Record<string, unknown> {
    const schema = super.toOpenAPI();

    // BigInt maps to integer with int64 format in OpenAPI
    schema.type = 'integer';
    schema.format = 'int64';

    return schema;
  }

  //#endregion
}
