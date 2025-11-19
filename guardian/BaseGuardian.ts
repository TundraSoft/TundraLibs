import { GuardianError } from "./GuardianError.ts";
import {
  equals,
  isIn,
  isNotIn,
  isPromiseLike,
  notEquals,
  test,
} from "./helpers/mod.ts";
import type {
  GuardianMetaData,
  GuardianSafeParseResult,
  GuardianTransform,
} from "./types/mod.ts";

/**
 * Abstract base class for all Guardian validators.
 * Provides a fluent API for building validation pipelines with process-based transformations.
 * Includes helper functions for common validation patterns from the old Guardian system.
 *
 * @template T - The output type after all validations and transformations
 *
 * @example
 * ```ts
 * const schema = new StringGuardian()
 *   .minLength(3)
 *   .process((val) => val.toUpperCase())
 *   .process((val) => val.trim());
 *
 * const result = schema.parse('  hello  '); // 'HELLO'
 * ```
 *
 * @since 1.0.0
 */
export abstract class BaseGuardian<T> {
  protected _composedTransform: GuardianTransform<unknown, T>;
  protected _originalTransform: GuardianTransform<unknown, T>;
  protected _metaData: GuardianMetaData | undefined = undefined;
  protected _isAsync = false;
  protected _isNullable = false;
  protected _hasOptional = false;
  protected _optionalDefault?: T | (() => T) | (() => Promise<T>);
  protected _isImmutable = false;

  /**
   * Gets the metadata associated with this guardian.
   *
   * @returns The metadata or undefined if not set
   */
  get metaData(): GuardianMetaData | undefined {
    return this._metaData;
  }

  /**
   * Sets the description for this guardian.
   *
   * @param description - Human-readable description of what this guardian validates
   */
  set description(description: string) {
    if (!this._metaData) {
      this._metaData = { description };
    } else {
      this._metaData.description = description;
    }
  }

  /**
   * Sets the title for this guardian.
   *
   * @param title - Short title for this guardian
   */
  set title(title: string) {
    if (!this._metaData) {
      this._metaData = { description: "", title };
    } else {
      this._metaData.title = title;
    }
  }

  /**
   * Sets examples for this guardian.
   *
   * @param examples - Array of example values that would pass validation
   */
  set examples(examples: Array<unknown>) {
    if (!this._metaData) {
      this._metaData = { description: "", examples };
    } else {
      this._metaData.examples = examples;
    }
  }

  /**
   * Marks this guardian as deprecated.
   *
   * @param deprecated - Whether this guardian is deprecated
   */
  set deprecated(deprecated: boolean) {
    if (!this._metaData) {
      this._metaData = { description: "", deprecated };
    } else {
      this._metaData.deprecated = deprecated;
    }
  }

  /**
   * Creates a new BaseGuardian instance.
   *
   * @param initialTransform - The transformation function for this guardian
   * @param metaData - Optional metadata for this guardian
   */
  constructor(
    initialTransform: GuardianTransform<unknown, T>,
    metaData?: GuardianMetaData,
  ) {
    this._composedTransform = initialTransform;
    this._originalTransform = initialTransform;

    if (metaData) {
      this._metaData = metaData;
    }
  }

  /**
   * Processes the output using a transformation function.
   * Preserves asynchronous behavior if the original guardian returns a Promise.
   * This is the core method that all other validation methods use internally.
   *
   * @template U - The output type of the processing function
   * @template V - The guardian class type for the result
   * @param fn - The processing function to apply to the guardian's result
   * @param constructor - Optional constructor for the resulting Guardian, defaults to this.constructor
   * @returns A new Guardian instance with the processed function
   *
   * @example
   * ```ts
   * // Simple transformation
   * guardian.process((str) => str.toUpperCase());
   *
   * // Type transformation with constructor
   * const numberGuardian = stringGuardian.process(
   *   (str) => parseInt(str, 10),
   *   NumberGuardian
   * );
   * ```
   */
  process<U, V extends BaseGuardian<U> = BaseGuardian<U>>(
    fn: GuardianTransform<T, U>,
    constructor?: new (
      metaData?: GuardianMetaData,
      initialTransform?: GuardianTransform<unknown, U>,
    ) => V,
  ): V | BaseGuardian<U> {
    const currentTransform = this._composedTransform;

    const composedTransform: GuardianTransform<unknown, U> = (
      input: unknown,
    ) => {
      const intermediateResult = currentTransform(input);
      if (isPromiseLike(intermediateResult)) {
        return intermediateResult.then((resolved) => fn(resolved as T));
      }
      return fn(intermediateResult as T);
    };

    let returnInstance: V | BaseGuardian<U> = this as unknown as BaseGuardian<U>;
    
    if (constructor) {
      // Create the instance with guardian-style constructor parameters
      returnInstance = new constructor(
        this._metaData,
        composedTransform
      );
    } else if (this._isImmutable) {
      // If immutable, create new instance
      returnInstance = this._createStep<U>(
        composedTransform,
        this._isAsync,
        this._metaData,
      );
    } else {
      // Mutate in place for better performance
      (this as unknown as BaseGuardian<U>)._composedTransform = composedTransform;
    }

    return returnInstance;
  }

  /**
   * Tests the result using a provided test function.
   * Uses the helper function from the old Guardian system.
   *
   * @param fn - The test function to apply to the guardian's result
   * @param error - Optional error message to use if the test fails
   * @param expected - Optional expected value for error context
   * @returns A new Guardian instance with the test applied
   *
   * @example
   * ```ts
   * guardian.test(
   *   (str) => str.length >= 5,
   *   'String must be at least 5 characters'
   * );
   * ```
   */
  test(
    fn: (value: T) => unknown,
    error?: string,
    expected?: unknown,
  ): BaseGuardian<T> {
    return this.process(test(fn, error, expected)) as BaseGuardian<T>;
  }

  /**
   * Validates that the result equals the expected value.
   * Uses the helper function from the old Guardian system.
   *
   * @param expected - The expected value to compare against
   * @param error - Optional custom error message
   * @returns A new Guardian instance with the equals validation applied
   *
   * @example
   * ```ts
   * guardian.equals('expected', 'Value must be "expected"');
   * ```
   */
  equals(expected: T, error?: string): BaseGuardian<T> {
    return this.process(equals(expected, error)) as BaseGuardian<T>;
  }

  /**
   * Validates that the result does not equal the expected value.
   * Uses the helper function from the old Guardian system.
   *
   * @param expected - The value that should not match
   * @param error - Optional custom error message
   * @returns A new Guardian instance with the notEquals validation applied
   *
   * @example
   * ```ts
   * guardian.notEquals('forbidden', 'Value cannot be "forbidden"');
   * ```
   */
  notEquals(expected: T, error?: string): BaseGuardian<T> {
    return this.process(notEquals(expected, error)) as BaseGuardian<T>;
  }

  /**
   * Validates that the result is in the provided array of allowed values.
   * Uses the helper function from the old Guardian system.
   *
   * @param allowedValues - Array of allowed values
   * @param error - Optional custom error message
   * @returns A new Guardian instance with the isIn validation applied
   *
   * @example
   * ```ts
   * guardian.isIn(['a', 'b', 'c'], 'Value must be one of: a, b, c');
   * ```
   */
  isIn(allowedValues: T[], error?: string): BaseGuardian<T> {
    return this.process(isIn(allowedValues, error)) as BaseGuardian<T>;
  }

  /**
   * Validates that the result is not in the provided array of forbidden values.
   * Uses the helper function from the old Guardian system.
   *
   * @param forbiddenValues - Array of forbidden values
   * @param error - Optional custom error message
   * @returns A new Guardian instance with the isNotIn validation applied
   *
   * @example
   * ```ts
   * guardian.isNotIn(['x', 'y', 'z'], 'Value cannot be one of: x, y, z');
   * ```
   */
  isNotIn(forbiddenValues: T[], error?: string): BaseGuardian<T> {
    return this.process(isNotIn(forbiddenValues, error)) as BaseGuardian<T>;
  }

  /**
   * Makes this guardian accept null values.
   * Uses the helper function from the old Guardian system.
   *
   * @returns A new Guardian instance that accepts null values
   *
   * @example
   * ```ts
   * const nullableString = Guardian.string().nullable();
   * nullableString.parse('hello'); // 'hello'
   * nullableString.parse(null); // null
   * nullableString.parse(undefined); // null
   * ```
   */
  nullable(): BaseGuardian<T | null> {
    const currentTransform = this._composedTransform;

    // Create a new transform that bypasses the composed transform for null/undefined
    const nullableTransform: GuardianTransform<unknown, T | null> = (
      value: unknown,
    ) => {
      // Handle null - return null without calling guardian
      if (value === null) {
        return null;
      }

      // For all other values, call the original composed transform
      return currentTransform(value) as T;
    };

    // If immutable, create new instance
    if (this._isImmutable) {
      return this._createStep<T | null>(
        nullableTransform,
        this._isAsync,
        this._metaData,
      );
    }

    // Mutate in place for better performance
    (this as unknown as BaseGuardian<T | null>)._composedTransform =
      nullableTransform;

    return this as unknown as BaseGuardian<T | null>;
  }

  /**
   * Makes this guardian handle undefined values by providing a default value.
   * Uses the helper function from the old Guardian system.
   *
   * @param defaultValue - Default value or function that returns default value
   * @returns A new Guardian instance that handles undefined values
   *
   * @example
   * ```ts
   * const optionalString = Guardian.string().optional('default');
   * optionalString.parse('hello'); // 'hello'
   * optionalString.parse(undefined); // 'default'
   * ```
   */
  optional(): BaseGuardian<T | undefined>;
  optional<D>(defaultValue: D | (() => D)): BaseGuardian<T | D>;
  optional<D>(
    defaultValue?: D | (() => D),
  ): BaseGuardian<T | D | undefined> {
    const currentTransform = this._composedTransform;

    // Create a new transform that handles optional logic first
    const optionalTransform: GuardianTransform<unknown, T | D | undefined> = (
      value: unknown,
    ) => {
      // Handle undefined by returning default
      if (value === undefined) {
        if (defaultValue === undefined) {
          return undefined as D | undefined;
        }

        if (typeof defaultValue === "function") {
          const result = (defaultValue as () => D | Promise<D>)();
          // If the result is a promise, return it for async handling
          if (result && typeof result === "object" && "then" in result) {
            // Return a promise that awaits the result and validates it
            return (result as Promise<D>).then((resolvedValue) =>
              currentTransform(resolvedValue)
            ) as T | Promise<T>;
          }
          // If the default is a computed value, validate it through the transform
          return currentTransform(result) as T;
        }

        // If the default is a direct value, validate it through the transform
        return currentTransform(defaultValue) as T;
      }

      // For all other values, call the original composed transform
      return currentTransform(value) as T;
    };

    // If immutable, create new instance
    if (this._isImmutable) {
      return this._createStep<T | D | undefined>(
        optionalTransform,
        this._isAsync,
        this._metaData,
      );
    }

    // Mutate in place for better performance
    (this as unknown as BaseGuardian<T | D | undefined>)._composedTransform =
      optionalTransform;

    return this as unknown as BaseGuardian<T | D | undefined>;
  }

  /**
   * Synchronously parses and validates the input value.
   *
   * @param input - The value to validate
   * @returns The validated and transformed value
   * @throws {Error} If any async steps are present
   * @throws {GuardianError} If validation fails
   *
   * @example
   * ```ts
   * const result = guardian.parse('hello'); // string
   * ```
   */
  parse(input: unknown): T {
    if (this._isAsync) {
      throw new GuardianError(
        "Cannot use parse() with async validation steps. Use parseAsync() instead.",
        {
          expected: "synchronous guardian",
          got: "guardian with async steps",
          comparison: "sync",
          type: "usage",
        },
      );
    }

    // Handle optional (undefined) first
    if (this._hasOptional && input === undefined) {
      if (this._optionalDefault === undefined) {
        // No default provided, return undefined as valid for optional fields
        return undefined as T;
      } else if (typeof this._optionalDefault === "function") {
        const result = (this._optionalDefault as () => T | Promise<T>)();
        if (isPromiseLike(result)) {
          throw new GuardianError(
            "Cannot use async default in sync parse. Use parseAsync() instead.",
            {
              expected: "synchronous default",
              got: "async function",
              comparison: "sync",
              type: "usage",
            },
          );
        }
        // Pass the result through validation
        input = result;
      } else {
        // Use the default value, but pass it through validation
        input = this._optionalDefault;
      }
    }

    // Handle nullable (null) second
    if (this._isNullable && input === null) {
      return null as T;
    }

    try {
      return this._composedTransform(input) as T;
    } catch (error) {
      if (error instanceof GuardianError) {
        throw error;
      } else {
        throw new GuardianError(
          "Validation failed",
          {
            expected: "valid value",
            got: input,
            comparison: "custom",
            type: "validation",
          },
        );
      }
    }
  }

  /**
   * Asynchronously parses and validates the input value.
   *
   * @param input - The value to validate
   * @returns Promise that resolves to the validated and transformed value
   * @throws {GuardianError} If validation fails
   *
   * @example
   * ```ts
   * const result = await guardian.parseAsync('hello'); // string
   * ```
   */
  async parseAsync(input: unknown): Promise<T> {
    try {
      const result = this._composedTransform(input);
      return isPromiseLike(result) ? await result : result;
    } catch (error) {
      if (error instanceof GuardianError) {
        throw error;
      } else {
        throw new GuardianError(
          "Validation failed",
          {
            expected: "valid value",
            got: input,
            comparison: "custom",
            type: "validation",
          },
        );
      }
    }
  }

  /**
   * Safely parses the input, returning a result object instead of throwing.
   *
   * @param input - The value to validate
   * @returns Object with success flag and either data or error
   *
   * @example
   * ```ts
   * const [error, data] = guardian.safeParse('hello');
   * if (error) {
   *   console.error('Validation failed:', error.message);
   * } else {
   *   console.log('Valid data:', data);
   * }
   * ```
   */
  safeParse(input: unknown): GuardianSafeParseResult<T> {
    try {
      const data = this.parse(input);
      return [null, data];
    } catch (error) {
      if (error instanceof GuardianError) {
        return [error, undefined];
      } else {
        return [
          new GuardianError(
            "Unexpected error during validation",
            {
              expected: "valid input",
              got: input,
              comparison: "unknown",
              type: "unexpected",
            },
          ),
          undefined,
        ];
      }
    }
  }

  /**
   * Safely parses the input asynchronously, returning a result tuple instead of throwing.
   *
   * @param input - The value to validate
   * @returns Promise of [error, data] tuple
   */
  async safeParseAsync(
    input: unknown,
  ): Promise<GuardianSafeParseResult<T>> {
    try {
      const data = await this.parseAsync(input);
      return [null, data];
    } catch (error) {
      if (error instanceof GuardianError) {
        return [error, undefined];
      } else {
        return [
          new GuardianError(
            "Unexpected error during validation",
            {
              expected: "valid input",
              got: input,
              comparison: "unknown",
              type: "unexpected",
            },
          ),
          undefined,
        ];
      }
    }
  }

  /**
   * Creates an immutable copy of this guardian.
   * All subsequent method calls will create new instances instead of mutating.
   *
   * @returns A new immutable Guardian instance
   *
   * @example
   * ```ts
   * const base = Guardian.string();
   * const immutable = base.immutable();
   * const email = immutable.email();     // Creates new instance
   * const phone = immutable.pattern();   // Creates new instance
   * // base and immutable are unchanged
   * ```
   */
  immutable(): BaseGuardian<T> {
    const clone = this._createStep(
      this._composedTransform,
      this._isAsync,
      this._metaData,
    );
    clone._isImmutable = true;
    return clone;
  }

  /**
   * Alias for immutable() - creates an immutable copy of this guardian.
   *
   * @returns A new immutable Guardian instance
   */
  freeze(): BaseGuardian<T> {
    return this.immutable();
  }

  /**
   * Creates a copy of this guardian for explicit cloning.
   * Unlike immutable(), the copy remains mutable.
   *
   * @returns A new mutable Guardian instance
   *
   * @example
   * ```ts
   * const base = Guardian.string().minLength(5);
   * const copy = base.clone();
   * copy.email();        // Mutates copy, base unchanged
   * base.pattern();      // Mutates base, copy unchanged
   * ```
   */
  clone(): BaseGuardian<T> {
    return this._createStep(
      this._composedTransform,
      this._isAsync,
      this._metaData,
    );
  }

  /**
   * Creates a new guardian instance for method chaining efficiently.
   * Only copies essential properties instead of full cloning.
   *
   * @template U - The new output type
   * @param transform - The new composed transform function
   * @param isAsync - Whether the new guardian will be async
   * @param metaData - Optional metadata to copy
   * @returns A new guardian instance
   * @internal
   */
  protected _createStep<U>(
    transform: GuardianTransform<unknown, U>,
    isAsync: boolean,
    metaData?: GuardianMetaData,
  ): BaseGuardian<U> {
    // Create new instance using the same constructor
    const newGuardian = Object.setPrototypeOf({
      _composedTransform: transform,
      _originalTransform: transform,
      _isAsync: isAsync,
      _isNullable: this._isNullable,
      _hasOptional: this._hasOptional,
      _optionalDefault: this._optionalDefault,
      _metaData: metaData ? { ...metaData } : undefined,
    }, this.constructor.prototype);

    return newGuardian;
  }



}
