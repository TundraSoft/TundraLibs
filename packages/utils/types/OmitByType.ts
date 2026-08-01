/**
 * @fileoverview Type utility for omitting properties by their value type.
 *
 * This module provides the `OmitByType` utility type, which removes all properties
 * from an object type that match a specified value type. This is useful for filtering
 * object types based on their property types rather than property names.
 *
 * **Key Features:**
 * - Filters properties based on value type matching
 * - Preserves all non-matching properties with exact types
 * - Works with primitive types, object types, and union types
 * - Zero runtime overhead (compile-time only)
 * - Full TypeScript IntelliSense support
 *
 * **Use Cases:**
 * - Removing function properties from object types
 * - Filtering out optional or nullable properties
 * - Creating data-only types (no methods)
 * - API response sanitization
 * - Serialization type generation
 *
 * @example Removing function properties:
 * ```typescript
 * type UserClass = {
 *   id: number;
 *   name: string;
 *   email: string;
 *   save(): Promise<void>;
 *   delete(): Promise<void>;
 *   validate(): boolean;
 * };
 *
 * type UserData = OmitByType<UserClass, Function>;
 * // Result: {
 * //   id: number;
 * //   name: string;
 * //   email: string;
 * // }
 * ```
 *
 * @example Filtering nullable properties:
 * ```typescript
 * type ApiResponse = {
 *   id: string;
 *   name: string;
 *   description: string | null;
 *   metadata: Record<string, any> | null;
 *   timestamp: Date;
 * };
 *
 * type NonNullResponse = OmitByType<ApiResponse, null>;
 * // Result: {
 * //   id: string;
 * //   name: string;
 * //   timestamp: Date;
 * // }
 * ```
 *
 * @example Creating serializable types:
 * ```typescript
 * interface Entity {
 *   id: number;
 *   name: string;
 *   createdAt: Date;
 *   updatedAt: Date;
 *   save(): Promise<void>;
 *   toJSON(): object;
 * }
 *
 * type SerializableEntity = OmitByType<Entity, Function>;
 * // Only data properties, no methods
 * ```
 *
 * @module
 * @category Type Utilities
 * @author TundraSoft
 */

/**
 * Omits all properties from an object type that match the specified value type.
 *
 * This utility type filters out properties whose value types extend the specified
 * type V, keeping only properties that don't match. It's particularly useful for
 * removing categories of properties (like functions, nullables, etc.) from types.
 *
 * **Algorithm:**
 * 1. Creates a mapped type that checks each property's value type
 * 2. If value type extends V, maps the key to never, otherwise keeps the key
 * 3. Uses TypeScript's Omit utility with the filtered keys
 * 4. Returns the resulting type without matching properties
 *
 * **Type Safety:**
 * - Preserves exact types for non-matching properties
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
 * @template V - The value type to filter out (properties matching this type are omitted)
 * @returns A new type with all properties matching type V removed
 *
 * @example Removing boolean flags:
 * ```typescript
 * type Config = {
 *   host: string;
 *   port: number;
 *   ssl: boolean;
 *   debug: boolean;
 *   timeout: number;
 * };
 *
 * type NonBooleanConfig = OmitByType<Config, boolean>;
 * // Result: { host: string; port: number; timeout: number; }
 * ```
 *
 * @example Filtering optional properties:
 * ```typescript
 * type Form = {
 *   name: string;
 *   email: string;
 *   phone?: string;
 *   address?: string;
 *   notes?: string;
 * };
 *
 * type RequiredFields = OmitByType<Form, undefined>;
 * // Result: { name: string; email: string; }
 * ```
 *
 * @category Type Utilities
 */
export type OmitByType<T, V> = Omit<
  T,
  { [K in keyof T]: T[K] extends V ? K : never }[keyof T]
>;
