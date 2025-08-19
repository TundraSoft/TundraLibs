/**
 * OpenAPI Schema types for Guardian integration
 * Based on OpenAPI 3.0 specification: https://spec.openapis.org/oas/v3.0.3#schema-object
 */

/**
 * Base OpenAPI schema object
 */
export interface BaseOpenAPISchema {
  /** A title for the schema */
  title?: string;

  /** A description of the schema */
  description?: string;

  /** The default value represents what would be assumed by the consumer of the input */
  default?: unknown;

  /** Example of the schema */
  example?: unknown;

  /** Array of examples */
  examples?: unknown[];

  /** Marks a schema as deprecated */
  deprecated?: boolean;

  /** Allows extensions to the schema */
  [key: string]: unknown;
}

/**
 * String type schema
 */
export interface StringOpenAPISchema extends BaseOpenAPISchema {
  type: 'string';
  format?:
    | 'date'
    | 'date-time'
    | 'password'
    | 'byte'
    | 'binary'
    | 'email'
    | 'uuid'
    | 'uri'
    | 'hostname'
    | 'ipv4'
    | 'ipv6'
    | string;
  pattern?: string;
  minLength?: number;
  maxLength?: number;
  enum?: string[];
}

/**
 * Number/Integer type schema
 */
export interface NumberOpenAPISchema extends BaseOpenAPISchema {
  type: 'number' | 'integer';
  format?: 'int32' | 'int64' | 'float' | 'double' | string;
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
  exclusiveMaximum?: number;
  multipleOf?: number;
  enum?: number[];
}

/**
 * Boolean type schema
 */
export interface BooleanOpenAPISchema extends BaseOpenAPISchema {
  type: 'boolean';
}

/**
 * Array type schema
 */
export interface ArrayOpenAPISchema extends BaseOpenAPISchema {
  type: 'array';
  items: OpenAPISchema;
  minItems?: number;
  maxItems?: number;
  uniqueItems?: boolean;
}

/**
 * Object type schema
 */
export interface ObjectOpenAPISchema extends BaseOpenAPISchema {
  type: 'object';
  properties?: Record<string, OpenAPISchema>;
  required?: string[];
  minProperties?: number;
  maxProperties?: number;
  additionalProperties?: boolean | OpenAPISchema;
}

/**
 * OneOf schema for union types
 */
export interface OneOfOpenAPISchema extends BaseOpenAPISchema {
  oneOf: OpenAPISchema[];
}

/**
 * AnyOf schema for union types
 */
export interface AnyOfOpenAPISchema extends BaseOpenAPISchema {
  anyOf: OpenAPISchema[];
}

/**
 * AllOf schema for intersection types
 */
export interface AllOfOpenAPISchema extends BaseOpenAPISchema {
  allOf: OpenAPISchema[];
}

/**
 * Null type schema
 */
export interface NullOpenAPISchema extends BaseOpenAPISchema {
  type: 'null';
}

/**
 * Union of all possible OpenAPI schema types
 */
export type OpenAPISchema =
  | StringOpenAPISchema
  | NumberOpenAPISchema
  | BooleanOpenAPISchema
  | ArrayOpenAPISchema
  | ObjectOpenAPISchema
  | OneOfOpenAPISchema
  | AnyOfOpenAPISchema
  | AllOfOpenAPISchema
  | NullOpenAPISchema;

/**
 * OpenAPI schema with nullable support
 */
export type NullableOpenAPISchema = OpenAPISchema | {
  anyOf: [OpenAPISchema, NullOpenAPISchema];
};
