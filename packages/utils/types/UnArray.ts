/**
 * @fileoverview {@link UnArray} — unwrap an array type to its element type.
 *
 * @module
 */

/**
 * Element type of `T` when `T` is a mutable array, otherwise `T` itself —
 * for APIs that accept either a single value or a list of them.
 *
 * Unwrapping is one level deep and DISTRIBUTES over unions, so
 * `string[] | number[]` yields `string | number`. Two shapes surprise
 * people: a tuple yields the union of its members, and a `readonly`
 * array is NOT unwrapped (it does not extend `Array`), so
 * `readonly string[]` passes through unchanged.
 *
 * @typeParam T - Type that may or may not be an array.
 *
 * @example
 * ```typescript
 * type A = UnArray<string[]>;                  // string
 * type B = UnArray<[string, number]>;          // string | number
 * type C = UnArray<readonly string[]>;         // readonly string[] — unchanged
 * type D = UnArray<{ id: number }>;            // { id: number }
 * ```
 */
export type UnArray<T> = T extends Array<infer U> ? U : T;
