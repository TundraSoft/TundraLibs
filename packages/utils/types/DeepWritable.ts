/**
 * Recursively removes readonly constraints from all properties of a type and its nested objects.
 *
 * This utility type creates a fully mutable version of any object type by removing
 * the `readonly` modifier from every property at every level of nesting. It's the
 * inverse of `DeepReadOnly` and is particularly useful when you need to create
 * mutable working copies of immutable data structures.
 *
 * **Key Features:**
 * - Recursive readonly removal from all nested objects
 * - Preserves original type structure and property names
 * - Works with complex nested object hierarchies
 * - Enables mutation of previously readonly types
 * - No runtime overhead - purely a TypeScript construct
 *
 * **Use Cases:**
 * - Creating mutable copies from immutable API responses
 * - Working with readonly state in mutable operations
 * - Form editing from readonly configuration objects
 * - Testing scenarios requiring mutable data
 * - Library integrations that need mutable types
 *
 * @template T - The type to make deeply writable
 *
 * @example Converting readonly data to mutable:
 * ```typescript
 * interface ReadonlyConfig {
 *   readonly database: {
 *     readonly host: string;
 *     readonly port: number;
 *     readonly credentials: {
 *       readonly username: string;
 *       readonly password: string;
 *     };
 *   };
 *   readonly server: {
 *     readonly port: number;
 *     readonly ssl: {
 *       readonly enabled: boolean;
 *       readonly cert: string;
 *     };
 *   };
 * }
 *
 * type MutableConfig = DeepWritable<ReadonlyConfig>;
 *
 * declare const readonlyConfig: ReadonlyConfig;
 * const editableConfig: MutableConfig = { ...readonlyConfig };
 *
 * // Now all properties can be modified:
 * editableConfig.database.host = 'new-host';
 * editableConfig.database.credentials.password = 'new-password';
 * editableConfig.server.ssl.enabled = false;
 * ```
 *
 * @example Form editing with readonly initial data:
 * ```typescript
 * interface UserProfile {
 *   readonly id: number;
 *   readonly personal: {
 *     readonly name: string;
 *     readonly email: string;
 *     readonly address: {
 *       readonly street: string;
 *       readonly city: string;
 *       readonly country: string;
 *     };
 *   };
 *   readonly preferences: {
 *     readonly theme: 'light' | 'dark';
 *     readonly notifications: readonly string[];
 *   };
 * }
 *
 * type EditableProfile = DeepWritable<UserProfile>;
 *
 * function createEditForm(profile: UserProfile): EditableProfile {
 *   // Create a mutable copy for editing
 *   const editableProfile = structuredClone(profile) as EditableProfile;
 *
 *   // Now we can modify all properties for form editing
 *   editableProfile.personal.name = 'Updated Name';
 *   editableProfile.personal.address.city = 'New City';
 *   editableProfile.preferences.notifications.push('email');
 *
 *   return editableProfile;
 * }
 * ```
 *
 * @example API response processing:
 * ```typescript
 * interface ReadonlyApiResponse {
 *   readonly data: {
 *     readonly users: readonly {
 *       readonly id: number;
 *       readonly name: string;
 *       readonly metadata: {
 *         readonly created: string;
 *         readonly tags: readonly string[];
 *       };
 *     }[];
 *   };
 *   readonly meta: {
 *     readonly total: number;
 *     readonly page: number;
 *   };
 * }
 *
 * type ProcessableResponse = DeepWritable<ReadonlyApiResponse>;
 *
 * function processApiResponse(response: ReadonlyApiResponse): ProcessableResponse {
 *   const mutable = structuredClone(response) as ProcessableResponse;
 *
 *   // Add computed properties or modify data
 *   mutable.data.users.forEach(user => {
 *     user.metadata.tags.push('processed');
 *     user.name = user.name.trim();
 *   });
 *
 *   return mutable;
 * }
 * ```
 *
 * @example State management with readonly state:
 * ```typescript
 * interface ReadonlyAppState {
 *   readonly user: {
 *     readonly id: number;
 *     readonly profile: {
 *       readonly name: string;
 *       readonly settings: {
 *         readonly theme: string;
 *         readonly permissions: readonly string[];
 *       };
 *     };
 *   } | null;
 *   readonly ui: {
 *     readonly loading: boolean;
 *     readonly errors: readonly string[];
 *   };
 * }
 *
 * type MutableAppState = DeepWritable<ReadonlyAppState>;
 *
 * function createDraftState(state: ReadonlyAppState): MutableAppState {
 *   const draft = structuredClone(state) as MutableAppState;
 *
 *   // Can now modify the draft for state updates
 *   if (draft.user) {
 *     draft.user.profile.settings.theme = 'dark';
 *     draft.user.profile.settings.permissions.push('admin');
 *   }
 *   draft.ui.loading = false;
 *   draft.ui.errors.splice(0); // Clear errors
 *
 *   return draft;
 * }
 * ```
 *
 * @example Testing with mutable data:
 * ```typescript
 * interface ReadonlyTestData {
 *   readonly config: {
 *     readonly timeout: number;
 *     readonly retries: number;
 *   };
 *   readonly scenarios: readonly {
 *     readonly name: string;
 *     readonly steps: readonly string[];
 *   }[];
 * }
 *
 * function setupTest(baseData: ReadonlyTestData) {
 *   const testData = structuredClone(baseData) as DeepWritable<ReadonlyTestData>;
 *
 *   // Modify for specific test requirements
 *   testData.config.timeout = 5000;
 *   testData.scenarios[0].steps.push('cleanup');
 *
 *   return testData;
 * }
 * ```
 *
 * **Type Behavior:**
 * - Removes `readonly` modifiers from all object properties
 * - Recursively processes nested objects and arrays
 * - Preserves original type structure and relationships
 * - Works with complex generic types and unions
 * - Maintains property optionality (? modifiers)
 *
 * **Best Practices:**
 * - Use `structuredClone()` or similar deep cloning when creating mutable copies
 * - Be cautious about reference sharing between readonly and mutable versions
 * - Consider using Immer or similar libraries for complex state mutations
 * - Document when and why readonly constraints are being removed
 *
 * **Limitations:**
 * - Only removes compile-time readonly constraints
 * - Doesn't handle runtime immutability (Object.freeze, etc.)
 * - May not work perfectly with very complex mapped types
 * - Requires careful handling of shared references
 */
export type DeepWritable<T> =
  { -readonly [P in keyof T]: DeepWritable<T[P]> } extends infer O
    ? { [K in keyof O]: O[K] }
    : never;
