import { BaseGuardian } from '../BaseGuardian.ts';
import type { FunctionType, GuardianProxy } from '../types/mod.ts';

/**
 * UnknownGuardian provides a pass-through guardian for values of unknown type.
 * It extends BaseGuardian to provide a chainable API without type validation.
 * This is useful when you need to accept any value but still want to use
 * the guardian chain pattern for additional validations or transformations.
 *
 * @example
 * ```ts
 * const anyValue = UnknownGuardian.create();
 *
 * // Accept any value
 * const result1 = anyValue("hello"); // Returns: "hello"
 * const result2 = anyValue(42); // Returns: 42
 * const result3 = anyValue({ foo: "bar" }); // Returns: { foo: "bar" }
 * const result4 = anyValue(null); // Returns: null
 * ```
 */
export class UnknownGuardian extends BaseGuardian<FunctionType<unknown>> {
  /**
   * Creates a new UnknownGuardian instance that accepts any value.
   * This guardian performs no validation and simply returns the input value.
   *
   * @returns A proxy that acts as both the guardian function and method provider
   *
   * @example
   * ```ts
   * const unknownGuard = UnknownGuardian.create();
   * const value1 = unknownGuard("any string"); // Returns: "any string"
   * const value2 = unknownGuard(123); // Returns: 123
   * const value3 = unknownGuard(true); // Returns: true
   * const value4 = unknownGuard(null); // Returns: null
   * const value5 = unknownGuard(undefined); // Returns: undefined
   * ```
   */
  static create(): GuardianProxy<UnknownGuardian> {
    return new UnknownGuardian((value: unknown): unknown => {
      return value;
    }).proxy();
  }

  //#region Validations
  /**
   * Validates that the value is not null.
   *
   * @param error - Custom error message to use when validation fails
   * @returns A new Guardian instance with the notNull validation applied
   *
   * @example
   * ```ts
   * UnknownGuardian.create().notNull()("hellp"); // Returns: "hello"
   * UnknownGuardian.create().notNull()(null); // Throws: "Expected value to not be null"
   * ```
   */
  public notNull(error?: string): GuardianProxy<this> {
    return this.test(
      (value) => value !== null,
      error || 'Expected value to not be null',
    );
  }

  /**
   * Validates that the value is not undefined.
   *
   * @param error - Custom error message to use when validation fails
   * @returns A new Guardian instance with the notUndefined validation applied
   *
   * @example
   * ```ts
   * UnknownGuardian.create().notUndefined()("hello"); // Returns: "hello"
   * UnknownGuardian.create().notUndefined()(undefined); // Throws: "Expected value to not be undefined"
   * ```
   */
  public notUndefined(error?: string): GuardianProxy<this> {
    return this.test(
      (value) => value !== undefined,
      error || 'Expected value to not be undefined',
    );
  }

  /**
   * Validates that the value is not null and not undefined.
   *
   * @param error - Custom error message to use when validation fails
   * @returns A new Guardian instance with the notNullish validation applied
   *
   * @example
   * ```ts
   * UnknownGuardian.create().notNullish()("hello"); // Returns: "hello"
   * UnknownGuardian.create().notNullish()(0); // Returns: 0
   * UnknownGuardian.create().notNullish()(""); // Returns: ""
   * UnknownGuardian.create().notNullish()(null); // Throws: "Expected value to not be null or undefined"
   * UnknownGuardian.create().notNullish()(undefined); // Throws: "Expected value to not be null or undefined"
   * ```
   */
  public notNullish(error?: string): GuardianProxy<this> {
    return this.test(
      (value) => value !== null && value !== undefined,
      error || 'Expected value to not be null or undefined',
    );
  }

  /**
   * Validates that the value is truthy.
   *
   * @param error - Custom error message to use when validation fails
   * @returns A new Guardian instance with the truthy validation applied
   *
   * @example
   * ```ts
   * UnknownGuardian.create().truthy()("hello"); // Returns: "hello"
   * UnknownGuardian.create().truthy()(1); // Returns: 1
   * UnknownGuardian.create().truthy()(true); // Returns: true
   * UnknownGuardian.create().truthy()(""); // Throws: "Expected truthy value"
   * UnknownGuardian.create().truthy()(0); // Throws: "Expected truthy value"
   * UnknownGuardian.create().truthy()(false); // Throws: "Expected truthy value"
   * ```
   */
  public truthy(error?: string): GuardianProxy<this> {
    return this.test(
      (value) => !!value,
      error || 'Expected truthy value',
    );
  }

  /**
   * Validates that the value is an instance of a specific constructor.
   *
   * @param constructor - The constructor function to check against
   * @param error - Custom error message to use when validation fails
   * @returns A new Guardian instance with the instanceof validation applied
   *
   * @example
   * ```ts
   * UnknownGuardian.create().instanceOf(Date)(new Date()); // Returns: Date object
   * UnknownGuardian.create().instanceOf(Array)([1, 2, 3]); // Returns: [1, 2, 3]
   * UnknownGuardian.create().instanceOf(Date)("hello"); // Throws: "Expected instance of Date"
   * ```
   */
  public instanceOf(
    // deno-lint-ignore no-explicit-any
    constructor: new (...args: any[]) => any,
    error?: string,
  ): GuardianProxy<this> {
    return this.test(
      (value) => value instanceof constructor,
      error || `Expected instance of ${constructor.name}`,
    );
  }

  /**
   * Converts the UnknownGuardian to an OpenAPI schema object
   * Note: Unknown types map to no specific type in OpenAPI (allows any value)
   * @returns An OpenAPI schema representation of this UnknownGuardian
   */
  public openapi(): import('../types/OpenAPISchema.ts').ObjectOpenAPISchema {
    const schema: import('../types/OpenAPISchema.ts').ObjectOpenAPISchema = {
      type: 'object',
      description: 'Any value (unknown type)',
      additionalProperties: true,
    };

    // Add metadata if available
    if (this.metadata.title) schema.title = this.metadata.title;
    if (this.metadata.description) {
      schema.description = this.metadata.description;
    }
    if (this.metadata.deprecated) schema.deprecated = this.metadata.deprecated;
    if (this.metadata.examples) schema.examples = this.metadata.examples;

    return schema;
  }
  //#endregion Validations
}
