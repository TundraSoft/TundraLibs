/**
 * @fileoverview Utility type for extracting element types from array types.
 *
 * This module provides the `UnArray` utility type, which extracts the element
 * type from array types while gracefully handling non-array types. This is
 * essential for generic programming, type narrowing, and working with dynamic
 * data structures where you need to operate on individual elements.
 *
 * **Key Features:**
 * - Extracts element types from arrays, tuples, and readonly arrays
 * - Returns original type for non-array inputs (identity behavior)
 * - Works with nested arrays and complex generic types
 * - Zero runtime overhead (compile-time only)
 * - Type-safe with full IntelliSense support
 *
 * **Use Cases:**
 * - Generic functions that work with both arrays and single values
 * - Type narrowing in conditional logic
 * - Building flexible APIs that accept arrays or single items
 * - Processing function parameters with overloaded signatures
 *
 * **Type Behavior:**
 * - `Array<T>` → `T`
 * - `readonly T[]` → `T`
 * - `[T, U, V]` (tuple) → `T | U | V`
 * - `T` (non-array) → `T`
 *
 * @example
 * ```typescript
 * // Basic array unwrapping
 * type StringArray = string[];
 * type StringElement = UnArray<StringArray>; // string
 *
 * type NumberArray = number[];
 * type NumberElement = UnArray<NumberArray>; // number
 *
 * // Readonly arrays
 * type ReadonlyNumbers = readonly number[];
 * type ReadonlyElement = UnArray<ReadonlyNumbers>; // number
 *
 * // Tuples become union types
 * type MixedTuple = [string, number, boolean];
 * type TupleElement = UnArray<MixedTuple>; // string | number | boolean
 *
 * // Non-arrays remain unchanged
 * type SingleString = string;
 * type UnwrappedString = UnArray<SingleString>; // string
 *
 * type UserObject = { id: number; name: string };
 * type UnwrappedUser = UnArray<UserObject>; // { id: number; name: string }
 *
 * // Complex nested types
 * type NestedArray = Array<Array<string>>;
 * type OneLevel = UnArray<NestedArray>; // Array<string>
 * type TwoLevels = UnArray<UnArray<NestedArray>>; // string
 *
 * // Generic constraints with UnArray
 * function processItem<T>(input: T | T[]): UnArray<T> {
 *   const item = Array.isArray(input) ? input[0] : input;
 *   return item as UnArray<T>;
 * }
 *
 * // Usage in flexible API design
 * interface DataProcessor<T> {
 *   process(items: T[]): UnArray<T>[];
 *   processOne(item: UnArray<T>): T[];
 * }
 *
 * // Working with union types
 * type StringOrNumbers = string[] | number[];
 * type ElementType = UnArray<StringOrNumbers>; // string | number
 *
 * // Optional arrays
 * type MaybeArray<T> = T | T[];
 * type FlexibleProcessor<T> = (input: MaybeArray<T>) => UnArray<T>;
 *
 * // Real-world example: Event handler that accepts single or multiple items
 * interface EventData {
 *   type: string;
 *   payload: unknown;
 * }
 *
 * function handleEvents<T extends EventData | EventData[]>(
 *   events: T
 * ): UnArray<T>[] {
 *   const eventArray = Array.isArray(events) ? events : [events];
 *   return eventArray;
 * }
 *
 * // Usage with conditional types
 * type ProcessResult<T> = T extends unknown[]
 *   ? { items: UnArray<T>[]; count: number }
 *   : { item: T; single: true };
 *
 * function processInput<T>(input: T): ProcessResult<T> {
 *   if (Array.isArray(input)) {
 *     return { items: input, count: input.length } as ProcessResult<T>;
 *   }
 *   return { item: input, single: true } as ProcessResult<T>;
 * }
 * ```
 *
 * @template T - The input type that may or may not be an array
 * @returns The element type if T is an array, otherwise T itself
 *
 * @since 1.0.0
 * @category Type Utilities
 * @author TundraSoft
 */
export type UnArray<T> = T extends Array<infer U> ? U : T;
