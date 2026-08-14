/**
 * @fileoverview Shallow readonly utility type for object immutability.
 *
 * This module provides the `Immutable` utility type, which adds readonly modifiers
 * to all properties of an object type at the top level. This is equivalent to
 * TypeScript's built-in `Readonly<T>` utility type and is provided for consistency
 * with the library's naming conventions.
 *
 * **Key Features:**
 * - Shallow readonly application (only top-level properties)
 * - Preserves all property types and modifiers
 * - Compile-time immutability guarantees
 * - Zero runtime overhead
 * - Full TypeScript IntelliSense support
 *
 * **Use Cases:**
 * - Creating immutable configuration objects
 * - Protecting API response types from modification
 * - Function parameters that shouldn't be mutated
 * - State management with immutable data
 * - Props in component libraries
 *
 * **Note:** For deep immutability of nested objects, use `DeepReadOnly` instead.
 *
 * @example Basic usage:
 * ```typescript
 * type User = {
 *   id: number;
 *   name: string;
 *   email: string;
 * };
 *
 * type ImmutableUser = Immutable<User>;
 * // Result: {
 * //   readonly id: number;
 * //   readonly name: string;
 * //   readonly email: string;
 * // }
 *
 * declare const user: ImmutableUser;
 * // user.name = 'John'; // Error: Cannot assign to 'name' because it is a read-only property
 * ```
 *
 * @example Configuration objects:
 * ```typescript
 * type AppConfig = {
 *   apiUrl: string;
 *   timeout: number;
 *   retries: number;
 * };
 *
 * type ReadonlyConfig = Immutable<AppConfig>;
 *
 * function initializeApp(config: ReadonlyConfig): void {
 *   // config properties cannot be modified
 *   // config.timeout = 5000; // Error!
 *   console.log(`Connecting to ${config.apiUrl}`);
 * }
 * ```
 *
 * @example API responses:
 * ```typescript
 * type ApiResponse = {
 *   data: unknown[];
 *   status: number;
 *   message: string;
 * };
 *
 * type ImmutableResponse = Immutable<ApiResponse>;
 *
 * async function fetchData(): Promise<ImmutableResponse> {
 *   const response = await fetch('/api/data');
 *   return response.json();
 * }
 * ```
 *
 * @module
 * @category Type Utilities
 * @author TundraSoft
 */

/**
 * Makes all properties of an object type readonly at the top level.
 *
 * This utility type applies the readonly modifier to all properties of an object,
 * preventing them from being reassigned. Note that this is a shallow operation -
 * nested objects will not have readonly applied to their properties.
 *
 * **Algorithm:**
 * - Uses mapped types with the `+readonly` modifier
 * - Iterates over all keys in the input type
 * - Adds readonly to each property while preserving its type
 *
 * **Type Safety:**
 * - Prevents property reassignment at compile time
 * - Preserves optional/required modifiers
 * - Maintains exact property types
 * - Works with union and intersection types
 *
 * **Performance:**
 * - Compile-time only operation
 * - No runtime overhead
 * - No impact on bundle size
 *
 * @template T - The object type to make readonly (must extend Record<string, unknown>)
 * @returns A new type with all properties marked as readonly
 *
 * @example Function parameters:
 * ```typescript
 * type Options = {
 *   debug: boolean;
 *   verbose: boolean;
 *   output: string;
 * };
 *
 * function processWithOptions(options: Immutable<Options>): void {
 *   // options cannot be modified
 *   console.log('Processing with options:', options);
 * }
 * ```
 *
 * @category Type Utilities
 */
export type Immutable<T extends Record<string, unknown>> = {
  +readonly [K in keyof T]: T[K];
};
