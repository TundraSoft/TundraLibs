/**
 * Recursively applies readonly constraints to all properties of a type and its nested objects.
 *
 * This utility type creates a deeply immutable version of any object type by applying
 * the `readonly` modifier to every property at every level of nesting. It's particularly
 * useful for creating immutable data structures and ensuring compile-time safety
 * against accidental mutations.
 *
 * **Key Features:**
 * - Recursive readonly application to all nested objects
 * - Preserves original type structure and property names
 * - Works with complex nested object hierarchies
 * - Compile-time immutability guarantees
 * - No runtime overhead - purely a TypeScript construct
 *
 * **Use Cases:**
 * - Immutable data structures for state management
 * - API response types that shouldn't be modified
 * - Configuration objects that need protection
 * - Functional programming patterns
 * - Redux/Flux state shape definitions
 *
 * @template T - The type to make deeply readonly
 *
 * @example Basic usage with nested objects:
 * ```typescript
 * interface User {
 *   id: number;
 *   name: string;
 *   profile: {
 *     email: string;
 *     preferences: {
 *       theme: 'light' | 'dark';
 *       notifications: boolean;
 *     };
 *   };
 * }
 *
 * type ImmutableUser = DeepReadOnly<User>;
 *
 * declare const user: ImmutableUser;
 * // All of these would cause TypeScript errors:
 * // user.name = 'John';                              // Error: readonly
 * // user.profile.email = 'new@email.com';           // Error: readonly
 * // user.profile.preferences.theme = 'dark';        // Error: readonly
 * ```
 *
 * @example State management with immutable data:
 * ```typescript
 * interface User {
 *   id: number;
 *   name: string;
 * }
 *
 * interface AppState {
 *   user: User | null;
 *   settings: {
 *     language: string;
 *     features: Record<string, boolean>;
 *   };
 *   cache: Map<string, any>;
 * }
 *
 * type ImmutableAppState = DeepReadOnly<AppState>;
 *
 * // In a Redux reducer or state manager
 * function updateUser(state: ImmutableAppState, newUser: User): ImmutableAppState {
 *   // Must return new state object - can't mutate existing
 *   return {
 *     ...state,
 *     user: newUser
 *   };
 * }
 * ```
 *
 * @example API response types:
 * ```typescript
 * interface User {
 *   id: number;
 *   name: string;
 * }
 *
 * interface ApiResponse<T> {
 *   data: T;
 *   meta: {
 *     timestamp: string;
 *     requestId: string;
 *   };
 * }
 *
 * type ImmutableApiResponse<T> = DeepReadOnly<ApiResponse<T>>;
 *
 * async function fetchUserData(): Promise<ImmutableApiResponse<User>> {
 *   const response = await fetch('/api/user');
 *   return response.json(); // Response cannot be accidentally modified
 * }
 * ```
 *
 * @example Configuration objects:
 * ```typescript
 * interface DatabaseConfig {
 *   host: string;
 *   port: number;
 *   credentials: {
 *     username: string;
 *     password: string;
 *   };
 *   options: {
 *     ssl: boolean;
 *     timeout: number;
 *   };
 * }
 *
 * const config: DeepReadOnly<DatabaseConfig> = {
 *   host: 'localhost',
 *   port: 5432,
 *   credentials: {
 *     username: 'admin',
 *     password: 'secret'
 *   },
 *   options: {
 *     ssl: true,
 *     timeout: 30000
 *   }
 * };
 *
 * // Compile-time protection against accidental modification
 * // config.credentials.password = 'new-password'; // TypeScript Error!
 * ```
 *
 * @example Working with arrays and collections:
 * ```typescript
 * interface TodoList {
 *   items: Array<{
 *     id: number;
 *     text: string;
 *     completed: boolean;
 *     tags: string[];
 *   }>;
 *   metadata: {
 *     created: Date;
 *     lastModified: Date;
 *   };
 * }
 *
 * type ImmutableTodoList = DeepReadOnly<TodoList>;
 *
 * declare const todos: ImmutableTodoList;
 * // All properties are deeply readonly:
 * // todos.items[0].text = 'Updated';           // Error
 * // todos.items[0].tags.push('new-tag');      // Error
 * // todos.metadata.lastModified = new Date(); // Error
 * ```
 *
 * **Type Behavior:**
 * - Primitive types remain unchanged (string, number, boolean, etc.)
 * - Object properties become `readonly`
 * - Array elements become readonly (though array methods are still available)
 * - Nested objects are recursively processed
 * - Function types remain callable but their properties become readonly
 *
 * **Limitations:**
 * - Only provides compile-time immutability (runtime mutations still possible)
 * - May not work perfectly with very complex generic types
 * - Doesn't prevent mutations through type assertions
 * - Some utility methods on arrays/objects remain mutable at runtime
 */
export type DeepReadOnly<T> = { readonly [P in keyof T]: DeepReadOnly<T[P]> };
