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
deno add @tundrasoft/{package}
```
````

**Bun:**

```bash
bunx jsr add @tundrasoft/{package}
```

**Node.js:**

```bash
npx jsr add @tundrasoft/{package}
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
deno add @tundrasoft/{package}
```
````

**Bun:**

```bash
bunx jsr add @tundrasoft/{package}
```

**Node.js:**

```bash
npx jsr add @tundrasoft/{package}
```

**Direct import (Deno):**

```typescript
import { Thing } from 'jsr:@tundrasoft/{package}/{module}';
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

1. **Always include imports** - Show where things come from
2. **Use TypeScript** - This is a TypeScript project
3. **Show practical usage** - Not just API signatures
4. **Include error handling** - When relevant

```typescript
// Good
import { Server } from './Server.ts';

const server = new Server('API', {
  mode: 'TCP',
  port: 8080,
  handler: (req) => new Response('OK'),
});

server.start();

// Bad - missing import, no practical context
new Server('API', options);
```

## JSDoc Documentation

All exported functions, classes, methods, and types MUST have JSDoc comments.

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
