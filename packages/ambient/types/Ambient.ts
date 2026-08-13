/**
 * @fileoverview The {@link Ambient} accessor surface — the shape of the shared
 * `ambient` request-context singleton.
 *
 * @author TundraSoft
 *
 * @module
 */

import type { RequestContext } from './RequestContext.ts';

/**
 * The request-scoped context accessor exposed as the `ambient` singleton. Every
 * read and write goes through one process-wide store, so any consumer inside an
 * {@link Ambient.run} scope observes the same {@link RequestContext}.
 */
export type Ambient = {
  /**
   * Start a fresh context seeded from `seed` and run `fn` within it. `seed` is
   * shallow-copied, so mutations via {@link Ambient.set} affect only this scope
   * and never leak back to the caller's object.
   *
   * @typeParam R - `fn`'s return type.
   * @param seed - Initial fields for the new {@link RequestContext}.
   * @param fn - The function to run within the context.
   * @returns Whatever `fn` returns.
   * @throws {TypeError} When the runtime provides no `AsyncLocalStorage`
   *   (`node:async_hooks`) — e.g. a browser. Establishing a scope is the one
   *   thing that cannot degrade, so it fails loudly rather than silently
   *   running `fn` outside any context.
   */
  run<R>(seed: RequestContext, fn: () => R): R;

  /**
   * Run `fn` in a child context: the current {@link RequestContext} merged with
   * `patch` (patch wins on key collision). Outside any active scope this behaves
   * like {@link Ambient.run} over `patch` alone. The parent scope is unaffected
   * once `fn` returns.
   *
   * @typeParam R - `fn`'s return type.
   * @param patch - Fields to overlay on the inherited context.
   * @param fn - The function to run within the child context.
   * @returns Whatever `fn` returns.
   * @throws {TypeError} When the runtime provides no `AsyncLocalStorage`
   *   (`node:async_hooks`) — same rationale as {@link Ambient.run}.
   */
  child<R>(patch: RequestContext, fn: () => R): R;

  /**
   * The active {@link RequestContext}, or `undefined` outside any
   * {@link Ambient.run} scope. Never throws — including on runtimes with no
   * `AsyncLocalStorage`, where no scope can ever be active.
   */
  get(): RequestContext | undefined;

  /**
   * Set `key` on the active {@link RequestContext}. A silent no-op (never
   * throws) when called outside any {@link Ambient.run} scope, or on a runtime
   * with no `AsyncLocalStorage`.
   *
   * @param key - Field name to set.
   * @param value - Value to store.
   */
  set(key: string, value: unknown): void;

  /**
   * `true` when an {@link Ambient.run} scope is active, `false` otherwise —
   * including on runtimes with no `AsyncLocalStorage`. Never throws.
   */
  active(): boolean;
};
