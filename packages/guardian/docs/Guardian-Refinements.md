# Refinements and Transforms

Custom validators, post-validation predicates, and data reshaping.

![Deno](https://img.shields.io/badge/Deno-000000?logo=deno)
![Bun](https://img.shields.io/badge/Bun-f9f1e1?logo=bun)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white)
![Cloudflare Workers](https://img.shields.io/badge/Cloudflare%20Workers-F38020?logo=cloudflare&logoColor=white)
![Browsers](https://img.shields.io/badge/Browsers-4285F4?logo=googlechrome&logoColor=white)

## Table of Contents

- [`.test(fn, msg?)` — predicates](#test)
- [`.process(fn)` / `.transform(fn)` — reshape data](#process--transform)
- [`.refine(fn, msg, path?)` — cross-field validation](#refine)
- [`.superRefine([...])` — multi-error accumulation](#superrefine)
- [`.optional()` / `.nullable()` — finishers](#finishers)
- [Async refinements](#async-refinements)

## `.test()`

Add a predicate. Returns the input unchanged on `true`; throws `GuardianError` with `msg` on `false`.

```typescript
import { Guardian } from '@tundralibs/guardian';

const Even = Guardian.number().test(
  (n) => n % 2 === 0,
  'must be even',
);

Even.parse(4); // 4
Even.parse(5); // throws — 'must be even'
```

The third argument is an `expected` hint that surfaces in the error's `context.expected` — useful for tooling, not displayed in the default message:

```typescript
import { Guardian } from '@tundralibs/guardian';

Guardian.number().test((n) => n > 0, 'must be positive', '> 0');
```

`.test()` is the simple chain-extension. It doesn't reshape data; if you need to transform, use `.process()`.

## `.process()` / `.transform()`

`.process(fn)` is the workhorse: it takes the current output, runs `fn`, and replaces the output. Used internally by every chain method.

```typescript
import { Guardian, StringGuardian } from '@tundralibs/guardian';

// Trim then validate length
const Name = Guardian.string()
  .process((s) => s.trim(), StringGuardian) // pass a constructor
  .minLength(1, 'name required');
```

The second argument is the guardian class the result is built from **and typed as**. Omit it and the runtime class is still preserved, but the static type widens to `BaseGuardian<T>` — which has no `.minLength()`, `.pattern()`, or any other subclass validator. So pass the class you want to keep chaining on, even when the output type doesn't change:

```typescript
import { Guardian } from '@tundralibs/guardian';

// No constructor → BaseGuardian<string>: fine when you're done chaining.
const Trimmed = Guardian.string().process((s) => s.trim());
Trimmed.parse('  hi  '); // 'hi'
```

The same argument is what lets you change the output type:

```typescript
import { Guardian, NumberGuardian, StringGuardian } from '@tundralibs/guardian';

const LowerHex = Guardian.string()
  .process((s) => s.toLowerCase(), StringGuardian)
  .pattern(/^[0-9a-f]+$/);

// Convert string to number
const Port = Guardian.string()
  .process((s) => parseInt(s, 10), NumberGuardian) // pass a constructor
  .integer()
  .min(1)
  .max(65535);
```

`.transform(fn)` is an alias for `.process()` on `ObjectGuardian` — useful for reshaping object outputs:

```typescript
import { Guardian } from '@tundralibs/guardian';

const FullName = Guardian.object({
  first: Guardian.string(),
  last: Guardian.string(),
}).transform((d) => ({
  fullName: `${d.first} ${d.last}`,
}));

FullName.parse({ first: 'Ada', last: 'Lovelace' });
// → { fullName: 'Ada Lovelace' }
```

## `.refine()`

Predicate available on **every** guardian — primitives (`string`, `number`, …) as well as composites (`object`, `array`, `tuple`, `record`, `set`, `map`, `lazy`). Adds a validator that runs at its declaration position in the chain. Failure throws a `GuardianError` with `comparison: 'refinement'` and a mandatory message.

```typescript
import { Guardian } from '@tundralibs/guardian';

// On a primitive — equivalent to `.test()` but with a required message.
Guardian.string().refine(
  (s) => s.endsWith('@example.com'),
  'must be an @example.com address',
);

// On an array — predicate sees the parsed array as a whole.
Guardian.array(Guardian.number()).refine(
  (xs) => xs.reduce((a, b) => a + b, 0) === 100,
  'values must sum to 100',
);
```

The canonical use is **cross-field validation on `ObjectGuardian`**, where the predicate receives the parsed shape and decides based on multiple fields:

```typescript
import { Guardian } from '@tundralibs/guardian';

const Register = Guardian.object({
  password: Guardian.string().minLength(8),
  confirm: Guardian.string(),
}).refine(
  (d) => d.password === d.confirm,
  'passwords do not match',
  'confirm', // ← optional path, attached to the error's `cause` map
);

Register.parse({ password: 'secret123', confirm: 'wrong' });
// throws: passwords do not match
```

### Declaration order matters

`.refine()` is inlined into the transform chain at its position. This is what most users expect from reading the code:

```typescript
import { Guardian } from '@tundralibs/guardian';

declare function hash(password: string): string;

const Schema = Guardian.object({
  password: Guardian.string(),
  confirm: Guardian.string(),
})
  .refine((d) => d.password === d.confirm, 'mismatch') // ← runs first
  .transform((d) => ({ // ← runs second
    password: d.password,
    hashed: hash(d.password),
  }));

Schema.parse({ password: 'a', confirm: 'a' });
// → { password: 'a', hashed: '…' }   — confirm is consumed by the refinement, then the transform reshapes.
```

If you wrote `.transform(...).refine(...)`, the refinement would run on the **transformed** output. Order is read top-to-bottom.

### Short-circuit on failure

Chained `.refine()` calls short-circuit: if the first fails, subsequent ones don't run.

```typescript
import { Guardian } from '@tundralibs/guardian';

const Schema = Guardian.object({ value: Guardian.number() })
  .refine((d) => d.value > 0, 'must be positive', 'value')
  .refine((d) => d.value % 2 === 0, 'must be even', 'value');

Schema.parse({ value: -3 });
// throws: 'must be positive'   (the "must be even" check never runs)
```

For collecting all failures across multiple checks, use [`.superRefine()`](#superrefine) instead.

### `.refine()` vs `.test()`

|               | `.refine(fn, msg, path?)`              | `.test(fn, msg?, expected?)`                               |
| ------------- | -------------------------------------- | ---------------------------------------------------------- |
| Message       | **required**                           | optional (synthesised from the failure context if omitted) |
| Path argument | yes — attached to `cause` on the error | no                                                         |
| Available on  | every guardian                         | every guardian                                             |

`.test()` exists for the simple "throw a default message on false" case; `.refine()` is preferred when you want a deliberately-worded, end-user-readable message.

## `.superRefine()`

Batch-refine, available on **every** guardian — primitives (`string`, `number`, …) as well as composites (`object`, `array`, `tuple`, `record`, `set`, `map`, `lazy`). Adds a **single** chain step that runs every check in the array and accumulates failures before throwing. Because each check's `path` is optional and the aggregate falls back to `refinement_N`, it accumulates over a scalar (which has no field path) just as it does over an object.

```typescript
import { Guardian, GuardianError } from '@tundralibs/guardian';

const Register = Guardian.object({
  username: Guardian.string(),
  password: Guardian.string(),
  confirm: Guardian.string(),
  age: Guardian.number(),
}).superRefine([
  {
    validator: (d) => d.password.length >= 8,
    message: 'password too short',
    path: 'password',
  },
  {
    validator: (d) => d.password === d.confirm,
    message: 'passwords differ',
    path: 'confirm',
  },
  { validator: (d) => d.age >= 18, message: 'must be 18+', path: 'age' },
]);

try {
  Register.parse({
    username: 'alice',
    password: 'short',
    confirm: 'differ',
    age: 15,
  });
} catch (err) {
  if (!(err instanceof GuardianError)) throw err;
  err.message;
  // '3 refinement error(s): password too short; passwords differ; must be 18+'
  err.context.cause;
  // {
  //   password: GuardianError('password too short'),
  //   confirm:  GuardianError('passwords differ'),
  //   age:      GuardianError('must be 18+'),
  // }
}
```

This is what to reach for in form-validation flows where you want every failing field reported in one pass.

### Refine vs SuperRefine — which to use

| Use `.refine()` when…                                   | Use `.superRefine([...])` when…                        |
| ------------------------------------------------------- | ------------------------------------------------------ |
| You have one cross-field check                          | You have several checks and want all failures reported |
| You're fine with short-circuit on first failure         | You want every check to run                            |
| The check is conditional (depends on a prior transform) | All checks operate on the same shape                   |

## Finishers

`.optional()` and `.nullable()` seal the chain. After either, the only methods available are documentation-emit (`toOpenAPI`, `toJSONSchema`, `toMarkdown`, `describe`), parsing (`parse`, `safeParse`, `parseAsync`, `safeParseAsync`), and the other finisher.

```typescript
import { Guardian } from '@tundralibs/guardian';

const Schema = Guardian.string().optional();
// Schema.process(...)  ← compile error (process not on FinishedGuardian)
// Schema.test(...)     ← compile error
```

The compile-time block matches what the runtime would have thrown. To extend the chain further, declare the chain before `.optional()`:

```typescript ignore
// ❌ Won't compile
Guardian.string().optional().minLength(3);

// ✅ Right
Guardian.string().minLength(3).optional();
```

### `.optional(default?)`

Accepts `undefined`. With a default, substitutes when input is `undefined`:

```typescript
import { Guardian } from '@tundralibs/guardian';

Guardian.string().optional().parse(undefined); // undefined
Guardian.string().optional('fallback').parse(undefined); // 'fallback'
Guardian.string().optional(() => crypto.randomUUID()).parse(undefined); // generated value
```

When a default is provided, the output type narrows — `undefined` is no longer a possible output:

```typescript
import { Guardian } from '@tundralibs/guardian';

const With = Guardian.string().optional('x'); // FinishedGuardian<string>
const Without = Guardian.string().optional(); // FinishedGuardian<string | undefined>
```

### `.nullable()`

Accepts `null`:

```typescript
import { Guardian } from '@tundralibs/guardian';

Guardian.string().nullable().parse(null); // null
Guardian.string().nullable().parse('hi'); // 'hi'
Guardian.string().nullable().parse(undefined); // throws — undefined isn't accepted
```

`.nullable()` does **not** take a default. `null` is a value the caller chose ("explicitly empty"); silently replacing it would discard information. `.nullable()` is also a finisher, so it seals the chain — you cannot `.process()` after it. If you genuinely need to map `null` to a fallback, do it in a `preprocess` step, which runs **before** the string check:

```typescript
import { Guardian } from '@tundralibs/guardian';

Guardian.preprocess((v) => v ?? 'default-name', Guardian.string());
// null → 'default-name', 'hi' → 'hi'
```

### Combining `.optional()` and `.nullable()`

Chain both for `T | null | undefined`:

```typescript
import { Guardian } from '@tundralibs/guardian';

const S = Guardian.string().nullable().optional();
// FinishedGuardian<string | null | undefined>

S.parse('hi'); // 'hi'
S.parse(null); // null
S.parse(undefined); // undefined
```

Order doesn't matter — both arrangements produce the same behaviour at runtime.

### Idempotent repeat calls

Both finishers are idempotent: calling `.optional()` on an already-optional schema returns the same instance, without throwing. Useful for generic helpers that don't know whether the schema has been finished.

## Async refinements

Refinement validators may return `Promise<boolean>`. Guardian detects async functions at build time and routes the schema through `parseAsync`:

```typescript
import { Guardian } from '@tundralibs/guardian';

declare const db: {
  users: { exists(q: { username: string }): Promise<boolean> };
};

const Schema = Guardian.object({
  username: Guardian.string(),
}).refine(
  async (d) => {
    const exists = await db.users.exists({ username: d.username });
    return !exists;
  },
  'username already taken',
  'username',
);

// Sync parse throws because the chain has async steps:
Schema.parse({ username: 'alice' });
// throws: 'Cannot use parse() with async validation steps. Use parseAsync() instead.'

// Use parseAsync instead:
await Schema.parseAsync({ username: 'alice' });
```

Async detection works for `async function` and async arrow functions. A sync function that hand-rolls a `Promise` return is **not** detected — wrap it in an `async` function or call the validator directly with `await`.

`parse()` / `safeParse()` refuse only when a step actually leaks a real `Promise`. A validated **value** that merely happens to be thenable-shaped (a plain object with a callable `then`, an async-function value, etc.) is legitimate data — e.g. through `Guardian.unknown()` or `.passthrough()` — and is returned rather than mistaken for an async step.

**Thenable-shaped values must go through the sync entry points.** `parseAsync()` / `safeParseAsync()` return a `Promise<T>`, and the ECMAScript promise resolution procedure _adopts_ any thenable handed to it — a validated object carrying a callable `then` would be replaced by its resolution, and a thenable that never settles would hang the caller forever. No implementation can return such a value from a `Promise<T>`, so the async entry points **refuse** it with a usage error instead of substituting data silently:

```typescript
import { Guardian } from '@tundralibs/guardian';

const thenable = { id: 1, then: (r: (value: number) => void) => r(42) };

Guardian.unknown().parse(thenable); // → the object itself ✅
await Guardian.unknown().parseAsync(thenable);
// throws: 'Cannot use parseAsync() when the validated value is thenable …'
```

(An async-function _value_ is not a thenable — it has no `then` — so it travels through both entry points unchanged.)

The same applies to `.process()` callbacks: async functions force the chain async.

Type-crossing transforms compose with async chains too. Every coercing target guardian — `StringGuardian`, `NumberGuardian`, `DateGuardian` and `BigIntGuardian` — awaits an incoming `Promise` before running its output-type coercion, so **all** of `.toTimestamp()`, `.toISOString()`, `.formatCurrency()`, `.toNumber()`, `.toDate()`, `.toBigInt()`, … chained after an async step resolve normally through `parseAsync` instead of failing to coerce a pending `Promise`.

---

[← Back to Guardian](../README.md)
