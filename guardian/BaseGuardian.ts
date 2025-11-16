import { GuardianError } from './GuardianError.ts';
import { isPromiseLike } from './helpers/mod.ts';
import type {
  GuardianMetaData,
  GuardianSafeParseResult,
  GuardianTransform,
} from './types/mod.ts';

/**
 * Abstract base class for all Guardian validators.
 * Provides a fluent API for building validation pipelines with step-based transformations.
 *
 * @template T - The output type after all validations and transformations
 *
 * @example
 * ```ts
 * const schema = new StringGuardian()
 *   .minLength(3)
 *   .step((val) => val.toUpperCase())
 *   .step((val) => val.trim());
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
      this._metaData = { description: '', title };
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
      this._metaData = { description: '', examples };
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
      this._metaData = { description: '', deprecated };
    } else {
      this._metaData.deprecated = deprecated;
    }
  }

  /**
   * Creates a new BaseGuardian instance.
   *
   * @param initialTransform - The initial transformation function
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
   * Adds a validation step to the pipeline.
   *
   * @template U - The output type of this step
   * @param validator - Function that validates and optionally transforms the value
   * @param errorMessage - Custom error message to use if validation fails
   * @param comparison - Type of comparison being performed (for error context)
   * @returns This Guardian instance (mutated) or new instance if immutable
   *
   * @example
   * ```ts
   * guardian.step(
   *   (value) => {
   *     if (value.length < 5) throw new Error(); // Just throw any error
   *     return value;
   *   },
   *   'Value must be at least 5 characters',
   *   'minLength'
   * );
   * ```
   */
  step<U>(
    validator: GuardianTransform<T, U>,
    errorMessage = 'Validation failed',
    comparison = 'custom',
  ): BaseGuardian<U> {
    // Create enhanced transform function with error handling
    const enhancedValidator: GuardianTransform<T, U> = (value: T) => {
      try {
        return validator(value);
      } catch (originalError) {
        // If it's already a GuardianError and this is a transform/custom validation, preserve it
        if (
          originalError instanceof GuardianError &&
          (comparison === 'transform' || comparison === 'custom' ||
            comparison === 'equals' || comparison === 'gte' ||
            comparison === 'lte' || comparison === 'unique' ||
            comparison === 'includes' || comparison === 'excludes')
        ) {
          throw originalError;
        }

        // Otherwise, wrap any error in GuardianError with custom message
        throw new GuardianError(errorMessage, {
          // expected: 'valid value',
          got: value,
          comparison,
          type: 'validation',
        });
      }
    };

    // If immutable, create new instance
    if (this._isImmutable) {
      const composedTransform: GuardianTransform<unknown, U> = (
        input: unknown,
      ) => {
        const intermediateResult = this._composedTransform(input);
        if (isPromiseLike(intermediateResult)) {
          return intermediateResult.then((resolved) =>
            enhancedValidator(resolved as T)
          );
        }
        return enhancedValidator(intermediateResult as T);
      };

      const isStepAsync = isPromiseLike(validator);
      const willBeAsync = this._isAsync || isStepAsync;

      return this._createStep<U>(
        composedTransform,
        willBeAsync,
        this._metaData,
      );
    }

    // Mutate in place for better performance
    const oldTransform = this._composedTransform;
    const newTransform: GuardianTransform<unknown, U> = (input: unknown) => {
      const intermediateResult = oldTransform(input);
      if (isPromiseLike(intermediateResult)) {
        return intermediateResult.then((resolved) =>
          enhancedValidator(resolved as T)
        );
      }
      return enhancedValidator(intermediateResult as T);
    };
    (this as unknown as BaseGuardian<U>)._composedTransform = newTransform;

    // Update async flag if this step introduces async behavior
    if (!this._isAsync && isPromiseLike(validator)) {
      this._isAsync = true;
    }

    return this as unknown as BaseGuardian<U>;
  }

  /**
   * Adds a transformation step that changes the type.
   *
   * @template U - The new output type
   * @param transformer - Function that transforms the value to a new type
   * @param error - Custom error message for transformation failures
   * @returns This Guardian instance (mutated) or new instance if immutable
   *
   * @example
   * ```ts
   * const numberGuardian = stringGuardian.mutate(
   *   (str) => parseInt(str, 10),
   *   'Failed to parse string to number'
   * );
   * ```
   */
  mutate<U>(
    transformer: GuardianTransform<T, U>,
    error = 'Type transformation failed',
  ): BaseGuardian<U> {
    return this.step(transformer, error, 'transform');
  }

  /**
   * Validates that the value equals the expected value.
   *
   * @param expected - The expected value
   * @param message - Optional custom error message
   * @returns This Guardian instance (mutated) or new instance if immutable
   *
   * @example
   * ```ts
   * const exactValue = Guardian.string().equals('hello');
   * exactValue.parse('hello'); // 'hello'
   * exactValue.parse('world'); // throws GuardianError
   * ```
   */
  equals(expected: T, message?: string): BaseGuardian<T> {
    return this.step(
      (value: T) => {
        if (value !== expected) {
          throw new Error(); // Just throw any error, step will wrap it
        }
        return value;
      },
      message || `Expected ${expected}, got actual value`,
      'equals',
    );
  }

  /**
   * Validates that the value does not equal the forbidden value.
   *
   * @param forbidden - The forbidden value
   * @param message - Optional custom error message
   * @returns This Guardian instance (mutated) or new instance if immutable
   *
   * @example
   * ```ts
   * const notEmpty = Guardian.string().notEquals('');
   * notEmpty.parse('hello'); // 'hello'
   * notEmpty.parse(''); // throws GuardianError
   * ```
   */
  notEquals(forbidden: T, message?: string): BaseGuardian<T> {
    return this.step(
      (value: T) => {
        if (value === forbidden) {
          throw new Error(); // Just throw any error, step will wrap it
        }
        return value;
      },
      message || `Value must not equal ${forbidden}`,
      'notEquals',
    );
  }

  /**
   * Validates that the value is included in the allowed values array.
   *
   * @param allowedValues - Array of allowed values
   * @param message - Optional custom error message
   * @returns This Guardian instance (mutated) or new instance if immutable
   *
   * @example
   * ```ts
   * const color = Guardian.string().in(['red', 'green', 'blue']);
   * color.parse('red'); // 'red'
   * color.parse('yellow'); // throws GuardianError
   * ```
   */
  in(allowedValues: readonly T[], message?: string): BaseGuardian<T> {
    return this.step(
      (value: T) => {
        if (!allowedValues.includes(value)) {
          throw new Error(); // Just throw any error, step will wrap it
        }
        return value;
      },
      message || `Value must be one of: [${allowedValues.join(', ')}]`,
      'in',
    );
  }

  /**
   * Validates that the value is not included in the forbidden values array.
   *
   * @param forbiddenValues - Array of forbidden values
   * @param message - Optional custom error message
   * @returns This Guardian instance (mutated) or new instance if immutable
   *
   * @example
   * ```ts
   * const noSwears = Guardian.string().notIn(['damn', 'hell']);
   * noSwears.parse('hello'); // 'hello'
   * noSwears.parse('damn'); // throws GuardianError
   * ```
   */
  notIn(forbiddenValues: readonly T[], message?: string): BaseGuardian<T> {
    return this.step(
      (value: T) => {
        if (forbiddenValues.includes(value)) {
          throw new Error(); // Just throw any error, step will wrap it
        }
        return value;
      },
      message || `Value must not be one of: [${forbiddenValues.join(', ')}]`,
      'notIn',
    );
  }

  /**
   * Makes this guardian accept null values.
   * When null is encountered, it passes through without further validation.
   *
   * @returns This Guardian instance (mutated) or new instance if immutable
   *
   * @example
   * ```ts
   * const nullableString = Guardian.string().nullable();
   * nullableString.parse('hello'); // 'hello'
   * nullableString.parse(null); // null
   * nullableString.parse(undefined); // throws GuardianError
   * ```
   */
  nullable(): BaseGuardian<T | null> {
    if (this._isImmutable) {
      const newGuardian = this.clone();
      newGuardian._isNullable = true;
      return newGuardian as BaseGuardian<T | null>;
    }

    this._isNullable = true;
    return this as BaseGuardian<T | null>;
  }

  /**
   * Makes this guardian handle undefined values by providing a default value.
   * If no default is provided, undefined will pass through.
   *
   * @param defaultValue - Default value, function, or async function to use when input is undefined
   * @returns A new Guardian instance that handles undefined values
   *
   * @example
   * ```ts
   * const optionalString = Guardian.string().optional('default');
   * optionalString.parse('hello'); // 'hello'
   * optionalString.parse(undefined); // 'default'
   *
   * const asyncOptional = Guardian.string().optional(async () => await getDefaultValue());
   * await asyncOptional.parseAsync(undefined); // result from getDefaultValue()
   * ```
   */
  optional(): BaseGuardian<T | undefined>;
  optional<D>(
    defaultValue: D | (() => D) | (() => Promise<D>),
  ): BaseGuardian<T | D>;
  optional<D>(
    defaultValue?: D | (() => D) | (() => Promise<D>),
  ): BaseGuardian<T | D | undefined> {
    if (this._isImmutable) {
      const newGuardian = this.clone();
      newGuardian._hasOptional = true;
      // Type assertion needed for generic flexibility
      (newGuardian as BaseGuardian<T | D | undefined>)._optionalDefault =
        defaultValue as T | (() => T) | (() => Promise<T>) | undefined;
      return newGuardian as BaseGuardian<T | D | undefined>;
    }

    this._hasOptional = true;
    // Type assertion needed for generic flexibility
    (this as BaseGuardian<T | D | undefined>)._optionalDefault = defaultValue as
      | T
      | (() => T)
      | (() => Promise<T>)
      | undefined;
    return this as BaseGuardian<T | D | undefined>;
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
        'Cannot use parse() with async validation steps. Use parseAsync() instead.',
        {
          expected: 'synchronous guardian',
          got: 'guardian with async steps',
          comparison: 'sync',
          type: 'usage',
        },
      );
    }

    // Handle optional (undefined) first
    if (this._hasOptional && input === undefined) {
      if (this._optionalDefault === undefined) {
        // No default provided, return undefined as valid for optional fields
        return undefined as T;
      } else if (typeof this._optionalDefault === 'function') {
        const result = (this._optionalDefault as () => T | Promise<T>)();
        if (isPromiseLike(result)) {
          throw new GuardianError(
            'Cannot use async default in sync parse. Use parseAsync() instead.',
            {
              expected: 'synchronous default',
              got: 'async function',
              comparison: 'sync',
              type: 'usage',
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
          'Validation failed',
          {
            expected: 'valid value',
            got: input,
            comparison: 'custom',
            type: 'validation',
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
    // Handle optional (undefined) first
    if (this._hasOptional && input === undefined) {
      if (this._optionalDefault === undefined) {
        // No default provided, return undefined as valid for optional fields
        return undefined as T;
      } else if (typeof this._optionalDefault === 'function') {
        const result = (this._optionalDefault as () => T | Promise<T>)();
        // Pass the result through validation
        input = isPromiseLike(result) ? await result : result;
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
      const result = this._composedTransform(input);
      return isPromiseLike(result) ? await result : result;
    } catch (error) {
      if (error instanceof GuardianError) {
        throw error;
      } else {
        throw new GuardianError(
          'Validation failed',
          {
            expected: 'valid value',
            got: input,
            comparison: 'custom',
            type: 'validation',
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
            'Unexpected error during validation',
            {
              expected: 'valid input',
              got: input,
              comparison: 'unknown',
              type: 'unexpected',
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
            'Unexpected error during validation',
            {
              expected: 'valid input',
              got: input,
              comparison: 'unknown',
              type: 'unexpected',
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

  /**
   * Creates a clone of this guardian for method chaining.
   * @deprecated Use _createStep for more efficient step creation
   *
   * @template U - The new output type
   * @returns A new guardian instance
   * @internal
   */
  protected _clone<U>(): BaseGuardian<U> {
    return this._createStep<U>(
      this._composedTransform as unknown as GuardianTransform<unknown, U>,
      this._isAsync,
      this._metaData,
    );
  }

  /**
   * Executes all validation steps in sequence.
   *
   * @param input - The initial input value
   * @returns The final transformed value (possibly a Promise)
   * @internal
   */
}
