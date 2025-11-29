import { BaseGuardian } from '../BaseGuardian.ts';
import { GuardianError } from '../GuardianError.ts';
import type { GuardianMetaData, GuardianTransform } from '../types/mod.ts';

/**
 * Helper type to infer the output type from a BaseGuardian
 */
type InferGuardianType<T> = T extends BaseGuardian<infer U> ? U : never;

/**
 * Type utility to infer the proper object type from a schema
 * This handles optional fields correctly by checking if undefined is part of the Guardian's type
 */
type InferObjectType<T extends Record<string, BaseGuardian<unknown>>> =
  & {
    [K in keyof T as undefined extends InferGuardianType<T[K]> ? never : K]:
      InferGuardianType<T[K]>;
  }
  & {
    [K in keyof T as undefined extends InferGuardianType<T[K]> ? K : never]?:
      Exclude<InferGuardianType<T[K]>, undefined>;
  };

/**
 * Type definition for object schema - maps property names to their Guardian validators
 */
export type ObjectSchema<T = Record<string, unknown>> = {
  [K in keyof T]: BaseGuardian<T[K]>;
};

/**
 * Validation mode for object validation
 */
export type ObjectValidationMode = 'passthrough' | 'strict' | 'strip';

/**
 * Type for refinement validation functions
 */
export type ObjectRefinement<T> = {
  validator: (data: T) => boolean | Promise<boolean>;
  message: string;
  path?: string;
};

/**
 * Guardian for object validation with flexible schema definition and validation modes.
 * Supports strict validation, passthrough mode, and shape transformation.
 *
 * @template TInput - The input object type before validation
 * @template TOutput - The output object type after validation and potential transformation
 *
 * @example
 * ```ts
 * // Basic object schema (passthrough mode by default)
 * const userSchema = Guardian.object({
 *   id: Guardian.number(),
 *   name: Guardian.string(),
 *   email: Guardian.string().optional()
 * });
 *
 * // Accepts: { id: 1, name: "John", email: "john@example.com", extra: "allowed" }
 * // Returns: { id: 1, name: "John", email: "john@example.com", extra: "allowed" }
 * ```
 *
 * @example
 * ```ts
 * // Strict mode - only defined properties allowed
 * const strictUser = Guardian.object({
 *   id: Guardian.number(),
 *   name: Guardian.string()
 * }).strict();
 *
 * // Accepts: { id: 1, name: "John" }
 * // Rejects: { id: 1, name: "John", extra: "not allowed" }
 * ```
 *
 * @example
 * ```ts
 * // Shape transformation
 * const transformedUser = Guardian.object({
 *   firstName: Guardian.string(),
 *   lastName: Guardian.string(),
 *   birthYear: Guardian.number()
 * }).transform((data) => ({
 *   fullName: `${data.firstName} ${data.lastName}`,
 *   age: new Date().getFullYear() - data.birthYear
 * }));
 * ```
 *
 * @example
 * ```ts
 * // Complex validation with refine
 * const registerSchema = Guardian.object({
 *   email: Guardian.string().email(),
 *   password: Guardian.string().min(8),
 *   confirmPassword: Guardian.string()
 * }).refine(
 *   (data) => data.password === data.confirmPassword,
 *   'Passwords do not match'
 * );
 * ```
 *
 * @since 1.0.0
 */
export class ObjectGuardian<
  TInput extends Record<string, unknown>,
  TOutput extends Record<string, unknown> = TInput,
> extends BaseGuardian<TOutput> {
  protected override readonly _type = 'object';
  private readonly _schema: ObjectSchema<TInput>;
  private _mode: ObjectValidationMode = 'passthrough';
  private _refinements: Array<ObjectRefinement<TOutput>> = [];

  /**
   * Creates a new ObjectGuardian instance.
   *
   * @param schema - Object schema defining property validators (optional for anonymous objects)
   * @param metaData - Optional metadata for this guardian
   */
  constructor(schema?: ObjectSchema<TInput>, metaData?: GuardianMetaData) {
    // Use an arrow function to capture the proper 'this' context
    const objectTransform: GuardianTransform<unknown, TOutput> = (
      input: unknown,
    ) => {
      return this._validateObjectWithoutRefinements(input) as TOutput;
    };

    super(objectTransform, metaData);
    this._schema = schema || {} as ObjectSchema<TInput>;
  }

  /**
   * Override parse to ensure refinements are applied after transforms.
   */
  override parse(input: unknown): TOutput {
    // First apply the composed transform (includes any chained transforms)
    const transformedResult = super.parse(input);

    // Then apply object-specific refinements to the transformed result
    return this._applyRefinements(transformedResult);
  }

  /**
   * Override parseAsync to support async refinement validations.
   */
  override async parseAsync(input: unknown): Promise<TOutput> {
    // First apply the composed transform (includes any chained transforms)
    // Note: The base transform uses _validateObjectWithoutRefinements, so no refinements are applied yet
    const transformedResult = await super.parseAsync(input);

    // Then apply object-specific refinements to the transformed result (supporting async)
    return await this._applyRefinementsAsync(transformedResult);
  }

  //#region Validation Modes

  /**
   * Sets the validation mode to strict - allows only properties defined in the schema.
   * Extra properties in the input will cause validation to fail.
   *
   * @returns This ObjectGuardian (mutated) or new instance if immutable mode
   *
   * @example
   * ```ts
   * const strictUser = Guardian.object({
   *   id: Guardian.number(),
   *   name: Guardian.string()
   * }).strict();
   *
   * strictUser.parse({ id: 1, name: "John" }); // ✅ Valid
   * strictUser.parse({ id: 1, name: "John", age: 30 }); // ❌ Extra property 'age'
   * ```
   */
  strict(): ObjectGuardian<TInput, TOutput> {
    if (this.isImmutable) {
      const cloned = this.clone();
      cloned._mode = 'strict';
      return cloned;
    } else {
      this._mode = 'strict';
      return this;
    }
  }

  /**
   * Sets the validation mode to strip - removes properties not defined in the schema.
   * Only validated properties will be present in the output.
   *
   * @returns This ObjectGuardian (mutated) or new instance if immutable mode
   *
   * @example
   * ```ts
   * const strippedUser = Guardian.object({
   *   id: Guardian.number(),
   *   name: Guardian.string()
   * }).strip();
   *
   * strippedUser.parse({ id: 1, name: "John", age: 30 });
   * // Returns: { id: 1, name: "John" } (age stripped)
   * ```
   */
  strip(): ObjectGuardian<TInput, TOutput> {
    if (this.isImmutable) {
      const cloned = this.clone();
      cloned._mode = 'strip';
      return cloned;
    } else {
      this._mode = 'strip';
      return this;
    }
  }

  //#endregion

  //#region Key Validations

  /**
   * Validates that the object contains all the specified keys with defined values.
   * This validation runs after successful schema validation and checks
   * that all specified keys are present and have non-undefined values.
   *
   * @param keys - Array of keys that must be present in the object
   * @param message - Optional custom error message
   * @returns This ObjectGuardian (mutated) or new instance if immutable mode
   *
   * @example
   * ```ts
   * const requiredFieldsUser = Guardian.object({
   *   id: Guardian.number().optional(),
   *   name: Guardian.string().optional(),
   *   email: Guardian.string().optional()
   * }).hasKeys(['id', 'name']);
   *
   * // Accepts: { id: 1, name: "John", email: "john@example.com" }
   * // Accepts: { id: 1, name: "John" }
   * // Rejects: { id: 1 } - missing 'name'
   * ```
   */
  hasKeys(
    keys: Array<string>,
    message?: string,
  ): ObjectGuardian<TInput, TOutput> {
    const defaultMessage = `Object must contain all required keys: ${
      keys.join(', ')
    }`;
    const validationMessage = message || defaultMessage;

    return this.refine(
      (data) => {
        // Check if keys have defined values (not just undefined)
        const missingKeys = keys.filter((key) => {
          return !(key in data) || data[key] === undefined;
        });

        return missingKeys.length === 0;
      },
      validationMessage,
    );
  }

  /**
   * Validates that the object does not contain any of the specified keys.
   *
   * @param keys - Array of keys that must not be present in the object
   * @param message - Optional custom error message
   * @returns This ObjectGuardian (mutated) or new instance if immutable mode
   *
   * @example
   * ```ts
   * const safeUser = Guardian.object({
   *   id: Guardian.number(),
   *   name: Guardian.string(),
   *   email: Guardian.string()
   * }).forbiddenKeys(['password', 'secret']);
   *
   * // Accepts: { id: 1, name: "John", email: "john@example.com" }
   * // Rejects: { id: 1, name: "John", password: "secret123" }
   * ```
   */
  forbiddenKeys(
    keys: Array<string>,
    message?: string,
  ): ObjectGuardian<TInput, TOutput> {
    const defaultMessage = `Object must not contain forbidden keys: ${
      keys.join(', ')
    }`;
    const validationMessage = message || defaultMessage;

    return this.refine(
      (data) => {
        const objectKeys = Object.keys(data);
        return !keys.some((key) => objectKeys.includes(key));
      },
      validationMessage,
    );
  }

  //#endregion

  //#region Schema Manipulation

  /**
   * Extends the current schema with additional properties.
   *
   * @template U - Type of the properties to add
   * @param schema - Additional schema properties
   * @returns New ObjectGuardian with extended schema
   *
   * @example
   * ```ts
   * const baseUser = Guardian.object({
   *   id: Guardian.number(),
   *   name: Guardian.string()
   * });
   *
   * const extendedUser = baseUser.extend({
   *   email: Guardian.string().email(),
   *   age: Guardian.number().optional()
   * });
   * ```
   */
  extend<U extends Record<string, unknown>>(
    schema: ObjectSchema<U>,
  ): ObjectGuardian<TInput & U, TInput & U> {
    const extendedSchema = { ...this._schema, ...schema } as ObjectSchema<
      TInput & U
    >;

    const baseClone = this.clone();
    const newGuardian = new ObjectGuardian<TInput & U, TInput & U>(
      extendedSchema,
      baseClone.metaData,
    );

    // Copy ObjectGuardian-specific properties
    newGuardian._mode = this._mode;
    newGuardian._refinements = [];

    // Copy the composed transform from the base clone
    (newGuardian as unknown as {
      _composedTransform: GuardianTransform<unknown, TInput & U>;
    })._composedTransform = (baseClone as unknown as {
      _composedTransform: GuardianTransform<unknown, TInput & U>;
    })._composedTransform;

    return newGuardian;
  }

  /**
   * Creates a new ObjectGuardian with only the specified properties.
   *
   * @template K - Keys to pick from the schema
   * @param keys - Property names to include
   * @returns New ObjectGuardian with picked properties
   *
   * @example
   * ```ts
   * const fullUser = Guardian.object({
   *   id: Guardian.number(),
   *   name: Guardian.string(),
   *   email: Guardian.string(),
   *   password: Guardian.string()
   * });
   *
   * const publicUser = fullUser.pick('id', 'name', 'email');
   * ```
   */
  pick<K extends keyof TInput>(
    ...keys: K[]
  ): ObjectGuardian<Pick<TInput, K>, Pick<TInput, K>> {
    const pickedSchema = {} as ObjectSchema<Pick<TInput, K>>;

    for (const key of keys) {
      if (key in this._schema) {
        pickedSchema[key] = this._schema[key] as BaseGuardian<
          Pick<TInput, K>[K]
        >;
      }
    }

    const baseClone = this.clone();
    const newGuardian = new ObjectGuardian<Pick<TInput, K>, Pick<TInput, K>>(
      pickedSchema,
      baseClone.metaData,
    );

    // Copy ObjectGuardian-specific properties
    newGuardian._mode = this._mode;
    newGuardian._refinements = [];

    // Copy the composed transform from the base clone
    (newGuardian as unknown as {
      _composedTransform: GuardianTransform<unknown, Pick<TInput, K>>;
    })._composedTransform = (baseClone as unknown as {
      _composedTransform: GuardianTransform<unknown, Pick<TInput, K>>;
    })._composedTransform;

    return newGuardian;
  }

  /**
   * Creates a new ObjectGuardian without the specified properties.
   *
   * @template K - Keys to omit from the schema
   * @param keys - Property names to exclude
   * @returns New ObjectGuardian without omitted properties
   *
   * @example
   * ```ts
   * const fullUser = Guardian.object({
   *   id: Guardian.number(),
   *   name: Guardian.string(),
   *   email: Guardian.string(),
   *   password: Guardian.string()
   * });
   *
   * const safeUser = fullUser.omit('password');
   * ```
   */
  omit<K extends keyof TInput>(
    ...keys: K[]
  ): ObjectGuardian<Omit<TInput, K>, Omit<TInput, K>> {
    const omittedSchema = { ...this._schema };

    for (const key of keys) {
      delete omittedSchema[key];
    }

    const baseClone = this.clone();
    const newGuardian = new ObjectGuardian<Omit<TInput, K>, Omit<TInput, K>>(
      omittedSchema as ObjectSchema<Omit<TInput, K>>,
      baseClone.metaData,
    );

    // Copy ObjectGuardian-specific properties
    newGuardian._mode = this._mode;
    newGuardian._refinements = [];

    // Copy the composed transform from the base clone
    (newGuardian as unknown as {
      _composedTransform: GuardianTransform<unknown, Omit<TInput, K>>;
    })._composedTransform = (baseClone as unknown as {
      _composedTransform: GuardianTransform<unknown, Omit<TInput, K>>;
    })._composedTransform;

    return newGuardian;
  }

  /**
   * Makes all properties in the schema optional.
   *
   * @returns New ObjectGuardian with all properties optional
   *
   * @example
   * ```ts
   * const user = Guardian.object({
   *   id: Guardian.number(),
   *   name: Guardian.string(),
   *   email: Guardian.string()
   * });
   *
   * const partialUser = user.partial();
   * // All properties become optional
   * ```
   */
  partial(): ObjectGuardian<Partial<TInput>, Partial<TInput>> {
    const partialSchema = {} as ObjectSchema<Partial<TInput>>;

    for (const [key, guard] of Object.entries(this._schema)) {
      (partialSchema as Record<string, BaseGuardian<unknown>>)[key] = guard
        .optional();
    }

    const baseClone = this.clone();
    const newGuardian = new ObjectGuardian<Partial<TInput>, Partial<TInput>>(
      partialSchema,
      baseClone.metaData,
    );

    // Copy ObjectGuardian-specific properties
    newGuardian._mode = this._mode;
    newGuardian._refinements = [];

    // Copy the composed transform from the base clone
    (newGuardian as unknown as {
      _composedTransform: GuardianTransform<unknown, Partial<TInput>>;
    })._composedTransform = (baseClone as unknown as {
      _composedTransform: GuardianTransform<unknown, Partial<TInput>>;
    })._composedTransform;

    return newGuardian;
  }

  /**
   * Makes all properties in the schema required (removes optional).
   *
   * @returns New ObjectGuardian with all properties required
   *
   * @example
   * ```ts
   * const user = Guardian.object({
   *   id: Guardian.number().optional(),
   *   name: Guardian.string().optional(),
   *   email: Guardian.string()
   * });
   *
   * const requiredUser = user.required();
   * // All properties become required
   * ```
   */
  required(): ObjectGuardian<Required<TInput>, Required<TInput>> {
    const requiredSchema = {} as ObjectSchema<Required<TInput>>;

    for (const [key, guard] of Object.entries(this._schema)) {
      // Create a new guardian without optional behavior
      // This is a simplified approach - in practice, you might need more sophisticated logic
      const requiredGuard = guard.clone();
      // Remove optional flag from the cloned guard to make it required
      if (requiredGuard._metaData) {
        requiredGuard._metaData.isOptional = false;
      }
      (requiredSchema as Record<string, BaseGuardian<unknown>>)[key] =
        requiredGuard;
    }

    const baseClone = this.clone();
    const newGuardian = new ObjectGuardian<Required<TInput>, Required<TInput>>(
      requiredSchema,
      baseClone.metaData,
    );

    // Copy ObjectGuardian-specific properties
    newGuardian._mode = this._mode;
    newGuardian._refinements = [];

    // Copy the composed transform from the base clone
    (newGuardian as unknown as {
      _composedTransform: GuardianTransform<unknown, Required<TInput>>;
    })._composedTransform = (baseClone as unknown as {
      _composedTransform: GuardianTransform<unknown, Required<TInput>>;
    })._composedTransform;

    return newGuardian;
  }

  /**
   * Adds a new property to the schema.
   *
   * @template K - Key name for the new property
   * @template V - Type of the new property value
   * @param key - Property name
   * @param guard - Guardian for validating the property
   * @returns New ObjectGuardian with added property
   *
   * @example
   * ```ts
   * const baseUser = Guardian.object({
   *   id: Guardian.number(),
   *   name: Guardian.string()
   * });
   *
   * const userWithEmail = baseUser.property('email', Guardian.string().email());
   * ```
   */
  property<K extends string, V>(
    key: K,
    guard: BaseGuardian<V>,
  ): ObjectGuardian<TInput & Record<K, V>, TInput & Record<K, V>> {
    const newSchema = { ...this._schema, [key]: guard } as ObjectSchema<
      TInput & Record<K, V>
    >;

    const baseClone = this.clone();
    const newGuardian = new ObjectGuardian<
      TInput & Record<K, V>,
      TInput & Record<K, V>
    >(
      newSchema,
      baseClone.metaData,
    );

    // Copy ObjectGuardian-specific properties
    newGuardian._mode = this._mode;
    newGuardian._refinements = [];

    // Copy the composed transform from the base clone
    (newGuardian as unknown as {
      _composedTransform: GuardianTransform<unknown, TInput & Record<K, V>>;
    })._composedTransform = (baseClone as unknown as {
      _composedTransform: GuardianTransform<unknown, TInput & Record<K, V>>;
    })._composedTransform;

    return newGuardian;
  }

  //#endregion

  //#region Transformation

  /**
   * Applies a transformation to the validated data.
   *
   * @template TNewOutput - The type after transformation
   * @param transformer - Function to transform the validated data
   * @param description - Optional description of the transformation
   * @returns New ObjectGuardian with transformation applied
   *
   * @example
   * ```ts
   * const userTransform = Guardian.object({
   *   firstName: Guardian.string(),
   *   lastName: Guardian.string(),
   *   birthYear: Guardian.number()
   * }).transform((data) => ({
   *   fullName: `${data.firstName} ${data.lastName}`,
   *   age: new Date().getFullYear() - data.birthYear
   * }));
   * ```
   */
  transform<TNewOutput extends Record<string, unknown>>(
    transformer: (data: TOutput) => TNewOutput,
    __description?: string,
  ): ObjectGuardian<TInput, TNewOutput> {
    // Use the standard BaseGuardian.process method for transformation
    const transformedGuardian = this.process(transformer);

    // The result is already a BaseGuardian with TNewOutput type,
    // but we need to return it as an ObjectGuardian with schema intact
    const result = new ObjectGuardian<TInput, TNewOutput>(
      this._schema,
      transformedGuardian.metaData,
    );

    // Copy ObjectGuardian-specific properties
    result._mode = this._mode;
    result._refinements = []; // Empty refinements for new type

    // Copy the composed transform from the transformed guardian
    (result as unknown as {
      _composedTransform: GuardianTransform<unknown, TNewOutput>;
    })._composedTransform = (transformedGuardian as unknown as {
      _composedTransform: GuardianTransform<unknown, TNewOutput>;
    })._composedTransform;

    return result;
  }

  //#endregion

  //#region Refinement

  /**
   * Adds a custom validation refinement to the object.
   * This allows for complex validation logic that operates on the entire object
   * after all individual property validations have passed.
   *
   * @param validator - Function that returns true if validation passes
   * @param message - Error message to show if validation fails
   * @param path - Optional path for error context
   * @returns This ObjectGuardian (mutated) or new instance if immutable mode
   *
   * @example
   * ```ts
   * // Password confirmation validation
   * const registerSchema = Guardian.object({
   *   email: Guardian.string().email(),
   *   password: Guardian.string().min(8),
   *   confirmPassword: Guardian.string()
   * }).refine(
   *   (data) => data.password === data.confirmPassword,
   *   'Passwords do not match',
   *   'confirmPassword'
   * );
   * ```
   *
   * @example
   * ```ts
   * // Conditional validation
   * const userSchema = Guardian.object({
   *   type: Guardian.string(),
   *   adminCode: Guardian.string().optional()
   * }).refine(
   *   (data) => data.type !== 'admin' || data.adminCode,
   *   'Admin code is required for admin users'
   * );
   * ```
   */
  refine(
    validator: (data: TOutput) => boolean | Promise<boolean>,
    message: string,
    path?: string,
  ): ObjectGuardian<TInput, TOutput> {
    if (this.isImmutable) {
      const cloned = this.clone();
      cloned._refinements = [
        ...this._refinements,
        { validator, message, path },
      ];
      return cloned;
    } else {
      this._refinements.push({ validator, message, path });
      return this;
    }
  }

  /**
   * Adds multiple refinements at once using superRefine.
   * This is useful when you need to apply multiple complex validations.
   *
   * @param refinements - Array of refinement objects
   * @returns New ObjectGuardian with all refinements added
   *
   * @example
   * ```ts
   * const complexSchema = Guardian.object({
   *   email: Guardian.string().email(),
   *   password: Guardian.string(),
   *   confirmPassword: Guardian.string(),
   *   age: Guardian.number()
   * }).superRefine([
   *   {
   *     validator: (data) => data.password === data.confirmPassword,
   *     message: 'Passwords must match',
   *     path: 'confirmPassword'
   *   },
   *   {
   *     validator: (data) => data.age >= 13,
   *     message: 'Must be at least 13 years old',
   *     path: 'age'
   *   }
   * ]);
   * ```
   */

  superRefine(
    refinements: Array<ObjectRefinement<TOutput>>,
  ): ObjectGuardian<TInput, TOutput> {
    return refinements.reduce(
      (guardian: ObjectGuardian<TInput, TOutput>, refinement) =>
        guardian.refine(
          refinement.validator,
          refinement.message,
          refinement.path,
        ),
      this as ObjectGuardian<TInput, TOutput>,
    );
  }

  //#endregion

  //#region Private Methods

  /**
   * Core object validation logic without refinements.
   * This is used by the base transform and handles only schema validation.
   */
  private _validateObjectType(input: unknown): Record<string, unknown> {
    if (typeof input !== 'object' || input === null || Array.isArray(input)) {
      let got: string;
      if (typeof input === 'object') {
        got = input === null ? 'null' : 'array';
      } else {
        got = typeof input;
      }
      throw new GuardianError(`Expected object but got ${got}`, {
        expected: 'object',
        got,
        comparison: 'type',
        type: 'object',
      });
    }
    return input as Record<string, unknown>;
  }

  private _validateStrictMode(
    inputObj: Record<string, unknown>,
    schemaKeys: Set<string>,
  ): void {
    if (this._mode !== 'strict') return;

    const extraKeys = Object.keys(inputObj).filter((key) =>
      !schemaKeys.has(key)
    );
    if (extraKeys.length > 0) {
      throw new GuardianError(
        `Unknown ${extraKeys.length === 1 ? 'property' : 'properties'} '${
          extraKeys.join(', ')
        }' ${extraKeys.length === 1 ? 'is' : 'are'} not allowed in strict mode`,
        {
          expected: 'no extra properties',
          got: extraKeys,
          comparison: 'strict_validation',
          type: 'unknown_property',
        },
      );
    }
  }

  private _validateSchemaProperties(
    inputObj: Record<string, unknown>,
  ): [Record<string, unknown>, Record<string, GuardianError>] {
    const result: Record<string, unknown> = {};
    const errors: Record<string, GuardianError> = {};

    for (const [key, guard] of Object.entries(this._schema)) {
      try {
        const value = inputObj[key];

        // Check if this is an optional field that's missing from input
        if (
          value === undefined && guard.metaData?.isOptional &&
          !(key in inputObj)
        ) {
          // Skip optional fields that are completely missing from input
          continue;
        }

        result[key] = guard.parse(value);
      } catch (error) {
        if (error instanceof GuardianError) {
          errors[key] = error;
        } else {
          errors[key] = new GuardianError(
            `Validation failed for property '${key}': ${error}`,
            {
              expected: 'valid value',
              got: inputObj[key],
              comparison: 'property_validation',
              type: 'object_property',
            },
          );
        }
      }
    }

    return [result, errors];
  }

  private _addPassthroughProperties(
    result: Record<string, unknown>,
    inputObj: Record<string, unknown>,
    schemaKeys: Set<string>,
  ): void {
    if (this._mode !== 'passthrough') return;

    for (const [key, value] of Object.entries(inputObj)) {
      if (!schemaKeys.has(key)) {
        result[key] = value;
      }
    }
  }

  private _throwIfErrors(
    errors: Record<string, GuardianError>,
    input: unknown,
  ): void {
    if (Object.keys(errors).length === 0) return;

    const errorCount = Object.keys(errors).length;
    const mainError = new GuardianError(
      `Object validation failed with ${errorCount} error(s)`,
      {
        expected: 'valid object',
        got: input,
        comparison: 'object_validation',
        type: 'object',
        cause: errors,
      },
    );

    // Add individual property errors as causes
    for (const [key, error] of Object.entries(errors)) {
      mainError.addCause(key, error);
    }

    throw mainError;
  }

  private _validateObjectWithoutRefinements(
    input: unknown,
  ): TInput | (TInput & Record<string, unknown>) {
    // Type validation
    const inputObj = this._validateObjectType(input);

    const schemaKeys = new Set(Object.keys(this._schema));

    // Strict mode validation
    this._validateStrictMode(inputObj, schemaKeys);

    // Validate schema properties
    const [result, errors] = this._validateSchemaProperties(inputObj);

    // Handle passthrough properties
    this._addPassthroughProperties(result, inputObj, schemaKeys);

    // Throw validation errors if any
    this._throwIfErrors(errors, input);

    return result as TInput | (TInput & Record<string, unknown>);
  }

  /**
   * Apply refinements to already validated/transformed data.
   */
  private _createRefinementError(
    message: string,
    data: TOutput,
    path?: string,
  ): GuardianError {
    const error = new GuardianError(message, {
      expected: 'refinement validation to pass',
      got: data,
      comparison: 'refinement_validation',
      type: 'refinement_failure',
    });

    if (path) {
      error.addCause(path, error);
    }

    return error;
  }

  private _handleRefinementError(
    error: unknown,
    refinement: ObjectRefinement<TOutput>,
    data: TOutput,
  ): never {
    if (error instanceof GuardianError) {
      throw error;
    }

    const refinementError = new GuardianError(
      `Refinement validation failed: ${String(error)}`,
      {
        expected: 'refinement validation to complete',
        got: data,
        comparison: 'refinement_validation',
        type: 'refinement_error',
      },
    );

    if (refinement.path) {
      refinementError.addCause(refinement.path, refinementError);
    }

    throw refinementError;
  }

  private _applyRefinements(data: TOutput): TOutput {
    for (const refinement of this._refinements) {
      try {
        const isValid = refinement.validator(data);

        // Check for async refinement in sync parsing
        if (isValid instanceof Promise) {
          throw new GuardianError(
            'Cannot use parse() with async validation steps. Use parseAsync() instead.',
            {
              expected: 'synchronous validation',
              got: 'async refinement',
              comparison: 'refinement_validation',
              type: 'async_validation',
            },
          );
        }

        if (!isValid) {
          throw this._createRefinementError(
            refinement.message,
            data,
            refinement.path,
          );
        }
      } catch (error) {
        this._handleRefinementError(error, refinement, data);
      }
    }

    return data;
  }

  /**
   * Apply refinements to already validated/transformed data (async version).
   */
  private async _applyRefinementsAsync(data: TOutput): Promise<TOutput> {
    for (const refinement of this._refinements) {
      try {
        const isValid = await refinement.validator(data);

        if (!isValid) {
          const refinementError = new GuardianError(refinement.message, {
            expected: 'refinement validation to pass',
            got: data,
            comparison: 'refinement_validation',
            type: 'refinement_failure',
          });

          // Add path information if provided
          if (refinement.path) {
            refinementError.addCause(refinement.path, refinementError);
          }

          throw refinementError;
        }
      } catch (error) {
        if (error instanceof GuardianError) {
          throw error;
        }

        // Handle unexpected errors during refinement
        const refinementError = new GuardianError(
          `Refinement validation failed: ${error}`,
          {
            expected: 'refinement validation to complete',
            got: data,
            comparison: 'refinement_validation',
            type: 'refinement_error',
          },
        );

        // Add path information if provided
        if (refinement.path) {
          refinementError.addCause(refinement.path, refinementError);
        }

        throw refinementError;
      }
    }

    return data;
  }

  /**
   * Override clone method to properly handle ObjectGuardian-specific properties.
   */
  override clone(): ObjectGuardian<TInput, TOutput> {
    const baseClone = super.clone();
    const newGuardian = new ObjectGuardian<TInput, TOutput>(
      this._schema,
      baseClone.metaData,
    );

    // Copy ObjectGuardian-specific properties
    newGuardian._mode = this._mode;
    newGuardian._refinements = [...this._refinements];

    // Copy the composed transform from the base clone
    (newGuardian as unknown as {
      _composedTransform: GuardianTransform<unknown, TOutput>;
    })._composedTransform = (baseClone as unknown as {
      _composedTransform: GuardianTransform<unknown, TOutput>;
    })._composedTransform;

    return newGuardian;
  }

  //#endregion
}
