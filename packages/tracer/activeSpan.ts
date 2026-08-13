/**
 * @fileoverview The active-span store — a dedicated `ambient` context holding
 * the span currently in scope.
 *
 * This is why `startSpan` needs no explicit parent: the active span travels
 * with the async flow (across every `await`, isolated between concurrent
 * requests), so a span created five frames deep automatically parents to the
 * one opened at the request boundary.
 *
 * It is deliberately a **separate** store from `ambient`'s `RequestContext`:
 * span lifecycle is tracer's concern, not part of the shared request bag.
 *
 * @author TundraSoft
 *
 * @module
 */

import { type Context, createContext } from '@tundralibs/ambient';
import type { Span } from './Span.ts';

/** The single process-wide store, once built. See {@link requireStore}. */
let store: Context<Span> | undefined;

/**
 * The store backing the active {@link Span}, built on first use and memoized
 * thereafter. Construction is deferred rather than done at module scope purely
 * so that *importing* `@tundralibs/tracer` is side-effect-free on runtimes
 * without `AsyncLocalStorage` (a browser bundle); on every supported runtime
 * the store is still a single process-wide instance shared by all callers, so
 * spans nest across module boundaries exactly as before.
 *
 * @returns The one shared {@link Context}.
 * @throws {TypeError} When the runtime provides no `AsyncLocalStorage`
 *   (`node:async_hooks`) — raised by `createContext`.
 */
function requireStore(): Context<Span> {
  return (store ??= createContext<Span>());
}

/**
 * Build the active-span {@link Context} surface over `resolveStore` — the
 * supplier of the backing store, which throws where the runtime cannot provide
 * one.
 *
 * Exported (but not re-exported from the package root, so not public API) only
 * so the ALS-less degradation path — unreachable on any supported runtime — is
 * unit-testable via the `resolveStore` seam, mirroring `buildAmbient` in
 * `@tundralibs/ambient`.
 *
 * @internal
 * @param resolveStore - Supplies the shared {@link Context}; throws where none
 *   can exist.
 * @returns A {@link Context} bound to `resolveStore`.
 */
export function buildActiveSpan(
  resolveStore: () => Context<Span>,
): Context<Span> {
  /**
   * The store, or `undefined` where none can exist. The read-only members go
   * through this so they keep their documented never-throws contract
   * everywhere: no store means no active span, which is exactly the "called
   * outside any span scope" case they already handle. `resolveStore` throws
   * only for that one reason, so there is no other failure being swallowed
   * here.
   */
  const readStore = (): Context<Span> | undefined => {
    try {
      return resolveStore();
    } catch {
      return undefined;
    }
  };

  return {
    run<R>(span: Span, fn: () => R): R {
      return resolveStore().run(span, fn);
    },

    get(): Span | undefined {
      return readStore()?.get();
    },

    getOr(fallback: Span): Span {
      // Delegated rather than `?? fallback`-ed so the store keeps ownership of
      // the `undefined`-vs-nullish distinction it documents.
      const active = readStore();
      if (active === undefined) return fallback;
      return active.getOr(fallback);
    },

    active(): boolean {
      return readStore()?.active() ?? false;
    },
  };
}

/**
 * The currently active {@link Span}, or `undefined` outside any span scope.
 * Prefer `tracer.active()` — this is the underlying store.
 *
 * The backing `AsyncLocalStorage` is built on first use, not at import, so the
 * package imports cleanly on runtimes that have none (browsers). There, the
 * read-only members degrade quietly — `get()` yields `undefined`, `getOr()` the
 * fallback, `active()` `false`, all indistinguishable from being called outside
 * a span — while `run()` throws, because establishing a scope is the one thing
 * that cannot be faked.
 *
 * @throws {TypeError} From `run()` only, when the runtime provides no
 *   `AsyncLocalStorage` (`node:async_hooks`) — e.g. a browser.
 */
export const activeSpan: Context<Span> = buildActiveSpan(requireStore);
