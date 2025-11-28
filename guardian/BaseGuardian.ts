import { GuardianError } from './GuardianError.ts';
import {
  equals,
  isIn,
  isNotIn,
  isPromiseLike,
  notEquals,
  test,
} from './helpers/mod.ts';
import type {
  GuardianMetaData,
  GuardianSafeParseResult,
  GuardianTransform,
} from './types/mod.ts';

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
  protected _metaData: GuardianMetaData | undefined = undefined;
  protected readonly _type: string = 'unknown';

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
    if (this._metaData) {
      this._metaData.description = description;
    } else {
      this._metaData = { description };
    }
  }

  /**
   * Sets the title for this guardian.
   *
   * @param title - Short title for this guardian
   */
  set title(title: string) {
    if (this._metaData) {
      this._metaData.title = title;
    } else {
      this._metaData = { title };
    }
  }

  /**
   * Sets examples for this guardian.
   *
   * @param examples - Array of example values that would pass validation
   */
  set examples(examples: Array<unknown>) {
    if (this._metaData) {
      this._metaData.examples = examples;
    } else {
      this._metaData = { examples };
    }
  }

  /**
   * Marks this guardian as deprecated.
   *
   * @param deprecated - Whether this guardian is deprecated
   */
  set deprecated(deprecated: boolean) {
    if (this._metaData) {
      this._metaData.deprecated = deprecated;
    } else {
      this._metaData = { deprecated };
    }
  }

  /**
   * Gets whether this guardian instance is immutable.
   * When immutable, all validation methods return new instances instead of mutating.
   *
   * @returns True if this guardian is immutable, false otherwise
   */
  get isImmutable(): boolean {
    return (this._metaData?.isImmutable) === true;
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
   * @returns This Guardian instance (mutated) or new instance if immutable mode or constructor provided
   *
   * @example
   * ```ts
   * // Transform string to uppercase
   * guardian.process((str) => str.toUpperCase());
   *
   * // Transform string to number with type conversion
   * const numberGuardian = stringGuardian.process(
   *   (str) => parseInt(str, 10),
   *   NumberGuardian
   * );
   * ```
   */
  process<U, V extends BaseGuardian<U> = BaseGuardian<U>>(
    fn: GuardianTransform<T, U>,
    constructor?: new (
      initialTransform?: GuardianTransform<unknown, U>,
      metaData?: GuardianMetaData,
    ) => V,
  ): V | BaseGuardian<U> {
    // Prevent further processing after nullable() or optional()
    if (this._metaData?.isNullable) {
      throw new GuardianError(
        'Cannot call process() after nullable(). nullable() is a finisher method.',
        {
          expected: 'process() before nullable()',
          got: 'process() after nullable()',
          comparison: 'method_order',
          type: 'validation',
        },
      );
    }
    if (this._metaData?.isOptional) {
      throw new GuardianError(
        'Cannot call process() after optional(). optional() is a finisher method.',
        {
          expected: 'process() before optional()',
          got: 'process() after optional()',
          comparison: 'method_order',
          type: 'validation',
        },
      );
    }

    const currentTransform = this._composedTransform;

    const composedTransform: GuardianTransform<unknown, U> = (
      input: unknown,
    ) => {
      const intermediateResult = currentTransform(input);
      if (isPromiseLike(intermediateResult)) {
        return intermediateResult.then((resolved) => fn(resolved));
      }
      return fn(intermediateResult);
    };

    let returnInstance: V | BaseGuardian<U>;

    if (constructor) {
      // Create the instance with the provided constructor
      returnInstance = new constructor(composedTransform, this._metaData);
    } else if (this.isImmutable) {
      // Create a clone and then apply the transform
      const cloned = this.clone() as unknown as BaseGuardian<U>;
      cloned._composedTransform = composedTransform;
      returnInstance = cloned;
    } else {
      // Mutate in place for better performance
      (this as unknown as BaseGuardian<U>)._composedTransform =
        composedTransform;
      returnInstance = this as unknown as BaseGuardian<U>;
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
    // Prevent validation after nullable() or optional()
    if (this._metaData?.isNullable) {
      throw new GuardianError(
        'Cannot call test() after nullable(). nullable() is a finisher method.',
        {
          expected: 'test() before nullable()',
          got: 'test() after nullable()',
          comparison: 'method_order',
          type: 'validation',
        },
      );
    }
    if (this._metaData?.isOptional) {
      throw new GuardianError(
        'Cannot call test() after optional(). optional() is a finisher method.',
        {
          expected: 'test() before optional()',
          got: 'test() after optional()',
          comparison: 'method_order',
          type: 'validation',
        },
      );
    }

    return this.process(test(fn, error, expected));
  }

  /**
   * Validates that the result equals the expected value.
   * Uses the helper function from the old Guardian system.
   *
   * @param expected - The expected value to compare against
   * @param error - Optional custom error message
   * @returns This Guardian instance (mutated) or new instance if immutable mode
   *
   * @example
   * ```ts
   * guardian.equals('expected', 'Value must be "expected"');
   * ```
   */
  equals(expected: T, error?: string): this {
    return this.process(equals(expected, error)) as this;
  }

  /**
   * Validates that the result does not equal the expected value.
   * Uses the helper function from the old Guardian system.
   *
   * @param expected - The value that should not match
   * @param error - Optional custom error message
   * @returns This Guardian instance (mutated) or new instance if immutable mode
   *
   * @example
   * ```ts
   * guardian.notEquals('forbidden', 'Value cannot be "forbidden"');
   * ```
   */
  notEquals(expected: T, error?: string): this {
    return this.process(notEquals(expected, error)) as this;
  }

  /**
   * Validates that the result is in the provided array of allowed values.
   * Uses the helper function from the old Guardian system.
   *
   * @param allowedValues - Array of allowed values
   * @param error - Optional custom error message
   * @returns This Guardian instance (mutated) or new instance if immutable mode
   *
   * @example
   * ```ts
   * guardian.isIn(['a', 'b', 'c'], 'Value must be one of: a, b, c');
   * ```
   */
  isIn(allowedValues: T[], error?: string): this {
    return this.process(isIn(allowedValues, error)) as this;
  }

  /**
   * Validates that the result is not in the provided array of forbidden values.
   * Uses the helper function from the old Guardian system.
   *
   * @param forbiddenValues - Array of forbidden values
   * @param error - Optional custom error message
   * @returns This Guardian instance (mutated) or new instance if immutable mode
   *
   * @example
   * ```ts
   * guardian.isNotIn(['x', 'y', 'z'], 'Value cannot be one of: x, y, z');
   * ```
   */
  isNotIn(forbiddenValues: T[], error?: string): this {
    return this.process(isNotIn(forbiddenValues, error)) as this;
  }

  /**
   * Makes this guardian accept null values.
   * Uses the process method for centralized logic.
   *
   * @returns This Guardian instance (mutated) or new instance if immutable mode
   *
   * @example
   * ```ts
   * const nullableString = Guardian.string().nullable();
   * nullableString.parse('hello'); // 'hello'
   * nullableString.parse(null); // null
   * nullableString.parse(undefined); // null
   * ```
   */
  nullable(): BaseGuardian<T | null | undefined> {
    // Prevent multiple nullable() calls
    if (this._metaData?.isNullable) {
      throw new GuardianError(
        'nullable() has already been called on this guardian.',
        {
          expected: 'single nullable() call',
          got: 'multiple nullable() calls',
          comparison: 'method_order',
          type: 'validation',
        },
      );
    }
    if (this.isImmutable === true) {
      return this.clone().nullable();
    } else {
      // Mutate in place for better performance
      // Use process with identity transform but modify the composed transform to handle null/undefined
      const currentTransform = this._composedTransform;

      const nullableTransform: GuardianTransform<
        unknown,
        T | null | undefined
      > = (
        value: unknown,
      ) => {
        // Handle null - return null without calling the composed transform
        if (value === null) {
          return null;
        }

        // If this guardian is also optional, let the optional transform handle undefined
        // (it may return a default value or undefined)
        if (value === undefined && this._metaData?.isOptional) {
          return currentTransform(value) as T;
        }

        // For all other values, call the current composed transform
        return currentTransform(value) as T;
      };
      (this as unknown as BaseGuardian<T | null | undefined>)
        ._composedTransform = nullableTransform;
      if (!this._metaData) {
        this._metaData = {};
      }
      this._metaData.isNullable = true;

      // Always return the broadest type to handle chaining
      return this as BaseGuardian<T | null | undefined>;
    }
  }

  /**
   * Makes this guardian handle undefined values by providing a default value.
   * Uses the process method for centralized logic.
   *
   * @param defaultValue - Default value or function that returns default value
   * @returns This Guardian instance (mutated) or new instance if immutable mode
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
    _defaultValue?: D | (() => D),
  ): BaseGuardian<T | D | undefined> | BaseGuardian<T | D | undefined | null> {
    // Prevent multiple optional() calls
    if (this._metaData?.isOptional) {
      throw new GuardianError(
        'optional() has already been called on this guardian.',
        {
          expected: 'single optional() call',
          got: 'multiple optional() calls',
          comparison: 'method_order',
          type: 'validation',
        },
      );
    }
    // Store the current transform before setting finisher flags
    // This allows us to use it in the optionalTransform even after finisher protection is enabled
    const currentTransform = this._composedTransform;

    const optionalTransform: GuardianTransform<
      unknown,
      T | D | undefined | null
    > = (
      value: unknown,
    ) => {
      // Handle undefined by returning default or undefined
      if (value === undefined) {
        if (_defaultValue === undefined) {
          return undefined as D | undefined;
        }

        if (typeof _defaultValue === 'function') {
          const result = (_defaultValue as () => D | Promise<D>)();
          // If the result is a promise, handle it properly
          if (result && typeof result === 'object' && 'then' in result) {
            return result.then((resolvedValue) =>
              currentTransform(resolvedValue)
            );
          }
          // If the default is a computed value, validate it through the transform
          return currentTransform(result) as T;
        }

        // If the default is a direct value, validate it through the transform
        return currentTransform(_defaultValue) as T;
      }

      // If this guardian is also nullable, null should remain null
      // Otherwise, apply normal transformation which may reject null
      if (value === null && this._metaData?.isNullable) {
        return null;
      }

      // For all other values, call the current composed transform
      return currentTransform(value) as T;
    };

    // Use the returnInstance pattern like process() method
    let returnInstance: this;

    if (this.isImmutable) {
      // If immutable, create new instance using constructor
      const newMetaData = { ...this._metaData, isOptional: true };
      returnInstance = new (this.constructor as new (
        initialTransform?: GuardianTransform<unknown, T | D | undefined | null>,
        metaData?: GuardianMetaData,
      ) => this)(optionalTransform, newMetaData);
    } else {
      // Mutate in place for better performance
      (this as unknown as BaseGuardian<T | D | undefined | null>)
        ._composedTransform = optionalTransform;
      if (this._metaData) {
        this._metaData.isOptional = true;
      } else {
        this._metaData = { isOptional: true };
      }
      returnInstance = this;
    }

    // Return the correct type - only include null if nullable is also set
    if (this._metaData?.isNullable) {
      return returnInstance as BaseGuardian<T | D | undefined | null>;
    } else {
      return returnInstance as BaseGuardian<T | D | undefined>;
    }
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
    if (this._metaData?.isAsync) {
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

    // Optional and nullable logic is now handled in the transform chain

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
   * Makes the current guardian immutable.
   *
   * @returns This Guardian instance
   *
   * @example
   * ```ts
   * const base = Guardian.string();
   * const immutable = base.immutable();
   * const email = immutable.email();     // Returns new instance (immutable mode)
   * const phone = immutable.pattern();   // Returns new instance (immutable mode)
   * // base and immutable are unchanged
   * ```
   */
  immutable(): BaseGuardian<T> {
    if (!this._metaData) {
      this._metaData = {};
    }
    this._metaData.isImmutable = true;
    return this;
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
    const metaDataClone = this._metaData ? { ...this._metaData } : undefined;
    // Delete isImmutable flag for the clone
    if (metaDataClone && metaDataClone.isImmutable) {
      delete metaDataClone.isImmutable;
    }
    return new (this.constructor as new (
      initialTransform?: GuardianTransform<unknown, T>,
      metaData?: GuardianMetaData,
    ) => BaseGuardian<T>)(this._composedTransform, metaDataClone);
  }

  //#region Documentation Methods

  /**
   * Generates OpenAPI 3.0 schema definition for this Guardian.
   * Includes type information, metadata, and validation constraints.
   *
   * @returns OpenAPI schema object that can be used in API documentation
   *
   * @example
   * ```ts
   * const schema = Guardian.string().minLength(3).toOpenAPI();
   * // Returns: { type: 'string', minLength: 3 }
   * ```
   */
  toOpenAPI(): Record<string, unknown> {
    const schema: Record<string, unknown> = {
      type: this._type,
    };

    // Add metadata if available
    if (this._metaData) {
      if (this._metaData.title) schema.title = this._metaData.title;
      if (this._metaData.description) {
        schema.description = this._metaData.description;
      }
      if (this._metaData.deprecated) {
        schema.deprecated = this._metaData.deprecated;
      }
      if (this._metaData.examples) schema.examples = this._metaData.examples;
      if (this._metaData.format) schema.format = this._metaData.format;

      // Handle nullable
      if (this._metaData.isNullable) {
        schema.nullable = true;
      }

      // Add any additional constraints from metadata
      for (const [key, value] of Object.entries(this._metaData)) {
        if (
          ![
            'description',
            'title',
            'examples',
            'deprecated',
            'format',
            'isAsync',
            'isNullable',
            'isOptional',
          ].includes(key)
        ) {
          schema[key] = value;
        }
      }
    }

    return schema;
  }

  /**
   * Generates simple Markdown documentation for this Guardian.
   * Includes title, description, type information, examples, and deprecation warnings.
   *
   * @returns Markdown formatted string suitable for documentation
   *
   * @example
   * ```ts
   * const docs = Guardian.string().title('Username').toMarkdown();
   * // Returns formatted markdown with type info and examples
   * ```
   */
  toMarkdown(): string {
    let markdown = '';

    // Title
    if (this._metaData?.title) {
      markdown += `### ${this._metaData.title}\n\n`;
    }

    // Description
    if (this._metaData?.description) {
      markdown += `${this._metaData.description}\n\n`;
    }

    // Type and format info
    let typeInfo = `**Type:** ${this._type}`;
    if (this._metaData?.format) {
      typeInfo += ` (${this._metaData.format})`;
    }
    if (this._metaData?.isNullable) typeInfo += ', nullable';
    if (this._metaData?.isOptional) typeInfo += ', optional';
    markdown += `${typeInfo}\n\n`;

    // Examples
    if (this._metaData?.examples && this._metaData.examples.length > 0) {
      markdown += `**Examples:** `;
      markdown += this._metaData.examples.map((ex) =>
        `\`${JSON.stringify(ex)}\``
      ).join(', ');
      markdown += '\n\n';
    }

    // Deprecation warning
    if (this._metaData?.deprecated) {
      markdown += `> ⚠️ **Deprecated**\n\n`;
    }

    return markdown.trim();
  }

  //#endregion
}
