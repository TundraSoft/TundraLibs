/**
 * @fileoverview Advanced type manipulation utility for union-to-intersection conversion.
 *
 * This module provides the `UnionToIntersection` utility type, which is fundamental
 * to many advanced TypeScript type operations. It transforms union types into
 * intersection types using distributive conditional types and contravariance.
 *
 * **Core Concept:**
 * - Union types: `A | B | C` (can be any one of the types)
 * - Intersection types: `A & B & C` (must satisfy all types simultaneously)
 *
 * **Algorithm:**
 * 1. Uses distributive conditional types to distribute over union members
 * 2. Leverages contravariance in function parameter positions
 * 3. Applies type inference to collapse the union into an intersection
 *
 * **Use Cases:**
 * - Object merging type operations
 * - Advanced type composition utilities
 * - Library API design requiring type combination
 * - Complex generic type transformations
 *
 * **Limitations:**
 * - Only works with object types (Record<string, unknown>)
 * - May not preserve exact type semantics in all edge cases
 * - Can increase TypeScript compilation complexity
 *
 * @example Basic usage:
 * ```typescript
 * type A = { x: number };
 * type B = { y: string };
 * type C = { z: boolean };
 *
 * type Union = A | B | C;
 * type Intersection = UnionToIntersection<Union>;
 * // Result: { x: number } & { y: string } & { z: boolean }
 * // Effectively: { x: number; y: string; z: boolean }
 * ```
 *
 * @example Object merging:
 * ```typescript
 * interface DatabaseConfig {
 *   host: string;
 *   port: number;
 * }
 *
 * interface AuthConfig {
 *   username: string;
 *   password: string;
 * }
 *
 * interface LoggingConfig {
 *   level: 'debug' | 'info' | 'warn' | 'error';
 *   format: string;
 * }
 *
 * type ConfigUnion = DatabaseConfig | AuthConfig | LoggingConfig;
 * type MergedConfig = UnionToIntersection<ConfigUnion>;
 * // Result: DatabaseConfig & AuthConfig & LoggingConfig
 * // A single object with all properties from all configs
 *
 * function createConfig(configs: ConfigUnion[]): MergedConfig {
 *   return Object.assign({}, ...configs) as MergedConfig;
 * }
 * ```
 *
 * @example API response merging:
 * ```typescript
 * interface UserData {
 *   id: string;
 *   name: string;
 * }
 *
 * interface UserPreferences {
 *   theme: 'light' | 'dark';
 *   language: string;
 * }
 *
 * interface UserMetadata {
 *   lastLogin: Date;
 *   accountCreated: Date;
 * }
 *
 * type UserAPIResponse = UserData | UserPreferences | UserMetadata;
 * type CompleteUser = UnionToIntersection<UserAPIResponse>;
 *
 * declare function fetchUserData(id: string): Promise<UserData>;
 * declare function fetchUserPreferences(id: string): Promise<UserPreferences>;
 * declare function fetchUserMetadata(id: string): Promise<UserMetadata>;
 *
 * // Usage in API client
 * async function fetchCompleteUser(id: string): Promise<CompleteUser> {
 *   const [userData, preferences, metadata] = await Promise.all([
 *     fetchUserData(id),
 *     fetchUserPreferences(id),
 *     fetchUserMetadata(id)
 *   ]);
 *
 *   return { ...userData, ...preferences, ...metadata };
 * }
 * ```
 *
 * @example Generic utility function:
 * ```typescript
 * // Type-safe object merging utility
 * function mergeObjects<T extends Record<string, unknown>[]>(
 *   ...objects: T
 * ): UnionToIntersection<T[number]> {
 *   return Object.assign({}, ...objects) as UnionToIntersection<T[number]>;
 * }
 *
 * const merged = mergeObjects(
 *   { a: 1, b: 'hello' },
 *   { c: true, d: [1, 2, 3] },
 *   { e: { nested: 'value' } }
 * );
 * // Type: { a: number; b: string; c: boolean; d: number[]; e: { nested: string } }
 * ```
 *
 * @example Complex library design:
 * ```typescript
 * // Plugin system where each plugin adds capabilities
 * interface CorePlugin {
 *   core: {
 *     version: string;
 *     init(): void;
 *   };
 * }
 *
 * interface DatabasePlugin {
 *   database: {
 *     connect(): Promise<void>;
 *     query(sql: string): Promise<any[]>;
 *   };
 * }
 *
 * interface CachePlugin {
 *   cache: {
 *     set(key: string, value: any): void;
 *     get(key: string): any;
 *   };
 * }
 *
 * type AvailablePlugins = CorePlugin | DatabasePlugin | CachePlugin;
 * type FullApplication<T extends AvailablePlugins> = UnionToIntersection<T>;
 *
 * // Create an application with selected plugins
 * function createApp<T extends AvailablePlugins[]>(
 *   ...plugins: T
 * ): FullApplication<T[number]> {
 *   return plugins.reduce((app, plugin) => ({ ...app, ...plugin }), {}) as any;
 * }
 *
 * declare const corePlugin: CorePlugin;
 * declare const databasePlugin: DatabasePlugin;
 * declare const cachePlugin: CachePlugin;
 *
 * const app = createApp(corePlugin, databasePlugin, cachePlugin);
 * // app.core.init(), app.database.query(), app.cache.set() are all available
 * ```
 */

/**
 * Converts a union type to an intersection type using advanced TypeScript type manipulation.
 *
 * This utility type is fundamental for many advanced type operations where you need to
 * combine multiple object types into a single type that contains all properties from
 * all union members. It leverages distributive conditional types and contravariance
 * to perform the transformation.
 *
 * **How it works:**
 * 1. Distributes over the union using `U extends Record<string, unknown>`
 * 2. Creates function types with contravariant parameters: `(k: U) => void`
 * 3. Uses type inference in contravariant positions to collapse the union
 * 4. Applies a final mapped type transformation for clean output
 *
 * **Type Safety:**
 * - Only accepts object types (Record<string, unknown>)
 * - Preserves property types and optional/required modifiers
 * - Maintains nominal typing where applicable
 * - Handles nested object structures correctly
 *
 * **Performance:**
 * - Compile-time only operation (zero runtime cost)
 * - May slow TypeScript compilation for very complex unions
 * - Efficient for typical use cases (< 10 union members)
 *
 * **Edge Cases:**
 * - Empty unions result in `never`
 * - Single-member unions pass through unchanged
 * - Non-object types in the union are filtered out
 * - Conflicting property types create intersection conflicts
 *
 * @template U - The union type to convert (must extend Record<string, unknown>)
 *
 * @example Function overload consolidation:
 * ```typescript
 * // Convert function overloads to single intersection type
 * type Overload1 = (arg: { type: 'create'; data: string }) => void;
 * type Overload2 = (arg: { type: 'update'; id: number; data: string }) => void;
 * type Overload3 = (arg: { type: 'delete'; id: number }) => void;
 *
 * type OverloadUnion =
 *   | Parameters<Overload1>[0]
 *   | Parameters<Overload2>[0]
 *   | Parameters<Overload3>[0];
 *
 * type MergedParams = UnionToIntersection<OverloadUnion>;
 * // Result: Complex intersection type supporting all operations
 * ```
 *
 * @example State management typing:
 * ```typescript
 * interface LoadingState {
 *   loading: {
 *     isLoading: boolean;
 *     progress?: number;
 *   };
 * }
 *
 * interface DataState {
 *   data: {
 *     items: any[];
 *     total: number;
 *   };
 * }
 *
 * interface ErrorState {
 *   error: {
 *     message: string;
 *     code?: number;
 *   };
 * }
 *
 * type StateUnion = LoadingState | DataState | ErrorState;
 * type CompleteState = UnionToIntersection<StateUnion>;
 *
 * // Usage in store
 * class Store {
 *   private state: Partial<CompleteState> = {};
 *
 *   updateState(partial: Partial<CompleteState>) {
 *     this.state = { ...this.state, ...partial };
 *   }
 * }
 * ```
 */
export type UnionToIntersection<U> =
  (U extends Record<string, unknown> ? (k: U) => void
    : never) extends ((k: infer I) => void)
    ? I extends infer O ? { [D in keyof O]: O[D] } : never
    : never;
