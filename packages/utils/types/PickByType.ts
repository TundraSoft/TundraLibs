/**
 * @fileoverview Type utility for selecting properties by their value type.
 *
 * This module provides the `PickByType` utility type, which selects only properties
 * from an object type that match a specified value type. This is useful for filtering
 * object types to include only properties of certain types.
 *
 * **Key Features:**
 * - Selects properties based on value type matching
 * - Preserves all matching properties with exact types
 * - Works with primitive types, object types, and union types
 * - Zero runtime overhead (compile-time only)
 * - Full TypeScript IntelliSense support
 *
 * **Use Cases:**
 * - Extracting function properties (methods) from classes
 * - Selecting only numeric or string properties
 * - Creating type-specific subsets of objects
 * - Validation schema generation
 * - Type-based property grouping
 *
 * @example Selecting string properties:
 * ```typescript
 * type User = {
 *   id: number;
 *   name: string;
 *   email: string;
 *   age: number;
 *   active: boolean;
 * };
 *
 * type StringProps = PickByType<User, string>;
 * // Result: {
 * //   name: string;
 * //   email: string;
 * // }
 * ```
 *
 * @example Extracting methods from classes:
 * ```typescript
 * type Repository = {
 *   name: string;
 *   url: string;
 *   fetch(): Promise<void>;
 *   push(): Promise<void>;
 *   pull(): Promise<void>;
 * };
 *
 * type RepositoryMethods = PickByType<Repository, Function>;
 * // Result: {
 * //   fetch(): Promise<void>;
 * //   push(): Promise<void>;
 * //   pull(): Promise<void>;
 * // }
 * ```
 *
 * @example Selecting numeric properties:
 * ```typescript
 * interface Stats {
 *   count: number;
 *   total: number;
 *   average: number;
 *   name: string;
 *   date: Date;
 * };
 *
 * type NumericStats = PickByType<Stats, number>;
 * // Result: { count: number; total: number; average: number; }
 * ```
 *
 * @module
 * @category Type Utilities
 * @author TundraSoft
 */

/**
 * Picks only properties from an object type that match the specified value type.
 *
 * This utility type filters properties to include only those whose value types
 * extend the specified type V, removing all other properties. It's particularly
 * useful for creating type-specific views of objects.
 *
 * **Algorithm:**
 * 1. Creates a mapped type that checks each property's value type
 * 2. If value type extends V, keeps the key, otherwise maps to never
 * 3. Uses TypeScript's Pick utility with the filtered keys
 * 4. Returns the resulting type with only matching properties
 *
 * **Type Safety:**
 * - Preserves exact types for matching properties
 * - Maintains optional/required modifiers
 * - Handles readonly properties correctly
 * - Works with union and intersection types
 *
 * **Performance:**
 * - Compile-time only operation
 * - Efficient for objects with reasonable property counts
 * - No runtime overhead or type checking cost
 *
 * @template T - The source object type to filter
 * @template V - The value type to select (only properties matching this type are picked)
 * @returns A new type with only properties matching type V
 *
 * @example Selecting boolean flags:
 * ```typescript
 * type Config = {
 *   host: string;
 *   port: number;
 *   ssl: boolean;
 *   debug: boolean;
 *   verbose: boolean;
 * };
 *
 * type BooleanFlags = PickByType<Config, boolean>;
 * // Result: { ssl: boolean; debug: boolean; verbose: boolean; }
 * ```
 *
 * @example Extracting Date properties:
 * ```typescript
 * type Event = {
 *   id: string;
 *   name: string;
 *   startDate: Date;
 *   endDate: Date;
 *   createdAt: Date;
 *   capacity: number;
 * };
 *
 * type EventDates = PickByType<Event, Date>;
 * // Result: { startDate: Date; endDate: Date; createdAt: Date; }
 * ```
 *
 * @category Type Utilities
 */
export type PickByType<T, V> = Pick<
  T,
  { [K in keyof T]: T[K] extends V ? K : never }[keyof T]
>;
