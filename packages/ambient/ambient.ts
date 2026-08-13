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

import { assertAsyncLocalStorage, createContext } from './createContext.ts';
import type { Ambient, Context, RequestContext } from './types/mod.ts';

/**
 * Whether this runtime can back a context store at all, probed once at load.
 * The probe deliberately swallows the throw: importing this package must never
 * fail, so that a browser bundle can pull it in and simply find no active
 * context — see {@link storeOrUndefined}.
 */
const HAS_ASYNC_LOCAL_STORAGE: boolean = ((): boolean => {
  try {
    assertAsyncLocalStorage();
    return true;
  } catch {
    return false;
  }
})();

/** The single process-wide store, once built. See {@link requireStore}. */
let store: Context<RequestContext> | undefined;

/**
 * The store backing the {@link RequestContext}, built on first use and memoized
 * thereafter. Construction is deferred rather than done at module scope purely
 * so that *importing* the package is side-effect-free on runtimes without
 * `AsyncLocalStorage`; on every supported runtime the store is still a single
 * process-wide instance shared by all callers.
 *
 * @returns The one shared {@link Context}.
 * @throws {TypeError} When the runtime provides no `AsyncLocalStorage`
 *   (`node:async_hooks`) — raised by {@link createContext}.
 */
function requireStore(): Context<RequestContext> {
  return (store ??= createContext<RequestContext>());
}

/**
 * The shared store, or `undefined` where the runtime provides no
 * `AsyncLocalStorage`. The read-only members use this so they keep their
 * documented never-throws contract everywhere: with no store there is no active
 * context, which is exactly the "called outside any scope" case they already
 * handle.
 *
 * @returns The shared {@link Context}, or `undefined` on ALS-less runtimes.
 */
function storeOrUndefined(): Context<RequestContext> | undefined {
  if (!HAS_ASYNC_LOCAL_STORAGE) return undefined;
  return requireStore();
}

/**
 * The request-scoped context accessor the suite shares — see {@link Ambient}
 * for the full surface.
 */
export const ambient: Ambient = {
  run<R>(seed: RequestContext, fn: () => R): R {
    return requireStore().run({ ...seed }, fn);
  },

  child<R>(patch: RequestContext, fn: () => R): R {
    const active = requireStore();
    // `active.get()` may be `undefined` (called outside a scope); spreading
    // `undefined` contributes nothing, so no explicit fallback is needed.
    return active.run({ ...active.get(), ...patch }, fn);
  },

  get(): RequestContext | undefined {
    return storeOrUndefined()?.get();
  },

  set(key: string, value: unknown): void {
    const current = storeOrUndefined()?.get();
    if (current !== undefined) current[key] = value;
  },

  active(): boolean {
    return storeOrUndefined()?.active() ?? false;
  },
};
