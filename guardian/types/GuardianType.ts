import type { BaseGuardian } from '../BaseGuardian.ts';
import type { FunctionType, GuardianProxy } from './mod.ts';

/**
 * Extracts the validated type from a guardian.
 *
 * This type utility takes a guardian type (like StringGuardian, ArrayGuardian<T>, etc.)
 * and extracts the actual type that it validates and returns.
 *
 * @example
 * ```ts
 * // String type
 * const stringGuard = StringGuardian.create();
 * type StringType = GuardianType<typeof stringGuard>; // string
 *
 * // Array of strings type
 * const stringArrayGuard = ArrayGuardian.create().of(StringGuardian.create());
 * type StringArrayType = GuardianType<typeof stringArrayGuard>; // string[]
 *
 * // Object type
 * const userGuard = ObjectGuardian.create().schema({
 *   name: StringGuardian.create().optional(),
 *   age: NumberGuardian.create(),
 * });
 * type UserType = GuardianType<typeof userGuard>; // { name?: string; age: number }
 * ```
 */
export type GuardianType<G> =
  // Case 1: G is a function directly (most common case with proxies)
  G extends FunctionType<infer R, any[]> ? R
    // Case 2: G is a BaseGuardian instance
    : G extends BaseGuardian<infer F>
      ? F extends FunctionType<infer R, any[]> ? R
      : never
    // Case 3: G is a GuardianProxy
    : G extends GuardianProxy<infer B>
      ? B extends BaseGuardian<infer F>
        ? F extends FunctionType<infer R, any[]> ? R
        : never
      : never
    // Case 4: G has a guardian property
    : G extends { guardian: infer F }
      ? F extends FunctionType<infer R, any[]> ? R
      : never
    : never;
