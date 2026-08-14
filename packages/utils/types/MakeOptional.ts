/**
 * Creates a new type by making specified properties optional while keeping others required.
 *
 * This utility type allows you to selectively make specific properties optional
 * in an existing type, which is particularly useful for creating flexible APIs,
 * update operations, and configuration objects where only some fields are required.
 *
 * **Key Features:**
 * - Selective optional property transformation
 * - Preserves original type structure for non-specified properties
 * - Maintains type safety and intellisense support
 * - Composes well with other utility types
 * - Zero runtime overhead
 *
 * **Use Cases:**
 * - API endpoints with optional parameters
 * - Update/patch operations where not all fields are required
 * - Configuration objects with sensible defaults
 * - Form data where some fields are optional
 * - Database entity updates
 *
 * @template T - The original type
 * @template K - Union of keys from T to make optional
 *
 * @example Basic usage with user interface:
 * ```typescript
 * interface User {
 *   id: number;
 *   name: string;
 *   email: string;
 *   phone: string;
 *   address: string;
 * }
 *
 * // Make phone and address optional for user creation
 * type CreateUserRequest = MakeOptional<User, 'phone' | 'address'>;
 * // Result: {
 * //   id: number;
 * //   name: string;
 * //   email: string;
 * //   phone?: string;
 * //   address?: string;
 * // }
 *
 * function createUser(userData: CreateUserRequest): User {
 *   return {
 *     ...userData,
 *     phone: userData.phone ?? '',
 *     address: userData.address ?? ''
 *   };
 * }
 *
 * // Valid calls:
 * createUser({ id: 1, name: 'John', email: 'john@example.com' });
 * createUser({ id: 1, name: 'John', email: 'john@example.com', phone: '123-456-7890' });
 * ```
 *
 * @example Database entity updates:
 * ```typescript
 * interface Product {
 *   id: number;
 *   name: string;
 *   price: number;
 *   description: string;
 *   category: string;
 *   inStock: boolean;
 *   createdAt: Date;
 *   updatedAt: Date;
 * }
 *
 * // For updates, make all fields except id optional
 * type ProductUpdate = MakeOptional<Product, Exclude<keyof Product, 'id'>>;
 * // or more specifically:
 * type ProductPatch = MakeOptional<Product, 'name' | 'price' | 'description' | 'category' | 'inStock'>;
 *
 * declare function getProduct(id: number): Promise<Product>;
 *
 * async function updateProduct(updates: ProductUpdate): Promise<Product> {
 *   const existing = await getProduct(updates.id);
 *   return {
 *     ...existing,
 *     ...updates,
 *     updatedAt: new Date()
 *   };
 * }
 *
 * // Usage:
 * updateProduct({ id: 1, price: 29.99 }); // Only update price
 * updateProduct({ id: 1, name: 'New Name', inStock: false }); // Update multiple
 * ```
 *
 * @example API request types:
 * ```typescript
 * interface SearchParams {
 *   query: string;
 *   page: number;
 *   limit: number;
 *   sortBy: string;
 *   sortOrder: 'asc' | 'desc';
 *   filters: Record<string, any>;
 * }
 *
 * type SearchResult = { id: number };
 * declare function performSearch(params: SearchParams): Promise<SearchResult[]>;
 *
 * // Make pagination and sorting optional with defaults
 * type SearchRequest = MakeOptional<SearchParams, 'page' | 'limit' | 'sortBy' | 'sortOrder'>;
 *
 * function search(params: SearchRequest): Promise<SearchResult[]> {
 *   const fullParams: SearchParams = {
 *     page: 1,
 *     limit: 20,
 *     sortBy: 'relevance',
 *     sortOrder: 'desc',
 *     ...params
 *   };
 *
 *   return performSearch(fullParams);
 * }
 *
 * // Usage:
 * search({ query: 'typescript', filters: {} }); // Use defaults
 * search({ query: 'javascript', page: 2, limit: 50, filters: {} }); // Override defaults
 * ```
 *
 * @example Configuration objects:
 * ```typescript
 * interface DatabaseConfig {
 *   host: string;
 *   port: number;
 *   database: string;
 *   username: string;
 *   password: string;
 *   ssl: boolean;
 *   maxConnections: number;
 *   timeout: number;
 * }
 *
 * declare class Connection {
 *   constructor(config: DatabaseConfig);
 * }
 *
 * // Make connection tuning parameters optional
 * type DatabaseOptions = MakeOptional<DatabaseConfig, 'ssl' | 'maxConnections' | 'timeout'>;
 *
 * function createDatabaseConnection(config: DatabaseOptions): Connection {
 *   const fullConfig: DatabaseConfig = {
 *     ssl: false,
 *     maxConnections: 10,
 *     timeout: 30000,
 *     ...config
 *   };
 *
 *   return new Connection(fullConfig);
 * }
 *
 * // Usage:
 * createDatabaseConnection({
 *   host: 'localhost',
 *   port: 5432,
 *   database: 'myapp',
 *   username: 'user',
 *   password: 'pass'
 *   // ssl, maxConnections, timeout use defaults
 * });
 * ```
 *
 * @example Form data with progressive disclosure:
 * ```typescript
 * interface RegistrationForm {
 *   username: string;
 *   email: string;
 *   password: string;
 *   firstName: string;
 *   lastName: string;
 *   birthDate: Date;
 *   newsletter: boolean;
 *   marketingEmails: boolean;
 * }
 *
 * // Step 1: Basic required information
 * type BasicRegistration = MakeOptional<RegistrationForm,
 *   'firstName' | 'lastName' | 'birthDate' | 'newsletter' | 'marketingEmails'>;
 *
 * // Step 2: Only marketing preferences optional
 * type CompleteRegistration = MakeOptional<RegistrationForm, 'newsletter' | 'marketingEmails'>;
 *
 * function validateBasicRegistration(data: BasicRegistration): boolean {
 *   return data.username.length > 0 &&
 *          data.email.includes('@') &&
 *          data.password.length >= 8;
 * }
 * ```
 *
 * @example Combining with other utility types:
 * ```typescript
 * interface ApiEntity {
 *   id: number;
 *   createdAt: Date;
 *   updatedAt: Date;
 *   name: string;
 *   description: string;
 *   status: 'active' | 'inactive';
 * }
 *
 * // For creation: exclude auto-generated fields, make description optional
 * type CreateEntityRequest = MakeOptional<
 *   Omit<ApiEntity, 'id' | 'createdAt' | 'updatedAt'>,
 *   'description'
 * >;
 *
 * // For updates: make everything except id optional
 * type UpdateEntityRequest = MakeOptional<ApiEntity, Exclude<keyof ApiEntity, 'id'>>;
 *
 * // Usage:
 * const createData: CreateEntityRequest = {
 *   name: 'New Entity',
 *   status: 'active'
 *   // description is optional
 * };
 *
 * const updateData: UpdateEntityRequest = {
 *   id: 1,
 *   status: 'inactive'
 *   // all other fields optional
 * };
 * ```
 *
 * **Type Behavior:**
 * - Uses `Omit<T, K>` to exclude the specified keys from the original type
 * - Uses `Partial<Pick<T, K>>` to make the specified keys optional
 * - Combines both using intersection (`&`) to create the final type
 * - Preserves all type information and relationships
 * - Works well with intellisense and type checking
 *
 * **Best Practices:**
 * - Use with sensible defaults for optional properties
 * - Combine with validation to ensure data integrity
 * - Document which properties are optional and their default behaviors
 * - Consider using with builder patterns for complex objects
 * - Be mindful of null vs undefined semantics
 */
export type MakeOptional<T, K extends keyof T> =
  & Omit<T, K>
  & Partial<Pick<T, K>>;
