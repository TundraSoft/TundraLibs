import { BaseGuardian } from "../BaseGuardian.ts";
import { GuardianError } from "../GuardianError.ts";
import type { GuardianMetaData, GuardianTransform } from "../types/mod.ts";

/**
 * Type definition for object schema - maps property names to their Guardian validators
 */
export type ObjectSchema<T = Record<string, unknown>> = {
  [K in keyof T]: BaseGuardian<T[K]>;
};

/**
 * Validation mode for object validation
 */
export type ObjectValidationMode = "passthrough" | "strict" | "strip";

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
  private _schema: ObjectSchema<TInput>;
  private _mode: ObjectValidationMode = "passthrough";
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
      return this._validateObject(input) as TOutput;
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
    const transformedResult = await super.parseAsync(input);

    // Then apply object-specific refinements to the transformed result
    return await this._applyRefinementsAsync(transformedResult);
  }

  /**
   * Gets the input type for type inspection.
   * This is a type-only property for TypeScript inference.
   */
  get inputType(): TInput {
    throw new Error(
      "inputType is for TypeScript inference only and should not be accessed at runtime",
    );
  }

  //#region Validation Modes

  /**
   * Sets the validation mode to strict - only properties defined in the schema are allowed.
   * Extra properties will cause validation to fail.
   *
   * @returns New ObjectGuardian with strict validation mode
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
  strict(): ObjectGuardian<TInput, TInput> {
    const newGuardian = new ObjectGuardian<TInput, TInput>(
      this._schema,
      this.metaData,
    );
    newGuardian._mode = "strict";
    newGuardian._refinements = [
      ...this._refinements as unknown as Array<ObjectRefinement<TInput>>,
    ];
    return newGuardian;
  }

  /**
   * Sets the validation mode to strip - removes properties not defined in the schema.
   * Only validated properties will be present in the output.
   *
   * @returns New ObjectGuardian with strip validation mode
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
  strip(): ObjectGuardian<TInput, TInput> {
    const newGuardian = new ObjectGuardian<TInput, TInput>(
      this._schema,
      this.metaData,
    );
    newGuardian._mode = "strip";
    newGuardian._refinements = [
      ...this._refinements as unknown as Array<ObjectRefinement<TInput>>,
    ];
    return newGuardian;
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
    const newGuardian = new ObjectGuardian<TInput & U, TInput & U>(
      extendedSchema,
      this.metaData,
    );
    newGuardian._mode = this._mode;
    return newGuardian;
  }

  /**
   * Creates a new ObjectGuardian with only the specified properties.
   *
   * @template K - Keys to pick from the schema
   * @param keys - Property names to include
   * @returns New ObjectGuardian with only the picked properties
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

    const newGuardian = new ObjectGuardian<Pick<TInput, K>, Pick<TInput, K>>(
      pickedSchema,
      this.metaData,
    );
    newGuardian._mode = this._mode;
    return newGuardian;
  }

  /**
   * Creates a new ObjectGuardian without the specified properties.
   *
   * @template K - Keys to omit from the schema
   * @param keys - Property names to exclude
   * @returns New ObjectGuardian without the omitted properties
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

    const newGuardian = new ObjectGuardian<Omit<TInput, K>, Omit<TInput, K>>(
      omittedSchema as ObjectSchema<Omit<TInput, K>>,
      this.metaData,
    );
    newGuardian._mode = this._mode;
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

    const newGuardian = new ObjectGuardian<Partial<TInput>, Partial<TInput>>(
      partialSchema,
      this.metaData,
    );
    newGuardian._mode = this._mode;
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
      (requiredGuard as BaseGuardian<unknown> & {
        _hasOptional: boolean;
        _optionalDefault?: unknown;
      })._hasOptional = false;
      (requiredGuard as BaseGuardian<unknown> & {
        _hasOptional: boolean;
        _optionalDefault?: unknown;
      })._optionalDefault = undefined;
      (requiredSchema as Record<string, BaseGuardian<unknown>>)[key] =
        requiredGuard;
    }

    const newGuardian = new ObjectGuardian<Required<TInput>, Required<TInput>>(
      requiredSchema,
      this.metaData,
    );
    newGuardian._mode = this._mode;
    return newGuardian;
  }

  /**
   * Adds a new property to the schema.
   *
   * @template K - Key name for the new property
   * @template V - Type of the new property value
   * @param key - Property name
   * @param guard - Guardian for validating the property
   * @returns New ObjectGuardian with the added property
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
    const newGuardian = new ObjectGuardian<
      TInput & Record<K, V>,
      TInput & Record<K, V>
    >(newSchema, this.metaData);
    newGuardian._mode = this._mode;
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
    const newGuardian = this._cloneObjectGuardian();
    // Apply the transformation using the process method
    const transformedGuardian = newGuardian.process(transformer);
    const result = new ObjectGuardian<TInput, TNewOutput>(
      this._schema,
      this.metaData,
    );
    result._mode = this._mode;
    // NOTE: Don't copy refinements during transform as they expect TOutput type
    // Refinements should be added after transform using refine() method
    // result._refinements remains empty for the new type
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
   * @returns New ObjectGuardian with the refinement added
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
    const newGuardian = this._cloneObjectGuardian();

    // CRITICAL FIX: Copy the composed transform from the current guardian
    (newGuardian as unknown as {
      _composedTransform: GuardianTransform<unknown, TOutput>;
    })._composedTransform = (this as unknown as {
      _composedTransform: GuardianTransform<unknown, TOutput>;
    })._composedTransform;

    // Add this refinement to the list
    newGuardian._refinements = [
      ...this._refinements,
      { validator, message, path },
    ];

    return newGuardian;
  } /**
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
   * Creates a clone of this ObjectGuardian for method chaining.
   */
  private _cloneObjectGuardian(): ObjectGuardian<TInput, TOutput> {
    const cloned = new ObjectGuardian<TInput, TOutput>(
      this._schema,
      this.metaData,
    );
    cloned._mode = this._mode;
    cloned._refinements = [...this._refinements];

    // CRITICAL FIX: Copy the composed transform to ensure chaining works
    (cloned as unknown as {
      _composedTransform: GuardianTransform<unknown, TOutput>;
    })._composedTransform = (this as unknown as {
      _composedTransform: GuardianTransform<unknown, TOutput>;
    })._composedTransform;

    return cloned;
  }

  /**
   * Core object validation logic.
   */
  private _validateObject(
    input: unknown,
  ): TInput | (TInput & Record<string, unknown>) {
    // Type validation
    if (typeof input !== "object" || input === null || Array.isArray(input)) {
      const got = typeof input === "object"
        ? (input === null ? "null" : "array")
        : typeof input;
      throw new GuardianError(`Expected object but got ${got}`, {
        expected: "object",
        got,
        comparison: "type",
        type: "object",
      });
    }

    const inputObj = input as Record<string, unknown>;
    const schemaKeys = new Set(Object.keys(this._schema));

    // Strict mode validation - check for extra properties
    if (this._mode === "strict") {
      const extraKeys = Object.keys(inputObj).filter((key) =>
        !schemaKeys.has(key)
      );
      if (extraKeys.length > 0) {
        throw new GuardianError(
          `Unknown ${extraKeys.length === 1 ? "property" : "properties"} '${
            extraKeys.join(", ")
          }' ${
            extraKeys.length === 1 ? "is" : "are"
          } not allowed in strict mode`,
          {
            expected: "no extra properties",
            got: extraKeys,
            comparison: "strict_validation",
            type: "unknown_property",
          },
        );
      }
    }

    const result: Record<string, unknown> = {};
    const errors: Record<string, GuardianError> = {};

    // Validate schema properties
    for (const [key, guard] of Object.entries(this._schema)) {
      try {
        const value = inputObj[key];
        result[key] = guard.parse(value);
      } catch (error) {
        if (error instanceof GuardianError) {
          errors[key] = error;
        } else {
          errors[key] = new GuardianError(
            `Validation failed for property '${key}': ${error}`,
            {
              expected: "valid value",
              got: inputObj[key],
              comparison: "property_validation",
              type: "object_property",
            },
          );
        }
      }
    }

    // Handle passthrough properties
    if (this._mode === "passthrough") {
      for (const [key, value] of Object.entries(inputObj)) {
        if (!schemaKeys.has(key)) {
          result[key] = value;
        }
      }
    }

    // Throw validation errors if any
    if (Object.keys(errors).length > 0) {
      const errorCount = Object.keys(errors).length;
      const mainError = new GuardianError(
        `Object validation failed with ${errorCount} error(s)`,
        {
          expected: "valid object",
          got: input,
          comparison: "object_validation",
          type: "object",
          cause: errors,
        },
      );

      // Add individual property errors as causes
      for (const [key, error] of Object.entries(errors)) {
        mainError.addCause(key, error);
      }

      throw mainError;
    }

    // Apply refinement validations
    for (const refinement of this._refinements) {
      try {
        const isValid = refinement.validator(result as TOutput);

        // Check for async refinement in sync parsing
        if (isValid instanceof Promise) {
          throw new GuardianError(
            "Cannot use parse() with async validation steps. Use parseAsync() instead.",
            {
              expected: "synchronous validation",
              got: "async refinement",
              comparison: "refinement_validation",
              type: "async_validation",
            },
          );
        }

        if (!isValid) {
          const refinementError = new GuardianError(refinement.message, {
            expected: "refinement validation to pass",
            got: result,
            comparison: "refinement_validation",
            type: "refinement_failure",
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
            expected: "refinement validation to complete",
            got: result,
            comparison: "refinement_validation",
            type: "refinement_error",
          },
        );

        // Add path information if provided
        if (refinement.path) {
          refinementError.addCause(refinement.path, refinementError);
        }

        throw refinementError;
      }
    }

    return result as TInput | (TInput & Record<string, unknown>);
  }

  /**
   * Apply refinements to already validated/transformed data.
   */
  private _applyRefinements(data: TOutput): TOutput {
    for (const refinement of this._refinements) {
      try {
        const isValid = refinement.validator(data);

        // Check for async refinement in sync parsing
        if (isValid instanceof Promise) {
          throw new GuardianError(
            "Cannot use parse() with async validation steps. Use parseAsync() instead.",
            {
              expected: "synchronous validation",
              got: "async refinement",
              comparison: "refinement_validation",
              type: "async_validation",
            },
          );
        }

        if (!isValid) {
          const refinementError = new GuardianError(refinement.message, {
            expected: "refinement validation to pass",
            got: data,
            comparison: "refinement_validation",
            type: "refinement_failure",
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
            expected: "refinement validation to complete",
            got: data,
            comparison: "refinement_validation",
            type: "refinement_error",
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
   * Apply refinements to already validated/transformed data (async version).
   */
  private async _applyRefinementsAsync(data: TOutput): Promise<TOutput> {
    for (const refinement of this._refinements) {
      try {
        const isValid = await refinement.validator(data);

        if (!isValid) {
          const refinementError = new GuardianError(refinement.message, {
            expected: "refinement validation to pass",
            got: data,
            comparison: "refinement_validation",
            type: "refinement_failure",
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
            expected: "refinement validation to complete",
            got: data,
            comparison: "refinement_validation",
            type: "refinement_error",
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
   * Core async object validation logic with support for async refinements.
   */
  private async _validateObjectAsync(
    input: unknown,
  ): Promise<TInput | (TInput & Record<string, unknown>)> {
    // First perform synchronous validation (everything except refinements)
    const syncResult = await new Promise<
      TInput | (TInput & Record<string, unknown>)
    >((resolve, reject) => {
      try {
        // Temporarily clear refinements for sync validation
        const originalRefinements = this._refinements;
        this._refinements = [];
        const result = this._validateObject(input);
        this._refinements = originalRefinements;
        resolve(result);
      } catch (error) {
        reject(error);
      }
    });

    // Apply refinement validations (supporting async)
    for (const refinement of this._refinements) {
      try {
        const isValid = await refinement.validator(syncResult as TOutput);

        if (!isValid) {
          const refinementError = new GuardianError(refinement.message, {
            expected: "refinement validation to pass",
            got: syncResult,
            comparison: "refinement_validation",
            type: "refinement_failure",
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

        // Handle unexpected errors during async refinement
        const refinementError = new GuardianError(
          `Async refinement validation failed: ${error}`,
          {
            expected: "refinement validation to complete",
            got: syncResult,
            comparison: "refinement_validation",
            type: "refinement_error",
          },
        );

        // Add path information if provided
        if (refinement.path) {
          refinementError.addCause(refinement.path, refinementError);
        }

        throw refinementError;
      }
    }

    return syncResult;
  }

  //#endregion
}
