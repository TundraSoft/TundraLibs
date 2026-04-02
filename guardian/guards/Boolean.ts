/**
 * Boolean value validation and transformation guardian.
 * Provides functionality to validate, coerce and test boolean values.
 */
import { BaseGuardian } from '../BaseGuardian.ts';
import type { FunctionType, GuardianProxy } from '../types/mod.ts';
import { GuardianError } from '../GuardianError.ts';
import { getType } from '../helpers/mod.ts';

/**
 * BooleanGuardian provides validation and transformation utilities for boolean values.
 * It extends BaseGuardian to provide a chainable API for boolean processing.
 * This guardian handles both strict boolean values and common string/number representations
 * of boolean values (like "true", "false", 0, 1).
 *
 * @example
 * ```ts
 * const trueValidator = BooleanGuardian.create()
 *   .true();
 *
 * // Validate a boolean
 * const validatedBool = trueValidator(true); // Returns: true
 * trueValidator(false); // Throws: "Expected value to be TRUE, got false"
 * ```
 */
export class BooleanGuardian extends BaseGuardian<FunctionType<boolean>> {
  /**
   * Creates a new BooleanGuardian instance that validates if a value is a boolean
   * or can be converted to a boolean.
   *
   * Accepts the following values:
   * - Boolean: true, false
   * - String: "true", "TRUE", "false", "FALSE", "1", "0"
   * - Number: 1, 0
   *
   * @param error - Custom error message to use when validation fails
   * @returns A proxy that acts as both the guardian function and method provider
   *
   * @example
   * ```ts
   * const boolGuard = BooleanGuardian.create();
   * boolGuard(true); // Returns: true
   * boolGuard("true"); // Returns: true
   * boolGuard(1); // Returns: true
   * boolGuard("invalid"); // Throws: "Expected boolean, got string"
   * ```
   */
  static create(error?: string): GuardianProxy<BooleanGuardian> {
    return new BooleanGuardian((value: unknown): boolean => {
      if (typeof value === 'boolean') return value;
      if (
        value === 'true' || value === 'TRUE' || value === '1' || value === 1
      ) return true;
      if (
        value === 'false' || value === 'FALSE' || value === '0' || value === 0
      ) return false;
      throw new GuardianError(
        { got: getType(value), expected: 'boolean', comparison: 'type' },
        error || 'Expected value to be boolean, got ${got}',
      );
    }).proxy();
  }

  /**
   * Validates that the boolean value is exactly true.
   *
   * @param error - Custom error message to use when validation fails
   * @returns A new Guardian instance with the true validation applied
   *
   * @example
   * ```ts
   * BooleanGuardian.create()(false).true();
   * // Throws: "Expected value to be TRUE, got false"
   * ```
   */
  public true(error?: string): GuardianProxy<this> {
    return this.test(
      (value) => value === true,
      error || 'Expected value to be TRUE, got ${got}',
    );
  }

  /**
   * Validates that the boolean value is exactly false.
   *
   * @param error - Custom error message to use when validation fails
   * @returns A new Guardian instance with the false validation applied
   *
   * @example
   * ```ts
   * BooleanGuardian.create()(true).false();
   * // Throws: "Expected value to be FALSE, got true"
   * ```
   */
  public false(error?: string): GuardianProxy<this> {
    return this.test(
      (value) => value === false,
      error || 'Expected value to be FALSE, got ${got}',
    );
  }
}
