/**
 * @fileoverview Utility type for selectively making object properties readonly.
 *
 * This module provides the `MakeReadOnly` utility type, which enables fine-grained
 * control over immutability by making only specific properties of an object type
 * readonly while leaving others mutable. This is essential for creating partially
 * immutable data structures and enforcing business rules at the type level.
 *
 * **Key Features:**
 * - Selective readonly property application
 * - Preserves all other property characteristics (optional, required, etc.)
 * - Type-safe key specification with IntelliSense support
 * - Zero runtime overhead (compile-time only)
 * - Handles edge cases gracefully
 *
 * **Use Cases:**
 * - Configuration objects with immutable core settings
 * - Entity types with protected ID fields
 * - State management with immutable keys
 * - API response types with readonly metadata
 * - Form validation with protected fields
 *
 * @example Basic readonly conversion:
 * ```typescript
 * interface User {
 *   id: number;
 *   name: string;
 *   email: string;
 *   role: 'admin' | 'user';
 * }
 *
 * type ProtectedUser = MakeReadOnly<User, 'id' | 'role'>;
 * // Result: {
 * //   readonly id: number;
 * //   name: string;
 * //   email: string;
 * //   readonly role: 'admin' | 'user';
 * // }
 * ```
 *
 * @example Database entity protection:
 * ```typescript
 * interface DatabaseEntity {
 *   id: string;
 *   createdAt: Date;
 *   updatedAt: Date;
 *   version: number;
 *   data: Record<string, any>;
 * }
 *
 * type ImmutableEntity = MakeReadOnly<DatabaseEntity, 'id' | 'createdAt' | 'version'>;
 * // Protects system-managed fields while allowing data updates
 * ```
 */

/**
 * Creates a new type that makes specified properties of an object readonly.
 *
 * This utility type provides selective immutability by converting only the
 * specified properties to readonly while preserving the mutability of all
 * other properties. It's particularly useful for creating data structures
 * where certain fields should be protected from modification.
 *
 * **Algorithm:**
 * 1. Uses conditional types to check if K extends keyof T
 * 2. If true: creates intersection of Readonly<Pick<T, K>> & Omit<T, K>
 * 3. If false: returns the original type T unchanged
 * 4. Pick selects the specified properties, Readonly makes them readonly
 * 5. Omit removes specified properties, then intersection combines them
 *
 * **Type Safety:**
 * - Ensures K extends keyof T for valid property selection
 * - Handles cases where K includes non-existent properties gracefully
 * - Preserves optional/required modifiers on non-targeted properties
 * - Maintains original property types exactly
 *
 * **Performance:**
 * - Compile-time only operation (zero runtime cost)
 * - Efficient for reasonable numbers of properties
 * - No impact on JavaScript output or bundle size
 *
 * @template T - The original object type
 * @template K - Union of property keys to make readonly (extends keyof T | unknown)
 *
 * @example Configuration management:
 * ```typescript
 * interface AppConfig {
 *   apiUrl: string;
 *   apiKey: string;
 *   debug: boolean;
 *   features: string[];
 *   version: string;
 * }
 *
 * type ImmutableConfig = MakeReadOnly<AppConfig, 'apiUrl' | 'version'>;
 *
 * const config: ImmutableConfig = {
 *   apiUrl: 'https://api.example.com',  // readonly
 *   apiKey: 'secret-key',
 *   debug: true,
 *   features: ['feature1'],
 *   version: '1.0.0'  // readonly
 * };
 *
 * // config.apiUrl = 'new-url';  // ❌ Error: Cannot assign to readonly property
 * config.debug = false;          // ✅ OK: debug is still mutable
 * config.features.push('feature2'); // ✅ OK: features array is mutable
 * ```
 *
 * @example User profile with protected fields:
 * ```typescript
 * interface UserProfile {
 *   userId: string;
 *   username: string;
 *   email: string;
 *   displayName: string;
 *   avatar?: string;
 *   lastLogin: Date;
 *   accountType: 'free' | 'premium';
 * }
 *
 * type EditableProfile = MakeReadOnly<UserProfile, 'userId' | 'lastLogin' | 'accountType'>;
 *
 * function updateProfile(profile: EditableProfile, updates: Partial<Omit<EditableProfile, 'userId' | 'lastLogin' | 'accountType'>>) {
 *   // Can only update mutable fields
 *   return { ...profile, ...updates };
 * }
 * ```
 *
 * @example API response with immutable metadata:
 * ```typescript
 * interface User {
 *   id: number;
 * }
 *
 * declare const users: User[];
 * declare const newUsers: User[];
 *
 * interface APIResponse<T> {
 *   data: T;
 *   timestamp: string;
 *   requestId: string;
 *   status: number;
 *   cached: boolean;
 * }
 *
 * type ImmutableResponse<T> = MakeReadOnly<APIResponse<T>, 'timestamp' | 'requestId' | 'status'>;
 *
 * const response: ImmutableResponse<User[]> = {
 *   data: users,
 *   timestamp: '2025-01-01T00:00:00Z',  // readonly
 *   requestId: 'req-123',               // readonly
 *   status: 200,                        // readonly
 *   cached: false                       // mutable
 * };
 *
 * // response.status = 404;           // ❌ Error: status is readonly
 * response.cached = true;             // ✅ OK: cached is mutable
 * response.data = newUsers;           // ✅ OK: data is mutable
 * ```
 *
 * @example State management with immutable keys:
 * ```typescript
 * interface ApplicationState {
 *   sessionId: string;
 *   userId: string;
 *   currentRoute: string;
 *   isAuthenticated: boolean;
 *   preferences: Record<string, string>;
 *   temporaryData: Record<string, any>;
 * }
 *
 * type ProtectedState = MakeReadOnly<ApplicationState, 'sessionId' | 'userId'>;
 *
 * class StateManager {
 *   constructor(private state: ProtectedState) {}
 *
 *   updateState(updates: Partial<Omit<ProtectedState, 'sessionId' | 'userId'>>) {
 *     // Cannot accidentally modify protected system identifiers
 *     this.state = { ...this.state, ...updates };
 *   }
 * }
 * ```
 *
 * @example Edge case handling:
 * ```typescript
 * interface TestType {
 *   a: string;
 *   b: number;
 * }
 *
 * // Valid key specification
 * type Valid = MakeReadOnly<TestType, 'a'>;
 * // Result: { readonly a: string; b: number; }
 *
 * // Invalid key specification (handled gracefully)
 * type Invalid = MakeReadOnly<TestType, 'nonexistent'>;
 * // Result: TestType (unchanged)
 *
 * // Empty key specification
 * type Empty = MakeReadOnly<TestType, never>;
 * // Result: TestType (unchanged)
 * ```
 */
export type MakeReadOnly<T, K extends keyof T | unknown> = K extends keyof T // NOSONAR
  ? Readonly<Pick<T, K>> & Omit<T, K>
  : T;
