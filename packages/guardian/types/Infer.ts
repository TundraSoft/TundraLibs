import type { BaseGuardian } from '../BaseGuardian.ts';
import type { ObjectGuardian } from '../guards/ObjectGuardian.ts';

/**
 * Helper type to convert union types with undefined to optional properties
 */
type OptionalKeys<T> = {
  [K in keyof T]: undefined extends T[K] ? K : never;
}[keyof T];

type RequiredKeys<T> = {
  [K in keyof T]: undefined extends T[K] ? never : K;
}[keyof T];

/**
 * Convert a type with undefined unions to proper optional properties
 */
type MakeOptional<T> =
  & {
    [K in RequiredKeys<T>]: T[K];
  }
  & {
    [K in OptionalKeys<T>]?: Exclude<T[K], undefined>;
  };

/**
 * Type utility to infer the output type from a Guardian instance.
 * This represents the type after all validations and transformations are applied.
 * Properly handles optional properties and nested object types.
 *
 * @template T - The Guardian type to infer from
 *
 * @example
 * ```ts
 * const userSchema = Guardian.object({
 *   name: Guardian.string(),
 *   age: Guardian.number().optional(),
 *   profile: Guardian.object({
 *     bio: Guardian.string().optional()
 *   })
 * });
 *
 * type User = GuardianInfer<typeof userSchema>;
 * // Result: {
 * //   name: string;
 * //   age?: number;
 * //   profile: { bio?: string }
 * // }
 * ```
 */
export type GuardianInfer<T> = T extends BaseGuardian<infer U>
  ? U extends Record<string, unknown> ? MakeOptional<U>
  : U
  : never;

/**
 * Type utility to infer the input type for a Guardian instance.
 * This represents the type before any transformations are applied,
 * useful for understanding what raw data structure is expected.
 * Properly handles optional properties and nested object types.
 *
 * For ObjectGuardian, extracts the TInput generic parameter.
 * For other guardians, extracts the type before nested transformations.
 *
 * @template T - The Guardian type to infer from
 *
 * @example
 * ```ts
 * const schema = Guardian.object({
 *   name: Guardian.string(),
 *   age: Guardian.string()
 * }).transform((obj) => ({
 *   fullName: obj.name,
 *   ageNumber: parseInt(obj.age, 10)
 * }));
 *
 * type Input = GuardianInferInput<typeof schema>;
 * // Result: { name: string; age: string }
 * type Output = GuardianInfer<typeof schema>;
 * // Result: { fullName: string; ageNumber: number }
 * ```
 */
export type GuardianInferInput<T> = T extends
  ObjectGuardian<infer TInput, infer _TOutput>
  ? TInput extends Record<string, unknown> ? MakeOptional<
      {
        [K in keyof TInput]: TInput[K] extends BaseGuardian<infer V>
          ? GuardianInferInput<BaseGuardian<V>>
          : TInput[K];
      }
    >
  : TInput
  : T extends BaseGuardian<infer U>
    ? U extends Record<string, unknown> ? MakeOptional<
        {
          [K in keyof U]: U[K] extends BaseGuardian<infer V>
            ? GuardianInferInput<BaseGuardian<V>>
            : U[K];
        }
      >
    : U
  : never;
