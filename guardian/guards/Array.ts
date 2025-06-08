import { BaseGuardian } from '../BaseGuardian.ts';
import { GuardianError } from '../GuardianError.ts';
import type { FunctionType, GuardianProxy } from '../types/mod.ts';
import { getType } from '../helpers/mod.ts';

/**
 * ArrayGuardian provides validation utilities for array values.
 * It extends BaseGuardian to provide a chainable API for array validation.
 *
 * @example
 * ```ts
 * const nonEmptyStringArray = ArrayGuardian.create()
 *   .of(StringGuardian.create())
 *   .notEmpty();
 *
 * // Validate an array
 * const validArray = nonEmptyStringArray(['hello', 'world']); // Returns: ['hello', 'world']
 * nonEmptyStringArray([]); // Throws: "Expected non-empty array"
 * nonEmptyStringArray([42]); // Throws: "Expected string, got number"
 * ```
 */
export class ArrayGuardian<T = unknown>
  extends BaseGuardian<FunctionType<T[]>> {
  /**
   * Creates a new ArrayGuardian instance that validates if a value is an array.
   *
   * @param error - Custom error message to use when validation fails
   * @returns A proxy that acts as both the guardian function and method provider
   *
   * @example
   * ```ts
   * const arrayGuard = ArrayGuardian.create();
   * const arr = arrayGuard([1, 2, 3]); // Returns: [1, 2, 3]
   * arrayGuard("not an array"); // Throws: "Expected array, got string"
   * ```
   */
  static create<T = unknown>(error?: string): GuardianProxy<ArrayGuardian<T>> {
    return new ArrayGuardian<T>((value: unknown): T[] => {
      if (!Array.isArray(value)) {
        throw new GuardianError(
          {
            got: value,
            expected: 'array',
            comparison: 'type',
            type: getType(value),
          },
          error || 'Expected array, got ${type}',
        );
      }
      return value as T[];
    }).proxy();
  }

  /**
   * Binds the array guardian to a specific element type using another guardian.
   *
   * @param elementGuardian - The guardian to use for validating each element
   * @returns A new ArrayGuardian with the element type validation applied
   *
   * @example
   * ```ts
   * const stringArrayGuard = ArrayGuardian.create().of(StringGuardian.create());
   * const arr = stringArrayGuard(['a', 'b', 'c']); // Returns: ['a', 'b', 'c']
   * stringArrayGuard([1, 2, 3]); // Throws: "Expected string, got number"
   * ```
   */
  public of<U>(
    elementGuardian: FunctionType<U>,
    message?: string,
  ): GuardianProxy<ArrayGuardian<U>> {
    return this.transform((array) => {
      const errors = new GuardianError(
        {
          got: array,
          expected: `array of ${elementGuardian.name}`,
          comparison: 'type',
        },
        message ?? 'Validation failed for array elements',
      );
      return array.map((element, index) => {
        try {
          return elementGuardian(element);
        } catch (error) {
          if (error instanceof GuardianError) {
            errors.addCause('' + index, error);
          }
        }
        if (errors.causeSize() > 0) {
          throw errors;
        }
      });
    }) as unknown as GuardianProxy<ArrayGuardian<U>>;
  }

  /**
   * Validates that the array has exactly the specified length.
   *
   * @param length - The expected length of the array
   * @param error - Custom error message to use when validation fails
   * @returns A new Guardian instance with the length validation applied
   *
   * @example
   * ```ts
   * const arrayGuard = ArrayGuardian.create().length(3);
   * arrayGuard([1, 2, 3]); // Returns: [1, 2, 3]
   * arrayGuard([1, 2]); // Throws: "Expected array to have length 3, got 2"
   * ```
   */
  public length(length: number, error?: string): GuardianProxy<this> {
    return this.test(
      (array) => array.length === length,
      error || `Expected array to have length ${length}`,
    );
  }

  /**
   * Validates that the array has at least the specified length.
   *
   * @param length - The minimum length of the array
   * @param error - Custom error message to use when validation fails
   * @returns A new Guardian instance with the minLength validation applied
   *
   * @example
   * ```ts
   * const arrayGuard = ArrayGuardian.create().minLength(2);
   * arrayGuard([1, 2, 3]); // Returns: [1, 2, 3]
   * arrayGuard([1]); // Throws: "Expected array to have at least 2 elements, got 1"
   * ```
   */
  public minLength(length: number, error?: string): GuardianProxy<this> {
    return this.test(
      (array) => array.length >= length,
      error ||
        `Expected array to have at least ${length} element${
          length === 1 ? '' : 's'
        }`,
    );
  }

  /**
   * Validates that the array has at most the specified length.
   *
   * @param length - The maximum length of the array
   * @param error - Custom error message to use when validation fails
   * @returns A new Guardian instance with the maxLength validation applied
   *
   * @example
   * ```ts
   * const arrayGuard = ArrayGuardian.create().maxLength(2);
   * arrayGuard([1, 2]); // Returns: [1, 2]
   * arrayGuard([1, 2, 3]); // Throws: "Expected array to have at most 2 elements, got 3"
   * ```
   */
  public maxLength(length: number, error?: string): GuardianProxy<this> {
    return this.test(
      (array) => array.length <= length,
      error ||
        `Expected array to have at most ${length} element${
          length === 1 ? '' : 's'
        }`,
    );
  }

  /**
   * Validates that the array is empty.
   *
   * @param error - Custom error message to use when validation fails
   * @returns A new Guardian instance with the empty validation applied
   *
   * @example
   * ```ts
   * const arrayGuard = ArrayGuardian.create().empty();
   * arrayGuard([]); // Returns: []
   * arrayGuard([1, 2]); // Throws: "Expected empty array, got array with 2 elements"
   * ```
   */
  public empty(error?: string): GuardianProxy<this> {
    return this.test(
      (array) => array.length === 0,
      error ||
        `Expected empty array`,
    );
  }

  /**
   * Validates that the array is not empty.
   *
   * @param error - Custom error message to use when validation fails
   * @returns A new Guardian instance with the notEmpty validation applied
   *
   * @example
   * ```ts
   * const arrayGuard = ArrayGuardian.create().notEmpty();
   * arrayGuard([1, 2]); // Returns: [1, 2]
   * arrayGuard([]); // Throws: "Expected non-empty array"
   * ```
   */
  public notEmpty(error?: string): GuardianProxy<this> {
    return this.test(
      (array) => array.length > 0,
      error || 'Expected non-empty array',
    );
  }

  /**
   * Validates that all elements in the array are unique.
   *
   * @param error - Custom error message to use when validation fails
   * @returns A new Guardian instance with the unique validation applied
   *
   * @example
   * ```ts
   * const arrayGuard = ArrayGuardian.create().unique();
   * arrayGuard([1, 2, 3]); // Returns: [1, 2, 3]
   * arrayGuard([1, 2, 1]); // Throws: "Expected array with unique elements"
   * ```
   */
  public unique(error?: string): GuardianProxy<this> {
    return this.test(
      (array) => new Set(array).size === array.length,
      error || 'Expected array with unique elements',
    );
  }

  /**
   * Validates that the array includes a specific value.
   *
   * @param value - The value that must be included in the array
   * @param error - Custom error message to use when validation fails
   * @returns A new Guardian instance with the includes validation applied
   *
   * @example
   * ```ts
   * const arrayGuard = ArrayGuardian.create().includes(2);
   * arrayGuard([1, 2, 3]); // Returns: [1, 2, 3]
   * arrayGuard([1, 3, 4]); // Throws: "Expected array to include 2"
   * ```
   */
  public includes<U extends T>(value: U, error?: string): GuardianProxy<this> {
    return this.test(
      (array) => array.includes(value as T),
      error || `Expected array to include ${value}`,
    );
  }
}
