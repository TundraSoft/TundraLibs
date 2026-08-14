# Utils - templatize

Type-safe `${var}` template compiler. Compiles once, renders many.

[← Back to Utils](../README.md)

## Overview

`templatize` is the canonical template engine for the project. Slogger's
`simpleFormatter`, BaseError's message templates, and any other place
that needs `${var}`-style substitution all flow through it.

- **Compile once, render many**: parse the template into literal +
  lookup tokens at construction; render is a tight loop, no regex per
  call.
- **Type-safe**: variable names are extracted at compile time from a
  template string literal. Missing or misspelled keys are TypeScript
  errors, not silent failures at runtime.
- **Dot-path lookup**: `${user.name}` walks `values.user.name`
  _and_ accepts the flat `{'user.name': 'x'}` form.
- **Arrays** render as `(a, b, c)`. **Plain objects** render via
  `JSON.stringify`. **Dates** render as ISO 8601 strings
  (`toISOString()`); **RegExp** and **function** values render via
  `toString()`.
- **Configurable missing-key behaviour**: `'empty'` (default) emits
  `''`; `'literal'` keeps the `${var}` text. Pick the right one for
  your destination.

## Installation

```bash
deno add @tundralibs/utils
```

## API

```typescript ignore
templatize<T extends string>(
  template: T,
  options?: TemplateOptions,
): (values: TemplateValues<T>) => string

type TemplateOptions = {
  onMissing?: 'empty' | 'literal';  // default: 'empty'
};
```

`TemplateValues<T>` is computed at the type level from the template
string — required keys are inferred per `${name}` placeholder.

## Examples

### Basic — type-checked at the call site

```typescript
import { templatize } from '@tundralibs/utils';

const greet = templatize('Hello, ${name}! Welcome to ${place}.');

greet({ name: 'Alice', place: 'TypeScript' });
// 'Hello, Alice! Welcome to TypeScript.'

// @ts-expect-error missing 'place'
greet({ name: 'Bob' }); // ❌ TS error: missing 'place'
greet({
  name: 'Bob',
  // @ts-expect-error extra key: not a placeholder in the template
  location: 'Somewhere',
});
```

### Log-style template — preserve placeholders on missing keys

For human-tailed output (logs, debug prints), unmapped variables
should stay visible:

```typescript
import { templatize } from '@tundralibs/utils';

const line = templatize('[${time}] ${level}: ${msg}', { onMissing: 'literal' });
line({ time: '12:00:01', level: undefined as unknown as string, msg: 'hi' });
// '[12:00:01] ${level}: hi'   ← the `${level}` placeholder survives
```

This is what `slogger`'s `simpleFormatter` uses under the hood.

### User-facing rendering — empty on missing (default)

For URLs / SQL / messages that go to users or services, missing
fields should disappear, not leak `${...}` syntax:

```typescript
import { templatize } from '@tundralibs/utils';

const url = templatize('/users/${id}?token=${token}');
url({ id: '42', token: undefined as unknown as string });
// '/users/42?token='   ← clean empty rather than `?token=${token}`
```

### Dot-path lookup against nested values

```typescript
import { templatize } from '@tundralibs/utils';

const fmt = templatize('User: ${user.name} <${user.email}>');

// Both shapes work at runtime:
fmt({ 'user.name': 'Alice', 'user.email': 'a@x.com' }); // flat
fmt({ user: { name: 'Alice', email: 'a@x.com' } } as any); // nested
// Both → 'User: Alice <a@x.com>'
```

(Flat keys win over nested when both are present, for back-compat.)

### Array values

```typescript
import { templatize } from '@tundralibs/utils';

const fmt = templatize('Tags: ${tags}');
fmt({ tags: ['ts', 'logger', 'fast'] as unknown as string });
// 'Tags: (ts, logger, fast)'
```

### Compile-time optimisations

- A template with **no** placeholders compiles to a constant function:
  ```typescript
  import { templatize } from '@tundralibs/utils';

  const c = templatize('Static text');
  c(null as any); // 'Static text'  — no values needed
  ```
- A template that is **just one** `${...}` skips the per-token loop.

## Performance

Benched on Apple M2 / Deno 2.7.11 (`packages/utils/templatize.bench.ts`):

| Operation                          | Time        |
| ---------------------------------- | ----------- |
| compile, 2 vars                    | ~88 ns      |
| compile, 10 vars                   | ~320 ns     |
| compile, all-literal               | ~46 ns      |
| **render, 2 vars (pre-compiled)**  | **~50 ns**  |
| **render, 10 vars (pre-compiled)** | **~255 ns** |
| render, dot-path on nested         | ~200 ns     |
| render, all-literal (constant fn)  | ~4 ns       |

The expected idiom is **compile at module scope, render in hot loops**.
A one-shot wrapper that compiles per call is provided as
[`variableReplacer`](Utils-VariableReplacer.md) — use it when the
template string itself is dynamic (loaded from config, error message
construction, etc.).

## Value-type stringification

Matches the legacy `variableReplacer` contract so the two can be
swapped freely:

| Value type                    | Rendered as                      |
| ----------------------------- | -------------------------------- |
| `string`                      | the string                       |
| `number`, `boolean`, `bigint` | `String(value)`                  |
| `null`                        | `'null'`                         |
| `undefined` / missing         | per `onMissing` option           |
| array                         | `'(a, b, c)'`                    |
| plain object                  | `JSON.stringify(value)`          |
| `Date`                        | `value.toISOString()` (ISO 8601) |
| `RegExp`                      | `value.toString()`               |
| `function`                    | `value.toString()` (source form) |

## Comparison

| Feature                  | `templatize`                    | `variableReplacer` |
| ------------------------ | ------------------------------- | ------------------ |
| Compile-time type safety | ✅ via `TemplateValues<T>`      | ❌ runtime only    |
| Compile cost paid        | once at construction            | every call         |
| Best for                 | static templates                | dynamic templates  |
| Dot-path / nested lookup | ✅                              | ✅                 |
| Missing-key behaviour    | `'empty'` or `'literal'`        | always `'literal'` |
| Arrays / objects / null  | identical to `variableReplacer` | reference contract |

## Related

- [variableReplacer](Utils-VariableReplacer.md) — one-shot wrapper
  around `templatize` for dynamic templates.
- [Slogger `simpleFormatter`](../../slogger/formatters/Slogger-Formatters.md) —
  uses `templatize` with `onMissing: 'literal'`.
- [BaseError](Utils-BaseError.md) — uses the template engine for
  contextualised error messages.

[← Back to Utils](../README.md)
