# Documentation Emit

Every guardian can emit machine-readable documentation. Useful for API docs, UI form generation, cross-language codegen, and anywhere else you want a schema description without writing it twice.

## Table of Contents

- [`.toOpenAPI()` — OpenAPI 3.0 fragment](#toopenapi)
- [`.toJSONSchema()` — JSON Schema 2020-12](#tojsonschema)
- [`.toMarkdown()` — human-readable docs](#tomarkdown)
- [`.describe()` — attaching metadata](#describe)
- [What carries over (and what doesn't)](#what-carries-over)

## `.toOpenAPI()`

Emit an OpenAPI 3.0 schema fragment. Useful when plugging Guardian into an OpenAPI-aware framework (FastAPI-style routers, Swagger UI, etc.).

```typescript
import { Guardian } from '@tundralibs/guardian';

const User = Guardian.object({
  id: Guardian.number().integer().positive(),
  name: Guardian.string().minLength(1).maxLength(50),
  role: Guardian.enum(['admin', 'user']),
});

User.toOpenAPI();
// {
//   type: 'object',
//   properties: {
//     id:   { type: 'number', format: 'integer', minimum: 0, exclusiveMinimum: true },
//     name: { type: 'string', minLength: 1, maxLength: 50 },
//     role: { type: 'string', enum: ['admin', 'user'] },
//   },
//   required: ['id', 'name', 'role'],
//   additionalProperties: false,
// }
```

The output is a fragment — it doesn't include the OpenAPI document envelope (`openapi: 3.0.3`, `paths:`, etc.). Wrap it in your own document or feed it to your framework's schema registry.

## `.toJSONSchema()`

Emit a self-contained JSON Schema Draft 2020-12 document with the `$schema` header. The most useful method for documentation pipelines and codegen.

```typescript
import type { BaseGuardian } from '@tundralibs/guardian';

declare const User: BaseGuardian<unknown>; // the schema from above

User.toJSONSchema();
// {
//   $schema: 'https://json-schema.org/draft/2020-12/schema',
//   type: 'object',
//   properties: {
//     id:   { type: 'integer', minimum: 0, exclusiveMinimum: true },
//     name: { type: 'string', minLength: 1, maxLength: 50 },
//     role: { enum: ['admin', 'user'], type: 'string' },
//   },
//   required: ['id', 'name', 'role'],
//   additionalProperties: false,
// }
```

### Codegen pipeline (TypeScript → Pydantic)

```bash
# Dump the schema
deno eval 'console.log(JSON.stringify(MySchema.toJSONSchema(), null, 2))' > schema.json

# Generate Pydantic v2 models
pip install datamodel-code-generator
datamodel-codegen \
  --input schema.json \
  --input-file-type jsonschema \
  --output models.py \
  --output-model-type pydantic_v2.BaseModel
```

Now your JS validation and your Python types are derived from the same source.

### Form generation (`@rjsf/core`)

```typescript ignore
import Form from '@rjsf/core';
import validator from '@rjsf/validator-ajv8';

<Form
  schema={MySchema.toJSONSchema()}
  validator={validator}
  onSubmit={({ formData }) => MySchema.parse(formData)}
/>;
```

Forms render automatically. The same Guardian schema validates the submitted data — one source of truth.

### Draft choice

`.toJSONSchema()` emits Draft 2020-12 only. The 2020-12 vocabulary gives Guardian the keywords it needs for clean output:

- `prefixItems` for tuples (vs Draft 7's overloaded `items: [array]`)
- `$defs` for subschemas (vs Draft 7's `definitions`)
- Native `discriminator` for tagged unions (Draft 7 has no equivalent)
- `const` as the idiomatic single-value literal (Draft 7 has it but uses `enum` more often)

Most modern tooling (AJV 8+, datamodel-code-generator, JSON Forms) supports 2020-12. Older tooling that only speaks Draft 7 may reject the schema; in that case, a separate conversion pass (e.g. `json-schema-migrate`) is needed.

### Discriminated unions

`.toJSONSchema()` on a `DiscriminatedUnionGuardian` emits proper `$defs` + `discriminator` + `oneOf`:

```typescript
import { Guardian } from '@tundralibs/guardian';

const Shape = Guardian.discriminatedUnion('kind', [
  Guardian.object({
    kind: Guardian.literal('circle'),
    radius: Guardian.number(),
  }),
  Guardian.object({
    kind: Guardian.literal('square'),
    side: Guardian.number(),
  }),
]);

Shape.toJSONSchema();
// {
//   $schema: 'https://json-schema.org/draft/2020-12/schema',
//   oneOf: [
//     { $ref: '#/$defs/circle' },
//     { $ref: '#/$defs/square' },
//   ],
//   discriminator: {
//     propertyName: 'kind',
//     mapping: {
//       circle: '#/$defs/circle',
//       square: '#/$defs/square',
//     },
//   },
//   $defs: {
//     circle: { type: 'object', properties: { kind: { const: 'circle' }, radius: { type: 'number' } }, ... },
//     square: { type: 'object', properties: { kind: { const: 'square' }, side:   { type: 'number' } }, ... },
//   },
// }
```

Code generators (`datamodel-codegen`, `quicktype`) produce narrowed types from this output: `Literal['circle']` for the discriminator field in Pydantic, `'circle'` literal types in TypeScript, etc.

## `.toMarkdown()`

Emit human-readable Markdown:

```typescript
import { Guardian } from '@tundralibs/guardian';

const Schema = Guardian.string()
  .minLength(3)
  .maxLength(20)
  .describe({
    title: 'Username',
    description:
      'User account identifier. Letters, digits, and underscores only.',
    examples: ['ada', 'john_doe'],
  });

Schema.toMarkdown();
// ### Username
//
// User account identifier. Letters, digits, and underscores only.
//
// **Type:** string
//
// **Examples:** `"ada"`, `"john_doe"`
```

Useful for auto-generating reference docs from your schemas.

## `.describe()`

Attach metadata that flows into `toOpenAPI()`, `toJSONSchema()`, and `toMarkdown()`:

```typescript
import { Guardian } from '@tundralibs/guardian';

const Age = Guardian.number().integer().min(0).max(120).describe({
  title: 'Age',
  description: 'Age in years.',
  examples: [25, 42],
  deprecated: false,
});

Age.toJSONSchema();
// {
//   $schema: '...',
//   type: 'integer',
//   minimum: 0,
//   maximum: 120,
//   title: 'Age',
//   description: 'Age in years.',
//   examples: [25, 42],
// }
```

`title` and `description` are also what form generators (`@rjsf/core`, JSON Forms) display as field labels and help text — these survive into JSON Schema as standard keywords, unlike error messages.

| Metadata field | Used by                        | Notes                                                                                                               |
| -------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| `title`        | OpenAPI, JSON Schema, Markdown | Field label                                                                                                         |
| `description`  | OpenAPI, JSON Schema, Markdown | Field description                                                                                                   |
| `examples`     | OpenAPI, JSON Schema           | Example values                                                                                                      |
| `format`       | OpenAPI, JSON Schema           | Format hint (`'email'`, `'uuid'`, etc. — usually set by the validator method itself)                                |
| `deprecated`   | OpenAPI, JSON Schema           | Mark as deprecated                                                                                                  |
| `default`      | OpenAPI, JSON Schema           | Default value (informational only — Guardian doesn't apply this; use `.optional(default)` for runtime substitution) |

Protected metadata (`isNullable`, `isOptional`, `isAsync`) is set automatically by the chain methods and can't be overridden via `.describe()`.

## What carries over

The emitted schemas describe **statically-knowable structure**. Some Guardian features can't be expressed in either OpenAPI or JSON Schema:

| Guardian feature                                                                                    | OpenAPI                               | JSON Schema 2020-12             | Notes                                                                                                                                   |
| --------------------------------------------------------------------------------------------------- | ------------------------------------- | ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Static constraints (`minLength`, `pattern`, `minimum`, `enum`, `format`, `additionalProperties`, …) | ✅                                    | ✅                              | One-to-one                                                                                                                              |
| `.optional()`                                                                                       | ✅                                    | ✅                              | Omission from `required`                                                                                                                |
| `.nullable()`                                                                                       | ✅ `nullable: true`                   | ✅ `type: ["x", "null"]`        |                                                                                                                                         |
| `.passthrough()` / `.strict()` / `.strip()`                                                         | ✅                                    | ✅                              | `additionalProperties: true/false/false`                                                                                                |
| `.catchall(g)`                                                                                      | ✅ `additionalProperties: <g schema>` | ✅                              | The catchall guardian's schema becomes the `additionalProperties` value                                                                 |
| Tuples (fixed)                                                                                      | ⚠️ partial                            | ✅ `prefixItems`                | OpenAPI 3.0 lacks first-class tuples                                                                                                    |
| Tuples + `.rest(g)`                                                                                 | ⚠️ partial                            | ✅ `prefixItems` + `items: <g>` | Variadic tail becomes the open-ended `items` schema; `maxItems` is dropped                                                              |
| `.labels([...])` on tuples                                                                          | ⚠️ surfaces in error messages         | ⚠️ surfaces in error messages   | Labels are runtime metadata — not part of the emitted schema                                                                            |
| Discriminated unions                                                                                | ✅                                    | ✅                              | Both have `discriminator`                                                                                                               |
| Intersection (`Guardian.intersection`)                                                              | ✅ `allOf`                            | ✅ `allOf`                      | Standard `allOf` keyword                                                                                                                |
| `Guardian.set`                                                                                      | ✅ `type: array, uniqueItems: true`   | ✅                              | Closest JSON Schema analog for `Set`                                                                                                    |
| `Guardian.map`                                                                                      | ⚠️ partial                            | ✅ array of `[K, V]` tuples     | Faithful to native `Map` (preserves order + non-string keys); object-shaped wire format is **not** emitted as the primary schema        |
| `Guardian.lazy` (recursive)                                                                         | ✅ `$ref: '#'` on self-reference      | ✅ `$ref: '#'`                  | Cycles emit a self-reference; downstream tools may want to lift to a named `$defs/<title>` — provide a title via `.describe({ title })` |
| `Guardian.instanceof`                                                                               | ⚠️ `type: object` (opaque)            | ⚠️ `type: object` (opaque)      | `instanceof` checks aren't expressible — emitted as opaque object with `className` annotation                                           |
| `Guardian.preprocess`                                                                               | ⤴ delegates                           | ⤴ delegates                     | Schema describes the **post-preprocess** shape — the inner schema is emitted unchanged                                                  |
| `Guardian.never`                                                                                    | ✅ `not: {}`                          | ✅ `not: {}`                    | Standard "matches nothing" keyword                                                                                                      |
| `.brand<B>()`                                                                                       | ⤴ delegates                           | ⤴ delegates                     | Type-only; runtime no-op — branded values are indistinguishable from their underlying type at the schema level                          |
| `.refine()` / `.superRefine()` / `.test()` predicates                                               | ❌                                    | ❌                              | Runtime-only; arbitrary JS isn't expressible                                                                                            |
| `.process()` / `.transform()` reshaping logic                                                       | ❌                                    | ❌                              | Only the resulting shape is emitted, not the transformation                                                                             |
| Coerce-by-default semantics                                                                         | ❌                                    | ❌                              | Schema is stricter than runtime (`type: 'number'` rejects `'42'`)                                                                       |
| Custom error messages                                                                               | ❌                                    | ❌                              | Neither spec has an error-message vocabulary                                                                                            |

The first list is the 80% that carries over faithfully — everything you'd typically describe in a request-body schema. The bottom list is what stays runtime-only.

For consumers that want the strict-typeof JSON Schema behaviour while Guardian accepts loose inputs: validate via Guardian first (gets the coercion), then optionally re-validate the output via the emitted JSON Schema.

---

[← Back to Guardian](../README.md)
