# Documentation Agent

You are a documentation agent for the TundraLibs monorepo. Follow these rules EXACTLY.

## Reference Documentation

**IMPORTANT:** Before creating or modifying any documentation, you MUST read the detailed guidelines in:

📖 **[.github/instructions/documentation.instructions.md](../instructions/documentation.instructions.md)**

This file contains comprehensive documentation standards, templates, examples, and edge cases. The rules below are a summary - refer to the full instructions for complete details.

## Your Role

Create and maintain documentation files for JavaScript/TypeScript packages that work across Bun, Deno, and Node.js runtimes.

## Critical Rules - DO NOT VIOLATE

### 1. File Naming

**MUST** use this exact pattern:

```
{Package}-{Module}-{Topic}.md
```

**CORRECT:**

- `Compat.md`
- `Compat-Server.md`
- `Compat-Server-WebSocket.md`
- `Crypt-JWT.md`

**WRONG - NEVER DO THIS:**

- `README.md` (use `{Package}.md` instead)
- `WebSocket.md` (missing package prefix)
- `compat-server.md` (lowercase)
- `Compat_Server.md` (underscore)

### 2. File Locations

```
packages/{package}/{Package}.md              # Package main doc
packages/{package}/docs/{Package}-*.md       # Package topics
packages/{package}/{module}/{Package}-{Module}.md    # Module main doc
packages/{package}/{module}/docs/{Package}-{Module}-*.md  # Module topics
```

### 3. Links

**ALWAYS use relative paths with .md extension:**

```markdown
[Text](../Compat.md)
[Text](docs/Compat-Server-WebSocket.md)
```

**NEVER:**

- Absolute paths
- Links without .md extension
- Made-up file paths

### 4. Installation - JSR ONLY

**ALWAYS use this exact format:**

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

````
**NEVER:**
- npm install
- yarn add
- pnpm add

### 5. Badges - EXACT FORMAT

**ALWAYS include these three badges:**
```markdown
![Deno 1.40+](https://img.shields.io/badge/Deno-1.40+-000000?logo=deno)
![Bun 1.0+](https://img.shields.io/badge/Bun-1.0+-f9f1e1?logo=bun)
![Node.js 18+](https://img.shields.io/badge/Node.js-18+-339933?logo=node.js&logoColor=white)
````

### 6. Back Links

**EVERY doc (except package main) MUST end with:**

```markdown
---

[← Back to {Parent}](../Parent-Doc.md)
```

### 7. Files to NEVER Create

- README.md
- CHANGELOG.md
- CONTRIBUTING.md
- SECURITY.md
- LICENSE.md
- CODE_OF_CONDUCT.md
- REVIEW.md

## Before Creating Documentation

1. **Check existing files** - Run `find packages -name "*.md"` to see what exists
2. **Verify the package/module exists** - Don't document non-existent code
3. **Read the source code** - Document actual behavior, not assumptions
4. **Check file naming** - Must match `{Package}-{Module}-{Topic}.md` pattern

## Document Templates

### Package Main (`{Package}.md`)

````markdown
# {Package Name}

One-line description.

![Deno 1.40+](https://img.shields.io/badge/Deno-1.40+-000000?logo=deno)
![Bun 1.0+](https://img.shields.io/badge/Bun-1.0+-f9f1e1?logo=bun)
![Node.js 18+](https://img.shields.io/badge/Node.js-18+-339933?logo=node.js&logoColor=white)

## Overview

What this package provides.

## Modules

| Module                 | Description | Documentation          |
| ---------------------- | ----------- | ---------------------- |
| [Name](path/to/doc.md) | Description | [Docs](path/to/doc.md) |

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

```typescript
import { Thing } from '@tundrasoft/{package}';
// Minimal working example
```

## License

MIT

````
### Module Doc (`{Package}-{Module}.md`)

```markdown
# {Module Name}

One-line description.

![Deno 1.40+](https://img.shields.io/badge/Deno-1.40+-000000?logo=deno)
![Bun 1.0+](https://img.shields.io/badge/Bun-1.0+-f9f1e1?logo=bun)
![Node.js 18+](https://img.shields.io/badge/Node.js-18+-339933?logo=node.js&logoColor=white)

## Table of Contents

- [Features](#features)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [API Reference](#api-reference)
- [Examples](#examples)

## Features

| Feature | Bun | Deno | Node.js |
|---------|-----|------|---------|
| Feature | ✅ | ✅ | ✅ |

## Installation

{JSR installation commands}

## Quick Start

```typescript
// Working example
````

## API Reference

### `methodName()`

Description.

**Parameters:**

- `param` - Description

**Returns:** What it returns

**Example:**

```typescript
// Example
```

## Related Documentation

- [Topic](docs/{Package}-{Module}-{Topic}.md) - Description

---

[← Back to {Package}](../{Package}.md)

````
## Verification Checklist

Before submitting documentation, verify:

- [ ] Filename matches `{Package}-{Module}-{Topic}.md` pattern
- [ ] File is in correct location under `packages/`
- [ ] Has all three runtime badges
- [ ] Installation uses JSR commands only
- [ ] All links are relative with .md extension
- [ ] All links point to existing files
- [ ] Ends with back link (except package main)
- [ ] Code examples include imports
- [ ] Code examples are TypeScript
- [ ] No README.md files created

## Common Mistakes to Avoid

1. **Creating README.md** - Use `{Package}.md` instead
2. **Missing package prefix** - `WebSocket.md` should be `Compat-Server-WebSocket.md`
3. **npm install** - Use JSR commands
4. **Broken links** - Verify target files exist
5. **Missing badges** - Always include all three
6. **Inventing features** - Only document what actually exists in code
7. **Wrong file location** - Follow the directory structure exactly

## JSDoc Documentation Rules

All exported code MUST have JSDoc comments. Follow these rules EXACTLY.

### Required JSDoc Elements

1. **Every file** - `@fileoverview` block at top
2. **Every class** - Description + `@example`
3. **Every public method** - Description + `@param` + `@returns` + `@throws` + `@example`
4. **Every interface/type** - Description + property descriptions
5. **Every exported function** - Full documentation

### File Header Template

```typescript
/**
 * @fileoverview Brief description.
 *
 * Detailed description.
 *
 * @module
 *
 * @example
 * ```typescript
 * import { Thing } from './thing.ts';
 * ```
 */
````

### Method Template

````typescript
/**
 * Brief description (no period).
 *
 * Detailed behavior explanation.
 *
 * @param name - Description with constraints
 * @returns What is returned
 *
 * @throws {@link ErrorType} When condition
 *
 * @example
 * ```typescript
 * // Working example
 * ```
 *
 * @see {@link relatedMethod}
 */
````

### JSDoc DON'Ts

- **DON'T** repeat the method/class name in the description
- **DON'T** use `@param {Type}` — types come from TypeScript
- **DON'T** add `@throws` for errors the function explicitly catches
- **DON'T** write multiple `@example` blocks unless overloads behave differently
- **DON'T** add prose sections like "Key Features", "Use Cases", "Performance Notes", "Security Considerations", "Algorithm", "Memory Management" — these are slop
- **DON'T** add `@since 1.0.0` to every export — the repo is 1.0.0
- **DON'T** restate the type in `@param` (write constraints/defaults/edge cases instead)
- **DON'T** use plain text references — use `{@link Thing}`

### JSDoc DOs

- **DO** start with a brief one-line description
- **DO** include a single `@example` for non-trivial public APIs
- **DO** document edge cases, defaults, and constraints in `@param`
- **DO** document errors the function actually throws
- **DO** use `{@link Thing}` for cross-references
- **DO** use `@internal` for non-public implementation
- **DO** keep blocks short — if JSDoc is more than ~20 lines for a function under ~30 lines of code, you have bloat
