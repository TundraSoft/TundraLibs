/**
 * @fileoverview JSON Schema → source text: the `@tundralibs/guardian`
 * expression that validates a value and the TypeScript type it yields.
 * Covers what guardian's own `toJSONSchema()` / `toOpenAPI()` emit; a
 * construct it cannot express becomes `Guardian.unknown()` / `unknown`,
 * so a generated guard is at worst looser than the server's, never wrong.
 * @module
 */

/** One schema as source text. */
export type SchemaSource = {
  /** A guardian expression, e.g. `Guardian.string().email()`. */
  guard: string;
  /** The matching TypeScript type, e.g. `string`. */
  type: string;
};

type Json = Record<string, unknown>;

const UNKNOWN: SchemaSource = { guard: 'Guardian.unknown()', type: 'unknown' };

/** `format` values guardian emits that have a string validator of their own. */
const STRING_FORMATS: Record<string, string> = {
  email: 'email',
  uri: 'url',
  uuid: 'uuid',
  ulid: 'ulid',
};

const isJson = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const literal = (value: unknown): string => JSON.stringify(value);

const key = (name: string): string =>
  /^[A-Za-z_$][\w$]*$/.test(name) ? name : literal(name);

/** Parenthesise a union so it can take a `[]` suffix. */
const element = (type: string): string =>
  type.includes(' | ') ? `(${type})` : type;

/** Append `.name(value)` for each numeric keyword the schema carries. */
const bounds = (schema: Json, calls: Record<string, string>): string =>
  Object.entries(calls).map(([keyword, method]) =>
    typeof schema[keyword] === 'number' ? `.${method}(${schema[keyword]})` : ''
  ).join('');

function objectSource(schema: Json, defs: Json): SchemaSource {
  const extra = schema.additionalProperties;
  if (!isJson(schema.properties)) {
    // A bare `{ type: 'object' }` is rapid's placeholder for "no schema
    // declared", not a promise that the value is an object.
    if (extra === undefined) return UNKNOWN;
    const value = extra === true ? UNKNOWN : schemaSource(extra, defs);
    return {
      guard: `Guardian.record(Guardian.string(), ${value.guard})`,
      type: `Record<string, ${value.type}>`,
    };
  }
  const required = new Set(
    Array.isArray(schema.required) ? schema.required : [],
  );
  const guards: string[] = [];
  const types: string[] = [];
  for (const [name, child] of Object.entries(schema.properties)) {
    const source = schemaSource(child, defs);
    const optional = !required.has(name);
    guards.push(
      `${key(name)}: ${source.guard}${optional ? '.optional()' : ''}`,
    );
    types.push(`${key(name)}${optional ? '?' : ''}: ${source.type}`);
  }
  if (extra === true) types.push('[key: string]: unknown');
  return {
    guard: `Guardian.object({ ${guards.join(', ')} })${
      extra === true ? '.passthrough()' : ''
    }`,
    type: types.length === 0
      ? 'Record<string, never>'
      : `{ ${types.join('; ')} }`,
  };
}

function arraySource(schema: Json, defs: Json): SchemaSource {
  if (Array.isArray(schema.prefixItems)) {
    const items = schema.prefixItems.map((item) => schemaSource(item, defs));
    return {
      guard: `Guardian.tuple([${items.map((i) => i.guard).join(', ')}])`,
      type: `[${items.map((i) => i.type).join(', ')}]`,
    };
  }
  const item = schemaSource(schema.items, defs);
  return {
    guard: `Guardian.array(${item.guard})${
      bounds(schema, { minItems: 'minLength', maxItems: 'maxLength' })
    }`,
    type: `${element(item.type)}[]`,
  };
}

function coreSource(schema: Json, defs: Json): SchemaSource {
  if (typeof schema.$ref === 'string') {
    const name = schema.$ref.startsWith('#/$defs/')
      ? schema.$ref.slice('#/$defs/'.length)
      : undefined;
    return name !== undefined && name in defs
      ? schemaSource(defs[name], defs)
      : UNKNOWN;
  }
  const tag = isJson(schema.discriminator)
    ? schema.discriminator.propertyName
    : undefined;
  if (Array.isArray(schema.oneOf) && typeof tag === 'string') {
    const members = schema.oneOf.map((member) => schemaSource(member, defs));
    if (members.includes(UNKNOWN)) return UNKNOWN;
    return {
      guard: `Guardian.discriminatedUnion(${literal(tag)}, [${
        members.map((m) => m.guard).join(', ')
      }])`,
      type: members.map((m) => m.type).join(' | '),
    };
  }
  if ('const' in schema) {
    return {
      guard: `Guardian.literal(${literal(schema.const)})`,
      type: literal(schema.const),
    };
  }
  if (Array.isArray(schema.enum) && schema.enum.length > 0) {
    return {
      guard: `Guardian.enum([${schema.enum.map(literal).join(', ')}] as const)`,
      type: schema.enum.map(literal).join(' | '),
    };
  }
  switch (schema.type) {
    case 'string': {
      const format = STRING_FORMATS[String(schema.format)];
      return {
        guard: `Guardian.string()${
          bounds(schema, { minLength: 'minLength', maxLength: 'maxLength' })
        }${
          typeof schema.pattern === 'string'
            ? `.pattern(new RegExp(${literal(schema.pattern)}))`
            : ''
        }${format === undefined ? '' : `.${format}()`}`,
        type: 'string',
      };
    }
    case 'number':
    case 'integer':
      return {
        guard: `Guardian.number()${
          schema.type === 'integer' ? '.integer()' : ''
        }${
          bounds(schema, {
            minimum: 'min',
            maximum: 'max',
            multipleOf: 'multipleOf',
          })
        }`,
        type: 'number',
      };
    case 'boolean':
      return { guard: 'Guardian.boolean()', type: 'boolean' };
    case 'array':
      return arraySource(schema, defs);
    case 'object':
      return objectSource(schema, defs);
    default:
      return UNKNOWN;
  }
}

/**
 * The guardian expression and TypeScript type for one JSON Schema (or
 * OpenAPI 3.0 schema object: `nullable: true` is read as well as a
 * `'null'` entry in `type`). `$ref` resolves against the schema's own
 * `$defs` only.
 */
export function schemaSource(schema: unknown, defs: Json = {}): SchemaSource {
  if (!isJson(schema)) return UNKNOWN;
  const scope = isJson(schema.$defs) ? { ...defs, ...schema.$defs } : defs;
  const types = Array.isArray(schema.type) ? schema.type : [schema.type];
  const core = coreSource(
    { ...schema, type: types.find((t) => t !== 'null') },
    scope,
  );
  const nullable = schema.nullable === true || types.includes('null');
  if (!nullable || core === UNKNOWN) return core;
  return {
    guard: `${core.guard}.nullable()`,
    type: `${core.type} | null`,
  };
}

/** Whether a source is the "nothing known" fallback (no guard worth emitting). */
export function isUnknownSource(source: SchemaSource): boolean {
  return source === UNKNOWN;
}
