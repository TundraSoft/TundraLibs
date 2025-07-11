/**
 * @fileoverview Utility type for selectively making object properties required.
 *
 * This module provides the `MakeRequired` utility type, which enables precise
 * control over property requirements by converting only specific optional
 * properties to required while leaving others unchanged. This is crucial for
 * form validation, API contracts, and progressive data collection scenarios.
 *
 * **Key Features:**
 * - Selective required property conversion
 * - Preserves all other property characteristics (types, readonly, etc.)
 * - Type-safe key specification with compile-time validation
 * - Zero runtime overhead (compile-time only)
 * - Perfect for form validation and API design
 *
 * **Use Cases:**
 * - Form validation with progressive required fields
 * - API endpoint parameter validation
 * - Configuration validation with environment-specific requirements
 * - Database entity validation for different operations
 * - Multi-step form data collection
 *
 * @example Basic required conversion:
 * ```typescript
 * interface UserProfile {
 *   id: string;
 *   name?: string;
 *   email?: string;
 *   phone?: string;
 *   avatar?: string;
 * }
 *
 * type RequiredProfile = MakeRequired<UserProfile, 'name' | 'email'>;
 * // Result: {
 * //   id: string;
 * //   name: string;     // now required
 * //   email: string;    // now required
 * //   phone?: string;   // still optional
 * //   avatar?: string;  // still optional
 * // }
 * ```
 *
 * @example API validation:
 * ```typescript
 * interface CreateUserRequest {
 *   name?: string;
 *   email?: string;
 *   password?: string;
 *   role?: 'admin' | 'user';
 *   department?: string;
 * }
 *
 * type ValidatedRequest = MakeRequired<CreateUserRequest, 'name' | 'email' | 'password'>;
 * // Ensures critical fields are present before processing
 * ```
 */

/**
 * Creates a new type by making specified properties of the input type required.
 *
 * This utility type converts specified optional properties to required properties
 * while preserving all other characteristics of the type. It's particularly useful
 * for validation scenarios where certain fields become mandatory based on context,
 * business rules, or progressive form completion.
 *
 * **Algorithm:**
 * 1. Uses Required<Pick<T, K>> to make selected properties required
 * 2. Uses Omit<T, K> to get all other properties unchanged
 * 3. Combines them with intersection (&) to create the final type
 * 4. Pick extracts only the specified properties
 * 5. Required removes optionality from those properties
 * 6. Intersection merges required properties with unchanged properties
 *
 * **Type Safety:**
 * - Ensures K extends keyof T for valid property selection
 * - Preserves exact property types (no type widening)
 * - Maintains readonly modifiers and other property characteristics
 * - Provides compile-time validation of property existence
 *
 * **Performance:**
 * - Compile-time only operation (zero runtime cost)
 * - Efficient for any reasonable number of properties
 * - No impact on JavaScript output or execution
 * - TypeScript compiler optimizations apply
 *
 * @template T - The input object type
 * @template K - Union of property keys to make required (must extend keyof T)
 *
 * @example Form validation with progressive requirements:
 * ```typescript
 * interface RegistrationForm {
 *   // Basic info (always required by interface design)
 *   username: string;
 *
 *   // Progressive fields (optional initially)
 *   email?: string;
 *   firstName?: string;
 *   lastName?: string;
 *   phone?: string;
 *   address?: string;
 *   birthDate?: Date;
 * }
 *
 * // Step 1: Email verification required
 * type EmailVerifiedForm = MakeRequired<RegistrationForm, 'email'>;
 *
 * // Step 2: Personal details required
 * type PersonalDetailsForm = MakeRequired<EmailVerifiedForm, 'firstName' | 'lastName'>;
 *
 * // Step 3: Full profile completion
 * type CompleteProfile = MakeRequired<PersonalDetailsForm, 'phone' | 'address' | 'birthDate'>;
 *
 * function validateStep2(form: PersonalDetailsForm) {
 *   // TypeScript ensures firstName and lastName are present
 *   console.log(`Welcome ${form.firstName} ${form.lastName}!`);
 * }
 * ```
 *
 * @example API endpoint parameter validation:
 * ```typescript
 * interface SearchParams {
 *   query?: string;
 *   category?: string;
 *   sortBy?: 'name' | 'date' | 'relevance';
 *   page?: number;
 *   limit?: number;
 *   includeArchived?: boolean;
 * }
 *
 * // Different endpoints require different parameters
 * type BasicSearch = MakeRequired<SearchParams, 'query'>;
 * type CategorySearch = MakeRequired<SearchParams, 'query' | 'category'>;
 * type PaginatedSearch = MakeRequired<SearchParams, 'query' | 'page' | 'limit'>;
 *
 * function basicSearch(params: BasicSearch): SearchResult[] {
 *   // query is guaranteed to be present
 *   return searchDatabase(params.query, params);
 * }
 *
 * function categorySearch(params: CategorySearch): SearchResult[] {
 *   // both query and category are guaranteed to be present
 *   return searchDatabase(params.query, { ...params, category: params.category });
 * }
 * ```
 *
 * @example Database operations with context-specific requirements:
 * ```typescript
 * interface UserEntity {
 *   id?: string;
 *   email?: string;
 *   name?: string;
 *   hashedPassword?: string;
 *   createdAt?: Date;
 *   updatedAt?: Date;
 * }
 *
 * // For user creation
 * type CreateUserData = MakeRequired<UserEntity, 'email' | 'name' | 'hashedPassword'>;
 *
 * // For user updates
 * type UpdateUserData = MakeRequired<UserEntity, 'id'> & Partial<UserEntity>;
 *
 * // For authentication
 * type AuthUserData = MakeRequired<UserEntity, 'id' | 'email' | 'hashedPassword'>;
 *
 * class UserService {
 *   async createUser(userData: CreateUserData): Promise<UserEntity> {
 *     // email, name, and hashedPassword are guaranteed to be present
 *     return this.database.create({
 *       ...userData,
 *       id: generateId(),
 *       createdAt: new Date(),
 *       updatedAt: new Date()
 *     });
 *   }
 *
 *   async updateUser(userData: UpdateUserData): Promise<UserEntity> {
 *     // id is guaranteed to be present for the update operation
 *     return this.database.update(userData.id, {
 *       ...userData,
 *       updatedAt: new Date()
 *     });
 *   }
 * }
 * ```
 *
 * @example Configuration validation:
 * ```typescript
 * interface AppConfig {
 *   apiUrl?: string;
 *   apiKey?: string;
 *   dbUrl?: string;
 *   dbPassword?: string;
 *   logLevel?: 'debug' | 'info' | 'warn' | 'error';
 *   enableMetrics?: boolean;
 *   metricsPort?: number;
 * }
 *
 * // Production environment requirements
 * type ProductionConfig = MakeRequired<AppConfig, 'apiUrl' | 'apiKey' | 'dbUrl' | 'dbPassword'>;
 *
 * // Development environment requirements
 * type DevelopmentConfig = MakeRequired<AppConfig, 'apiUrl'>;
 *
 * function validateProductionConfig(config: ProductionConfig): void {
 *   // All critical production settings are guaranteed to be present
 *   if (!isValidUrl(config.apiUrl)) {
 *     throw new Error('Invalid API URL');
 *   }
 *   if (!config.apiKey.startsWith('prod_')) {
 *     throw new Error('Production API key required');
 *   }
 * }
 * ```
 *
 * @example Multi-step wizard with incremental requirements:
 * ```typescript
 * interface WizardData {
 *   step?: number;
 *   personalInfo?: {
 *     name?: string;
 *     email?: string;
 *   };
 *   preferences?: {
 *     theme?: 'light' | 'dark';
 *     notifications?: boolean;
 *   };
 *   billing?: {
 *     plan?: 'free' | 'pro' | 'enterprise';
 *     paymentMethod?: string;
 *   };
 * }
 *
 * type Step1Complete = MakeRequired<WizardData, 'step' | 'personalInfo'>;
 * type Step2Complete = MakeRequired<Step1Complete, 'preferences'>;
 * type WizardComplete = MakeRequired<Step2Complete, 'billing'>;
 *
 * function processWizardStep2(data: Step1Complete): Step2Complete {
 *   // personalInfo is guaranteed to be present from step 1
 *   return {
 *     ...data,
 *     preferences: getDefaultPreferences(data.personalInfo)
 *   };
 * }
 * ```
 */
export type MakeRequired<T, K extends keyof T> =
  & Required<Pick<T, K>>
  & Omit<T, K>;
