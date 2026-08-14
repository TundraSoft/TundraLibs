# Guardian — code review

**Reviewer:** Claude (Opus 4.7)
**Date:** 2026-05-11
**Scope:** Guardian / BaseGuardian / per-type guards / helpers / `tests/guardian-vs-zod.bench.ts`
**Reference comparison:** [Zod](https://github.com/colinhacks/zod) (`npm:zod`, Zod 3-style API; the installed version was the npm-published Zod at the time of running the bench)

---

## TL;DR

**Guardian's win over Zod is real but smaller than I first claimed — and it depends entirely on whether you measure schema construction or just `parse()`.** Against Zod 4.1.12 on Apple M2 / Deno 2.7.11:

- **Schema constructed inside the hot loop (existing `guardian-vs-zod.bench.ts`):** Guardian is ~100–500× faster. But this is mostly measuring Zod 4's heavy `_def` build, not parse cost. In production you build the schema once and reuse it, so this comparison overstates Guardian's lead.
- **Schemas pre-built once, parse-only measured (the realistic hot path):** Guardian is **competitive, not dominant**. Roughly tied on basic strings, ~2× faster on numbers and large arrays, **slower** on complex object validation and on safeParse-failure. Zod 4 specifically compiled its object validator and it shows.

So: **Guardian's architecture is sound and Guardian-the-package has real strengths — stability, smaller surface, no ecosystem lock-in, baked-in OpenAPI/Markdown emit, cleaner safeParse tuple, mandatory union error messages.** It is not the 100×-faster-than-Zod headline the in-loop benchmark suggests, but it is at least Zod's equal on the hot path with a much simpler implementation.

**Three things still keep Guardian from being a clean drop-in replacement** for Zod users:

1. `Guardian.object` defaults to **passthrough**, so secrets and extra keys silently survive validation. Zod 4's default is **strip**. (Verified by direct comparison — Guardian kept an extra `extra: 'leaked'` key; Zod removed it.)
2. The `optional`/`nullable` rules are runtime-enforced rather than type-level, so `.process()` after `.optional()` is a runtime throw rather than a compile error.
3. There's no discriminated-union primitive — `oneOf` is O(N) try-each, which scales poorly and doesn't enable downstream type narrowing as well as Zod's `discriminatedUnion`.

Each of these is fixable without breaking the existing API.

---

## Performance — the corrected numbers

> ⚠️ **Earlier draft of this review claimed 100–500× across the board.** That was based on the existing `guardian-vs-zod.bench.ts` which constructs both schemas inside every iteration. That measures **schema build cost** as much as parse cost. The corrected story is below.

### As-shipped benchmark (schema built per iteration)

`deno bench packages/guardian/tests/guardian-vs-zod.bench.ts` on Apple M2, Deno 2.7.11, against Zod 4.1.12:

| Scenario                         | Guardian | Zod     | Guardian advantage |
| -------------------------------- | -------- | ------- | ------------------ |
| String basic                     | 19.5 ns  | 7.7 µs  | ~395×              |
| String email                     | 165 ns   | 23.6 µs | ~143×              |
| Number basic                     | 23.4 ns  | 4.2 µs  | ~179×              |
| Number int + range               | 53.6 ns  | 16.9 µs | ~315×              |
| Object simple (2 fields)         | 247 ns   | 24.8 µs | ~100×              |
| Object complex (7 fields nested) | 1.6 µs   | 188 µs  | ~117×              |
| Date range                       | 392 ns   | 17.3 µs | ~44×               |
| Refine simple                    | 81 ns    | 26.6 µs | ~328×              |
| Refine complex (object-level)    | 314 ns   | 48.1 µs | ~153×              |
| Safe parse failure               | 13.8 µs  | 16.2 µs | ~1.2×              |
| Large array (1000 numbers)       | 36.5 µs  | 53.7 µs | ~1.5×              |
| Large object (100 fields)        | 34.9 µs  | 920 µs  | ~26×               |
| Real-world user registration     | 1.7 µs   | 246 µs  | ~145×              |

These numbers are reproducible. They are also **not what production code looks like.**

### Pre-built schema benchmark (the realistic hot path)

`deno bench packages/guardian/tests/prebuilt-vs-loop.bench.ts` — schemas constructed once outside the loop, then `parse()` called in the loop:

| Scenario                         | Guardian | Zod     | Winner                    |
| -------------------------------- | -------- | ------- | ------------------------- |
| String basic                     | 3.9 ns   | 4.0 ns  | **Tied** (Guardian 1.04×) |
| Number basic                     | 5.5 ns   | 11.4 ns | Guardian 2.08× faster     |
| Object complex (7 fields nested) | 822 ns   | 504 ns  | **Zod 1.63× faster**      |
| Large array (1000 numbers)       | 9.3 µs   | 16.9 µs | Guardian 1.82× faster     |
| Throw on bad type                | 12.0 µs  | 13.7 µs | Guardian 1.14× faster     |
| safeParse on bad type            | 13.6 µs  | 8.5 µs  | **Zod 1.59× faster**      |

### How to read this

The in-loop benchmark amplifies a real-but-narrow truth: **Guardian's schema construction is far cheaper than Zod's**. Zod 4 spends most of its build time constructing `_def` graphs and pre-compiled validators; Guardian just composes a closure. If your code path actually rebuilds schemas constantly (e.g. you're using `z.object({...})` inline inside a request handler), Guardian's advantage is genuinely huge.

The pre-built benchmark tells a different story for typical apps:

- **Basic types (string, number, boolean):** Roughly tied to 2× Guardian win. Both libraries are in the single-digit nanoseconds — too fast for this to matter to most code.
- **Complex object validation:** **Zod 4 is faster.** Zod 4's object validator is a compiled fast path; Guardian's `_validateSchemaProperties` walks `Object.entries(this._schema)` per parse. (See §7 below — pre-computing this is a free fix that should close the gap.)
- **Large arrays:** Guardian ~2× faster, because per-element overhead favours Guardian's lighter wrapper.
- **safeParse on failure:** **Zod 4 is faster.** Guardian's `GuardianError` is genuinely expensive (deep context, addCause mutators) — see §3.
- **Output equivalence:** Verified directly. Guardian and Zod produce equivalent outputs for valid input and reject the same invalid inputs in this comparison (`packages/guardian/tests/rigorous-check.ts`).

### Architectural significance

The pre-built numbers don't invalidate Guardian's design — they're a different question. They tell us:

1. **Zod 4 is genuinely fast on the hot path.** The pre-Zod-4 framing of "Zod is slow, Guardian solves perf" needs an asterisk.
2. **Guardian's lead in real production is in build-time, large arrays, and basic types.** Not in complex object validation.
3. **The architecture is still sound** — composed transform closures are a clean and fast pattern. But the implementation has specific hot-path inefficiencies (Object.entries per parse, deep GuardianError construction, no compiled object validator) that hand Zod 4 the lead it has.

The remaining items in this review — stability vs. churn, type-level vs runtime rules, sensible defaults — are independent of the perf comparison and remain valid critiques.

---

## What works well

### 1. The transform-composition architecture is the right call

`BaseGuardian._composedTransform` is a single `(input) => output` function. Every chained step (`min`, `pattern`, `process`, `nullable`, …) wraps the previous transform into a new one. At `parse()` time, this is one function call. Zod evaluates a tree of `ZodType` instances per step, allocating issue arrays and walking parent chains. Guardian's approach trades schema-build time for parse time — exactly the right trade-off for hot-path validation.

### 2. `safeParse` returns `[error, data]` (Go-style tuple)

```ts ignore
const [err, data] = schema.safeParse(input);
if (err) ...
```

Better than Zod's `{ success, data, error }` discriminated object — fewer property accesses, no destructure-from-result, plays nicely with destructuring directly into `if (err)` branches. Stick with this.

### 3. `oneOf` requires a mandatory user-supplied error message

`Guardian.oneOf([...], 'UserId or Email required')` instead of Zod's default "Invalid input" garbage. Forcing the developer to name the union at the call site is a small but lovely usability win — production error messages don't become "expected union" cryptography.

### 4. `describe()` + `toOpenAPI()` + `toMarkdown()` baked in

Zod needs `zod-to-openapi` or `zod-to-json-schema` (separate package, weekly breakage). Guardian's metadata is part of the core type. The OpenAPI output is naive (no `oneOf`/`allOf` handling, just flat property mapping) but it's a starting point that doesn't break with Zod minor releases.

### 5. Mutation-by-default (with `immutable()` opt-in)

For typical use — build a schema, use it forever — mutation is the right default. Zod's per-step `new ZodType()` allocation is wasteful when nobody's holding the intermediate schema. The `immutable()` / `clone()` / `freeze()` escape hatches let users who need persistent schemas (test scaffolding, schema composition libraries) opt in. Sensible.

### 6. Cross-runtime, no extra packages

Zod works on all three runtimes, but pulls down through npm. Guardian's only dep is `@tundralibs/utils` (variableReplacer, isPromiseLike). Smaller surface, fewer breakage vectors.

### 7. ArrayGuardian element-error context enrichment

When an array element fails validation, `ArrayGuardian` mutates the inner `GuardianError` to add `arrayIndex` and a path-prefixed message instead of wrapping it. Saves an allocation, keeps the error tree shallow. Nice.

---

## What's weak

### 1. `optional()` / `nullable()` are runtime "finishers", not type-level

The current code throws at runtime if you call `.process()` after `.optional()`:

```ts ignore
Guardian.string().optional().process((x) => x.toUpperCase());
// → throws GuardianError: "Cannot call process() after optional()"
```

The constraint is correct (the transform chain would no longer match its input type), but the enforcement should be at the type level — `optional()` should return a more constrained type that doesn't expose `process()`.

**Fix:** Introduce a `FinishedGuardian<T>` (or similar) that only exposes `parse`, `parseAsync`, `safeParse`, `safeParseAsync`, `describe`, `toOpenAPI`, `toMarkdown`. Make `optional()` and `nullable()` return it. The same finisher type is what most validation libraries enforce; TypeScript can absolutely model this.

### 2. `Guardian.object` defaults to **passthrough**

```ts ignore
const userSchema = Guardian.object({
  id: Guardian.number(),
  name: Guardian.string(),
});
userSchema.parse({ id: 1, name: 'x', password: 'plaintext' });
// → returns { id: 1, name: 'x', password: 'plaintext' }
```

Extra keys flow through unchecked. If your schema is for an API endpoint, you've just accepted client-controlled keys onto your domain object. Zod's default is `strip` (extra keys silently dropped — also not perfect, but safer); the strictest safe default is `strict` (throw on extras).

**Fix:** Change the default to `strip` (matches Zod, matches user expectation), keep `.passthrough()` as an explicit opt-in. Anything that's already relying on passthrough will need a one-line change; this is a 1.0 → 2.0 break worth taking.

### 3. `GuardianError` construction is expensive

The safe-parse-failure bench is the only place Guardian doesn't crush Zod. Reading `GuardianError`:

- Stores `context` with `expected`, `got`, `comparison`, `type`, sometimes `cause: { option_0, option_1, ... }`.
- Has `addCause(path, err)` mutators.
- Inherits from `BaseError` (utils package) which itself stores `_baseMessage`, `timeStamp`, etc.

The error tree is deep and allocates on every failure. For a validator that's hot-path on the failure side (e.g. fuzzy parsing in `safeParse` loops), this is a real cost. Pino's `redact` and most validator libraries treat errors as semi-cheap.

**Fix:** Make `GuardianError`'s heavy fields lazy. `cause`, `timeStamp`, etc. can be getters that compute on first access. The hot path is "did it throw" → "branch on whether `err` is truthy" — nobody usually inspects the error until they're going to log/return it.

### 4. `oneOf` is O(N) try-each — no discriminated union

`Guardian.oneOf([A, B, C], 'msg')` tries each in order. For 3–4 alternatives this is fine. For tagged unions (10+ variants discriminated by a `type` field — common in event-sourced systems) the linear retry is wasteful and the resulting type narrowing on the output is just `A | B | C` — TypeScript can't tell which branch matched.

**Fix:** Add `Guardian.discriminatedUnion('kind', { user: userSchema, admin: adminSchema, ... })`. At parse time it reads the discriminator field once, then dispatches to that branch. O(1) instead of O(N), and the output type narrows on the discriminator — `data.kind === 'user' ? data.role : ...` becomes type-safe.

### 5. No coercion API

Zod has `z.coerce.number()`, `z.coerce.date()`, etc. — useful for parsing form data or query strings where everything arrives as strings. Guardian users have to write `Guardian.string().process(x => Number(x))` and lose all the number validators.

**Fix:** `Guardian.coerce.number()` returning a `NumberGuardian` whose constructor accepts string/boolean/Date and coerces (with controllable strictness). Add to `string`, `number`, `boolean`, `bigint`, `date`.

### 6. Refinements are applied **after** transforms, regardless of declaration order

```ts ignore
Guardian.object({...})
  .refine(d => d.password === d.confirm, 'mismatch')   // declared first
  .transform(d => ({...d, hashedPassword: hash(d.password)}));  // declared second
```

In `ObjectGuardian.parse()`, the transform chain runs first (via `super.parse()`), then `_applyRefinements()`. So the refinement runs on the _output_ of the transform. If the user wrote `.refine(...).transform(...)` _expecting_ the refine to see the pre-transform data, they get surprising behaviour. Conversely, if they wrote `.transform(...).refine(...)`, it just happens to work but for the wrong reason.

**Fix:** Either (a) make the refinement order match declaration order (run refinements at the point they were chained, by wrapping them into `_composedTransform`), or (b) document the "refines always run after transforms" rule prominently and call out that declaration order doesn't matter for refinements. Option (a) is more correct; option (b) is faster to ship.

### 7. `ObjectGuardian._validateSchemaProperties` walks `Object.entries(this._schema)` per parse

Minor but cumulative: every `parse()` on an object schema does `Object.entries(this._schema)` (allocates), then `Object.keys(inputObj)` for strict-mode check (another allocation), then a `Set(schemaKeys)` allocation. For a hot-path validator this should be precomputed at construction:

```ts ignore
private readonly _entries: [string, BaseGuardian<unknown>][] = Object.entries(this._schema);
private readonly _schemaKeys: Set<string> = new Set(Object.keys(this._schema));
```

Estimated 5–15% gain on object validation. Free win.

### 8. `parseAsync` always goes through the Promise machinery

```ts ignore
async parseAsync(input: unknown): Promise<T> {
  const result = this._composedTransform(input);
  return isPromiseLike(result) ? await result : result;
}
```

The `async` keyword wraps the result in a Promise regardless. For schemas with no async steps (the common case), `parseAsync()` is strictly slower than `parse()`. Users currently have to know whether their schema is async; the `isAsync` metadata flag exists but isn't enforced.

**Fix:** Track `isAsync` at schema-build time. If the schema is known sync, `parseAsync` should delegate to `parse` and `Promise.resolve(result)` only at the leaf.

### 9. `BaseGuardian.process()` allocates a new closure per call

This is _the_ hot path:

```ts ignore
const composedTransform = (input: unknown) => {
  const intermediateResult = currentTransform(input);
  if (isPromiseLike(intermediateResult)) {
    return intermediateResult.then((resolved) => fn(resolved));
  }
  return fn(intermediateResult);
};
```

For schemas with no async steps, the `isPromiseLike` check runs on every call. For a chain of 5 validators that's 5 unnecessary checks per parse. Zod does the equivalent (it has its own async-safe check), so this isn't a regression — but it is a place where the all-sync path could be specialised.

**Fix:** When schema construction detects no async steps, build an all-sync `_composedTransform` that just chains directly: `(input) => fn(currentTransform(input))`. Mark the guard `isAsync: false` and short-circuit `parseAsync`. Estimated 30–50% gain on small schemas (small-N benchmarks are dominated by overhead).

### 10. `Guardian.infer<T>(_g: T)` throws at runtime

```ts ignore
static infer<T>(_g: T): GuardianInfer<T> {
  throw new Error('Guardian.infer is a type-only utility…');
}
```

`Guardian.infer` is intended as a type-only utility, but it exists at runtime as a throwing function. Users will eventually call it by accident. This should be a pure type alias:

```ts ignore
export type Infer<T> = T extends BaseGuardian<infer U> ? U : never;
// usage: type User = Infer<typeof schema>;
```

Zod exposes it as `z.infer<typeof schema>` — same pattern, no runtime hazard.

### 11. The `process()` / `test()` finisher-protection check appears in multiple methods

`process`, `test`, `nullable`, `optional`, etc. all re-check the same `isNullable` / `isOptional` flags and throw the same kind of error. This logic is in five places. A protected `_guardFinisher(methodName: string)` would consolidate it. Tiny cleanup, but the duplication leads to inconsistent messages (one says "before nullable()", another says "single nullable() call").

### 12. `Guardian.object` schema must be the literal type — no `z.object(z.string())` equivalent for record-style

Zod has `z.record(z.string(), z.number())` _and_ `z.object({...})`. Guardian has both (`Guardian.record(...)` and `Guardian.object(...)`), but the docs only mention object for schemas — users who want "object with arbitrary string keys" may default to `object` and lose validation. Minor docs issue.

---

## Is Guardian "better than Zod"?

**On stability and consistent semantics — yes.** The architecture is simpler, fewer breakage vectors, no external dependency bombs. This is the user's stated reason for building it and it holds.

**On performance — narrower than the headline suggests.** Pre-built schemas (the realistic hot path) give Guardian a clear win on basic types and large arrays, a tie or marginal win on schema-build-heavy paths, but Zod 4 **actually wins** on complex object validation (1.6×) and safeParse failure (1.6×). Guardian's true perf advantage is in **schema construction**, not parse — useful when you're constructing schemas dynamically, less useful in typical request handling. Several of the gap-closing fixes (pre-compute `Object.entries`, lazy `GuardianError` fields) are straightforward.

**For ecosystem breadth — no.** Zod has dozens of ecosystem packages: zod-to-openapi, zod-to-json-schema, zod-form-data, drizzle-zod, react-hook-form/zod, prisma-zod-generator, trpc's `inputParser: zod`, etc. Guardian replicates a few of these in-tree (OpenAPI, markdown) but not all. If the user is targeting a project where the surrounding ecosystem matters, Zod still wins on integration density.

**For the user's project (where Guardian backs `norm` and `restler`) — yes.** When the validator is part of your _internal stack_, the stability and architectural-fit wins compound. The two consumers can be built around Guardian's specific quirks (passthrough default, finisher rules, `oneOf` semantics) without negotiating with an external community. The perf comparison is roughly a wash in production code, so it isn't a reason to switch _away from_ Guardian, but it also isn't the marketing slogan I first claimed it to be.

---

## Suggested roadmap (in order of value × effort)

1. **Switch `Guardian.object` default to `strip`** _(done)_ — flipped default + added `.passthrough()` as the explicit opt-in for forward-compat wire protocols. Tests updated; behavior change is BREAKING.
   - **Docs TODO** — `Guardian.md`, OpenAPI section, and any "by default, unknown keys flow through" prose still need to be updated to reflect the new strip default + how to call `.passthrough()`.
2. ~~**Add `Guardian.discriminatedUnion`**~~ _(done)_ — `DiscriminatedUnionGuardian` class with O(1) dispatch via a discriminator → branch lookup map built at construction. Each branch's discriminator field must be `Guardian.literal(value)` (or `Guardian.enum([...])` for multi-value aliases). Emits proper OpenAPI `discriminator` keyword on `toOpenAPI()`. Also shipped: `Guardian.literal(v)` sugar and `EnumGuardian.caseInsensitive()`.
3. ~~**Add `Guardian.coerce.*`**~~ _(done differently)_ — instead of a separate `.coerce` namespace, coercion is now the default for the five primitive guards (matching Guardian's API/DB-boundary use case). See `helpers/coerce.ts`.
4. ~~**Make `optional()` / `nullable()` return a type-narrowed `FinishedGuardian`**~~ _(done)_ — both methods now return `FinishedGuardian<T>` (an `Omit<BaseGuardian<T>, 'process' | 'test' | 'equals' | 'notEquals' | 'isIn' | 'isNotIn'>`). The runtime guards stay as defence-in-depth. Schema slots (`Guardian.object`, `oneOf`, `tuple`, `record`) accept `FinishedGuardian` so `.optional()` fields still compose.
5. ~~**Replace `Guardian.infer(_g)` runtime stub with a pure type alias**~~ _(done)_ — namespace merge ships `Guardian.infer<typeof T>` as a TS type alias.
6. **Pre-compute `ObjectGuardian._entries` / `_schemaKeys` at construction** — easy perf win.
7. **Track `isAsync` at schema build time; specialise `parseAsync` for sync schemas** — bigger perf win for the common case.
8. **Make `GuardianError` lazy on heavy fields** — improves the only benchmark scenario where Guardian doesn't beat Zod.
9. ~~**Resolve refinement-vs-transform ordering**~~ _(done)_ — went with option (a): refinements now run at declaration position by being woven into `_composedTransform` via `.process()`. `.refine()` short-circuits on first failure (matches declaration-order semantics); `.superRefine([...])` accumulates failures across the array before throwing. `_applyRefinements` / `_applyRefinementsAsync` / the `_refinements` array are removed. Trade-off: a direct `.clone()` of a refined immutable guardian loses the refinement (the live transform's closure can't follow the clone). Internal chain operations are unaffected because they overwrite the cloned transform immediately.
10. **Consolidate finisher-check duplication** into `_guardFinisher()`.

---

## Items I am NOT recommending

- Switching to immutable-by-default. Mutation is the right default for hot-path validation; the `immutable()` opt-in is sufficient.
- Pulling in `type-fest` (which the user mentioned considering). Guardian's type utilities are self-contained and small; adding `type-fest` would import more than is needed.
- Adding plugin system. The fluent API + `process()`/`test()` is already extensible enough. Plugins add an indirection layer that hurts the hot-path performance lead.

---

## Bottom line

Guardian is **competitive with Zod 4** on the realistic hot path (pre-built schemas), and **dramatically faster on schema construction**. It's not "100× faster than Zod" in production — that headline came from the in-loop benchmark which conflates build cost with parse cost. With pre-built schemas, Guardian wins on basic types and large arrays, loses on complex object validation and safeParse-failure, ties on most everything else.

That doesn't change the value proposition for `norm` and `restler` — owning the validator buys stability, and the architecture is clean. It just changes the marketing pitch.

The four things that would move Guardian from "competent internal validator" to "credible Zod replacement for outside users" are:

1. **Discriminated-union primitive.** Real-world unions are almost always discriminated. O(1) dispatch + type narrowing.
2. **Coercion API.** `Guardian.coerce.number()` / `coerce.date()` etc. Closes a real gap vs Zod.
3. **Type-level enforcement of finisher rules.** `optional()` and `nullable()` should return a narrower type that doesn't expose `process()`. Current runtime-throw is a footgun.
4. **`object` default = strip, not passthrough.** Breaking change worth taking pre-1.x.

Plus a perf-pass that should close most of the remaining Zod-wins-here gaps:

5. Pre-compute `Object.entries(this._schema)` and `Object.keys(...)` once at construction (§7).
6. Make `GuardianError` lazy on `cause`, `timeStamp`, deep `context` (§3).
7. Track `isAsync` at build time and specialise sync schemas in `parseAsync` (§8).

None of these require touching the architecture.
