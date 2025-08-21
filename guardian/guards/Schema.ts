import { BaseGuardian } from '../BaseGuardian.ts';
import { GuardianError } from '../GuardianError.ts';
import type { FunctionType, GuardianProxy } from '../types/mod.ts';
import { getType } from '../helpers/mod.ts';

/**
 * Type representing a schema of property guardians
 */
export type ObjectSchema<
  T extends Record<string, unknown> = Record<string, unknown>,
> = {
  [K in keyof T]: FunctionType<T[K]>;
};

/**
 * SchemaGuardian provides schema-aware validation for objects with known structure.
 * It extends BaseGuardian to provide schema-based validation and transformation methods.
 *
 * @example
 * ```ts
 * const userSchema = Guardian.schema({
 *   name: Guardian.string(),
 *   age: Guardian.number().min(0)
 * }, { additionalProperties: false });
 *
 * // Validate an object
 * const validUser = userSchema({ name: 'John', age: 30 }); // Returns: { name: 'John', age: 30 }
 * userSchema(null); // Throws: "Expected object, got null"
 * userSchema({ name: 'John', age: -5 }); // Throws: "Expected value to be greater than or equal to 0 (at 'age')"
 * ```
 */
export class SchemaGuardian<
  T extends Record<string, unknown> = Record<string, unknown>,
> extends BaseGuardian<FunctionType<T>> {
  /**
   * Private property to store the schema definition
   */
  private _schema: ObjectSchema<T>;
  private _schemaOptions: {
    strict?: boolean;
    additionalProperties?: boolean;
    message?: string;
  };

  /**
   * Gets the schema definition for serialization purposes
   * @internal
   */
  public get schema(): ObjectSchema<T> {
    return this._schema;
  }

  /**
   * Creates a new SchemaGuardian instance with the given schema.
   *
   * @param schema - Object schema defining the structure and validation rules
   * @param options - Schema validation options
   * @returns A proxy that acts as both the guardian function and method provider
   */
  constructor(
    schema: ObjectSchema<T>,
    options: {
      strict?: boolean; // If true, rejects objects with properties not in schema
      additionalProperties?: boolean; // If false, ignores extra properties
      message?: string; // Custom error message for validation failure
    } = {},
  ) {
    const {
      strict = false,
      additionalProperties = true,
      message = 'Schema validation failed',
    } = options;

    super((obj: unknown): T => {
      // First validate that it's an object
      if (
        typeof obj !== 'object' ||
        obj === null ||
        Array.isArray(obj)
      ) {
        throw new GuardianError(
          {
            got: obj,
            expected: 'object',
            comparison: 'type',
            type: getType(obj),
          },
          'Expected object, got ${type}',
        );
      }

      const input = obj as Record<string, unknown>;
      const result: Record<string, unknown> = {};
      const schemaKeys = Object.keys(schema);
      const errors = new GuardianError(
        {
          got: input,
          expected: schemaKeys,
          comparison: 'schema',
        },
        message,
      );

      // Check for extra properties
      this.validateExtraProperties(input, schemaKeys, errors, strict);

      // Validate and transform properties according to schema
      this.validateSchemaProperties(input, schema, schemaKeys, errors, result);

      // Copy additional properties if allowed
      this.copyAdditionalProperties(
        input,
        schemaKeys,
        result,
        strict,
        additionalProperties,
      );

      if (errors.causeSize() > 0) {
        throw errors;
      }
      return result as T;
    });

    this._schema = schema;
    this._schemaOptions = options;
  }

  /**
   * Creates a new SchemaGuardian instance with the given schema.
   *
   * @param schema - Object schema defining the structure and validation rules
   * @param options - Schema validation options
   * @returns A proxy that acts as both the guardian function and method provider
   */
  static create<T extends Record<string, unknown>>(
    schema: ObjectSchema<T>,
    options: {
      strict?: boolean;
      additionalProperties?: boolean;
      message?: string;
    } = {},
  ): GuardianProxy<SchemaGuardian<T>> {
    return new SchemaGuardian<T>(schema, options).proxy();
  }

  /**
   * Validates extra properties based on strict mode
   */
  private validateExtraProperties(
    obj: Record<string, unknown>,
    schemaKeys: string[],
    errors: GuardianError,
    strict: boolean,
  ): void {
    if (strict) {
      const extraKeys = Object.keys(obj).filter(
        (key) => !schemaKeys.includes(key),
      );

      if (extraKeys.length > 0) {
        extraKeys.forEach((key) => {
          errors.addCause(
            key,
            new GuardianError(
              {
                got: obj[key],
                expected: schemaKeys,
                comparison: 'schema',
              },
              `Unexpected property '${key}' in strict mode`,
            ),
          );
        });
      }
    }
  }

  /**
   * Validates and transforms properties according to schema
   */
  private validateSchemaProperties<S extends Record<string, unknown>>(
    obj: Record<string, unknown>,
    schema: ObjectSchema<S>,
    schemaKeys: string[],
    errors: GuardianError,
    result: Record<string, unknown>,
  ): void {
    for (const key of schemaKeys) {
      const value = obj[key];
      const propertyGuardian = schema[key] as FunctionType<unknown>;

      try {
        result[key] = propertyGuardian(value);
      } catch (error) {
        if (error instanceof GuardianError) {
          errors.addCause(key, error);
        } else {
          errors.addCause(
            key,
            new GuardianError(
              { got: value, expected: 'valid', comparison: 'custom' },
              String(error),
            ),
          );
        }
      }
    }
  }

  /**
   * Copies additional properties if allowed
   */
  private copyAdditionalProperties(
    obj: Record<string, unknown>,
    schemaKeys: string[],
    result: Record<string, unknown>,
    strict: boolean,
    additionalProperties: boolean,
  ): void {
    if (!strict && additionalProperties) {
      for (const [key, value] of Object.entries(obj)) {
        if (!schemaKeys.includes(key)) {
          result[key] = value;
        }
      }
    }
  }

  /**
   * Creates a new schema with only the specified properties.
   *
   * @param keys - Array of keys to pick from the schema
   * @param options - Options for the new schema
   * @returns A new SchemaGuardian with only the picked properties
   */
  public pick<K extends keyof T>(
    keys: K[],
    options?: {
      message?: string;
      additionalProperties?: boolean;
      strict?: boolean;
    },
  ): GuardianProxy<SchemaGuardian<Pick<T, K>>> {
    const newSchema = {} as ObjectSchema<Pick<T, K>>;

    for (const key of keys) {
      if (key in this._schema) {
        newSchema[key] = this._schema[key] as FunctionType<Pick<T, K>[K]>;
      }
    }

    const newOptions = {
      ...this._schemaOptions,
      ...options,
    };

    return SchemaGuardian.create(newSchema, newOptions);
  }

  /**
   * Creates a new schema without the specified properties.
   *
   * @param keys - Array of keys to omit from the schema
   * @param options - Options for the new schema
   * @returns A new SchemaGuardian without the omitted properties
   */
  public omit<K extends keyof T>(
    keys: K[],
    options?: {
      message?: string;
      additionalProperties?: boolean;
      strict?: boolean;
    },
  ): GuardianProxy<SchemaGuardian<Omit<T, K>>> {
    const newSchema = {} as ObjectSchema<Omit<T, K>>;

    for (const [key, guardian] of Object.entries(this._schema)) {
      if (!keys.includes(key as K)) {
        (newSchema as Record<string, FunctionType<unknown>>)[key] = guardian;
      }
    }

    const newOptions = {
      ...this._schemaOptions,
      ...options,
    };

    return SchemaGuardian.create(newSchema, newOptions);
  }

  /**
   * Creates a new schema where all properties become optional.
   *
   * @param options - Options for the new schema
   * @returns A new SchemaGuardian where all properties are optional
   */
  public partial(
    options?: {
      message?: string;
      additionalProperties?: boolean;
      strict?: boolean;
    },
  ): GuardianProxy<SchemaGuardian<Partial<T>>> {
    // For now, create a basic partial implementation
    // TODO: Implement proper partial validation that only validates present properties
    const newOptions = {
      ...this._schemaOptions,
      ...options,
      message: options?.message || 'Partial schema validation failed',
    };

    return SchemaGuardian.create(
      this._schema as ObjectSchema<Partial<T>>,
      newOptions,
    ) as unknown as GuardianProxy<SchemaGuardian<Partial<T>>>;
  }

  /**
   * Extends the current schema with additional properties from another schema.
   *
   * @param extension - Another SchemaGuardian to extend this one with
   * @param options - Options for the new schema
   * @returns A new SchemaGuardian with merged schemas
   */
  public extend<E extends Record<string, unknown>>(
    extension: GuardianProxy<SchemaGuardian<E>>,
    options?: {
      message?: string;
      additionalProperties?: boolean;
      strict?: boolean;
    },
  ): GuardianProxy<SchemaGuardian<T & E>> {
    // Get the extension schema
    const extensionInstance = extension as unknown as SchemaGuardian<E>;
    const extensionSchema = extensionInstance._schema;

    // Merge schemas
    const mergedSchema: ObjectSchema<T & E> = {
      ...this._schema,
      ...extensionSchema,
    } as ObjectSchema<T & E>;

    const newOptions = {
      ...this._schemaOptions,
      ...options,
    };

    return SchemaGuardian.create(mergedSchema, newOptions);
  }

  /**
   * Transforms the validated object using a mapping function.
   *
   * @param mapper - Function that transforms the validated object to another SchemaGuardian
   * @returns The SchemaGuardian returned by the mapper function
   */
  public mutate<R extends Record<string, unknown>>(
    mapper: (obj: T) => GuardianProxy<SchemaGuardian<R>>,
  ): GuardianProxy<SchemaGuardian<R>> {
    return this.transform((obj) => {
      const validated = this.guardian(obj);
      const targetGuardian = mapper(validated);
      return targetGuardian(validated);
    }) as unknown as GuardianProxy<SchemaGuardian<R>>;
  }

  /**
   * Adds cross-field validation using a custom refinement function.
   *
   * @param refineFn - Function that receives the validated object and returns true if valid
   * @param message - Custom error message when refinement fails
   * @returns A new SchemaGuardian with the refinement applied
   */
  public refine(
    refineFn: (obj: T) => boolean,
    message = 'Schema refinement failed',
  ): GuardianProxy<SchemaGuardian<T>> {
    return this.transform((obj) => {
      const validated = this.guardian(obj);
      if (!refineFn(validated)) {
        throw new GuardianError(
          {
            got: validated,
            expected: 'valid',
            comparison: 'refinement',
          },
          message,
        );
      }
      return validated;
    }) as unknown as GuardianProxy<SchemaGuardian<T>>;
  }

  /**
   * Converts the SchemaGuardian to an OpenAPI schema object
   * @returns An OpenAPI schema representation of this SchemaGuardian
   */
  public openapi(): import('../types/OpenAPISchema.ts').ObjectOpenAPISchema {
    const schema: import('../types/OpenAPISchema.ts').ObjectOpenAPISchema = {
      type: 'object',
      additionalProperties: this._schemaOptions.additionalProperties,
    };

    // Add metadata if available
    if (this.metadata.title) schema.title = this.metadata.title;
    if (this.metadata.description) {
      schema.description = this.metadata.description;
    }
    if (this.metadata.deprecated) schema.deprecated = this.metadata.deprecated;
    if (this.metadata.examples) schema.examples = this.metadata.examples;

    // TODO: Extract properties from schema
    // This would require introspection of the schema guardians

    return schema;
  }
}
