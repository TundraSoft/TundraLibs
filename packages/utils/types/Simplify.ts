/**
 * @fileoverview Type utility for simplifying complex intersection types.
 *
 * This module provides the `Simplify` utility type, which flattens complex
 * intersection types into a single object type for better IntelliSense display
 * and improved type readability. This is particularly useful when working with
 * composed types that result in difficult-to-read type hints.
 *
 * **Key Features:**
 * - Flattens intersection types for better IntelliSense
 * - Improves type hint readability in IDE hover tooltips
 * - Preserves all properties and their exact types
 * - Works with complex nested intersections
 * - Zero runtime overhead (compile-time only)
 *
 * **Use Cases:**
 * - Improving developer experience with type hints
 * - Simplifying composed types from multiple utility types
 * - Better error messages from TypeScript compiler
 * - Documentation generation with clearer types
 * - Type display in IDE for complex generic types
 *
 * @example Basic intersection simplification:
 * ```typescript
 * type A = { x: number; y: string };
 * type B = { z: boolean };
 * type C = A & B;
 *
 * // Without Simplify: A & B (shows as intersection)
 * // With Simplify:
 * type SimplifiedC = Simplify<C>;
 * // Shows as: { x: number; y: string; z: boolean }
 * ```
 *
 * @example Complex utility type composition:
 * ```typescript
 * interface User {
 *   id: number;
 *   name: string;
 *   email: string;
 *   role: string;
 * }
 *
 * type PartialReadonly = Partial<User> & Readonly<Pick<User, 'id'>>;
 * // Hover shows: Partial<User> & Readonly<Pick<User, 'id'>>
 *
 * type SimplifiedType = Simplify<PartialReadonly>;
 * // Hover shows: {
 * //   readonly id: number;
 * //   name?: string;
 * //   email?: string;
 * //   role?: string;
 * // }
 * ```
 *
 * @example API type composition:
 * ```typescript
 * type BaseEntity = { id: string; createdAt: Date };
 * type Timestamps = { updatedAt: Date; deletedAt: Date | null };
 * type Metadata = { version: number; author: string };
 *
 * type Entity = BaseEntity & Timestamps & Metadata;
 * // Shows complex intersection
 *
 * type SimplifiedEntity = Simplify<Entity>;
 * // Shows flat object: {
 * //   id: string;
 * //   createdAt: Date;
 * //   updatedAt: Date;
 * //   deletedAt: Date | null;
 * //   version: number;
 * //   author: string;
 * // }
 * ```
 *
 * @module
 * @category Type Utilities
 * @author TundraSoft
 */

/**
 * Simplifies complex intersection types into a flat object type for better readability.
 *
 * This utility type takes a complex type (especially intersections) and flattens
 * it into a single object type. This doesn't change the actual type structure or
 * behavior, but makes the type much easier to read in IDE tooltips and error messages.
 *
 * **Algorithm:**
 * 1. Uses mapped types to iterate over all keys in T
 * 2. Reconstructs the type as a fresh object type
 * 3. Uses conditional type inference to force TypeScript to evaluate the result
 * 4. Returns the simplified, flat representation
 *
 * **Type Safety:**
 * - Preserves all properties and their exact types
 * - Maintains optional/required modifiers
 * - Handles readonly properties correctly
 * - Preserves union types within property values
 *
 * **Performance:**
 * - Compile-time only operation
 * - Minimal impact on TypeScript compilation time
 * - No runtime overhead whatsoever
 * - No impact on bundle size
 *
 * **Note:** This type is purely for improving developer experience and doesn't
 * change the actual runtime behavior or type checking semantics.
 *
 * @template T - The complex type to simplify (typically an intersection type)
 * @returns A flattened version of T with the same properties but better display
 *
 * @example Generic utility combinations:
 * ```typescript
 * interface Config {
 *   host: string;
 *   port: number;
 *   ssl: boolean;
 * }
 *
 * type PartialConfig = Partial<Config> & { host: string }; // host is required
 * // Hover shows: Partial<Config> & { host: string }
 *
 * type SimplifiedConfig = Simplify<PartialConfig>;
 * // Hover shows: { host: string; port?: number; ssl?: boolean; }
 * ```
 *
 * @example Mixin pattern simplification:
 * ```typescript
 * type Identifiable = { id: string };
 * type Timestamped = { createdAt: Date; updatedAt: Date };
 * type Named = { name: string; displayName: string };
 *
 * type FullEntity = Identifiable & Timestamped & Named;
 *
 * type ReadableEntity = Simplify<FullEntity>;
 * // Much easier to read in IntelliSense!
 * ```
 *
 * @category Type Utilities
 */
export type Simplify<T> = { [K in keyof T]: T[K] } extends infer O ? O : never;
