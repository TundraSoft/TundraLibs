/**
 * @fileoverview `ambient` — the blessed, request-scoped context accessor. Built
 * on {@link createContext}, it owns the one {@link RequestContext} the suite
 * standardises on, so slogger (log correlation), tracer (spans) and rpc all
 * read and write the same place — no per-consumer stores, and no threading the
 * context through function signatures.
 *
 * @author TundraSoft
 *
 * @module
 *
 * @example
 * ```typescript
 * import { ambient } from '@tundralibs/ambient';
 *
 * // At the request boundary (e.g. rAPId / rpc middleware) — set it ONCE.
 * ambient.run({ correlationId: crypto.randomUUID() }, () => handle(request));
 *
 * // Anywhere below, at any depth, across any await — read it, no parameters.
 * function handle(_req: unknown) {
 *   ambient.get()?.correlationId; // the id set at the boundary
 *   ambient.set('userId', 'u_123'); // enrich the live bag
 * }
 *
 * ambient.get(); // undefined — outside the run() scope
 * ```
 */

import { createContext } from './createContext.ts';
import type { Ambient, RequestContext } from './types/mod.ts';

/** The single process-wide store backing the {@link RequestContext}. */
const store = createContext<RequestContext>();

/**
 * The request-scoped context accessor the suite shares — see {@link Ambient}
 * for the full surface.
 */
export const ambient: Ambient = {
  run<R>(seed: RequestContext, fn: () => R): R {
    return store.run({ ...seed }, fn);
  },

  child<R>(patch: RequestContext, fn: () => R): R {
    // `store.get()` may be `undefined` (called outside a scope); spreading
    // `undefined` contributes nothing, so no explicit fallback is needed.
    return store.run({ ...store.get(), ...patch }, fn);
  },

  get(): RequestContext | undefined {
    return store.get();
  },

  set(key: string, value: unknown): void {
    const current = store.get();
    if (current !== undefined) current[key] = value;
  },

  active(): boolean {
    return store.active();
  },
};
