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
 * Whether this runtime provides a usable `AsyncLocalStorage` constructor.
 * `node:async_hooks` is a built-in on every supported runtime (Deno, Bun,
 * Node >= 22), so this is `true` in practice — the guard exists only to fail
 * loudly, with an actionable message, on an exotic runtime that strips it. The
 * dependency is a runtime built-in, not an npm package: it is declared via
 * `engines.node` in package.json and enforced here, never in `dependencies`.
 */
const HAS_ASYNC_LOCAL_STORAGE = typeof AsyncLocalStorage === 'function';

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
 * @throws {Error} When the runtime provides no `AsyncLocalStorage`
 *   (`node:async_hooks`) — an exotic environment outside the supported
 *   Deno / Bun / Node >= 22 targets.
 */
export function createContext<T>(): Context<T> {
  if (!HAS_ASYNC_LOCAL_STORAGE) {
    throw new Error(
      "@tundralibs/ambient requires 'AsyncLocalStorage' (node:async_hooks), " +
        'which this runtime does not provide. Supported runtimes: Deno, Bun, ' +
        'and Node.js >= 22.',
    );
  }
  const store = new AsyncLocalStorage<T>();
  return {
    run: <R>(value: T, fn: () => R): R => store.run(value, fn),
    get: (): T | undefined => store.getStore(),
    getOr: (fallback: T): T => {
      const current = store.getStore();
      return current === undefined ? fallback : current;
    },
    active: (): boolean => store.getStore() !== undefined,
  };
}
