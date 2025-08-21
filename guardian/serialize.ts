// deno-lint-ignore-file no-explicit-any
import type {
  ArrayGuardianSchema,
  BigIntGuardianSchema,
  BooleanGuardianSchema,
  DateGuardianSchema,
  FunctionGuardianSchema,
  GuardianSchema,
  NumberGuardianSchema,
  ObjectGuardianSchema,
  StringGuardianSchema,
  UnknownGuardianSchema,
} from './types/mod.ts';

export function serialize(guardian: any): GuardianSchema {
  if (typeof guardian !== 'function') {
    throw new Error('Guardian must be a function');
  }
  const constructorName = guardian.constructor?.name || guardian.name || '';

  // Check for SchemaGuardian first (before ObjectGuardian)
  if (
    constructorName.includes('Schema') || constructorName === 'SchemaGuardian'
  ) {
    return schemaGuardianToJSON(guardian);
  }

  if (constructorName.includes('String') || guardian._type === 'string') {
    return stringGuardianToJSON(guardian);
  }
  if (constructorName.includes('Number') || guardian._type === 'number') {
    return numberGuardianToJSON(guardian);
  }
  if (constructorName.includes('BigInt') || guardian._type === 'bigint') {
    return bigintGuardianToJSON(guardian);
  }
  if (constructorName.includes('Boolean') || guardian._type === 'boolean') {
    return booleanGuardianToJSON(guardian);
  }
  if (constructorName.includes('Date') || guardian._type === 'date') {
    return dateGuardianToJSON(guardian);
  }
  if (constructorName.includes('Array') || guardian._type === 'array') {
    return arrayGuardianToJSON(guardian);
  }
  if (constructorName.includes('Object') || guardian._type === 'object') {
    return objectGuardianToJSON(guardian);
  }
  if (constructorName.includes('Function') || guardian._type === 'function') {
    return functionGuardianToJSON(guardian);
  }
  if (constructorName.includes('Unknown') || guardian._type === 'unknown') {
    return unknownGuardianToJSON(guardian);
  }
  return inferGuardianType(guardian);
}

function stringGuardianToJSON(guardian: any): StringGuardianSchema {
  const schema: StringGuardianSchema = { type: 'string' };
  if (guardian._validations) {
    for (const v of guardian._validations) {
      switch (v.type) {
        case 'minLength':
          schema.minLength = v.value;
          break;
        case 'maxLength':
          schema.maxLength = v.value;
          break;
        case 'pattern':
          schema.pattern = v.value.source;
          break;
        case 'email':
          schema.email = true;
          break;
        case 'url':
          schema.url = true;
          break;
      }
    }
  }
  return schema;
}

function numberGuardianToJSON(guardian: any): NumberGuardianSchema {
  const schema: NumberGuardianSchema = { type: 'number' };
  if (guardian._validations) {
    for (const v of guardian._validations) {
      switch (v.type) {
        case 'min':
          schema.min = v.value;
          break;
        case 'max':
          schema.max = v.value;
          break;
        case 'integer':
          schema.integer = true;
          break;
        case 'positive':
          schema.positive = true;
          break;
        case 'negative':
          schema.negative = true;
          break;
      }
    }
  }
  return schema;
}

function bigintGuardianToJSON(guardian: any): BigIntGuardianSchema {
  const schema: BigIntGuardianSchema = { type: 'bigint' };
  if (guardian._validations) {
    for (const v of guardian._validations) {
      switch (v.type) {
        case 'min':
          schema.min = v.value.toString();
          break;
        case 'max':
          schema.max = v.value.toString();
          break;
        case 'positive':
          schema.positive = true;
          break;
        case 'negative':
          schema.negative = true;
          break;
      }
    }
  }
  return schema;
}

function booleanGuardianToJSON(guardian: any): BooleanGuardianSchema {
  const schema: BooleanGuardianSchema = { type: 'boolean' };
  if (guardian._validations) {
    for (const v of guardian._validations) {
      if (v.type === 'equals') schema.equals = v.value;
    }
  }
  return schema;
}

function dateGuardianToJSON(guardian: any): DateGuardianSchema {
  const schema: DateGuardianSchema = { type: 'date' };
  if (guardian._validations) {
    for (const v of guardian._validations) {
      switch (v.type) {
        case 'min':
          schema.min = v.value.toISOString();
          break;
        case 'max':
          schema.max = v.value.toISOString();
          break;
      }
    }
  }
  return schema;
}

function arrayGuardianToJSON(guardian: any): ArrayGuardianSchema {
  const schema: ArrayGuardianSchema = { type: 'array' };
  if (guardian._elementGuardian) {
    schema.of = serialize(guardian._elementGuardian);
  }
  if (guardian._validations) {
    for (const v of guardian._validations) {
      switch (v.type) {
        case 'length':
          schema.length = v.value;
          break;
        case 'minLength':
          schema.minLength = v.value;
          break;
        case 'maxLength':
          schema.maxLength = v.value;
          break;
        case 'notEmpty':
          schema.notEmpty = true;
          break;
      }
    }
  }
  return schema;
}

function objectGuardianToJSON(guardian: any): ObjectGuardianSchema {
  const schema: ObjectGuardianSchema = { type: 'object' };
  if (guardian._schema) {
    schema.schema = {} as Record<string, any>;
    for (const [k, g] of Object.entries(guardian._schema)) {
      (schema.schema as any)[k] = serialize(g);
    }
  }
  if (guardian._validations) {
    for (const v of guardian._validations) {
      switch (v.type) {
        case 'strict':
          schema.strict = v.value;
          break;
        case 'additionalProperties':
          schema.additionalProperties = v.value;
          break;
        case 'notEmpty':
          schema.notEmpty = true;
          break;
      }
    }
  }
  return schema;
}

function schemaGuardianToJSON(guardian: any): ObjectGuardianSchema {
  const schema: ObjectGuardianSchema = { type: 'object' };

  // SchemaGuardian always has a schema property
  if (guardian.schema) {
    schema.schema = {} as Record<string, any>;
    for (const [k, g] of Object.entries(guardian.schema)) {
      (schema.schema as any)[k] = serialize(g);
    }
  }

  // Get schema options
  if (guardian.schemaOptions) {
    const options = guardian.schemaOptions;
    if (options.strict !== undefined) {
      schema.strict = options.strict;
    }
    if (options.additionalProperties !== undefined) {
      schema.additionalProperties = options.additionalProperties;
    }
    if (options.message) {
      schema.error = options.message;
    }
  }

  return schema;
}

function functionGuardianToJSON(_guardian: any): FunctionGuardianSchema {
  return { type: 'function' };
}
function unknownGuardianToJSON(_guardian: any): UnknownGuardianSchema {
  return { type: 'unknown' };
}

function inferGuardianType(guardian: any): GuardianSchema {
  try {
    guardian('test');
    return { type: 'string' } as StringGuardianSchema;
  } catch { /* ignore */ }
  try {
    guardian(123);
    return { type: 'number' } as NumberGuardianSchema;
  } catch { /* ignore */ }
  try {
    guardian(true);
    return { type: 'boolean' } as BooleanGuardianSchema;
  } catch { /* ignore */ }
  try {
    guardian([]);
    return { type: 'array' } as ArrayGuardianSchema;
  } catch { /* ignore */ }
  try {
    guardian({});
    return { type: 'object' } as ObjectGuardianSchema;
  } catch { /* ignore */ }
  return { type: 'unknown' } as UnknownGuardianSchema;
}
