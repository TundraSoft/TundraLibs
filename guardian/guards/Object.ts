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
   * Validates an object against a schema of property guardians.
   *
   * @param schema - An object mapping property names to guardians
   * @param options - Options for schema validation
   * @returns A new Guardian instance with the schema validation applied
   *
   * @example
   * ```ts
   * const userGuard = ObjectGuardian.create().schema({
   *   name: StringGuardian.create(),
   *   age: NumberGuardian.create().min(0)
   * });
   * const user = userGuard({ name: 'John', age: 30 }); // Returns: { name: 'John', age: 30 }
   * ```
   */
  public schema<S extends Record<string, unknown>>(
    schema: ObjectSchema<S>,
    options: {
      strict?: boolean; // If true, rejects objects with properties not in schema
      additionalProperties?: boolean; // If false (and strict is false), rejects objects with properties not in schema
    } = {},
  ): GuardianProxy<ObjectGuardian<S>> {
    const { strict = false, additionalProperties = true } = options;

    return this.transform((obj) => {
      const result: Record<string, unknown> = {};
      const schemaKeys = Object.keys(schema);

      // Check for extra properties
      if (strict || !additionalProperties) {
        const extraKeys = Object.keys(obj).filter(
          (key) => !schemaKeys.includes(key),
        );

        if (extraKeys.length > 0) {
          throw new GuardianError(
            {
              got: extraKeys,
              expected: schemaKeys,
              comparison: 'schema',
            },
            `Unexpected properties: ${extraKeys.join(', ')}`,
          );
        }
      }

      // Validate and transform properties according to schema
      for (const key of schemaKeys) {
        const value = obj[key];
        const propertyGuardian = schema[key]!;

        try {
          result[key] = propertyGuardian(value);
        } catch (error) {
          if (error instanceof GuardianError) {
            error.context.key = error.context.key
              ? `${key}.${error.context.key}`
              : key;
            error.context.path = error.context.path || '';
          }
          throw error;
        }
      }

      // Copy additional properties
      if (!strict && additionalProperties) {
        for (const key of Object.keys(obj)) {
          if (!schemaKeys.includes(key)) {
            result[key] = obj[key];
          }
        }
      }

      return result as S;
    }) as unknown as GuardianProxy<ObjectGuardian<S>>;
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
  ): GuardianProxy<ObjectGuardian<Record<string, V>>> {
    return this.transform((obj) => {
      const result: Record<string, V> = {};

      for (const [key, value] of Object.entries(obj)) {
        try {
          result[key] = valueGuardian(value);
        } catch (error) {
          if (error instanceof GuardianError) {
            error.context.key = key;
          }
          throw error;
        }
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
  ): GuardianProxy<this> {
    const result = this.transform((obj) => {
      const result: Record<string, unknown> = { ...obj };

      for (const [key, guardian] of Object.entries(props)) {
        // Skip if property doesn't exist
        if (!(key in obj)) continue;

        try {
          result[key] = guardian(obj[key]);
        } catch (error) {
          if (error instanceof GuardianError) {
            error.context.key = key;
          }
          throw error;
        }
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
}
