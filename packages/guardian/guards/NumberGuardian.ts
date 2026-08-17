/**
 * @fileoverview `NumberGuardian` — coerce-by-default number validator
 * with range/sign/integer/parity checks, geographic helpers
 * (latitude/longitude/port/timestamp), and math transforms
 * (round/floor/ceil/clamp).
 *
 * @module
 */

import { BaseGuardian } from '../BaseGuardian.ts';
import { GuardianError } from '../errors/Base.ts';
import { coerceNumber } from '../helpers/coerce.ts';
import { gateAsyncStepResult } from '../helpers/thenable.ts';
import type { GuardianMetaData, GuardianTransform } from '../types/mod.ts';
import { DateGuardian } from './DateGuardian.ts';
import { StringGuardian } from './StringGuardian.ts';
import { BigIntGuardian } from './BigIntGuardian.ts';

/**
 * Number validator. Coerces numeric strings, bigints, booleans, and
 * valid `Date` instances (as ms-since-epoch) at parse time; rejects
 * `null`, `undefined`, non-numeric strings, `NaN`, `Infinity` /
 * `-Infinity`, and objects. See {@link Guardian.number} for the
 * standard factory.
 *
 * @example
 * ```ts
 * import { Guardian } from '@tundralibs/guardian';
 *
 * const Age = Guardian.number().integer().min(0).max(120);
 * Age.parse(42);    // 42
 * Age.parse('42');  // 42  ← coerced
 * ```
 *
 * @see {@link Guardian.number}
 */
export class NumberGuardian extends BaseGuardian<number> {
  /** Emitted schema type. */
  protected override readonly _type = 'number';
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
    const defaultNumberValidation = (input: unknown): number => {
      // Hot path: already-a-number with finite value short-circuits
      // out before the `coerceNumber` call. Most production inputs to
      // `Number.parse(x)` are already numeric (post-JSON deserialise),
      // so this saves a function call + the typeof re-check inside
      // `coerceNumber` on the common case. Coerce-by-default still
      // covers the rarer string/bigint/boolean inputs below.
      if (typeof input === 'number') {
        if (!Number.isFinite(input)) {
          throw new GuardianError('Number must be finite', {
            expected: 'finite number',
            got: Number.isNaN(input) ? 'NaN' : input,
            comparison: Number.isNaN(input) ? 'nan' : 'finite',
            type: 'number',
          });
        }
        return input;
      }
      const n = coerceNumber(input);
      if (!Number.isFinite(n)) {
        throw new GuardianError('Number must be finite', {
          expected: 'finite number',
          got: Number.isNaN(n) ? 'NaN' : n,
          comparison: Number.isNaN(n) ? 'nan' : 'finite',
          type: 'number',
        });
      }
      return n;
    };

    let finalTransform: GuardianTransform<unknown, number>;
    if (initialTransform) {
      // Chain: initialTransform -> then number validation
      finalTransform = (input: unknown) => {
        const result = initialTransform(input);
        // A type-crossing transform reached via `.process(fn,
        // NumberGuardian)` (e.g. `date().toTimestamp()`) may sit on an
        // async chain, in which case `initialTransform` returns a
        // Promise. Await it before coercion — otherwise the synchronous
        // coercion helper receives a Promise object and throws
        // "Cannot coerce object to number". The guardian is already
        // flagged `isAsync` upstream, so `parseAsync` awaits this. Only a
        // real Promise is a leaked async step to thread through
        // `.then()`; a non-Promise thenable-shaped VALUE would be ADOPTED
        // (and silently destroyed) if `.then()` were called on it, so
        // refuse it loudly instead.
        if (result instanceof Promise) {
          return result.then((r) => defaultNumberValidation(r));
        }
        return defaultNumberValidation(gateAsyncStepResult(result));
      };
    } else {
      // Just number validation
      finalTransform = defaultNumberValidation;
    }

    super(finalTransform, metaData);
  }

  //#region Coercion Control

  /**
   * Rejects coercion — the input must already be `typeof 'number'`.
   * Strings, bigints, booleans, and `Date`s that the default (coercing)
   * behaviour would otherwise convert are rejected instead.
   *
   * Implemented as a wrapper around the chain built so far (not a
   * rebuild from constructor parts, unlike {@link
   * ObjectGuardian.strict}), so it composes correctly no matter where
   * in the chain it's called — `Guardian.number().strict().min(0)` and
   * `Guardian.number().min(0).strict()` both reject a coerced input the
   * same way.
   *
   * @param errorMessage - Optional custom error message
   * @returns A new NumberGuardian with the validation applied (the receiver is never mutated)
   * @throws {GuardianError} If the input is not already a `number`
   *
   * @example
   * ```ts
   * import { Guardian } from '@tundralibs/guardian';
   *
   * const StrictAge = Guardian.number().strict().min(0);
   * StrictAge.parse(42);   // 42
   * StrictAge.parse('42'); // throws — no coercion in strict mode
   * ```
   */
  strict(errorMessage?: string): this {
    const previousTransform = this._composedTransform;
    return this._cloneWith((input: unknown) => {
      if (typeof input !== 'number') {
        throw new GuardianError(
          errorMessage ||
            `Number must not be coerced (strict mode) — expected typeof "number", got ${typeof input}`,
          {
            expected: 'number (no coercion)',
            got: typeof input,
            comparison: 'strict',
            type: 'number',
          },
        );
      }
      return previousTransform(input);
    }, this._metaData) as this;
  }

  //#endregion

  //#region Range Validation Methods

  /**
   * Validates minimum value.
   *
   * @param value - Minimum allowed value
   * @param errorMessage - Optional custom error message
   * @returns A new NumberGuardian with the validation applied (the receiver is never mutated)
   * @throws {GuardianError} If number is less than the specified minimum
   *
   * @example
   * ```ts
   * const schema = new NumberGuardian().min(0);
   * schema.parse(-1); // throws GuardianError
   * schema.parse(5); // 5
   * ```
   */
  min(value: number, errorMessage?: string): this {
    const result = this.process((num: number) => {
      if (num < value) {
        throw new GuardianError(
          errorMessage || `Number must be at least ${value}`,
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

    // Store constraint for OpenAPI generation
    result._metaData ??= {};
    result._metaData.minimum = value;
    return result;
  }

  /**
   * Validates maximum value.
   *
   * @param value - Maximum allowed value
   * @param errorMessage - Optional custom error message
   * @returns A new NumberGuardian with the validation applied (the receiver is never mutated)
   * @throws {GuardianError} If number exceeds the specified maximum
   *
   * @example
   * ```ts
   * const schema = new NumberGuardian().max(100);
   * schema.parse(101); // throws GuardianError
   * schema.parse(50); // 50
   * ```
   */
  max(value: number, errorMessage?: string): this {
    const result = this.process((num: number) => {
      if (num > value) {
        throw new GuardianError(
          errorMessage || `Number must be at most ${value}`,
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

    // Store constraint for OpenAPI generation
    result._metaData ??= {};
    result._metaData.maximum = value;
    return result;
  }

  /**
   * Validates that number is within the specified range (inclusive).
   *
   * @param min - Minimum allowed value (inclusive)
   * @param max - Maximum allowed value (inclusive)
   * @param errorMessage - Optional custom error message
   * @returns A new NumberGuardian with the validation applied (the receiver is never mutated)
   * @throws {GuardianError} If number is outside the specified range
   *
   * @example
   * ```ts
   * const schema = new NumberGuardian().range(0, 100);
   * schema.parse(50); // 50
   * schema.parse(150); // throws GuardianError
   * ```
   */
  range(min: number, max: number, errorMessage?: string): this {
    const result = this.process((num: number) => {
      if (num < min || num > max) {
        throw new GuardianError(
          errorMessage ||
            `Number must be between ${min} and ${max} (inclusive)`,
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

    // Store constraints for OpenAPI generation
    result._metaData ??= {};
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
   * @returns A new NumberGuardian with the validation applied (the receiver is never mutated)
   * @throws {GuardianError} If number is zero or negative
   */
  positive(errorMessage?: string): this {
    const result = this.process((num: number) => {
      if (num <= 0) {
        throw new GuardianError(
          errorMessage || 'Number must be positive (> 0)',
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

    // Store constraint for OpenAPI generation
    result._metaData ??= {};
    result._metaData.minimum = 0;
    result._metaData.exclusiveMinimum = true;
    return result;
  }

  /**
   * Validates that number is negative (< 0).
   *
   * @param errorMessage - Optional custom error message
   * @returns A new NumberGuardian with the validation applied (the receiver is never mutated)
   * @throws {GuardianError} If number is zero or positive
   */
  negative(errorMessage?: string): this {
    return this.process((num: number) => {
      if (num >= 0) {
        throw new GuardianError(
          errorMessage || 'Number must be negative (< 0)',
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

  //#endregion

  //#region Type Validation Methods

  /**
   * Validates that number is an integer.
   *
   * @param errorMessage - Optional custom error message
   * @returns A new NumberGuardian with the validation applied (the receiver is never mutated)
   * @throws {GuardianError} If number is not an integer
   *
   * @example
   * ```ts
   * const schema = new NumberGuardian().integer();
   * schema.parse(3.14); // throws GuardianError
   * schema.parse(42); // 42
   * ```
   */
  integer(errorMessage?: string): this {
    const result = this.process((num: number) => {
      if (!Number.isInteger(num)) {
        throw new GuardianError(errorMessage || 'Number must be an integer', {
          expected: 'integer',
          got: num,
          comparison: 'integer',
          type: 'validation',
        });
      }
      return num;
    }) as this;
    // Attach the format hint to the **new** instance, not the source.
    // Mutating `this._metaData` here would leak the constraint back
    // to the caller's variable, violating the immutable chain contract.
    result._metaData ??= {};
    result._metaData.format = 'integer';
    return result;
  }

  /**
   * Validates that number is finite (not Infinity or -Infinity).
   *
   * @param errorMessage - Optional custom error message
   * @returns A new NumberGuardian with the validation applied (the receiver is never mutated)
   * @throws {GuardianError} If number is Infinity or -Infinity
   */
  finite(errorMessage?: string): this {
    return this.process((num: number) => {
      if (!Number.isFinite(num)) {
        throw new GuardianError(errorMessage || 'Number must be finite', {
          expected: 'finite number',
          got: num,
          comparison: 'finite',
          type: 'validation',
        });
      }
      return num;
    }) as this;
  }

  /**
   * Validates that number is safe integer (within JavaScript's safe integer range).
   *
   * @param errorMessage - Optional custom error message
   * @returns A new NumberGuardian with the validation applied (the receiver is never mutated)
   * @throws {GuardianError} If number is not within safe integer range
   */
  safeInteger(errorMessage?: string): this {
    return this.process((num: number) => {
      if (!Number.isSafeInteger(num)) {
        throw new GuardianError(
          errorMessage ||
            `Number must be a safe integer (between ${Number.MIN_SAFE_INTEGER} and ${Number.MAX_SAFE_INTEGER})`,
          {
            expected:
              `safe integer (${Number.MIN_SAFE_INTEGER} to ${Number.MAX_SAFE_INTEGER})`,
            got: num,
            comparison: 'safeInteger',
            type: 'validation',
          },
        );
      }
      return num;
    }) as this;
  }

  /**
   * Validates that number is a multiple of the given value.
   *
   * @param divisor - The divisor to check against (must be non-zero)
   * @param errorMessage - Optional custom error message
   * @returns A new NumberGuardian with the validation applied (the receiver is never mutated)
   * @throws {Error} If `divisor` is `0` (or non-finite) — a config-time
   *   programming error, since `n % 0` is `NaN` and would reject every value.
   * @throws {GuardianError} If number is not a multiple of the specified divisor
   *
   * @example
   * ```ts
   * const schema = new NumberGuardian().multipleOf(5);
   * schema.parse(7); // throws GuardianError
   * schema.parse(10); // 10
   * new NumberGuardian().multipleOf(0.1).parse(0.3); // 0.3 (epsilon-tolerant)
   * ```
   */
  multipleOf(divisor: number, errorMessage?: string): this {
    if (divisor === 0 || !Number.isFinite(divisor)) {
      throw new Error('multipleOf divisor must be a non-zero finite number');
    }
    // Integer divisors use exact modulo. Non-integer (float) divisors
    // can't rely on `%` — `0.3 % 0.1` is `0.0999…` due to binary
    // floating-point representation — so compare the remainder against
    // an epsilon scaled to the operands.
    const isIntegerDivisor = Number.isInteger(divisor);
    const result = this.process((num: number) => {
      let isMultiple: boolean;
      if (isIntegerDivisor) {
        isMultiple = num % divisor === 0;
      } else {
        const remainder = Math.abs(num % divisor);
        const epsilon = 1e-9 * Math.max(1, Math.abs(num), Math.abs(divisor));
        isMultiple = remainder <= epsilon ||
          Math.abs(remainder - Math.abs(divisor)) <= epsilon;
      }
      if (!isMultiple) {
        throw new GuardianError(
          errorMessage || `Number must be a multiple of ${divisor}`,
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
    // Attach the multipleOf hint to the new instance, not the source —
    // see `integer()` for the rationale.
    result._metaData ??= {};
    result._metaData.multipleOf = divisor;
    return result;
  }

  /**
   * Validates that number is odd.
   *
   * @param errorMessage - Optional custom error message
   * @returns A new NumberGuardian with the validation applied (the receiver is never mutated)
   */
  odd(errorMessage?: string): this {
    return this.process((num: number) => {
      if (!Number.isInteger(num) || num % 2 === 0) {
        throw new GuardianError(
          errorMessage || 'Number must be odd',
          {
            expected: 'odd integer',
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
   * Validates that number is even.
   *
   * @param errorMessage - Optional custom error message
   * @returns A new NumberGuardian with the validation applied (the receiver is never mutated)
   */
  even(errorMessage?: string): this {
    return this.process((num: number) => {
      if (!Number.isInteger(num) || num % 2 !== 0) {
        throw new GuardianError(
          errorMessage || 'Number must be even',
          {
            expected: 'even integer',
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
   * Validates that number is prime.
   * Prime numbers are natural numbers greater than 1 with no positive divisors other than 1 and themselves.
   *
   * @param errorMessage - Optional custom error message
   * @returns A new NumberGuardian with the validation applied (the receiver is never mutated)
   */
  prime(errorMessage?: string): this {
    return this.process((num: number) => {
      if (!Number.isInteger(num) || num < 2) {
        throw new GuardianError(
          errorMessage || 'Number must be a prime number (integer >= 2)',
          {
            expected: 'prime number',
            got: num,
            comparison: 'prime',
            type: 'validation',
          },
        );
      }

      if (num === 2) return num; // 2 is prime
      if (num % 2 === 0) {
        throw new GuardianError(
          errorMessage || 'Number must be a prime number',
          {
            expected: 'prime number',
            got: num,
            comparison: 'prime',
            type: 'validation',
          },
        );
      }

      // Check odd divisors up to sqrt(num)
      for (let i = 3; i <= Math.sqrt(num); i += 2) {
        if (num % i === 0) {
          throw new GuardianError(
            errorMessage || 'Number must be a prime number',
            {
              expected: 'prime number',
              got: num,
              comparison: 'prime',
              type: 'validation',
            },
          );
        }
      }

      return num;
    }) as this;
  }

  /**
   * Validates that number is not zero.
   *
   * @param errorMessage - Optional custom error message
   * @returns A new NumberGuardian with the validation applied (the receiver is never mutated)
   */
  nonZero(errorMessage?: string): this {
    return this.process((num: number) => {
      if (num === 0) {
        throw new GuardianError(
          errorMessage || 'Number must not be zero',
          {
            expected: 'non-zero number',
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
   * Validates that number is a valid port (0-65535).
   *
   * @param errorMessage - Optional custom error message
   * @returns A new NumberGuardian with the validation applied (the receiver is never mutated)
   */
  validPort(errorMessage?: string): this {
    return this.process((num: number) => {
      if (!Number.isInteger(num) || num < 0 || num > 65535) {
        throw new GuardianError(
          errorMessage || 'Number must be a valid port (0-65535)',
          {
            expected: 'valid port (0-65535)',
            got: num,
            comparison: 'validPort',
            type: 'validation',
          },
        );
      }
      return num;
    }) as this;
  }

  /**
   * Validates that number is a valid Unix timestamp.
   *
   * @param errorMessage - Optional custom error message
   * @returns A new NumberGuardian with the validation applied (the receiver is never mutated)
   */
  timestamp(errorMessage?: string): this {
    return this.process((num: number) => {
      if (!Number.isInteger(num) || num < 0) {
        throw new GuardianError(
          errorMessage ||
            'Number must be a valid timestamp (non-negative integer)',
          {
            expected: 'valid timestamp',
            got: num,
            comparison: 'timestamp',
            type: 'validation',
          },
        );
      }

      // Test if it creates a valid date
      const date = new Date(num);
      if (Number.isNaN(date.getTime())) {
        throw new GuardianError(
          errorMessage || 'Number must be a valid timestamp',
          {
            expected: 'valid timestamp',
            got: num,
            comparison: 'timestamp',
            type: 'validation',
          },
        );
      }

      return num;
    }) as this;
  }

  /**
   * Validates the number is a Unix timestamp in **seconds** — the
   * conventional API-boundary form (Unix epoch in seconds, not ms).
   * Accepts `0` (the epoch) up to year 9999. Disambiguates the loose
   * {@link timestamp} which accepts either seconds or millis.
   *
   * @example
   * ```ts
   * import { Guardian } from '@tundralibs/guardian';
   *
   * Guardian.number().unixSeconds().parse(1700000000);   // ok
   * Guardian.number().unixSeconds().parse(1700000000000); // throws (too large)
   * ```
   */
  unixSeconds(errorMessage?: string): this {
    // Year 9999-12-31 in Unix seconds.
    const MAX_SECONDS = 253_402_300_799;
    const result = this.process((num: number) => {
      if (!Number.isInteger(num) || num < 0 || num > MAX_SECONDS) {
        throw new GuardianError(
          errorMessage ||
            `Number must be a Unix timestamp in seconds (0..${MAX_SECONDS}, got ${num})`,
          {
            expected: `Unix seconds (0..${MAX_SECONDS})`,
            got: num,
            comparison: 'unixSeconds',
            type: 'validation',
          },
        );
      }
      return num;
    }) as this;
    result._metaData ??= {};
    result._metaData.format = 'unix-seconds';
    return result;
  }

  /**
   * Validates the number is a Unix timestamp in **milliseconds** —
   * the conventional in-process form (`Date.now()` returns ms).
   * Accepts `0` up to year 9999. Disambiguates the loose
   * {@link timestamp}.
   *
   * @example
   * ```ts
   * import { Guardian } from '@tundralibs/guardian';
   *
   * Guardian.number().unixMillis().parse(Date.now());     // ok
   * Guardian.number().unixMillis().parse(1700000000);     // throws (too small — looks like seconds)
   * ```
   *
   * Note: by design, `Date.now()`-scale values are required. Inputs
   * that fit "Unix seconds" (~10-digit) will be rejected as
   * out-of-range. Use {@link unixSeconds} for that form.
   */
  unixMillis(errorMessage?: string): this {
    // Anything below year 2001 in ms — `2001-01-01T00:00:00Z` ≈
    // 978_307_200_000 ms — is almost certainly a seconds value
    // mistakenly passed as ms. Reject it.
    const MIN_MILLIS = 978_307_200_000;
    const MAX_MILLIS = 253_402_300_799_999;
    const result = this.process((num: number) => {
      if (!Number.isInteger(num) || num < MIN_MILLIS || num > MAX_MILLIS) {
        throw new GuardianError(
          errorMessage ||
            `Number must be a Unix timestamp in milliseconds (~${MIN_MILLIS}..${MAX_MILLIS}, got ${num})`,
          {
            expected: 'Unix milliseconds',
            got: num,
            comparison: 'unixMillis',
            type: 'validation',
          },
        );
      }
      return num;
    }) as this;
    result._metaData ??= {};
    result._metaData.format = 'unix-millis';
    return result;
  }

  /**
   * {@link power}'s fixed-base branch. Compares `log(num) / log(base)`
   * against its rounding with a `1e-10` epsilon rather than demanding
   * an exact integer — `Math.log(1000) / Math.log(10)` is
   * `2.9999999999999996`, so a strict test would reject genuine perfect
   * powers.
   *
   * @throws {GuardianError} When `base <= 1`, or when `num` is not a
   *   perfect power of `base`.
   *
   * @internal
   */
  private __checkSpecificBasePower(
    num: number,
    base: number,
    errorMessage?: string,
  ): void {
    if (base <= 1) {
      throw new GuardianError('Base must be greater than 1', {
        expected: 'base > 1',
        got: base,
        comparison: 'base',
        type: 'validation',
      });
    }

    const logResult = Math.log(num) / Math.log(base);
    const rounded = Math.round(logResult);
    // Compare with an epsilon like the any-base sibling
    // (`__checkAnyBasePower`) rather than requiring an EXACT integer:
    // floating-point log ratios are rarely exact — `Math.log(1000) /
    // Math.log(10)` is `2.9999999999999996`, not `3` — so `power(10)`
    // etc. would otherwise reject genuine perfect powers. `logResult`
    // is non-finite for `num <= 0`, which correctly fails the check.
    const isPerfectPower = Number.isFinite(logResult) &&
      Math.abs(logResult - rounded) < 1e-10;
    if (!isPerfectPower) {
      throw new GuardianError(
        errorMessage || `Number must be a perfect power of ${base}`,
        {
          expected: `perfect power of ${base}`,
          got: num,
          comparison: 'power',
          type: 'validation',
        },
      );
    }
  }

  /**
   * {@link power}'s any-base branch: trial-divides bases `2..√num`
   * looking for an integer exponent above 1. `1` is accepted outright
   * (it is `1^n` for every `n`).
   *
   * @throws {GuardianError} When no base yields an integer exponent.
   *
   * @internal
   */
  private __checkAnyBasePower(num: number, errorMessage?: string): void {
    // 1 is a special case - it's 1^n for any n
    if (num === 1) {
      return;
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
        errorMessage || 'Number must be a perfect power',
        {
          expected: 'perfect power',
          got: num,
          comparison: 'power',
          type: 'validation',
        },
      );
    }
  }

  /**
   * Validates that number is a perfect power of the given base.
   *
   * @param base - The base to check against (defaults to any base)
   * @param errorMessage - Optional custom error message
   * @returns A new NumberGuardian with the validation applied (the receiver is never mutated)
   */
  power(base?: number, errorMessage?: string): this {
    return this.process((num: number) => {
      if (!Number.isInteger(num) || num < 1) {
        throw new GuardianError(
          errorMessage ||
            'Number must be a positive integer to check for perfect power',
          {
            expected: 'positive integer',
            got: num,
            comparison: 'power',
            type: 'validation',
          },
        );
      }

      if (base === undefined) {
        this.__checkAnyBasePower(num, errorMessage);
      } else {
        this.__checkSpecificBasePower(num, base, errorMessage);
      }

      return num;
    }) as this;
  }

  /**
   * Validates that number is between min and max values.
   *
   * @param min - Minimum value
   * @param max - Maximum value
   * @param inclusive - Whether bounds are inclusive (defaults to true)
   * @param errorMessage - Optional custom error message
   * @returns A new NumberGuardian with the validation applied (the receiver is never mutated)
   */
  between(
    min: number,
    max: number,
    inclusive = true,
    errorMessage?: string,
  ): this {
    return this.process((num: number) => {
      const withinBounds = inclusive
        ? (num >= min && num <= max)
        : (num > min && num < max);

      if (!withinBounds) {
        const boundsStr = inclusive
          ? `${min} <= value <= ${max}`
          : `${min} < value < ${max}`;
        const boundsDesc = inclusive ? 'inclusive' : 'exclusive';

        throw new GuardianError(
          errorMessage ||
            `Number must be between ${min} and ${max} (${boundsDesc})`,
          {
            expected: boundsStr,
            got: num,
            comparison: 'between',
            type: 'validation',
          },
        );
      }
      return num;
    }) as this;
  }

  /**
   * Validates that number is a valid latitude (-90 to 90).
   *
   * @param errorMessage - Optional custom error message
   * @returns A new NumberGuardian with the validation applied (the receiver is never mutated)
   */
  latitude(errorMessage?: string): this {
    return this.process((num: number) => {
      if (num < -90 || num > 90) {
        throw new GuardianError(
          errorMessage || 'Number must be a valid latitude (-90 to 90)',
          {
            expected: 'valid latitude (-90 to 90)',
            got: num,
            comparison: 'latitude',
            type: 'validation',
          },
        );
      }
      return num;
    }) as this;
  }

  /**
   * Validates that number is a valid longitude (-180 to 180).
   *
   * @param errorMessage - Optional custom error message
   * @returns A new NumberGuardian with the validation applied (the receiver is never mutated)
   */
  longitude(errorMessage?: string): this {
    return this.process((num: number) => {
      if (num < -180 || num > 180) {
        throw new GuardianError(
          errorMessage || 'Number must be a valid longitude (-180 to 180)',
          {
            expected: 'valid longitude (-180 to 180)',
            got: num,
            comparison: 'longitude',
            type: 'validation',
          },
        );
      }
      return num;
    }) as this;
  }

  /**
   * Validates the number is a percentage in `0..100`.
   *
   * @param opts.allowOver - If `true`, permits values > 100 (useful
   *   for APR, growth rates, etc.). Default `false`.
   *
   * @example
   * ```ts
   * import { Guardian } from '@tundralibs/guardian';
   *
   * Guardian.number().percentage().parse(42);              // 42
   * Guardian.number().percentage().parse(150);             // throws
   * Guardian.number().percentage({ allowOver: true }).parse(150); // 150
   * ```
   */
  percentage(
    opts?: { allowOver?: boolean },
    errorMessage?: string,
  ): this {
    const allowOver = opts?.allowOver === true;
    const max = allowOver ? Infinity : 100;
    const result = this.process((num: number) => {
      if (num < 0 || num > max) {
        throw new GuardianError(
          errorMessage ||
            `Percentage must be in 0..${allowOver ? '∞' : '100'} (got ${num})`,
          {
            expected: allowOver ? '>= 0' : '0..100',
            got: num,
            comparison: 'percentage',
            type: 'validation',
          },
        );
      }
      return num;
    }) as this;
    result._metaData ??= {};
    result._metaData.minimum = 0;
    if (!allowOver) result._metaData.maximum = 100;
    return result;
  }

  /**
   * Validates the number is a probability in `0..1` inclusive.
   * Common in ML / statistical code where the input is a normalised
   * score.
   */
  probability(errorMessage?: string): this {
    const result = this.process((num: number) => {
      if (num < 0 || num > 1) {
        throw new GuardianError(
          errorMessage || `Probability must be in 0..1 (got ${num})`,
          {
            expected: '0..1',
            got: num,
            comparison: 'probability',
            type: 'validation',
          },
        );
      }
      return num;
    }) as this;
    result._metaData ??= {};
    result._metaData.minimum = 0;
    result._metaData.maximum = 1;
    return result;
  }

  /**
   * TCP/UDP port (1..65535, integer). Alias of {@link validPort} —
   * shorter and more discoverable.
   */
  port(errorMessage?: string): this {
    return this.validPort(errorMessage);
  }

  /**
   * Validates a four-digit calendar year (e.g. `2026`). Useful for
   * date-component validation outside a full `Date` field.
   *
   * @param opts.min - Inclusive lower bound (default `1900`).
   * @param opts.max - Inclusive upper bound (default `2099`).
   */
  fullYear(
    opts?: { min?: number; max?: number },
    errorMessage?: string,
  ): this {
    const min = opts?.min ?? 1900;
    const max = opts?.max ?? 2099;
    const result = this.process((num: number) => {
      if (!Number.isInteger(num) || num < min || num > max) {
        throw new GuardianError(
          errorMessage ||
            `Year must be an integer in ${min}..${max} (got ${num})`,
          {
            expected: `${min}..${max}`,
            got: num,
            comparison: 'fullYear',
            type: 'validation',
          },
        );
      }
      return num;
    }) as this;
    result._metaData ??= {};
    result._metaData.minimum = min;
    result._metaData.maximum = max;
    return result;
  }

  /**
   * Basis points (0..10000). Standard finance unit where 1bp = 0.01%.
   */
  bps(errorMessage?: string): this {
    const result = this.process((num: number) => {
      if (num < 0 || num > 10000) {
        throw new GuardianError(
          errorMessage || `Basis points must be in 0..10000 (got ${num})`,
          {
            expected: '0..10000',
            got: num,
            comparison: 'bps',
            type: 'validation',
          },
        );
      }
      return num;
    }) as this;
    result._metaData ??= {};
    result._metaData.minimum = 0;
    result._metaData.maximum = 10000;
    return result;
  }

  /**
   * Natural number (non-negative integer: 0, 1, 2, …). Convenience
   * alias for `.integer().nonNegative()`.
   */
  naturalNumber(errorMessage?: string): this {
    const result = this.process((num: number) => {
      if (!Number.isInteger(num) || num < 0) {
        throw new GuardianError(
          errorMessage ||
            `Number must be a natural number (>=0 integer), got ${num}`,
          {
            expected: 'non-negative integer',
            got: num,
            comparison: 'natural',
            type: 'validation',
          },
        );
      }
      return num;
    }) as this;
    result._metaData ??= {};
    result._metaData.format = 'integer';
    result._metaData.minimum = 0;
    return result;
  }

  /**
   * Validates a fixed-point decimal — i.e. the value can be expressed
   * exactly with `scale` digits after the decimal point. Useful for
   * money / quantity fields where floating-point drift is unacceptable.
   *
   * @param opts.scale     - Number of allowed decimal digits.
   * @param opts.precision - Optional total significant digits cap.
   *
   * @example
   * ```ts
   * import { Guardian } from '@tundralibs/guardian';
   *
   * Guardian.number().bigDecimal({ scale: 2 }).parse(19.99);  // ok
   * Guardian.number().bigDecimal({ scale: 2 }).parse(19.999); // throws
   * ```
   */
  bigDecimal(
    opts: { scale: number; precision?: number },
    errorMessage?: string,
  ): this {
    const { scale, precision } = opts;
    const factor = 10 ** scale;
    const result = this.process((num: number) => {
      const scaled = num * factor;
      if (
        !Number.isFinite(scaled) || Math.abs(scaled - Math.round(scaled)) > 1e-9
      ) {
        throw new GuardianError(
          errorMessage ||
            `Number must fit in scale=${scale} decimal places (got ${num})`,
          {
            expected: `${scale} decimal places`,
            got: num,
            comparison: 'bigDecimal',
            type: 'validation',
          },
        );
      }
      if (precision !== undefined) {
        // Total significant digits = digits before + after the decimal.
        const totalDigits = Math.abs(num).toString().replace(/\D/g, '').length;
        if (totalDigits > precision) {
          throw new GuardianError(
            errorMessage ||
              `Number must have at most ${precision} significant digits (got ${totalDigits})`,
            {
              expected: `precision <= ${precision}`,
              got: totalDigits,
              comparison: 'bigDecimal',
              type: 'validation',
            },
          );
        }
      }
      return num;
    }) as this;
    result._metaData ??= {};
    result._metaData.scale = scale;
    if (precision !== undefined) result._metaData.precision = precision;
    return result;
  }

  /**
   * Validates the number is evenly divisible by every value in
   * `divisors` (generalises {@link multipleOf}). Throws on the first
   * divisor that doesn't divide cleanly.
   *
   * @example
   * ```ts
   * import { Guardian } from '@tundralibs/guardian';
   *
   * Guardian.number().evenlyDivisible([2, 3]).parse(12); // ok (multiple of 6)
   * Guardian.number().evenlyDivisible([2, 3]).parse(8);  // throws (not / 3)
   * ```
   */
  evenlyDivisible(divisors: number[], errorMessage?: string): this {
    if (divisors.length === 0) {
      throw new Error('evenlyDivisible requires at least one divisor');
    }
    return this.process((num: number) => {
      for (const d of divisors) {
        if (d === 0 || num % d !== 0) {
          throw new GuardianError(
            errorMessage ||
              `Number ${num} must be evenly divisible by ${
                divisors.join(', ')
              }`,
            {
              expected: `multiple of ${divisors.join(', ')}`,
              got: num,
              comparison: 'evenlyDivisible',
              type: 'validation',
            },
          );
        }
      }
      return num;
    }) as this;
  }

  //#endregion

  //#region Mathematical Transformation Methods

  /**
   * Rounds the number to the nearest integer.
   *
   * @returns A new NumberGuardian with the validation applied (the receiver is never mutated)
   *
   * @example
   * ```ts
   * const schema = new NumberGuardian().round();
   * schema.parse(3.7); // 4
   * schema.parse(3.2); // 3
   * ```
   */
  round(): this {
    return this.process(
      (num: number) => Math.round(num),
    ) as this;
  }

  /**
   * Floors the number (rounds down to nearest integer).
   *
   * @returns A new NumberGuardian with the validation applied (the receiver is never mutated)
   */
  floor(): this {
    return this.process(
      (num: number) => Math.floor(num),
    ) as this;
  }

  /**
   * Ceils the number (rounds up to nearest integer).
   *
   * @returns A new NumberGuardian with the validation applied (the receiver is never mutated)
   */
  ceil(): this {
    return this.process(
      (num: number) => Math.ceil(num),
    ) as this;
  }

  /**
   * Truncates the number (removes decimal part).
   *
   * @returns A new NumberGuardian with the validation applied (the receiver is never mutated)
   */
  trunc(): this {
    return this.process(
      (num: number) => Math.trunc(num),
    ) as this;
  }

  /**
   * Gets absolute value of the number.
   *
   * @returns A new NumberGuardian with the validation applied (the receiver is never mutated)
   */
  abs(): this {
    return this.process(
      (num: number) => Math.abs(num),
    ) as this;
  }

  /**
   * Negates the number (multiplies by -1).
   *
   * @returns A new NumberGuardian with the validation applied (the receiver is never mutated)
   */
  negate(): this {
    return this.process(
      (num: number) => -num,
    ) as this;
  }

  /**
   * Clamps the number to the specified range.
   * Unlike range(), this transforms the value instead of validating it.
   *
   * @param min - Minimum value to clamp to
   * @param max - Maximum value to clamp to
   * @returns A new NumberGuardian with the validation applied (the receiver is never mutated)
   *
   * @example
   * ```ts
   * const schema = new NumberGuardian().clamp(0, 100);
   * schema.parse(150); // 100 (clamped)
   * schema.parse(-10); // 0 (clamped)
   * schema.parse(50); // 50 (unchanged)
   * ```
   */
  clamp(min: number, max: number): this {
    return this.process(
      (num: number) => Math.min(Math.max(num, min), max),
    ) as this;
  }

  /**
   * Rounds the number to a specified number of decimal places.
   *
   * @param digits - Number of decimal places to round to
   * @returns A new NumberGuardian with the validation applied (the receiver is never mutated)
   *
   * @example
   * ```ts
   * const schema = new NumberGuardian().toFixed(2);
   * schema.parse(3.14159); // 3.14
   * schema.parse(5); // 5.00
   * ```
   */
  toFixed(digits: number): this {
    return this.process(
      (num: number) => Number.parseFloat(num.toFixed(digits)),
    ) as this;
  }

  /**
   * Formats the number as a localized currency string.
   *
   * Crosses into a string guardian — the output is the formatted
   * string, not a number, so the emitted schema reports `type:
   * 'string'`.
   *
   * @param locale - Locale for currency formatting (defaults to 'en-US')
   * @param currency - Currency code (defaults to 'USD')
   * @returns A guardian whose output is the formatted currency string.
   *
   * @example
   * ```ts
   * new NumberGuardian().formatCurrency().parse(1234.5); // '$1,234.50'
   * new NumberGuardian().formatCurrency('de-DE', 'EUR').parse(1234.5);
   * //  '1.234,50 €'
   * ```
   */
  formatCurrency(locale = 'en-US', currency = 'USD'): BaseGuardian<string> {
    // Build the formatter once per guardian, not once per parse.
    const formatter = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currency,
    });
    return this.process(
      (num: number) => formatter.format(num),
      StringGuardian,
    );
  }

  /**
   * Formats number as percentage.
   *
   * @param decimals - Number of decimal places (defaults to 2)
   * @returns A new NumberGuardian with the validation applied (the receiver is never mutated)
   */
  formatPercentage(decimals = 2): this {
    return this.process(
      (num: number) => Number.parseFloat((num * 100).toFixed(decimals)),
    ) as this;
  }

  /**
   * Formats the number with grouped thousands separators (US
   * convention). Crosses into a string guardian — the separators only
   * survive as a string.
   *
   * @returns A guardian whose output is the comma-grouped string.
   *
   * @example
   * ```ts
   * new NumberGuardian().addCommas().parse(1234567); // '1,234,567'
   * ```
   */
  addCommas(): BaseGuardian<string> {
    return this.process(
      (num: number) => num.toLocaleString('en-US'),
      StringGuardian,
    );
  }

  /**
   * Left-pads the number's digits with zeros to at least `length`
   * characters. Crosses into a string guardian — leading zeros are
   * only meaningful on a string (a number would drop them).
   *
   * The sign is preserved and does not count toward `length`.
   *
   * @param length - Minimum length of the digit portion.
   * @returns A guardian whose output is the zero-padded string.
   *
   * @example
   * ```ts
   * new NumberGuardian().padZeros(4).parse(42);  // '0042'
   * new NumberGuardian().padZeros(4).parse(-42); // '-0042'
   * ```
   */
  padZeros(length: number): BaseGuardian<string> {
    return this.process(
      (num: number) => {
        const negative = num < 0;
        const digits = Math.abs(num).toString().padStart(length, '0');
        return negative ? `-${digits}` : digits;
      },
      StringGuardian,
    );
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
      if (Number.isNaN(date.getTime())) {
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
    }, DateGuardian) as DateGuardian;
  }

  //#endregion

  //#endregion
}
