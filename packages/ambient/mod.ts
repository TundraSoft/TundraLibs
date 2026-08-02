/**
 * @fileoverview `@tundralibs/ambient` — request-scoped async context that
 * survives `await`.
 *
 * Built on `AsyncLocalStorage`, ambient carries a {@link RequestContext}
 * (correlation id, trace/span ids, custom fields) through an entire logical
 * request — at any call depth, across every `await`, isolated between
 * concurrent requests — without threading it through function signatures. It is
 * the shared substrate `slogger` (log correlation), `tracer` (spans) and `rpc`
 * read from.
 *
 * - {@link ambient} — the blessed request-context accessor.
 * - {@link createContext} — the generic typed primitive for building your own
 *   independent store.
 *
 * @author TundraSoft
 *
 * @module
 */

export { ambient } from './ambient.ts';
export { createContext } from './createContext.ts';
export type { Ambient, Context, RequestContext } from './types/mod.ts';
