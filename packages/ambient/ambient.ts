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
import type { Ambient, Context, RequestContext } from './types/mod.ts';

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
 * Build the {@link Ambient} surface over `resolveStore` — the supplier of the
 * backing store, which throws where the runtime cannot provide one.
 *
 * Exported (but not re-exported from the package root, so not public API) only
 * so the ALS-less degradation path — unreachable on any supported runtime — is
 * unit-testable via the `resolveStore` seam, mirroring the `candidate` seam on
 * `assertAsyncLocalStorage`.
 *
 * @internal
 * @param resolveStore - Supplies the shared {@link Context}; throws where none
 *   can exist.
 * @returns An {@link Ambient} bound to `resolveStore`.
 */
export function buildAmbient(
  resolveStore: () => Context<RequestContext>,
): Ambient {
  /**
   * The store, or `undefined` where none can exist. The read-only members go
   * through this so they keep their documented never-throws contract
   * everywhere: no store means no active context, which is exactly the "called
   * outside any scope" case they already handle. `resolveStore` throws only for
   * that one reason, so there is no other failure being swallowed here.
   */
  const readStore = (): Context<RequestContext> | undefined => {
    try {
      return resolveStore();
    } catch {
      return undefined;
    }
  };

  return {
    run<R>(seed: RequestContext, fn: () => R): R {
      return resolveStore().run({ ...seed }, fn);
    },

    child<R>(patch: RequestContext, fn: () => R): R {
      const active = resolveStore();
      // `active.get()` may be `undefined` (called outside a scope); spreading
      // `undefined` contributes nothing, so no explicit fallback is needed.
      return active.run({ ...active.get(), ...patch }, fn);
    },

    get(): RequestContext | undefined {
      return readStore()?.get();
    },

    set(key: string, value: unknown): void {
      const current = readStore()?.get();
      if (current !== undefined) current[key] = value;
    },

    active(): boolean {
      return readStore()?.active() ?? false;
    },
  };
}

/**
 * The request-scoped context accessor the suite shares — see {@link Ambient}
 * for the full surface.
 */
export const ambient: Ambient = buildAmbient(requireStore);
