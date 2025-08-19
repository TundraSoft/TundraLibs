/**
 * Type definitions for Guardian JSON schema representation
 */

/**
 * Base interface for all Guardian schema definitions
 */
export interface BaseGuardianSchema {
  type: string;
  optional?: boolean;
  nullable?: boolean;
  error?: string;
}

/**
 * Schema definition for string guardians
 */
export interface StringGuardianSchema extends BaseGuardianSchema {
  type: 'string';
  minLength?: number;
  maxLength?: number;
  pattern?: string; // RegExp as string
  email?: boolean;
  url?: boolean;
  uuid?: boolean;
  alpha?: boolean;
  alphanumeric?: boolean;
  numeric?: boolean;
  ipv4?: boolean;
  ipv6?: boolean;
  upperCase?: boolean;
  lowerCase?: boolean;
  trim?: boolean;
  stripSpaces?: boolean;
  replace?: {
    searchValue: string;
    replaceValue: string;
  };
  slice?: {
    start: number;
    end?: number;
  };
  equals?: string;
  notEquals?: string;
  in?: string[];
  notIn?: string[];
}

/**
 * Schema definition for number guardians
 */
export interface NumberGuardianSchema extends BaseGuardianSchema {
  type: 'number';
  min?: number;
  max?: number;
  range?: {
    min: number;
    max: number;
  };
  integer?: boolean;
  positive?: boolean;
  negative?: boolean;
  finite?: boolean;
  safe?: boolean;
  multipleOf?: number;
  ceil?: boolean;
  floor?: boolean;
  abs?: boolean;
  equals?: number;
  notEquals?: number;
  in?: number[];
  notIn?: number[];
}

/**
 * Schema definition for bigint guardians
 */
export interface BigIntGuardianSchema extends BaseGuardianSchema {
  type: 'bigint';
  min?: string; // bigint as string
  max?: string; // bigint as string
  range?: {
    min: string;
    max: string;
  };
  positive?: boolean;
  negative?: boolean;
  equals?: string;
  notEquals?: string;
  in?: string[];
  notIn?: string[];
}

/**
 * Schema definition for boolean guardians
 */
export interface BooleanGuardianSchema extends BaseGuardianSchema {
  type: 'boolean';
  equals?: boolean;
  notEquals?: boolean;
}

/**
 * Schema definition for date guardians
 */
export interface DateGuardianSchema extends BaseGuardianSchema {
  type: 'date';
  min?: string; // Date as ISO string
  max?: string; // Date as ISO string
  range?: {
    min: string;
    max: string;
  };
  equals?: string;
  notEquals?: string;
  in?: string[];
  notIn?: string[];
}

/**
 * Schema definition for array guardians
 */
export interface ArrayGuardianSchema extends BaseGuardianSchema {
  type: 'array';
  of?: GuardianSchema;
  length?: number;
  minLength?: number;
  maxLength?: number;
  unique?: boolean;
  notEmpty?: boolean;
}

/**
 * Schema definition for object guardians
 */
export interface ObjectGuardianSchema extends BaseGuardianSchema {
  type: 'object';
  schema?: Record<string, GuardianSchema>;
  strict?: boolean;
  additionalProperties?: boolean;
  notEmpty?: boolean;
}

/**
 * Schema definition for function guardians
 */
export interface FunctionGuardianSchema extends BaseGuardianSchema {
  type: 'function';
  // Function guardians typically don't have additional validations in JSON
}

/**
 * Schema definition for unknown guardians
 */
export interface UnknownGuardianSchema extends BaseGuardianSchema {
  type: 'unknown';
  // Unknown guardians accept any value, but can have base validations
}

/**
 * Schema definition for oneOf unions
 */
export interface OneOfGuardianSchema extends BaseGuardianSchema {
  type: 'oneOf';
  options: GuardianSchema[];
}

/**
 * Union type for all possible Guardian schema types
 */
export type GuardianSchema =
  | StringGuardianSchema
  | NumberGuardianSchema
  | BigIntGuardianSchema
  | BooleanGuardianSchema
  | DateGuardianSchema
  | ArrayGuardianSchema
  | ObjectGuardianSchema
  | FunctionGuardianSchema
  | UnknownGuardianSchema
  | OneOfGuardianSchema;

/**
 * Type guard to check if a schema is of a specific type
 */
export function isSchemaType<T extends GuardianSchema['type']>(
  schema: GuardianSchema,
  type: T,
): schema is Extract<GuardianSchema, { type: T }> {
  return schema.type === type;
}
