/**
 * @fileoverview Type utility for converting objects to entry tuples.
 *
 * This module provides the `Entries` utility type, which transforms an object type
 * into an array of `[key, value]` tuple types. This mirrors the runtime behavior of
 * `Object.entries()` but at the type level, providing type-safe iteration over
 * object properties.
 *
 * **Key Features:**
 * - Generates array of key-value tuple types from object types
 * - Preserves exact property types in tuple values
 * - Maintains type safety during object iteration
 * - Zero runtime overhead (compile-time only)
 * - Full TypeScript IntelliSense support
 *
 * **Use Cases:**
 * - Type-safe object iteration with `Object.entries()`
 * - Building type-safe mappers and transformers
 * - Form data serialization with type preservation
 * - Configuration validation and transformation
 * - Database query builders with type-safe parameters
 *
 * @example Basic usage:
 * ```typescript
 * type User = {
 *   id: number;
 *   name: string;
 *   email: string;
 *   active: boolean;
 * };
 *
 * type UserEntries = Entries<User>;
 * // Result: (['id', number] | ['name', string] | ['email', string] | ['active', boolean])[]
 *
 * const entries: UserEntries = [
 *   ['id', 123],
 *   ['name', 'John'],
 *   ['email', 'john@example.com'],
 *   ['active', true]
 * ];
 * ```
 *
 * @example Type-safe object iteration:
 * ```typescript
 * interface Config {
 *   host: string;
 *   port: number;
 *   ssl: boolean;
 * }
 *
 * type ConfigEntries = Entries<Config>;
 *
 * function processConfig(config: Config): void {
 *   const entries = Object.entries(config) as ConfigEntries;
 *   entries.forEach(([key, value]) => {
 *     // key: 'host' | 'port' | 'ssl'
 *     // value: string | number | boolean (but typed correctly per key)
 *     console.log(`${key}: ${value}`);
 *   });
 * }
 * ```
 *
 * @module
 * @category Type Utilities
 * @author TundraSoft
 */

/**
 * Converts an object type to an array of `[key, value]` tuple types.
 *
 * This utility type generates the type-level equivalent of `Object.entries()`,
 * creating an array type where each element is a tuple containing a property
 * key and its corresponding value type. This enables type-safe iteration and
 * transformation of object properties.
 *
 * **Algorithm:**
 * 1. Maps over each key in the object type
 * 2. Creates a tuple type `[K, T[K]]` for each property
 * 3. Collects all tuple types into a union
 * 4. Wraps the union in an array type
 *
 * **Type Safety:**
 * - Preserves exact property types in tuple values
 * - Maintains literal types (strings, numbers, booleans)
 * - Handles optional properties correctly
 * - Works with union and intersection types
 *
 * **Performance:**
 * - Compile-time only operation
 * - No runtime overhead or type checking cost
 * - Efficient for objects with reasonable property counts
 *
 * @template T - The object type to convert (must extend Record<string, unknown>)
 * @returns Array type of `[key, value]` tuples for all properties in T
 *
 * @example Configuration validation:
 * ```typescript
 * interface DatabaseConfig {
 *   host: string;
 *   port: number;
 *   username: string;
 *   password: string;
 *   ssl: boolean;
 * }
 *
 * type ConfigEntries = Entries<DatabaseConfig>;
 *
 * function validateConfig(entries: ConfigEntries): boolean {
 *   return entries.every(([key, value]) => {
 *     if (key === 'port') return typeof value === 'number' && value > 0;
 *     if (key === 'ssl') return typeof value === 'boolean';
 *     return typeof value === 'string' && value.length > 0;
 *   });
 * }
 * ```
 *
 * @category Type Utilities
 */
export type Entries<T extends Record<string, unknown>> = {
  [K in keyof T]: [K, T[K]];
}[keyof T][];
