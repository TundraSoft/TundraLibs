# Ambient — Roadmap

What's intentionally not built. `ambient` ships deliberately small — a typed
`AsyncLocalStorage` wrapper plus the shared `RequestContext` — and its two
planned integrations have both since shipped, so this file is now mostly
records and triggers.

## Shipped integrations

- **slogger auto-correlation** — landed as slogger 1.1.0's `contextProvider`
  (a generic logger-level thunk, wired at the composition root:
  `contextProvider: () => ambient.get() ?? {}`). slogger takes no ambient
  dependency; see
  [Ambient-Integration](docs/Ambient-Integration.md#slogger-automatic-log-correlation).
- **tracer** — depends on ambient for `createContext`, keeping its active span
  in its **own** store rather than the shared request bag; see
  [Ambient-Integration](docs/Ambient-Integration.md#tracer-who-owns-what).

## `compat/async` extraction — decided against

The original plan deferred extracting the `AsyncLocalStorage` primitive into
`@tundralibs/compat/async` "until a second raw-ALS consumer exists". `tracer`
became that second consumer — and the extraction was **still declined**, because
the facts cut against it:

- direct `node:` imports are already the house norm for **uniform** builtins
  (`drivers` and `restler` both do it); compat earns its keep only where
  runtimes _differ_, and ALS does not.
- depending on compat would hand this zero-dependency leaf a 47-file package
  that pulls `ws` — backwards layering for no gain.
- [createContext.ts](createContext.ts) is already the one-file seam a future
  TC39 `AsyncContext` migration would touch; moving it buys a different
  one-file seam.

Revisit only if a supported runtime needs an ALS **shim** (a genuine compat
concern), or a package that cannot depend on ambient needs raw ALS.

## `id`-backed correlation helper (optional)

A convenience such as `ambient.withCorrelation(fn)` that mints an id via
`@tundralibs/id` and opens a scope in one call. Still deferred, still optional:
ambient stays **carry-only** so the id-scheme choice (UUID, ULID, CUID2)
belongs to the application, and `crypto.randomUUID()` covers the default case
with zero dependencies.

## ALS-less runtimes

`node:async_hooks` is never statically imported: the type comes in via
`import type` (erased at compile time), and the `AsyncLocalStorage` constructor
is resolved at runtime through `process.getBuiltinModule('node:async_hooks')` —
an optional-chained property read. Merely _importing_ the package is therefore
side-effect-free everywhere, browser bundles included, where the builtin is
absent. Every supported runtime — Deno, Bun, Node >= 22 and Cloudflare Workers
under `nodejs_compat` — exposes it, so there the constructor resolves eagerly,
exactly as a static import would.

The requirement is enforced at **call time**, not load time: the first
`createContext()` (hence the first `ambient.run()` / `ambient.child()`) runs a
guard that throws an actionable `TypeError` when nothing resolved. It is
declared via `engines.node >= 22` — never as a package dependency, since it is a
runtime built-in. A plain browser tab has no `AsyncLocalStorage` and is
unsupported by design; a no-op degraded mode is not planned. The guard's throw
path is tested via its injectable `candidate` parameter.
