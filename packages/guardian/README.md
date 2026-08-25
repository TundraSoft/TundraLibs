# Guardian

Schema validation for TypeScript — strict at compile time, forgiving at API boundaries.

[![JSR](https://jsr.io/badges/@tundralibs/guardian)](https://jsr.io/@tundralibs/guardian)
[![JSR Score](https://jsr.io/badges/@tundralibs/guardian/score)](https://jsr.io/@tundralibs/guardian)
![Deno](https://img.shields.io/badge/Deno-000000?logo=deno)
![Bun](https://img.shields.io/badge/Bun-f9f1e1?logo=bun)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white)
![Cloudflare Workers](https://img.shields.io/badge/Cloudflare%20Workers-F38020?logo=cloudflare&logoColor=white)
![Browsers](https://img.shields.io/badge/Browsers-4285F4?logo=googlechrome&logoColor=white)

## Overview

Guardian builds validation pipelines as composable transform functions. You describe the shape of valid data once; Guardian gives you:

- A runtime `.parse()` / `.safeParse()` that validates and **coerces** inputs (numbers from query strings, dates from ISO strings, booleans from `'yes'`/`'no'`).
- Full TypeScript inference — `Guardian.infer<typeof Schema>` produces the parsed output type.
- Documentation emit: `.toOpenAPI()`, `.toJSONSchema()` (2020-12), `.toMarkdown()`. Useful for API docs, form generation, and cross-language codegen.

## Documentation

| Topic                                                | Description                                                 |
| ---------------------------------------------------- | ----------------------------------------------------------- |
| [Validators](docs/Guardian-Validators.md)            | Per-type guardians: string, number, boolean, date, etc.     |
| [Schemas](docs/Guardian-Schemas.md)                  | Composition: objects, arrays, tuples, records, unions       |
| [Refinements](docs/Guardian-Refinements.md)          | `.refine()`, `.superRefine()`, `.process()`, `.transform()` |
| [Errors](docs/Guardian-Errors.md)                    | `GuardianError`, paths, causes, multi-field reporting       |
| [Documentation Emit](docs/Guardian-Documentation.md) | `.toOpenAPI()` · `.toJSONSchema()` · `.toMarkdown()`        |
| [Examples](docs/Guardian-Examples.md)                | Request validation, form parsing, config loading, more      |

## Installation

**Deno:**

```bash
deno add @tundralibs/guardian
```

**Bun:**

```bash
bunx jsr add @tundralibs/guardian
```

**Node.js:**

```bash
npx jsr add @tundralibs/guardian
```

### Runtime support

Guardian is pure TypeScript with no I/O, no filesystem access, and no
runtime-specific globals, so it runs unchanged on **Deno**, **Bun**,
**Node.js**, **Cloudflare Workers**, and **browsers**.

Bundling for Workers or the browser needs no special configuration — no
`nodejs_compat` flag, no aliases, no polyfills. Importing the barrel
(`@tundralibs/guardian`) is fine on those targets; the sub-path exports
exist for ergonomics, not bundle size.

**Direct import (Deno):**

```typescript
import { Guardian } from 'jsr:@tundralibs/guardian';
```

## Quick Start

```typescript
import { Guardian } from '@tundralibs/guardian';

const UserSchema = Guardian.object({
  id: Guardian.number().integer().positive(),
  name: Guardian.string().minLength(1).maxLength(50),
  email: Guardian.string().email(),
  age: Guardian.number().integer().min(0).max(120).optional(),
  role: Guardian.enum(['admin', 'user', 'guest']),
});

type User = Guardian.infer<typeof UserSchema>;
// → { id: number; name: string; email: string; age?: number; role: 'admin'|'user'|'guest' }

const user = UserSchema.parse({
  id: 1,
  name: 'Ada',
  email: 'ada@example.com',
  role: 'admin',
});
```

### `safeParse` for non-throwing flow

```typescript ignore
const [err, user] = UserSchema.safeParse(input);
if (err) {
  return Response.json({ error: err.message }, { status: 400 });
}
// `user` is typed `User` here.
```

### Coercion at the boundary

Strings from `URLSearchParams`, form data, environment variables, and JSON-from-CSV are all coerced to their declared types by default:

```typescript
import { Guardian } from '@tundralibs/guardian';

const QuerySchema = Guardian.object({
  page: Guardian.number().integer().min(1),
  limit: Guardian.number().integer().min(1).max(100),
  q: Guardian.string().optional(),
});

// All of these work — strings → numbers as declared.
QuerySchema.parse({ page: '3', limit: '20', q: 'guardian' });
// → { page: 3, limit: 20, q: 'guardian' }
```

See [Validators](docs/Guardian-Validators.md#coercion-rules) for the full coercion rules per type.

Validating a vendor _response_ instead of parsing input? `Guardian.number()` / `Guardian.boolean()` expose `.strict()` to opt out of coercion — the input must already be the declared JS type, or it throws:

```typescript
import { Guardian } from '@tundralibs/guardian';

const StrictAge = Guardian.number().strict();
StrictAge.parse(42); // 42
StrictAge.parse('42'); // throws — no coercion in strict mode
```

### Discriminated unions

```typescript
import { Guardian } from '@tundralibs/guardian';

const Shape = Guardian.discriminatedUnion('kind', [
  Guardian.object({
    kind: Guardian.literal('circle'),
    radius: Guardian.number().positive(),
  }),
  Guardian.object({
    kind: Guardian.literal('square'),
    side: Guardian.number().positive(),
  }),
  Guardian.object({
    kind: Guardian.literal('triangle'),
    a: Guardian.number(),
    b: Guardian.number(),
    c: Guardian.number(),
  }),
]);

const s = Shape.parse({ kind: 'circle', radius: 5 });
if (s.kind === 'circle') s.radius; // narrowed to `number`
```

### Composition beyond objects + arrays

Object/array/record/tuple/discriminated-union are joined by a handful of meta-combinators for cases the four primary shapes don't reach:

```typescript
import { BaseGuardian, Guardian } from '@tundralibs/guardian';

// Set / Map at the boundary (JSON has neither — wire format is array / object).
Guardian.set(Guardian.string()); // Set<string>
Guardian.map(Guardian.string(), Guardian.number()); // Map<string, number>

// Recursive types via a lazy reference to a not-yet-defined schema.
type Tree = { value: number; children: Tree[] };
const TreeSchema: BaseGuardian<Tree> = Guardian.object({
  value: Guardian.number(),
  children: Guardian.array(Guardian.lazy(() => TreeSchema)),
});

// Intersection — both schemas must succeed; outputs merge for objects.
const Person = Guardian.intersection(
  Guardian.object({ id: Guardian.string() }),
  Guardian.object({ name: Guardian.string() }),
);

// Boundary preprocessing — reshape input before any guardian sees it.
const Trimmed = Guardian.preprocess(
  (v) => typeof v === 'string' ? v.trim() : v,
  Guardian.string().minLength(1),
);

// instanceof escape hatch for class-typed values.
const Url = Guardian.instanceof(URL);
```

See [Schemas](docs/Guardian-Schemas.md) for the full set, including `instanceof`, `preprocess`, `never`, and `catchall` on objects.

### Nominal brands

`.brand<'UserId'>()` produces an assignment-incompatible alias of the underlying type — zero runtime cost, full compile-time safety:

```typescript ignore
const UserId = Guardian.string().uuid().brand<'UserId'>();
const OrderId = Guardian.string().uuid().brand<'OrderId'>();

function loadUser(id: Guardian.infer<typeof UserId>): Promise<User> {/* … */}

const oid = OrderId.parse(crypto.randomUUID());
loadUser(oid); // ❌ compile error: OrderId not assignable to UserId
```

### Documentation emit

```typescript
import { Guardian, type ObjectGuardian } from '@tundralibs/guardian';

type User = { id: number; name: string };
declare const UserSchema: ObjectGuardian<User>;

UserSchema.toOpenAPI(); // OpenAPI 3.0 schema fragment
UserSchema.toJSONSchema(); // JSON Schema Draft 2020-12 (full document with $schema header)
UserSchema.toMarkdown(); // Markdown documentation for the schema
```

## Design Principles

**Coerce by default at boundaries, strict in the type system.** The primitive guardians (`string`, `number`, `boolean`, `date`, `bigint`) accept loose inputs — query strings, form data — and produce strictly-typed outputs. The TypeScript type matches what `.parse()` returns, not what it accepts.

**Chain methods are immutable.** Every chain method (`.minLength()`, `.process()`, `.refine()`, `.optional()`, …) returns a fresh guardian; the receiver is never mutated. Shared base schemas compose safely — `const NonEmpty = Guardian.string().minLength(1); const Email = NonEmpty.email();` leaves `NonEmpty` exactly as it was. Methods that rebuild a guardian from its parts instead of extending the chain — object `.strict()`/`.strip()`/`.passthrough()`/`.catchall()`, `.pick()`/`.omit()`/`.partial()`/`.extend()`/`.merge()`/…, tuple `.rest()`/`.labels()` — cannot carry chained steps across, so they **throw** if you call them after `.refine()`/`.transform()` rather than silently dropping the rule. Derive first, then chain.

**Finishers seal the chain.** `.optional()` and `.nullable()` return a `FinishedGuardian` — a narrowed view that drops chain-extending methods (`.process`, `.test`, `.equals`, `.min`, etc.). The compiler catches "`.process()` after `.optional()`" before the code ever runs.

**Refinements run at declaration position.** `schema.refine(check, 'msg').transform(reshape)` runs `check` _before_ `transform`. `.refine()` short-circuits on first failure; `.superRefine([...])` accumulates failures across the array so multi-field validation reports every problem.

**Errors carry absolute paths.** Every `GuardianError` has a structured `path: ReadonlyArray<string|number>` that names the failure site from the root. Use `err.leafErrors()` to iterate every concrete-field failure with its absolute path — see [Errors](docs/Guardian-Errors.md).

**Validation, documentation, and codegen share one source.** A Guardian schema is also an OpenAPI fragment, a JSON Schema document, and a Markdown reference. The shape is the schema; the schema is the docs.

## License

MIT
