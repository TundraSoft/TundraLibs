import { BaseGuardian } from '../BaseGuardian.ts';
import { GuardianError } from '../GuardianError.ts';
import type { GuardianMetaData } from '../types/mod.ts';

/**
 * Guardian for array validation and transformation.
 * Provides fluent API for building array validation pipelines with element validation.
 *
 * @template T - The element type of the array
 *
 * @example
 * ```ts
 * const schema = new ArrayGuardian()
 *   .of(Guardian.string().minLength(3))
 *   .minLength(1)
 *   .maxLength(10);
 *
 * const result = schema.parse(['hello', 'world']); // ['hello', 'world']
 * ```
 *
 * @example
 * ```ts
 * // Array of unknown elements (default)
 * const anyArray = Guardian.array().minLength(1);
 * const result = anyArray.parse([1, 'hello', true]); // [1, 'hello', true]
 * ```
 *
 * @since 1.0.0
 */
export class ArrayGuardian<T = unknown> extends BaseGuardian<Array<T>> {
  /**
   * Creates a new ArrayGuardian instance.
   *
   * @param metaData - Optional metadata for this guardian
   */
  constructor(metaData?: GuardianMetaData) {
    super((input: unknown) => {
      if (!Array.isArray(input)) {
        throw new GuardianError('Expected array but got ${got}', {
          expected: 'array',
          got: typeof input,
          comparison: 'type',
          type: 'array',
        });
      }

      return input as Array<T>;
    }, metaData);
  }

  //#region Element Validation

  /**
   * Validates each element in the array using the provided guardian.
   *
   * @template U - The new element type after validation
   * @param elementGuardian - Guardian to validate each element
   * @returns New ArrayGuardian with element validation
   *
   * @example
   * ```ts
   * const stringArray = Guardian.array().of(Guardian.string());
   * stringArray.parse(['hello', 'world']); // ['hello', 'world']
   * stringArray.parse(['hello', 42]); // throws GuardianError
   * ```
   */
  of<U>(elementGuardian: BaseGuardian<U>): ArrayGuardian<U> {
    return this.step((value: Array<T>) => {
      const validatedElements: U[] = [];
      for (let i = 0; i < value.length; i++) {
        try {
          validatedElements.push(elementGuardian.parse(value[i]));
        } catch (error) {
          if (error instanceof GuardianError) {
            throw new GuardianError(
              `Array element at index ${i}: ${error.message}`,
              {
                ...error.context,
                type: 'array_element',
              } as any,
            );
          }
          throw error;
        }
      }
      return validatedElements;
    }, 'Validate array elements') as ArrayGuardian<U>;
  }

  //#endregion

  //#region Length Validation

  /**
   * Validates exact array length.
   *
   * @param length - Exact required length
   * @param message - Optional custom error message
   * @returns New ArrayGuardian with length validation
   *
   * @example
   * ```ts
   * const exactLength = Guardian.array().length(3);
   * exactLength.parse([1, 2, 3]); // [1, 2, 3]
   * exactLength.parse([1, 2]); // throws GuardianError
   * ```
   */
  length(length: number, message?: string): ArrayGuardian<T> {
    return this.step((value: Array<T>) => {
      if (value.length !== length) {
        throw new GuardianError(
          message || 'Expected array length ${expected}, got ${got}',
          {
            expected: length,
            got: value.length,
            comparison: 'length',
            type: 'array_length',
          },
        );
      }
      return value;
    }) as ArrayGuardian<T>;
  }

  /**
   * Validates minimum array length.
   *
   * @param minLength - Minimum required length
   * @param message - Optional custom error message
   * @returns New ArrayGuardian with minimum length validation
   *
   * @example
   * ```ts
   * const nonEmpty = Guardian.array().minLength(1);
   * nonEmpty.parse([1, 2, 3]); // [1, 2, 3]
   * nonEmpty.parse([]); // throws GuardianError
   * ```
   */
  minLength(minLength: number, message?: string): ArrayGuardian<T> {
    return this.step((value: Array<T>) => {
      if (value.length < minLength) {
        throw new GuardianError(
          message ||
            'Array length must be at least ${expected}, got ${got}',
          {
            expected: minLength,
            got: value.length,
            comparison: 'minLength',
            type: 'array_min_length',
          },
        );
      }
      return value;
    }) as ArrayGuardian<T>;
  }

  /**
   * Validates maximum array length.
   *
   * @param maxLength - Maximum allowed length
   * @param message - Optional custom error message
   * @returns New ArrayGuardian with maximum length validation
   *
   * @example
   * ```ts
   * const limitedArray = Guardian.array().maxLength(5);
   * limitedArray.parse([1, 2, 3]); // [1, 2, 3]
   * limitedArray.parse([1, 2, 3, 4, 5, 6]); // throws GuardianError
   * ```
   */
  maxLength(maxLength: number, message?: string): ArrayGuardian<T> {
    return this.step((value: Array<T>) => {
      if (value.length > maxLength) {
        throw new GuardianError(
          message ||
            'Array length must be at most ${expected}, got ${got}',
          {
            expected: maxLength,
            got: value.length,
            comparison: 'maxLength',
            type: 'array_max_length',
          },
        );
      }
      return value;
    }) as ArrayGuardian<T>;
  }

  /**
   * Validates that the array is not empty.
   *
   * @param message - Optional custom error message
   * @returns New ArrayGuardian with non-empty validation
   *
   * @example
   * ```ts
   * const nonEmpty = Guardian.array().nonEmpty();
   * nonEmpty.parse([1, 2, 3]); // [1, 2, 3]
   * nonEmpty.parse([]); // throws GuardianError
   * ```
   */
  nonEmpty(message?: string): ArrayGuardian<T> {
    return this.minLength(1, message || 'Array must not be empty');
  }

  //#endregion

  //#region Content Validation

  /**
   * Validates that all elements in the array are unique.
   *
   * @param message - Optional custom error message
   * @returns New ArrayGuardian with uniqueness validation
   *
   * @example
   * ```ts
   * const uniqueArray = Guardian.array().unique();
   * uniqueArray.parse([1, 2, 3]); // [1, 2, 3]
   * uniqueArray.parse([1, 2, 2]); // throws GuardianError
   * ```
   */
  unique(message?: string): ArrayGuardian<T> {
    return this.step((value: Array<T>) => {
      const seen = new Set<T>();
      const duplicates: T[] = [];

      for (const item of value) {
        if (seen.has(item)) {
          if (!duplicates.includes(item)) {
            duplicates.push(item);
          }
        } else {
          seen.add(item);
        }
      }

      if (duplicates.length > 0) {
        throw new GuardianError(
          message ||
            'Array must contain unique elements, found duplicates: ${got}',
          {
            expected: 'unique elements',
            got: duplicates,
            comparison: 'unique',
            type: 'array_duplicate',
          },
        );
      }

      return value;
    }) as ArrayGuardian<T>;
  }

  /**
   * Validates that the array contains a specific element.
   *
   * @param element - Element that must be present in the array
   * @param message - Optional custom error message
   * @returns New ArrayGuardian with inclusion validation
   *
   * @example
   * ```ts
   * const mustHaveHello = Guardian.array().of(Guardian.string()).includes('hello');
   * mustHaveHello.parse(['hello', 'world']); // ['hello', 'world']
   * mustHaveHello.parse(['world']); // throws GuardianError
   * ```
   */
  includes(element: T, message?: string): ArrayGuardian<T> {
    return this.step((value: Array<T>) => {
      if (!value.includes(element)) {
        throw new GuardianError(
          message || 'Array must include ${expected}',
          {
            expected: element,
            got: value,
            comparison: 'includes',
            type: 'array_missing_element',
          },
        );
      }
      return value;
    }) as ArrayGuardian<T>;
  }

  /**
   * Validates that the array does not contain a specific element.
   *
   * @param element - Element that must not be present in the array
   * @param message - Optional custom error message
   * @returns New ArrayGuardian with exclusion validation
   *
   * @example
   * ```ts
   * const noHello = Guardian.array().of(Guardian.string()).excludes('hello');
   * noHello.parse(['world', 'test']); // ['world', 'test']
   * noHello.parse(['hello', 'world']); // throws GuardianError
   * ```
   */
  excludes(element: T, message?: string): ArrayGuardian<T> {
    return this.step((value: Array<T>) => {
      if (value.includes(element)) {
        throw new GuardianError(
          message || 'Array must not include ${expected}',
          {
            expected: element,
            got: value,
            comparison: 'excludes',
            type: 'array_forbidden_element',
          },
        );
      }
      return value;
    }) as ArrayGuardian<T>;
  }

  //#endregion

  //#region Array Transformations

  /**
   * Transforms array by mapping each element through a transformation function.
   *
   * @template U - The new element type after transformation
   * @param mapper - Function to transform each element
   * @param description - Optional description of the transformation
   * @returns New ArrayGuardian with mapped elements
   *
   * @example
   * ```ts
   * const doubled = Guardian.array().of(Guardian.number())
   *   .map(x => x * 2);
   * doubled.parse([1, 2, 3]); // [2, 4, 6]
   * ```
   */
  map<U>(
    mapper: (item: T, index: number, array: Array<T>) => U,
    description?: string,
  ): ArrayGuardian<U> {
    return this.step((value: Array<T>) => {
      return value.map(mapper);
    }, description || 'Map array elements') as ArrayGuardian<U>;
  }

  /**
   * Transforms array by filtering elements that match a predicate.
   *
   * @param predicate - Function to test each element
   * @param description - Optional description of the transformation
   * @returns New ArrayGuardian with filtered elements
   *
   * @example
   * ```ts
   * const evens = Guardian.array().of(Guardian.number())
   *   .filter(x => x % 2 === 0);
   * evens.parse([1, 2, 3, 4]); // [2, 4]
   * ```
   */
  filter(
    predicate: (item: T, index: number, array: Array<T>) => boolean,
    description?: string,
  ): ArrayGuardian<T> {
    return this.step((value: Array<T>) => {
      return value.filter(predicate);
    }, description || 'Filter array elements') as ArrayGuardian<T>;
  }

  /**
   * Transforms array by taking only the first n elements.
   *
   * @param n - Number of elements to take
   * @param description - Optional description of the transformation
   * @returns New ArrayGuardian with limited elements
   *
   * @example
   * ```ts
   * const firstThree = Guardian.array().take(3);
   * firstThree.parse([1, 2, 3, 4, 5]); // [1, 2, 3]
   * ```
   */
  take(n: number, description?: string): ArrayGuardian<T> {
    return this.step((value: Array<T>) => {
      return value.slice(0, n);
    }, description || `Take first ${n} elements`) as ArrayGuardian<T>;
  }

  /**
   * Transforms array by skipping the first n elements.
   *
   * @param n - Number of elements to skip
   * @param description - Optional description of the transformation
   * @returns New ArrayGuardian with remaining elements
   *
   * @example
   * ```ts
   * const skipTwo = Guardian.array().skip(2);
   * skipTwo.parse([1, 2, 3, 4, 5]); // [3, 4, 5]
   * ```
   */
  skip(n: number, description?: string): ArrayGuardian<T> {
    return this.step((value: Array<T>) => {
      return value.slice(n);
    }, description || `Skip first ${n} elements`) as ArrayGuardian<T>;
  }

  /**
   * Transforms array by sorting elements.
   *
   * @param compareFunction - Optional comparison function for sorting
   * @param description - Optional description of the transformation
   * @returns New ArrayGuardian with sorted elements
   *
   * @example
   * ```ts
   * const sorted = Guardian.array().of(Guardian.number()).sort();
   * sorted.parse([3, 1, 4, 1, 5]); // [1, 1, 3, 4, 5]
   * ```
   */
  sort(
    compareFunction?: (a: T, b: T) => number,
    description?: string,
  ): ArrayGuardian<T> {
    return this.step((value: Array<T>) => {
      return [...value].sort(compareFunction);
    }, description || 'Sort array elements') as ArrayGuardian<T>;
  }

  /**
   * Transforms array by reversing the order of elements.
   *
   * @param description - Optional description of the transformation
   * @returns New ArrayGuardian with reversed elements
   *
   * @example
   * ```ts
   * const reversed = Guardian.array().of(Guardian.string()).reverse();
   * reversed.parse(['a', 'b', 'c']); // ['c', 'b', 'a']
   * ```
   */
  reverse(description?: string): ArrayGuardian<T> {
    return this.step((value: Array<T>) => {
      return [...value].reverse();
    }, description || 'Reverse array elements') as ArrayGuardian<T>;
  }

  //#endregion
}

