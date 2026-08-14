# Utils - variableReplacer

One-shot `${var}` template substitution for **dynamic** templates
(the template string isn't known until runtime).

[← Back to Utils](../README.md)

## Relationship to `templatize`

`variableReplacer(message, context)` is exactly
`templatize(message, { onMissing: 'literal' })(context)` rolled into a
single call. It exists for the use case where the template comes from
runtime input — error messages built per-throw, config files with `${}`
substitution, log handler path templates, etc.

For static templates known at module-load time, use
[`templatize`](Utils-Templatize.md) directly and reuse the returned
renderer — you'll pay the compile cost once instead of once per call.

## Overview

- **Variable substitution**: replaces `${key}` placeholders.
- **Dot-path lookup**: `${user.name}` walks `context.user.name`.
- **Array formatting**: arrays render as `(a, b, c)`.
- **Type coercion**: numbers, booleans → `String(value)`, `null` → `'null'`.
- **Safe on missing**: unknown placeholders keep the `${name}` text
  (the `onMissing: 'literal'` contract).
- **Circular references**: surfaced via `JSON.stringify` when a
  substituted plain-object value is part of a cycle.

## Installation

```bash
deno add @tundralibs/utils
```

## API

```typescript ignore
variableReplacer(
  message: string,
  context: Record<string, unknown>,
  regex?: RegExp,
): string
```

**Parameters**

- `message` — template string with placeholders.
- `context` — source values (object trees walked recursively via dot paths).
- `regex` — optional custom placeholder pattern. Must be `g`-flagged
  and have **exactly one capture group** around the variable name.
  Defaults to the `${...}` form handled by `templatize`.

**Returns** — `message` with placeholders substituted.

**Throws** — `TypeError` when a substituted plain-object value
participates in a circular reference graph (raised by JSON.stringify
during value-to-string conversion).

## Examples

### Basic substitution

```typescript
import { variableReplacer } from '@tundralibs/utils';

variableReplacer('Hello ${name}!', { name: 'World' });
// 'Hello World!'
```

### Dot-path / nested context

```typescript
import { variableReplacer } from '@tundralibs/utils';

variableReplacer(
  'User: ${user.firstName} ${user.lastName} (${user.id})',
  { user: { firstName: 'John', lastName: 'Doe', id: 123 } },
);
// 'User: John Doe (123)'
```

### Array formatting

```typescript
import { variableReplacer } from '@tundralibs/utils';

variableReplacer('Available: ${colors}', { colors: ['red', 'green', 'blue'] });
// 'Available: (red, green, blue)'
```

### Missing values stay literal

```typescript
import { variableReplacer } from '@tundralibs/utils';

variableReplacer('Name: ${name}, City: ${city}', { name: 'Bob' });
// 'Name: Bob, City: ${city}'   ← unmapped placeholder survives
```

### Custom delimiters

When the template comes from a system that uses non-`${}` syntax
(handlebars-style `{{...}}`, shell-style `$NAME`, etc.), pass a
custom regex. It MUST be global (`/g`) and have exactly one capture
group around the variable name.

```typescript
import { variableReplacer } from '@tundralibs/utils';

// Handlebars-style
variableReplacer(
  'Hello {{name}}!',
  { name: 'World' },
  /\{\{([^}]+)\}\}/g,
);
// 'Hello World!'

// Shell-style $NAME
variableReplacer(
  'export PATH=$PATH:/usr/local/bin',
  { PATH: '/bin:/usr/bin' },
  /\$([A-Z_][A-Z0-9_]*)/g,
);
// 'export PATH=/bin:/usr/bin:/usr/local/bin'
```

The custom-regex path uses a hand-rolled scanner (not `templatize`),
but otherwise behaves identically: dot-path lookup, array formatting
as `(a, b, c)`, missing-key keeps the original placeholder.

### Error message templating (typical usage)

```typescript
import { variableReplacer } from '@tundralibs/utils';

class ValidationError {
  constructor(field: string, value: unknown, rule: string) {
    const message = variableReplacer(
      "Validation failed: '${field}' with value '${value}' must ${rule}",
      { field, value, rule },
    );
    throw new Error(message);
  }
}
```

This is how `BaseError`, `EngineError`, and `GuardianError` build
their messages from per-class templates.

## When to use which

| Situation                                   | Use                                                              |
| ------------------------------------------- | ---------------------------------------------------------------- |
| Template is a string literal in source code | [`templatize`](Utils-Templatize.md) — type-checked, compile once |
| Template comes from config / user / runtime | `variableReplacer` — one-shot                                    |
| Template is reused but built at runtime     | `templatize(message)` at construction, hold the renderer         |

## Performance

Benched on Apple M2 / Deno 2.7.11 (`packages/utils/variableReplacer.bench.ts`):

| Scenario                                 | Time    |
| ---------------------------------------- | ------- |
| 3 vars from nested user object           | ~820 ns |
| 2 vars with deeply nested context object | ~705 ns |

About 16–36% faster than the previous flatten-then-regex
implementation, because the compile-once-then-render path is cheaper
than walking the whole context tree per call.

For hot paths that reuse the same template (millions of calls),
pre-compile via `templatize` instead — the per-call cost drops to
~50–250 ns depending on variable count.

## Behaviour notes

- **Missing keys** keep the placeholder: `${name}` stays as
  `${name}`. Pick `templatize(t, { onMissing: 'empty' })` if you want
  them to vanish.
- **`null`** renders as the string `'null'`. **`undefined`** is
  treated as missing.
- **Arrays** render as `(a, b, c)`. Nested objects in arrays
  default-stringify to `'[object Object]'` (legacy contract).
- **`Date`** values render as ISO 8601 strings (`toISOString()`);
  **`RegExp`** and **function** values render via `toString()`.
- **Plain objects** render via `JSON.stringify`. Circular references
  in those objects throw `TypeError`.

## Related

- [templatize](Utils-Templatize.md) — compile-once, render-many; the
  underlying engine.
- [Config](Utils-Config.md) — uses `variableReplacer` for env-var
  substitution in config file contents.
- [BaseError](Utils-BaseError.md) — uses it for per-instance error
  message templating.
- [Slogger `simpleFormatter`](../../slogger/formatters/Slogger-Formatters.md) —
  uses `templatize` directly for the compile-once benefit.

[← Back to Utils](../README.md)
