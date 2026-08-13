/**
 * @fileoverview `ArrayGuardian` — homogeneous array validator with
 * length / uniqueness / contains checks and post-validation
 * transforms (map / filter / sort / slice). For positional arrays
 * with per-index types, see `TupleGuardian`.
 *
 * @module
 */

import { type AsyncProbeTarget, BaseGuardian } from '../BaseGuardian.ts';
import { GuardianError } from '../errors/Base.ts';
import { gateAsyncStepResult, resolveGuardian } from '../helpers/mod.ts';
import type { GuardianMetaData, GuardianTransform } from '../types/mod.ts';
// Sibling guards are referenced ONLY as return types here — the
// constructors the transitions hand to `process()` come from the
// registry, so these imports erase and create no runtime cycle.
import type { NumberGuardian } from './NumberGuardian.ts';
import type { StringGuardian } from './StringGuardian.ts';

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
 */
export class ArrayGuardian<T = unknown> extends BaseGuardian<Array<T>> {
  protected override readonly _type = 'array';
  private readonly __elementGuardian: BaseGuardian<T> | undefined;
  /**
   * True when the element guardian carries an async step. When set,
   * elements are validated on the awaiting path and the guardian flags
   * itself `isAsync` (so `parse()` rejects and `parseAsync()` is
   * required) — otherwise an async element validator would resolve to a
   * pending Promise stored in the element slot and silently bypass
   * validation.
   */
  private __async: boolean = false;

  /**
   * Creates a new ArrayGuardian instance.
   *
   * @param elementGuardian - Optional guardian to validate each element
   * @param metaData - Optional metadata for this guardian
   */
  constructor(elementGuardian?: BaseGuardian<T>, metaData?: GuardianMetaData) {
    super((input: unknown) => {
      if (!Array.isArray(input)) {
        throw new GuardianError(`Expected array but got ${typeof input}`, {
          expected: 'array',
          got: typeof input,
          comparison: 'type',
          type: 'array',
        });
      }

      // If we have an element guardian, validate each element. We
      // call `_composedTransform` directly rather than `parse()` to
      // skip the per-element try/catch + isAsync check that `parse()`
      // does (the outer try/catch here already handles thrown
      // GuardianErrors). The win compounds on large arrays.
      if (this.__elementGuardian) {
        // Settle a still-provisional async verdict (an unresolved
        // `lazy()` element) before choosing the path.
        if (this._asyncProbePending) this._refreshAsyncProbe();
        // Async element guardian → await each element so a rejecting
        // async validator surfaces rather than being stored pending.
        if (this.__async) return this.__validateElementsAsync(input);
        const elementTransform = (this.__elementGuardian as unknown as {
          _composedTransform(v: unknown): T;
        })._composedTransform;
        const len = input.length;
        const validatedElements: T[] = new Array(len);
        for (let i = 0; i < len; i++) {
          try {
            validatedElements[i] = elementTransform(input[i]);
          } catch (error) {
            if (error instanceof GuardianError) {
              // Enrich existing error with array context (performance optimization)
              error.context.type = 'array_element';
              error.context.arrayIndex = i;
              error.prependPath(i);
              // Update message with array context
              error.message = `Array element at index ${i}: ${error.message}`;
              throw error;
            }
            throw error;
          }
        }
        return validatedElements;
      }

      return input as Array<T>;
    }, metaData);

    this.__elementGuardian = elementGuardian;
    // Enforce nested async validation: an async element guardian (or an
    // inherited `isAsync`, e.g. carried through an immutable clone)
    // flips this array to the awaiting path. A not-yet-resolvable
    // `lazy()` element keeps the verdict provisional and is re-probed
    // before the first parse.
    this._initAsyncProbe();
  }

  /** The element guardian, for the deferred async probe. @internal */
  protected override _asyncProbeChildren(): ReadonlyArray<
    AsyncProbeTarget | undefined
  > {
    return [this.__elementGuardian];
  }

  /** @internal */
  protected override _markAsync(): void {
    this.__async = true;
    super._markAsync();
  }

  /**
   * Async sibling of the constructor's element loop. Awaits each
   * element's (possibly Promise-returning) transform, applying the same
   * per-index error enrichment as the sync path.
   */
  private async __validateElementsAsync(input: unknown[]): Promise<Array<T>> {
    const elementTransform = (this.__elementGuardian as unknown as {
      _composedTransform(v: unknown): T | Promise<T>;
    })._composedTransform;
    const len = input.length;
    const validatedElements: T[] = new Array(len);
    for (let i = 0; i < len; i++) {
      try {
        const out = elementTransform(input[i]);
        // Only a real Promise is a leaked async step to await; a
        // non-Promise thenable-shaped element VALUE would be ADOPTED and
        // silently destroyed by `await`, so refuse it loudly here.
        validatedElements[i] = out instanceof Promise
          ? await out
          : gateAsyncStepResult(out);
      } catch (error) {
        if (error instanceof GuardianError) {
          error.context.type = 'array_element';
          error.context.arrayIndex = i;
          error.prependPath(i);
          error.message = `Array element at index ${i}: ${error.message}`;
        }
        throw error;
      }
    }
    // Gate the result before this native `async` method returns it, at
    // the same choke point (`gateAsyncStepResult`) every async step
    // boundary uses. A validated array never carries a callable `then`,
    // so this passes through unchanged today; it keeps the composite
    // native-async transform contract uniform and adoption-proof.
    return gateAsyncStepResult(validatedElements);
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
   * @returns A new ArrayGuardian with the validation applied (the receiver is never mutated)
   * @throws {GuardianError} If array length does not match the specified length
   *
   * @example
   * ```ts
   * const exactLength = Guardian.array().length(3);
   * exactLength.parse([1, 2, 3]); // [1, 2, 3]
   * exactLength.parse([1, 2]); // throws GuardianError
   * ```
   */
  length(length: number, message?: string): this {
    return this.process(
      (value: Array<T>) => {
        if (value.length !== length) {
          throw new GuardianError(
            message || `Expected array length ${length}, got ${value.length}`,
            {
              expected: length,
              got: value.length,
              comparison: 'equals',
              type: 'validation',
            },
          );
        }
        return value;
      },
    ) as this;
  }

  /**
   * Validates minimum array length.
   *
   * @param minLength - Minimum required length
   * @param message - Optional custom error message
   * @returns A new ArrayGuardian with the validation applied (the receiver is never mutated)
   * @throws {GuardianError} If array length is less than the specified minimum
   *
   * @example
   * ```ts
   * const nonEmpty = Guardian.array().minLength(1);
   * nonEmpty.parse([1, 2, 3]); // [1, 2, 3]
   * nonEmpty.parse([]); // throws GuardianError
   * ```
   */
  minLength(minLength: number, message?: string): this {
    const result = this.process(
      (value: Array<T>) => {
        if (value.length < minLength) {
          throw new GuardianError(
            message ||
              `Array length must be at least ${minLength}, got ${value.length}`,
            {
              expected: minLength,
              got: value.length,
              comparison: 'gte',
              type: 'validation',
            },
          );
        }
        return value;
      },
    ) as this;

    // Store constraint for OpenAPI generation
    result._metaData ??= {};
    result._metaData.minItems = minLength;
    return result;
  }

  /**
   * Validates maximum array length.
   *
   * @param maxLength - Maximum allowed length
   * @param message - Optional custom error message
   * @returns A new ArrayGuardian with the validation applied (the receiver is never mutated)
   * @throws {GuardianError} If array length exceeds the specified maximum
   *
   * @example
   * ```ts
   * const limitedArray = Guardian.array().maxLength(5);
   * limitedArray.parse([1, 2, 3]); // [1, 2, 3]
   * limitedArray.parse([1, 2, 3, 4, 5, 6]); // throws GuardianError
   * ```
   */
  maxLength(maxLength: number, message?: string): this {
    const result = this.process(
      (value: Array<T>) => {
        if (value.length > maxLength) {
          throw new GuardianError(
            message ||
              `Array length must be at most ${maxLength}, got ${value.length}`,
            {
              expected: maxLength,
              got: value.length,
              comparison: 'lte',
              type: 'validation',
            },
          );
        }
        return value;
      },
    ) as this;

    // Store constraint for OpenAPI generation
    result._metaData ??= {};
    result._metaData.maxItems = maxLength;
    return result;
  }

  /**
   * Validates that the array is not empty.
   *
   * @param message - Optional custom error message
   * @returns A new ArrayGuardian with the validation applied (the receiver is never mutated)
   * @throws {GuardianError} If array is empty
   *
   * @example
   * ```ts
   * const nonEmpty = Guardian.array().nonEmpty();
   * nonEmpty.parse([1, 2, 3]); // [1, 2, 3]
   * nonEmpty.parse([]); // throws GuardianError
   * ```
   */
  nonEmpty(message?: string): this {
    return this.minLength(1, message || 'Array must not be empty');
  }

  //#endregion

  //#region Content Validation

  /**
   * Validates that all elements in the array are unique.
   *
   * @param message - Optional custom error message
   * @returns A new ArrayGuardian with the validation applied (the receiver is never mutated)
   * @throws {GuardianError} If array contains duplicate elements
   *
   * @example
   * ```ts
   * const uniqueArray = Guardian.array().unique();
   * uniqueArray.parse([1, 2, 3]); // [1, 2, 3]
   * uniqueArray.parse([1, 2, 2]); // throws GuardianError
   * ```
   */
  unique(message?: string): this {
    const result = this.process(
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
                duplicates.join(', ')
              }`,
            {
              expected: 'unique elements',
              got: duplicates,
              comparison: 'unique',
              type: 'validation',
            },
          );
        }

        return value;
      },
    ) as this;

    // Store constraint for OpenAPI generation
    result._metaData ??= {};
    result._metaData.uniqueItems = true;
    return result;
  }

  /**
   * Validates that the array contains a specific element.
   *
   * @param element - Element that must be present in the array
   * @param message - Optional custom error message
   * @returns A new ArrayGuardian with the validation applied (the receiver is never mutated)
   * @throws {GuardianError} If array does not contain the specified element
   *
   * @example
   * ```ts
   * const mustHaveHello = Guardian.array(Guardian.string()).includes('hello');
   * mustHaveHello.parse(['hello', 'world']); // ['hello', 'world']
   * mustHaveHello.parse(['world']); // throws GuardianError
   * ```
   */
  includes(element: T, _message?: string): this {
    return this.process((value: Array<T>) => {
      if (!value.includes(element)) {
        throw new GuardianError(_message || `Array must include ${element}`, {
          expected: `array including ${element}`,
          got: value,
          comparison: 'includes',
          type: 'validation',
        });
      }
      return value;
    }) as this;
  }

  /**
   * Validates that the array does not contain a specific element.
   *
   * @param element - Element that must not be present in the array
   * @param message - Optional custom error message
   * @returns A new ArrayGuardian with the validation applied (the receiver is never mutated)
   * @throws {GuardianError} If array contains the specified element
   *
   * @example
   * ```ts
   * const noHello = Guardian.array(Guardian.string()).excludes('hello');
   * noHello.parse(['world', 'test']); // ['world', 'test']
   * noHello.parse(['hello', 'world']); // throws GuardianError
   * ```
   */
  excludes(element: T, _message?: string): this {
    return this.process((value: Array<T>) => {
      if (value.includes(element)) {
        throw new GuardianError(
          _message || `Array must not include ${element}`,
          {
            expected: `array excluding ${element}`,
            got: value,
            comparison: 'excludes',
            type: 'validation',
          },
        );
      }
      return value;
    }) as this;
  }

  //#endregion

  //#region Array Transformations

  /**
   * Transforms array by mapping each element through a transformation function.
   *
   * @template U - The new element type after transformation
   * @param mapper - Function to transform each element
   * @param description - Optional description of the transformation
   * @returns A new ArrayGuardian with the validation applied (the receiver is never mutated)
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
      return value.map((item, index, array) => mapper(item, index, array));
    }) as ArrayGuardian<U>;
  }

  /**
   * Transforms array by filtering elements that match a predicate.
   *
   * @param predicate - Function to test each element
   * @param description - Optional description of the transformation
   * @returns A new ArrayGuardian with the validation applied (the receiver is never mutated)
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
  ): this {
    return this.process((value: Array<T>) => {
      return value.filter((item, index, array) =>
        predicate(item, index, array)
      );
    }) as this;
  }

  /**
   * Transforms array by taking only the first n elements.
   *
   * @param n - Number of elements to take
   * @param description - Optional description of the transformation
   * @returns A new ArrayGuardian with the validation applied (the receiver is never mutated)
   *
   * @example
   * ```ts
   * const firstThree = Guardian.array().take(3);
   * firstThree.parse([1, 2, 3, 4, 5]); // [1, 2, 3]
   * ```
   */
  take(n: number, __description?: string): this {
    return this.process((value: Array<T>) => {
      return value.slice(0, n);
    }) as this;
  }

  /**
   * Transforms array by skipping the first n elements.
   *
   * @param n - Number of elements to skip
   * @param description - Optional description of the transformation
   * @returns A new ArrayGuardian with the validation applied (the receiver is never mutated)
   *
   * @example
   * ```ts
   * const skipTwo = Guardian.array().skip(2);
   * skipTwo.parse([1, 2, 3, 4, 5]); // [3, 4, 5]
   * ```
   */
  skip(n: number, __description?: string): this {
    return this.process((value: Array<T>) => {
      return value.slice(n);
    }) as this;
  }

  /**
   * Transforms array by sorting elements.
   *
   * @param compareFunction - Optional comparison function for sorting
   * @param description - Optional description of the transformation
   * @returns A new ArrayGuardian with the validation applied (the receiver is never mutated)
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
  ): this {
    return this.process((value: Array<T>) => {
      return [...value].sort(compareFunction);
    }) as this;
  }

  /**
   * Transforms array by reversing the order of elements.
   *
   * @param description - Optional description of the transformation
   * @returns A new ArrayGuardian with the validation applied (the receiver is never mutated)
   *
   * @example
   * ```ts
   * const reversed = Guardian.array(Guardian.string()).reverse();
   * reversed.parse(['a', 'b', 'c']); // ['c', 'b', 'a']
   * ```
   */
  reverse(): this {
    return this.process((value: Array<T>) => {
      return [...value].reverse();
    }) as this;
  }

  /**
   * Validates that array contains no null or undefined values.
   *
   * @param errorMessage - Optional custom error message
   * @returns A new ArrayGuardian with the validation applied (the receiver is never mutated)
   *
   * @example
   * ```ts
   * const noNullArray = Guardian.array().noNulls();
   * noNullArray.parse([1, 2, 3]); // [1, 2, 3]
   * noNullArray.parse([1, null, 3]); // throws GuardianError
   * ```
   */
  noNulls(errorMessage?: string): this {
    return this.process((value: Array<T>) => {
      const nullIndex = value.findIndex((item) =>
        item === null || item === undefined
      );
      if (nullIndex !== -1) {
        throw new GuardianError(
          errorMessage ||
            `Array must not contain null or undefined values, found at index ${nullIndex}`,
          {
            expected: 'array without null/undefined values',
            got: `null/undefined at index ${nullIndex}`,
            comparison: 'noNulls',
            type: 'validation',
          },
        );
      }
      return value;
    }) as this;
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
  flatten(joiner: string = ',', depth: number = 1): StringGuardian {
    return this.process((value: Array<T>) => {
      const flattenArray = (arr: Array<T>, currentDepth: number): Array<T> => {
        const result: Array<T> = [];
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
    }, resolveGuardian('string')) as StringGuardian;
  }

  /**
   * Transforms array by removing falsy values (null, undefined, false, 0, 0n, "", NaN).
   *
   * @returns A new ArrayGuardian with the validation applied (the receiver is never mutated)
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
          item !== '' &&
          !Number.isNaN(item);
      });
    }) as ArrayGuardian<NonNullable<T>>;
  }

  /**
   * Transforms array by removing duplicate values, keeping only unique elements.
   * Uses strict equality (===) for comparison.
   *
   * @returns A new ArrayGuardian with the validation applied (the receiver is never mutated)
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
  onlyUnique(): this {
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
    }) as this;
  }

  /**
   * Validates that the array is already sorted. Useful for canonical-
   * form payloads (Merkle proofs, deduped lists, sorted indexes) where
   * the wire contract is "sender produces sorted, receiver verifies".
   *
   * @param opts.order - `'asc'` (default) or `'desc'`.
   * @param opts.by    - Custom comparator returning `negative | 0 | positive`,
   *                     matching `Array.prototype.sort`. When supplied,
   *                     `order` is ignored.
   *
   * @example
   * ```ts
   * Guardian.array(Guardian.number()).sorted().parse([1, 2, 3]);          // ok
   * Guardian.array(Guardian.number()).sorted({ order: 'desc' }).parse([3, 2, 1]); // ok
   * ```
   */
  sorted(
    opts?: { order?: 'asc' | 'desc'; by?: (a: T, b: T) => number },
    errorMessage?: string,
  ): this {
    const order = opts?.order ?? 'asc';
    const compare = opts?.by ?? ((a: T, b: T) => {
      if (a === b) return 0;
      return (a as unknown as number) < (b as unknown as number) ? -1 : 1;
    });
    return this.process((value: Array<T>) => {
      for (let i = 1; i < value.length; i++) {
        const cmp = compare(value[i - 1]!, value[i]!);
        const violates = order === 'asc' ? cmp > 0 : cmp < 0;
        if (violates) {
          throw new GuardianError(
            errorMessage ||
              `Array must be sorted ${order} (violated at index ${i})`,
            {
              expected: `sorted ${order}`,
              got: { previous: value[i - 1], current: value[i], index: i },
              comparison: 'sorted',
              type: 'array',
            },
          );
        }
      }
      return value;
    }) as this;
  }

  /**
   * Validates uniqueness under a projection. Generalises
   * {@link unique}, which uses identity. Useful for "no two users
   * share an email" style checks on object arrays.
   *
   * @example
   * ```ts
   * type User = { id: number; email: string };
   * const Users = Guardian.array(userSchema).distinctBy((u: User) => u.email);
   * ```
   */
  distinctBy<K>(
    keyFn: (el: T) => K,
    errorMessage?: string,
  ): this {
    return this.process((value: Array<T>) => {
      const seen = new Set<K>();
      for (let i = 0; i < value.length; i++) {
        const k = keyFn(value[i]!);
        if (seen.has(k)) {
          throw new GuardianError(
            errorMessage || `Duplicate key at index ${i}`,
            {
              expected: 'distinct projected keys',
              got: { duplicateKey: k, index: i },
              comparison: 'distinctBy',
              type: 'array',
            },
          );
        }
        seen.add(k);
      }
      return value;
    }) as this;
  }

  /**
   * Transform: emits consecutive pairs of elements. `[a, b, c, d]`
   * becomes `[[a, b], [b, c], [c, d]]`. An array of length < 2
   * returns `[]`.
   */
  pairs(): ArrayGuardian<[T, T]> {
    return this.process((value: Array<T>): Array<[T, T]> => {
      const out: Array<[T, T]> = [];
      for (let i = 1; i < value.length; i++) {
        out.push([value[i - 1]!, value[i]!]);
      }
      return out;
    }) as unknown as ArrayGuardian<[T, T]>;
  }

  /**
   * Transform: keep only the last `n` elements. Counterpart to
   * {@link take} (first n) and {@link skip} (drop first n).
   */
  tail(n: number, __description?: string): this {
    return this.process(
      (value: Array<T>) => value.slice(Math.max(0, value.length - n)),
    ) as this;
  }

  /**
   * Transform: split into `T[][]` of fixed-size chunks. The last
   * chunk may be shorter when the array length isn't a multiple of
   * `size`.
   *
   * @example
   * ```ts
   * Guardian.array(Guardian.number()).chunk(2).parse([1, 2, 3, 4, 5]);
   * // [[1, 2], [3, 4], [5]]
   * ```
   */
  chunk(size: number): ArrayGuardian<T[]> {
    if (!Number.isInteger(size) || size <= 0) {
      throw new Error('chunk size must be a positive integer');
    }
    return this.process((value: Array<T>): T[][] => {
      const out: T[][] = [];
      for (let i = 0; i < value.length; i += size) {
        out.push(value.slice(i, i + size));
      }
      return out;
    }) as unknown as ArrayGuardian<T[]>;
  }

  /**
   * Reduce the array into a sum. Only valid for `ArrayGuardian<number>`
   * — calling on a non-number array is a compile-time error.
   *
   * Crosses guardian classes: returns a {@link NumberGuardian} so
   * post-aggregation validators (`.positive()`, `.min()`, etc.) chain
   * naturally.
   */
  sum(
    this: ArrayGuardian<number>,
    __description?: string,
  ): NumberGuardian {
    return this.process(
      (value: Array<number>) => value.reduce((acc, n) => acc + n, 0),
      resolveGuardian('number'),
    ) as NumberGuardian;
  }

  /**
   * Reduce to the arithmetic mean. Empty array returns `NaN`, which
   * `NumberGuardian` then rejects — wrap with `.minLength(1)` first
   * if you need an explicit empty-array error.
   */
  average(
    this: ArrayGuardian<number>,
    __description?: string,
  ): NumberGuardian {
    return this.process(
      (value: Array<number>) =>
        value.length === 0
          ? Number.NaN
          : value.reduce((acc, n) => acc + n, 0) / value.length,
      resolveGuardian('number'),
    ) as NumberGuardian;
  }

  /**
   * Reduce to the minimum element. Empty array → `Infinity`
   * (matches `Math.min`).
   */
  min(
    this: ArrayGuardian<number>,
    __description?: string,
  ): NumberGuardian {
    return this.process(
      (value: Array<number>) =>
        value.length === 0 ? Infinity : Math.min(...value),
      resolveGuardian('number'),
    ) as NumberGuardian;
  }

  /**
   * Reduce to the maximum element. Empty array → `-Infinity`
   * (matches `Math.max`).
   */
  max(
    this: ArrayGuardian<number>,
    __description?: string,
  ): NumberGuardian {
    return this.process(
      (value: Array<number>) =>
        value.length === 0 ? -Infinity : Math.max(...value),
      resolveGuardian('number'),
    ) as NumberGuardian;
  }

  /**
   * General reduction. Returns a `BaseGuardian<U>` typed on the
   * accumulator's type — for crossing into a specific guardian class
   * (e.g. `NumberGuardian`), use `.process(fn, NumberGuardian)`
   * directly.
   *
   * @example
   * ```ts
   * Guardian.array(Guardian.string())
   *   .reduce<string>((acc, s) => acc + s, '');
   * ```
   */
  reduce<U>(
    fn: (acc: U, item: T, index: number, arr: Array<T>) => U,
    initial: U,
  ): BaseGuardian<U> {
    return this.process(
      // Wrap `fn` in an arrow so the reducer sees the exact 4-arg
      // signature, satisfying SonarLint's "don't pass a function
      // directly to .reduce" lint (which flags broader-arity callers).
      (value: Array<T>) =>
        value.reduce(
          (acc, item, index, arr) => fn(acc, item, index, arr),
          initial,
        ),
    );
  }

  //#endregion

  //#region Documentation Methods

  //#endregion

  //#region OpenAPI Generation

  /**
   * Generates OpenAPI schema for array with items schema and constraints.
   *
   * @returns OpenAPI schema with items definition
   */
  override toOpenAPI(): Record<string, unknown> {
    const schema = super.toOpenAPI();

    // Add items schema if element guardian is defined
    if (this.__elementGuardian) {
      schema.items = this.__elementGuardian.toOpenAPI();
    } else {
      // No element validation - allow any items
      schema.items = {};
    }

    return schema;
  }

  //#endregion

  /**
   * Subclass hook for immutable chain operations — preserves the
   * `__elementGuardian` reference alongside the new transform and
   * metadata.
   */
  protected override _cloneWith(
    transform: GuardianTransform<unknown, Array<T>>,
    metaData: GuardianMetaData | undefined,
  ): this {
    const cloned = new ArrayGuardian<T>(this.__elementGuardian, metaData);
    cloned._composedTransform = transform;
    return cloned as this;
  }
}
