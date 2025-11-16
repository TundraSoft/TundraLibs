import { BaseGuardian } from '../BaseGuardian.ts';
import { GuardianError } from '../GuardianError.ts';
import type { GuardianMetaData, GuardianTransform } from '../types/mod.ts';

/**
 * Guardian for unknown/any values - accepts any input without validation.
 *
 * This guardian is useful when you need to accept any value in your schema,
 * similar to TypeScript's `unknown` type. It performs no validation and
 * simply passes through whatever value is provided.
 *
 * @template T - The output type (defaults to unknown)
 *
 * @example
 * ```ts
 * const anyValue = Guardian.unknown();
 * anyValue.parse('hello'); // 'hello'
 * anyValue.parse(42); // 42
 * anyValue.parse(null); // null
 * anyValue.parse(undefined); // undefined
 * anyValue.parse({ foo: 'bar' }); // { foo: 'bar' }
 * ```
 *
 * @example With transformations
 * ```ts
 * const stringified = Guardian.unknown()
 *   .mutate(value => JSON.stringify(value));
 *
 * stringified.parse({ name: 'John' }); // '{"name":"John"}'
 * stringified.parse([1, 2, 3]); // '[1,2,3]'
 * ```
 *
 * @since 1.0.0
 */
export class UnknownGuardian<T = unknown> extends BaseGuardian<T> {
  /**
   * Creates a new UnknownGuardian instance.
   *
   * @param metaData - Optional metadata for documentation and tooling
   */
  constructor(metaData?: GuardianMetaData) {
    // Pass-through transform that accepts any value
    const initialTransform: GuardianTransform<unknown, T> = (
      input: unknown,
    ) => {
      return input as T;
    };

    super(initialTransform, metaData);
  }

  /**
   * Transforms the unknown value to a string representation.
   * Uses JSON.stringify for objects, toString() for primitives.
   *
   * @param message - Optional custom error message for transformation failures
   * @returns A new Guardian instance that outputs strings
   *
   * @example
   * ```ts
   * const stringified = Guardian.unknown().toStringValue();
   * stringified.parse(42); // '42'
   * stringified.parse({ name: 'John' }); // '{"name":"John"}'
   * stringified.parse([1, 2, 3]); // '[1,2,3]'
   * ```
   */
  toStringValue(message?: string): BaseGuardian<string> {
    return this.mutate((value: T) => {
      try {
        if (value === null) return 'null';
        if (value === undefined) return 'undefined';
        if (typeof value === 'string') return value;
        if (typeof value === 'number' || typeof value === 'boolean') {
          return String(value);
        }
        if (typeof value === 'bigint') return value.toString();
        if (typeof value === 'symbol') return value.toString();
        if (typeof value === 'function') return value.toString();

        // For objects and arrays, use JSON.stringify
        return JSON.stringify(value);
      } catch {
        throw new Error(
          message || 'Failed to convert value to string',
        );
      }
    }, 'Convert to string');
  }

  /**
   * Transforms the unknown value to a JSON string.
   *
   * @param message - Optional custom error message for JSON serialization failures
   * @returns A new Guardian instance that outputs JSON strings
   *
   * @example
   * ```ts
   * const jsonified = Guardian.unknown().toJSON();
   * jsonified.parse({ name: 'John' }); // '{"name":"John"}'
   * jsonified.parse([1, 2, 3]); // '[1,2,3]'
   * ```
   */
  toJSON(message?: string): BaseGuardian<string> {
    return this.mutate((value: T) => {
      try {
        return JSON.stringify(value);
      } catch {
        throw new Error(); // Just throw any error, mutate will wrap it
      }
    }, message || 'Failed to serialize value to JSON');
  }

  /**
   * Applies a type guard function to narrow the type.
   * Useful for runtime type checking when you know more about the expected structure.
   *
   * @template U - The narrowed type
   * @param guard - Type guard function that returns true if value is of type U
   * @param message - Optional custom error message
   * @returns A new Guardian instance with the narrowed type
   *
   * @example
   * ```ts
   * const isString = (value: unknown): value is string => typeof value === 'string';
   * const stringGuard = Guardian.unknown().narrow(isString);
   * stringGuard.parse('hello'); // 'hello' (typed as string)
   * stringGuard.parse(42); // throws error
   * ```
   */
  narrow<U>(
    guard: (value: unknown) => value is U,
    message?: string,
  ): BaseGuardian<U> {
    return this.step(
      (value: T) => {
        if (!guard(value)) {
          throw new Error(); // Just throw any error, step will wrap it
        }
        return value as U;
      },
      message || 'Value failed type guard validation',
      'custom',
    ) as BaseGuardian<U>;
  }

  /**
   * Applies a type guard assertion to cast the value to a specific type.
   * This is useful when you know the value should be of a certain type at runtime.
   *
   * @template U - The target type
   * @param typeGuard - Type guard function that returns true if value is of type U
   * @param description - Optional description of the type assertion
   * @returns A new Guardian instance with the asserted type
   *
   * @example
   * ```ts
   * const isString = (value: unknown): value is string => typeof value === 'string';
   * const stringGuard = Guardian.unknown().as(isString);
   * stringGuard.parse('hello'); // 'hello' (typed as string)
   * stringGuard.parse(42); // throws error
   * ```
   */
  as<U>(
    typeGuard: (value: unknown) => value is U,
    description?: string,
  ): BaseGuardian<U> {
    return this.mutate((value: T) => {
      if (!typeGuard(value)) {
        throw new Error(); // Just throw any error, mutate will wrap it
      }
      return value;
    }, description || 'Type guard assertion failed') as BaseGuardian<U>;
  }

  /**
   * Checks if the value is null or undefined.
   *
   * @returns A new Guardian instance that validates nullish values
   *
   * @example
   * ```ts
   * const nullish = Guardian.unknown().nullish();
   * nullish.parse(null); // null
   * nullish.parse(undefined); // undefined
   * nullish.parse('hello'); // throws error
   * ```
   */
  nullish(): BaseGuardian<null | undefined> {
    return this.narrow(
      (value: unknown): value is null | undefined => value == null,
      'Expected null or undefined',
    );
  }

  /**
   * Checks if the value is not null and not undefined.
   *
   * @returns A new Guardian instance that validates non-nullish values
   *
   * @example
   * ```ts
   * const nonNullish = Guardian.unknown().nonNullish();
   * nonNullish.parse('hello'); // 'hello'
   * nonNullish.parse(42); // 42
   * nonNullish.parse(null); // throws error
   * ```
   */
  nonNullish(): BaseGuardian<NonNullable<T>> {
    return this.mutate((value: T) => {
      if (value == null) {
        throw new Error(); // Just throw any error, mutate will wrap it
      }
      return value as NonNullable<T>;
    }, 'Expected non-nullish value, got null or undefined');
  }
}
