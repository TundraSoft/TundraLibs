/**
 * @fileoverview Advanced entity flattening utilities for complex object transformation.
 *
 * This module provides sophisticated TypeScript type utilities for flattening nested
 * entity structures while preserving type information. It's particularly useful for
 * database operations, API transformations, and configuration management where
 * deeply nested objects need to be converted to flat structures.
 *
 * **Key Features:**
 * - Recursive entity flattening with type preservation
 * - Support for nested objects and arrays
 * - Customizable key prefixing with configurable identifier character
 * - Full TypeScript IntelliSense support
 * - Zero runtime overhead (compile-time only)
 *
 * **Use Cases:**
 * - Database entity mapping and ORM integration
 * - API response normalization
 * - Configuration file processing
 * - Form data serialization
 * - Search index document creation
 *
 * @example Basic entity flattening:
 * ```typescript
 * type User = {
 *   id: number;
 *   profile: {
 *     name: string;
 *     email: string;
 *     settings: {
 *       theme: 'light' | 'dark';
 *       notifications: boolean;
 *     };
 *   };
 *   posts: Array<{
 *     title: string;
 *     content: string;
 *   }>;
 * };
 *
 * type FlatUser = FlattenEntity<User>;
 * // Result: {
 * //   $id: number;
 * //   $profile.$name: string;
 * //   $profile.$email: string;
 * //   $profile.$settings.$theme: 'light' | 'dark';
 * //   $profile.$settings.$notifications: boolean;
 * //   $posts.$title: string;              // Any element (contains query)
 * //   $posts.[0].$title: string;          // Specific index access
 * //   $posts.$content: string;            // Any element (contains query)
 * //   $posts.[0].$content: string;        // Specific index access
 * // }
 * ```
 *
 * @example Database mapping:
 * ```typescript
 * type OrderEntity = {
 *   orderId: string;
 *   customer: {
 *     customerId: string;
 *     name: string;
 *     address: {
 *       street: string;
 *       city: string;
 *       country: string;
 *     };
 *   };
 *   items: Array<{
 *     productId: string;
 *     quantity: number;
 *     price: number;
 *   }>;
 * };
 *
 * type FlatOrder = FlattenEntity<OrderEntity>;
 *
 * // Database insert function
 * function insertFlatOrder(order: FlatOrder): void {
 *   // Fields available:
 *   // - $orderId, $customer.$name
 *   // - $items.$productId (any element)
 *   // - $items.[0].$productId (specific index)
 * }
 * ```
 */

import type { UnionToIntersection } from './UnionToIntersection.ts';

/**
 * Recursively flattens an entity type, preserving the nested structure as dot-separated keys.
 *
 * This utility type transforms complex nested objects into flat structures where each
 * property path becomes a single key prefixed with dollar signs. It handles both
 * nested objects and arrays of objects, preserving all type information during
 * the transformation process.
 *
 * **Algorithm:**
 * 1. For each property in the entity:
 *    - If it's a nested object: recursively flatten it
 *    - If it's an array of objects: flatten the array element type
 *    - If it's a primitive value: create a flattened key-value pair
 * 2. Combine all flattened properties using UnionToIntersection
 * 3. Prefix all keys with the specified identifier (default '$') to avoid naming conflicts
 *
 * **Key Naming Convention:**
 * - Root properties: `${Identifier}propertyName` (e.g., `$propertyName`)
 * - Nested properties: `${Identifier}parent.${Identifier}child` (e.g., `$parent.$child`)
 * - Array items (any element): `${Identifier}arrayName.${Identifier}itemProperty` (e.g., `$arrayName.$itemProperty`)
 * - Array items (specific index): `${Identifier}arrayName.[${number}].${Identifier}itemProperty` (e.g., `$arrayName.[0].$itemProperty`)
 *
 * **Performance:**
 * - Compile-time only operation
 * - May increase TypeScript compilation time for very deep structures
 * - Recommended for entities with reasonable nesting depth
 *
 * **Type Safety:**
 * - Preserves exact types of all nested properties
 * - Maintains union types and literal types
 * - Provides full IntelliSense support for flattened keys
 *
 * @template T - The entity type to flatten (must extend Record<string, unknown>)
 * @template KeyPrefix - Internal parameter for recursive key building (default: '')
 * @template Identifier - The character used to prefix flattened keys (default: '$')
 *
 * @example Custom identifier usage:
 * ```typescript
 * type Config = {
 *   server: {
 *     host: string;
 *     port: number;
 *   };
 * }
 *
 * // Using default '$' identifier
 * type DefaultFlat = FlattenEntity<Config>;
 * // Result: { $server.$host: string; $server.$port: number; }
 *
 * // Using custom '_' identifier
 * type UnderscoreFlat = FlattenEntity<Config, '', '_'>;
 * // Result: { _server._host: string; _server._port: number; }
 *
 * // Using custom '@' identifier
 * type AtFlat = FlattenEntity<Config, '', '@'>;
 * // Result: { @server.@host: string; @server.@port: number; }
 * ```
 *
 * @example API response normalization:
 * ```typescript
 * type ApiResponse = {
 *   data: {
 *     users: Array<{
 *       id: string;
 *       profile: {
 *         firstName: string;
 *         lastName: string;
 *         avatar: {
 *           url: string;
 *           width: number;
 *           height: number;
 *         };
 *       };
 *     }>;
 *   };
 *   meta: {
 *     total: number;
 *     page: number;
 *   };
 * }
 *
 * type FlatResponse = FlattenEntity<ApiResponse>;
 *
 * // Flattened keys include:
 * // $data.$users.$id: string                        // Any user
 * // $data.$users.[0].$id: string                    // First user
 * // $data.$users.$profile.$firstName: string        // Any user's first name
 * // $data.$users.[0].$profile.$firstName: string    // First user's first name
 * // $data.$users.$profile.$avatar.$url: string      // Any user's avatar URL
 * // $data.$users.[0].$profile.$avatar.$url: string  // First user's avatar URL
 * // $meta.$total: number
 * // $meta.$page: number
 *
 * function normalizeResponse(response: ApiResponse): Partial<FlatResponse> {
 *   // Implementation would flatten the actual data
 *   return {
 *     '$meta.$total': response.meta.total,
 *     '$meta.$page': response.meta.page,
 *     // ... other flattened properties
 *   };
 * }
 * ```
 *
 * @example Configuration processing:
 * ```typescript
 * type AppConfig = {
 *   server: {
 *     host: string;
 *     port: number;
 *     ssl: {
 *       enabled: boolean;
 *       certPath: string;
 *     };
 *   };
 *   database: {
 *     connections: Array<{
 *       name: string;
 *       url: string;
 *       pool: {
 *         min: number;
 *         max: number;
 *       };
 *     }>;
 *   };
 * }
 *
 * type FlatConfig = FlattenEntity<AppConfig>;
 *
 * // Environment variable mapping
 * const envMapping: Record<string, keyof FlatConfig> = {
 *   'SERVER_HOST': '$server.$host',
 *   'SERVER_PORT': '$server.$port',
 *   'SSL_ENABLED': '$server.$ssl.$enabled',
 *   'DB_CONNECTION_NAME': '$database.$connections.$name',           // Any connection
 *   'DB_CONNECTION_0_NAME': '$database.$connections.[0].$name',     // First connection
 *   'DB_POOL_MIN': '$database.$connections.$pool.$min',             // Any connection pool
 *   'DB_POOL_0_MIN': '$database.$connections.[0].$pool.$min',       // First connection pool
 * };
 * ```
 *
 * @example Form field mapping:
 * ```typescript
 * type FormData = {
 *   personal: {
 *     name: string;
 *     email: string;
 *     address: {
 *       street: string;
 *       city: string;
 *       zipCode: string;
 *     };
 *   };
 *   preferences: {
 *     notifications: Array<{
 *       type: 'email' | 'sms';
 *       enabled: boolean;
 *     }>;
 *   };
 * }
 *
 * type FlatForm = FlattenEntity<FormData>;
 *
 * // Form validation using flattened keys
 * const validators: Partial<Record<keyof FlatForm, (value: any) => boolean>> = {
 *   '$personal.$name': (value) => typeof value === 'string' && value.length > 0,
 *   '$personal.$email': (value) => /\S+@\S+\.\S+/.test(value),
 *   '$personal.$address.$zipCode': (value) => /^\d{5}$/.test(value),
 *   // ... other validators
 * };
 * ```
 */
export type FlattenEntity<
  T extends Record<string, unknown>,
  KeyPrefix extends string = '',
  Identifier extends string = '$',
> = UnionToIntersection<
  {
    // Sub-object — but ONLY recurse for fixed-shape objects. Open
    // records (`Record<string, X>`, `{ [k: string]: X }`) have
    // `string extends keyof T[K]` and represent "opaque payloads"
    // (JSON columns, freeform dictionaries) that should be treated
    // as leaf values, not flattened into per-key paths.
    [K in keyof T]: T[K] extends Record<string, unknown>
      ? string extends keyof T[K] ? {
          [
            KK in KeyPrefix extends ''
              ? (K extends `${Identifier}${string}` ? K & string
                : `${Identifier}${K & string}`)
              : `${Identifier}${KeyPrefix}.${Identifier}${K & string}`
          ]: T[K];
        }
      : FlattenEntity<
        T[K],
        KeyPrefix extends '' ? `${K & string}`
          : `${KeyPrefix}.${Identifier}${K & string}`,
        Identifier
      >
      // Array of sub objects - generate BOTH variants
      : T[K] extends Array<infer U> ? U extends Record<string, unknown>
          // Union of both: contains query and indexed access
          ? (
            // Variant 1: For contains/includes queries (any element)
            & FlattenEntity<
              U,
              KeyPrefix extends '' ? `${K & string}`
                : `${KeyPrefix}.${Identifier}${K & string}`,
              Identifier
            >
            // Variant 2: For specific index access
            & FlattenEntity<
              U,
              KeyPrefix extends '' ? `${K & string}.[${number}]`
                : `${KeyPrefix}.${Identifier}${K & string}.[${number}]`,
              Identifier
            >
          )
          // Array of primitives - keep as is
        : {
          [
            KK in KeyPrefix extends ''
              ? (K extends `${Identifier}${string}` ? K & string
                : `${Identifier}${K & string}`)
              : `${Identifier}${KeyPrefix}.${Identifier}${K & string}`
          ]: T[K];
        }
      // Normal value
      : {
        [
          KK in KeyPrefix extends ''
            ? (K extends `${Identifier}${string}` ? K & string
              : `${Identifier}${K & string}`)
            : `${Identifier}${KeyPrefix}.${Identifier}${K & string}`
        ]: T[K];
      };
  }[keyof T] extends infer O ? { [P in keyof O]: O[P] } : never
> extends infer O ? { [P in keyof O]: O[P] } : never;
