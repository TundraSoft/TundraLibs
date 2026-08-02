/**
 * @fileoverview `createContext` — the generic async-context primitive the
 * `ambient` request-context layer is built on. A thin, typed wrapper over
 * Node's `AsyncLocalStorage` (available on Deno, Bun and Node alike), it is the
 * "value that survives `await`" building block.
 *
 * @author TundraSoft
 *
 * @module
 *
 * @example
 * ```typescript
 * import { createContext } from '@tundralibs/ambient';
 *
 * const tenant = createContext<string>();
 *
 * await tenant.run('acme', async () => {
 *   await someAsyncWork();
 *   tenant.get(); // 'acme' — survives the await, no threading
 * });
 *
 * tenant.get(); // undefined — outside any run() scope
 * ```
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import type { Context } from './types/mod.ts';

/**
 * Assert that the runtime provides `AsyncLocalStorage` (`node:async_hooks`),
 * throwing an actionable error otherwise. It is a built-in on every supported
 * runtime (Deno, Bun, Node >= 22), so the throw path is unreachable in
 * practice — the requirement is a runtime built-in, declared via `engines.node`
 * and enforced here, never as a package dependency.
 *
 * Exported (but not re-exported from the package root, so not public API) only
 * so the otherwise-unreachable guard is unit-testable via the `candidate` seam.
 *
 * @internal
 * @param candidate - The constructor to validate; defaults to the runtime's.
 * @throws {TypeError} When `candidate` is not a constructor — i.e. the runtime
 *   provides no `AsyncLocalStorage`.
 */
export function assertAsyncLocalStorage(
  candidate: unknown = AsyncLocalStorage,
): void {
  if (typeof candidate !== 'function') {
    throw new TypeError(
      "@tundralibs/ambient requires 'AsyncLocalStorage' (node:async_hooks), " +
        'which this runtime does not provide. Supported runtimes: Deno, Bun, ' +
        'and Node.js >= 22.',
    );
  }
}

/**
 * Create an independent, typed {@link Context} store. Each call returns its own
 * `AsyncLocalStorage`, so distinct stores never observe each other's values.
 *
 * `get` / `getOr` / `active` never throw when called outside a
 * {@link Context.run} scope — `get` yields `undefined`, `getOr` yields the
 * supplied fallback, `active` yields `false`.
 *
 * @typeParam T - The shape of the value the store carries.
 * @returns A {@link Context} handle over a fresh store.
 * @throws {TypeError} When the runtime provides no `AsyncLocalStorage`
 *   (`node:async_hooks`) — an exotic environment outside the supported
 *   Deno / Bun / Node >= 22 targets.
 */
export function createContext<T>(): Context<T> {
  assertAsyncLocalStorage();
  const store = new AsyncLocalStorage<T>();
  return {
    run: <R>(value: T, fn: () => R): R => store.run(value, fn),
    get: (): T | undefined => store.getStore(),
    getOr: (fallback: T): T => {
      // Deliberately checking `undefined` (not nullish `??`): a store may hold
      // a legitimate `null` value, which must be returned, not the fallback.
      const current = store.getStore();
      if (current === undefined) return fallback;
      return current;
    },
    active: (): boolean => store.getStore() !== undefined,
  };
}
