/**
 * @fileoverview Advanced path-based type utilities for nested object access.
 *
 * This module provides TypeScript utilities for working with object paths using
 * dot notation. These types enable type-safe access to deeply nested properties
 * and are commonly used in configuration systems, form libraries, and data
 * transformation utilities.
 *
 * **Key Features:**
 * - Type-safe path generation for nested objects
 * - Automatic path string literal type inference
 * - Support for arbitrarily deep nesting
 * - Full TypeScript IntelliSense support
 * - Compile-time path validation
 *
 * **Use Cases:**
 * - Configuration management systems
 * - Form field path generation
 * - Object property observers/watchers
 * - Data binding utilities
 * - API response transformation
 *
 * @example Basic usage:
 * ```typescript
 * interface Config {
 *   database: {
 *     host: string;
 *     port: number;
 *     credentials: {
 *       username: string;
 *       password: string;
 *     };
 *   };
 *   logging: {
 *     level: 'debug' | 'info' | 'warn' | 'error';
 *   };
 * }
 *
 * type ConfigPaths = Paths<Config>;
 * // Result: {
 * //   database: Config['database'];
 * //   'database.host': string;
 * //   'database.port': number;
 * //   'database.credentials': Config['database']['credentials'];
 * //   'database.credentials.username': string;
 * //   'database.credentials.password': string;
 * //   logging: Config['logging'];
 * //   'logging.level': 'debug' | 'info' | 'warn' | 'error';
 * // }
 * ```
 */

import { UnionToIntersection } from './UnionToIntersection.ts';

/**
 * Recursively generates all possible paths through an object type using dot notation.
 *
 * This utility type creates a new type where each property represents a valid path
 * through the original object. For nested objects, it generates both the intermediate
 * paths and the full paths to leaf values.
 *
 * **Algorithm:**
 * 1. For each property in the object, check if it's a nested object
 * 2. If nested, recursively generate paths for the nested object
 * 3. Combine parent and child paths using dot notation
 * 4. Use UnionToIntersection to merge all possible paths
 *
 * **Performance Considerations:**
 * - Compile-time only - no runtime overhead
 * - May increase TypeScript compilation time for very deep objects
 * - Recommended for objects with reasonable nesting depth (< 10 levels)
 *
 * @template T - The object type to generate paths for (must extend Record<string, unknown>)
 * @template KeyPrefix - Internal parameter for recursive path building (default: '')
 *
 * @example Form field paths:
 * ```typescript
 * interface UserForm {
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
 *     theme: 'light' | 'dark';
 *     notifications: boolean;
 *   };
 * }
 *
 * type FormPaths = Paths<UserForm>;
 *
 * // Usage in form library
 * function getFieldValue<P extends keyof FormPaths>(
 *   form: UserForm,
 *   path: P
 * ): FormPaths[P] {
 *   // Implementation would parse the path and return the value
 * }
 *
 * const email = getFieldValue(form, 'personal.email'); // Type: string
 * const theme = getFieldValue(form, 'preferences.theme'); // Type: 'light' | 'dark'
 * ```
 *
 * @example Configuration access:
 * ```typescript
 * interface DatabaseConfig {
 *   connection: {
 *     host: string;
 *     port: number;
 *     ssl: {
 *       enabled: boolean;
 *       cert: string;
 *     };
 *   };
 * }
 *
 * type ConfigPaths = Paths<DatabaseConfig>;
 *
 * // Type-safe configuration getter
 * function getConfig<P extends keyof ConfigPaths>(
 *   path: P
 * ): ConfigPaths[P] {
 *   // Implementation would resolve the configuration value
 * }
 *
 * const port = getConfig('connection.port'); // Type: number
 * const sslEnabled = getConfig('connection.ssl.enabled'); // Type: boolean
 * ```
 */
export type Paths<
  T extends Record<string, unknown>,
  KeyPrefix extends string = '',
> = UnionToIntersection<
  {
    [K in keyof T]: T[K] extends Record<string, unknown> ?
        & Paths<
          T[K],
          KeyPrefix extends '' ? `${K & string}` : `${KeyPrefix}.${K & string}`
        >
        & {
          [KK in KeyPrefix extends '' ? K : `${KeyPrefix}.${K & string}`]: T[K];
        }
      : {
        [KK in KeyPrefix extends '' ? K : `${KeyPrefix}.${K & string}`]: T[K];
      };
  }[keyof T] extends infer O ? { [P in keyof O]: O[P] } : never
> extends infer O ? { [P in keyof O]: O[P] } : never;

/**
 * Utility type that resolves the type of a value at a specific path in an object.
 * Handles nested properties using dot notation (e.g., 'logger.format.name').
 *
 * This type performs compile-time path resolution to determine the exact type
 * of a value at any depth within an object structure. It's the counterpart to
 * the Paths type, providing type-safe value extraction.
 *
 * **Algorithm:**
 * 1. Check if the path is a direct property of T
 * 2. If not, split the path on the first dot
 * 3. Recursively resolve the remaining path in the nested object
 * 4. Return appropriate fallback types for invalid paths
 *
 * **Type Safety:**
 * - Provides exact types for valid paths
 * - Returns fallback types for invalid or malformed paths
 * - Handles edge cases like missing properties gracefully
 *
 * **Performance:**
 * - Compile-time only resolution
 * - No runtime overhead
 * - Efficient for reasonable object depths
 *
 * @template T - The object type to get a value from
 * @template P - The string path to the desired property (dot-separated)
 *
 * @example Basic property access:
 * ```typescript
 * interface Settings {
 *   app: {
 *     name: string;
 *     version: string;
 *     features: {
 *       darkMode: boolean;
 *       notifications: boolean;
 *     };
 *   };
 *   user: {
 *     id: number;
 *     email: string;
 *   };
 * }
 *
 * type AppName = PathValue<Settings, 'app.name'>; // string
 * type DarkMode = PathValue<Settings, 'app.features.darkMode'>; // boolean
 * type UserId = PathValue<Settings, 'user.id'>; // number
 * ```
 *
 * @example Generic path value getter:
 * ```typescript
 * function getValue<T, P extends string>(
 *   obj: T,
 *   path: P
 * ): PathValue<T, P> {
 *   const keys = path.split('.');
 *   let current: any = obj;
 *
 *   for (const key of keys) {
 *     if (current && typeof current === 'object' && key in current) {
 *       current = current[key];
 *     } else {
 *       return undefined as any; // Path doesn't exist
 *     }
 *   }
 *
 *   return current;
 * }
 *
 * const settings: Settings = {
 *   app: { name: 'MyApp', version: '1.0.0', features: { darkMode: true, notifications: false } },
 *   user: { id: 123, email: 'user@example.com' }
 * };
 *
 * const appName = getValue(settings, 'app.name'); // Type: string, Value: 'MyApp'
 * const darkMode = getValue(settings, 'app.features.darkMode'); // Type: boolean, Value: true
 * ```
 *
 * @example With configuration validation:
 * ```typescript
 * interface Config {
 *   database: {
 *     host: string;
 *     port: number;
 *     options: {
 *       ssl: boolean;
 *       timeout: number;
 *     };
 *   };
 * }
 *
 * // Type-safe configuration validator
 * function validateConfigPath<P extends string>(
 *   config: Config,
 *   path: P,
 *   expectedType: string
 * ): PathValue<Config, P> | null {
 *   const value = getValue(config, path);
 *   return typeof value === expectedType ? value : null;
 * }
 *
 * const host = validateConfigPath(config, 'database.host', 'string'); // string | null
 * const port = validateConfigPath(config, 'database.port', 'number'); // number | null
 * ```
 */
export type PathValue<T, P extends string> = P extends keyof T ? T[P]
  : P extends `${infer K}.${infer Rest}`
    ? K extends keyof T
      ? T[K] extends Record<string, unknown> ? PathValue<T[K], Rest>
      : never
    : never
  : never;
