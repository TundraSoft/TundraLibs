import {
  ArrayGuardian,
  BigIntGuardian,
  BooleanGuardian,
  DateGuardian,
  EnumGuardian,
  NumberGuardian,
  ObjectGuardian,
  StringGuardian,
  UnknownGuardian,
} from "./guards/mod.ts";
import type { BaseGuardian } from "./BaseGuardian.ts";
import type { ObjectSchema } from "./guards/ObjectGuardian.ts";
import type {
  GuardianInfer,
  GuardianInferInput,
  GuardianMetaData,
} from "./types/mod.ts";
import { GuardianError } from "./GuardianError.ts";

/**
 * Guardian factory class providing static methods to create validators.
 * This is the main entry point for the Guardian validation library.
 *
 * @example
 * ```ts
 * import { Guardian } from '@tundralibs/guardian';
 *
 * const stringSchema = Guardian.string().minLength(3).maxLength(10);
 * const numberSchema = Guardian.number().positive().integer();
 *
 * const user = Guardian.object({
 *   name: Guardian.string().nonEmpty(),
 *   age: Guardian.number().min(0).max(120).integer(),
 *   email: Guardian.string(),
 * });
 *
 * // Type inference
 * type User = Guardian.infer<typeof user>;
 * type UserInput = Guardian.inferInput<typeof user>;
 * ```
 *
 * @since 1.0.0
 */
export class Guardian {
  /**
   * Type utility to infer the output type from a Guardian instance.
   *
   * @example
   * ```ts
   * const schema = Guardian.object({ name: Guardian.string() });
   * type Output = Guardian.infer<typeof schema>; // { name: string }
   * ```
   */
  static infer<T extends BaseGuardian<unknown>>(
    _guardian: T,
  ): GuardianInfer<T> {
    throw new Error(
      "Guardian.infer is a type-only utility and should not be called at runtime",
    );
  }

  /**
   * Type utility to infer the input type for a Guardian instance.
   *
   * @example
   * ```ts
   * const schema = Guardian.string().transform(s => parseInt(s));
   * type Input = Guardian.inferInput<typeof schema>; // string
   * type Output = Guardian.infer<typeof schema>; // number
   * ```
   */
  static inferInput<T extends BaseGuardian<unknown>>(
    _guardian: T,
  ): GuardianInferInput<T> {
    throw new Error(
      "Guardian.inferInput is a type-only utility and should not be called at runtime",
    );
  }

  /**
   * Runtime utility to get the type information from a guardian.
   * Useful for debugging and runtime type introspection.
   *
   * @param guardian - Guardian instance to inspect
   * @returns Type information string
   *
   * @example
   * ```ts
   * const schema = Guardian.string().minLength(3);
   * const typeInfo = Guardian.type(schema); // "StringGuardian"
   * ```
   */
  static type(guardian: BaseGuardian<unknown>): string {
    return guardian.constructor.name;
  }
  /**
   * Creates a string validator.
   *
   * @param metaData - Optional metadata for the validator
   * @returns New StringGuardian instance
   *
   * @example
   * ```ts
   * const schema = Guardian.string()
   *   .minLength(3)
   *   .maxLength(50)
   *   .regex(/^[a-zA-Z]+$/);
   *
   * const result = schema.parse('hello'); // 'hello'
   * ```
   */
  static string(metaData?: GuardianMetaData): StringGuardian {
    return new StringGuardian(metaData);
  }

  /**
   * Creates a number validator.
   *
   * @param metaData - Optional metadata for the validator
   * @returns New NumberGuardian instance
   *
   * @example
   * ```ts
   * const schema = Guardian.number()
   *   .positive()
   *   .integer()
   *   .max(100);
   *
   * const result = schema.parse(42); // 42
   * ```
   */
  static number(metaData?: GuardianMetaData): NumberGuardian {
    return new NumberGuardian(metaData);
  }

  /**
   * Creates a validator that accepts values matching any of the provided guardians.
   * Tries each guardian in order and returns the result from the first successful validation.
   * The error message is mandatory to clearly communicate what types are expected.
   *
   * @template T - Array of guardian types
   * @param guardians - Array of guardians to try in order
   * @param errorMessage - Mandatory error message describing what types are expected
   * @param metaData - Optional metadata for the validator
   * @returns New UnknownGuardian with oneOf validation logic
   *
   * @example
   * ```ts
   * const userIdOrEmail = Guardian.oneOf([
   *   Guardian.number().positive().integer(),
   *   Guardian.string().regex(/^[^@]+@[^@]+$/)
   * ], 'UserId or Email is required');
   *
   * userIdOrEmail.parse(123); // 123
   * userIdOrEmail.parse('user@example.com'); // 'user@example.com'
   * userIdOrEmail.parse('invalid'); // throws GuardianError: UserId or Email is required
   * ```
   */
  static oneOf<T extends readonly BaseGuardian<unknown>[]>(
    guardians: T,
    errorMessage: string,
    metaData?: GuardianMetaData,
  ): UnknownGuardian<T[number] extends BaseGuardian<infer U> ? U : never> {
    if (!guardians || guardians.length === 0) {
      throw new Error("oneOf requires at least one guardian");
    }
    if (!errorMessage || errorMessage.trim().length === 0) {
      throw new Error("oneOf requires a non-empty error message");
    }

    return new UnknownGuardian(metaData).process(
      (input: unknown) => {
        const errors: GuardianError[] = [];

        // Try each guardian in order
        for (let i = 0; i < guardians.length; i++) {
          const guardian = guardians[i];
          if (!guardian) continue;

          try {
            return guardian.parse(input);
          } catch (error) {
            if (error instanceof GuardianError) {
              errors.push(error);
            } else {
              errors.push(
                new GuardianError(`Guardian ${i} threw unexpected error`, {
                  got: input,
                  expected: "valid input for one of the oneOf members",
                  comparison: "oneOf",
                  type: "oneOf_validation",
                }),
              );
            }
          }
        }

        // If we get here, none of the guardians succeeded
        throw new GuardianError(errorMessage, {
          got: input,
          expected: "value matching one of the oneOf types",
          comparison: "oneOf",
          type: "oneOf_validation",
          cause: errors.reduce((acc, error, index) => {
            acc[`option_${index}`] = error;
            return acc;
          }, {} as Record<string, GuardianError>),
        });
      },
    ) as UnknownGuardian<T[number] extends BaseGuardian<infer U> ? U : never>;
  }

  /**
   * Creates an array validator.
   *
   * @template T - The element type of the array (defaults to unknown)
   * @param elementGuardian - Optional guardian to validate each element
   * @param metaData - Optional metadata for the validator
   * @returns New ArrayGuardian instance
   *
   * @example
   * ```ts
   * // Array of unknown elements
   * const anyArray = Guardian.array().minLength(1);
   * anyArray.parse([1, 'hello', true]); // [1, 'hello', true]
   *
   * // Array with typed elements
   * const stringArray = Guardian.array(Guardian.string().minLength(3))
   *   .minLength(1)
   *   .maxLength(10);
   * stringArray.parse(['hello', 'world']); // ['hello', 'world']
   * ```
   */
  static array<T = unknown>(elementGuardian?: BaseGuardian<T>, metaData?: GuardianMetaData): ArrayGuardian<T> {
    return new ArrayGuardian<T>(elementGuardian, metaData);
  }

  /**
   * Creates an unknown guardian that accepts any value without validation.
   *
   * @template T - The expected type (defaults to unknown)
   * @param metaData - Optional metadata for the guardian
   * @returns A new UnknownGuardian instance
   *
   * @example
   * ```ts
   * const anyValue = Guardian.unknown();
   * anyValue.parse('hello'); // 'hello'
   * anyValue.parse(42); // 42
   * anyValue.parse(null); // null
   * anyValue.parse({ foo: 'bar' }); // { foo: 'bar' }
   *
   * // With transformations
   * const stringified = Guardian.unknown().toStringValue();
   * stringified.parse({ name: 'John' }); // '{"name":"John"}'
   * ```
   */
  static unknown<T = unknown>(metaData?: GuardianMetaData): UnknownGuardian<T> {
    return new UnknownGuardian<T>(metaData);
  }

  /**
   * Creates a boolean validator.
   *
   * @param metaData - Optional metadata for the validator
   * @returns New BooleanGuardian instance
   *
   * @example
   * ```ts
   * const schema = Guardian.boolean().true();
   * const result = schema.parse(true); // true
   * ```
   */
  static boolean(metaData?: GuardianMetaData): BooleanGuardian {
    return new BooleanGuardian(metaData);
  }

  /**
   * Creates a date validator.
   *
   * @param metaData - Optional metadata for the validator
   * @returns New DateGuardian instance
   *
   * @example
   * ```ts
   * const schema = Guardian.date()
   *   .min(new Date('2020-01-01'))
   *   .max(new Date('2030-12-31'));
   * const result = schema.parse(new Date()); // current date
   * ```
   */
  static date(metaData?: GuardianMetaData): DateGuardian {
    return new DateGuardian(metaData);
  }

  /**
   * Creates a BigInt validator.
   *
   * @param metaData - Optional metadata for the validator
   * @returns New BigIntGuardian instance
   *
   * @example
   * ```ts
   * const schema = Guardian.bigint().positive().min(0n);
   * const result = schema.parse(42n); // 42n
   * ```
   */
  static bigint(metaData?: GuardianMetaData): BigIntGuardian {
    return new BigIntGuardian(metaData);
  }

  /**
   * Creates an enum validator that accepts only values from the provided list.
   * This is the preferred way to handle literal values and enums.
   *
   * @template T - The enum/literal type
   * @param allowedValues - Array of allowed enum values or literals
   * @param metaData - Optional metadata for the validator
   * @returns New EnumGuardian instance
   *
   * @example
   * ```ts
   * // TypeScript enum
   * enum Color { Red = 'red', Green = 'green', Blue = 'blue' }
   * const colorSchema = Guardian.enum(Object.values(Color));
   * colorSchema.parse('red'); // 'red'
   *
   * // String literals
   * const statusSchema = Guardian.enum(['pending', 'approved', 'rejected'] as const);
   * statusSchema.parse('pending'); // 'pending'
   *
   * // Number literals
   * const prioritySchema = Guardian.enum([1, 2, 3, 4, 5] as const);
   * prioritySchema.parse(3); // 3
   * ```
   */
  static enum<T>(
    allowedValues: readonly T[],
    metaData?: GuardianMetaData,
  ): EnumGuardian<T> {
    return new EnumGuardian(allowedValues, metaData);
  }

  /**
   * Creates an object validator with optional schema definition.
   * Supports strict validation, passthrough mode, and shape transformation.
   *
   * @template T - The object type defined by the schema
   * @param schema - Optional object schema defining property validators
   * @param metaData - Optional metadata for the validator
   * @returns New ObjectGuardian instance
   *
   * @example
   * ```ts
   * // Defined schema (passthrough mode by default)
   * const userSchema = Guardian.object({
   *   id: Guardian.number(),
   *   name: Guardian.string(),
   *   email: Guardian.string().optional()
   * });
   *
   * // Strict mode - only defined properties allowed
   * const strictUser = Guardian.object({
   *   id: Guardian.number(),
   *   name: Guardian.string()
   * }).strict();
   *
   * // Anonymous object - accepts any object structure
   * const anyObject = Guardian.object();
   * ```
   *
   * @example
   * ```ts
   * // Shape transformation
   * const transformedUser = Guardian.object({
   *   firstName: Guardian.string(),
   *   lastName: Guardian.string()
   * }).transform((data) => ({
   *   fullName: `${data.firstName} ${data.lastName}`
   * }));
   * ```
   */
  static object<T extends Record<string, unknown> = Record<string, unknown>>(
    schema?: ObjectSchema<T>,
    metaData?: GuardianMetaData,
  ): ObjectGuardian<T> {
    return new ObjectGuardian(schema, metaData);
  }
}
