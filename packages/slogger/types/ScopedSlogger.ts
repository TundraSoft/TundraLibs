import type { Slogger } from '../Slogger.ts';

/**
 * The surface {@link Slogger.scope} actually hands back: every logging
 * member of {@link Slogger} — the read-through fields (`appName`,
 * `hostname`, `level`), `log()`, the severity shorthands and their
 * aliases, and a nested `scope()` — minus the two **resource-owning**
 * methods a scope does not have.
 *
 * `scope()` returns a closure-based view over the root logger, not a new
 * `Slogger`: it owns no handlers, so `finalize()` and
 * `registerHandler()` are deliberately absent from the object at
 * runtime. Finalize (or register handlers on) the **root** logger the
 * scope was created from — that is the instance that owns the handlers,
 * and finalizing it flushes every scope taken from it.
 *
 * Nesting composes: `scope()` on a `ScopedSlogger` yields another
 * `ScopedSlogger`, so the missing methods can never reappear further
 * down a chain.
 *
 * A full {@link Slogger} remains assignable to this type — it is a
 * superset — so a function that only logs can take a `ScopedSlogger`
 * and accept both a root logger and a scoped view.
 *
 * Defined as `Omit<Slogger, …>` rather than a hand-written shape so the
 * two stay in lockstep: a method added to `Slogger` shows up here
 * automatically, and the omission list stays the single statement of
 * what a scope lacks.
 */
export type ScopedSlogger = Omit<Slogger, 'finalize' | 'registerHandler'>;
