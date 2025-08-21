// deno-lint-ignore-file no-explicit-any
import { Guardian } from './Guardian.ts';
import type {
  ArrayGuardianSchema,
  BigIntGuardianSchema,
  BooleanGuardianSchema,
  DateGuardianSchema,
  FunctionGuardianSchema,
  GuardianSchema,
  NumberGuardianSchema,
  ObjectGuardianSchema,
  OneOfGuardianSchema,
  StringGuardianSchema,
  UnknownGuardianSchema,
} from './types/mod.ts';

export function parse(schema: GuardianSchema): (value: unknown) => any {
  return buildFromSchema(schema);
}

function buildFromSchema(schema: GuardianSchema): (value: unknown) => any {
  let guardian: any;

  switch (schema.type) {
    case 'string':
      guardian = buildStringGuardian(schema as StringGuardianSchema);
      break;
    case 'number':
      guardian = buildNumberGuardian(schema as NumberGuardianSchema);
      break;
    case 'bigint':
      guardian = buildBigIntGuardian(schema as BigIntGuardianSchema);
      break;
    case 'boolean':
      guardian = buildBooleanGuardian(schema as BooleanGuardianSchema);
      break;
    case 'date':
      guardian = buildDateGuardian(schema as DateGuardianSchema);
      break;
    case 'array':
      guardian = buildArrayGuardian(schema as ArrayGuardianSchema);
      break;
    case 'object':
      guardian = buildObjectGuardian(schema as ObjectGuardianSchema);
      break;
    case 'function':
      guardian = buildFunctionGuardian(schema as FunctionGuardianSchema);
      break;
    case 'unknown':
      guardian = buildUnknownGuardian(schema as UnknownGuardianSchema);
      break;
    case 'oneOf':
      guardian = buildOneOfGuardian(schema as OneOfGuardianSchema);
      break;
    default:
      throw new Error(`Unsupported schema type: ${(schema as any).type}`);
  }

  if (schema.nullable) guardian = guardian.nullable();
  if (schema.optional !== undefined) guardian = guardian.optional();

  return guardian;
}

function buildStringGuardian(schema: StringGuardianSchema): any {
  let guardian = Guardian.string(schema.error);
  if (schema.trim) guardian = guardian.trim();
  if (schema.upperCase) guardian = guardian.upperCase();
  if (schema.lowerCase) guardian = guardian.lowerCase();
  if (schema.stripSpaces) guardian = guardian.stripSpaces();
  if (schema.replace) {
    guardian = guardian.replace(
      schema.replace.searchValue,
      schema.replace.replaceValue,
    );
  }
  if (schema.slice) {
    guardian = guardian.slice(schema.slice.start, schema.slice.end);
  }
  if (schema.minLength !== undefined) {
    guardian = guardian.minLength(schema.minLength);
  }
  if (schema.maxLength !== undefined) {
    guardian = guardian.maxLength(schema.maxLength);
  }
  if (schema.pattern) guardian = guardian.pattern(new RegExp(schema.pattern));
  if (schema.email) guardian = guardian.email();
  if (schema.url) guardian = guardian.url();
  if (schema.uuid) guardian = guardian.uuid();
  if (schema.alpha) guardian = guardian.alpha();
  if (schema.alphanumeric) guardian = guardian.alphanumeric();
  if (schema.numeric) guardian = guardian.numeric();
  if (schema.ipv4) guardian = guardian.ipv4();
  if (schema.ipv6) guardian = guardian.ipv6();
  if (schema.equals !== undefined) guardian = guardian.equals(schema.equals);
  if (schema.notEquals !== undefined) {
    guardian = guardian.notEquals(schema.notEquals);
  }
  if (schema.in) guardian = guardian.in(schema.in);
  if (schema.notIn) guardian = guardian.notIn(schema.notIn);
  return guardian;
}

function buildNumberGuardian(schema: NumberGuardianSchema): any {
  let guardian = Guardian.number(schema.error);
  if (schema.ceil) guardian = guardian.ceil();
  if (schema.floor) guardian = guardian.floor();
  if (schema.abs) guardian = guardian.abs();
  if (schema.min !== undefined) guardian = guardian.min(schema.min);
  if (schema.max !== undefined) guardian = guardian.max(schema.max);
  if (schema.range) {
    guardian = guardian.range(schema.range.min, schema.range.max);
  }
  if (schema.integer) guardian = guardian.integer();
  if (schema.positive) guardian = guardian.positive();
  if (schema.negative) guardian = guardian.negative();
  if (schema.finite) guardian = guardian.finite();
  if (schema.safe) guardian = guardian.safe();
  if (schema.multipleOf !== undefined) {
    guardian = guardian.multipleOf(schema.multipleOf);
  }
  if (schema.equals !== undefined) guardian = guardian.equals(schema.equals);
  if (schema.notEquals !== undefined) {
    guardian = guardian.notEquals(schema.notEquals);
  }
  if (schema.in) guardian = guardian.in(schema.in);
  if (schema.notIn) guardian = guardian.notIn(schema.notIn);
  return guardian;
}

function buildBigIntGuardian(schema: BigIntGuardianSchema): any {
  let guardian = Guardian.bigint(schema.error);
  if (schema.min !== undefined) guardian = guardian.min(BigInt(schema.min));
  if (schema.max !== undefined) guardian = guardian.max(BigInt(schema.max));
  if (schema.range) {
    guardian = guardian.range(
      BigInt(schema.range.min),
      BigInt(schema.range.max),
    );
  }
  if (schema.positive) guardian = guardian.positive();
  if (schema.negative) guardian = guardian.negative();
  if (schema.equals !== undefined) {
    guardian = guardian.equals(BigInt(schema.equals));
  }
  if (schema.notEquals !== undefined) {
    guardian = guardian.notEquals(BigInt(schema.notEquals));
  }
  if (schema.in) guardian = guardian.in(schema.in.map((v) => BigInt(v)));
  if (schema.notIn) {
    guardian = guardian.notIn(schema.notIn.map((v) => BigInt(v)));
  }
  return guardian;
}

function buildBooleanGuardian(schema: BooleanGuardianSchema): any {
  let guardian = Guardian.boolean(schema.error);
  if (schema.equals !== undefined) guardian = guardian.equals(schema.equals);
  if (schema.notEquals !== undefined) {
    guardian = guardian.notEquals(schema.notEquals);
  }
  return guardian;
}

function buildDateGuardian(schema: DateGuardianSchema): any {
  let guardian = Guardian.date(schema.error);
  if (schema.min !== undefined) guardian = guardian.min(new Date(schema.min));
  if (schema.max !== undefined) guardian = guardian.max(new Date(schema.max));
  if (schema.range) {
    guardian = guardian.range(
      new Date(schema.range.min),
      new Date(schema.range.max),
    );
  }
  if (schema.equals !== undefined) {
    guardian = guardian.equals(new Date(schema.equals));
  }
  if (schema.notEquals !== undefined) {
    guardian = guardian.notEquals(new Date(schema.notEquals));
  }
  if (schema.in) guardian = guardian.in(schema.in.map((d) => new Date(d)));
  if (schema.notIn) {
    guardian = guardian.notIn(schema.notIn.map((d) => new Date(d)));
  }
  return guardian;
}

function buildArrayGuardian(schema: ArrayGuardianSchema): any {
  let guardian = Guardian.array(schema.error);
  if (schema.of) {
    const elementGuardian = buildFromSchema(schema.of);
    guardian = guardian.of(elementGuardian);
  }
  if (schema.length !== undefined) guardian = guardian.length(schema.length);
  if (schema.minLength !== undefined) {
    guardian = guardian.minLength(schema.minLength);
  }
  if (schema.maxLength !== undefined) {
    guardian = guardian.maxLength(schema.maxLength);
  }
  if (schema.unique) guardian = guardian.unique();
  if (schema.notEmpty) guardian = guardian.notEmpty();
  return guardian;
}

function buildObjectGuardian(schema: ObjectGuardianSchema): any {
  if (schema.schema) {
    const objectSchema: Record<string, any> = {};
    for (const [key, fieldSchema] of Object.entries(schema.schema)) {
      objectSchema[key] = buildFromSchema(fieldSchema);
    }
    const guardian = Guardian.schema(objectSchema, {
      strict: schema.strict,
      additionalProperties: schema.additionalProperties,
      message: schema.error,
    });
    // Note: notEmpty validation is not available on SchemaGuardian
    // For schema-based objects, use schema validation to ensure required fields
    return guardian;
  } else {
    let guardian = Guardian.object(schema.error);
    if (schema.notEmpty) guardian = guardian.notEmpty();
    return guardian;
  }
}

function buildFunctionGuardian(schema: FunctionGuardianSchema): any {
  return Guardian.function(schema.error);
}
function buildUnknownGuardian(_schema: UnknownGuardianSchema): any {
  return Guardian.unknown();
}
function buildOneOfGuardian(schema: OneOfGuardianSchema): any {
  const guardians = schema.options.map((option) => buildFromSchema(option));
  return Guardian.oneOf(guardians, schema.error);
}
