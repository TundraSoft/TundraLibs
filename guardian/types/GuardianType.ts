// deno-lint-ignore-file no-explicit-any
import type { BaseGuardian } from '../BaseGuardian.ts';
import type { FunctionType, GuardianProxy } from './mod.ts';
import type { UnknownGuardian } from '../guards/Unknown.ts';

/**
 * Extracts the validated type from a guardian.
 *
 * This type utility takes a guardian type (like StringGuardian, ArrayGuardian<T>, etc.)
 * and extracts the actual type that it validates and returns.
 */
export type GuardianType<G> =
  // Handle MutatedGuardian case
  G extends { __mutatedType: infer M } ? M
    // Handle UnknownGuardian specifically
    : G extends UnknownGuardian ? unknown
    : G extends GuardianProxy<UnknownGuardian> ? unknown
    // Handle the most common case first: G is a function
    : G extends FunctionType<infer R, any[]> ? ProcessGuardianReturnType<R>
    // G is a Guardian instance
    : G extends BaseGuardian<infer F>
      ? F extends FunctionType<infer R, any[]> ? ProcessGuardianReturnType<R>
      : never
    // G is a GuardianProxy - this is the key case for chained guardians
    : G extends GuardianProxy<infer B, infer F>
      ? F extends FunctionType<infer R, any[]> ? ProcessGuardianReturnType<R>
      : B extends BaseGuardian<infer BF>
        ? BF extends FunctionType<infer R, any[]> ? ProcessGuardianReturnType<R>
        : never
      : never
    // G has a guardian property
    : G extends { guardian: infer F }
      ? F extends FunctionType<infer R, any[]> ? ProcessGuardianReturnType<R>
      : never
    // G has mutate property that returns another guardian with transformed type
    : G extends { mutate: <T>(fn: (value: any) => T) => infer M }
      ? M extends (value: any) => infer R ? ProcessGuardianReturnType<R> : never
    : never;

/**
 * Processes guardian return types to handle nullable, optional, and async variations
 */
type ProcessGuardianReturnType<T> = T extends Promise<infer U>
  ? ProcessGuardianReturnType<U>
  : T extends object ? T extends Record<string, unknown> ? RemapOptionals<T>
    : T
  : T;

/**
 * Simplified helper type to handle optional properties at the top level without recursion
 * Properties are optional if they can be undefined OR null (since nullable properties
 * auto-assign null for missing keys, just like optional properties auto-assign undefined)
 */
type RemapOptionals<T> = T extends object ?
    & {
      [
        K in keyof T as undefined extends T[K] ? never
          : null extends T[K] ? never
          : K
      ]: T[K];
    }
    & {
      [
        K in keyof T as undefined extends T[K] ? K
          : null extends T[K] ? K : never
      ]?: T[K];
    }
  : T;

/**
 * Helper type for inferring the return type of a mutate method
 */
export type MutatedType<Input, Output> = {
  __mutatedType: Output;
  (value: unknown): Output;
};
