// deno-lint-ignore-file no-explicit-any
import type { BaseGuardian } from '../BaseGuardian.ts';
import type { FunctionType, GuardianProxy } from './mod.ts';

/**
 * Extracts the validated type from a guardian.
 *
 * This type utility takes a guardian type (like StringGuardian, ArrayGuardian<T>, etc.)
 * and extracts the actual type that it validates and returns.
 */
export type GuardianType<G> =
  // Handle MutatedGuardian case
  G extends { __mutatedType: infer M } ? M
    // Handle the most common case first: G is a function
    : G extends FunctionType<infer R, any[]> ? RemapOptionals<R>
    // G is a Guardian instance
    : G extends BaseGuardian<infer F>
      ? F extends FunctionType<infer R, any[]> ? RemapOptionals<R> : never
    // G is a GuardianProxy
    : G extends GuardianProxy<infer B>
      ? B extends BaseGuardian<infer F>
        ? F extends FunctionType<infer R, any[]> ? RemapOptionals<R> : never
      : never
    // G has a guardian property
    : G extends { guardian: infer F }
      ? F extends FunctionType<infer R, any[]> ? RemapOptionals<R> : never
    // G has mutate property that returns another guardian with transformed type
    : G extends { mutate: <T>(fn: (value: any) => T) => infer M }
      ? M extends (value: any) => infer R ? RemapOptionals<R> : never
    : never;

/**
 * Simplified helper type to handle optional properties at the top level without recursion
 */
type RemapOptionals<T> = T extends object ?
    & { [K in keyof T as undefined extends T[K] ? never : K]: T[K] }
    & {
      [K in keyof T as undefined extends T[K] ? K : never]?: Exclude<
        T[K],
        undefined
      >;
    }
  : T;

/**
 * Helper type for inferring the return type of a mutate method
 */
export type MutatedType<Input, Output> = {
  __mutatedType: Output;
  (value: unknown): Output;
};
