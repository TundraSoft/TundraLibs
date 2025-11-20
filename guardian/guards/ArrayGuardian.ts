import { BaseGuardian } from "../BaseGuardian.ts";
import { GuardianError, type GuardianErrorMeta } from "../GuardianError.ts";
import type { GuardianMetaData } from "../types/mod.ts";
import { StringGuardian } from "./StringGuardian.ts";

/**
 * Guardian for array validation and transformation.
 * Provides fluent API for building array validation pipelines with element validation.
 *
 * @template T - The element type of the array
 *
 * @example
 * ```ts
 * const schema = new ArrayGuardian(Guardian.string().minLength(3))
 *   .minLength(1)
 *   .maxLength(10);
 *
 * const result = schema.parse(['hello', 'world']); // ['hello', 'world']
 * ```
 *
 * @example
 * ```ts
 * // Array of unknown elements (default)
 * const anyArray = new ArrayGuardian().minLength(1);
 * const result = anyArray.parse([1, 'hello', true]); // [1, 'hello', true]
 * ```
 *
 * @since 1.0.0
 */
export class ArrayGuardian<T = unknown> extends BaseGuardian<Array<T>> {
  protected override readonly _type = "array";
  private _elementGuardian?: BaseGuardian<T>;

  /**
   * Creates a new ArrayGuardian instance.
   *
   * @param elementGuardian - Optional guardian to validate each element
   * @param metaData - Optional metadata for this guardian
   */
  constructor(elementGuardian?: BaseGuardian<T>, metaData?: GuardianMetaData) {
    super((input: unknown) => {
      if (!Array.isArray(input)) {
        throw new GuardianError("Expected array but got ${got}", {
          expected: "array",
          got: typeof input,
          comparison: "type",
          type: "array",
        });
      }

      // If we have an element guardian, validate each element
      if (this._elementGuardian) {
        const validatedElements: T[] = [];
        for (let i = 0; i < input.length; i++) {
          try {
            validatedElements.push(this._elementGuardian.parse(input[i]));
          } catch (error) {
            if (error instanceof GuardianError) {
              // Re-throw with array context - this preserves the element error structure
              throw new GuardianError(
                `Array element at index ${i}: ${error.message}`,
                {
                  ...error.context,
                  type: "array_element",
                } as GuardianErrorMeta,
              );
            }
            throw error;
          }
        }
        return validatedElements;
      }

      return input as Array<T>;
    }, metaData);
    
    this._elementGuardian = elementGuardian;
  }

  //#region Element Validation

  // Element validation is now handled in the constructor

  //#endregion

  //#region Length Validation

  /**
   * Validates exact array length.
   *
   * @param length - Exact required length
   * @param message - Optional custom error message
   * @returns This ArrayGuardian (mutated) or new instance if immutable mode
   *
   * @example
   * ```ts
   * const exactLength = Guardian.array().length(3);
   * exactLength.parse([1, 2, 3]); // [1, 2, 3]
   * exactLength.parse([1, 2]); // throws GuardianError
   * ```
   */
  length(length: number, message?: string): ArrayGuardian<T> {
    return this.process(
      (value: Array<T>) => {
        if (value.length !== length) {
          throw new GuardianError(
            message || `Expected array length ${length}, got ${value.length}`,
            {
              expected: length,
              got: value.length,
              comparison: "equals",
              type: "validation",
            },
          );
        }
        return value;
      },
    ) as ArrayGuardian<T>;
  }

  /**
   * Validates minimum array length.
   *
   * @param minLength - Minimum required length
   * @param message - Optional custom error message
   * @returns This ArrayGuardian (mutated) or new instance if immutable mode
   *
   * @example
   * ```ts
   * const nonEmpty = Guardian.array().minLength(1);
   * nonEmpty.parse([1, 2, 3]); // [1, 2, 3]
   * nonEmpty.parse([]); // throws GuardianError
   * ```
   */
  minLength(minLength: number, message?: string): ArrayGuardian<T> {
    const result = this.process(
      (value: Array<T>) => {
        if (value.length < minLength) {
          throw new GuardianError(
            message ||
              `Array length must be at least ${minLength}, got ${value.length}`,
            {
              expected: minLength,
              got: value.length,
              comparison: "gte",
              type: "validation",
            },
          );
        }
        return value;
      },
    ) as ArrayGuardian<T>;
    
    // Store constraint for OpenAPI generation
    if (!result._metaData) result._metaData = {};
    result._metaData.minItems = minLength;
    return result;
  }

  /**
   * Validates maximum array length.
   *
   * @param maxLength - Maximum allowed length
   * @param message - Optional custom error message
   * @returns This ArrayGuardian (mutated) or new instance if immutable mode
   *
   * @example
   * ```ts
   * const limitedArray = Guardian.array().maxLength(5);
   * limitedArray.parse([1, 2, 3]); // [1, 2, 3]
   * limitedArray.parse([1, 2, 3, 4, 5, 6]); // throws GuardianError
   * ```
   */
  maxLength(maxLength: number, message?: string): ArrayGuardian<T> {
    const result = this.process(
      (value: Array<T>) => {
        if (value.length > maxLength) {
          throw new GuardianError(
            message ||
              `Array length must be at most ${maxLength}, got ${value.length}`,
            {
              expected: maxLength,
              got: value.length,
              comparison: "lte",
              type: "validation",
            },
          );
        }
        return value;
      },
    ) as ArrayGuardian<T>;
    
    // Store constraint for OpenAPI generation
    if (!result._metaData) result._metaData = {};
    result._metaData.maxItems = maxLength;
    return result;
  }

  /**
   * Validates that the array is not empty.
   *
   * @param message - Optional custom error message
   * @returns This ArrayGuardian (mutated) or new instance if immutable mode
   *
   * @example
   * ```ts
   * const nonEmpty = Guardian.array().nonEmpty();
   * nonEmpty.parse([1, 2, 3]); // [1, 2, 3]
   * nonEmpty.parse([]); // throws GuardianError
   * ```
   */
  nonEmpty(message?: string): ArrayGuardian<T> {
    return this.minLength(1, message || "Array must not be empty");
  }

  //#endregion

  //#region Content Validation

  /**
   * Validates that all elements in the array are unique.
   *
   * @param message - Optional custom error message
   * @returns This ArrayGuardian (mutated) or new instance if immutable mode
   *
   * @example
   * ```ts
   * const uniqueArray = Guardian.array().unique();
   * uniqueArray.parse([1, 2, 3]); // [1, 2, 3]
   * uniqueArray.parse([1, 2, 2]); // throws GuardianError
   * ```
   */
  unique(message?: string): ArrayGuardian<T> {
    return this.process(
      (value: Array<T>) => {
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
              `Array must contain unique elements, found duplicates: ${
                duplicates.join(", ")
              }`,
            {
              expected: "unique elements",
              got: duplicates,
              comparison: "unique",
              type: "validation",
            },
          );
        }

        return value;
      },
    ) as ArrayGuardian<T>;
  }

  /**
   * Validates that the array contains a specific element.
   *
   * @param element - Element that must be present in the array
   * @param message - Optional custom error message
   * @returns This ArrayGuardian (mutated) or new instance if immutable mode
   *
   * @example
   * ```ts
   * const mustHaveHello = Guardian.array(Guardian.string()).includes('hello');
   * mustHaveHello.parse(['hello', 'world']); // ['hello', 'world']
   * mustHaveHello.parse(['world']); // throws GuardianError
   * ```
   */
  includes(element: T, _message?: string): ArrayGuardian<T> {
    return this.process((value: Array<T>) => {
      if (!value.includes(element)) {
        throw new GuardianError(_message || `Array must include ${element}`, {
          expected: `array including ${element}`,
          got: value,
          comparison: "includes",
          type: "validation",
        });
      }
      return value;
    }) as ArrayGuardian<T>;
  }

  /**
   * Validates that the array does not contain a specific element.
   *
   * @param element - Element that must not be present in the array
   * @param message - Optional custom error message
   * @returns This ArrayGuardian (mutated) or new instance if immutable mode
   *
   * @example
   * ```ts
   * const noHello = Guardian.array(Guardian.string()).excludes('hello');
   * noHello.parse(['world', 'test']); // ['world', 'test']
   * noHello.parse(['hello', 'world']); // throws GuardianError
   * ```
   */
  excludes(element: T, _message?: string): ArrayGuardian<T> {
    return this.process((value: Array<T>) => {
      if (value.includes(element)) {
        throw new GuardianError(
          _message || `Array must not include ${element}`,
          {
            expected: `array excluding ${element}`,
            got: value,
            comparison: "excludes",
            type: "validation",
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
   * @returns This ArrayGuardian (mutated) or new instance if immutable mode
   *
   * @example
   * ```ts
   * const doubled = Guardian.array(Guardian.number())
   *   .map(x => x * 2);
   * doubled.parse([1, 2, 3]); // [2, 4, 6]
   * ```
   */
  map<U>(
    mapper: (item: T, index: number, array: Array<T>) => U,
    __description?: string,
  ): ArrayGuardian<U> {
    return this.process((value: Array<T>) => {
      return value.map(mapper);
    }) as ArrayGuardian<U>;
  }

  /**
   * Transforms array by filtering elements that match a predicate.
   *
   * @param predicate - Function to test each element
   * @param description - Optional description of the transformation
   * @returns This ArrayGuardian (mutated) or new instance if immutable mode
   *
   * @example
   * ```ts
   * const evens = Guardian.array(Guardian.number())
   *   .filter(x => x % 2 === 0);
   * evens.parse([1, 2, 3, 4]); // [2, 4]
   * ```
   */
  filter(
    predicate: (item: T, index: number, array: Array<T>) => boolean,
    __description?: string,
  ): ArrayGuardian<T> {
    return this.process((value: Array<T>) => {
      return value.filter(predicate);
    }) as ArrayGuardian<T>;
  }

  /**
   * Transforms array by taking only the first n elements.
   *
   * @param n - Number of elements to take
   * @param description - Optional description of the transformation
   * @returns This ArrayGuardian (mutated) or new instance if immutable mode
   *
   * @example
   * ```ts
   * const firstThree = Guardian.array().take(3);
   * firstThree.parse([1, 2, 3, 4, 5]); // [1, 2, 3]
   * ```
   */
  take(n: number, __description?: string): ArrayGuardian<T> {
    return this.process((value: Array<T>) => {
      return value.slice(0, n);
    }) as ArrayGuardian<T>;
  }

  /**
   * Transforms array by skipping the first n elements.
   *
   * @param n - Number of elements to skip
   * @param description - Optional description of the transformation
   * @returns This ArrayGuardian (mutated) or new instance if immutable mode
   *
   * @example
   * ```ts
   * const skipTwo = Guardian.array().skip(2);
   * skipTwo.parse([1, 2, 3, 4, 5]); // [3, 4, 5]
   * ```
   */
  skip(n: number, __description?: string): ArrayGuardian<T> {
    return this.process((value: Array<T>) => {
      return value.slice(n);
    }) as ArrayGuardian<T>;
  }

  /**
   * Transforms array by sorting elements.
   *
   * @param compareFunction - Optional comparison function for sorting
   * @param description - Optional description of the transformation
   * @returns This ArrayGuardian (mutated) or new instance if immutable mode
   *
   * @example
   * ```ts
   * const sorted = Guardian.array(Guardian.number()).sort();
   * sorted.parse([3, 1, 4, 1, 5]); // [1, 1, 3, 4, 5]
   * ```
   */
  sort(
    compareFunction?: (a: T, b: T) => number,
    __description?: string,
  ): ArrayGuardian<T> {
    return this.process((value: Array<T>) => {
      return [...value].sort(compareFunction);
    }) as ArrayGuardian<T>;
  }

  /**
   * Transforms array by reversing the order of elements.
   *
   * @param description - Optional description of the transformation
   * @returns This ArrayGuardian (mutated) or new instance if immutable mode
   *
   * @example
   * ```ts
   * const reversed = Guardian.array(Guardian.string()).reverse();
   * reversed.parse(['a', 'b', 'c']); // ['c', 'b', 'a']
   * ```
   */
  reverse(): ArrayGuardian<T> {
    return this.process((value: Array<T>) => {
      return [...value].reverse();
    }) as ArrayGuardian<T>;
  }

  /**
   * Validates that array contains no null or undefined values.
   *
   * @param errorMessage - Optional custom error message
   * @returns This ArrayGuardian (mutated) or new instance if immutable mode
   *
   * @example
   * ```ts
   * const noNullArray = Guardian.array().noNulls();
   * noNullArray.parse([1, 2, 3]); // [1, 2, 3]
   * noNullArray.parse([1, null, 3]); // throws GuardianError
   * ```
   */
  noNulls(errorMessage?: string): ArrayGuardian<T> {
    return this.process((value: Array<T>) => {
      const nullIndex = value.findIndex((item) => item === null || item === undefined);
      if (nullIndex !== -1) {
        throw new GuardianError(
          errorMessage || `Array must not contain null or undefined values, found at index ${nullIndex}`,
          {
            expected: "array without null/undefined values",
            got: `null/undefined at index ${nullIndex}`,
            comparison: "noNulls",
            type: "validation",
          },
        );
      }
      return value;
    }) as ArrayGuardian<T>;
  }

  /**
   * Transforms array by flattening nested arrays and joining with separator.
   * Can be used as an alias for toString with custom joiner.
   *
   * @param joiner - String to join flattened elements (default: ",")
   * @param depth - Maximum depth to flatten (default: 1)
   * @returns New StringGuardian with flattened string
   *
   * @example
   * ```ts
   * const flattened = Guardian.array().flatten();
   * flattened.parse([1, [2, 3], 4]); // "1,2,3,4"
   * 
   * const customJoiner = Guardian.array().flatten(" | ");
   * customJoiner.parse([1, [2, 3], 4]); // "1 | 2 | 3 | 4"
   * 
   * const deepFlatten = Guardian.array().flatten(",", 2);
   * deepFlatten.parse([1, [2, [3, 4]], 5]); // "1,2,3,4,5"
   * ```
   */
  flatten(joiner: string = ",", depth: number = 1): StringGuardian {
    return this.process((value: Array<T>) => {
      const flattenArray = (arr: any[], currentDepth: number): any[] => {
        const result: any[] = [];
        for (const item of arr) {
          if (Array.isArray(item) && currentDepth > 0) {
            result.push(...flattenArray(item, currentDepth - 1));
          } else {
            result.push(item);
          }
        }
        return result;
      };

      const flattened = flattenArray(value, depth);
      return flattened.join(joiner);
    }, StringGuardian) as StringGuardian;
  }

  /**
   * Transforms array by removing falsy values (null, undefined, false, 0, 0n, "", NaN).
   *
   * @returns This ArrayGuardian (mutated) or new instance if immutable mode
   *
   * @example
   * ```ts
   * const compacted = Guardian.array().compact();
   * compacted.parse([1, null, 2, undefined, 3, false, 4, 0, 5, "", 6, NaN]); // [1, 2, 3, 4, 5, 6]
   * ```
   */
  compact(): ArrayGuardian<NonNullable<T>> {
    return this.process((value: Array<T>) => {
      return value.filter((item): item is NonNullable<T> => {
        return item !== null && 
               item !== undefined && 
               item !== false && 
               item !== 0 && 
               item !== 0n &&
               item !== "" && 
               !Number.isNaN(item);
      });
    }) as ArrayGuardian<NonNullable<T>>;
  }

  /**
   * Transforms array by removing duplicate values, keeping only unique elements.
   * Uses strict equality (===) for comparison.
   *
   * @returns This ArrayGuardian (mutated) or new instance if immutable mode
   *
   * @example
   * ```ts
   * const unique = Guardian.array().onlyUnique();
   * unique.parse([1, 2, 2, 3, 1, 4]); // [1, 2, 3, 4]
   * 
   * const uniqueStrings = Guardian.array(Guardian.string()).onlyUnique();
   * uniqueStrings.parse(["a", "b", "a", "c"]); // ["a", "b", "c"]
   * ```
   */
  onlyUnique(): ArrayGuardian<T> {
    return this.process((value: Array<T>) => {
      const seen = new Set<T>();
      const result: T[] = [];
      
      for (const item of value) {
        if (!seen.has(item)) {
          seen.add(item);
          result.push(item);
        }
      }
      
      return result;
    }) as ArrayGuardian<T>;
  }

  //#endregion

  //#region Documentation Methods



  //#endregion
}
