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
   * @param description - Optional description of what this step does
   * @returns A new Guardian instance with the added step
   *
   * @example
   * ```ts
   * guardian.step((value) => {
   *   if (value.length < 5) {
   *     throw new GuardianError('Too short', { ... });
   *   }
   *   return value;
   * }, 'Minimum length validation');
   * ```
   */
  step<U>(
    validator: GuardianTransform<T, U>,
    _description?: string,
  ): BaseGuardian<U> {
    // Create composed transform function
    const composedTransform: GuardianTransform<unknown, U> = (
      input: unknown,
    ) => {
      const intermediateResult = this._composedTransform(input);
      return validator(intermediateResult as T);
    };

    const newGuardian = this._clone<U>();
    newGuardian._composedTransform = composedTransform;
    newGuardian._originalTransform = composedTransform;

    // Check if this step introduces async behavior
    if (!newGuardian._isAsync) {
      try {
        // Test with a dummy value to see if it returns a promise
        if (isPromiseLike(validator)) {
          newGuardian._isAsync = true;
        }
      } catch {
        // Ignore errors during async detection
      }
    }

    return newGuardian;
  }

  /**
   * Adds a transformation step that changes the type.
   *
   * @template U - The new output type
   * @param transformer - Function that transforms the value to a new type
   * @param description - Optional description of the transformation
   * @returns A new Guardian instance with the new type
   *
   * @example
   * ```ts
   * const numberGuardian = stringGuardian.mutate(
   *   (str) => parseInt(str, 10),
   *   'Parse string to number'
   * );
   * ```
   */
  mutate<U>(
    transformer: GuardianTransform<T, U>,
    description?: string,
  ): BaseGuardian<U> {
    return this.step(transformer, description || 'Type transformation');
  }

  /**
   * Validates that the value equals the expected value.
   *
   * @param expected - The expected value
   * @param message - Optional custom error message
   * @returns A new Guardian instance with the equality validation
   *
   * @example
   * ```ts
   * const exactValue = Guardian.string().equals('hello');
   * exactValue.parse('hello'); // 'hello'
   * exactValue.parse('world'); // throws GuardianError
   * ```
   */
  equals(expected: T, message?: string): BaseGuardian<T> {
    return this.step((value: T) => {
      if (value !== expected) {
        throw new GuardianError(
          message ||
            'Expected ${expected}, got ${got}',
          {
            expected,
            got: value,
            comparison: 'equals',
            type: 'value_mismatch',
          },
        );
      }
      return value;
    });
  }

  /**
   * Validates that the value does not equal the forbidden value.
   *
   * @param forbidden - The forbidden value
   * @param message - Optional custom error message
   * @returns A new Guardian instance with the inequality validation
   *
   * @example
   * ```ts
   * const notEmpty = Guardian.string().notEquals('');
   * notEmpty.parse('hello'); // 'hello'
   * notEmpty.parse(''); // throws GuardianError
   * ```
   */
  notEquals(forbidden: T, message?: string): BaseGuardian<T> {
    return this.step((value: T) => {
      if (value === forbidden) {
        throw new GuardianError(
          message || 'Value must not equal ${expected}',
          {
            expected: forbidden,
            got: value,
            comparison: 'notEquals',
            type: 'forbidden_value',
          },
        );
      }
      return value;
    });
  }

  /**
   * Validates that the value is included in the allowed values array.
   *
   * @param allowedValues - Array of allowed values
   * @param message - Optional custom error message
   * @returns A new Guardian instance with the inclusion validation
   *
   * @example
   * ```ts
   * const color = Guardian.string().in(['red', 'green', 'blue']);
   * color.parse('red'); // 'red'
   * color.parse('yellow'); // throws GuardianError
   * ```
   */
  in(allowedValues: readonly T[], message?: string): BaseGuardian<T> {
    return this.step((value: T) => {
      if (!allowedValues.includes(value)) {
        throw new GuardianError(
          message || 'Value must be one of: ${expected}',
          {
            expected: allowedValues,
            got: value,
            comparison: 'in',
            type: 'not_in_list',
          },
        );
      }
      return value;
    });
  }

  /**
   * Validates that the value is not included in the forbidden values array.
   *
   * @param forbiddenValues - Array of forbidden values
   * @param message - Optional custom error message
   * @returns A new Guardian instance with the exclusion validation
   *
   * @example
   * ```ts
   * const noSwears = Guardian.string().notIn(['damn', 'hell']);
   * noSwears.parse('hello'); // 'hello'
   * noSwears.parse('damn'); // throws GuardianError
   * ```
   */
  notIn(forbiddenValues: readonly T[], message?: string): BaseGuardian<T> {
    return this.step((value: T) => {
      if (forbiddenValues.includes(value)) {
        throw new GuardianError(
          message || 'Value must not be one of: ${expected}',
          {
            expected: forbiddenValues,
            got: value,
            comparison: 'notIn',
            type: 'forbidden_value',
          },
        );
      }
      return value;
    });
  }

  /**
   * Makes this guardian accept null values.
   * When null is encountered, it passes through without further validation.
   *
   * @returns A new Guardian instance that accepts T | null
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
    // Use step method but ensure we preserve state correctly
    const newGuardian = this.step((x: T) => x as T | null);

    // Copy all state from this guardian to the new one after step creates it
    newGuardian._isNullable = true;
    newGuardian._hasOptional = this._hasOptional;
    (newGuardian as unknown as this)._optionalDefault = this._optionalDefault;

    return newGuardian;
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
    // Use step method but ensure we preserve state correctly
    const newGuardian = this.step((x: T) => x as T | D | undefined);

    // Copy all state from this guardian to the new one after step creates it
    newGuardian._isNullable = this._isNullable;
    newGuardian._hasOptional = true;
    (newGuardian as unknown as BaseGuardian<T | D | undefined>)
      ._optionalDefault = defaultValue;

    // We can't reliably detect if a function is async without calling it
    // So we'll mark the guardian as potentially async if a function is provided
    // The actual async detection will happen during parsing
    if (typeof defaultValue === 'function') {
      // We assume it might be async since we can't tell without calling it
      // This will be refined during actual parsing
    }

    return newGuardian;
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
   * Creates a clone of this guardian for method chaining.
   *
   * @template U - The new output type
   * @returns A new guardian instance
   * @internal
   */
  protected _clone<U>(): BaseGuardian<U> {
    // Try the most straightforward approach - create new instance and copy everything
    const clone = Object.setPrototypeOf({}, this.constructor.prototype);

    // Copy all enumerable and non-enumerable own properties
    const propertyNames = Object.getOwnPropertyNames(this);
    for (const prop of propertyNames) {
      const descriptor = Object.getOwnPropertyDescriptor(this, prop);
      if (descriptor) {
        if (prop === '_metaData' && descriptor.value) {
          // Clone metadata
          Object.defineProperty(clone, prop, {
            ...descriptor,
            value: { ...descriptor.value },
          });
        } else {
          Object.defineProperty(clone, prop, descriptor);
        }
      }
    }

    return clone;
  }

  /**
   * Executes all validation steps in sequence.
   *
   * @param input - The initial input value
   * @returns The final transformed value (possibly a Promise)
   * @internal
   */
}
