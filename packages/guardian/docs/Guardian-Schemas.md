# Schemas

Composition primitives: building structured types from the [validators](Guardian-Validators.md).

## Table of Contents

- [`Guardian.object`](#guardianobject)
- [`Guardian.array`](#guardianarray)
- [`Guardian.tuple`](#guardiantuple)
- [`Guardian.record`](#guardianrecord)
- [`Guardian.set`](#guardianset)
- [`Guardian.map`](#guardianmap)
- [`Guardian.oneOf`](#guardianoneof)
- [`Guardian.discriminatedUnion`](#guardiandiscriminatedunion)
- [`Guardian.intersection`](#guardianintersection)
- [`Guardian.lazy`](#guardianlazy)
- [`Guardian.preprocess`](#guardianpreprocess)
- [`Guardian.instanceof`](#guardianinstanceof)
- [`Guardian.never`](#guardiannever)
- [Type inference](#type-inference)
- [Nominal brands](#nominal-brands)

## `Guardian.object`

```typescript
import { Guardian } from '@tundralibs/guardian';

const User = Guardian.object({
  id: Guardian.number().integer().positive(),
  name: Guardian.string().minLength(1),
  email: Guardian.string().email().optional(),
});

User.parse({ id: 1, name: 'Ada' });
// → { id: 1, name: 'Ada' }
```

### Default mode is `strip`

Properties not declared in the schema are silently dropped:

```typescript
import type { BaseGuardian } from '@tundralibs/guardian';

declare const User: BaseGuardian<{ id: number; name: string }>; // from above

User.parse({ id: 1, name: 'Ada', secret: 'leaked' });
// → { id: 1, name: 'Ada' }   ← `secret` is dropped
```

This is safer than the typical "passthrough" default — extra keys from the client never leak onto your domain object. Switch via:

| Mode                 | Behaviour                                              | Use when                                                                   |
| -------------------- | ------------------------------------------------------ | -------------------------------------------------------------------------- |
| `.strip()` (default) | drop unknown keys silently                             | API request validation, internal boundaries                                |
| `.passthrough()`     | keep unknown keys on the output                        | forward-compatible wire protocols where unknown fields should flow through |
| `.strict()`          | throw `GuardianError` on unknown keys                  | strict API contracts, config files                                         |
| `.catchall(g)`       | run guardian `g` against every **unknown** key's value | partially-typed bags where extras must still pass a shared validator       |

```typescript
import { Guardian } from '@tundralibs/guardian';

const Strict = Guardian.object({ id: Guardian.number() }).strict();
Strict.parse({ id: 1, extra: 'x' }); // throws

const Open = Guardian.object({ id: Guardian.number() }).passthrough();
Open.parse({ id: 1, extra: 'x' }); // → { id: 1, extra: 'x' }

const Tagged = Guardian.object({ id: Guardian.number() })
  .catchall(Guardian.string());
Tagged.parse({ id: 1, label: 'beta', stage: 'rollout' });
// → { id: 1, label: 'beta', stage: 'rollout' }
Tagged.parse({ id: 1, count: 5 });
// throws — `count` value isn't a string
```

`.catchall(g)` and the other three modes are mutually exclusive; the last call wins on the same chain.

**Set the mode before chaining cross-field validation.** A mode change rebuilds the object guardian from its schema, which cannot carry over `.refine()` / `.superRefine()` / `.transform()` / `.process()` steps added earlier in the chain. Rather than silently drop them, the mode setters **throw** when a step is already present — so put the mode first. (The same rule applies to the [schema-manipulation methods](#schema-manipulation) and to tuple `.rest()` / `.labels()`, which rebuild from their parts for the same reason.)

```typescript
import { Guardian } from '@tundralibs/guardian';

// ✓ mode first, then refine
Guardian.object({ a: Guardian.string(), b: Guardian.string() })
  .strict()
  .refine((d) => d.a !== d.b, 'a and b must differ');

// ✗ refine first, then mode → throws GuardianError at build time
Guardian.object({ a: Guardian.string() })
  .refine((d) => d.a !== 'bad', 'no')
  .strict(); // "Cannot call strict() after refinements or transforms …"
```

### Optional fields

A property's guardian carries the optional/nullable semantics:

```typescript
import { Guardian } from '@tundralibs/guardian';

const Schema = Guardian.object({
  name: Guardian.string(), // required
  email: Guardian.string().email().optional(), // T | undefined (omittable from input)
  bio: Guardian.string().nullable(), // T | null (must be present but can be null)
});
```

The inferred type respects this:

```typescript
import { Guardian } from '@tundralibs/guardian';

const Schema = Guardian.object({
  name: Guardian.string(),
  email: Guardian.string().email().optional(),
  bio: Guardian.string().nullable(),
});

type S = Guardian.infer<typeof Schema>;
// { name: string; email?: string; bio: string | null }
```

### Schema manipulation

| Method                     | Description                                                                               |
| -------------------------- | ----------------------------------------------------------------------------------------- |
| `.pick(...keys)`           | new schema with only the listed keys                                                      |
| `.omit(...keys)`           | new schema without the listed keys                                                        |
| `.partial()`               | top-level fields become optional                                                          |
| `.deepPartial()`           | every nested `ObjectGuardian` field recursively becomes optional                          |
| `.required(...keys?)`      | all fields (or listed keys) become required                                               |
| `.extend(addSchema)`       | add new fields                                                                            |
| `.property(key, guardian)` | add a single field                                                                        |
| `.merge(other)`            | combine with another `ObjectGuardian`'s schema (right wins on key conflicts)              |
| `.exclude(...keys)`        | alias for `.omit(...keys)` — convention from TS's `Exclude<keyof T, …>`                   |
| `.renameField(from, to)`   | rename a single schema key (the renamed schema validates against the new key name)        |
| `.keyOf()`                 | returns an `EnumGuardian` over the schema's keys — useful for `Pick`-style request bodies |
| `.shape` (getter)          | read-only access to the underlying `{ [key]: guardian }` map                              |

```typescript
import { Guardian } from '@tundralibs/guardian';

const Base = Guardian.object({
  id: Guardian.number(),
  name: Guardian.string(),
  email: Guardian.string(),
});

const Identity = Base.pick('id', 'name'); // { id, name }
const Editable = Base.omit('id'); // { name, email }
const Patch = Base.partial(); // { id?, name?, email? }
const WithRole = Base.extend({ role: Guardian.string() });
```

**Derive before you chain.** Every method in this table rebuilds the guardian from its schema, exactly like the mode setters above, and for the same reason cannot carry `.refine()` / `.superRefine()` / `.transform()` / `.process()` steps across. They therefore **throw** when a step is already present rather than silently dropping it:

```typescript
import { Guardian } from '@tundralibs/guardian';

// ✗ refine first, then derive → throws GuardianError at build time
Guardian.object({ password: Guardian.string(), confirm: Guardian.string() })
  .refine((d) => d.password === d.confirm, 'passwords must match')
  .partial(); // "Cannot call partial() after refinements or transforms …"

// ✓ derive first, then refine
Guardian.object({ password: Guardian.string(), confirm: Guardian.string() })
  .partial()
  .refine((d) => d.password === d.confirm, 'passwords must match');
```

### Key existence checks

| Method                       | Description                                           |
| ---------------------------- | ----------------------------------------------------- |
| `.hasKeys(keys, msg?)`       | every listed key must be present with a defined value |
| `.forbiddenKeys(keys, msg?)` | none of the listed keys may appear                    |

**Note on `forbiddenKeys` + strip mode:** under the default `strip` mode, unknown keys are dropped _before_ `forbiddenKeys` runs as a refinement — making the check a no-op. Combine with `.passthrough()` (or rely on `.strict()`) to make `forbiddenKeys` meaningful.

```typescript
import { Guardian } from '@tundralibs/guardian';

// Works as expected:
Guardian.object({ id: Guardian.number() })
  .passthrough()
  .forbiddenKeys(['secret']);

// No-op (extras stripped before refinement):
Guardian.object({ id: Guardian.number() })
  .forbiddenKeys(['secret']);
```

## `Guardian.array`

```typescript
import { Guardian } from '@tundralibs/guardian';

const Tags = Guardian.array(Guardian.string()).minLength(1).maxLength(10);
Tags.parse(['guardian', 'validation']); // OK
```

### Methods

| Method                                                    | Description                                           |
| --------------------------------------------------------- | ----------------------------------------------------- |
| `.minLength(n)` / `.maxLength(n)` / `.length(n)`          | size constraints                                      |
| `.nonEmpty()`                                             | sugar for `.minLength(1)`                             |
| `.unique(msg?)`                                           | reject duplicate elements                             |
| `.includes(value, msg?)`                                  | array must contain `value`                            |
| `.excludes(value, msg?)`                                  | array must NOT contain `value`                        |
| `.distinctBy(keyFn, msg?)`                                | reject duplicates under a key-extraction function     |
| `.sorted(comparator?, msg?)`                              | reject unsorted inputs                                |
| `.map(fn)` / `.filter(fn)` / `.sort(cmp?)` / `.reverse()` | post-validation transforms                            |
| `.take(n)` / `.skip(n)` / `.tail(n)`                      | sub-array selection (first n / drop first n / last n) |
| `.toSet()`                                                | convert to `Set`; returns `BaseGuardian<Set<T>>`      |

### Without an element validator

```typescript
import { Guardian } from '@tundralibs/guardian';

const Anything = Guardian.array();
Anything.parse([1, 'mixed', true]); // accepts heterogeneous arrays
```

## `Guardian.tuple`

Fixed-length, position-typed array. Each position has its own validator and contributes its own type to the output tuple.

```typescript
import { Guardian } from '@tundralibs/guardian';

const Range = Guardian.tuple([
  Guardian.number().integer().min(0),
  Guardian.number().integer().min(0),
]);

const r = Range.parse([10, 20]);
// r: [number, number]   ← preserved positional types
```

Multiple-element tuples preserve every position's type:

```typescript
import { Guardian } from '@tundralibs/guardian';

const Triple = Guardian.tuple([
  Guardian.string(),
  Guardian.number(),
  Guardian.boolean(),
]);

const [s, n, b] = Triple.parse(['x', 1, true]);
// s: string, n: number, b: boolean
```

Length is exact:

```typescript
import type { BaseGuardian } from '@tundralibs/guardian';

declare const Range: BaseGuardian<[number, number]>; // from above

Range.parse([10, 20, 30]); // throws — too long
Range.parse([10]); // throws — too short
```

Errors carry the failing index:

```typescript
import type { BaseGuardian } from '@tundralibs/guardian';

declare const Triple: BaseGuardian<[string, number, boolean]>; // from above

try {
  Triple.parse(['x', 'not-a-number', true]);
} catch (e) {
  // e.message: "Tuple element at index 1: …"
}
```

### Variadic tails — `.rest(g)`

Drop the fixed-length requirement and accept additional elements typed by `g`:

```typescript
import { Guardian } from '@tundralibs/guardian';

const MoveCommand = Guardian.tuple([
  Guardian.literal('move'),
  Guardian.number().integer(),
  Guardian.number().integer(),
]).rest(Guardian.string());

MoveCommand.parse(['move', 10, 20]); // OK — no rest
MoveCommand.parse(['move', 10, 20, 'fast', 'q']); // OK — rest values validated as strings
```

The fixed prefix still must be present; tail elements may number zero or more.

### Positional labels — `.labels([...])`

Attach human-readable names to tuple positions so errors say `'y' (index 1)` instead of just `index 1`:

```typescript
import { Guardian } from '@tundralibs/guardian';

const Coord = Guardian.tuple([
  Guardian.number(),
  Guardian.number().positive(),
]).labels(['x', 'y']);

const [err] = Coord.safeParse([0, -1]);
err?.message;
// "Tuple element 'y' (index 1): …"
```

Label count must match the fixed-prefix length; constructor throws otherwise.

`.rest(g)` and `.labels([...])` both rebuild the tuple from its positional guardians, so — like the object mode setters and schema-manipulation methods — they **throw** when a `.refine()` / `.superRefine()` / `.transform()` / `.process()` step has already been chained, instead of dropping it. Call them before chaining.

## `Guardian.record`

Object with arbitrary keys, all values of one type.

```typescript
import { Guardian } from '@tundralibs/guardian';

// 1-arg form: Record<string, V>
const Metrics = Guardian.record(Guardian.number());
Metrics.parse({ uptime: 60, errors: 0 });
```

```typescript
import { Guardian } from '@tundralibs/guardian';

// 2-arg form: pattern-validated keys
const EnvVars = Guardian.record(
  Guardian.string().pattern(/^[A-Z_]+$/),
  Guardian.string(),
);
EnvVars.parse({ API_KEY: 'abc', DB_HOST: 'localhost' });
// throws: { api_key: 'lowercase' }
```

| Method                                                | Description             |
| ----------------------------------------------------- | ----------------------- |
| `.minSize(n)` / `.maxSize(n)` / `.size(n)`            | key-count constraints   |
| `.hasKeys(keys, msg?)` / `.forbiddenKeys(keys, msg?)` | key existence           |
| `.notEmpty(msg?)`                                     | sugar for `.minSize(1)` |

## `Guardian.set`

`Set<T>` validator. JSON has no `Set` literal, so arrays are accepted at the boundary and deduplicated naturally by the resulting `Set`.

```typescript
import { Guardian } from '@tundralibs/guardian';
const Tags = Guardian.set(Guardian.string().minLength(1));

Tags.parse(['a', 'b', 'a']); // Set { 'a', 'b' }
Tags.parse(new Set(['a', 'b'])); // Set { 'a', 'b' }
Tags.parse('not-iterable'); // throws
```

The element guardian is optional. Without one, inputs flow through untouched into a `Set<unknown>`:

```typescript
import { Guardian } from '@tundralibs/guardian';
Guardian.set().parse([1, 'two', true, null]);
// → Set { 1, 'two', true, null }
```

Schema emit: `type: 'array'` with `uniqueItems: true` — the closest JSON Schema analogue. Downstream codegen tools typically render this as `Set<T>` in TypeScript or `set[T]` in Python.

## `Guardian.map`

`Map<K, V>` validator. Distinct from [`record`](#guardianrecord), which produces a plain object — `Map` preserves insertion order and supports non-string keys.

Three input shapes are accepted at the boundary:

```typescript
import { Guardian } from '@tundralibs/guardian';
const Headers = Guardian.map(Guardian.string(), Guardian.string());

Headers.parse(new Map([['x-trace', 'abc']])); // native Map
Headers.parse([['x-trace', 'abc']]); // array of [K,V] pairs
Headers.parse({ 'x-trace': 'abc' }); // plain object (string keys only)
```

For non-string keys, pass an array of pairs:

```typescript
import { Guardian } from '@tundralibs/guardian';
const Lookup = Guardian.map(Guardian.number(), Guardian.string());
Lookup.parse([[1, 'one'], [2, 'two']]); // Map<number, string>
```

Schema emit: an array of fixed-length `[K, V]` tuples — the only faithful JSON Schema for a `Map` that preserves keys of arbitrary type and entry ordering.

## `Guardian.oneOf`

Union of mutually-exclusive shapes. Tries each member in order; returns the first that validates.

```typescript
import { Guardian } from '@tundralibs/guardian';
const IdOrName = Guardian.oneOf([
  Guardian.number().integer().positive(),
  Guardian.string().minLength(1),
], 'Expected user id or username');

IdOrName.parse(42); // 42
IdOrName.parse('alice'); // 'alice'
IdOrName.parse({}); // throws — 'Expected user id or username'
```

The error message is **mandatory** — Guardian forces you to name what the union represents at the call site, so production errors don't bottom out at "expected union".

`null` / `undefined` are passed through to the members like any other input, so a nullable / optional member matches them and the mandatory message is what surfaces when none do:

```typescript
import { Guardian } from '@tundralibs/guardian';
Guardian.oneOf([Guardian.string().nullable()], 'string or null').parse(null); // null
Guardian.oneOf([Guardian.string(), Guardian.number()], 'string or number')
  .parse(null);
// → throws 'string or number'  (the mandated message, not a generic one)
```

**Ordering matters under coerce-by-default.** Put more specific types first, otherwise a more-permissive earlier member will absorb the input:

```typescript
import { Guardian } from '@tundralibs/guardian';
// Wrong: string comes first; '42' coerces nothing, 42 coerces to '42' and matches string.
Guardian.oneOf([Guardian.string(), Guardian.number()], 'msg').parse(42);
// → '42'   ← surprising; the string branch ate it

// Right: number first; 42 matches number directly.
Guardian.oneOf([Guardian.number(), Guardian.string()], 'msg').parse(42);
// → 42
```

For tagged-shape unions, prefer [`discriminatedUnion`](#guardiandiscriminatedunion) — it's O(1) and doesn't have this ordering trap.

## `Guardian.discriminatedUnion`

Tagged union where one field selects the variant. Build a lookup map at construction; `parse()` reads the discriminator and dispatches to the matching branch.

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
if (s.kind === 'circle') s.radius; // type-narrowed
```

### Multi-value aliases

A single branch can match several discriminator values — useful for protocol-version aliases:

```typescript
import { Guardian } from '@tundralibs/guardian';

const FrameV1 = Guardian.object({
  v: Guardian.enum(['v1', 'v1.0'] as const), // either value routes here
  data: Guardian.object({}),
});

const FrameV2 = Guardian.object({
  v: Guardian.enum(['v2'] as const),
  data: Guardian.object({}),
});

const Frame = Guardian.discriminatedUnion('v', [FrameV1, FrameV2]);
Frame.parse({ v: 'v1.0', data: {} }); // matched
```

Two branches sharing the same discriminator value is a **construction-time error** (caught when you call `Guardian.discriminatedUnion(...)`, not at parse time).

### Errors

```typescript
import type { BaseGuardian } from '@tundralibs/guardian';

declare const Shape: BaseGuardian<{ kind: string }>; // from above

Shape.parse({ kind: 'octagon', sides: 8 });
// throws: "Unknown kind: 'octagon' (expected one of: circle, square, triangle)"
```

### Introspection

| Property / method | Description                                                     |
| ----------------- | --------------------------------------------------------------- |
| `.discriminator`  | the discriminator key name                                      |
| `.options`        | array of branch guardians (declaration order)                   |
| `.allowedValues`  | array of valid discriminator values                             |
| `.variant(value)` | branch guardian for a given discriminator value, or `undefined` |

Useful for UI form generation (render a "kind" dropdown from `allowedValues`, then render the matching branch's fields).

## `Guardian.intersection`

`A & B` — the input must satisfy **both** schemas. For object intersections, results are merged via spread with the right side winning on conflicts (matches `extend()` / `merge()` semantics).

```typescript
import { Guardian } from '@tundralibs/guardian';

const Identified = Guardian.object({ id: Guardian.string() });
const Named = Guardian.object({ name: Guardian.string() });
const Person = Guardian.intersection(Identified, Named);

Person.parse({ id: 'u1', name: 'Ada' });
// → { id: 'u1', name: 'Ada' }
```

Schema emit produces `allOf: [a, b]` — the standard JSON Schema / OpenAPI keyword for intersection. Useful when the two source schemas come from independent domains (e.g. a `User` schema imported from one package and an `Auditable` mixin from another) and restructuring either isn't an option. The `allOf` emit survives chaining, so `Guardian.intersection(A, B).describe({ title: 'Person' })` keeps the `allOf` branches **and** adds the title (the same holds for `.optional()` / `.clone()`, and for the `className` / `not` emit of `Guardian.instanceof` / `Guardian.never`).

For non-object intersections (rare), `b`'s output replaces `a`'s — use `.refine(...)` for custom merge rules.

## `Guardian.lazy`

Defer resolution of an inner guardian until parse time. Required for recursive types — the thunk closes over the as-yet-unbound name and reads it on the first parse:

```typescript
import { BaseGuardian, Guardian } from '@tundralibs/guardian';

type Tree = { value: number; children: Tree[] };

const TreeSchema: BaseGuardian<Tree> = Guardian.object({
  value: Guardian.number(),
  children: Guardian.array(Guardian.lazy(() => TreeSchema)),
});

TreeSchema.parse({
  value: 1,
  children: [
    { value: 2, children: [] },
    { value: 3, children: [{ value: 4, children: [] }] },
  ],
});
```

The thunk is invoked at most once; the resolved guardian is cached for subsequent parses.

Schema emit uses cycle detection: a `LazyGuardian` that emits itself emits `{ $ref: '#' }` (self-reference) on the second visit, breaking the recursion. Downstream codegen tools may want to lift the cycle into a named `$ref: '#/$defs/Tree'`; pass `name` via `.describe({ title: 'Tree' })` so it surfaces as the schema title.

## `Guardian.preprocess`

Apply an input transform **before** any guardian runs. Useful for boundary normalisation where you want the schema declaration to remain a clean shape:

```typescript
import { BaseGuardian, Guardian } from '@tundralibs/guardian';
const Trimmed = Guardian.preprocess(
  (v) => typeof v === 'string' ? v.trim() : v,
  Guardian.string().minLength(1),
);

Trimmed.parse('  hello  '); // 'hello'
Trimmed.parse('     '); // throws — trim → '', fails minLength
```

Common patterns:

- Coerce `undefined` to a sentinel before validation.
- Strip a wrapping envelope (`{ data: ... }`) before validating the payload.
- Re-shape a legacy wire format into the canonical form the schema expects.

Distinct from `.process()` (which runs after the guardian) — `preprocess` runs **before**, so the schema can express what the input "should look like" after normalisation. Errors raised by the preprocess function are wrapped in a `GuardianError` with `comparison: 'preprocess'`.

Schema emit delegates to the inner schema (preprocess is a runtime concern; the emitted shape describes the post-preprocess value).

## `Guardian.instanceof`

Validate that the input is an instance of a class. Returns the instance unchanged.

```typescript
import { Guardian } from '@tundralibs/guardian';
const Url = Guardian.instanceof(URL);
const FormBody = Guardian.instanceof(FormData);
const ErrLike = Guardian.instanceof(Error);

Url.parse(new URL('https://example.com')); // URL { … }
Url.parse('https://example.com'); // throws — not a URL instance
```

The most common use is browser globals (`URL`, `File`, `Blob`, `FormData`, `Headers`, `Request`, `Response`) and `Error` subclasses where the structural shape isn't reliable but the constructor identity is. Custom domain classes work too — Guardian validates with `input instanceof Ctor`, so anything that satisfies that check passes.

Schema emit: `{ type: 'object' }` with a `className` annotation — `instanceof` isn't expressible in JSON Schema, so downstream codegen tools see an opaque object.

## `Guardian.never`

Always throws. The runtime mirror of TypeScript's `never` type — useful as an exhaustiveness guard in discriminated-union switch statements and as a placeholder in conditional schema construction:

```typescript
import { Guardian } from '@tundralibs/guardian';

const EventUnion = Guardian.discriminatedUnion('type', [
  Guardian.object({ type: Guardian.literal('created') }),
  Guardian.object({ type: Guardian.literal('updated') }),
  Guardian.object({ type: Guardian.literal('deleted') }),
]);

declare function onCreated(e: unknown): string;
declare function onUpdated(e: unknown): string;
declare function onDeleted(e: unknown): string;
function handle(event: Guardian.infer<typeof EventUnion>): string {
  switch (event.type) {
    case 'created':
      return onCreated(event);
    case 'updated':
      return onUpdated(event);
    case 'deleted':
      return onDeleted(event);
    default:
      return Guardian.never().parse(event); // unreachable — compile-time exhaustiveness check
  }
}
```

Calling `.parse()` always throws a `GuardianError` with `comparison: 'never'`.

## Type inference

```typescript
import { Guardian } from '@tundralibs/guardian';

const Schema = Guardian.object({
  id: Guardian.number(),
  tags: Guardian.array(Guardian.string()),
});

type T = Guardian.infer<typeof Schema>;
// { id: number; tags: string[] }
```

`Guardian.infer<T>` and `Guardian.inferInput<T>` work in TypeScript **type position**. They're namespace-merged type aliases; there's no runtime overhead.

```typescript
import { Guardian } from '@tundralibs/guardian';

declare const Schema: ReturnType<typeof Guardian.string>; // from above

// Same effect, different spelling — both work:
type A = Guardian.infer<typeof Schema>;
import { type GuardianInfer } from '@tundralibs/guardian';
type B = GuardianInfer<typeof Schema>;
```

`inferInput` produces the _input_ type before any `.process()` / `.transform()` reshape:

```typescript
import { Guardian } from '@tundralibs/guardian';

const Schema = Guardian.string().process((s) => s.length);
type Out = Guardian.infer<typeof Schema>; // number
type In = Guardian.inferInput<typeof Schema>; // string
```

## Nominal brands

`.brand<B>()` attaches a phantom tag to the output type. The runtime is a no-op — the brand lives entirely in TypeScript's type system — but two structurally-identical brands are assignment-incompatible:

```typescript ignore
const UserId = Guardian.string().uuid().brand<'UserId'>();
const OrderId = Guardian.string().uuid().brand<'OrderId'>();

type UserId = Guardian.infer<typeof UserId>; // Brand<string, 'UserId'>
type OrderId = Guardian.infer<typeof OrderId>; // Brand<string, 'OrderId'>

function loadUser(id: UserId): Promise<User> {/* … */}

const u = UserId.parse(crypto.randomUUID());
const o = OrderId.parse(crypto.randomUUID());

loadUser(u); // ✅
loadUser(o); // ❌ compile error: OrderId not assignable to UserId
```

Use brands when a function takes a primitive type (string / number) but only one origin produces valid values for it. Common targets: opaque IDs, currency codes that look like strings but shouldn't be mixed, integer counts that mustn't be confused with offsets, etc.

`.brand<B>()` is callable on any guardian — primitives and composites. The branded view is a `BaseGuardian<Brand<T, B>>`, so all the usual methods (`.parse`, `.optional`, `.toJSONSchema`, …) still work; only the **output type** changes.

The branded type also imports cleanly:

```typescript
import { type Brand } from '@tundralibs/guardian';
type UserId = Brand<string, 'UserId'>;
```

---

[← Back to Guardian](../README.md)
