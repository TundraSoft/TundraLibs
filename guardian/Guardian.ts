import {
  ArrayGuardian,
  BigIntGuardian,
  BooleanGuardian,
  DateGuardian,
  FunctionGuardian,
  NumberGuardian,
  ObjectGuardian,
  StringGuardian,
} from './guards/mod.ts';
import type { GuardianProxy } from './types/mod.ts';
import type { GuardianType } from './types/GuardianType.ts';
import { GuardianError } from './GuardianError.ts';

/**
 * Main entry point to access all guardian types.
 *
 * Guardian provides static methods to create instances of different guardians
 * for validating various data types.
 *
 * @example
 * ```ts
 * // String validation
 * const validString = Guardian.string().min(3).max(10);
 * validString('hello'); // Returns: 'hello'
 *
 * // Object validation with schema
 * const userGuard = Guardian.object().schema({
 *   name: Guardian.string(),
 *   age: Guardian.number().min(0),
 *   email: Guardian.string().optional()
 * });
 *
 * // Array validation
 * const stringArray = Guardian.array().of(Guardian.string());
 * ```
 */
export class Guardian {
  /**
   * Creates a string guardian for validating string values
   *
   * @param error - Custom error message when validation fails
   * @returns A string guardian instance
   */
  static string(error?: string): GuardianProxy<StringGuardian> {
    return StringGuardian.create(error);
  }

  /**
   * Creates a number guardian for validating number values
   *
   * @param error - Custom error message when validation fails
   * @returns A number guardian instance
   */
  static number(error?: string): GuardianProxy<NumberGuardian> {
    return NumberGuardian.create(error);
  }

  /**
   * Creates a bigint guardian for validating bigint values
   *
   * @param error - Custom error message when validation fails
   * @returns A bigint guardian instance
   */
  static bigint(error?: string): GuardianProxy<BigIntGuardian> {
    return BigIntGuardian.create(error);
  }

  /**
   * Creates a boolean guardian for validating boolean values
   *
   * @param error - Custom error message when validation fails
   * @returns A boolean guardian instance
   */
  static boolean(error?: string): GuardianProxy<BooleanGuardian> {
    return BooleanGuardian.create(error);
  }

  /**
   * Creates an array guardian for validating array values
   *
   * @param error - Custom error message when validation fails
   * @returns An array guardian instance
   */
  static array<T = unknown>(error?: string): GuardianProxy<ArrayGuardian<T>> {
    return ArrayGuardian.create<T>(error);
  }

  /**
   * Creates an object guardian for validating object values
   *
   * @param error - Custom error message when validation fails
   * @returns An object guardian instance
   */
  static object<T extends Record<string, unknown> = Record<string, unknown>>(
    error?: string,
  ): GuardianProxy<ObjectGuardian<T>> {
    return ObjectGuardian.create<T>(error);
  }

  /**
   * Creates a function guardian for validating function values
   *
   * @param error - Custom error message when validation fails
   * @returns A function guardian instance
   */
  static function<T extends (...args: any[]) => any>(
    error?: string,
  ): GuardianProxy<FunctionGuardian<T>> {
    return FunctionGuardian.create<T>(error);
  }

  /**
   * Creates a guardian that accepts values matching any of the provided guardians.
   * Useful for validating union types.
   *
   * @param guardians - Array of guardians to try (in order)
   * @param error - Custom error message when all validations fail
   * @returns A function that validates against any of the provided guardians
   *
   * @example
   * ```ts
   * // Value can be either a string or a number
   * const stringOrNumber = Guardian.oneOf([
   *   Guardian.string(),
   *   Guardian.number()
   * ]);
   *
   * stringOrNumber('hello'); // Returns: 'hello'
   * stringOrNumber(42); // Returns: 42
   * stringOrNumber(true); // Throws error: Expected value to match one of the types: string, number
   *
   * // More complex example: user ID can be string or number
   * const userGuard = Guardian.object().schema({
   *   id: Guardian.oneOf([Guardian.string(), Guardian.number()]),
   *   name: Guardian.string()
   * });
   * ```
   */
  static oneOf<T extends unknown[]>(
    guardians: { [K in keyof T]: (value: unknown) => T[K] },
    error?: string,
  ): (value: unknown) => T[number] {
    if (!Array.isArray(guardians) || guardians.length === 0) {
      throw new Error('At least one guardian must be provided to oneOf');
    }

    return (value: unknown): T[number] => {
      const errors: Error[] = [];

      // Try each guardian in sequence
      for (const guardian of guardians) {
        try {
          return guardian(value);
        } catch (err) {
          errors.push(err instanceof Error ? err : new Error(String(err)));
        }
      }

      // If we get here, all guardians failed
      const expectedTypes = errors
        .map((err) => {
          if (err instanceof GuardianError && err.expected) {
            return err.expected;
          }
          return err.message.replace(
            /^Expected .+, got .+$/,
            (match) => match.replace(/^Expected (.+), got .+$/, '$1'),
          );
        })
        .filter(Boolean);

      throw new GuardianError(
        {
          got: value,
          expected: expectedTypes,
          comparison: 'oneOf',
        },
        error ||
          `Expected value to match one of the types: ${
            expectedTypes.join(', ')
          }`,
      );
    };
  }

  /**
   * Creates a date guardian for validating date values
   *
   * @param error - Custom error message when validation fails
   * @returns A date guardian instance
   */
  static date(error?: string): GuardianProxy<DateGuardian> {
    return DateGuardian.create(error);
  }

  /**
   * Creates a custom guardian with a validation function
   *
   * @param validator - Function that validates the input
   * @returns The same function wrapped as a guardian
   */
  static custom<T>(validator: (value: unknown) => T): (value: unknown) => T {
    return validator;
  }

  /**
   * Type utility to extract the validated type from any guardian
   *
   * @example
   * ```ts
   * const userGuard = Guardian.object().schema({
   *   name: Guardian.string(),
   *   age: Guardian.number()
   * });
   *
   * type User = Guardian.GuardianType<typeof userGuard>; // { name: string; age: number }
   * ```
   */
  static type<G>(guardian: G): GuardianType<G> {
    return undefined as unknown as GuardianType<G>;
  }
}
