# Ambient — Roadmap

What's intentionally not built yet. `ambient` ships deliberately small — a typed
`AsyncLocalStorage` wrapper plus the shared `RequestContext` — so most items here
are integrations and extractions that earn their place only once a second
consumer exists.

## slogger auto-correlation (next)

Correlating logs works today, one line at the call site:
`log.info(msg, () => ({ ...ambient.get() }))`. The ergonomic finish is a
slogger-side enricher — a dynamic `scope(thunk)` variant, or a handler that folds
`ambient.get()` into every record — so no per-call thunk is needed. That change
lives in `slogger`, not here, and is tracked as its own PR.

## `compat/async` extraction (on second consumer)

The `AsyncLocalStorage` primitive currently lives in
[createContext.ts](createContext.ts), imported straight from `node:async_hooks`.
When a second package needs raw ALS (`tracer` is the likely trigger), lift the
primitive into a `@tundralibs/compat/async` subpath and have ambient source it
from there. Deferred until that consumer exists — building it now would add a
compat dependency to serve exactly one caller. `compat/async` would also be the
natural seam to adopt the TC39 `AsyncContext` proposal (a platform-native
replacement for `async_hooks`) once runtimes ship it.

## `id`-backed correlation helper (optional)

A convenience such as `ambient.withCorrelation(fn)` that mints a correlation id
via `@tundralibs/id` and opens a scope in one call. Deferred to keep ambient
dependency-free; callers mint their own id today
(`ambient.run({ correlationId: crypto.randomUUID() }, fn)`).

## ALS-less runtimes

The `node:async_hooks` import is static and unconditional. The hard requirement
is enforced by a load-time guard in `createContext` that throws an actionable
error, and declared via `engines.node >= 22` — never as a package dependency,
since it is a runtime built-in. Runtimes without `AsyncLocalStorage` are
unsupported by design; a no-op degraded mode is not planned. The guard's throw
path is not unit-tested — every supported test runtime provides ALS, so it
cannot be simulated cleanly.
