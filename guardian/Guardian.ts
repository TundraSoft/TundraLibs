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
} from './guards/mod.ts';
import type { ObjectSchema } from './guards/ObjectGuardian.ts';
import type { GuardianMetaData } from './types/mod.ts';

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
 *   email: Guardian.string().email().optional(),
 * });
 * ```
 *
 * @since 1.0.0
 */
export class Guardian {
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
   * Creates a string validator that accepts only literal values.
   *
   * @param values - Array of allowed literal string values
   * @param metaData - Optional metadata for the validator
   * @returns New StringGuardian with literal validation
   *
   * @example
   * ```ts
   * const status = Guardian.literal(['pending', 'approved', 'rejected']);
   * status.parse('pending'); // 'pending'
   * status.parse('invalid'); // throws GuardianError
   * ```
   */
  static literal(
    values: readonly string[],
    metaData?: GuardianMetaData,
  ): StringGuardian {
    const stringGuardian = new StringGuardian(metaData);
    return stringGuardian.step((value: string) => {
      if (!values.includes(value)) {
        throw new Error(
          `Expected one of [${values.join(', ')}] but got: ${value}`,
        );
      }
      return value;
    }, `Literal validation: [${values.join(', ')}]`) as StringGuardian;
  }

  // Note: The following methods are placeholders for future implementation
  // They are included here for API completeness but will throw errors when called

  /**
   * @internal
   * @deprecated Not yet implemented
   */
  static union<T extends readonly unknown[]>(
    _validators: { [K in keyof T]: T[K] },
  ): never {
    throw new Error('Union validators not yet implemented');
  }

  /**
   * @internal
   * @deprecated Not yet implemented
   */
  static optional<T>(_validator: unknown): never {
    throw new Error('Optional validators not yet implemented');
  }

  /**
   * @internal
   * @deprecated Not yet implemented
   */
  static nullable<T>(_validator: unknown): never {
    throw new Error('Nullable validators not yet implemented');
  }

  /**
   * Creates an array validator.
   *
   * @template T - The element type of the array (defaults to unknown)
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
   * const stringArray = Guardian.array()
   *   .of(Guardian.string().minLength(3))
   *   .minLength(1)
   *   .maxLength(10);
   * stringArray.parse(['hello', 'world']); // ['hello', 'world']
   * ```
   */
  static array<T = unknown>(metaData?: GuardianMetaData): ArrayGuardian<T> {
    return new ArrayGuardian<T>(metaData);
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
   * Creates an enum validator.
   *
   * @template T - The enum type
   * @param allowedValues - Array of allowed enum values
   * @param metaData - Optional metadata for the validator
   * @returns New EnumGuardian instance
   *
   * @example
   * ```ts
   * enum Color { Red = 'red', Green = 'green', Blue = 'blue' }
   * const schema = Guardian.enum(Object.values(Color));
   * const result = schema.parse('red'); // 'red'
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
