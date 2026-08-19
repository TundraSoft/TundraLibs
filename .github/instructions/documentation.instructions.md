---
applyTo: '**/*.md'
description: 'Documentation and JSDoc standards for TundraLibs packages.'
---

# Documentation Instructions

Guidelines for creating and maintaining documentation in TundraLibs.

## File Naming Convention

Each package's **main documentation is its `README.md`** (in the package
root) — this is what GitHub, JSR, and npm render natively. All **other**
documentation files MUST use wiki-compatible names with package prefixes:

```
{Package}-{Module}-{Topic}.md
```

The wiki-sync workflow publishes `packages/{dir}/README.md` to the wiki as
`{Package}.md` (e.g. `packages/restler/README.md` → wiki page `Restler`).
The dir→wiki-name mapping lives in `.github/workspace-meta.json`,
maintained by `deno task workspace:add/remove/sync` — the name you pass
to `workspace:add` (casing preserved) becomes the wiki/display name.
The wiki sync fails loudly on unmapped packages and on dead links.

### Examples

| Package | Module  | Topic     | Filename                     |
| ------- | ------- | --------- | ---------------------------- |
| compat  | -       | -         | `README.md` (wiki: `Compat`) |
| compat  | server  | -         | `Compat-Server.md`           |
| compat  | server  | WebSocket | `Compat-Server-WebSocket.md` |
| compat  | runtime | -         | `Compat-Runtime.md`          |
| crypt   | jwt     | -         | `Crypt-JWT.md`               |
| utils   | -       | -         | `README.md` (wiki: `Utils`)  |

### Rules

1. **Main doc is `README.md`** - One per package, in the package root
2. **Sub-docs start with the package's wiki name** - `Compat-…`, `Crypt-…`
   (capitalized, matching the `PACKAGES` map)
3. **Use hyphens** - Not underscores or spaces
4. **Capitalize each segment** - `Compat-Server-WebSocket` not `compat-server-websocket`
5. **No `{Package}.md` in the repo** - That name is generated on the wiki
   from `README.md`; do not create it in the source tree

## File Locations

```
packages/{package}/
├── README.md                       # Main package documentation (wiki: {Package}.md)
├── docs/
│   ├── {Package}-{Topic}.md        # Package-level topics
│   └── ...
├── {module}/
│   ├── {Package}-{Module}.md       # Module documentation
│   └── docs/
│       ├── {Package}-{Module}-{Topic}.md
│       └── ...
```

## Link Format

Links MUST be relative and will be processed by the wiki-sync workflow.

### Correct Link Format

```markdown
<!-- From the package README.md to Compat-Server.md -->

[Server](server/Compat-Server.md)

<!-- From Compat-Server.md to Compat-Server-WebSocket.md -->

[WebSocket](docs/Compat-Server-WebSocket.md)

<!-- From Compat-Server-WebSocket.md back to Compat-Server.md -->

[← Back to Server](../Compat-Server.md)

<!-- From Compat-Server.md back to the package main doc -->

[← Back to Compat](../README.md)

<!-- Cross-package link to another package's main doc -->

[Compat](../compat/README.md)
```

### Rules

1. **Use relative paths** - `../README.md` not absolute paths
2. **Include .md extension** - `Compat-Server.md` not `Compat-Server`
3. **No URL schemes** - Not `file://` or `https://`
4. **Anchors are OK** - `Compat-Server.md#websocket`
5. **Links resolve in-repo** - The wiki-sync script resolves each link
   relative to the file containing it, so a correct GitHub link is
   automatically a correct wiki link. Links to non-wiki repo files are
   rewritten to GitHub blob URLs; links to missing files fail the sync.

## Document Structure

### Package Main Document (`README.md`)

````markdown
# {Package Name}

Brief description.

![Deno](https://img.shields.io/badge/Deno-000000?logo=deno)
![Bun](https://img.shields.io/badge/Bun-f9f1e1?logo=bun)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white)

## Overview

What this package does.

## Modules

| Module                               | Description | Documentation                  |
| ------------------------------------ | ----------- | ------------------------------ |
| [ModuleName](path/Package-Module.md) | Description | [Docs](path/Package-Module.md) |

## Installation

**Deno:**

```bash
deno add @tundralibs/{package}
```
````

**Bun:**

```bash
bunx jsr add @tundralibs/{package}
```

**Node.js:**

```bash
npx jsr add @tundralibs/{package}
```

## Quick Start

... code examples ...

## License

MIT

````
### Module Document (`{Package}-{Module}.md`)

```markdown
# {Module Name}

Brief description.

![Deno](https://img.shields.io/badge/Deno-000000?logo=deno)
![Bun](https://img.shields.io/badge/Bun-f9f1e1?logo=bun)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white)

## Table of Contents

- [Features](#features)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Configuration](#configuration)
- [API Reference](#api-reference)
- [Examples](#examples)
- [Related Documentation](#related-documentation)

## Features

| Feature | Bun | Deno | Node.js |
|---------|-----|------|---------|
| Feature 1 | ✅ | ✅ | ✅ |
| Feature 2 | ✅ | ✅ | ❌ |

## Installation

... JSR installation commands ...

## API Reference

### MethodName()

Description.

```typescript
methodName(param: Type): ReturnType
````

**Parameters:**

- `param` - Description

**Returns:** Description

**Throws:**

- `ErrorType` - When condition

**Example:**

```typescript
// Example code
```

## Related Documentation

- [Topic](docs/Package-Module-Topic.md) - Description

---

[← Back to {Parent}](../Package.md)

````
### Topic Document (`{Package}-{Module}-{Topic}.md`)

```markdown
# {Topic Name}

Brief description.

## Table of Contents

- [Section 1](#section-1)
- [Section 2](#section-2)

## Section 1

Content...

## Section 2

Content...

---

[← Back to {Module}](../Package-Module.md)
````

## Badges

Always use these exact badges for runtime support — **without version
numbers**. Version floors are a repo-wide policy stated once in the
root README and enforced by `engines` + the CI matrix; per-doc version
claims drift and are not maintained:

```markdown
![Deno](https://img.shields.io/badge/Deno-000000?logo=deno)
![Bun](https://img.shields.io/badge/Bun-f9f1e1?logo=bun)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white)
```

## Installation Section

Always use JSR format:

````markdown
## Installation

**Deno:**

```bash
deno add @tundralibs/{package}
```
````

**Bun:**

```bash
bunx jsr add @tundralibs/{package}
```

**Node.js:**

```bash
npx jsr add @tundralibs/{package}
```

**Direct import (Deno):**

```typescript
import { Thing } from 'jsr:@tundralibs/{package}/{module}';
```

````
## Files NOT to Create

Do NOT create documentation files for:

- `{Package}.md` (e.g. `Restler.md`) - The wiki generates it from `README.md`
- `CHANGELOG.md` - Auto-generated
- `CONTRIBUTING.md` - Repo root only
- `SECURITY.md` - Repo root only
- `LICENSE.md` - Repo root only
- `CODE_OF_CONDUCT.md` - Repo root only
- `REVIEW.md` - Internal review notes

## Compatibility Tables

Use checkmarks and X marks consistently:

```markdown
| Feature | Bun | Deno | Node.js |
|---------|-----|------|---------|
| Supported | ✅ | ✅ | ✅ |
| Partial | ✅ | ✅ | ⚠️* |
| Not supported | ❌ | ❌ | ❌ |

*Footnote explaining limitation
````

## Code Examples

Documentation ships to consumers. `README.md` and `docs/*.md` are included in
the published tarball — a `npx jsr add @tundralibs/id` install puts every
`docs/*.md` file into the consumer's `node_modules`. Examples are therefore
distributed code, and they are read by both humans and coding agents. Treat a
wrong example as a bug, not a typo.

1. **Every block carries its own imports** - see below, this is not optional
2. **Use the public specifier** - never a relative path
3. **Use TypeScript** - this is a TypeScript project
4. **Show practical usage** - not just API signatures
5. **Include error handling** - when relevant

### Every block must stand alone

`deno check --doc-only` compiles **each fenced block as its own module** — there
is no shared scope between blocks in the same file. A block that uses `logger`
must also construct `logger`.

Repeating a one-line import across sibling blocks is **correct and intended**.
Do not factor it out. A reader — or a model — who lands on one block in
isolation must get everything needed to run it.

Keep setup minimal: the import, plus the least construction that makes the
demonstrated call legal.

### Import specifiers

| Specifier | Resolves? | Use in docs? |
| --------- | --------- | ------------ |
| `@tundralibs/{package}` | Yes | **Default choice** |
| `@tundralibs/{package}/{subpath}` | Yes | **When the symbol lives there** |
| `../mod.ts` or `./Thing.ts` | Yes | **Never.** Consumers cannot use it |
| `@std/*` | Only if the package declares it | Avoid; do not add a dep for a doc |

Relative imports type-check but are forbidden in documentation — a consumer
reading the shipped copy has no `../mod.ts`. Always write the specifier a
consumer would actually type.

Pick the specifier from the package's `deno.json` `exports` map: if the symbol
is re-exported from the root `mod.ts`, use the bare package specifier; if it is
only reachable through a subpath (`./errors`, `./types`, `./handlers`,
`./definition`), use that exact subpath. When both work, prefer the one the
surrounding document is teaching.

**This is the single most important rule in this file.** Packages here expose
2–15 subpath exports, and the import specifier is the one thing a reader cannot
infer from the example body.

```typescript
// Good — public specifier, self-contained, runnable
import { Slogger } from '@tundralibs/slogger';

const logger = new Slogger('api');
logger.info('server started', { port: 8080 });

// Bad — relative import; consumers cannot use this path
import { Slogger } from '../mod.ts';

// Bad — no import, no construction; `logger` is undefined
logger.info('server started', { port: 8080 });
```

### Blocks that are not runnable code

Tag a block ` ```ts ignore ` when it is not meant to compile. `deno check
--doc-only` skips those and checks everything tagged ` ```ts `.

Use `ts ignore` for:

- **Signatures and type declarations** — `new Slogger(options: SloggerOptions)`
- **Shell commands, JSON, config fragments, directory trees** mistagged as `ts`
- **Deliberate pseudo-code** with `...` elisions or placeholder identifiers

Never use `ts ignore` to silence a block that was meant to be a working example.
That defeats the purpose of the check.

## Verification — run this, do not eyeball it

Documentation in this repo is machine-checked. Both commands emit ANSI colour
codes; pipe through `sed 's/\x1b\[[0-9;]*m//g'` before parsing output.

### Markdown examples

```bash
deno check --doc-only packages/{package}/README.md packages/{package}/docs/*.md
```

Type-checks every ` ```ts ` block. Must exit clean before the work is done.
Check each file as you edit it rather than batching — the failure output is
per-block and easier to act on one file at a time.

### JSDoc surface

```bash
deno doc --lint packages/{package}/mod.ts
```

Reports three categories on the public API:

| Category | Meaning | Fix |
| -------- | ------- | --- |
| `missing-jsdoc` | Exported symbol has no JSDoc | Write it — see below |
| `private-type-ref` | Exported signature references a non-exported type | Export the type, or stop exposing it. **API decision — raise it, don't guess** |
| `missing-explicit-type` | Exported symbol has an inferred type | Annotate it |

### JSDoc examples

```bash
deno check --doc packages/{package}/mod.ts
```

Type-checks the code inside `@example` blocks. An `@example` that does not
compile is worse than no example.

**`@example` blocks follow different scoping rules from markdown blocks.** The
documented module's exports are already in scope, so an `@example` may call the
symbol it documents with no import:

```typescript
/**
 * Adds one.
 *
 * @example
 * ```ts
 * console.log(increment(1)); // 2
 * ```
 */
export function increment(n: number): number {
  return n + 1;
}
```

That compiles. Undefined names are still caught (`TS2304`), so the check is
real — it simply starts with the module in scope.

Consequences:

- **Do not add imports to existing `@example` blocks.** They are unnecessary,
  and an import naming a symbol that is not actually re-exported from that
  specifier will *introduce* a `TS2305` failure that was not there before.
- **If an example genuinely needs a second package**, import that one only, by
  public specifier, and only if the package already declares the dependency.
- Everything else still applies: no relative imports, no `@std/*` unless
  declared, and real TypeScript rather than pseudo-code.

The markdown rule (every block carries its own imports) and the `@example` rule
(module already in scope) are both correct. Do not apply one to the other.

### Never trade one for the other

Do not silence a `--doc-only` failure by deleting the example, and do not fix a
doc by editing source behaviour. If an example cannot be made to compile because
the API is genuinely wrong or awkward, leave it failing and report it — that is
a real finding and more valuable than a green check.

## JSDoc Documentation

All exported functions, classes, methods, and types MUST have JSDoc comments.

`deno doc --lint packages/{package}/mod.ts` is the authority on what is missing.
Run it before you start and after you finish; the count must go down, never up.

### Length budget (READ FIRST)

**JSDoc is a tax — keep it cheap or it rots.** Every line of doc must justify itself. Specifically:

- **Lead with one short paragraph.** What does this thing do, and why would I reach for it? If you can't say it tightly, the API is the problem — fix the API, not the doc.
- **One `@example` is the cap.** Add a second only if a different overload or call shape genuinely behaves differently. Multiple examples that show "the same thing with different args" are noise.
- **No marketing prose.** Do not write "Key Features", "Use Cases", "Performance Notes", "Security Considerations", "Common Patterns", "Algorithm" sections. If a behavior is non-obvious, document it in one sentence inline; if it's obvious from the code, omit it.
- **No `@since 1.0.0`.** The whole repo is 1.0.0. Add `@since` only when something was added later.
- **Don't restate the type.** `@param userId: number` does not need "The user ID, a number". Document constraints, defaults, and edge cases — the parts the type can't express.
- **Document real `@throws` only.** If the function explicitly catches and never throws, do not list `@throws`. If it can only throw via internal helpers, list those too.
- **WHY beats WHAT.** Comments that explain a non-obvious constraint, workaround, or invariant earn their keep; comments that paraphrase the next line do not.

If a JSDoc block is more than ~20 lines for a function under ~30 lines of code, it's almost certainly bloated. Cut.

### File Header

Every file MUST start with a `@fileoverview` block. Keep it tight: one sentence on what the module exports and any cross-cutting note (permissions, runtime caveats). Skip the `@example` here — examples belong on the exported symbols.

````typescript
/**
 * @fileoverview Brief description of what this module does.
 *
 * @module
 */
````

### Class Documentation

````typescript
/**
 * Brief one-line description.
 *
 * Longer description explaining purpose, behavior,
 * and any important details.
 *
 * ## Section Header (optional)
 *
 * Additional context, diagrams, or explanations.
 *
 * @example
 * ```typescript
 * const instance = new MyClass('name', { option: true });
 * instance.doSomething();
 * ```
 *
 * @see {@link RelatedClass} for related functionality
 * @see {@link SomeType} for configuration options
 */
export class MyClass {
````

### Method Documentation

````typescript
/**
 * Brief one-line description of what the method does.
 *
 * Longer description if behavior is complex. Include:
 * - What it does
 * - Side effects
 * - State changes
 *
 * @param paramName - Description of the parameter
 * @param options - Configuration options
 * @returns Description of return value
 *
 * @throws {@link ErrorType} Description of when this error is thrown
 * @throws {@link AnotherError} Another error condition
 *
 * @example
 * ```typescript
 * const result = instance.method('value', { flag: true });
 * console.log(result);
 * ```
 *
 * @see {@link otherMethod} for related functionality
 */
public methodName(paramName: string, options?: Options): ReturnType {
````

### Property Documentation

```typescript
/**
 * Brief description of what this property represents.
 *
 * Additional details if needed.
 *
 * @see {@link RelatedProperty}
 */
public readonly propertyName: Type;
```

### Getter/Setter Documentation

````typescript
/**
 * Brief description.
 *
 * Details about what the getter returns or computes.
 *
 * @returns Description of returned value
 *
 * @example
 * ```typescript
 * console.log(instance.value); // Output description
 * ```
 */
public get value(): Type {
````

### Interface/Type Documentation

````typescript
/**
 * Brief description of what this type represents.
 *
 * When to use this type and any constraints.
 *
 * @example
 * ```typescript
 * const config: MyConfig = {
 *   option1: 'value',
 *   option2: 42,
 * };
 * ```
 */
export interface MyConfig {
  /**
   * Description of this property.
   * @default defaultValue (if applicable)
   */
  option1: string;

  /**
   * Description of this property.
   */
  option2?: number;
}
````

### Internal/Private Documentation

Use `@internal` for implementation details not part of public API:

```typescript
/**
 * Description of internal implementation.
 *
 * @internal
 */
protected _internalMethod(): void {

/**
 * Storage for internal state.
 * @private
 */
private __privateField: Map<string, unknown>;
```

### JSDoc Tags Reference

| Tag                     | Usage                                  |
| ----------------------- | -------------------------------------- |
| `@fileoverview`         | File-level description (first in file) |
| `@module`               | Marks file as a module                 |
| `@param name - desc`    | Parameter description                  |
| `@returns desc`         | Return value description               |
| `@throws {@link Error}` | Error that may be thrown               |
| `@example`              | Code example (use triple backticks)    |
| `@see {@link Thing}`    | Reference to related item              |
| `@default value`        | Default value for optional param       |
| `@internal`             | Not part of public API                 |
| `@private`              | Private implementation detail          |
| `@deprecated`           | Deprecated, include alternative        |
| `@since version`        | Version when added                     |
| `@typeParam T`          | Generic type parameter                 |

### JSDoc Rules

1. **First line is brief** - One sentence, no period
2. **Blank line before details** - Separate brief from description
3. **Use {@link}** - For cross-references, not plain text
4. **One example, where it helps** - Include `@example` for non-trivial public APIs. Don't add a second example unless the behavior genuinely differs between call shapes.
5. **Document constraints, not types** - `@param` should describe ranges, defaults, and edge cases — not restate `: number` as "The number".
6. **Document only real throws** - `@throws` lists errors the function can actually surface. If it catches everything internally, omit `@throws`.
7. **Use markdown** - In descriptions (code, lists, headers)
8. **No redundancy** - Don't repeat the method name, the type, or what the next code line clearly does.
9. **Skip the marketing** - No "Key Features", "Use Cases", "Performance Notes", "Security Considerations", or "Algorithm" headings inside JSDoc. If a behavior matters, state it in one sentence inline.
10. **No `@since 1.0.0`** - The whole repo is 1.0.0. Use `@since` only when adding something to an already-released version.

### Good vs Bad Examples

````typescript
// BAD - redundant, no details
/**
 * Starts the server.
 */
public start(): void {

// GOOD - explains behavior, conditions, errors
/**
 * Starts the server and begins accepting connections.
 *
 * The server must be in 'STOPPED' state to start. After starting:
 * - State transitions: STOPPED → STARTING → RUNNING
 * - `onStart` event fires when ready
 *
 * @throws {@link ServerAlreadyRunningError} If server is not in STOPPED state
 * @throws {@link ServerError} If binding to address fails
 *
 * @example
 * ```typescript
 * server.start();
 * console.log(`Listening on ${server.address}`);
 * ```
 *
 * @see {@link stop} to stop the server
 */
public start(): void {
````

```typescript
// BAD - no context
/**
 * @param port - The port
 */

// GOOD - explains constraints and defaults
/**
 * @param port - Port number to listen on (0-65535). Defaults to 8008.
 */
```
