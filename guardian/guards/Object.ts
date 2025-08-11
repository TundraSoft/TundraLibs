import { BaseGuardian } from '../BaseGuardian.ts';
import { GuardianError } from '../GuardianError.ts';
import type { FunctionType, GuardianProxy } from '../types/mod.ts';
import { getType } from '../helpers/mod.ts';

/**
 * Type representing a schema of property guardians
 */
export type ObjectSchema<
  T extends Record<string, unknown> = Record<string, unknown>,
> = {
  [K in keyof T]: FunctionType<T[K]>;
};

/**
 * ObjectGuardian provides validation utilities for object values.
 * It extends BaseGuardian to provide a chainable API for object validation.
 *
 * @example
 * ```ts
 * const userGuard = ObjectGuardian.create()
 *   .schema({
 *     name: StringGuardian.create(),
 *     age: NumberGuardian.create().min(0)
 *   });
 *
 * // Validate an object
 * const validUser = userGuard({ name: 'John', age: 30 }); // Returns: { name: 'John', age: 30 }
 * userGuard(null); // Throws: "Expected object, got null"
 * userGuard({ name: 'John', age: -5 }); // Throws: "Expected value to be greater than or equal to 0 (at 'age')"
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
   * Validates extra properties in strict mode
   */
  private validateExtraProperties(
    obj: Record<string, unknown>,
    schemaKeys: string[],
    errors: GuardianError,
    strict: boolean,
  ): void {
    if (strict) {
      const extraKeys = Object.keys(obj).filter(
        (key) => !schemaKeys.includes(key),
      );

      if (extraKeys.length > 0) {
        extraKeys.forEach((key) => {
          errors.addCause(
            key,
            new GuardianError(
              {
                got: obj[key],
                expected: schemaKeys,
                comparison: 'schema',
              },
              `Unexpected property '${key}' in strict mode`,
            ),
          );
        });
      }
    }
    // If strict=false, never throw errors for extra properties
    // The additionalProperties flag only controls copying, not validation
  }

  /**
   * Validates and transforms properties according to schema
   */
  private validateSchemaProperties<S extends Record<string, unknown>>(
    obj: Record<string, unknown>,
    schema: ObjectSchema<S>,
    schemaKeys: string[],
    errors: GuardianError,
    result: Record<string, unknown>,
  ): void {
    for (const key of schemaKeys) {
      const value = obj[key];
      const propertyGuardian = schema[key] as FunctionType<unknown>;

      try {
        result[key] = propertyGuardian(value);
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
  }

  /**
   * Copies additional properties if allowed
   */
  private copyAdditionalProperties(
    obj: Record<string, unknown>,
    schemaKeys: string[],
    result: Record<string, unknown>,
    strict: boolean,
    additionalProperties: boolean,
  ): void {
    if (!strict && additionalProperties) {
      for (const key of Object.keys(obj)) {
        if (!schemaKeys.includes(key)) {
          result[key] = obj[key];
        }
      }
    }
    // If strict=true or additionalProperties=false, don't copy extra properties
  }

  /**
   * Validates an object against a schema of property guardians.
   *
   * @param schema - An object mapping property names to guardians
   * @param options - Options for schema validation
   * @param options.strict - If true, throws errors for objects with properties not in schema
   * @param options.additionalProperties - If true (default), copies additional properties to result when strict=false
   * @param options.message - Custom error message for validation failure
   * @returns A new Guardian instance with the schema validation applied
   *
   * @example
   * ```ts
   * // strict=true: Throws on extra properties
   * const strictGuard = ObjectGuardian.create().schema({
   *   name: StringGuardian.create()
   * }, { strict: true });
   *
   * // strict=false, additionalProperties=false: Ignores extra properties (doesn't copy them)
   * const ignoreExtraGuard = ObjectGuardian.create().schema({
   *   name: StringGuardian.create()
   * }, { strict: false, additionalProperties: false });
   *
   * // strict=false, additionalProperties=true (default): Copies extra properties
   * const flexibleGuard = ObjectGuardian.create().schema({
   *   name: StringGuardian.create()
   * }, { strict: false, additionalProperties: true });
   * ```
   */
  public schema<S extends Record<string, unknown>>(
    schema: ObjectSchema<S>,
    options: {
      strict?: boolean; // If true, rejects objects with properties not in schema
      additionalProperties?: boolean; // If false (and strict is false), rejects objects with properties not in schema
      message?: string; // Custom error message for validation failure
    } = {},
  ): GuardianProxy<ObjectGuardian<S>> {
    const {
      strict = false,
      additionalProperties = true,
      message = 'Schema validation failed',
    } = options;

    return this.transform((obj: Record<string, unknown>) => {
      const result: Record<string, unknown> = {};
      const schemaKeys = Object.keys(schema);
      const errors = new GuardianError(
        {
          got: obj,
          expected: schemaKeys,
          comparison: 'schema',
        },
        message,
      );

      // Check for extra properties
      this.validateExtraProperties(
        obj,
        schemaKeys,
        errors,
        strict,
      );

      // Validate and transform properties according to schema
      this.validateSchemaProperties(obj, schema, schemaKeys, errors, result);

      // Copy additional properties
      this.copyAdditionalProperties(
        obj,
        schemaKeys,
        result,
        strict,
        additionalProperties,
      );

      if (errors.causeSize() > 0) {
        throw errors;
      }
      return result as S;
    }) as unknown as GuardianProxy<ObjectGuardian<S>>;
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
   * Ensures that specific properties in an object pass validation with a guardian.
   *
   * @param props - Object mapping property names to guardians
   * @returns A new Guardian instance with the property validation applied
   *
   * @example
   * ```ts
   * const objGuard = ObjectGuardian.create().properties({
   *   name: StringGuardian.create(),
   *   age: NumberGuardian.create().min(0)
   * });
   * objGuard({ name: 'John', age: 30 }); // Returns: { name: 'John', age: 30 }
   * objGuard({ name: 123, age: 30 }); // Throws: "Expected string, got number (at 'name')"
   * ```
   */
  public properties<P extends Partial<T>>(
    props: { [K in keyof P]: FunctionType<P[K]> },
    message?: string,
  ): GuardianProxy<this> {
    const result = this.transform((obj) => {
      const result: Record<string, unknown> = { ...obj };
      const errors = new GuardianError({
        got: obj,
        expected: Object.keys(props),
        comparison: 'properties',
      }, message ?? 'Validation failed for object properties');
      for (const [key, guardian] of Object.entries(props)) {
        // Skip if property doesn't exist
        if (!(key in obj)) continue;

        try {
          result[key] = guardian(obj[key]);
        } catch (error) {
          if (error instanceof GuardianError) {
            errors.addCause(key, error);
          } else {
            errors.addCause(
              key,
              new GuardianError(
                {
                  got: obj[key],
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
      return result as T;
    });

    // Add explicit type casting to resolve the type error
    return result as unknown as GuardianProxy<this>;
  }

  /**
   * Creates a new object with only the specified properties from the original.
   *
   * @param keys - Array of keys to pick from the object
   * @returns A new Guardian instance with the pick transformation applied
   *
   * @example
   * ```ts
   * const objGuard = ObjectGuardian.create().pick(['name', 'age']);
   * objGuard({ name: 'John', age: 30, extra: true }); // Returns: { name: 'John', age: 30 }
   * ```
   */
  public pick<K extends keyof T>(
    keys: K[],
  ): GuardianProxy<ObjectGuardian<Pick<T, K>>> {
    return this.transform((obj) => {
      const result: Record<string, unknown> = {} as Pick<T, K>;

      for (const key of keys) {
        if (key in obj) {
          result[key as string] = obj[key as keyof typeof obj];
        }
      }

      return result;
    }) as unknown as GuardianProxy<ObjectGuardian<Pick<T, K>>>;
  }

  /**
   * Creates a new object without the specified properties from the original.
   *
   * @param keys - Array of keys to omit from the object
   * @returns A new Guardian instance with the omit transformation applied
   *
   * @example
   * ```ts
   * const objGuard = ObjectGuardian.create().omit(['extra']);
   * objGuard({ name: 'John', age: 30, extra: true }); // Returns: { name: 'John', age: 30 }
   * ```
   */
  public omit<K extends keyof T>(
    keys: K[],
  ): GuardianProxy<ObjectGuardian<Omit<T, K>>> {
    return this.transform((obj) => {
      const result: Record<string, unknown> = {};

      for (const [key, value] of Object.entries(obj)) {
        if (!keys.includes(key as K)) {
          result[key] = value;
        }
      }

      return result as Omit<T, K>;
    }) as unknown as GuardianProxy<ObjectGuardian<Omit<T, K>>>;
  }

  /**
   * Transforms the validated object into a new guardian using a mapping function.
   * The mapper function must return a Guardian.object() instance.
   *
   * @param mapper - A function that transforms the source object to a new Guardian.object()
   * @returns The Guardian instance returned by the mapper function
   *
   * @example
   * ```ts
   * // Input profile type
   * type Profile = {
   *   name: string;
   *   dob: Date;
   *   email: string;
   *   address: string;
   * };
   *
   * // Map to API format with continued validation
   * const apiGuard = Guardian.object<Profile>().schema({
   *   name: Guardian.string(),
   *   dob: Guardian.date(),
   *   email: Guardian.string(),
   *   address: Guardian.string()
   * }).mutate(profile => {
   *   // Create transformed data
   *   const nameParts = profile.name.split(' ');
   *   const firstName = nameParts[0];
   *   const lastName = nameParts.slice(1).join(' ');
   *   const age = Math.floor((new Date().getTime() - profile.dob.getTime()) / 31557600000);
   *   const addressParts = profile.address.split(',').map(p => p.trim());
   *
   *   // Return a new Guardian.object() with validation
   *   return Guardian.object().schema({
   *     FirstName: Guardian.string().minLength(1),
   *     LastName: Guardian.string(),
   *     DOB: Guardian.date(),
   *     Age: Guardian.number().min(0),
   *     Contact: Guardian.object().schema({
   *       Email: Guardian.string(),
   *       Address: Guardian.object().schema({
   *         Line1: Guardian.string(),
   *         Line2: Guardian.string().optional()
   *       })
   *     })
   *   })({
   *     FirstName: firstName,
   *     LastName: lastName,
   *     DOB: profile.dob,
   *     Age: age,
   *     Contact: {
   *       Email: profile.email,
   *       Address: {
   *         Line1: addressParts[0] || '',
   *         Line2: addressParts[1] || undefined
   *       }
   *     }
   *   });
   * });
   * ```
   */
  public mutate<R extends Record<string, unknown>>(
    mapper: (source: T) => R,
  ): GuardianProxy<ObjectGuardian<R>> {
    return this.transform((obj) => {
      // Call the mapper function to get the transformed object
      return mapper(obj as T);
    }) as unknown as GuardianProxy<ObjectGuardian<R>>;
  }

  /**
   * Extends the current ObjectGuardian with additional properties from another ObjectGuardian.
   * The result type combines both schemas using TypeScript intersection types.
   *
   * @param extension - Another ObjectGuardian to extend this one with
   * @returns A new ObjectGuardian with the combined type
   *
   * @example
   * ```ts
   * const baseGuard = Guardian.object().schema({
   *   id: Guardian.number(),
   *   name: Guardian.string()
   * });
   *
   * const contactGuard = Guardian.object().schema({
   *   email: Guardian.string(),
   *   phone: Guardian.string().optional()
   * });
   *
   * const extendedGuard = baseGuard.extend(contactGuard);
   * // Result type: { id: number, name: string } & { email: string, phone?: string }
   *
   * const result = extendedGuard({
   *   id: 123,
   *   name: 'John',
   *   email: 'john@example.com'
   * });
   * ```
   */
  public extend<E extends Record<string, unknown>>(
    extension: GuardianProxy<ObjectGuardian<E>>,
  ): GuardianProxy<ObjectGuardian<T & E>> {
    return this.transform((obj) => {
      // First, the object is validated by the base guardian (this)
      // Now we need to validate it with the extension guardian and merge results
      const extensionResult = extension(obj);

      // Merge the base result with the extension result
      return { ...obj, ...extensionResult } as T & E;
    }) as unknown as GuardianProxy<ObjectGuardian<T & E>>;
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
}
