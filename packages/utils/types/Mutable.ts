/**
 * @fileoverview Shallow writable utility type for removing readonly modifiers.
 *
 * This module provides the `Mutable` utility type, which removes readonly modifiers
 * from all properties of an object type at the top level. This is useful when you
 * need to create mutable versions of readonly types or work with libraries that
 * require mutable data structures.
 *
 * **Key Features:**
 * - Shallow readonly removal (only top-level properties)
 * - Preserves all property types and values
 * - Enables mutation of previously readonly types
 * - Zero runtime overhead
 * - Full TypeScript IntelliSense support
 *
 * **Use Cases:**
 * - Creating mutable copies from readonly configuration
 * - Working with readonly API responses that need modification
 * - Form editing from readonly initial data
 * - Testing scenarios requiring mutable data
 * - Library integrations that require mutable types
 *
 * **Note:** For deep mutability of nested objects, use `DeepWritable` instead.
 *
 * @example Basic usage:
 * ```typescript
 * type ReadonlyUser = {
 *   readonly id: number;
 *   readonly name: string;
 *   readonly email: string;
 * };
 *
 * type MutableUser = Mutable<ReadonlyUser>;
 * // Result: {
 * //   id: number;
 * //   name: string;
 * //   email: string;
 * // }
 *
 * declare const user: MutableUser;
 * user.name = 'John'; // OK - no longer readonly
 * ```
 *
 * @example Form editing:
 * ```typescript
 * interface ReadonlyProfile {
 *   readonly username: string;
 *   readonly email: string;
 *   readonly bio: string;
 * }
 *
 * type EditableProfile = Mutable<ReadonlyProfile>;
 *
 * function createEditForm(profile: ReadonlyProfile): EditableProfile {
 *   const editable: EditableProfile = { ...profile };
 *   editable.bio = 'Updated bio'; // OK
 *   return editable;
 * }
 * ```
 *
 * @example API response modification:
 * ```typescript
 * interface ReadonlyApiData {
 *   readonly id: string;
 *   readonly timestamp: Date;
 *   readonly values: number[];
 * }
 *
 * type ProcessableData = Mutable<ReadonlyApiData>;
 *
 * function processData(data: ReadonlyApiData): ProcessableData {
 *   const mutable: ProcessableData = { ...data };
 *   mutable.values = mutable.values.map(v => v * 2);
 *   return mutable;
 * }
 * ```
 *
 * @module
 * @category Type Utilities
 * @author TundraSoft
 */

/**
 * Removes readonly modifiers from all properties of an object type at the top level.
 *
 * This utility type removes the readonly modifier from all properties of an object,
 * allowing them to be reassigned. Note that this is a shallow operation - nested
 * objects will not have their readonly modifiers removed.
 *
 * **Algorithm:**
 * - Uses mapped types with the `-readonly` modifier
 * - Iterates over all keys in the input type
 * - Removes readonly from each property while preserving its type
 *
 * **Type Safety:**
 * - Enables property reassignment at compile time
 * - Preserves optional/required modifiers
 * - Maintains exact property types
 * - Works with union and intersection types
 *
 * **Performance:**
 * - Compile-time only operation
 * - No runtime overhead
 * - No impact on bundle size
 *
 * @template T - The object type to make mutable (must extend Record<string, unknown>)
 * @returns A new type with all readonly modifiers removed
 *
 * @example Testing with mutable data:
 * ```typescript
 * interface ReadonlyConfig {
 *   readonly host: string;
 *   readonly port: number;
 *   readonly ssl: boolean;
 * }
 *
 * type TestConfig = Mutable<ReadonlyConfig>;
 *
 * function createTestConfig(): TestConfig {
 *   const config: TestConfig = {
 *     host: 'localhost',
 *     port: 3000,
 *     ssl: false
 *   };
 *   config.port = 8080; // OK for testing
 *   return config;
 * }
 * ```
 *
 * @category Type Utilities
 */
export type Mutable<T extends Record<string, unknown>> = {
  -readonly [K in keyof T]: T[K];
};
