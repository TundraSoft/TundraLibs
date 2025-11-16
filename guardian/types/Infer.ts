import type { BaseGuardian } from '../BaseGuardian.ts';

/**
 * Type utility to infer the output type from a Guardian instance.
 * This represents the type after all validations and transformations are applied.
 *
 * @template T - The Guardian type to infer from
 *
 * @example
 * ```ts
 * const userSchema = Guardian.object({
 *   name: Guardian.string(),
 *   age: Guardian.number().transform(n => n.toString())
 * });
 *
 * type User = Guardian.infer<typeof userSchema>;
 * // Result: { name: string; age: string }
 * ```
 */
export type GuardianInfer<T> = T extends BaseGuardian<infer U> ? U : never;

/**
 * Type utility to infer the input type for a Guardian instance.
 * This represents the type before any transformations are applied,
 * useful for understanding what raw data structure is expected.
 *
 * @template T - The Guardian type to infer from
 *
 * @example
 * ```ts
 * const schema = Guardian.object({
 *   name: Guardian.string(),
 *   age: Guardian.string().transform(s => parseInt(s, 10))
 * });
 *
 * type Input = Guardian.inferInput<typeof schema>;
 * // Result: { name: string; age: string }
 * type Output = Guardian.infer<typeof schema>;
 * // Result: { name: string; age: number }
 * ```
 */
export type GuardianInferInput<T> = T extends BaseGuardian<infer U>
  ? U extends Record<string, unknown> ? {
      [K in keyof U]: U[K] extends BaseGuardian<infer V>
        ? GuardianInferInput<BaseGuardian<V>>
        : U[K];
    }
  : U
  : never;
