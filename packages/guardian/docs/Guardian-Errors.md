# Errors

`GuardianError` carries enough structure to surface validation failures at field-level paths — useful for form rendering, API error responses, and tooling that walks the cause tree.

![Deno](https://img.shields.io/badge/Deno-000000?logo=deno)
![Bun](https://img.shields.io/badge/Bun-f9f1e1?logo=bun)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white)
![Cloudflare Workers](https://img.shields.io/badge/Cloudflare%20Workers-F38020?logo=cloudflare&logoColor=white)
![Browsers](https://img.shields.io/badge/Browsers-4285F4?logo=googlechrome&logoColor=white)

## Table of Contents

- [Shape](#shape)
- [Serialization & redaction (`toJSON()`)](#serialization--redaction-tojson)
- [Causes and paths](#causes-and-paths)
- [Walking the error tree — `leafErrors()`](#walking-the-error-tree--leaferrors)
- [`safeParse` flow](#safeparse-flow)
- [Aggregating multiple errors](#aggregating-multiple-errors)
- [Custom error messages](#custom-error-messages)

## Shape

`GuardianError` extends the project's `BaseError`. Each instance carries:

| Field                | Type                                         | Description                                                                                       |
| -------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `message`            | `string`                                     | the human-readable error (template-substituted)                                                   |
| `name`               | `'GuardianError'`                            | error class name                                                                                  |
| `path`               | `ReadonlyArray<string \| number>`            | absolute path from the validation root to this error's failure site (empty for root-level errors) |
| `context.got`        | `unknown`                                    | the value that failed validation                                                                  |
| `context.expected`   | `unknown`                                    | what was expected (constraint value or label)                                                     |
| `context.comparison` | `string`                                     | type of validation (`'min'`, `'pattern'`, `'enum'`, etc.)                                         |
| `context.type`       | `string \| undefined`                        | category of the failure (`'string'`, `'object'`, `'refinement_failure'`, …)                       |
| `context.cause`      | `Record<string, GuardianError> \| undefined` | nested errors keyed by field path                                                                 |
| `context.arrayIndex` | `number \| undefined`                        | for array-element failures, the failing index                                                     |
| `timeStamp`          | `Date`                                       | when the error was constructed                                                                    |

### About `path`

`path` is populated by composite guardians (`object`, `array`, `tuple`, `record`, `set`, `map`) as failures bubble up — each level prepends its own key or index. String segments are object keys; numeric segments are array / tuple / set / map-entry indices. Leaf errors carry **absolute** paths, so consumer code can read `error.path` directly without walking `cause` first.

The `context.*` fields are populated by Guardian's validators — you don't construct them by hand.

## Serialization & redaction (`toJSON()`)

`GuardianError.toJSON()` (and therefore `JSON.stringify(error)`) is designed to be **safe to write to logs and error aggregators**. The value that failed validation is a common carrier of secrets / PII (passwords, tokens, request bodies), so it is **redacted out of the serialized form**:

- `context.got` is replaced with a type + size descriptor — `"[redacted string, length 13]"`, `"[redacted object, 2 key(s)]"`, etc. Scalars (numbers, booleans) and the short type-name markers Guardian stores for type mismatches pass through, so type diagnostics survive.
- The same raw value is stripped from the serialized `message`, `stack`, and every entry of the `causes` map. Many default validator messages interpolate the failing value at construction time (`` `Cannot coerce "…" to number` ``), so redacting `context.got` alone would still leak it through the message — the serialized message/stack/causes are scrubbed the same way.
- That scrub matches **whole tokens only**: an occurrence is replaced when the characters on both sides are non-word characters (or it sits at a string edge), which is how every default message embeds the value (`got r`, `Cannot coerce "t" to number`). A blind substring replace would destroy the diagnostics redaction exists to protect — a one-character value such as `'a'` would shred `String does not match pattern …` into `String does not m[redacted…]tch p[redacted…]ttern …`, mangle developer-authored constraint text (`.isIn(['foo','bar'])` → `ba[redacted…]`), and inflate the serialized `stack` roughly threefold by hitting every `a` in `GuardianError`, the package name and the file paths.
- `context.expected` is **not** redacted — it holds developer-authored constraint values / labels (a comparand passed to `.equals(secret)` therefore still appears in `context.expected`; keep that in mind when comparing against secrets).

Redaction only affects the **serialized** form. The unredacted values stay reachable in-memory for programmatic use:

```typescript
import { Guardian } from '@tundralibs/guardian';

const [err] = Guardian.string().equals('SECRET').safeParse('user-input');

if (err) {
  err.message; // in-memory: full text, unredacted
  err.context.got; // 'user-input' — still available for your own handling

  JSON.stringify(err.toJSON()); // the raw 'user-input' value does NOT appear
}
```

## Causes and paths

When validation fails on a single field, the error is direct:

```typescript
import { Guardian, GuardianError } from '@tundralibs/guardian';

try {
  Guardian.string().minLength(3).parse('hi');
} catch (e) {
  if (!(e instanceof GuardianError)) throw e;
  e.message;
  // 'String must be at least 3 characters long'
  e.context.got; // 'hi'
  e.context.expected; // 3
  e.context.comparison; // 'minLength'
}
```

When validation fails on multiple fields (object schema), each field's error is attached as a `cause`:

```typescript
import { Guardian, GuardianError } from '@tundralibs/guardian';

const User = Guardian.object({
  name: Guardian.string(),
  age: Guardian.number().min(0).max(120),
});

try {
  // `name: null` fails outright — coercion never applies to `null`/`undefined`
  // (see Guardian.string()'s coercion rules), unlike a value such as `123`,
  // which would silently coerce to `'123'` and pass.
  User.parse({ name: null, age: -5 }); // both fields fail
} catch (e) {
  if (!(e instanceof GuardianError)) throw e;
  e.message;
  // 'Object validation failed with 2 error(s)'
  e.context.cause;
  // {
  //   name: GuardianError(...),
  //   age:  GuardianError(...),
  // }
}
```

Use `.listCauses()` to flatten the tree into a path → message map:

```typescript ignore
e.listCauses();
// {
//   'name':              'Cannot coerce ... to string',
//   'age':               'Number must be at least 0',
// }
```

Nested objects produce dotted paths:

```typescript
import { Guardian, GuardianError } from '@tundralibs/guardian';

const Org = Guardian.object({
  user: Guardian.object({
    contact: Guardian.object({
      email: Guardian.string().email(),
    }),
  }),
});

try {
  Org.parse({ user: { contact: { email: 'not-an-email' } } });
} catch (e) {
  if (!(e instanceof GuardianError)) throw e;
  e.listCauses();
  // {
  //   'user.contact.email': 'Invalid email...',
  // }
}
```

Array element failures include the index in the path:

```typescript
import { Guardian, GuardianError } from '@tundralibs/guardian';

const Tags = Guardian.array(Guardian.string().minLength(2));

try {
  Tags.parse(['ok', '', 'good']);
} catch (e) {
  if (!(e instanceof GuardianError)) throw e;
  e.message;
  // 'Array element at index 1: String must be at least 2 characters long'
  e.context.arrayIndex; // 1
}
```

## Walking the error tree — `leafErrors()`

`.leafErrors()` returns an iterator over every leaf in the `cause` tree, paired with its absolute `path` from the root. The convenient surface for form / API code that wants "here's every field that failed and why":

```typescript
import { Guardian } from '@tundralibs/guardian';

const Schema = Guardian.object({
  user: Guardian.object({
    email: Guardian.string().email(),
    age: Guardian.number().integer().min(18),
  }),
  tags: Guardian.array(Guardian.string().minLength(1)),
});

const [err] = Schema.safeParse({
  user: { email: 'not-an-email', age: 12 },
  tags: ['ok', '', 'good'],
});

if (err) {
  for (const { path, error } of err.leafErrors()) {
    console.log(path.join('.'), '→', error.message);
  }
  // user.email → Invalid email...
  // user.age   → Number must be at least 18
  // tags.1     → String must be at least 1 characters long
}
```

`leafErrors()` walks the cause graph depth-first with cycle detection — circular `cause` references are visited at most once. Use it when you want a flat report; use `listCauses()` when a dotted-string-keyed map is more convenient.

| Method                | Returns                           | Use when                                                                   |
| --------------------- | --------------------------------- | -------------------------------------------------------------------------- |
| `error.path`          | `ReadonlyArray<string \| number>` | this leaf's absolute path — segments preserve string vs number distinction |
| `error.leafErrors()`  | `Iterable<{ path, error }>`       | "give me every field that failed, with paths"                              |
| `error.listCauses()`  | `Record<string, string>`          | dotted-path string → message map (Object.entries-friendly)                 |
| `error.context.cause` | `Record<string, GuardianError>`   | one level of nested errors keyed by field                                  |

## `safeParse` flow

Production code typically uses `.safeParse()` to avoid the cost of throwing on every bad request:

```typescript ignore
const [err, user] = User.safeParse(req.body);
if (err) {
  // Either a dotted-key map (legacy form)…
  return Response.json({
    error: err.message,
    fields: err.listCauses(),
  }, { status: 400 });

  // …or structured per-field with absolute paths via leafErrors():
  // const fields = [...err.leafErrors()].map(({ path, error }) => ({
  //   path,                       // e.g. ['address', 'zipCode']
  //   message: error.message,
  // }));
}
// `user` is typed correctly here.
```

The tuple form (`[err, value]`) lets the caller branch on `err` cleanly. When `err === null`, `value` is `T`; otherwise `value` is `undefined`.

For async chains:

```typescript
import type { BaseGuardian } from '@tundralibs/guardian';

declare const User: BaseGuardian<{ name: string }>;
declare const req: { body: unknown };

const [err, user] = await User.safeParseAsync(req.body);
```

## Aggregating multiple errors

`.superRefine([...])` accumulates failures across the array — every check runs even if earlier ones fail. The resulting error's `.context.cause` carries each per-refinement error keyed by its declared path:

```typescript
import { Guardian, GuardianError } from '@tundralibs/guardian';

const Schema = Guardian.object({
  password: Guardian.string(),
  confirm: Guardian.string(),
  age: Guardian.number(),
}).superRefine([
  {
    validator: (d) => d.password.length >= 8,
    message: 'too short',
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
  Schema.parse({ password: 'no', confirm: 'differ', age: 15 });
} catch (e) {
  if (!(e instanceof GuardianError)) throw e;
  e.message;
  // '3 refinement error(s): too short; passwords differ; must be 18+'
  e.context.cause;
  // { password: ..., confirm: ..., age: ... }
}
```

Object-level failures (`Guardian.object({...})`) and refinement failures use the same `cause` mechanism — tooling that walks the tree handles them uniformly.

## Custom error messages

Every constraint method accepts an optional message override:

```typescript ignore
Guardian.string().minLength(3, 'Name must be at least 3 characters');
Guardian.number().min(0, 'Age cannot be negative');
Guardian.array(Guardian.string()).maxLength(10, 'Tag list is too long');
Guardian.object({...}).refine(check, 'Custom rule failed', 'fieldPath');
```

The custom message replaces the default template; the structured `context.*` fields stay populated either way (so tooling that reads them continues to work).

### Limits of error messages in emitted docs

When you emit OpenAPI / JSON Schema documentation, **custom error messages do not carry over**. JSON Schema has no standard error-message vocabulary; OpenAPI has none either. Messages stay runtime-only.

If you need user-facing field labels in form generators, use `.describe({ title, description })` — those _do_ survive into the emitted schema. See [Documentation Emit](Guardian-Documentation.md).

---

[← Back to Guardian](../README.md)
