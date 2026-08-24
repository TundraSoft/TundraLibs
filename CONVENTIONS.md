# Conventions

Coding rules every package in this monorepo follows. New code lands
matching these patterns; existing code is retrofitted as it's
touched. Treat anything here as a deliberate constraint — if you
think a rule needs an exception, raise it in the PR instead of
quietly breaking the pattern.

## Table of Contents

- [File and folder naming](#file-and-folder-naming)
- [Exported types live in a `types/` folder](#exported-types-live-in-a-types-folder)
- [Custom errors live in an `errors/` folder](#custom-errors-live-in-an-errors-folder)
- [Imports go through folder barrels](#imports-go-through-folder-barrels)
- [Dependency manifests](#dependency-manifests)
- [Documentation examples use public specifiers](#documentation-examples-use-public-specifiers)
- [Privacy prefixing](#privacy-prefixing)
- [JSDoc: link custom types, declare throws](#jsdoc-link-custom-types-declare-throws)
- [Module-level constants are `UPPER_SNAKE_CASE`](#module-level-constants-are-upper_snake_case)

## File and folder naming

- **Files** that export a single class, error, or type are
  `PascalCase.ts`, matching the principal export's identifier.
  Files that export a collection of helpers / utilities / a barrel
  are `camelCase.ts` or `mod.ts`. Examples: `RadRouter.ts`,
  `ClearOptions.ts`, `DuplicateRouteError.ts`, `variableReplacer.ts`,
  `mod.ts`.
- **Class names** are `PascalCase`, always. The class identifier
  matches the file name when the file exports exactly one class.
- **Folder names** are lowercase (single word) or `kebab-case`
  (multi-word). Examples: `types/`, `errors/`, `docs/`,
  `examples/`, `test-fixtures/`. Never `Types/` or `Test_Fixtures/`.
- **Test files** mirror the file they cover: `RadRouter.test.ts`
  sits next to `RadRouter.ts`. **Bench files** use `.bench.ts`.
- **Roadmaps** live at the root of what they describe, named
  `ROADMAP.md` — the repo root for the whole suite, and a package's
  own root for that package's limitations / planned / deferred work
  (e.g. `packages/pact/ROADMAP.md`). A roadmap is a top-level index,
  **not** a `docs/` topic guide, and there is no separate design doc:
  the "how it works" lives in `docs/`, the "what's not done yet" lives
  in `ROADMAP.md`.
- **No `TODO.md`.** There are exactly two homes for unfinished work,
  split by altitude. Durable, forward-looking planning — deferred
  features, known limitations, architecture decisions worth remembering
  — goes in `ROADMAP.md` (curated, low-churn, and shipped in the
  tarball, so keep it consumer-honest). Tactical, granular work —
  specific bugs, cleanups, one-off follow-ups — goes in **GitHub
  Issues**, where it has a real lifecycle (assign, link to the fixing
  PR, close). A checked-in `TODO.md` has neither audience nor
  lifecycle, so it silently rots; do not add one.

## Exported types live in a `types/` folder

Every type a package exports lives in its own file under `types/`,
with a `types/mod.ts` re-export and a sub-path export wired into
both `deno.json` and `package.json`. Internal-only types (helpers
that aren't re-exported) stay in the file that uses them.

```
packages/<pkg>/
├── types/
│   ├── ClearOptions.ts          ← one type per file
│   ├── RouteMatch.ts
│   ├── RouterOptions.ts
│   └── mod.ts                   ← re-exports all of the above
├── deno.json
├── package.json
└── <pkg>.ts                     ← implementation
```

`types/mod.ts`:

```ts
export type { ClearOptions } from './ClearOptions.ts';
export type { RouteMatch } from './RouteMatch.ts';
export type { RouterOptions } from './RouterOptions.ts';
```

`deno.json`:

```jsonc
{
  "exports": {
    ".": "./mod.ts",
    "./types": "./types/mod.ts"
  }
}
```

`package.json`:

```jsonc
{
  "exports": {
    ".": "./mod.ts",
    "./types": "./types/mod.ts"
  }
}
```

Consumers then import types from the sub-path when they only need
the type surface:

```ts
import type { RouteMatch } from '@tundralibs/radrouter/types';
```

### Re-exporting is the root `mod.ts`'s job, not the implementation's

Implementation files (`RadRouter.ts`, `BaseGuardian.ts`, etc.) only
`import` the types they actually use. They do **not** re-export
types — that's the package's root `mod.ts`'s responsibility, and
the only place it happens:

```ts
// packages/radrouter/mod.ts  ✅
export { RadRouter } from './RadRouter.ts';
export type {
  ClearOptions,
  HTTPMethod,
  Middleware,
  RouteMatch,
  RouterOptions,
} from './types/mod.ts';
```

```ts
// packages/radrouter/RadRouter.ts  ✅
import type {
  ClearOptions,
  HTTPMethod,
  Middleware,
  RouteMatch,
  RouterOptions,
} from './types/mod.ts';
// no `export type { … }` here — the file only imports what it uses.
```

```ts
// packages/radrouter/RadRouter.ts  ❌
export type { ClearOptions, HTTPMethod, ... } from './types/mod.ts';
// don't re-export from implementation — duplicates the root mod.ts
// and creates two import paths for the same type.
```

### Large type surfaces may group into subfolders

A package with many exported types MAY organise `types/` into
subsystem subfolders (`types/application/`, `types/context/`, …).
The EXPORTED IDENTIFIER spells the full namespace chain — package
prefix + subfolder + file — while the FILE NAME is just the leaf:
`types/application/Events.ts` exports `RapidApplicationEvents`;
`types/Middleware.ts` (the root implies the package prefix) exports
`RapidMiddleware`. Never a bare `Events` or `Middleware` — generic
names collide across packages; the identifier must stand alone at
any import site. `types/mod.ts` remains the single barrel over all
of it — subfolders get no `mod.ts` of their own. Internal-only
types never move here at all — they stay in the file that uses them
(see below).

### Internal types stay where they're used

If a type is only used inside one file — a helper union, a private
return shape, a discriminator for an internal switch — declare it
in that file and don't put it under `types/`. The folder is for
the **exported** surface only; cluttering it with internals defeats
the purpose.

```ts
// inside RadRouter.ts — internal to this file, not exported.
type NodeKind = 'static' | 'param' | 'param_with_suffix' | …;
type Chunk = { kind: 'static'; value: string } | …;
```

Why: one type per file keeps diffs surgical, lets tree-shaking
drop unused types from downstream bundles, and gives docs tooling
a stable URL per type. Funnelling re-exports through the root
`mod.ts` keeps the consumer-facing import path obvious — a type
either lives at `@pkg` (whole surface) or `@pkg/types` (types-only
sub-path), never at some third re-export site inside the package.

## Custom errors live in an `errors/` folder

Every package that throws something more specific than a plain
`Error` puts the error classes in `packages/<pkg>/errors/`. The
structure mirrors `types/`:

```
packages/<pkg>/errors/
├── Base.ts                          ← <Pkg>Error — package base class
├── <Specific>Error.ts               ← one derived class per scenario
├── <Other>Error.ts
├── <Pkg>ErrorCodes.ts               ← optional code table (see below)
└── mod.ts                           ← re-exports all of the above
```

Sub-path export in both `deno.json` and `package.json`:

```jsonc
{
  "exports": {
    ".": "./mod.ts",
    "./types": "./types/mod.ts",
    "./errors": "./errors/mod.ts"
  }
}
```

The package's root `mod.ts` re-exports the error surface alongside
the type surface — same single-re-export-site rule as
[types](#exported-types-live-in-a-types-folder).

### Base class first

The first file in `errors/` is the **package base error**, named
`<Pkg>Error` and living in `errors/Base.ts`. It extends
`BaseError` from `@tundralibs/utils` so every package error shares
the project-wide error contract (typed `context`, `${var}`
substitution, cause chains, JSON serialisation):

```ts
// errors/Base.ts
import { BaseError } from '@tundralibs/utils';

export class RadRouterError<
  M extends Record<string, unknown> = Record<string, unknown>,
> extends BaseError<M> {
  // `name` is set automatically by BaseError via this.constructor.name.
}
```

### Derived classes per scenario

Each meaningful failure mode gets its own class extending the
package base. The class name describes the failure (`DuplicateRouteError`,
`MalformedPathError`, `EngineError`), not the throw site. Callers
branch with `instanceof`:

```ts
try {
  router.get('/users', [mw]);
  router.get('/users', [mw]); // duplicate
} catch (e) {
  if (e instanceof DuplicateRouteError) {
    // … recover, log, ignore in dev hot-reload, etc.
  }
}
```

### Codes are for complex packages, not small ones

For packages with a handful of distinct failure modes (radrouter
has three), **the class itself is the discriminator** — one class
per failure mode, no code field. The structured `error.context`
carries variant-specific data (path, segment, paramName, …);
callers branch on `instanceof`:

```ts
// radrouter — three failure modes, three classes, no codes.
export class MalformedPathError extends RadRouterError<…> {}
export class RouteConflictError extends RadRouterError<…> {}
export class DuplicateRouteError extends RadRouterError<…> {}
```

Reach for a codes table only when:

- A single class would have to cover **many** sub-scenarios (a
  dozen or more) and splitting it would create churn for callers.
- The package is integrating with an external system whose error
  codes you want to surface verbatim — e.g. database engines'
  `SQLSTATE`, HTTP status codes, OS errno values.
- You expect downstream code to maintain a stable mapping (i18n,
  monitoring dashboards) and class names alone aren't expressive
  enough.

`packages/drivers/errors/` is the canonical example of when codes
are worth it — `EngineError` plus `EngineErrorCodes` covers ~20
scenarios from "connection failed" to "duplicate key" to
"transaction aborted", all sharing enough structure that splitting
into 20 classes would burden callers without adding clarity.

When in doubt: start with distinct classes. Adding codes later is
mechanical; removing them once callers depend on them is a
breaking change.

### When custom errors aren't worth it

A package that throws at most one or two `Error`s in its entire
surface, all clearly user-facing programming mistakes (e.g. an
assertion failure during setup) can keep raw `throw new Error(...)`
without breaking the rules. The `errors/` folder appears the
moment you have a second distinct failure mode you'd want callers
to branch on.

### Error taxonomy in a request pipeline

A helper that **detects** a condition whose response status it uniquely knows
throws the framework error (`RapidError`, or a package's own `<Pkg>Error`) with
the mapping code — never a generic `Error` the boundary must re-derive a status
from (which defaults to 500 and discards what the helper knew). Example:
`parseBody` throws `RapidError('RAPID_PAYLOAD_TOO_LARGE')` (413), not
`new Error('too large')`.

A helper that **runs caller-supplied code** (a middleware composer, an invoker)
does the opposite: it does **not** wrap what flows through it. Those errors
propagate to the disclosure boundary (`RapidError.from`), which classifies them
— a guardian failure becomes a 400, anything else a 500. Wrapping them in a
composer-invented code would mask a real 400 behind a 500. Such a helper throws
the framework error only for a condition **it** detects (e.g. `next()` called
more than once).

Framework-internal helpers may couple to the framework's error type. A genuinely
reusable/pure helper instead throws a typed error and lets the caller wrap at the
boundary.

## Imports go through folder barrels

Every project folder in a package — including internal-only ones
like `utils/` or `transports/` — carries a `mod.ts` barrel, and
imports follow three rules:

- **Cross-folder imports go through the barrel.** A file in
  `context/` importing a parser writes
  `from '../utils/mod.ts'`, never `from '../utils/parseBody.ts'`.
  The folder's surface is its barrel; reaching around it couples
  callers to the folder's internal layout.
- **Same-folder siblings import directly** (`from './Context.ts'`).
  Routing a sibling import through the folder's own barrel creates a
  self-cycle for nothing.
- **One import statement per module.** Merge value and type imports:
  `import { WebServer, type WebSocketHandler } from '…'` — never two
  `import` lines with the same specifier.

Test files are the exception to the first rule: a test imports its
paired file directly (`parseBody.test.ts` → `./parseBody.ts`), same
as it sits next to it.

Cycle care: when a barrel re-exports a runtime module that imports
back across folders (the middleware runner importing the context
base, say), keep that back-edge `import type` — a type-only import
erases at compile time and cannot create a runtime cycle.

## Dependency manifests

Every package ships two manifests — `deno.json` for JSR/Deno and
`package.json` for Bun/Node — and both are consumer-facing (they
travel in the tarball). Four rules keep them honest:

- **One version, declared twice.** Every external dependency appears
  in **both** manifests at the **same** version range. `deno.json`
  uses the `jsr:`/`npm:` scheme; `package.json` mirrors a JSR package
  as `npm:@jsr/std__<x>@<ver>` and a plain npm package as
  `npm:<pkg>@<ver>`. Bump one side, bump the other — a floor that
  drifts between the two means Deno and Node silently resolve
  different versions.
- **`dependency` vs `devDependency` follows actual use.** JSR excludes
  `*.test.ts` and `*.bench.ts` from the published tarball (see the
  root `publish.exclude`), so anything imported **only** from a test
  or bench is a `devDependency`; anything a shipped module imports —
  including harness exports like `compat`'s `./test` or `rpc`'s
  `./conformance` — is a real `dependency`. Workspace siblings are
  `"@tundralibs/<pkg>": "workspace:*"`, dev or runtime by the same
  test.
- **Dev/bench-only deps live in the owning package, never the root.**
  The root `deno.json`/`package.json` carry only the toolchain every
  package's tests share (`@std/asserts`, `@std/testing`). A comparison
  library benchmarked against by a single package (e.g. `zod` in
  guardian, `pg`/`postgres` in drivers, `find-my-way`/`radix3` in
  radrouter) belongs in **that** package's `deno.json` `imports` +
  `package.json` `devDependencies`. With `nodeModulesDir: auto` Deno
  resolves the bare specifier straight from `package.json`, so one
  `import { z } from 'zod'` works on the Deno, Bun, and Node lanes
  alike — no root import-map entry required.
- **Target-specific deps are declared only where they resolve.** A
  Deno-only native dep (`jsr:@db/sqlite`) lives only in `deno.json`;
  a Node/Bun-only shim (`ws`) lives only in `package.json`. That split
  is deliberate, not drift — the absent side must degrade gracefully
  (see the runtime golden rule), never throw a raw missing-builtin
  error.

## Documentation examples use public specifiers

Code in `README.md` and `docs/*.md` is shipped: the published
tarball carries every markdown file into the consumer's
`node_modules`. Examples there are read by people and by coding
agents, so they follow different import rules from source.

- **Write the specifier a consumer would type.**
  `@tundralibs/slogger`, or the subpath the symbol actually lives
  behind (`@tundralibs/slogger/handlers`). Never a relative path —
  a reader of the shipped copy has no `../mod.ts`, even though it
  type-checks in-repo.
- **Every fenced block stands alone.** `deno check --doc-only`
  compiles each block as its own module; there is no shared scope
  between blocks. A block that uses `logger` constructs `logger`.
  Repeating an import across sibling blocks is intended, not
  duplication to factor out.
- **Blocks that aren't code get `ts ignore`.** Signatures, shell
  commands, JSON, directory trees, deliberate pseudo-code. Never
  use it to silence an example that was meant to work.

- **An example that imports a sibling package says so.** A recipe
  that reaches for another `@tundralibs/*` package (tracer wiring
  norm's event bus, norm's bring-your-own-engine path taking a
  driver) compiles in the workspace but not for a reader who
  installed only this one. Put the extra install next to the import
  as a comment — `// Needs a separate install: deno add
  @tundralibs/drivers` — so it travels with the block. The
  consumer-doc check (`.github/scripts/consumer-doc-check.ts`)
  enforces resolution; the comment is what tells the human.

JSDoc `@example` blocks are the exception: the documented module is
already in scope, so they need no import — and adding one that names
a symbol the specifier doesn't re-export introduces an error that
wasn't there before.

This is separate from [Imports go through folder barrels](#imports-go-through-folder-barrels), which governs source.
Source imports are relative and go through barrels; documentation
imports are public specifiers. Both are correct in their own
context.

Why: the import specifier is the one thing a reader cannot infer
from the example body. Packages here expose 2–15 subpath exports,
so a reader — or a model — working from an import-less example
guesses the barrel, and guesses wrong often enough to matter.

## Privacy prefixing

Visibility is encoded in **both** the TypeScript modifier and an
underscore prefix on the identifier. Two prefixes, one
correspondence:

| Modifier    | Identifier prefix | Example                             |
| ----------- | ----------------- | ----------------------------------- |
| `public`    | none              | `addRoute()`, `find()`              |
| `protected` | `_` (one)         | `_metaData`, `_composedTransform()` |
| `private`   | `__` (two)        | `__root`, `__normalizePath()`       |

This gives readers two independent signals about scope: the
modifier (compile-time enforcement) and the name (a flag at every
call site). Subclasses see `_protected` members from the parent
without surprise; readers see `__private` and know not to depend
on it.

```ts
export class RadRouter<M> {
  // Private state — implementation detail, two underscores.
  private __root: RouteNode<M> = new RouteNode('static', '');
  private __globalMiddlewares: M[] = [];

  // Protected — overridable hook, one underscore.
  protected _cloneWith(): this {/* … */}

  // Public — no prefix.
  public addRoute(method: HTTPMethod, path: string): void {/* … */}
}
```

Why: TypeScript's `private` keyword is compile-time-only — at
runtime, the field is on the instance and accessible from any
caller that reaches for it. The underscore prefix is the visible
warning sign that survives compilation, tooling, and ad-hoc
introspection.

## JSDoc: link custom types, declare throws

Two specific requirements on top of standard JSDoc:

### Use `{@link}` for any non-built-in type in prose

When a JSDoc comment references a type the reader can navigate to,
wrap it in `{@link}`. Built-in types (`string`, `Map<K,V>`,
`Promise<T>`) don't need a link; project- or package-defined types
do. The link generates a clickable cross-reference in most IDEs
and doc generators.

```ts
/**
 * Look up the chain for `method + path`. Returns a {@link RouteMatch}
 * with the matched middlewares and captured params, or `undefined`
 * on miss.
 */
public find(method: HTTPMethod, path: string): RouteMatch<M> | undefined;
```

### `@throws` on every method that throws

If a method can raise an exception (including via guards like
`validateParamName` or duplicate-detection), every throw path gets
a `@throws` line documenting what's thrown and why. Throws via
delegated calls (e.g. `this.__parsePath()` throwing on malformed
input) also belong on the public method's JSDoc — the caller sees
the public surface and shouldn't have to walk the implementation.

```ts
/**
 * Register `middlewares` for `method` at `path`.
 *
 * @throws {Error} When `path` contains a malformed segment.
 * @throws {Error} When the same `method + path + version` is
 *   registered twice.
 */
public addRoute(
  method: HTTPMethod,
  path: string,
  middlewares: M[],
  version?: string,
): void;
```

If the throw is conditional ("only when X happens"), say so. A bare
`@throws {Error}` with no condition tells the reader nothing they
couldn't have guessed.

## Module-level constants are `UPPER_SNAKE_CASE`

Any value declared at module scope as `const` and intended to be a
constant (not a destructured import, not a one-off helper) goes in
`UPPER_SNAKE_CASE`:

```ts
const PARAM_NAME_PATTERN = /^[A-Za-z_]\w*$/;
const PARAM_TOKEN_PATTERN = /:[A-Za-z_]\w*:/g;
const HAS_UPPERCASE = /[A-Z]/;
const DEFAULT_PORT = 8080;
```

Module-level constants that hold function values (`const noop = …`)
or computed module state (`const router = new RadRouter()`) stay in
`camelCase` — they're not constants in the "tabular lookup data"
sense, just immutable bindings.

The line: if it would make sense as a `static readonly` on a class
or as a compile-time literal, it's `UPPER_SNAKE_CASE`. If it's an
instance the rest of the module manipulates, it's `camelCase`.

---

## Applying these to existing code

These rules are normative going forward. Existing code is brought
into compliance **as a side effect of substantive work** — if
you're already editing a file for a bug fix, feature, or refactor,
bring it in line. Don't open standalone "convention sweep" PRs
unless the package is small enough to land cleanly in one diff.
