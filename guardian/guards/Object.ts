import { BaseGuardian } from '../BaseGuardian.ts';
import { GuardianError } from '../GuardianError.ts';
import type { FunctionType, GuardianProxy } from '../types/mod.ts';
import { getType } from '../helpers/mod.ts';

/**
 * ObjectGuardian provides validation utilities for object values.
 * It extends BaseGuardian to provide a chainable API for object validation.
 *
 * @example
 * ```ts
 * const userGuard = ObjectGuardian.create()
 *   .keys(['name', 'age'])
 *   .notEmpty();
 *
 * // Validate an object
 * const validUser = userGuard({ name: 'John', age: 30 }); // Returns: { name: 'John', age: 30 }
 * userGuard(null); // Throws: "Expected object, got null"
 * userGuard({}); // Throws: "Expected object to have keys: name, age"
 * ```
 */
export class ObjectGuardian<
  T extends Record<string, unknown> = Record<string, unknown>,
> extends BaseGuardian<FunctionType<T>> {
  /**
   * Creates a new ObjectGuardian instance that validates if a value is an object.
   *
   * @param error - Custom error message to use when validation fails
   * @returns A proxy that acts as both the guardian function and method provider
   *
   * @example
   * ```ts
   * const objGuard = ObjectGuardian.create();
   * const obj = objGuard({ foo: 'bar' }); // Returns: { foo: 'bar' }
   * objGuard("not an object"); // Throws: "Expected object, got string"
   * ```
   */
  static create<T extends Record<string, unknown> = Record<string, unknown>>(
    error?: string,
  ): GuardianProxy<ObjectGuardian<T>> {
    return new ObjectGuardian<T>((value: unknown): T => {
      if (
        typeof value !== 'object' ||
        value === null ||
        Array.isArray(value)
      ) {
        throw new GuardianError(
          {
            got: value,
            expected: 'object',
            comparison: 'type',
            type: getType(value),
          },
          error || 'Expected object, got ${type}',
        );
      }
      return value as T;
    }).proxy();
  }

  /**
   * Validates that all keys and values in the object match the specified patterns.
   * Useful for dynamic objects where you know the pattern but not the exact keys.
   *
   * @param keyGuardian - Guardian to validate each key with
   * @param valueGuardian - Guardian to validate each value with
   * @param message - Custom error message for validation failure
   * @returns A new Guardian instance with the key-value pattern validation applied
   *
   * @example
   * ```ts
   * // Keys must be 3-character strings, values must be numbers
   * const objGuard = ObjectGuardian.create().keyValue(
   *   Guardian.string().length(3),
   *   Guardian.number()
   * );
   *
   * objGuard({ ABC: 123, XYZ: 456 }); // Returns: { ABC: 123, XYZ: 456 }
   * objGuard({ AB: 123 }); // Throws: key validation error
   * objGuard({ ABC: "hello" }); // Throws: value validation error
   * ```
   */
  public keyValue<K extends string, V>(
    keyGuardian: FunctionType<K>,
    valueGuardian: FunctionType<V>,
    message?: string,
  ): GuardianProxy<ObjectGuardian<Record<K, V>>> {
    return this.transform((obj) => {
      const result: Record<K, V> = {} as Record<K, V>;
      const errors = new GuardianError(
        {
          got: obj,
          expected: 'object with validated keys and values',
          comparison: 'keyValue',
        },
        message ?? 'Object key-value pattern validation failed',
      );

      for (const [key, value] of Object.entries(obj)) {
        let validatedKey: K;
        let validatedValue: V;

        // Validate key
        try {
          validatedKey = keyGuardian(key);
        } catch (error) {
          if (error instanceof GuardianError) {
            errors.addCause(`key:${key}`, error);
          } else {
            errors.addCause(
              `key:${key}`,
              new GuardianError(
                {
                  got: key,
                  comparison: 'unhandled',
                },
                `Unexpected error validating key ${(error as Error).message}`,
              ),
            );
          }
          continue;
        }

        // Validate value
        try {
          validatedValue = valueGuardian(value);
        } catch (error) {
          if (error instanceof GuardianError) {
            errors.addCause(`value:${key}`, error);
          } else {
            errors.addCause(
              `value:${key}`,
              new GuardianError(
                {
                  got: value,
                  comparison: 'unhandled',
                },
                `Unexpected error validating value ${(error as Error).message}`,
              ),
            );
          }
          continue;
        }

        result[validatedKey] = validatedValue;
      }

      if (errors.causeSize() > 0) {
        throw errors;
      }
      return result;
    }) as unknown as GuardianProxy<ObjectGuardian<Record<K, V>>>;
  }

  /**
   * Validates that the object has specific keys.
   *
   * @param keys - Array of keys that must exist in the object
   * @param error - Custom error message to use when validation fails
   * @returns A new Guardian instance with the keys validation applied
   *
   * @example
   * ```ts
   * const objGuard = ObjectGuardian.create().keys(['name', 'age']);
   * objGuard({ name: 'John', age: 30 }); // Returns: { name: 'John', age: 30 }
   * objGuard({ name: 'John' }); // Throws: "Expected object to have keys: name, age"
   * ```
   */
  public keys(keys: string[], error?: string): GuardianProxy<this> {
    return this.test(
      (obj) => {
        const objKeys = Object.keys(obj);
        return keys.every((key) => objKeys.includes(key));
      },
      error || `Expected object to have keys: ${keys.join(', ')}`,
    );
  }

  /**
   * Validates that the object only has the specified keys.
   * The object must have all of the specified keys and no additional keys.
   *
   * @param keys - Array of keys that are allowed in the object
   * @param error - Custom error message to use when validation fails
   * @returns A new Guardian instance with the strictKeys validation applied
   *
   * @example
   * ```ts
   * const objGuard = ObjectGuardian.create().strictKeys(['name', 'age']);
   * objGuard({ name: 'John', age: 30 }); // Returns: { name: 'John', age: 30 }
   * objGuard({ name: 'John', age: 30, extra: true }); // Throws: "Expected object to only have keys: name, age"
   * objGuard({ name: 'John' }); // Throws: "Expected object to only have keys: name, age"
   * ```
   */
  public strictKeys(keys: string[], error?: string): GuardianProxy<this> {
    return this.test(
      (obj) => {
        const objKeys = Object.keys(obj);

        // Check that every specified key exists in the object
        const hasMissingKeys = keys.some((key) => !objKeys.includes(key));
        if (hasMissingKeys) return false;

        // Check that the object doesn't have any extra keys
        const hasExtraKeys = objKeys.some((key) => !keys.includes(key));
        if (hasExtraKeys) return false;

        // Both conditions passed
        return true;
      },
      error || `Expected object to only have keys: ${keys.join(', ')}`,
    );
  }

  /**
   * Validates that the object has a specific property.
   *
   * @param key - The property key to check for
   * @param error - Custom error message to use when validation fails
   * @returns A new Guardian instance with the hasProperty validation applied
   *
   * @example
   * ```ts
   * const objGuard = ObjectGuardian.create().hasProperty('name');
   * objGuard({ name: 'John' }); // Returns: { name: 'John' }
   * objGuard({ age: 30 }); // Throws: "Expected object to have property 'name'"
   * ```
   */
  public hasProperty(key: string, error?: string): GuardianProxy<this> {
    return this.test(
      (obj) => key in obj,
      error || `Expected object to have property '${key}'`,
    );
  }

  /**
   * Validates all values in the object using a guardian.
   *
   * @param valueGuardian - Guardian to validate each value with
   * @returns A new Guardian instance with the values validation applied
   *
   * @example
   * ```ts
   * const objGuard = ObjectGuardian.create().values(StringGuardian.create());
   * objGuard({ a: 'foo', b: 'bar' }); // Returns: { a: 'foo', b: 'bar' }
   * objGuard({ a: 'foo', b: 42 }); // Throws: "Expected string, got number (at 'b')"
   * ```
   */
  public values<V>(
    valueGuardian: FunctionType<V>,
    message?: string,
  ): GuardianProxy<ObjectGuardian<Record<string, V>>> {
    return this.transform((obj) => {
      const result: Record<string, V> = {};
      const errors = new GuardianError(
        {
          got: obj,
          expected: 'object with validated values',
          comparison: 'values',
        },
        message ?? 'Object value validation failed',
      );
      for (const [key, value] of Object.entries(obj)) {
        try {
          result[key] = valueGuardian(value);
        } catch (error) {
          if (error instanceof GuardianError) {
            errors.addCause(key, error);
          } else {
            errors.addCause(
              key,
              new GuardianError(
                {
                  got: value,
                  comparison: 'unhandled',
                },
                `Unexpected error validating value ${(error as Error).message}`,
              ),
            );
          }
        }
      }
      if (errors.causeSize() > 0) {
        throw errors;
      }
      return result;
    }) as unknown as GuardianProxy<ObjectGuardian<Record<string, V>>>;
  }

  /**
   * Validates that the object is empty (has no properties).
   *
   * @param error - Custom error message to use when validation fails
   * @returns A new Guardian instance with the empty validation applied
   *
   * @example
   * ```ts
   * const objGuard = ObjectGuardian.create().empty();
   * objGuard({}); // Returns: {}
   * objGuard({ name: 'John' }); // Throws: "Expected empty object"
   * ```
   */
  public empty(error?: string): GuardianProxy<this> {
    return this.test(
      (obj) => Object.keys(obj).length === 0,
      error || 'Expected empty object',
    );
  }

  /**
   * Validates that the object is not empty (has at least one property).
   *
   * @param error - Custom error message to use when validation fails
   * @returns A new Guardian instance with the notEmpty validation applied
   *
   * @example
   * ```ts
   * const objGuard = ObjectGuardian.create().notEmpty();
   * objGuard({ name: 'John' }); // Returns: { name: 'John' }
   * objGuard({}); // Throws: "Expected non-empty object"
   * ```
   */
  public notEmpty(error?: string): GuardianProxy<this> {
    return this.test(
      (obj) => Object.keys(obj).length > 0,
      error || 'Expected non-empty object',
    );
  }

  /**
   * Adds cross-field validation to an object by applying a custom refinement function.
   * The refinement function receives the validated object and can perform complex validations
   * that depend on relationships between multiple fields.
   *
   * @param refineFn - Function that receives the validated object and returns true if valid, or throws/returns false if invalid
   * @param message - Custom error message when refinement fails
   * @returns A new ObjectGuardian with the refinement applied
   *
   * @example
   * ```ts
   * // Date range validation
   * const eventGuard = Guardian.object().schema({
   *   startDate: Guardian.date(),
   *   endDate: Guardian.date(),
   *   title: Guardian.string()
   * }).refine(
   *   (event) => event.startDate < event.endDate,
   *   'Start date must be before end date'
   * );
   *
   * // Password confirmation
   * const signupGuard = Guardian.object().schema({
   *   email: Guardian.string().email(),
   *   password: Guardian.string().minLength(8),
   *   confirmPassword: Guardian.string()
   * }).refine(
   *   (data) => data.password === data.confirmPassword,
   *   'Password and confirm password must match'
   * );
   *
   * // Complex business rule
   * const orderGuard = Guardian.object().schema({
   *   items: Guardian.array().of(Guardian.object()),
   *   shippingAddress: Guardian.string().optional(),
   *   orderType: Guardian.string()
   * }).refine(
   *   (order) => {
   *     if (order.orderType === 'physical') {
   *       return order.shippingAddress !== undefined;
   *     }
   *     return true;
   *   },
   *   'Shipping address is required for physical orders'
   * );
   * ```
   */
  /**
   * Adds a custom refinement to the object validation.
   * Refinements allow for complex cross-field validations and business logic.
   *
   * @param refineFn - Function that takes the validated object and returns true if valid
   * @param message - Custom error message when refinement fails
   * @returns A new Guardian instance with the refinement applied
   *
   * @example
   * ```ts
   * const orderGuard = Guardian.object().schema({
   *   type: Guardian.string(),
   *   shippingAddress: Guardian.string().optional()
   * }).refine(
   *   (order) => {
   *     if (order.type === 'physical' && !order.shippingAddress) {
   *       return false;
   *     }
   *     return true;
   *   },
   *   'Shipping address is required for physical orders'
   * );
   * ```
   */
  public refine(
    refineFn: (value: T) => boolean,
    message?: string,
  ): GuardianProxy<ObjectGuardian<T>> {
    return this.transform((obj) => {
      // The object has already been validated by the base guardian
      const typedObj = obj as T;

      try {
        const isValid = refineFn(typedObj);
        if (!isValid) {
          throw new GuardianError(
            {
              got: obj,
              expected: 'object passing refinement validation',
              comparison: 'refine',
            },
            message || 'Object failed refinement validation',
          );
        }
      } catch (error) {
        if (error instanceof GuardianError) {
          throw error;
        }
        // If the refinement function throws, wrap it in a GuardianError
        throw new GuardianError(
          {
            got: obj,
            expected: 'object passing refinement validation',
            comparison: 'refine',
          },
          message ||
            `Refinement validation failed: ${(error as Error).message}`,
        );
      }

      return typedObj;
    }) as unknown as GuardianProxy<ObjectGuardian<T>>;
  }

  /**
   * Converts the ObjectGuardian to an OpenAPI schema object
   * @returns An OpenAPI schema representation of this ObjectGuardian
   */
  public openapi(): import('../types/OpenAPISchema.ts').ObjectOpenAPISchema {
    const schema: import('../types/OpenAPISchema.ts').ObjectOpenAPISchema = {
      type: 'object',
    };

    // Add metadata if available
    if (this.metadata.title) schema.title = this.metadata.title;
    if (this.metadata.description) {
      schema.description = this.metadata.description;
    }
    if (this.metadata.deprecated) schema.deprecated = this.metadata.deprecated;
    if (this.metadata.examples) schema.examples = this.metadata.examples;

    // TODO: Extract object schema from guardian function if possible
    // This is a basic implementation that could be enhanced with better introspection
    // to extract properties and required fields from the schema method calls

    return schema;
  }
}
