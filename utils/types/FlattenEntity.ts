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
 * interface User {
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
 * }
 *
 * type FlatUser = FlattenEntity<User>;
 * // Result: {
 * //   $id: number;
 * //   $profile.$name: string;
 * //   $profile.$email: string;
 * //   $profile.$settings.$theme: 'light' | 'dark';
 * //   $profile.$settings.$notifications: boolean;
 * //   $posts.$title: string;
 * //   $posts.$content: string;
 * // }
 * ```
 *
 * @example Database mapping:
 * ```typescript
 * interface OrderEntity {
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
 * }
 *
 * type FlatOrder = FlattenEntity<OrderEntity>;
 *
 * // Database insert function
 * function insertFlatOrder(order: FlatOrder): void {
 *   // Fields like $orderId, $customer.$name, $items.$productId are available
 * }
 * ```
 */

import type { UnionToIntersection } from './UnionToIntersection.ts';
import type { UnArray } from '@tundralibs/utils';

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
 * - Array items: `${Identifier}arrayName.${Identifier}itemProperty` (e.g., `$arrayName.$itemProperty`)
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
 * interface Config {
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
 * interface ApiResponse {
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
 * // $data.$users.$id: string
 * // $data.$users.$profile.$firstName: string
 * // $data.$users.$profile.$avatar.$url: string
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
 * interface AppConfig {
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
 *   'DB_CONNECTION_NAME': '$database.$connections.$name',
 *   'DB_POOL_MIN': '$database.$connections.$pool.$min',
 * };
 * ```
 *
 * @example Form field mapping:
 * ```typescript
 * interface FormData {
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
 * const validators: Record<keyof FlatForm, (value: any) => boolean> = {
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
    // Simple sub object
    [K in keyof T]: T[K] extends Record<string, unknown> ? FlattenEntity<
        T[K],
        KeyPrefix extends '' ? `${K & string}`
          : `${KeyPrefix}.${Identifier}${K & string}`,
        Identifier
      >
      // Array of sub objects
      : T[K] extends Array<Record<string, unknown>> ? FlattenEntity<
          UnArray<T[K]>,
          KeyPrefix extends '' ? `${K & string}`
            : `${KeyPrefix}.$${K & string}`,
          Identifier
        >
      // Normal value
      : {
        [
          KK in KeyPrefix extends '' ? `${Identifier}${K & string}`
            : `${Identifier}${KeyPrefix}.${Identifier}${K & string}`
        ]: T[K];
      };
  }[keyof T] extends infer O ? { [P in keyof O]: O[P] } : never
> extends infer O ? { [P in keyof O]: O[P] } : never;
