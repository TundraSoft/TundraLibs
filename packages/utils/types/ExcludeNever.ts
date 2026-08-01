/**
 * @fileoverview Type utility for filtering out `never` properties from object types.
 *
 * This module provides the `ExcludeNever` utility type, which is essential for
 * cleaning up generated types that may contain `never` properties as a result
 * of conditional type operations, mapped type transformations, or complex
 * type manipulations.
 *
 * **Key Features:**
 * - Removes properties typed as `never` from object types
 * - Preserves all other property types and modifiers
 * - Maintains type safety and IntelliSense support
 * - Zero runtime overhead (compile-time only)
 *
 * **Use Cases:**
 * - Cleaning up generated types from complex type operations
 * - API response type filtering
 * - Conditional property inclusion/exclusion
 * - Type-safe object transformations
 * - Dynamic form field generation
 *
 * @example Basic usage:
 * ```typescript
 * type InputType = {
 *   validProp: string;
 *   invalidProp: never;
 *   anotherValidProp: number;
 *   anotherInvalidProp: never;
 * };
 *
 * type CleanType = ExcludeNever<InputType>;
 * // Result: {
 * //   validProp: string;
 * //   anotherValidProp: number;
 * // }
 * ```
 *
 * @example API filtering:
 * ```typescript
 * interface UserResponse {
 *   id: string;
 *   name: string;
 *   email: string;
 *   internalId: never; // Should not be exposed to clients
 *   debugInfo: never;  // Only available in development
 * }
 *
 * type PublicUser = ExcludeNever<UserResponse>;
 * // Result: { id: string; name: string; email: string; }
 * ```
 */

/**
 * Removes properties with a value type of `never` from the input object type.
 *
 * This utility type is particularly useful when working with generated types
 * or conditional type operations that may result in some properties being
 * assigned the `never` type. It effectively filters out these properties,
 * creating a cleaner, more usable type.
 *
 * **Algorithm:**
 * 1. Iterates over all keys in the input type
 * 2. Uses conditional type to check if property type extends `never`
 * 3. Excludes keys whose values are `never` using key remapping
 * 4. Reconstructs the object type with only valid properties
 *
 * **Type Safety:**
 * - Preserves exact property types for non-`never` properties
 * - Maintains optional/required property modifiers
 * - Handles readonly properties correctly
 * - Supports nested object structures
 *
 * **Performance:**
 * - Compile-time only operation
 * - Efficient for objects with reasonable property counts
 * - No runtime overhead or type checking cost
 *
 * @template T - The input object type to filter (should be an object type)
 *
 * @example Conditional property inclusion:
 * ```typescript
 * type ConditionalProps<T> = {
 *   id: string;
 *   name: string;
 *   adminField: T extends 'admin' ? string : never;
 *   userField: T extends 'user' ? number : never;
 *   guestField: T extends 'guest' ? boolean : never;
 * };
 *
 * type AdminProps = ExcludeNever<ConditionalProps<'admin'>>;
 * // Result: { id: string; name: string; adminField: string; }
 *
 * type UserProps = ExcludeNever<ConditionalProps<'user'>>;
 * // Result: { id: string; name: string; userField: number; }
 * ```
 *
 * @example Form field generation:
 * ```typescript
 * interface BaseFormFields {
 *   name: string;
 *   email: string;
 *   age: number;
 * }
 *
 * type ConditionalForm<T extends 'simple' | 'detailed'> = {
 *   name: string;
 *   email: string;
 *   age: T extends 'detailed' ? number : never;
 *   address: T extends 'detailed' ? string : never;
 *   phone: T extends 'detailed' ? string : never;
 * };
 *
 * type SimpleForm = ExcludeNever<ConditionalForm<'simple'>>;
 * // Result: { name: string; email: string; }
 *
 * type DetailedForm = ExcludeNever<ConditionalForm<'detailed'>>;
 * // Result: { name: string; email: string; age: number; address: string; phone: string; }
 * ```
 *
 * @example API versioning:
 * ```typescript
 * interface APIResponse<V extends 1 | 2 | 3> {
 *   data: any[];
 *   status: string;
 *   // v2+ features
 *   pagination: V extends 1 ? never : {
 *     page: number;
 *     total: number;
 *   };
 *   // v3+ features
 *   metadata: V extends 1 | 2 ? never : {
 *     timestamp: string;
 *     version: string;
 *   };
 * }
 *
 * type V1Response = ExcludeNever<APIResponse<1>>;
 * // Result: { data: any[]; status: string; }
 *
 * type V2Response = ExcludeNever<APIResponse<2>>;
 * // Result: { data: any[]; status: string; pagination: { page: number; total: number; }; }
 *
 * type V3Response = ExcludeNever<APIResponse<3>>;
 * // Result: { data: any[]; status: string; pagination: ...; metadata: ...; }
 * ```
 *
 * @example Complex type transformation cleanup:
 * ```typescript
 * // After complex mapped type operations, you might end up with:
 * type MessyType = {
 *   validProp1: string;
 *   invalidProp1: never;
 *   validProp2: number;
 *   invalidProp2: never;
 *   validProp3: boolean;
 * };
 *
 * // Clean it up:
 * type CleanType = ExcludeNever<MessyType>;
 * // Result: { validProp1: string; validProp2: number; validProp3: boolean; }
 *
 * // Use in function signatures:
 * function processData(data: CleanType): void {
 *   // TypeScript IntelliSense only shows valid properties
 * }
 * ```
 */
export type ExcludeNever<T> =
  { [K in keyof T as T[K] extends never ? never : K]: T[K] } extends infer O
    ? { [K in keyof O]: O[K] }
    : never;
